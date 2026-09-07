/**
 * Xuất danh sách tài khoản Supabase Auth ra JSON.
 *
 * TẠI SAO CẦN, khi db-backup.sh đã dump schema `auth`: role `postgres` của
 * Supabase có thể bị chặn đọc schema auth bất cứ lúc nào (Supabase đổi quyền
 * mà không báo). Đây là lớp dự phòng đi qua API service-role, độc lập hoàn toàn
 * với pg_dump.
 *
 * GIỚI HẠN: API admin KHÔNG trả `encrypted_password`. Khôi phục từ file này
 * buộc mọi người phải reset mật khẩu. Bản giữ được mật khẩu là auth.sql.
 *
 * Ngoài ra script đối soát auth.users ↔ bảng user_metadata: thiếu một dòng
 * user_metadata là tài khoản đó KHÔNG đăng nhập được (AuthService.login ném 401
 * 'User profile data missing'). Đúng lỗi đã xảy ra sau sự cố 31/08/2026.
 *
 * Cách chạy:
 *   pnpm backup:auth-export                 # ghi vào backup/<timestamp>/
 *   BACKUP_DIR=/tmp/x pnpm backup:auth-export
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

type ExportedUser = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string | undefined;
  last_sign_in_at: string | null | undefined;
  email_confirmed_at: string | null | undefined;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
};

async function listAllAuthUsers(): Promise<ExportedUser[]> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  );

  const users: ExportedUser[] = [];
  // listUsers phân trang; lặp đến khi trang trả về ít hơn PAGE_SIZE.
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`listUsers trang ${page} lỗi: ${error.message}`);

    users.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        user_metadata: u.user_metadata ?? {},
        app_metadata: u.app_metadata ?? {},
      })),
    );

    if (data.users.length < PAGE_SIZE) return users;
  }
}

/**
 * Ghi cùng thư mục với db-backup.sh nếu nó vừa chạy (file `.last`), để một lần
 * backup ra đúng một thư mục thay vì hai.
 */
function resolveOutDir(): string {
  const root = process.env.BACKUP_DIR ?? join(__dirname, '..', '..', 'backup');
  if (process.env.BACKUP_TIMESTAMP) return join(root, process.env.BACKUP_TIMESTAMP);

  const last = join(root, '.last');
  if (existsSync(last)) {
    const dir = readFileSync(last, 'utf8').trim();
    if (dir && existsSync(dir)) return dir;
  }
  return join(root, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z');
}

async function main() {
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('✖ Thiếu SUPABASE_URL / SUPABASE_SECRET_KEY.');
    process.exit(1);
  }

  const outDir = resolveOutDir();
  mkdirSync(outDir, { recursive: true });

  const users = await listAllAuthUsers();

  const prisma = new PrismaClient();
  let orphans: string[] = [];
  try {
    const metadata = await prisma.userMetadata.findMany();
    const known = new Set(metadata.map((m) => m.user_id));
    orphans = users.filter((u) => !known.has(u.id)).map((u) => `${u.id} (${u.email ?? 'no-email'})`);

    writeFileSync(
      join(outDir, 'auth-users.json'),
      JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          note: 'KHÔNG chứa password hash. Khôi phục từ file này ⇒ mọi user phải reset mật khẩu. Bản giữ mật khẩu là auth.sql.',
          auth_users: users,
          user_metadata: metadata,
          users_without_metadata: orphans,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }

  console.log(`✔ ${users.length} tài khoản auth, ${users.length - orphans.length} có user_metadata → ${outDir}/auth-users.json`);
  if (orphans.length > 0) {
    // Không fail job — backup vẫn hợp lệ. Nhưng phải nhìn thấy được trong log CI.
    console.warn(`⚠ ${orphans.length} tài khoản KHÔNG có dòng user_metadata ⇒ hiện không đăng nhập được:`);
    orphans.forEach((o) => console.warn(`   - ${o}`));
    console.warn('   Xử lý: scripts/restore-user-metadata.ts');
  }
}

main().catch((error) => {
  console.error(`✖ ${(error as Error).message}`);
  process.exit(1);
});
