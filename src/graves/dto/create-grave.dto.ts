import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsUUID } from 'class-validator';

export class CreateGraveDto {
  @ApiProperty({ example: 'Mộ Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 10.7769, nullable: true, description: 'Null = chưa xác định GPS' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 106.7009, nullable: true, description: 'Null = chưa xác định GPS' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 'Nghĩa trang Bình Hưng Hòa' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Liên kết mộ ↔ thành viên (suy ra generation/gender/branch...)' })
  @IsOptional()
  @IsUUID()
  member_id?: string;

  @ApiPropertyOptional({ example: '1950-03-20', description: 'Ngày mất' })
  @IsOptional()
  @IsString()
  deathDate?: string;

  @ApiPropertyOptional({ example: '1960-11-05', description: 'Ngày cải táng' })
  @IsOptional()
  @IsString()
  relocationDate?: string;

  @ApiPropertyOptional({ example: '1960-12-01', description: 'Ngày xây dựng' })
  @IsOptional()
  @IsString()
  constructionDate?: string;
}

export class UpdateGraveDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  member_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deathDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relocationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  constructionDate?: string;
}

export class NearbyGraveQueryDto {
  @ApiProperty({ example: 10.7769 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: 106.7009 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ example: 10, description: 'Radius in km (default: 10)' })
  @IsOptional()
  @IsNumber()
  radiusKm?: number;
}
