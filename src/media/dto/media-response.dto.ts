import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MEDIA_TYPES } from '../media.constants';

/** Mirrors một record `Media` (shape MEDIA_CARD_SELECT). */
export class MediaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uri', description: 'URL Blob khi ready; /pending/... khi đang xử lý' })
  file_path: string;

  @ApiPropertyOptional({ nullable: true, example: 'Lễ giỗ Tổ 2024' })
  title: string | null;

  @ApiPropertyOptional({ nullable: true, enum: MEDIA_TYPES })
  type: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'image/jpeg' })
  mime_type: string | null;

  // `type: Number` bắt buộc cho số nullable — TS `number | null` không reflect,
  // thiếu nó schema sinh ra `type: object` (xem member-response.dto.ts).
  @ApiPropertyOptional({ type: Number, nullable: true, example: 2411724 })
  size_bytes: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 324, description: 'Thời lượng (giây)' })
  duration_seconds: number | null;

  @ApiProperty({ example: 2456, description: 'Lượt xem' })
  views: number;

  @ApiProperty({ type: [String], default: [] })
  tags: string[];

  @ApiProperty({ enum: ['pending', 'ready', 'failed'], example: 'ready' })
  status: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  member_id: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  album_id: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  event_id: string | null;

  @ApiProperty({ format: 'uuid' })
  uploader_id: string;

  @ApiPropertyOptional({ nullable: true, example: 'Nguyễn Văn An' })
  uploader_name: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;
}

/** Album kèm số media, cho lưới "Album nổi bật". */
export class MediaAlbumResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Lễ giỗ Tổ 2024' })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  cover_url: string | null;

  @ApiPropertyOptional({ nullable: true, example: '15/04/2024' })
  date: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ example: 126, description: 'Số media trong album' })
  count: number;
}

/** Envelope phân trang cho `GET /v2/media`. */
export class PaginatedMediaResponseDto {
  @ApiProperty({ type: () => [MediaResponseDto] })
  data: MediaResponseDto[];

  @ApiProperty({ example: 1256, description: 'Tổng số media khớp filter' })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;
}

/** Thống kê cho thẻ "Thống kê media" + "Dung lượng lưu trữ". */
export class MediaStatsResponseDto {
  @ApiProperty({ example: 1256 })
  total: number;

  @ApiProperty({ example: 856 })
  images: number;

  @ApiProperty({ example: 128 })
  videos: number;

  @ApiProperty({ example: 40 })
  audios: number;

  @ApiProperty({ example: 24, description: 'Tài liệu (pdf/doc/…)' })
  documents: number;

  @ApiProperty({
    example: 0,
    description:
      'Record thiếu `type` (dữ liệu cũ chưa backfill). Không nằm trong 4 bucket trên, ' +
      'nên images+videos+audios+documents+untyped = total. Khác 0 nghĩa là cần chạy ' +
      'scripts/backfill-media-metadata.ts.',
  })
  untyped: number;

  @ApiProperty({ example: 26414656614, description: 'Tổng dung lượng đã dùng (bytes)' })
  storageUsedBytes: number;

  @ApiProperty({ example: 107374182400, description: 'Hạn mức lưu trữ (bytes)' })
  storageQuotaBytes: number;

  @ApiProperty({
    example: 0,
    description: 'Số record thiếu `size_bytes` ⇒ storageUsedBytes đang thấp hơn thực tế.',
  })
  mediaMissingSize: number;
}

/** Kết quả `POST /v2/media/:id/view`. */
export class MediaViewResponseDto {
  @ApiProperty({ example: 2457, description: 'Lượt xem sau khi tăng' })
  views: number;
}

/** Kết quả `GET /v2/media/:id/progress`. */
export class MediaProgressResponseDto {
  @ApiProperty({ enum: ['pending', 'processing', 'ready', 'failed'], example: 'processing' })
  status: 'pending' | 'processing' | 'ready' | 'failed';

  @ApiProperty({ example: 50, description: '0–100' })
  progress: number;

  @ApiPropertyOptional({ format: 'uri', description: 'URL Blob, chỉ có khi status=ready' })
  url?: string;

  @ApiPropertyOptional({ description: 'Chỉ có khi status=failed' })
  error?: string;
}
