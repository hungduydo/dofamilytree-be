import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException, BadRequestException,
  PayloadTooLargeException, ServiceUnavailableException,
} from '@nestjs/common';
import { MediaService } from '../../src/media/media.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TasksService } from '../../src/queue/tasks.service';
import { StorageService } from '../../src/storage/storage.service';
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
// Mặc định: provider KHÔNG hỗ trợ presign → các test cũ (multipart) không đổi
// hành vi; test presign tự bật lại cờ này.
const mockStorage = {
  put: jest.fn(),
  del: jest.fn(),
  getUsage: jest.fn(),
  supportsPresign: jest.fn().mockReturnValue(false),
  presignPut: jest.fn(),
  publicUrlFor: jest.fn(),
  headSize: jest.fn(),
};
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
        { provide: StorageService, useValue: mockStorage },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockStorage.supportsPresign.mockReturnValue(false);
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
        {
          total: 3n, images: 2n, videos: 1n, audios: 0n, documents: 0n,
          untyped: 0n, missing_size: 0n, storage_used: 5000n,
        },
      ]);

      const stats = await service.getMediaStats();

      expect(stats).toEqual(
        expect.objectContaining({
          total: 3,
          images: 2,
          videos: 1,
          untyped: 0,
          mediaMissingSize: 0,
          storageUsedBytes: 5000,
          storageQuotaBytes: expect.any(Number),
        }),
      );
    });

    // Hồi quy: record `type IS NULL` từng bị gộp vào `documents`, khiến stats
    // báo có tài liệu trong khi `GET /media?type=document` trả rỗng. Chúng phải
    // nằm ở `untyped`, và 5 bucket cộng lại đúng bằng `total`.
    it('reports untyped rows separately instead of counting them as documents', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          total: 18n, images: 10n, videos: 0n, audios: 1n, documents: 0n,
          untyped: 7n, missing_size: 7n, storage_used: 21556390n,
        },
      ]);

      const stats = await service.getMediaStats();

      expect(stats.documents).toBe(0);
      expect(stats.untyped).toBe(7);
      expect(stats.mediaMissingSize).toBe(7);
      expect(
        stats.images + stats.videos + stats.audios + stats.documents + stats.untyped,
      ).toBe(stats.total);
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

  describe('createUploadUrl', () => {
    const dto = { filename: 'bai-hat.mp3', mime_type: 'audio/mpeg', size_bytes: 10 * 1024 * 1024 };

    it('returns a presigned PUT url and creates a pending record', async () => {
      mockStorage.supportsPresign.mockReturnValue(true);
      mockStorage.presignPut.mockResolvedValue('https://r2.example/signed');
      mockStorage.publicUrlFor.mockReturnValue('https://cdn.example/media/media-1/bai-hat.mp3');
      mockPrisma.media.create.mockResolvedValue({ id: 'media-1', status: 'pending' });

      const res = await service.createUploadUrl('user-1', dto);

      expect(res.media_id).toBe('media-1');
      expect(res.upload_url).toBe('https://r2.example/signed');
      // Content-Type phải khớp cái đã ký, nếu không R2 trả 403.
      expect(res.headers['Content-Type']).toBe('audio/mpeg');
      expect(mockStorage.presignPut).toHaveBeenCalledWith(
        'media/media-1/bai-hat.mp3', 'audio/mpeg', expect.any(Number),
      );
      expect(mockPrisma.media.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'audio', status: 'pending' }) }),
      );
    });

    it('rejects a mime type outside the allowlist', async () => {
      mockStorage.supportsPresign.mockReturnValue(true);
      await expect(
        service.createUploadUrl('user-1', { ...dto, mime_type: 'application/x-msdownload' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.media.create).not.toHaveBeenCalled();
    });

    it('rejects a file above the presigned ceiling before any work is done', async () => {
      mockStorage.supportsPresign.mockReturnValue(true);
      await expect(
        service.createUploadUrl('user-1', { ...dto, size_bytes: 5 * 1024 ** 3 }),
      ).rejects.toThrow(PayloadTooLargeException);
      expect(mockPrisma.media.create).not.toHaveBeenCalled();
    });

    it('fails clearly when the active provider cannot presign', async () => {
      mockStorage.supportsPresign.mockReturnValue(false);
      await expect(service.createUploadUrl('user-1', dto)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('completeUpload', () => {
    it('verifies the object exists then flips the record to ready', async () => {
      mockPrisma.media.findUnique.mockResolvedValue({
        id: 'media-1', status: 'pending', file_path: '/pending/1700000000000_bai-hat.mp3',
      });
      mockStorage.headSize.mockResolvedValue(10 * 1024 * 1024);
      mockStorage.publicUrlFor.mockReturnValue('https://cdn.example/media/media-1/bai-hat.mp3');
      mockPrisma.media.update.mockResolvedValue({ id: 'media-1', status: 'ready' });

      await service.completeUpload('media-1');

      // Size lấy từ storage, KHÔNG lấy từ con số client khai lúc xin URL.
      expect(mockPrisma.media.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: {
          file_path: 'https://cdn.example/media/media-1/bai-hat.mp3',
          size_bytes: 10 * 1024 * 1024,
          status: 'ready',
        },
      });
    });

    it('refuses to mark ready when the client never finished the PUT', async () => {
      mockPrisma.media.findUnique.mockResolvedValue({
        id: 'media-1', status: 'pending', file_path: '/pending/1700000000000_bai-hat.mp3',
      });
      mockStorage.headSize.mockResolvedValue(null);

      await expect(service.completeUpload('media-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.media.update).not.toHaveBeenCalled();
    });

    it('is idempotent on an already-ready record', async () => {
      mockPrisma.media.findUnique.mockResolvedValue({ id: 'media-1', status: 'ready' });
      await service.completeUpload('media-1');
      expect(mockStorage.headSize).not.toHaveBeenCalled();
      expect(mockPrisma.media.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteMedia', () => {
    // Xoá file đi qua StorageService (facade route theo `ownsUrl`), KHÔNG gọi
    // thẳng @vercel/blob nữa — provider active có thể là R2.
    it('deletes the record and the stored file', async () => {
      mockPrisma.media.findUnique.mockResolvedValue({ id: 'media-1', file_path: 'https://blob.vercel-storage.com/img.jpg' });
      mockPrisma.media.delete.mockResolvedValue({ id: 'media-1' });

      await service.deleteMedia('media-1');
      expect(mockStorage.del).toHaveBeenCalledWith('https://blob.vercel-storage.com/img.jpg');
      expect(mockPrisma.media.delete).toHaveBeenCalledWith({ where: { id: 'media-1' } });
    });

    it('throws NotFoundException when media not found', async () => {
      mockPrisma.media.findUnique.mockResolvedValue(null);
      await expect(service.deleteMedia('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
