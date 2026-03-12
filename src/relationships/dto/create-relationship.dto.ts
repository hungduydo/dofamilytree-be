import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsOptional, MaxLength } from 'class-validator';

export class CreateRelationshipDto {
  @ApiProperty({ example: 'uuid-parent' })
  @IsString()
  @IsNotEmpty()
  parentId: string;

  @ApiProperty({ example: 'uuid-child' })
  @IsString()
  @IsNotEmpty()
  childId: string;

  @ApiProperty({ enum: ['BIOLOGICAL', 'ADOPTED', 'SPOUSE'] })
  @IsIn(['BIOLOGICAL', 'ADOPTED', 'SPOUSE'])
  type: 'BIOLOGICAL' | 'ADOPTED' | 'SPOUSE';

  @ApiPropertyOptional({ example: 'Con nuôi từ năm 1990' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SearchRelationshipDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({ enum: ['BIOLOGICAL', 'ADOPTED', 'SPOUSE'] })
  @IsOptional()
  @IsIn(['BIOLOGICAL', 'ADOPTED', 'SPOUSE'])
  type?: 'BIOLOGICAL' | 'ADOPTED' | 'SPOUSE';

  @ApiPropertyOptional({ enum: ['parent', 'child', 'spouse'] })
  @IsOptional()
  @IsIn(['parent', 'child', 'spouse'])
  role?: 'parent' | 'child' | 'spouse';
}
