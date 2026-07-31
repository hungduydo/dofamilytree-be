import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Mirrors the Prisma `Profile` model returned via `include: { profile: true }`. */
export class ProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  member_id: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  fullName: string;

  @ApiPropertyOptional({ nullable: true, example: 5 })
  generation: number | null;

  @ApiPropertyOptional({ nullable: true })
  biography: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Kỹ sư phần mềm' })
  occupation: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Hà Nội' })
  address: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Vai trò trong ban/hội đồng' })
  committeeRole: string | null;

  @ApiProperty({ default: false })
  isCommittee: boolean;

  @ApiProperty({ default: false })
  isNotable: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: string;
}

/** Mirrors the Prisma `Member` model (with optional included `profile`). */
export class MemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  private_id: string | null;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;

  @ApiPropertyOptional({ nullable: true, description: 'Tên đã bỏ dấu để tìm kiếm' })
  normalized_name: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  avatar_url: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ['M', 'F', 'O', 'U'] })
  gender: string | null;

  @ApiPropertyOptional({ nullable: true, example: '1990-01-01' })
  birthDate: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2020-12-31' })
  deathDate: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiPropertyOptional({ type: () => ProfileResponseDto, nullable: true })
  profile?: ProfileResponseDto | null;
}

/** Paginated envelope returned by `GET /v2/members`. */
export class PaginatedMembersResponseDto {
  @ApiProperty({ type: () => [MemberResponseDto] })
  data: MemberResponseDto[];

  @ApiProperty({ example: 120, description: 'Tổng số thành viên' })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;
}

/** One related member nested inside a profile's relationships. */
export class RelatedMemberDto extends MemberResponseDto {}

/** A member relationship edge as returned inside the full profile. */
export class ProfileRelationshipDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  parent_id: string;

  @ApiProperty({ format: 'uuid' })
  child_id: string;

  @ApiProperty({ enum: ['BIOLOGICAL', 'ADOPTED', 'SPOUSE'] })
  type: string;

  @ApiPropertyOptional({ nullable: true })
  note: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiPropertyOptional({ type: () => RelatedMemberDto, description: 'Có mặt cho quan hệ cha/mẹ' })
  parent?: RelatedMemberDto;

  @ApiPropertyOptional({ type: () => RelatedMemberDto, description: 'Có mặt cho quan hệ con' })
  child?: RelatedMemberDto;
}

/** Full profile returned by `GET /v2/members/:id/profile`. */
export class MemberProfileResponseDto extends MemberResponseDto {
  @ApiProperty({
    type: () => [ProfileRelationshipDto],
    description: 'Quan hệ mà member là con (chứa parent)',
  })
  parent_relationships: ProfileRelationshipDto[];

  @ApiProperty({
    type: () => [ProfileRelationshipDto],
    description: 'Quan hệ mà member là cha/mẹ (chứa child)',
  })
  child_relationships: ProfileRelationshipDto[];
}

/** Compact shape for `GET /v2/members/committee`. */
export class CommitteeMemberDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'Trưởng ban', description: 'Lấy từ profile.occupation' })
  role: string;

  @ApiProperty({ format: 'uri' })
  avatar: string;
}

/** Compact shape for `GET /v2/members/notable`. */
export class NotableMemberDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Lấy từ profile.biography' })
  description: string;

  @ApiProperty({ format: 'uri' })
  avatar: string;
}
