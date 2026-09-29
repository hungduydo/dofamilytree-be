import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { RelationshipsService } from '../relationships/relationships.service';
import { AUDIT_ENTITY, TRASH_RETENTION_DAYS } from './audit-record';
import { AuditQueryDto, TrashQueryDto } from './dto/audit.dto';
import { MemberSnapshot } from '../members/member-snapshot';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Đọc lịch sử + thùng rác, điều phối khôi phục. GHI audit nằm ở audit-record.ts. */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly relationships: RelationshipsService,
  ) {}

  async list(q: AuditQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entityType && { entity_type: q.entityType }),
      ...(q.entityId && { entity_id: q.entityId }),
      ...(q.actorId && { actor_id: q.actorId }),
      ...(q.action && { action: q.action }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const names = await this.actorNames(rows.map((r) => r.actor_id));
    return {
      data: rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        actorId: r.actor_id,
        actorName: r.actor_id ? names.get(r.actor_id) ?? null : null,
        summary: r.summary,
        before: r.before,
        after: r.after,
        createdAt: r.created_at,
        restoredAt: r.restored_at,
      })),
      total,
      page,
      pageSize,
    };
  }

  async listTrash(q: TrashQueryDto, now = new Date()) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.AuditLogWhereInput = {
      action: 'DELETE',
      restored_at: null,
      created_at: { gte: new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS) },
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        // KHÔNG kéo `before` (snapshot có thể lớn) — danh sách chỉ cần tóm tắt.
        select: { id: true, entity_type: true, entity_id: true, summary: true, actor_id: true, created_at: true },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const names = await this.actorNames(rows.map((r) => r.actor_id));
    return {
      data: rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        summary: r.summary,
        actorId: r.actor_id,
        actorName: r.actor_id ? names.get(r.actor_id) ?? null : null,
        deletedAt: r.created_at,
        expiresAt: new Date(r.created_at.getTime() + TRASH_RETENTION_DAYS * DAY_MS),
      })),
      total,
      page,
      pageSize,
    };
  }

  async restore(auditId: string, actorId: string | null, now = new Date()) {
    const row = await this.prisma.auditLog.findUnique({ where: { id: auditId } });
    if (!row || row.action !== 'DELETE') throw new NotFoundException('Không có bản ghi này trong thùng rác');
    // Đã khôi phục ⇒ markRestored trong transaction sẽ trả 409, không cần kiểm ở đây.
    if (now.getTime() - row.created_at.getTime() > TRASH_RETENTION_DAYS * DAY_MS) {
      throw new GoneException(`Đã quá ${TRASH_RETENTION_DAYS} ngày, không khôi phục được nữa`);
    }
    if (!row.before) throw new BadRequestException('Dòng xoá này không có snapshot để khôi phục');

    switch (row.entity_type) {
      case AUDIT_ENTITY.member:
        return this.members.restoreMember(row.id, row.before as unknown as MemberSnapshot, actorId);
      case AUDIT_ENTITY.relationship:
        return this.relationships.restoreRelationship(row.id, row.before as Record<string, any>, actorId);
      default:
        throw new BadRequestException(`Chưa hỗ trợ khôi phục loại "${row.entity_type}"`);
    }
  }

  /**
   * user id Supabase → tên hiển thị: tên member đã link, không có thì tên tự
   * khai lúc đăng ký. Một query cho cả trang, không gọi Supabase Auth.
   */
  private async actorNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map();
    const metas = await this.prisma.userMetadata.findMany({
      where: { user_id: { in: unique } },
      select: { user_id: true, claim_request: true, profile_member: { select: { name: true } } },
    });
    const out = new Map<string, string>();
    for (const m of metas) {
      const claimed = (m.claim_request as { fullName?: string } | null)?.fullName;
      const name = m.profile_member?.name ?? claimed;
      if (name) out.set(m.user_id, name);
    }
    return out;
  }
}
