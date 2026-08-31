import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

/**
 * Biên độ độ dài lời tưởng niệm. PHẢI khớp TRIBUTE_MIN_LENGTH / TRIBUTE_MAX_LENGTH
 * trong frontend/src/lib/memorialView.ts — FE chặn trước bằng đúng hai con số này,
 * lệch nhau thì người dùng gõ xong mới bị 400.
 */
export const TRIBUTE_MIN_LENGTH = 10;
export const TRIBUTE_MAX_LENGTH = 500;

export class BurnIncenseDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Bỏ trống = thắp cho tổ tiên nói chung (nút ở ban thờ).',
  })
  @IsOptional()
  @IsUUID()
  memberId?: string;
}

export class CreateTributeDto {
  @ApiProperty({
    minLength: TRIBUTE_MIN_LENGTH,
    maxLength: TRIBUTE_MAX_LENGTH,
    example: 'Con cháu đời thứ 6 xin kính cẩn dâng nén hương tưởng nhớ công đức tổ tiên.',
  })
  // @Transform chạy TRƯỚC @Length (class-transformer đi trước class-validator
  // trong ValidationPipe), nên một chuỗi toàn khoảng trắng bị đo là rỗng chứ
  // không lọt qua nhờ độ dài.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(TRIBUTE_MIN_LENGTH, TRIBUTE_MAX_LENGTH)
  content: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Bỏ trống = lời tưởng niệm gửi tổ tiên nói chung.',
  })
  @IsOptional()
  @IsUUID()
  memberId?: string;
}

export class MemorialStatsDto {
  @ApiProperty({ example: 7, description: 'Cùng con số GET /tree/stats trả về (MAX(generation)).' })
  generations: number;

  @ApiProperty({ example: 2148, description: 'Tổng mọi nén hương, kể cả lượt gửi tổ tiên nói chung.' })
  incenseTotal: number;

  @ApiProperty({ example: 316 })
  tributeTotal: number;
}

export class MemorialAncestorDto {
  @ApiProperty({ format: 'uuid' })
  memberId: string;

  @ApiProperty({ example: 'Nguyễn Văn Thủy' })
  name: string;

  @ApiProperty({ nullable: true, example: '1830-01-01' })
  birthDate: string | null;

  @ApiProperty({ nullable: true, example: '1905-01-01' })
  deathDate: string | null;

  @ApiProperty({ nullable: true, example: 1 })
  generation: number | null;

  @ApiProperty({ description: 'true với thế hệ thấp nhất đang có — FE hiện "Thủy tổ".' })
  isFounder: boolean;

  @ApiProperty({ nullable: true, format: 'uri' })
  avatarUrl: string | null;

  @ApiProperty({ example: 428, description: 'Lượt thắp cho RIÊNG cụ này; lượt clan-wide không tính vào ai.' })
  incenseCount: number;
}

export class MemorialTributeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ description: 'Đã chốt lúc ghi. KHÔNG BAO GIỜ là email — endpoint này public.' })
  authorName: string;

  @ApiProperty({ format: 'uuid' })
  authorUserId: string;

  @ApiProperty({ nullable: true, format: 'uuid', description: 'null = gửi tổ tiên nói chung.' })
  memberId: string | null;

  @ApiProperty({ nullable: true })
  memberName: string | null;
}

export class BurnIncenseResponseDto {
  @ApiProperty({ example: 429, description: 'Số mới của cụ đó; 0 với lượt gửi tổ tiên nói chung.' })
  incenseCount: number;

  @ApiProperty({ example: 2149 })
  incenseTotal: number;
}

/**
 * Envelope phân trang của repo này là { data, total, page, pageSize } — KHÔNG có
 * `success`. Xem PaginatedMembersResponseDto; `unwrap()` của FE (`res.data.data ??
 * res.data`) đọc được cả hai nên không cần thêm lớp bọc.
 */
export class PaginatedMemorialAncestorsDto {
  @ApiProperty({ type: [MemorialAncestorDto] })
  data: MemorialAncestorDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}

export class PaginatedMemorialTributesDto {
  @ApiProperty({ type: [MemorialTributeDto] })
  data: MemorialTributeDto[];

  @ApiProperty({ example: 316 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}
