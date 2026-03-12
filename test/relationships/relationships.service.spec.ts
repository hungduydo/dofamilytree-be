import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RelationshipsService } from '../../src/relationships/relationships.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getQueueToken } from '@nestjs/bull';
import { QUEUE_NOTIFICATION } from '@src/queue/queue.constants';

const mockPrisma = {
  member: {
    findUnique: jest.fn(),
  },
  memberRelationship: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockNotificationQueue = { add: jest.fn() };

describe('RelationshipsService', () => {
  let service: RelationshipsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationshipsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(QUEUE_NOTIFICATION), useValue: mockNotificationQueue },
      ],
    }).compile();

    service = module.get<RelationshipsService>(RelationshipsService);
    jest.clearAllMocks();
  });

  describe('addRelationship', () => {
    it('should create BIOLOGICAL relationship successfully', async () => {
      mockPrisma.member.findUnique
        .mockResolvedValueOnce({ id: 'parent-1' })
        .mockResolvedValueOnce({ id: 'child-1' });
      mockPrisma.memberRelationship.findFirst.mockResolvedValue(null);
      mockPrisma.memberRelationship.create.mockResolvedValue({
        id: 'rel-1', parent_id: 'parent-1', child_id: 'child-1', type: 'BIOLOGICAL',
      });

      const result = await service.addRelationship({ parentId: 'parent-1', childId: 'child-1', type: 'BIOLOGICAL' });
      expect(result).toHaveProperty('id', 'rel-1');
    });

    it('should throw BadRequestException on self-relation', async () => {
      await expect(
        service.addRelationship({ parentId: 'same-id', childId: 'same-id', type: 'BIOLOGICAL' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when parent member not found', async () => {
      mockPrisma.member.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.addRelationship({ parentId: 'no-exist', childId: 'child-1', type: 'BIOLOGICAL' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when child already has a parent (BIOLOGICAL/ADOPTED)', async () => {
      mockPrisma.member.findUnique
        .mockResolvedValueOnce({ id: 'parent-1' })
        .mockResolvedValueOnce({ id: 'child-1' });
      mockPrisma.memberRelationship.findFirst.mockResolvedValue({
        id: 'existing-rel', type: 'BIOLOGICAL',
      });

      await expect(
        service.addRelationship({ parentId: 'parent-1', childId: 'child-1', type: 'BIOLOGICAL' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow SPOUSE relationship regardless of existing parents', async () => {
      mockPrisma.member.findUnique
        .mockResolvedValueOnce({ id: 'member-1' })
        .mockResolvedValueOnce({ id: 'member-2' });
      mockPrisma.memberRelationship.create.mockResolvedValue({
        id: 'rel-2', parent_id: 'member-1', child_id: 'member-2', type: 'SPOUSE',
      });

      const result = await service.addRelationship({ parentId: 'member-1', childId: 'member-2', type: 'SPOUSE' });
      expect(result.type).toBe('SPOUSE');
    });

    it('should queue notification after adding relationship', async () => {
      mockPrisma.member.findUnique
        .mockResolvedValueOnce({ id: 'parent-1' })
        .mockResolvedValueOnce({ id: 'child-1' });
      mockPrisma.memberRelationship.findFirst.mockResolvedValue(null);
      mockPrisma.memberRelationship.create.mockResolvedValue({
        id: 'rel-3', parent_id: 'parent-1', child_id: 'child-1', type: 'BIOLOGICAL',
      });

      await service.addRelationship({ parentId: 'parent-1', childId: 'child-1', type: 'BIOLOGICAL' });
      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'NEW_RELATIONSHIP' }),
      );
    });
  });

  describe('getRelationships', () => {
    it('should return all relationships for a member (as parent and child)', async () => {
      mockPrisma.memberRelationship.findMany.mockResolvedValue([
        { id: 'r1', parent_id: 'member-1', child_id: 'child-1', type: 'BIOLOGICAL' },
        { id: 'r2', parent_id: 'parent-1', child_id: 'member-1', type: 'BIOLOGICAL' },
      ]);

      const result = await service.getRelationships('member-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getParents', () => {
    it('should return only parents of a member', async () => {
      mockPrisma.memberRelationship.findMany.mockResolvedValue([
        { id: 'r1', parent_id: 'parent-1', child_id: 'member-1', type: 'BIOLOGICAL', parent: { id: 'parent-1', name: 'Father' } },
      ]);

      const result = await service.getParents('member-1');
      expect(result).toHaveLength(1);
      expect(result[0].parent).toHaveProperty('name', 'Father');
    });
  });

  describe('getChildren', () => {
    it('should return only children of a member', async () => {
      mockPrisma.memberRelationship.findMany.mockResolvedValue([
        { id: 'r1', parent_id: 'member-1', child_id: 'child-1', type: 'BIOLOGICAL', child: { id: 'child-1', name: 'Son' } },
      ]);

      const result = await service.getChildren('member-1');
      expect(result).toHaveLength(1);
      expect(result[0].child).toHaveProperty('name', 'Son');
    });
  });

  describe('getSpouses', () => {
    it('should return spouse relationships (bidirectional)', async () => {
      mockPrisma.memberRelationship.findMany.mockResolvedValue([
        { id: 'r1', parent_id: 'member-1', child_id: 'spouse-1', type: 'SPOUSE' },
        { id: 'r2', parent_id: 'spouse-2', child_id: 'member-1', type: 'SPOUSE' },
      ]);

      const result = await service.getSpouses('member-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getAncestors', () => {
    it('should return all ancestors (recursive CTE)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'grandpa', name: 'Grandpa' },
        { id: 'father', name: 'Father' },
      ]);

      const result = await service.getAncestors('member-1');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when member has no parents', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await service.getAncestors('member-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('getDescendants', () => {
    it('should return all descendants (recursive CTE)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'child-1', name: 'Son' },
        { id: 'grandchild-1', name: 'Grandson' },
      ]);

      const result = await service.getDescendants('member-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('searchRelationships', () => {
    it('should filter by type BIOLOGICAL', async () => {
      mockPrisma.memberRelationship.findMany.mockResolvedValue([
        { id: 'r1', type: 'BIOLOGICAL' },
      ]);

      const result = await service.searchRelationships({ type: 'BIOLOGICAL' });
      expect(mockPrisma.memberRelationship.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: 'BIOLOGICAL' }) }),
      );
      expect(result).toHaveLength(1);
    });

    it('should filter by memberId and role=parent', async () => {
      mockPrisma.memberRelationship.findMany.mockResolvedValue([{ id: 'r1' }]);

      await service.searchRelationships({ memberId: 'member-1', role: 'parent' });
      expect(mockPrisma.memberRelationship.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ parent_id: 'member-1' }),
        }),
      );
    });

    it('should filter by memberId and role=child', async () => {
      mockPrisma.memberRelationship.findMany.mockResolvedValue([]);

      await service.searchRelationships({ memberId: 'member-1', role: 'child' });
      expect(mockPrisma.memberRelationship.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ child_id: 'member-1' }),
        }),
      );
    });
  });

  describe('deleteRelationship', () => {
    it('should delete relationship by id', async () => {
      mockPrisma.memberRelationship.findUnique.mockResolvedValue({ id: 'rel-1' });
      mockPrisma.memberRelationship.delete.mockResolvedValue({ id: 'rel-1' });

      await service.deleteRelationship('rel-1');
      expect(mockPrisma.memberRelationship.delete).toHaveBeenCalledWith({ where: { id: 'rel-1' } });
    });

    it('should throw NotFoundException when relationship not found', async () => {
      mockPrisma.memberRelationship.findUnique.mockResolvedValue(null);
      await expect(service.deleteRelationship('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
