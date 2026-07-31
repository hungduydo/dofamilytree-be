import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberResponseDto } from '../../members/dto/member-response.dto';

/**
 * A `MemberRelationship` row with the related member(s) included.
 * `parent` and/or `child` are present depending on the endpoint's `include`.
 */
export class MemberRelationshipResponseDto {
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

  @ApiPropertyOptional({ type: () => MemberResponseDto })
  parent?: MemberResponseDto;

  @ApiPropertyOptional({ type: () => MemberResponseDto })
  child?: MemberResponseDto;
}

/**
 * A node returned by the ancestors/descendants recursive CTE.
 * Flat shape: `{ id, name, gender, avatar_url, depth }`.
 */
export class LineageMemberDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true, enum: ['M', 'F', 'O', 'U'] })
  gender: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  avatar_url: string | null;

  @ApiProperty({ example: 1, description: 'Số thế hệ cách member gốc' })
  depth: number;
}
