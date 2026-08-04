import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TreeService } from '../../src/tree/tree.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const mockPrisma = {
  member: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  profile: {
    aggregate: jest.fn(),
  },
  memberRelationship: {
    findMany: jest.fn(),
  },
  tree: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

describe('TreeService', () => {
  let service: TreeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<TreeService>(TreeService);
    jest.clearAllMocks();
  });

  describe('getFamilyTreeChart', () => {
    it('should return cached chart from Redis if available', async () => {
      const cachedData = JSON.stringify({ nodes: [{ id: '1' }], generatedAt: new Date().toISOString() });
      mockRedis.get.mockResolvedValue(cachedData);

      const result = await service.getFamilyTreeChart();
      expect(mockRedis.get).toHaveBeenCalledWith('tree:chart:full');
      expect(mockPrisma.member.findMany).not.toHaveBeenCalled();
      expect(result.nodes).toHaveLength(1);
    });

    it('should query DB and cache when Redis miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'm1', name: 'A', gender: 'M', profile: { fullName: 'A', generation: 1 }, parent_relationships: [], child_relationships: [] },
      ]);
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.getFamilyTreeChart();
      expect(mockPrisma.member.findMany).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'tree:chart:full', expect.any(String), { ex: 3600 },
      );
      expect(result.nodes).toBeDefined();
    });

    it('falls back to DB build when Redis is unreachable (no 500)', async () => {
      mockRedis.get.mockRejectedValue(new Error('fetch failed'));
      mockRedis.set.mockRejectedValue(new Error('fetch failed'));
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'm1', name: 'A', gender: 'M', profile: { fullName: 'A', generation: 1 }, parent_relationships: [], child_relationships: [] },
      ]);

      const result = await service.getFamilyTreeChart();
      expect(mockPrisma.member.findMany).toHaveBeenCalled();
      expect(result.nodes).toHaveLength(1);
    });

    it('ưu tiên members.generation hơn profile.generation', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.member.findMany.mockResolvedValue([
        {
          id: 'm1', name: 'A', gender: 'M', generation: 4,
          profile: { fullName: 'A', generation: 1 },
          parent_relationships: [], child_relationships: [],
        },
      ]);

      const result = await service.getFamilyTreeChart();
      expect(result.nodes[0].data.generation).toBe(4);
    });

    it('giữ nguyên thế hệ 0 (?? thay vì ||)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.member.findMany.mockResolvedValue([
        {
          id: 'm1', name: 'A', gender: 'M', generation: 0,
          profile: { fullName: 'A', generation: null },
          parent_relationships: [], child_relationships: [],
        },
      ]);

      const result = await service.getFamilyTreeChart();
      expect(result.nodes[0].data.generation).toBe(0);
    });

    it('sắp xếp theo members.generation, không join sang profiles', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.member.findMany.mockResolvedValue([]);

      await service.getFamilyTreeChart();
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { generation: { sort: 'asc', nulls: 'last' } },
        }),
      );
    });
  });

  describe('regenerateFamilyTreeChart', () => {
    it('should delete Redis cache, rebuild, and re-cache', async () => {
      mockRedis.del.mockResolvedValue(1);
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockRedis.set.mockResolvedValue('OK');

      await service.regenerateFamilyTreeChart();
      expect(mockRedis.del).toHaveBeenCalledWith('tree:chart:full');
      expect(mockPrisma.member.findMany).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  describe('getFamilySubTreeChart', () => {
    it('collects subtree ids via one recursive CTE, then batch-loads node data', async () => {
      // CTE returns the member ids in the subtree
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'root' }, { id: 'child-1' }]);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'root', name: 'Root', gender: 'M', profile: { fullName: 'Root', generation: 1 }, parent_relationships: [{ child_id: 'child-1', type: 'BIOLOGICAL' }], child_relationships: [] },
        { id: 'child-1', name: 'Child1', gender: 'M', profile: { fullName: 'Child1' }, parent_relationships: [], child_relationships: [{ parent_id: 'root', type: 'BIOLOGICAL', parent: { gender: 'M' } }] },
      ]);

      const result = await service.getFamilySubTreeChart('root');
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      // single batched load, no per-node queries
      expect(mockPrisma.member.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['root', 'child-1'] } } }),
      );
      expect(result.nodes.map((n) => n.id).sort()).toEqual(['child-1', 'root']);
    });

    it('should throw NotFoundException when the CTE returns no rows (member not found)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await expect(service.getFamilySubTreeChart('bad-id')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.member.findMany).not.toHaveBeenCalled();
    });

    it('returns just the root when it has no relationships', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'root' }]);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'root', name: 'Root', gender: 'M', profile: { fullName: 'Root' }, parent_relationships: [], child_relationships: [] },
      ]);

      const result = await service.getFamilySubTreeChart('root');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('root');
    });
  });

  describe('getStats', () => {
    it('should return full dashboard stats shape from DB on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.member.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(10); // deceased
      // generations giờ đọc từ members.generation (giá trị hiệu lực), còn
      // lastUpdate vẫn từ profiles.updated_at.
      mockPrisma.member.aggregate.mockResolvedValue({ _max: { generation: 5 } });
      mockPrisma.profile.aggregate.mockResolvedValue({
        _max: { updated_at: new Date('2024-01-15T00:00:00.000Z') },
      });
      // birthDates: one in 20th–21st century range, one out of range
      mockPrisma.member.findMany.mockResolvedValue([
        { birthDate: '1990-01-01' },
        { birthDate: '1850-01-01' },
      ]);

      const result: any = await service.getStats();
      expect(result.totalMembers).toBe(50);
      expect(result.generations).toBe(5);
      expect(result.totalGenerations).toBe(5); // backward-compat alias
      expect(result.deceased).toBe(10);
      expect(result.born20th21st).toBe(1);
      expect(result.lastUpdate).toBe('2024-01-15');
      expect(result.cacheStatus).toBe('miss');
    });

    it('returns cache hit only when cached entry has the full shape', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({
        totalMembers: 10, generations: 3, deceased: 2,
        born20th21st: 5, lastUpdate: '2024-01-01', generatedAt: new Date().toISOString(),
      }));

      const result: any = await service.getStats();
      expect(result.cacheStatus).toBe('hit');
      expect(result.born20th21st).toBe(5);
      expect(mockPrisma.member.count).not.toHaveBeenCalled();
    });

    it('recomputes when cached entry is missing new fields (partial shape)', async () => {
      // Old/partial cache without born20th21st + lastUpdate must be ignored
      mockRedis.get.mockResolvedValue(JSON.stringify({
        totalMembers: 10, totalGenerations: 3, deceased: 2, generatedAt: new Date().toISOString(),
      }));
      mockPrisma.member.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
      mockPrisma.member.aggregate.mockResolvedValue({ _max: { generation: 3 } });
      mockPrisma.profile.aggregate.mockResolvedValue({ _max: { updated_at: null } });
      mockPrisma.member.findMany.mockResolvedValue([]);

      const result: any = await service.getStats();
      expect(result.cacheStatus).toBe('miss');
      expect(result.born20th21st).toBe(0);
      expect(result.lastUpdate).toBeNull();
      expect(mockPrisma.member.count).toHaveBeenCalled();
    });

    it('đọc generations từ members.generation, KHÔNG từ profiles.generation', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.member.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
      mockPrisma.member.aggregate.mockResolvedValue({ _max: { generation: 7 } });
      // profiles.generation gần như luôn null vì không ai nhập tay — nếu
      // computeStats còn đọc nó thì generations sẽ ra 0.
      mockPrisma.profile.aggregate.mockResolvedValue({ _max: { updated_at: null } });
      mockPrisma.member.findMany.mockResolvedValue([]);

      const result: any = await service.getStats();
      expect(mockPrisma.member.aggregate).toHaveBeenCalledWith({ _max: { generation: true } });
      expect(result.generations).toBe(7);
    });
  });

  describe('Tree CRUD', () => {
    it('getAllTrees should return all tree records', async () => {
      mockPrisma.tree.findMany.mockResolvedValue([{ id: 't1', title: 'Main Tree' }]);
      const result = await service.getAllTrees();
      expect(result).toHaveLength(1);
    });

    it('getHomeTrees should return only trees with show=true', async () => {
      mockPrisma.tree.findMany.mockResolvedValue([{ id: 't1', title: 'Home Tree', show: true }]);
      const result = await service.getHomeTrees();
      expect(mockPrisma.tree.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { show: true } }),
      );
    });

    it('createTree should create and return tree', async () => {
      mockPrisma.tree.create.mockResolvedValue({ id: 't2', title: 'New Branch' });
      const result = await service.createTree({ title: 'New Branch', show: false, owner_id: 'user-1' });
      expect(result).toHaveProperty('title', 'New Branch');
    });

    it('updateTree should update and return tree', async () => {
      mockPrisma.tree.findUnique.mockResolvedValue({ id: 't1' });
      mockPrisma.tree.update.mockResolvedValue({ id: 't1', title: 'Updated' });
      const result = await service.updateTree('t1', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('deleteTree should throw NotFoundException when not found', async () => {
      mockPrisma.tree.findUnique.mockResolvedValue(null);
      await expect(service.deleteTree('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
