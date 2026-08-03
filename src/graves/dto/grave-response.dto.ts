import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberResponseDto } from '../../members/dto/member-response.dto';

/** Mirrors the Prisma `Cemetery` model (grave with optional GPS coordinates). */
export class GraveResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Nghĩa trang dòng họ Nguyễn' })
  name: string;

  @ApiPropertyOptional({ example: 21.028511, nullable: true, description: 'Vĩ độ (null = chưa xác định GPS)' })
  latitude: number | null;

  @ApiPropertyOptional({ example: 105.804817, nullable: true, description: 'Kinh độ (null = chưa xác định GPS)' })
  longitude: number | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

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
