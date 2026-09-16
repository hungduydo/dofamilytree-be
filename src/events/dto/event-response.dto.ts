import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ANNIVERSARY_CALENDARS, ANNIVERSARY_KINDS } from '../anniversary-occurrence';

/** Mirrors the Prisma `Event` model. */
export class EventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Giỗ tổ dòng họ' })
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ type: [String], format: 'uri', description: 'Ảnh sự kiện' })
  images: string[];

  @ApiProperty({ default: false, description: 'Nổi bật trên trang chủ' })
  highlight: boolean;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  date: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time', description: 'Ngày kết thúc' })
  end_date: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Nhà thờ họ' })
  location: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Lễ', description: 'Loại sự kiện' })
  category: string | null;

  @ApiProperty({ default: false, description: 'Ngày theo âm lịch' })
  isLunar: boolean;

  @ApiProperty({ example: 0, description: 'Số người tham dự' })
  attendeeCount: number;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: string;
}

/** Người được tưởng niệm — KHÔNG có liên lạc (route công khai). */
export class AnniversaryMemberDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  avatar_url: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 5 })
  generation: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Chuỗi tự do' })
  deathDate: string | null;
}

export class AnniversaryCemeteryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

/**
 * Ngày tưởng niệm lặp lại hằng năm + lần kế tiếp đã quy đổi sang dương lịch
 * (giờ Việt Nam). Quy tắc: docs/product/lunar-calendar.md.
 */
export class AnniversaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ANNIVERSARY_KINDS })
  kind: string;

  @ApiProperty({ enum: ANNIVERSARY_CALENDARS })
  calendar: string;

  @ApiProperty({ example: 23 })
  day: number;

  @ApiProperty({ example: 12 })
  month: number;

  @ApiProperty({ default: false, description: 'Mất trong tháng nhuận' })
  isLeapMonth: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Tiêu đề nhập tay' })
  title: string | null;

  @ApiProperty({ example: 'Kỵ Nguyễn Văn A', description: 'title, hoặc "Kỵ <tên>" nếu để trống' })
  displayTitle: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  member_id: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  cemetery_id: string | null;

  @ApiProperty({ example: '2027-01-30', description: 'Lần kế tiếp (tính cả hôm nay), dương lịch' })
  nextOccurrence: string;

  @ApiProperty({ example: 12, description: '0 = hôm nay' })
  daysUntil: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 30,
    description: 'Lần giỗ thứ mấy (khi năm mất đọc được từ deathDate)',
  })
  yearsSinceDeath: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: string;

  @ApiPropertyOptional({ type: () => AnniversaryMemberDto, nullable: true })
  member: AnniversaryMemberDto | null;

  @ApiPropertyOptional({ type: () => AnniversaryCemeteryDto, nullable: true })
  cemetery: AnniversaryCemeteryDto | null;
}

export class AnniversaryTodayResponseDto {
  @ApiProperty({ example: '2026-09-16', description: 'Hôm nay theo giờ Việt Nam' })
  date: string;

  @ApiProperty({ example: { day: 6, month: 8, year: 2026, isLeapMonth: false } })
  lunar: { day: number; month: number; year: number; isLeapMonth: boolean };

  @ApiProperty({ type: [AnniversaryResponseDto] })
  items: AnniversaryResponseDto[];
}
