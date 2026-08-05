import { Prisma } from '@prisma/client';

/**
 * Mảnh `select` dùng chung cho media. Tách file riêng để shape ở service và DTO
 * tài liệu hoá không trôi khỏi nhau (giống members.select.ts). `satisfies` vừa
 * giữ literal type (Prisma suy đúng kiểu kết quả) vừa validate tên cột.
 */

/**
 * Cột một card cần để render trong lưới "Media mới nhất" / "xem nhiều".
 * CỐ Ý bỏ `normalized_title` (chỉ để tìm kiếm, không hiển thị).
 */
export const MEDIA_CARD_SELECT = {
  id: true,
  file_path: true,
  title: true,
  type: true,
  mime_type: true,
  size_bytes: true,
  duration_seconds: true,
  views: true,
  tags: true,
  status: true,
  member_id: true,
  album_id: true,
  event_id: true,
  uploader_id: true,
  uploader_name: true,
  created_at: true,
} satisfies Prisma.MediaSelect;
