/**
 * Tái tạo bảng `user_metadata` sau sự cố mất dữ liệu 31/08/2026.
 *
 * TẠI SAO GẤP: `AuthService.login` ném 401 'User profile data missing' khi tài
 * khoản không có dòng trong bảng này (auth.service.ts:148). Chỉ luồng `register`
 * mới tạo dòng. Nên khi bảng rỗng, TOÀN BỘ tài khoản không đăng nhập được, và
 * `listUsers` (chỉ đọc bảng này) không thấy ai để admin gắn quyền.
 *
 * Cách chạy:
 *   pnpm exec ts-node scripts/restore-user-metadata.ts           # chạy thử
 *   pnpm exec ts-node scripts/restore-user-metadata.ts --apply   # ghi thật
 *
 * ĐỘ TIN CẬY CỦA TỪNG DÒNG — xem cột `source` bên dưới. Chỉ 3/8 dòng là dữ liệu
 * THẬT đọc được từ DB trước khi mất; 5 dòng còn lại là do người dùng quyết định
 * lúc khôi phục, KHÔNG phải khôi phục nguyên trạng. `claim_request` và
 * `linked_at` của các dòng đó mất vĩnh viễn.
 */
import { PrismaClient } from '@prisma/client';

type Source = 'thật' | 'quyết định lúc khôi phục';

const ROWS: Array<{
  user_id: string; email: string; roles: string[];
  profile_member_id: string | null; source: Source;
}> = [
  // ── DỮ LIỆU THẬT: đọc trực tiếp từ user_metadata trước khi bảng bị xoá ────
  { user_id: 'fca9c563-9fef-44fb-97d2-bbc44afff2e3', email: 'admin@admin.com',
    roles: ['admin'], profile_member_id: null, source: 'thật' },
  // Link cũ trỏ tới member a63fb0b3-… tên "Đỗ Xuân Khôi" (đời 1, 1945–2000) —
  // một bản ghi tạo tay qua app, KHÔNG có trong bộ import_json. CỐ Ý không dựng
  // lại: gia phả đã có một Đỗ Xuân Khôi thật ở đời 14 (1917–2001), thêm bản ghi
  // thứ hai cùng tên sẽ là một node rời không nối vào cây và gây nhầm lẫn.
  // Hệ quả: avatar cũ trên Vercel Blob của member này thành mồ côi.
  { user_id: 'aa1fb69a-eb2e-497b-8781-f18694a1761a', email: 'duyhung012401@gmail.com',
    roles: ['member'], profile_member_id: null, source: 'thật' },
  // Link cũ trỏ tới member c9b67e79-…, người này KHÔNG dựng lại được (chỉ biết
  // có avatar, không biết tên). Để null ⇒ tài khoản vẫn đăng nhập được và hiện
  // ở danh sách "chờ duyệt" để admin gắn đúng người trong 479 thành viên.
  { user_id: 'de01a4ae-d843-4066-abe6-fb659237b616', email: 'duyhung01241@gmail.com',
    roles: ['member'], profile_member_id: null, source: 'thật' },

  // ── KHÔNG BIẾT vai trò cũ. Câu truy vấn còn giữ được có `limit 3` và chỉ lọc
  //    member/admin, nên vai trò thật của 5 tài khoản dưới đây là không suy ra
  //    được. Giá trị dưới đây do người dùng chọn lúc khôi phục. ───────────────
  { user_id: '6a133253-6339-4a62-9daa-70efaf517837', email: 'duyhung01247@gmail.com',
    roles: ['member'], profile_member_id: null, source: 'quyết định lúc khôi phục' },
  { user_id: '6d9fbbce-0240-4632-8044-f5ac2feefb44', email: 'admin1@admin.com',
    roles: ['member'], profile_member_id: null, source: 'quyết định lúc khôi phục' },
  { user_id: 'aea78095-9438-4fb6-b9c5-528d6ab6cbc9', email: 'duyhung01240@gmail.com',
    roles: ['member'], profile_member_id: null, source: 'quyết định lúc khôi phục' },
  // Hai tài khoản test → guest (fail closed).
  { user_id: 'c6baafbb-7705-40e9-979d-c101a46d695e', email: 'user@example.com',
    roles: ['guest'], profile_member_id: null, source: 'quyết định lúc khôi phục' },
  { user_id: '7935a208-237d-4b7e-b18f-8559ccd12f27', email: 'r2-test-1786098971@example.com',
    roles: ['guest'], profile_member_id: null, source: 'quyết định lúc khôi phục' },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  try {
    // `created_at` lấy theo auth.users để thứ tự danh sách "chờ duyệt" của admin
    // (orderBy created_at desc) phản ánh đúng thứ tự đăng ký thật.
    const authRows = await prisma.$queryRaw<Array<{ id: string; created_at: Date }>>`
      SELECT id::text, created_at FROM auth.users
    `;
    const createdAt = new Map(authRows.map((r) => [r.id, r.created_at]));

    const missing = ROWS.filter((r) => !createdAt.has(r.user_id));
    if (missing.length) {
      console.error('✗ Không có trong auth.users:', missing.map((m) => m.email));
      process.exit(1);
    }
    const notCovered = authRows.filter((a) => !ROWS.some((r) => r.user_id === a.id));

    console.log(`Tài khoản trong auth.users : ${authRows.length}`);
    console.log(`Dòng sẽ tạo                : ${ROWS.length}`);
    console.log(`Tài khoản chưa phủ         : ${notCovered.length}`);
    console.log('');
    for (const r of ROWS) {
      const link = r.profile_member_id ? '→ đã gắn thành viên' : '  chờ gắn';
      console.log(
        `  ${r.roles[0].padEnd(6)} ${link}  ${r.email.padEnd(32)} [${r.source}]`,
      );
    }

    const existing = await prisma.userMetadata.count();
    if (existing > 0) {
      console.error(`\n✗ user_metadata đang có ${existing} dòng. Dừng để không ghi đè.`);
      process.exit(1);
    }

    if (!apply) {
      console.log('\n(chạy thử — chưa ghi gì. Thêm --apply để ghi thật)');
      return;
    }

    await prisma.userMetadata.createMany({
      data: ROWS.map((r) => ({
        user_id: r.user_id,
        roles: r.roles,
        profile_member_id: r.profile_member_id,
        created_at: createdAt.get(r.user_id)!,
        linked_at: r.profile_member_id ? new Date() : null,
      })),
    });

    console.log(`\n✓ Đã tạo ${ROWS.length} dòng user_metadata`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
