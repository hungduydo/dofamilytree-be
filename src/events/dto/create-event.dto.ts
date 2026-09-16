import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsBoolean, IsUUID, IsDate, IsArray, IsIn, IsInt, Min, Max, MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  ANNIVERSARY_CALENDARS, ANNIVERSARY_KINDS, AnniversaryCalendar, AnniversaryKind,
} from '../anniversary-occurrence';

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

const ANNIVERSARY_KIND_DOC = 'DEATH = ngày kỵ của member_id (mỗi người một ngày) | CLAN = giỗ tổ, thanh minh… | OTHER';
const ANNIVERSARY_CALENDAR_DOC = 'LUNAR = âm lịch (Việt Nam, UTC+7) | SOLAR = dương lịch';

export class CreateAnniversaryDto {
  @ApiPropertyOptional({ enum: ANNIVERSARY_KINDS, default: 'DEATH', description: ANNIVERSARY_KIND_DOC })
  @IsOptional()
  @IsIn(ANNIVERSARY_KINDS)
  kind?: AnniversaryKind;

  @ApiPropertyOptional({ enum: ANNIVERSARY_CALENDARS, default: 'LUNAR', description: ANNIVERSARY_CALENDAR_DOC })
  @IsOptional()
  @IsIn(ANNIVERSARY_CALENDARS)
  calendar?: AnniversaryCalendar;

  @ApiProperty({ example: 23, minimum: 1, maximum: 31, description: 'Ngày (âm: 1–30)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  day: number;

  @ApiProperty({ example: 12, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional({ default: false, description: 'Mất trong tháng nhuận (chỉ với LUNAR). Vẫn cúng vào tháng thường.' })
  @IsOptional()
  @IsBoolean()
  isLeapMonth?: boolean;

  @ApiPropertyOptional({ example: 'Giỗ tổ dòng họ', description: 'Bắt buộc khi kind khác DEATH' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Người được tưởng niệm — bắt buộc khi kind = DEATH' })
  @IsOptional()
  @IsUUID()
  member_id?: string;

  @ApiPropertyOptional({ description: 'Mộ/nghĩa trang liên kết' })
  @IsOptional()
  @IsUUID()
  cemetery_id?: string;
}

/** Mọi trường tuỳ chọn; `null` ở member_id/cemetery_id/title/description để xoá. */
export class UpdateAnniversaryDto {
  @ApiPropertyOptional({ enum: ANNIVERSARY_KINDS })
  @IsOptional()
  @IsIn(ANNIVERSARY_KINDS)
  kind?: AnniversaryKind;

  @ApiPropertyOptional({ enum: ANNIVERSARY_CALENDARS })
  @IsOptional()
  @IsIn(ANNIVERSARY_CALENDARS)
  calendar?: AnniversaryCalendar;

  @ApiPropertyOptional({ minimum: 1, maximum: 31 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  day?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLeapMonth?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  member_id?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  cemetery_id?: string | null;
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
