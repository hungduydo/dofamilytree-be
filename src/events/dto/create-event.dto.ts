import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsDateString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAnniversaryDto {
  @ApiProperty({ example: 'Giỗ Ông Nội' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: '2024-03-15T00:00:00.000Z' })
  @Type(() => Date)
  date: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Link to a member (optional)' })
  @IsOptional()
  @IsUUID()
  member_id?: string;
}

export class UpdateAnniversaryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  member_id?: string;
}

export class CreateEventDto {
  @ApiProperty({ example: 'Họp Mặt Dòng Họ 2024' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '2024-08-15T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  highlight?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  images?: string[];
}

export class UpdateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  highlight?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  images?: string[];
}
