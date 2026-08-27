import { PrismaService } from '../prisma/prisma.service';

export interface CallerMeta {
  roles: string[];
  profileMemberId: string | null;
}

/** Guest chưa đăng nhập / không có UserMetadata — fail closed, không quyền gì. */
export const ANONYMOUS_META: CallerMeta = { roles: [], profileMemberId: null };

/** Chỗ memo trên request. Đặt tên có tiền tố `__` để không đụng field của Nest. */
const META_KEY = '__callerMeta';

/**
 * Đọc role + member đã link của người gọi, TỪ DB chứ không từ JWT.
 *
 * Vì sao không đọc JWT: token phát hành trước khi admin đổi role / gỡ link vẫn
 * mang giá trị cũ suốt TTL 1 ngày (auth.service.ts ký `expiresIn: '1d'`). Một
 * member vừa bị hạ cấp phải mất quyền NGAY, không phải sau 24h.
 *
 * Vì sao memo hoá lên request: RolesGuard, PiiAccessGuard và tầng kiểm tra
 * "chính chủ" trong MembersService đều cần đúng một row này. Không memo thì mỗi
 * request tốn 3 lần findUnique giống hệt nhau.
 */
export async function resolveCallerMeta(req: any, prisma: PrismaService): Promise<CallerMeta> {
  if (req[META_KEY]) return req[META_KEY];

  const userId = req.user?.id;
  if (!userId) return (req[META_KEY] = ANONYMOUS_META);

  const row = await prisma.userMetadata.findUnique({
    where: { user_id: userId },
    select: { roles: true, profile_member_id: true },
  });

  return (req[META_KEY] = {
    roles: row?.roles ?? [],
    profileMemberId: row?.profile_member_id ?? null,
  });
}
