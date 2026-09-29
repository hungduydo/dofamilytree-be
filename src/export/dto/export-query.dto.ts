import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ExportQueryDto {
  @ApiPropertyOptional({ description: 'Chỉ xuất một nhánh: người này + mọi hậu duệ + vợ/chồng của họ' })
  @IsOptional()
  @IsUUID()
  rootId?: string;

  @ApiPropertyOptional({ description: 'Tiêu đề trang bìa / HEAD của GEDCOM', default: 'Gia phả dòng họ', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
