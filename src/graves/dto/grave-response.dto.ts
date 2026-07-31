import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Mirrors the Prisma `Cemetery` model (grave with GPS coordinates). */
export class GraveResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Nghĩa trang dòng họ Nguyễn' })
  name: string;

  @ApiProperty({ example: 21.028511, description: 'Vĩ độ' })
  latitude: number;

  @ApiProperty({ example: 105.804817, description: 'Kinh độ' })
  longitude: number;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: string;
}
