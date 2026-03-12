import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GravesService } from '../../src/graves/graves.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const mockPrisma = {
  cemetery: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('GravesService', () => {
  let service: GravesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GravesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GravesService>(GravesService);
    jest.clearAllMocks();
  });

  describe('createGrave', () => {
    it('should create a grave with lat/lng', async () => {
      mockPrisma.cemetery.create.mockResolvedValue({
        id: 'grave-1', name: 'Mộ Ông Nội', latitude: 10.7769, longitude: 106.7009,
      });

      const result = await service.createGrave({
        name: 'Mộ Ông Nội', latitude: 10.7769, longitude: 106.7009,
      });
      expect(result).toHaveProperty('id', 'grave-1');
      expect(result.latitude).toBe(10.7769);
    });
  });

  describe('getGraveById', () => {
    it('should return grave when found', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue({ id: 'grave-1', name: 'Test' });
      const result = await service.getGraveById('grave-1');
      expect(result).toHaveProperty('id', 'grave-1');
    });

    it('should throw NotFoundException when grave not found', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue(null);
      await expect(service.getGraveById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllGraves', () => {
    it('should return all graves', async () => {
      mockPrisma.cemetery.findMany.mockResolvedValue([
        { id: 'g1', name: 'A' }, { id: 'g2', name: 'B' },
      ]);
      const result = await service.getAllGraves({});
      expect(result).toHaveLength(2);
    });

    it('should filter by name', async () => {
      mockPrisma.cemetery.findMany.mockResolvedValue([]);
      await service.getAllGraves({ name: 'Ông' });
      expect(mockPrisma.cemetery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ name: expect.any(Object) }) }),
      );
    });
  });

  describe('getNearbyGraves', () => {
    it('should return graves within specified radius (km)', async () => {
      // Ho Chi Minh City center: 10.7769, 106.7009
      mockPrisma.cemetery.findMany.mockResolvedValue([
        { id: 'g1', name: 'Nearby Grave', latitude: 10.78, longitude: 106.70 },
        { id: 'g2', name: 'Far Grave', latitude: 20.0, longitude: 106.70 }, // should be filtered
      ]);

      const result = await service.getNearbyGraves({ lat: 10.7769, lng: 106.7009, radiusKm: 10 });
      // Only the nearby grave should pass the filter
      expect(result.every(g => g.id === 'g1' || g.id !== 'g2')).toBe(true);
    });

    it('should return empty array when no graves nearby', async () => {
      mockPrisma.cemetery.findMany.mockResolvedValue([
        { id: 'g1', latitude: 20.0, longitude: 106.70 }, // far away
      ]);
      const result = await service.getNearbyGraves({ lat: 10.7769, lng: 106.7009, radiusKm: 1 });
      expect(result).toHaveLength(0);
    });
  });

  describe('updateGrave', () => {
    it('should update grave successfully', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue({ id: 'grave-1' });
      mockPrisma.cemetery.update.mockResolvedValue({ id: 'grave-1', name: 'Updated Name' });

      const result = await service.updateGrave('grave-1', { name: 'Updated Name' });
      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException when grave not found', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue(null);
      await expect(service.updateGrave('bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteGrave', () => {
    it('should delete grave', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue({ id: 'grave-1' });
      mockPrisma.cemetery.delete.mockResolvedValue({ id: 'grave-1' });

      await service.deleteGrave('grave-1');
      expect(mockPrisma.cemetery.delete).toHaveBeenCalledWith({ where: { id: 'grave-1' } });
    });

    it('should throw NotFoundException when grave not found', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue(null);
      await expect(service.deleteGrave('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
