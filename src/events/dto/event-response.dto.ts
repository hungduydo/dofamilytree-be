import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberResponseDto } from '../../members/dto/member-response.dto';

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

/** Mirrors the Prisma `Anniversary` model, with the optional linked member. */
export class AnniversaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Giỗ cụ Nguyễn Văn A' })
  title: string;

  @ApiProperty({ type: String, format: 'date-time' })
  date: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  member_id: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'Mộ/nghĩa trang liên kết' })
  cemetery_id: string | null;

  @ApiProperty({ default: false, description: 'Ngày giỗ theo âm lịch' })
  isLunar: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: string;

  @ApiPropertyOptional({ type: () => MemberResponseDto, nullable: true })
  member?: MemberResponseDto | null;

  @ApiPropertyOptional({ nullable: true, description: 'Mộ/nghĩa trang liên kết' })
  cemetery?: Record<string, any> | null;
}
