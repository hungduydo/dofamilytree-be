import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength,
} from 'class-validator';
import { MAX_DRIVE_IMPORT_FILES } from '../media.constants';
import { DRIVE_FILE_ID_PATTERN, DRIVE_RESOURCE_KEY_PATTERN } from '../google-drive';

/**
 * Body cho `POST /v2/media/import/google-drive`. Hai chế độ:
 * - Picker: FE gửi `access_token` + `file_ids` lấy từ Google Picker (scope `drive.file`).
 * - Link chia sẻ: KHÔNG có `access_token`; backend đọc file bằng key server
 *   `GOOGLE_DRIVE_API_KEY`, kèm `resource_keys` nếu link có resource key.
 * Xem docs/GOOGLE_DRIVE_IMPORT.md.
 */
export class ImportGoogleDriveDto {
  @ApiPropertyOptional({
    description:
      'OAuth access token Google của người dùng (scope drive.file), lấy từ Google Identity Services. ' +
      'Backend chỉ giữ tạm trong Redis tối đa 1 giờ cho đợt import, không lưu refresh token. ' +
      'Bỏ trống ⇒ chế độ link chia sẻ: file phải được chia sẻ "Bất kỳ ai có đường liên kết".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  access_token?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Chỉ dùng ở chế độ link chia sẻ: resource key của các file cũ, mỗi phần tử dạng "fileId/resourceKey" ' +
      `(định dạng header X-Goog-Drive-Resource-Keys). Tối đa ${MAX_DRIVE_IMPORT_FILES}.`,
    example: ['1AbCdEfGhIjKlMnOpQrStUvWxYz012345/0-AbCdEfGh'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DRIVE_IMPORT_FILES)
  @Matches(DRIVE_RESOURCE_KEY_PATTERN, {
    each: true,
    message: 'resource_keys phải có dạng "fileId/resourceKey"',
  })
  resource_keys?: string[];

  @ApiProperty({
    type: [String],
    description: `ID các file đã chọn trong Google Picker (tối đa ${MAX_DRIVE_IMPORT_FILES}). Trùng lặp bị gộp.`,
    example: ['1AbCdEfGhIjKlMnOpQrStUvWxYz012345'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DRIVE_IMPORT_FILES)
  @Matches(DRIVE_FILE_ID_PATTERN, { each: true, message: 'file_ids chứa ID Google Drive không hợp lệ' })
  file_ids: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  album_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  member_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  event_id?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn An' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  uploader_name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];
}

export class DriveImportAcceptedDto {
  @ApiProperty({ format: 'uuid', description: 'Record media vừa tạo (pending) — poll GET /v2/media/:id/progress' })
  media_id: string;

  @ApiProperty()
  drive_file_id: string;

  @ApiProperty()
  filename: string;

  @ApiProperty({ example: 'image/jpeg' })
  mime_type: string;

  @ApiProperty({ type: Number, nullable: true })
  size_bytes: number | null;
}

export class DriveImportRejectedDto {
  @ApiProperty()
  drive_file_id: string;

  @ApiProperty({
    enum: ['not_found', 'unsupported_type', 'too_large', 'trashed', 'drive_unavailable', 'enqueue_failed'],
  })
  reason: string;

  @ApiProperty({ description: 'Message tiếng Việt hiển thị thẳng cho người dùng' })
  message: string;
}

export class ImportGoogleDriveResponseDto {
  @ApiProperty({ format: 'uuid' })
  batch_id: string;

  @ApiProperty({ type: [DriveImportAcceptedDto] })
  accepted: DriveImportAcceptedDto[];

  @ApiProperty({ type: [DriveImportRejectedDto] })
  rejected: DriveImportRejectedDto[];
}
