import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString, IsNotEmpty, MaxLength, MinLength, IsOptional, IsIn, IsUUID, IsEmail, IsArray, IsBoolean,
} from 'class-validator';
import { LIFE_STATUSES, LifeStatus } from '../life-status';

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

/**
 * multipart/form-data gửi boolean dưới dạng chuỗi. `Boolean('false')` là true,
 * nên phải dịch tường minh; chuỗi lạ giữ nguyên để @IsBoolean trả 400.
 */
export const toOptionalBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

/** Trần độ dài của profile.notableSummary — đủ một hai câu cho thẻ trang chủ. */
export const NOTABLE_SUMMARY_MAX_LENGTH = 300;

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

  @ApiPropertyOptional({
    enum: LIFE_STATUSES,
    description: 'Bỏ trống ⇒ suy từ deathDate/birthDate (DECEASED hoặc UNKNOWN). Có deathDate thật ⇒ luôn DECEASED.',
  })
  @IsOptional()
  @IsIn(LIFE_STATUSES)
  lifeStatus?: LifeStatus;

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
