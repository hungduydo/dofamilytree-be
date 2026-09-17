import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberResponseDto } from '../../members/dto/member-response.dto';

export class GraveAreaSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Đùng Vành' })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'array', items: { type: 'number' } },
    nullable: true,
    description: '[[vĩ độ, kinh độ], ...] — null = khu chưa vẽ ranh giới',
  })
  polygon: [number, number][] | null;
}

export class GraveLocationDto {
  @ApiProperty({ example: 16.78245 })
  latitude: number;

  @ApiProperty({ example: 107.18915 })
  longitude: number;

  @ApiProperty({ enum: ['GRAVE', 'AREA'], description: 'GRAVE = chấm tại mộ; AREA = tâm khu an táng' })
  source: 'GRAVE' | 'AREA';
}

/**
 * Mirrors the Prisma `Cemetery` model, plus the resolved display location:
 * the grave's own coordinates if pinned, else its burial area's center.
 */
export class GraveResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Nghĩa trang dòng họ Nguyễn' })
  name: string;

  @ApiPropertyOptional({ example: 21.028511, nullable: true, description: 'Vĩ độ chấm tại mộ (null = chưa có, xem `location`)' })
  latitude: number | null;

  @ApiPropertyOptional({ example: 105.804817, nullable: true, description: 'Kinh độ chấm tại mộ (null = chưa có, xem `location`)' })
  longitude: number | null;

  @ApiPropertyOptional({
    enum: ['EXACT', 'AREA'],
    nullable: true,
    description: 'EXACT = chấm tại mộ, AREA = toạ độ chung của khu mộ, null = chưa có toạ độ',
  })
  gpsPrecision: 'EXACT' | 'AREA' | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'Khu an táng' })
  area_id: string | null;

  @ApiPropertyOptional({ type: () => GraveAreaSummaryDto, nullable: true })
  area: GraveAreaSummaryDto | null;

  @ApiPropertyOptional({ type: () => GraveLocationDto, nullable: true, description: 'Vị trí hiển thị; null = không lên bản đồ' })
  location: GraveLocationDto | null;

  @ApiPropertyOptional({ nullable: true, description: 'Ảnh ngôi mộ' })
  photoUrl: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'Thành viên liên kết' })
  member_id: string | null;

  @ApiPropertyOptional({ nullable: true, example: '1950-03-20', description: 'Ngày mất' })
  deathDate: string | null;

  @ApiPropertyOptional({ nullable: true, example: '1960-11-05', description: 'Ngày cải táng' })
  relocationDate: string | null;

  @ApiPropertyOptional({ nullable: true, example: '1960-12-01', description: 'Ngày xây dựng' })
  constructionDate: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: string;

  @ApiPropertyOptional({ type: () => MemberResponseDto, nullable: true, description: 'Suy ra generation/gender/branch/clanRole từ đây' })
  member?: MemberResponseDto | null;
}
