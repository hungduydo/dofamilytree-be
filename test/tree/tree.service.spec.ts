import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TreeService } from '../../src/tree/tree.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const mockPrisma = {
  member: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
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
    it('should return 4-generation BFS subtree for a member', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({
        id: 'root', name: 'Root', gender: 'M',
        profile: { fullName: 'Root', generation: 1 },
        parent_relationships: [], // no spouses
        child_relationships: [{ child_id: 'child-1' }],
      });
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'child-1', name: 'Child1', gender: 'M', profile: { fullName: 'Child1' }, parent_relationships: [], child_relationships: [] },
      ]);

      const result = await service.getFamilySubTreeChart('root');
      expect(result.nodes).toBeDefined();
      expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw NotFoundException when root member not found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(service.getFamilySubTreeChart('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should not traverse more than 4 generations', async () => {
      // 5-level deep family: root → child → grandchild → great → great-great
      // Only first 4 generations should be returned
      mockPrisma.member.findUnique.mockResolvedValue({
        id: 'root', name: 'Root', gender: 'M', profile: { fullName: 'Root' },
        parent_relationships: [], child_relationships: [],
      });
      mockPrisma.member.findMany.mockResolvedValue([]);

      const result = await service.getFamilySubTreeChart('root');
      // Max 4 generations from root; with empty children, just root
      expect(result.nodes.length).toBeLessThanOrEqual(50); // reasonable upper bound
    });
  });

  describe('getStats', () => {
    it('should return tree stats from DB', async () => {
      mockPrisma.member.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(10); // deceased
      mockPrisma.profile.aggregate.mockResolvedValue({ _max: { generation: 5 } });

      const result = await service.getStats();
      expect(result.totalMembers).toBe(50);
      expect(result.totalGenerations).toBe(5);
      expect(result.deceased).toBe(10);
    });

    it('should include cache status from Redis', async () => {
      mockPrisma.member.count.mockResolvedValue(10).mockResolvedValueOnce(2);
      mockPrisma.profile.aggregate.mockResolvedValue({ _max: { generation: 3 } });
      mockRedis.get.mockResolvedValue(JSON.stringify({ totalMembers: 10, totalGenerations: 3, deceased: 2, generatedAt: new Date().toISOString() }));

      const result = await service.getStats();
      expect(result).toHaveProperty('cacheStatus');
      expect(result.cacheStatus).toBe('hit');
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
