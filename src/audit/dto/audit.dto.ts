import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AUDIT_ACTIONS, AUDIT_ENTITY } from '../audit-record';

const ENTITIES = Object.values(AUDIT_ENTITY);

export class AuditQueryDto {
  @ApiPropertyOptional({ enum: ENTITIES })
  @IsOptional()
  @IsIn(ENTITIES)
  entityType?: string;

  @ApiPropertyOptional({ description: 'Lịch sử của MỘT bản ghi (vd. trang chi tiết member)' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo người sửa (user id Supabase)' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ enum: AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS as unknown as string[])
  action?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class TrashQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class AuditEntryDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ENTITIES }) entityType: string;
  @ApiProperty() entityId: string;
  @ApiProperty({ enum: AUDIT_ACTIONS }) action: string;
  @ApiPropertyOptional({ nullable: true }) actorId: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Tên member đã link của người sửa, hoặc tên tự khai lúc đăng ký' })
  actorName: string | null;
  @ApiPropertyOptional({ nullable: true }) summary: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'UPDATE: chỉ field đổi. DELETE: snapshot khôi phục.' })
  before: unknown;
  @ApiPropertyOptional({ nullable: true }) after: unknown;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({ nullable: true }) restoredAt: Date | null;
}

export class PaginatedAuditDto {
  @ApiProperty({ type: [AuditEntryDto] }) data: AuditEntryDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class TrashItemDto {
  @ApiProperty({ description: 'id dòng audit — dùng cho POST /audit/trash/:id/restore' }) id: string;
  @ApiProperty({ enum: ENTITIES }) entityType: string;
  @ApiProperty() entityId: string;
  @ApiPropertyOptional({ nullable: true }) summary: string | null;
  @ApiPropertyOptional({ nullable: true }) actorId: string | null;
  @ApiPropertyOptional({ nullable: true }) actorName: string | null;
  @ApiProperty() deletedAt: Date;
  @ApiProperty({ description: 'Sau thời điểm này không khôi phục được nữa' }) expiresAt: Date;
}

export class PaginatedTrashDto {
  @ApiProperty({ type: [TrashItemDto] }) data: TrashItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class RestoreResultDto {
  @ApiProperty({ description: 'id bản ghi đã khôi phục (giữ nguyên id cũ)' }) id: string;
  @ApiProperty({ type: [String], description: 'Phần không dựng lại được (vd. người bên kia quan hệ đã bị xoá)' })
  warnings: string[];
}
