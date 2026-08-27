/**
 * Tạo admin ĐẦU TIÊN.
 *
 * Hệ phân quyền mới chặn mọi route ghi bằng @Roles, và quyền đổi role của người
 * khác chỉ admin mới có. Nhưng trong DB hiện KHÔNG có tài khoản admin nào — nên
 * nếu deploy phần gắn @Roles trước khi chạy script này, cả hệ thống thành
 * read-only và không có đường cứu trong app, chỉ còn cách sửa thẳng DB.
 *
 * CHẠY TRƯỚC khi deploy bước gắn @Roles.
 *
 * Usage:
 *   pnpm bootstrap:admin -- --email=ai-do@example.com --dry-run
 *   pnpm bootstrap:admin -- --email=ai-do@example.com
 *   pnpm bootstrap:admin -- --user-id=<uuid> --member-id=<uuid>
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

/** Supabase admin API không có "tìm theo email", nên phải phân trang mà quét. */
async function findUserIdByEmail(email: string): Promise<string> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const target = email.trim().toLowerCase();

  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Supabase listUsers lỗi: ${error.message}`);
    if (!data.users.length) break;

    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found.id;
  }
  throw new Error(`Không tìm thấy tài khoản Supabase với email ${email}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const email = arg('email');
  const memberId = arg('member-id');
  let userId = arg('user-id');

  if (!userId && !email) {
    throw new Error('Phải truyền --email=<email> hoặc --user-id=<uuid>');
  }
  if (!userId) userId = await findUserIdByEmail(email!);

  const existing = await prisma.userMetadata.findUnique({ where: { user_id: userId } });
  console.log(`User ${userId}${email ? ` (${email})` : ''}`);
  console.log(`  Hiện tại: ${existing ? `roles=${JSON.stringify(existing.roles)}, member=${existing.profile_member_id ?? 'chưa link'}` : 'CHƯA có user_metadata'}`);

  if (memberId) {
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw new Error(`Member ${memberId} không tồn tại`);

    const taken = await prisma.userMetadata.findUnique({ where: { profile_member_id: memberId } });
    if (taken && taken.user_id !== userId) {
      throw new Error(`Member ${memberId} đã thuộc tài khoản ${taken.user_id}`);
    }
    console.log(`  Sẽ link tới member: ${member.name} (${memberId})`);
  }

  if (dryRun) {
    console.log('DRY RUN — không ghi gì.');
    return;
  }

  // upsert: tài khoản Supabase có thể chưa từng có user_metadata (đăng ký từ
  // Studio chẳng hạn). Giữ nguyên profile_member_id nếu đã link và không truyền
  // --member-id — bootstrap admin không được âm thầm gỡ link của ai.
  const result = await prisma.userMetadata.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      roles: ['admin'],
      ...(memberId ? { profile_member_id: memberId, linked_at: new Date() } : {}),
    },
    update: {
      roles: ['admin'],
      ...(memberId ? { profile_member_id: memberId, linked_at: new Date() } : {}),
    },
  });

  console.log(`  ĐÃ GHI: roles=${JSON.stringify(result.roles)}, member=${result.profile_member_id ?? 'chưa link'}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
