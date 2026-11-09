import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateIf } from 'class-validator';

/** Số media tối đa trong một lần `POST /v2/media/move`. */
export const MAX_MOVE_MEDIA = 200;

/** Body cho `POST /v2/media/move` — chuyển media đã upload vào (hoặc ra khỏi) album. */
export class MoveMediaDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: `ID media cần chuyển (1–${MAX_MOVE_MEDIA}). Trùng lặp bị gộp.`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MOVE_MEDIA)
  @IsUUID('all', { each: true, message: 'media_ids chứa ID không hợp lệ' })
  media_ids: string[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Album đích. `null` = gỡ khỏi mọi album. Bắt buộc có mặt (không được bỏ trống).',
  })
  // null hợp lệ; thiếu hẳn (undefined) vẫn bị IsUUID chặn — FE phải nói rõ ý định.
  @ValidateIf((_o, value) => value !== null)
  @IsUUID('all', { message: 'album_id phải là UUID hoặc null' })
  album_id: string | null;
}

export class MoveMediaSkippedDto {
  @ApiProperty({ format: 'uuid' })
  media_id: string;

  @ApiProperty({ enum: ['not_found', 'not_owner'] })
  reason: 'not_found' | 'not_owner';
}

export class MoveMediaResponseDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  album_id: string | null;

  @ApiProperty({
    type: [String],
    description: 'Media đã nằm trong album đích sau lời gọi (kể cả media vốn đã ở đó).',
  })
  moved: string[];

  @ApiProperty({ type: [MoveMediaSkippedDto] })
  skipped: MoveMediaSkippedDto[];
}
