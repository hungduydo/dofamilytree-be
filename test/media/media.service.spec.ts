import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MediaService } from '../../src/media/media.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TasksService } from '../../src/queue/tasks.service';
import { classifyMediaType } from '../../src/media/media.constants';

const mockPrisma = {
  media: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  mediaAlbum: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockTasksService = { handleMediaProcess: jest.fn() };
// SafeCache best-effort — trả null (miss) để mọi read rơi về DB.
const mockRedis = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };

// Mock Vercel Blob
jest.mock('@vercel/blob', () => ({
  del: jest.fn(),
}));

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksService, useValue: mockTasksService },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
  });

  describe('uploadMedia', () => {
    it('creates a pending record and kicks off media processing', async () => {
      mockPrisma.media.create.mockResolvedValue({ id: 'media-1', status: 'pending' });
      const mockFile = {
        buffer: Buffer.from('imgdata'),
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as Express.Multer.File;

      const result = await service.uploadMedia(mockFile, 'uploader-1');

      expect(result).toHaveProperty('id', 'media-1');
      // type suy từ MIME + status pending
      expect(mockPrisma.media.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'image', status: 'pending', mime_type: 'image/jpeg' }),
        }),
      );
      expect(mockTasksService.handleMediaProcess).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'media-1', filename: 'photo.jpg', mimetype: 'image/jpeg' }),
      );
    });

    it('classifies non-image types from the mimetype', async () => {
      const cases: Array<[string, string]> = [
        ['clip.mp4', 'video/mp4'],
        ['song.mp3', 'audio/mpeg'],
        ['doc.pdf', 'application/pdf'],
      ];
      for (const [originalname, mimetype] of cases) {
        mockPrisma.media.create.mockResolvedValue({ id: 'media-x' });
        const mockFile = { buffer: Buffer.from('x'), originalname, mimetype, size: 500 } as Express.Multer.File;

        await service.uploadMedia(mockFile, 'uploader-1');

        expect(mockPrisma.media.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ type: classifyMediaType(mimetype) }) }),
        );
        jest.clearAllMocks();
      }
    });
  });

  describe('getMedia', () => {
    it('returns a paginated envelope and defaults to ready status', async () => {
      mockPrisma.media.findMany.mockResolvedValue([{ id: 'media-1' }, { id: 'media-2' }]);
      mockPrisma.media.count.mockResolvedValue(2);

      const result = await service.getMedia({ page: 1, pageSize: 12 });

      expect(result).toEqual({ data: [{ id: 'media-1' }, { id: 'media-2' }], total: 2, page: 1, pageSize: 12 });
      expect(mockPrisma.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'ready' }) }),
      );
    });

    it('filters by type, event and tag', async () => {
      mockPrisma.media.findMany.mockResolvedValue([]);
      mockPrisma.media.count.mockResolvedValue(0);

      await service.getMedia({ type: 'video', event_id: 'evt-1', tag: 'giỗ tổ' });

      expect(mockPrisma.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'video', event_id: 'evt-1', tags: { has: 'giỗ tổ' } }),
        }),
      );
    });

    it('sorts by views for the "most viewed" list', async () => {
      mockPrisma.media.findMany.mockResolvedValue([]);
      mockPrisma.media.count.mockResolvedValue(0);

      await service.getMedia({ sortBy: 'views' });

      expect(mockPrisma.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ views: 'desc' }, { id: 'asc' }] }),
      );
    });
  });

  describe('getMediaStats', () => {
    it('aggregates counts by type + storage and adds the quota', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { total: 3n, images: 2n, videos: 1n, audios: 0n, documents: 0n, storage_used: 5000n },
      ]);

      const stats = await service.getMediaStats();

      expect(stats).toEqual(
        expect.objectContaining({
          total: 3,
          images: 2,
          videos: 1,
          storageUsedBytes: 5000,
          storageQuotaBytes: expect.any(Number),
        }),
      );
    });
  });

  describe('incrementViews', () => {
    it('increments and returns the new view count', async () => {
      mockPrisma.media.update.mockResolvedValue({ views: 43 });
      const result = await service.incrementViews('media-1');
      expect(result).toEqual({ views: 43 });
      expect(mockPrisma.media.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { views: { increment: 1 } } }),
      );
    });

    it('throws NotFoundException when the media is missing', async () => {
      mockPrisma.media.update.mockRejectedValue(new Error('P2025'));
      await expect(service.incrementViews('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMedia', () => {
    it('deletes the record and the blob file', async () => {
      mockPrisma.media.findUnique.mockResolvedValue({ id: 'media-1', file_path: 'https://blob.vercel-storage.com/img.jpg' });
      mockPrisma.media.delete.mockResolvedValue({ id: 'media-1' });

      await service.deleteMedia('media-1');
      const { del } = require('@vercel/blob');
      expect(del).toHaveBeenCalledWith('https://blob.vercel-storage.com/img.jpg', expect.any(Object));
      expect(mockPrisma.media.delete).toHaveBeenCalledWith({ where: { id: 'media-1' } });
    });

    it('throws NotFoundException when media not found', async () => {
      mockPrisma.media.findUnique.mockResolvedValue(null);
      await expect(service.deleteMedia('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
