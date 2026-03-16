import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Redis as UpstashRedis } from '@upstash/redis';

const CACHE_KEY_FULL = 'tree:chart:full';
const CACHE_KEY_STATS = 'tree:stats';
const CACHE_TTL = 3600; // 1 hour
const MAX_SUBTREE_GENERATIONS = 4;

export interface FamilyChartNode {
  id: string;
  rels: {
    spouses?: string[];
    father?: string;
    mother?: string;
    children?: string[];
  };
  data: {
    gender: string;
    fn: string; // first name
    ln: string; // last name (surname)
    birthday?: string;
    avatar?: string;
    generation?: number;
    desc?: string;
  };
}

@Injectable()
export class TreeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
  ) { }

  // ─── Full chart ───────────────────────────────────────────────────────────

  async getFamilyTreeChart(): Promise<{ nodes: FamilyChartNode[]; generatedAt: string }> {
    const cached = await this.redis.get<any>(CACHE_KEY_FULL);
    if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;
    return this.buildAndCache();
  }

  async regenerateFamilyTreeChart() {
    await this.redis.del(CACHE_KEY_FULL);
    return this.buildAndCache();
  }

  private async buildAndCache() {
    const members = await this.prisma.member.findMany({
      include: {
        profile: true,
        parent_relationships: { include: { child: true } },
        child_relationships: { include: { parent: true } },
      },
    });

    const nodes: FamilyChartNode[] = members.map((m) => this.memberToNode(m));

    const result = { nodes, generatedAt: new Date().toISOString() };
    await this.redis.set(CACHE_KEY_FULL, JSON.stringify(result), { ex: CACHE_TTL });
    return result;
  }

  // ─── Subtree (4-generation BFS from root) ─────────────────────────────────

  async getFamilySubTreeChart(memberId: string) {
    const root = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: {
        profile: true,
        parent_relationships: true,
        child_relationships: true,
      },
    });
    if (!root) throw new NotFoundException(`Member ${memberId} not found`);

    const visitedIds = new Set<string>([memberId]);
    const queue: Array<{ id: string; gen: number }> = [{ id: memberId, gen: 0 }];
    const allMemberIds: string[] = [memberId];

    while (queue.length > 0) {
      const { id, gen } = queue.shift()!;
      if (gen >= MAX_SUBTREE_GENERATIONS - 1) continue;

      const member = await this.prisma.member.findUnique({
        where: { id },
        include: { parent_relationships: true, child_relationships: true },
      });
      if (!member) continue;

      // Add spouses (same generation)
      const spouseRels = await this.prisma.memberRelationship.findMany({
        where: { OR: [{ parent_id: id }, { child_id: id }], type: 'SPOUSE' },
      });
      for (const rel of (spouseRels || [])) {
        const spouseId = rel.parent_id === id ? rel.child_id : rel.parent_id;
        if (!visitedIds.has(spouseId)) {
          visitedIds.add(spouseId);
          allMemberIds.push(spouseId);
          queue.push({ id: spouseId, gen }); // same generation
        }
      }

      // Add children (next generation)
      for (const childRel of member.parent_relationships) {
        if (!visitedIds.has(childRel.child_id)) {
          visitedIds.add(childRel.child_id);
          allMemberIds.push(childRel.child_id);
          queue.push({ id: childRel.child_id, gen: gen + 1 });
        }
      }

      // Add siblings (same generation — share same parent)
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
        parent_relationships: { include: { child: true } },
        child_relationships: { include: { parent: true } },
      },
    });

    const nodes = subtreeMembers.map((m) => this.memberToNode(m));
    return { nodes, generatedAt: new Date().toISOString() };
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  async getStats() {
    const cached = await this.redis.get<any>(CACHE_KEY_STATS);
    if (cached) {
      const report = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return { ...report, cacheStatus: 'hit' };
    }

    const [totalMembers, deceasedCount, maxGen] = await Promise.all([
      this.prisma.member.count(),
      this.prisma.member.count({ where: { deathDate: { not: null } } }),
      this.prisma.profile.aggregate({ _max: { generation: true } }),
    ]);

    const report = {
      totalMembers,
      totalGenerations: maxGen._max.generation || 0,
      deceased: deceasedCount,
      generatedAt: new Date().toISOString(),
    };

    return { ...report, cacheStatus: 'miss' };
  }

  // ─── Tree CRUD ────────────────────────────────────────────────────────────

  async getAllTrees() {
    return this.prisma.tree.findMany({ orderBy: { created_at: 'desc' } });
  }

  async getHomeTrees() {
    return this.prisma.tree.findMany({ where: { show: true }, orderBy: { created_at: 'desc' } });
  }

  async getTreeById(id: string) {
    const tree = await this.prisma.tree.findUnique({ where: { id } });
    if (!tree) throw new NotFoundException(`Tree ${id} not found`);
    return tree;
  }

  async createTree(data: { title?: string; description?: string; image?: string; owner_id: string; show?: boolean }) {
    return this.prisma.tree.create({ data });
  }

  async updateTree(id: string, data: Partial<{ title: string; description: string; image: string; show: boolean }>) {
    await this.getTreeById(id);
    return this.prisma.tree.update({ where: { id }, data });
  }

  async deleteTree(id: string) {
    await this.getTreeById(id);
    return this.prisma.tree.delete({ where: { id } });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private memberToNode(m: any): FamilyChartNode {
    const fullName: string = m.profile?.fullName || m.name || '';
    const parts = fullName.trim().split(/\s+/);
    const ln = parts[0] || ''; // Vietnamese: surname first
    const fn = parts.slice(1).join(' ') || parts[0] || '';

    const spouses = (m.child_relationships || [])
      .filter((r: any) => r.type === 'SPOUSE')
      .map((r: any) => r.parent_id)
      .concat(
        (m.parent_relationships || [])
          .filter((r: any) => r.type === 'SPOUSE')
          .map((r: any) => r.child_id),
      );

    const children = (m.parent_relationships || [])
      .filter((r: any) => r.type !== 'SPOUSE')
      .map((r: any) => r.child_id);

    const parents = (m.child_relationships || [])
      .filter((r: any) => r.type !== 'SPOUSE');

    return {
      id: m.id,
      rels: {
        spouses: spouses.length ? spouses : undefined,
        children: children.length ? children : undefined,
        father: parents.find((r: any) => r.parent?.gender === 'M')?.parent_id,
        mother: parents.find((r: any) => r.parent?.gender === 'F')?.parent_id,
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
}
