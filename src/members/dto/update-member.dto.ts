import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString, IsOptional, MaxLength, MinLength, IsIn, IsUUID, IsEmail, IsArray, IsBoolean,
} from 'class-validator';
import { CLAN_ROLES, NOTABLE_SUMMARY_MAX_LENGTH, toOptionalBoolean, toRoleTagsArray } from './create-member.dto';
import { LIFE_STATUSES, LifeStatus } from '../life-status';

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

  @ApiPropertyOptional({
    enum: LIFE_STATUSES,
    description: 'Có deathDate thật ⇒ luôn DECEASED; ALIVE kèm deathDate thật ⇒ 400. Xoá deathDate KHÔNG tự đổi trạng thái.',
  })
  @IsOptional()
  @IsIn(LIFE_STATUSES)
  lifeStatus?: LifeStatus;

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

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Hiện ở GET /members/notable (public). Chỉ editor/admin đặt được.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isNotable?: boolean;

  @ApiPropertyOptional({
    maxLength: NOTABLE_SUMMARY_MAX_LENGTH,
    description:
      'Mô tả ngắn CÔNG KHAI cho người tiêu biểu (description của /members/notable). Không ghi liên lạc/địa chỉ. Chỉ editor/admin. Chuỗi rỗng ⇒ xoá.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(NOTABLE_SUMMARY_MAX_LENGTH)
  notableSummary?: string;
}
