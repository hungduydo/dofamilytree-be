import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Redis as UpstashRedis } from '@upstash/redis';
import { SafeCache } from '../utils/safe-cache';

import { CACHE_KEY_FULL, CACHE_KEY_STATS, CACHE_TTL } from './tree.cache-keys';

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
    label: string;
    birthday?: string;
    avatar?: string;
    generation?: number;
    desc?: string;
  };
}

@Injectable()
export class TreeService {
  private readonly logger = new Logger(TreeService.name);

  private readonly cache: SafeCache;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
  ) {
    // Cache là tối ưu hoá, không bao giờ là hard dependency — xem SafeCache.
    this.cache = new SafeCache(this.redis, this.logger, CACHE_TTL);
  }

  // ─── Redis best-effort wrappers ───────────────────────────────────────────
  // Giữ ba wrapper mỏng để phần thân bên dưới không phải đổi; chúng uỷ thác
  // thẳng cho SafeCache (dùng chung với MembersService).

  private safeCacheGet<T>(key: string): Promise<T | null> {
    return this.cache.get<T>(key);
  }

  private safeCacheSet(key: string, value: unknown): Promise<void> {
    return this.cache.set(key, value);
  }

  private safeCacheDel(key: string): Promise<void> {
    return this.cache.del(key);
  }

  // ─── Full chart ───────────────────────────────────────────────────────────

  async getFamilyTreeChart(): Promise<{ nodes: FamilyChartNode[]; generatedAt: string }> {
    const cached = await this.safeCacheGet<{ nodes: FamilyChartNode[]; generatedAt: string }>(CACHE_KEY_FULL);
    if (cached) return cached;
    return this.buildAndCache();
  }

  async regenerateFamilyTreeChart() {
    await this.safeCacheDel(CACHE_KEY_FULL);
    return this.buildAndCache();
  }

  private async buildAndCache() {
    const members = await this.prisma.member.findMany({
      include: {
        profile: true,
        parent_relationships: true,
        child_relationships: { include: { parent: true } },
      },
      // Cột hiệu lực nằm ngay trên `members` và có index — bỏ được join sang
      // `profiles` (bảng không có index nào).
      orderBy: { generation: { sort: 'asc', nulls: 'last' } },
    });

    const nodes: FamilyChartNode[] = members.map((m) => this.memberToNode(m));

    const result = { nodes, generatedAt: new Date().toISOString() };
    await this.safeCacheSet(CACHE_KEY_FULL, result);
    return result;
  }

  // ─── Subtree (4-generation BFS from root) ─────────────────────────────────

  async getFamilySubTreeChart(memberId: string) {
    // Collect every member id in the 4-generation subtree (root + siblings at
    // the root generation + spouses + descendants) in ONE recursive CTE,
    // replacing the previous BFS that fired O(nodes × 3-4) sequential queries.
    // Same pattern as relationships.service getAncestors/getDescendants.
    // A node only expands while its generation < MAX-1 (so the deepest ring is
    // leaves), mirroring the old BFS `continue` guard. UNION (not UNION ALL)
    // dedupes (id, gen) rows so spouse/sibling cycles terminate.
    const maxDepth = MAX_SUBTREE_GENERATIONS - 1;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE sub AS (
        SELECT id, 0 AS gen
        FROM members
        WHERE id = ${memberId}::uuid

        UNION

        SELECT e.next_id, e.next_gen
        FROM sub s
        JOIN LATERAL (
          -- spouse: same generation, either direction
          SELECT CASE WHEN mr.parent_id = s.id THEN mr.child_id ELSE mr.parent_id END AS next_id,
                 s.gen AS next_gen
          FROM member_relationships mr
          WHERE mr.type = 'SPOUSE'
            AND (mr.parent_id = s.id OR mr.child_id = s.id)
            AND s.gen < ${maxDepth}

          UNION ALL

          -- children: next generation, while within the depth cap
          SELECT mr.child_id, s.gen + 1
          FROM member_relationships mr
          WHERE mr.parent_id = s.id
            AND mr.type IN ('BIOLOGICAL', 'ADOPTED')
            AND s.gen < ${maxDepth}

          UNION ALL

          -- siblings: only at the root generation (share a parent)
          SELECT mr2.child_id, s.gen
          FROM member_relationships mr1
          JOIN member_relationships mr2
            ON mr2.parent_id = mr1.parent_id
           AND mr2.type IN ('BIOLOGICAL', 'ADOPTED')
          WHERE mr1.child_id = s.id
            AND mr1.type IN ('BIOLOGICAL', 'ADOPTED')
            AND s.gen = 0
        ) e ON true
      )
      SELECT DISTINCT id FROM sub
    `;

    if (rows.length === 0) {
      throw new NotFoundException(`Member ${memberId} not found`);
    }

    const allMemberIds = rows.map((r) => r.id);

    const subtreeMembers = await this.prisma.member.findMany({
      where: { id: { in: allMemberIds } },
      include: {
        profile: true,
        parent_relationships: true,
        child_relationships: { include: { parent: true } },
      },
    });

    const nodes = subtreeMembers.map((m) => this.memberToNode(m));
    return { nodes, generatedAt: new Date().toISOString() };
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  async getStats() {
    const cached = await this.safeCacheGet<Record<string, unknown>>(CACHE_KEY_STATS);
    // Only trust the cache if it carries the full shape the dashboard needs;
    // older cache entries (or the background task's partial shape) are ignored
    // so the UI never renders with missing fields.
    if (cached && 'born20th21st' in cached && 'lastUpdate' in cached) {
      return { ...cached, cacheStatus: 'hit' };
    }

    const report = await this.computeStats();
    await this.safeCacheSet(CACHE_KEY_STATS, report);
    return { ...report, cacheStatus: 'miss' };
  }

  // Computes the full report shape the frontend dashboard expects:
  // { totalMembers, generations, deceased, born20th21st, lastUpdate }.
  // `generation`/`totalGenerations` kept as aliases for backward compat.
  async computeStats() {
    const [totalMembers, deceasedCount, maxGen, birthMembers, latestProfile] =
      await Promise.all([
        this.prisma.member.count(),
        this.prisma.member.count({ where: { deathDate: { not: null } } }),
        // Phải khớp với TasksService.handleReportGenerate — xem chú thích ở đó.
        this.prisma.member.aggregate({ _max: { generation: true } }),
        this.prisma.member.findMany({
          where: { birthDate: { not: null } },
          select: { birthDate: true },
        }),
        this.prisma.profile.aggregate({ _max: { updated_at: true } }),
      ]);

    // birthDate is a free-form String; count those parsing to a year in 1901–2100.
    let born20th21st = 0;
    for (const m of birthMembers) {
      const year = new Date(m.birthDate as string).getFullYear();
      if (year >= 1901 && year <= 2100) born20th21st++;
    }

    const generations = maxGen._max.generation || 0;
    const lastUpdate = latestProfile._max.updated_at
      ? latestProfile._max.updated_at.toISOString().split('T')[0]
      : null;

    return {
      totalMembers,
      generations,
      totalGenerations: generations, // backward-compat alias
      deceased: deceasedCount,
      born20th21st,
      lastUpdate,
      generatedAt: new Date().toISOString(),
    };
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
    const fn = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';

    // Spouses: SPOUSE records can use either side (parent_id or child_id) for each spouse
    const spouses = [
      ...(m.parent_relationships || [])
        .filter((r: any) => r.type === 'SPOUSE')
        .map((r: any) => r.child_id),
      ...(m.child_relationships || [])
        .filter((r: any) => r.type === 'SPOUSE')
        .map((r: any) => r.parent_id),
    ];

    // Children: records where this member is the parent (non-SPOUSE)
    const children = (m.parent_relationships || [])
      .filter((r: any) => r.type !== 'SPOUSE')
      .map((r: any) => r.child_id);

    // Parents: records where this member is the child (non-SPOUSE)
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
        label: fullName,
        birthday: m.birthDate || undefined,
        avatar: m.avatar_url || undefined,
        // `??` chứ không phải `||`: thế hệ 0 nếu có phải sống sót.
        generation: m.generation ?? m.profile?.generation ?? undefined,
        desc: m.deathDate ? `† ${m.deathDate}` : undefined,
      },
    };
  }
}
