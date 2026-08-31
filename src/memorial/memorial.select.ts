import { Prisma } from '@prisma/client';

/**
 * Projection cho thẻ tổ tiên. Cố ý KHÔNG lấy nguyên row Member: thẻ chỉ cần
 * sáu cột, còn `profile` mang cả PII (phone/address) mà đây là endpoint public.
 */
export const MEMORIAL_ANCESTOR_SELECT = {
  id: true,
  name: true,
  birthDate: true,
  deathDate: true,
  generation: true,
  avatar_url: true,
} satisfies Prisma.MemberSelect;

/**
 * `author_name` đã denormalize nên KHÔNG join sang Supabase lúc đọc. `member`
 * thu hẹp còn đúng `name` — join một cột, không kéo cả row.
 */
export const MEMORIAL_TRIBUTE_SELECT = {
  id: true,
  content: true,
  created_at: true,
  author_name: true,
  user_id: true,
  member_id: true,
  member: { select: { name: true } },
} satisfies Prisma.MemorialTributeSelect;
