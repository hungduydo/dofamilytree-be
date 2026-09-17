import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
  graveArea: {
    count: jest.fn(),
  },
};

const AREA_POLYGON = [
  [16.78, 107.18],
  [16.78, 107.19],
  [16.79, 107.19],
  [16.79, 107.18],
];

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
      expect(result.location).toEqual({ latitude: 10.7769, longitude: 106.7009, source: 'GRAVE' });
      expect(mockPrisma.graveArea.count).not.toHaveBeenCalled();
    });

    it('mộ chỉ có khu → vị trí là tâm khu', async () => {
      mockPrisma.graveArea.count.mockResolvedValue(1);
      mockPrisma.cemetery.create.mockResolvedValue({
        id: 'g', name: 'Mộ A', latitude: null, longitude: null, area_id: 'area-1', area: { polygon: AREA_POLYGON },
      });

      const result = await service.createGrave({ name: 'Mộ A', area_id: 'area-1' });
      expect(mockPrisma.cemetery.create.mock.calls[0][0].data).toEqual({ name: 'Mộ A', area_id: 'area-1' });
      expect(result.location?.source).toBe('AREA');
      expect(result.location?.latitude).toBeCloseTo(16.785, 9);
    });

    it('khu không tồn tại → 400, không ghi', async () => {
      mockPrisma.graveArea.count.mockResolvedValue(0);
      await expect(service.createGrave({ name: 'Mộ A', area_id: 'missing' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.cemetery.create).not.toHaveBeenCalled();
    });
  });

  describe('getGraveById', () => {
    it('should return grave when found', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue({ id: 'grave-1', name: 'Test', latitude: null, longitude: null });
      const result = await service.getGraveById('grave-1');
      expect(result).toHaveProperty('id', 'grave-1');
      expect(result.location).toBeNull();
    });

    it('should throw NotFoundException when grave not found', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue(null);
      await expect(service.getGraveById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllGraves', () => {
    it('should return all graves', async () => {
      mockPrisma.cemetery.findMany.mockResolvedValue([
        { id: 'g1', name: 'A', latitude: null, longitude: null }, { id: 'g2', name: 'B', latitude: null, longitude: null },
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
    it('lọc theo vị trí hiển thị — gồm cả mộ chỉ có khu', async () => {
      mockPrisma.cemetery.findMany.mockResolvedValue([
        { id: 'near', latitude: 16.786, longitude: 107.186 },
        { id: 'far', latitude: 20.0, longitude: 106.7 },
        { id: 'in-area', latitude: null, longitude: null, area: { polygon: AREA_POLYGON } },
        { id: 'unmapped-area', latitude: null, longitude: null, area: { polygon: null } },
      ]);

      const result = await service.getNearbyGraves({ lat: 16.785, lng: 107.185, radiusKm: 1 });
      expect(result.map((g) => g.id)).toEqual(['near', 'in-area']);
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
      mockPrisma.cemetery.findUnique.mockResolvedValue({ id: 'grave-1', latitude: null, longitude: null });
      mockPrisma.cemetery.update.mockResolvedValue({ id: 'grave-1', name: 'Updated Name', latitude: null, longitude: null });

      const result = await service.updateGrave('grave-1', { name: 'Updated Name' });
      expect(result.name).toBe('Updated Name');
    });

    it('xoá toạ độ, gỡ khu, xoá ảnh bằng null', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue({ id: 'g', latitude: 16.7, longitude: 107.1 });
      mockPrisma.cemetery.update.mockResolvedValue({ id: 'g', latitude: null, longitude: null });
      const dto = { latitude: null, longitude: null, area_id: null, photoUrl: null };

      const result = await service.updateGrave('g', dto);
      expect(mockPrisma.cemetery.update.mock.calls[0][0].data).toEqual(dto);
      expect(mockPrisma.graveArea.count).not.toHaveBeenCalled();
      expect(result.location).toBeNull();
    });

    it('should throw NotFoundException when grave not found', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue(null);
      await expect(service.updateGrave('bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteGrave', () => {
    it('should delete grave', async () => {
      mockPrisma.cemetery.findUnique.mockResolvedValue({ id: 'grave-1', latitude: null, longitude: null });
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
