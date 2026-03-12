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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreeService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const CACHE_KEY_FULL = 'tree:chart:full';
const CACHE_KEY_STATS = 'tree:stats';
const CACHE_TTL = 3600;
const MAX_SUBTREE_GENERATIONS = 4;
let TreeService = class TreeService {
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    async getFamilyTreeChart() {
        const cached = await this.redis.get(CACHE_KEY_FULL);
        if (cached)
            return JSON.parse(cached);
        return this.buildAndCache();
    }
    async regenerateFamilyTreeChart() {
        await this.redis.del(CACHE_KEY_FULL);
        return this.buildAndCache();
    }
    async buildAndCache() {
        const members = await this.prisma.member.findMany({
            include: {
                profile: true,
                parent_relationships: { include: { parent: true } },
                child_relationships: { include: { child: true } },
            },
        });
        const nodes = members.map((m) => this.memberToNode(m));
        const result = { nodes, generatedAt: new Date().toISOString() };
        await this.redis.set(CACHE_KEY_FULL, JSON.stringify(result), 'EX', CACHE_TTL);
        return result;
    }
    async getFamilySubTreeChart(memberId) {
        const root = await this.prisma.member.findUnique({
            where: { id: memberId },
            include: {
                profile: true,
                parent_relationships: true,
                child_relationships: true,
            },
        });
        if (!root)
            throw new common_1.NotFoundException(`Member ${memberId} not found`);
        const visitedIds = new Set([memberId]);
        const queue = [{ id: memberId, gen: 0 }];
        const allMemberIds = [memberId];
        while (queue.length > 0) {
            const { id, gen } = queue.shift();
            if (gen >= MAX_SUBTREE_GENERATIONS - 1)
                continue;
            const member = await this.prisma.member.findUnique({
                where: { id },
                include: { parent_relationships: true, child_relationships: true },
            });
            if (!member)
                continue;
            const spouseRels = await this.prisma.memberRelationship.findMany({
                where: { OR: [{ parent_id: id }, { child_id: id }], type: 'SPOUSE' },
            });
            for (const rel of (spouseRels || [])) {
                const spouseId = rel.parent_id === id ? rel.child_id : rel.parent_id;
                if (!visitedIds.has(spouseId)) {
                    visitedIds.add(spouseId);
                    allMemberIds.push(spouseId);
                    queue.push({ id: spouseId, gen });
                }
            }
            for (const childRel of member.parent_relationships) {
                if (!visitedIds.has(childRel.child_id)) {
                    visitedIds.add(childRel.child_id);
                    allMemberIds.push(childRel.child_id);
                    queue.push({ id: childRel.child_id, gen: gen + 1 });
                }
            }
            if (gen === 0) {
                const parentRels = await this.prisma.memberRelationship.findMany({
                    where: { child_id: id, type: { in: ['BIOLOGICAL', 'ADOPTED'] } },
                });
                for (const parentRel of (parentRels || [])) {
                    const siblings = await this.prisma.memberRelationship.findMany({
                        where: { parent_id: parentRel.parent_id, type: { in: ['BIOLOGICAL', 'ADOPTED'] } },
                    });
                    for (const sib of siblings) {
                        if (!visitedIds.has(sib.child_id)) {
                            visitedIds.add(sib.child_id);
                            allMemberIds.push(sib.child_id);
                            queue.push({ id: sib.child_id, gen });
                        }
                    }
                }
            }
        }
        const subtreeMembers = await this.prisma.member.findMany({
            where: { id: { in: allMemberIds } },
            include: {
                profile: true,
                parent_relationships: true,
                child_relationships: true,
            },
        });
        const nodes = subtreeMembers.map((m) => this.memberToNode(m));
        return { nodes, generatedAt: new Date().toISOString() };
    }
    async getStats() {
        const [totalMembers, deceasedCount, maxGen] = await Promise.all([
            this.prisma.member.count(),
            this.prisma.member.count({ where: { deathDate: { not: null } } }),
            this.prisma.profile.aggregate({ _max: { generation: true } }),
        ]);
        const cacheExists = await this.redis.get(CACHE_KEY_FULL);
        return {
            totalMembers,
            totalGenerations: maxGen._max.generation || 0,
            deceased: deceasedCount,
            cacheStatus: cacheExists ? 'hit' : 'miss',
            generatedAt: new Date().toISOString(),
        };
    }
    async getAllTrees() {
        return this.prisma.tree.findMany({ orderBy: { created_at: 'desc' } });
    }
    async getHomeTrees() {
        return this.prisma.tree.findMany({ where: { show: true }, orderBy: { created_at: 'desc' } });
    }
    async getTreeById(id) {
        const tree = await this.prisma.tree.findUnique({ where: { id } });
        if (!tree)
            throw new common_1.NotFoundException(`Tree ${id} not found`);
        return tree;
    }
    async createTree(data) {
        return this.prisma.tree.create({ data });
    }
    async updateTree(id, data) {
        await this.getTreeById(id);
        return this.prisma.tree.update({ where: { id }, data });
    }
    async deleteTree(id) {
        await this.getTreeById(id);
        return this.prisma.tree.delete({ where: { id } });
    }
    memberToNode(m) {
        const fullName = m.profile?.fullName || m.name || '';
        const parts = fullName.trim().split(/\s+/);
        const ln = parts[0] || '';
        const fn = parts.slice(1).join(' ') || parts[0] || '';
        const spouses = (m.child_relationships || [])
            .filter((r) => r.type === 'SPOUSE')
            .map((r) => r.parent_id)
            .concat((m.parent_relationships || [])
            .filter((r) => r.type === 'SPOUSE')
            .map((r) => r.child_id));
        const children = (m.parent_relationships || [])
            .filter((r) => r.type !== 'SPOUSE')
            .map((r) => r.child_id);
        const parents = (m.child_relationships || [])
            .filter((r) => r.type !== 'SPOUSE');
        return {
            id: m.id,
            rels: {
                spouses: spouses.length ? spouses : undefined,
                children: children.length ? children : undefined,
                father: parents.find((r) => r.parent?.gender === 'M')?.parent_id,
                mother: parents.find((r) => r.parent?.gender === 'F')?.parent_id,
            },
            data: {
                gender: m.gender || 'U',
                fn,
                ln,
                birthday: m.birthDate || undefined,
                avatar: m.avatar_url || undefined,
                generation: m.profile?.generation || undefined,
                desc: m.deathDate ? `† ${m.deathDate}` : undefined,
            },
        };
    }
};
exports.TreeService = TreeService;
exports.TreeService = TreeService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)('REDIS_CLIENT')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Function])
], TreeService);
//# sourceMappingURL=tree.service.js.map