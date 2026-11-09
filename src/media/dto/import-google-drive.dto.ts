import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength,
} from 'class-validator';
import { MAX_DRIVE_IMPORT_FILES } from '../media.constants';
import { DRIVE_FILE_ID_PATTERN } from '../google-drive';

/**
 * Body cho `POST /v2/media/import/google-drive`. FE lấy `file_ids` và
 * `access_token` từ Google Picker (scope `drive.file`) — xem docs/GOOGLE_DRIVE_IMPORT.md.
 */
export class ImportGoogleDriveDto {
  @ApiProperty({
    description:
      'OAuth access token Google của người dùng (scope drive.file), lấy từ Google Identity Services. ' +
      'Backend chỉ giữ tạm trong Redis tối đa 1 giờ cho đợt import, không lưu refresh token.',
  })
  @IsString()
  @MaxLength(4096)
  access_token: string;

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
