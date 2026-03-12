"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelationshipsService = void 0;
const common_1 = require("@nestjs/common");
const qstash_service_1 = require("../queue/qstash.service");
const prisma_service_1 = require("../prisma/prisma.service");
const queue_constants_1 = require("../queue/queue.constants");
let RelationshipsService = class RelationshipsService {
    constructor(prisma, qstashService) {
        this.prisma = prisma;
        this.qstashService = qstashService;
    }
    async addRelationship(dto) {
        if (dto.parentId === dto.childId) {
            throw new common_1.BadRequestException('Cannot create a relationship with oneself');
        }
        const [parent, child] = await Promise.all([
            this.prisma.member.findUnique({ where: { id: dto.parentId } }),
            this.prisma.member.findUnique({ where: { id: dto.childId } }),
        ]);
        if (!parent)
            throw new common_1.NotFoundException(`Parent member ${dto.parentId} not found`);
        if (!child)
            throw new common_1.NotFoundException(`Child member ${dto.childId} not found`);
        if (dto.type === 'BIOLOGICAL' || dto.type === 'ADOPTED') {
            const existingParent = await this.prisma.memberRelationship.findFirst({
                where: {
                    child_id: dto.childId,
                    type: { in: ['BIOLOGICAL', 'ADOPTED'] },
                },
            });
            if (existingParent) {
                throw new common_1.BadRequestException('A member can only have one biological or adopted parent');
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
        await this.qstashService.publish(queue_constants_1.QUEUE_NOTIFICATION, {
            type: 'NEW_RELATIONSHIP',
            message: `New relationship: ${relationship.parent.name} -> ${relationship.child.name}`,
            payload: { parentId: dto.parentId, childId: dto.childId, type: dto.type },
        });
        return relationship;
    }
    async getRelationships(memberId) {
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
    async getParents(memberId) {
        return this.prisma.memberRelationship.findMany({
            where: { child_id: memberId },
            include: { parent: { include: { profile: true } } },
        });
    }
    async getChildren(memberId) {
        return this.prisma.memberRelationship.findMany({
            where: {
                parent_id: memberId,
                type: { in: ['BIOLOGICAL', 'ADOPTED'] },
            },
            include: { child: { include: { profile: true } } },
        });
    }
    async getSpouses(memberId) {
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
    async getAncestors(memberId) {
        const result = await this.prisma.$queryRaw `
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
    async getDescendants(memberId) {
        const result = await this.prisma.$queryRaw `
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
    async searchRelationships(dto) {
        const where = {};
        if (dto.type)
            where.type = dto.type;
        if (dto.memberId) {
            if (dto.role === 'parent') {
                where.parent_id = dto.memberId;
            }
            else if (dto.role === 'child') {
                where.child_id = dto.memberId;
            }
            else if (dto.role === 'spouse') {
                where.OR = [{ parent_id: dto.memberId }, { child_id: dto.memberId }];
                where.type = 'SPOUSE';
            }
            else {
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
    async deleteRelationship(id) {
        const rel = await this.prisma.memberRelationship.findUnique({ where: { id } });
        if (!rel)
            throw new common_1.NotFoundException(`Relationship ${id} not found`);
        return this.prisma.memberRelationship.delete({ where: { id } });
    }
};
exports.RelationshipsService = RelationshipsService;
exports.RelationshipsService = RelationshipsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        qstash_service_1.QStashService])
], RelationshipsService);
//# sourceMappingURL=relationships.service.js.map