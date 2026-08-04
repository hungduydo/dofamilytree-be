import { Test, TestingModule } from '@nestjs/testing';
import { GenerationService } from '../../src/generation/generation.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { QUEUE_GENERATION_RECOMPUTE } from '../../src/queue/queue.constants';
import { CACHE_KEY_FULL, CACHE_KEY_STATS } from '../../src/tree/tree.cache-keys';

const mockPrisma = {
  member: { findMany: jest.fn() },
  memberRelationship: { findMany: jest.fn() },
  profile: { findMany: jest.fn() },
  $executeRaw: jest.fn(),
};

const mockQStashService = { publish: jest.fn().mockResolvedValue({}) };
const mockRedis = { del: jest.fn().mockResolvedValue(1) };

/** Đọc lại hai mảng đã truyền vào `$executeRaw` (tagged template: values là arg 2+). */
function capturedArrays(): { ids: string[]; gens: number[] } {
  const args = mockPrisma.$executeRaw.mock.calls[0];
  return { ids: args[1], gens: args[2] };
}

describe('GenerationService', () => {
  let service: GenerationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QStashService, useValue: mockQStashService },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<GenerationService>(GenerationService);
    jest.clearAllMocks();

    mockPrisma.member.findMany.mockResolvedValue([{ id: 'A' }, { id: 'B' }]);
    mockPrisma.memberRelationship.findMany.mockResolvedValue([
      { parent_id: 'A', child_id: 'B', type: 'BIOLOGICAL' },
    ]);
    mockPrisma.profile.findMany.mockResolvedValue([]);
    mockPrisma.$executeRaw.mockResolvedValue(2);
  });

  describe('recomputeAll', () => {
    it('ghi hai mảng unnest khớp index theo đúng thế hệ đã tính', async () => {
      const result = await service.recomputeAll();

      const { ids, gens } = capturedArrays();
      expect(ids).toHaveLength(gens.length);
      expect(Object.fromEntries(ids.map((id, i) => [id, gens[i]]))).toEqual({ A: 1, B: 2 });
      expect(result).toMatchObject({ members: 2, updated: 2, warnings: [] });
      expect(typeof result.durationMs).toBe('number');
    });

    it('tách đúng cạnh SPOUSE khỏi cạnh cha-con', async () => {
      mockPrisma.member.findMany.mockResolvedValue([{ id: 'A' }, { id: 'S' }, { id: 'C' }]);
      mockPrisma.memberRelationship.findMany.mockResolvedValue([
        { parent_id: 'A', child_id: 'C', type: 'BIOLOGICAL' },
        // Nếu cạnh này bị coi là cha-con thì S sẽ ra thế hệ 2 thay vì 1.
        { parent_id: 'A', child_id: 'S', type: 'SPOUSE' },
      ]);

      await service.recomputeAll();

      const { ids, gens } = capturedArrays();
      expect(Object.fromEntries(ids.map((id, i) => [id, gens[i]]))).toEqual({ A: 1, S: 1, C: 2 });
    });

    it('dùng profiles.generation làm pin và KHÔNG ghi ngược vào profiles', async () => {
      mockPrisma.profile.findMany.mockResolvedValue([{ member_id: 'A', generation: 5 }]);

      await service.recomputeAll();

      const { ids, gens } = capturedArrays();
      expect(Object.fromEntries(ids.map((id, i) => [id, gens[i]]))).toEqual({ A: 5, B: 6 });
      expect((mockPrisma.profile as any).update).toBeUndefined();
      expect((mockPrisma.profile as any).updateMany).toBeUndefined();
    });

    it('xoá cả hai khoá cache khi có dòng thay đổi', async () => {
      await service.recomputeAll();
      expect(mockRedis.del).toHaveBeenCalledWith(CACHE_KEY_FULL, CACHE_KEY_STATS);
    });

    it('KHÔNG đụng cache khi không có dòng nào đổi', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(0);
      const result = await service.recomputeAll();
      expect(result.updated).toBe(0);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('vẫn hoàn tất khi Redis lỗi (cache là best-effort)', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('upstash unreachable'));
      await expect(service.recomputeAll()).resolves.toMatchObject({ updated: 2 });
    });

    it('bỏ qua UPDATE khi không có thành viên nào', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.memberRelationship.findMany.mockResolvedValue([]);

      const result = await service.recomputeAll();
      expect(result).toMatchObject({ members: 0, updated: 0 });
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('trả về cảnh báo từ thuật toán mà không throw', async () => {
      mockPrisma.memberRelationship.findMany.mockResolvedValue([
        { parent_id: 'A', child_id: 'B', type: 'BIOLOGICAL' },
        { parent_id: 'B', child_id: 'A', type: 'BIOLOGICAL' },
      ]);

      const result = await service.recomputeAll();
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('enqueueRecompute', () => {
    it('publish kèm delay và deduplicationId theo bucket thời gian', () => {
      service.enqueueRecompute();

      expect(mockQStashService.publish).toHaveBeenCalledWith(
        QUEUE_GENERATION_RECOMPUTE,
        {},
        expect.objectContaining({
          delay: 15,
          deduplicationId: expect.stringContaining(QUEUE_GENERATION_RECOMPUTE),
        }),
      );
    });

    it('gộp các lần gọi trong cùng cửa sổ thành một deduplicationId', () => {
      service.enqueueRecompute();
      service.enqueueRecompute();
      service.enqueueRecompute();

      const dedupIds = mockQStashService.publish.mock.calls.map((c) => c[2].deduplicationId);
      expect(new Set(dedupIds).size).toBe(1);
    });

    it('không ném lỗi khi QStash chết', () => {
      mockQStashService.publish.mockRejectedValueOnce(new Error('qstash down'));
      expect(() => service.enqueueRecompute()).not.toThrow();
    });
  });
});
