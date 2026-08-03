import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsUUID, MaxLength } from 'class-validator';

export class CreateMemoryDto {
  @ApiProperty({ example: 'Kỷ niệm khó quên trong ngày họp mặt dòng họ...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;

  @ApiPropertyOptional({ type: [String], format: 'uri', description: 'Ảnh kỷ niệm' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Gắn với một sự kiện (tùy chọn)' })
  @IsOptional()
  @IsUUID()
  event_id?: string;
}

/** Mirrors the Prisma `Memory` model. */
export class MemoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  member_id: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  event_id: string | null;

  @ApiProperty({ format: 'uuid' })
  author_id: string;

  @ApiProperty()
  text: string;

  @ApiProperty({ type: [String], default: [] })
  photos: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;
}
