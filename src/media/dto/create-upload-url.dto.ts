import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, IsIn, Min, MaxLength } from 'class-validator';
import { MEDIA_TYPES } from '../media.constants';

/**
 * Body cho `POST /v2/media/upload-url` — JSON thuần (không multipart), vì file
 * KHÔNG đi qua request này. Client mô tả file sắp upload, backend trả về
 * presigned PUT URL để client gửi thẳng lên storage.
 */
export class CreateUploadUrlDto {
  @ApiProperty({ example: 'le-gio-to-2024.mp3', description: 'Tên file gốc — dùng làm key trên storage' })
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({
    example: 'audio/mpeg',
    description:
      'MIME của file. Được KÝ vào presigned URL nên client phải PUT với đúng header Content-Type này.',
  })
  @IsString()
  @MaxLength(150)
  mime_type: string;

  @ApiProperty({
    type: Number,
    example: 10485760,
    description: 'Size dự kiến (byte) — backend từ chối sớm nếu vượt trần, trước khi client tốn băng thông.',
  })
  @IsInt()
  @Min(1)
  size_bytes: number;

  @ApiPropertyOptional({ example: 'Lễ giỗ Tổ 2024' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ enum: MEDIA_TYPES, description: 'Bỏ trống → suy từ mime_type.' })
  @IsOptional()
  @IsIn(MEDIA_TYPES)
  type?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  member_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  album_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  event_id?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn An' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  uploader_name?: string;

  @ApiPropertyOptional({ type: Number, example: 324 })
  @IsOptional()
  @IsInt()
  @Min(0)
  duration_seconds?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];
}
