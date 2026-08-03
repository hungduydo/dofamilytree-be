import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsDate, MaxLength } from 'class-validator';

export class CreateArticleDto {
  @ApiProperty({ example: 'Lễ giỗ Tổ họ Đỗ năm 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @ApiProperty({ example: 'Nội dung đầy đủ của bài viết...' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: 'announcement', description: 'announcement | activity | story | archive | construction | other' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Tóm tắt ngắn hiển thị trên thẻ.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({ example: '2026-02-20T00:00:00.000Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;
}

export class UpdateArticleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;
}

/** Mirrors the Prisma `Article` model. */
export class ArticleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  excerpt: string | null;

  @ApiProperty()
  content: string;

  @ApiProperty({ example: 'announcement' })
  category: string;

  @ApiProperty({ type: String, format: 'date-time' })
  date: string;

  @ApiProperty({ example: 0 })
  views: number;

  @ApiProperty({ default: false })
  featured: boolean;

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  coverUrl: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: string;
}
