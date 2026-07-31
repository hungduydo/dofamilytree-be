import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Relationship links inside a family-chart node (family-chart.js shape). */
export class FamilyChartRelsDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  spouses?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  father?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  mother?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  children?: string[];
}

/** Display data inside a family-chart node. */
export class FamilyChartDataDto {
  @ApiProperty({ enum: ['M', 'F', 'O', 'U'] })
  gender: string;

  @ApiProperty({ description: 'First name' })
  fn: string;

  @ApiProperty({ description: 'Last name / surname' })
  ln: string;

  @ApiProperty()
  label: string;

  @ApiPropertyOptional()
  birthday?: string;

  @ApiPropertyOptional({ format: 'uri' })
  avatar?: string;

  @ApiPropertyOptional()
  generation?: number;

  @ApiPropertyOptional()
  desc?: string;
}

/** One node of the family chart. Mirrors `FamilyChartNode` in tree.service.ts. */
export class FamilyChartNodeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: () => FamilyChartRelsDto })
  rels: FamilyChartRelsDto;

  @ApiProperty({ type: () => FamilyChartDataDto })
  data: FamilyChartDataDto;
}

/** Envelope returned by `GET /v2/tree/chart` and `GET /v2/tree/chart/:memberId`. */
export class FamilyTreeChartResponseDto {
  @ApiProperty({ type: () => [FamilyChartNodeDto] })
  nodes: FamilyChartNodeDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt: string;
}

/** Mirrors the Prisma `Tree` model. */
export class TreeRecordDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  owner_id: string;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  image: string | null;

  @ApiProperty({ default: false, description: 'Hiện trên trang chủ' })
  show: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;
}

/** Dashboard statistics returned by `GET /v2/tree/stats`. */
export class StatsResponseDto {
  @ApiProperty({ example: 120 })
  totalMembers: number;

  @ApiProperty({ example: 5 })
  generations: number;

  @ApiProperty({ example: 5, description: 'Alias của generations (backward-compat)' })
  totalGenerations: number;

  @ApiProperty({ example: 30, description: 'Số thành viên đã mất' })
  deceased: number;

  @ApiProperty({ example: 80, description: 'Sinh trong khoảng 1901–2100' })
  born20th21st: number;

  @ApiPropertyOptional({ nullable: true, example: '2026-07-31' })
  lastUpdate: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt: string;

  @ApiProperty({ enum: ['hit', 'miss'], description: 'Trạng thái Redis cache' })
  cacheStatus: string;
}
