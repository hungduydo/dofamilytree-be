import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateGraveDto {
  @ApiProperty({ example: 'Mộ Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 10.7769 })
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: 106.7009 })
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ example: 'Nghĩa trang Bình Hưng Hòa' })
  @IsOptional()
  @IsString()
  description?: string;
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
