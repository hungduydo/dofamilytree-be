import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, IsIn, Min, MaxLength } from 'class-validator';
import { MEDIA_TYPES } from '../media.constants';

/**
 * Chuẩn hoá `tags` từ multipart (một field đơn hoặc chuỗi CSV) hoặc JSON array
 * về `string[]`. Cùng logic toRoleTagsArray ở members/dto/create-member.dto.ts.
 */
export const toTagsArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return undefined;
};

/**
 * Body multipart cho `POST /v2/media/upload`. File đi qua `@UploadedFile`,
 * các field metadata ở đây. `type` để trống → backend tự suy từ MIME.
 */
export class UploadMediaDto {
  @ApiPropertyOptional({ example: 'Lễ giỗ Tổ 2024' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    enum: MEDIA_TYPES,
    description: 'Bỏ trống để backend tự phân loại từ MIME (image/video/audio/document).',
  })
  @IsOptional()
  @IsIn(MEDIA_TYPES)
  type?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Gắn media với một thành viên' })
  @IsOptional()
  @IsUUID()
  member_id?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Gắn media vào một album' })
  @IsOptional()
  @IsUUID()
  album_id?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Gắn media với một sự kiện' })
  @IsOptional()
  @IsUUID()
  event_id?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn An' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  uploader_name?: string;

  @ApiPropertyOptional({
    type: Number,
    example: 324,
    description: 'Thời lượng video/audio (giây) — FE trích xuất và gửi kèm.',
  })
  @IsOptional()
  // Multipart gửi mọi field dưới dạng string → ép về number trước khi validate.
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  duration_seconds?: number;

  @ApiPropertyOptional({ type: [String], description: 'Tag (mảng hoặc chuỗi CSV)' })
  @IsOptional()
  @Transform(toTagsArray)
  @IsString({ each: true })
  tags?: string[];
}
