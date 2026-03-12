import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, MinLength, IsOptional, IsIn } from 'class-validator';

export class CreateMemberDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: 'M', enum: ['M', 'F', 'O', 'U'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['M', 'F', 'O', 'U'])
  gender: string;

  @ApiPropertyOptional({ example: '1990-01-01' })
  @IsOptional()
  @IsString()
  birthDate?: string;

  @ApiPropertyOptional({ example: '2020-12-31' })
  @IsOptional()
  @IsString()
  deathDate?: string;

  @ApiPropertyOptional({ example: 'Kỹ sư phần mềm' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  occupation?: string;

  @ApiPropertyOptional({ example: 'Hà Nội' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  biography?: string;

  @ApiPropertyOptional()
  @IsOptional()
  generation?: number;
}
