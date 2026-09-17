import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsUUID, IsUrl, Max, Min } from 'class-validator';

export class CreateGraveDto {
  @ApiProperty({ example: 'Mộ Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 10.7769, nullable: true, description: 'Chấm tại chính ngôi mộ. Null = chưa có — vị trí lấy theo khu' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ example: 106.7009, nullable: true, description: 'Chấm tại chính ngôi mộ. Null = chưa có — vị trí lấy theo khu' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({ example: 'Hàng thứ hai, cạnh cây dương', description: 'Ghi chú riêng của ngôi mộ' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Khu an táng (GET /grave-areas). Null = không thuộc khu nào' })
  @IsOptional()
  @IsUUID()
  area_id?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'https://….public.blob.vercel-storage.com/grave.jpg', description: 'Ảnh ngôi mộ (tải qua POST /media/upload)' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  photoUrl?: string | null;

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

  @ApiPropertyOptional({ nullable: true, description: 'null = xoá toạ độ của mộ' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = xoá toạ độ của mộ' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null = gỡ khỏi khu' })
  @IsOptional()
  @IsUUID()
  area_id?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = xoá ảnh' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  photoUrl?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null = bỏ liên kết thành viên' })
  @IsOptional()
  @IsUUID()
  member_id?: string | null;

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
