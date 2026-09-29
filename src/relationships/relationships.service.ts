import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AUDIT_ENTITY, markRestored, recordAudit } from '../audit/audit-record';
import { QStashService } from '../queue/qstash.service';
import { runInBackground } from '../utils/run-in-background';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRelationshipDto, SearchRelationshipDto } from './dto/create-relationship.dto';
import { GenerationService } from '../generation/generation.service';
import { QUEUE_NOTIFICATION } from '../queue/queue.constants';
import { profileSelectFor } from '../members/members.select';

// Các endpoint dưới đây nhúng profile của member. Chúng KHÔNG bao giờ trả 4 cột
// liên lạc (phone/contactEmail/address/notes) — kể cả cho admin — vì nhiều route
// trong file này là @Public(). Ai cần số điện thoại thì gọi
// GET /v2/members/:id/profile, nơi có kiểm tra role thật sự.
const EMBEDDED_PROFILE = profileSelectFor(false);

@Injectable()
export class RelationshipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qstashService: QStashService,
    private readonly generationService: GenerationService,
  ) {}

  /**
   * Các luật một cạnh cha/con/vợ chồng phải thoả. Dùng chung cho thêm mới và
   * khôi phục từ thùng rác — trong lúc cạnh nằm thùng rác, người ta có thể đã
   * thêm một người cha khác, và khôi phục mù sẽ cho đứa trẻ hai người cha.
   */
  private async assertCanLink(dto: { parentId: string; childId: string; type: CreateRelationshipDto['type'] }) {
    if (dto.parentId === dto.childId) {
      throw new BadRequestException('Cannot create a relationship with oneself');
    }

    const [parent, child] = await Promise.all([
      this.prisma.member.findUnique({ where: { id: dto.parentId } }),
      this.prisma.member.findUnique({ where: { id: dto.childId } }),
    ]);

    if (!parent) throw new NotFoundException(`Parent member ${dto.parentId} not found`);
    if (!child) throw new NotFoundException(`Child member ${dto.childId} not found`);

    // A child can have at most one father and one mother — not "one parent
    // total". Enforce per-gender, not per-relationship-count, since a real
    // family tree needs both. Skipped when the parent's gender isn't
    // recorded (M/F), since role can't be reliably determined then.
    if (
      (dto.type === 'BIOLOGICAL' || dto.type === 'ADOPTED') &&
      (parent.gender === 'M' || parent.gender === 'F')
    ) {
      const existingSameGenderParent = await this.prisma.memberRelationship.findFirst({
        where: {
          child_id: dto.childId,
          type: { in: ['BIOLOGICAL', 'ADOPTED'] },
          parent: { gender: parent.gender },
        },
      });
      if (existingSameGenderParent) {
        const label = parent.gender === 'M' ? 'a father' : 'a mother';
        throw new BadRequestException(`This member already has ${label}`);
      }
    }

    const duplicate = await this.prisma.memberRelationship.findFirst({
      where: { parent_id: dto.parentId, child_id: dto.childId, type: dto.type },
    });
    if (duplicate) {
      throw new BadRequestException('This relationship already exists');
    }

    return { parent, child };
  }

  async addRelationship(dto: CreateRelationshipDto, actorId: string | null = null) {
    await this.assertCanLink(dto);

    const relationship = await this.prisma.$transaction(async (tx) => {
      const created = await tx.memberRelationship.create({
        data: {
          parent_id: dto.parentId,
          child_id: dto.childId,
          type: dto.type,
          note: dto.note,
        },
        include: {
          parent: { include: { profile: EMBEDDED_PROFILE } },
          child: { include: { profile: EMBEDDED_PROFILE } },
        },
      });
      await recordAudit(tx, {
        entityType: AUDIT_ENTITY.relationship,
        entityId: created.id,
        action: 'CREATE',
        actorId,
        summary: describe(created.type, created.parent.name, created.child.name),
        after: stripRelations(created),
      });
      return created;
    });

    runInBackground(
      this.qstashService.publish(QUEUE_NOTIFICATION, {
        type: 'NEW_RELATIONSHIP',
        message: `New relationship: ${relationship.parent.name} -> ${relationship.child.name}`,
        payload: { parentId: dto.parentId, childId: dto.childId, type: dto.type },
      }),
    );

    // Trigger chính: thêm một cạnh đổi thế hệ của cả nhánh bên dưới.
    this.generationService.enqueueRecompute();

    return relationship;
  }

  async getRelationships(memberId: string) {
    return this.prisma.memberRelationship.findMany({
      where: {
        OR: [{ parent_id: memberId }, { child_id: memberId }],
      },
      include: {
        parent: { include: { profile: EMBEDDED_PROFILE } },
        child: { include: { profile: EMBEDDED_PROFILE } },
      },
    });
  }

  async getParents(memberId: string) {
    return this.prisma.memberRelationship.findMany({
      where: {
        child_id: memberId,
        type: { in: ['BIOLOGICAL', 'ADOPTED'] },
      },
      include: { parent: { include: { profile: EMBEDDED_PROFILE } } },
    });
  }

  async getChildren(memberId: string) {
    return this.prisma.memberRelationship.findMany({
      where: {
        parent_id: memberId,
        type: { in: ['BIOLOGICAL', 'ADOPTED'] },
      },
      include: { child: { include: { profile: EMBEDDED_PROFILE } } },
    });
  }

  async getSpouses(memberId: string) {
    return this.prisma.memberRelationship.findMany({
      where: {
        OR: [{ parent_id: memberId }, { child_id: memberId }],
        type: 'SPOUSE',
      },
      include: {
        parent: { include: { profile: EMBEDDED_PROFILE } },
        child: { include: { profile: EMBEDDED_PROFILE } },
      },
    });
  }

  async getAncestors(memberId: string): Promise<any[]> {
    // Recursive CTE: walk up the parent chain
    const result = await this.prisma.$queryRaw<any[]>`
      WITH RECURSIVE ancestors AS (
        SELECT m.id, m.name, m.gender, m.avatar_url, 1 as depth
        FROM member_relationships mr
        JOIN members m ON m.id = mr.parent_id
        WHERE mr.child_id = ${memberId}::uuid
          AND mr.type IN ('BIOLOGICAL', 'ADOPTED')

        UNION ALL

        SELECT m.id, m.name, m.gender, m.avatar_url, a.depth + 1
        FROM member_relationships mr
        JOIN members m ON m.id = mr.parent_id
        JOIN ancestors a ON a.id = mr.child_id
        WHERE mr.type IN ('BIOLOGICAL', 'ADOPTED')
          AND a.depth < 20
      )
      SELECT DISTINCT id, name, gender, avatar_url, depth FROM ancestors ORDER BY depth
    `;
    return result;
  }

  async getDescendants(memberId: string): Promise<any[]> {
    // Recursive CTE: walk down the child chain
    const result = await this.prisma.$queryRaw<any[]>`
      WITH RECURSIVE descendants AS (
        SELECT m.id, m.name, m.gender, m.avatar_url, 1 as depth
        FROM member_relationships mr
        JOIN members m ON m.id = mr.child_id
        WHERE mr.parent_id = ${memberId}::uuid
          AND mr.type IN ('BIOLOGICAL', 'ADOPTED')

        UNION ALL

        SELECT m.id, m.name, m.gender, m.avatar_url, d.depth + 1
        FROM member_relationships mr
        JOIN members m ON m.id = mr.child_id
        JOIN descendants d ON d.id = mr.parent_id
        WHERE mr.type IN ('BIOLOGICAL', 'ADOPTED')
          AND d.depth < 20
      )
      SELECT DISTINCT id, name, gender, avatar_url, depth FROM descendants ORDER BY depth
    `;
    return result;
  }

  async searchRelationships(dto: SearchRelationshipDto) {
    const where: any = {};

    if (dto.type) where.type = dto.type;

    if (dto.memberId) {
      if (dto.role === 'parent') {
        where.parent_id = dto.memberId;
      } else if (dto.role === 'child') {
        where.child_id = dto.memberId;
      } else if (dto.role === 'spouse') {
        where.OR = [{ parent_id: dto.memberId }, { child_id: dto.memberId }];
        where.type = 'SPOUSE';
      } else {
        where.OR = [{ parent_id: dto.memberId }, { child_id: dto.memberId }];
      }
    }

    return this.prisma.memberRelationship.findMany({
      where,
      include: {
        parent: { include: { profile: EMBEDDED_PROFILE } },
        child: { include: { profile: EMBEDDED_PROFILE } },
      },
    });
  }

  async deleteRelationship(id: string, actorId: string | null = null) {
    const rel = await this.prisma.memberRelationship.findUnique({
      where: { id },
      include: { parent: { select: { name: true } }, child: { select: { name: true } } },
    });
    if (!rel) throw new NotFoundException(`Relationship ${id} not found`);
    const deleted = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.memberRelationship.delete({ where: { id } });
      await recordAudit(tx, {
        entityType: AUDIT_ENTITY.relationship,
        entityId: id,
        action: 'DELETE',
        actorId,
        summary: `Xoá quan hệ: ${describe(rel.type, rel.parent.name, rel.child.name)}`,
        before: stripRelations(rel),
      });
      return deleted;
    });

    // Gỡ một cạnh có thể biến cả một nhánh thành gốc mới.
    this.generationService.enqueueRecompute();

    return deleted;
  }

  /** Khôi phục một cạnh từ thùng rác, giữ nguyên id. Chạy lại đủ luật của thêm mới. */
  async restoreRelationship(auditId: string, snapshot: Record<string, any>, actorId: string | null) {
    const { parent, child } = await this.assertCanLink({
      parentId: snapshot.parent_id,
      childId: snapshot.child_id,
      type: snapshot.type,
    });

    const restored = await this.prisma.$transaction(async (tx) => {
      await markRestored(tx, auditId, actorId);
      const restored = await tx.memberRelationship.create({
        data: {
          id: snapshot.id,
          parent_id: snapshot.parent_id,
          child_id: snapshot.child_id,
          type: snapshot.type,
          note: snapshot.note ?? null,
          created_at: snapshot.created_at,
        },
      });
      await recordAudit(tx, {
        entityType: AUDIT_ENTITY.relationship,
        entityId: restored.id,
        action: 'RESTORE',
        actorId,
        summary: `Khôi phục quan hệ: ${describe(restored.type, parent.name, child.name)}`,
        after: { fromAuditId: auditId },
      });
      return restored;
    });

    this.generationService.enqueueRecompute();
    return { id: restored.id, warnings: [] as string[] };
  }
}

const TYPE_LABEL: Record<string, string> = { BIOLOGICAL: 'cha/mẹ ruột', ADOPTED: 'cha/mẹ nuôi', SPOUSE: 'vợ/chồng' };

function describe(type: string, parentName: string, childName: string): string {
  return type === 'SPOUSE'
    ? `${parentName} ⇄ ${childName} (vợ/chồng)`
    : `${parentName} → ${childName} (${TYPE_LABEL[type] ?? type})`;
}

/** Chỉ giữ cột của bảng — bỏ member lồng vào (kèm profile) khỏi dòng audit. */
function stripRelations<T extends Record<string, any>>(row: T) {
  const { parent: _p, child: _c, ...rest } = row;
  return rest;
}
