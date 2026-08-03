import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateLifeEventDto {
  @ApiProperty({ example: '1990-05-12', description: 'Ngày diễn ra (chuỗi, giống Member.birthDate)' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ example: 'Tốt nghiệp đại học' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'education', description: 'Loại mốc (học vấn, sự nghiệp...)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}

/** Mirrors the Prisma `LifeEvent` model. */
export class LifeEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  member_id: string;

  @ApiProperty({ example: '1990-05-12' })
  date: string;

  @ApiProperty({ example: 'Tốt nghiệp đại học' })
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  category: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;
}
