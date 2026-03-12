import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { QStashService } from '../queue/qstash.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRelationshipDto, SearchRelationshipDto } from './dto/create-relationship.dto';
import { QUEUE_NOTIFICATION } from '../queue/queue.constants';

@Injectable()
export class RelationshipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qstashService: QStashService,
  ) {}

  async addRelationship(dto: CreateRelationshipDto) {
    if (dto.parentId === dto.childId) {
      throw new BadRequestException('Cannot create a relationship with oneself');
    }

    const [parent, child] = await Promise.all([
      this.prisma.member.findUnique({ where: { id: dto.parentId } }),
      this.prisma.member.findUnique({ where: { id: dto.childId } }),
    ]);

    if (!parent) throw new NotFoundException(`Parent member ${dto.parentId} not found`);
    if (!child) throw new NotFoundException(`Child member ${dto.childId} not found`);

    // For BIOLOGICAL/ADOPTED: each member can have at most 1 parent
    if (dto.type === 'BIOLOGICAL' || dto.type === 'ADOPTED') {
      const existingParent = await this.prisma.memberRelationship.findFirst({
        where: {
          child_id: dto.childId,
          type: { in: ['BIOLOGICAL', 'ADOPTED'] },
        },
      });
      if (existingParent) {
        throw new BadRequestException('A member can only have one biological or adopted parent');
      }
    }

    const relationship = await this.prisma.memberRelationship.create({
      data: {
        parent_id: dto.parentId,
        child_id: dto.childId,
        type: dto.type,
        note: dto.note,
      },
      include: {
        parent: { include: { profile: true } },
        child: { include: { profile: true } },
      },
    });

    await this.qstashService.publish(QUEUE_NOTIFICATION, {
      type: 'NEW_RELATIONSHIP',
      message: `New relationship: ${relationship.parent.name} -> ${relationship.child.name}`,
      payload: { parentId: dto.parentId, childId: dto.childId, type: dto.type },
    });

    return relationship;
  }

  async getRelationships(memberId: string) {
    return this.prisma.memberRelationship.findMany({
      where: {
        OR: [{ parent_id: memberId }, { child_id: memberId }],
      },
      include: {
        parent: { include: { profile: true } },
        child: { include: { profile: true } },
      },
    });
  }

  async getParents(memberId: string) {
    return this.prisma.memberRelationship.findMany({
      where: { child_id: memberId },
      include: { parent: { include: { profile: true } } },
    });
  }

  async getChildren(memberId: string) {
    return this.prisma.memberRelationship.findMany({
      where: {
        parent_id: memberId,
        type: { in: ['BIOLOGICAL', 'ADOPTED'] },
      },
      include: { child: { include: { profile: true } } },
    });
  }

  async getSpouses(memberId: string) {
    return this.prisma.memberRelationship.findMany({
      where: {
        OR: [{ parent_id: memberId }, { child_id: memberId }],
        type: 'SPOUSE',
      },
      include: {
        parent: { include: { profile: true } },
        child: { include: { profile: true } },
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
        parent: { include: { profile: true } },
        child: { include: { profile: true } },
      },
    });
  }

  async deleteRelationship(id: string) {
    const rel = await this.prisma.memberRelationship.findUnique({ where: { id } });
    if (!rel) throw new NotFoundException(`Relationship ${id} not found`);
    return this.prisma.memberRelationship.delete({ where: { id } });
  }
}
