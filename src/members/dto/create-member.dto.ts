import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString, IsNotEmpty, MaxLength, MinLength, IsOptional, IsIn, IsUUID, IsEmail, IsArray,
} from 'class-validator';

/** Normalise roleTags coming from multipart (single value → string) or JSON into a string[]. */
export const toRoleTagsArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    // Accept a single field or a comma-separated string.
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return undefined;
};

/** Clan role values reused into Profile.committeeRole/isCommittee (THANH_VIEN = no committee role). */
export const CLAN_ROLES = ['TRUONG_TOC', 'PHO_TRUONG_TOC', 'THANH_VIEN'] as const;

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

  @ApiPropertyOptional({ enum: CLAN_ROLES, description: 'Vai trò trong tộc (map vào committeeRole/isCommittee)' })
  @IsOptional()
  @IsIn(CLAN_ROLES)
  clanRole?: string;

  @ApiPropertyOptional({ example: '0988 123 456' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'lienhe@gmail.com', description: 'Email liên hệ (khác email tài khoản)' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Chi nhánh — FK tới Tree' })
  @IsOptional()
  @IsUUID()
  tree_id?: string;

  @ApiPropertyOptional({ example: 'Con trưởng', description: 'Vị trí trong gia đình' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  familyPosition?: string;

  @ApiPropertyOptional({ type: [String], description: 'Vai trò trong dòng họ (badges)' })
  @IsOptional()
  @Transform(toRoleTagsArray)
  @IsArray()
  @IsString({ each: true })
  roleTags?: string[];
}
