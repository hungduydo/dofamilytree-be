/**
 * Rà soát toàn bộ tài khoản trước/sau khi đổi hệ phân quyền.
 *
 * BỐI CẢNH: luồng register CŨ tự tạo một Member rồi gắn tài khoản vào đó và cấp
 * luôn role 'member' — tức là mọi tài khoản hiện có đều tự nhận mình là người
 * trong dòng họ mà KHÔNG ai duyệt. Ta cố ý KHÔNG hạ cấp hàng loạt (rủi ro cao,
 * và dữ liệu phần lớn là đúng); thay vào đó script này in ra bảng để tự rà và
 * hạ cấp thủ công qua PUT /v2/auth/users/:userId/roles.
 *
 * Mặc định CHỈ ĐỌC. `--normalize` mới ghi, và chỉ làm hai việc an toàn:
 *   - 'viewer' (role đã bỏ) → 'guest'
 *   - mảng nhiều role → [role cao nhất]
 *
 * Usage:
 *   pnpm audit:roles
 *   pnpm audit:roles -- --normalize
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { highestRole, roleRank } from '../src/auth/roles.constants';

const prisma = new PrismaClient();

async function emailMap(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return map;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const wanted = new Set(userIds);

  for (let page = 1; page <= 50 && wanted.size; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data.users.length) break;
    for (const user of data.users) {
      if (wanted.delete(user.id) && user.email) map.set(user.id, user.email);
    }
  }
  return map;
}

async function main() {
  const normalize = process.argv.includes('--normalize');

  const rows = await prisma.userMetadata.findMany({
    orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    include: { profile_member: { select: { id: true, name: true } } },
  });
  const emails = await emailMap(rows.map((r) => r.user_id));

  console.log(`Tổng ${rows.length} tài khoản\n`);
  console.log('ROLE     | MEMBER ĐÃ LINK              | EMAIL');
  console.log('---------|-----------------------------|------------------------------');

  const warnings: string[] = [];

  for (const row of rows) {
    const role = highestRole(row.roles);
    const member = row.profile_member ? `${row.profile_member.name}` : '(chưa link)';
    console.log(
      `${role.padEnd(8)} | ${member.slice(0, 27).padEnd(27)} | ${emails.get(row.user_id) ?? row.user_id}`,
    );

    const unknown = row.roles.filter((r) => roleRank(r) < 0);
    if (unknown.length) warnings.push(`  ${row.user_id}: role không hợp lệ ${JSON.stringify(unknown)} → sẽ về '${role}'`);
    if (row.roles.length > 1) warnings.push(`  ${row.user_id}: nhiều role ${JSON.stringify(row.roles)} → chuẩn hoá về '${role}'`);
    if (role === 'member' && !row.profile_member_id) {
      warnings.push(`  ${row.user_id}: role 'member' nhưng CHƯA link member nào — nên hạ về guest hoặc link`);
    }
    if (row.profile_member_id && !row.linked_at) {
      warnings.push(`  ${row.user_id}: link do luồng register CŨ (không ai duyệt) — kiểm tra xem có đúng người không`);
    }
  }

  if (warnings.length) {
    console.log(`\nCẢNH BÁO (${warnings.length}):`);
    warnings.forEach((w) => console.log(w));
  } else {
    console.log('\nKhông có cảnh báo.');
  }

  if (!normalize) {
    console.log('\nCHỈ ĐỌC — truyền --normalize để chuẩn hoá roles (không đụng profile_member_id).');
    return;
  }

  let changed = 0;
  for (const row of rows) {
    const role = highestRole(row.roles);
    if (row.roles.length === 1 && row.roles[0] === role) continue;
    await prisma.userMetadata.update({ where: { user_id: row.user_id }, data: { roles: [role] } });
    changed++;
  }
  console.log(`\nĐÃ CHUẨN HOÁ ${changed} tài khoản.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
