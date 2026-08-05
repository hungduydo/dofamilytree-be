import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Body cho `POST /v2/media/albums`. */
export class CreateAlbumDto {
  @ApiProperty({ example: 'Lễ giỗ Tổ 2024' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Hình ảnh ngày giỗ Tổ dòng họ' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ format: 'uri', description: 'Ảnh bìa album' })
  @IsOptional()
  @IsString()
  cover_url?: string;

  @ApiPropertyOptional({ example: '15/04/2024', description: 'Nhãn ngày (chuỗi tự do)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  date?: string;
}
