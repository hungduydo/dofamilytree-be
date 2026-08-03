import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsUUID, IsDate, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/** Coerce multipart/form-data string booleans ("true"/"false"/"1"/"0"/"") into real booleans. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0' || value === '') return false;
  return value;
};

/** Normalise a kept-images list from multipart (JSON string / comma string / repeated field) into string[]. */
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
    } catch {
      return s.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return undefined;
};

export class CreateAnniversaryDto {
  @ApiProperty({ example: 'Giỗ Ông Nội' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: '2024-03-15T00:00:00.000Z' })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  date: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Link to a member (optional)' })
  @IsOptional()
  @IsUUID()
  member_id?: string;

  @ApiPropertyOptional({ description: 'Link to a cemetery/grave (optional)' })
  @IsOptional()
  @IsUUID()
  cemetery_id?: string;

  @ApiPropertyOptional({ default: false, description: 'Ngày giỗ theo âm lịch' })
  @IsOptional()
  @IsBoolean()
  isLunar?: boolean;
}

export class UpdateAnniversaryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  member_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cemetery_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLunar?: boolean;
}

export class AddAttendeeDto {
  @ApiProperty({ format: 'uuid' })
  @IsNotEmpty()
  @IsUUID()
  member_id: string;

  @ApiPropertyOptional({ example: 'going', description: 'going | maybe | declined' })
  @IsOptional()
  @IsString()
  rsvp_status?: string;
}

export class CreateEventDto {
  @ApiProperty({ example: 'Họp Mặt Dòng Họ 2024' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '2024-08-15T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional({ example: '2024-08-16T00:00:00.000Z', description: 'Ngày kết thúc (sự kiện nhiều ngày)' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  end_date?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Lễ', description: 'Loại sự kiện' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ default: false, description: 'Ngày theo âm lịch' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isLunar?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  highlight?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  images?: string[];
}

export class UpdateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  end_date?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isLunar?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  highlight?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Ảnh hiện có được giữ lại (URL); ảnh mới upload sẽ nối vào sau' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  existingImages?: string[];
}
