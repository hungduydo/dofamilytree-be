import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString, IsOptional, MaxLength, MinLength, IsIn, IsUUID, IsEmail, IsArray,
} from 'class-validator';
import { CLAN_ROLES, toRoleTagsArray } from './create-member.dto';

export class UpdateMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ enum: ['M', 'F', 'O', 'U'] })
  @IsOptional()
  @IsIn(['M', 'F', 'O', 'U'])
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deathDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  occupation?: string;

  @ApiPropertyOptional()
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
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  generation?: number;

  @ApiPropertyOptional({ enum: CLAN_ROLES, description: 'Vai trò trong tộc (map vào committeeRole/isCommittee)' })
  @IsOptional()
  @IsIn(CLAN_ROLES)
  clanRole?: string;

  @ApiPropertyOptional({ example: '0988 123 456' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'lienhe@gmail.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Chi nhánh — FK tới Tree' })
  @IsOptional()
  @IsUUID()
  tree_id?: string;

  @ApiPropertyOptional({ example: 'Con trưởng' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  familyPosition?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toRoleTagsArray)
  @IsArray()
  @IsString({ each: true })
  roleTags?: string[];
}
