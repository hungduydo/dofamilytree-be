import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MediaService } from '../../src/media/media.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { QUEUE_IMAGE_PROCESS } from '../../src/queue/queue.constants';

const mockPrisma = {
  media: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
};

const mockQStashService = { publish: jest.fn() };

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
        { provide: QStashService, useValue: mockQStashService },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    jest.clearAllMocks();
  });

  describe('uploadMedia', () => {
    it('should create media record and emit image-process job', async () => {
      mockPrisma.media.create.mockResolvedValue({ id: 'media-1', file_path: '/tmp/pending' });
      const mockFile = {
        buffer: Buffer.from('imgdata'),
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as Express.Multer.File;

      const result = await service.uploadMedia(mockFile, 'uploader-1');
      expect(result).toHaveProperty('id', 'media-1');
      expect(mockQStashService.publish).toHaveBeenCalledWith(
        QUEUE_IMAGE_PROCESS,
        expect.objectContaining({
          mediaId: 'media-1',
          filename: 'photo.jpg',
          mimetype: 'image/jpeg',
        }),
      );
    });

    it('should support PNG, JPEG, WEBP file types', async () => {
      for (const mimetype of ['image/png', 'image/jpeg', 'image/webp']) {
        mockPrisma.media.create.mockResolvedValue({ id: 'media-x' });
        const mockFile = { buffer: Buffer.from('x'), originalname: 'img.png', mimetype, size: 500 } as Express.Multer.File;

        await service.uploadMedia(mockFile, 'uploader-1');
        expect(mockQStashService.publish).toHaveBeenCalled();
        jest.clearAllMocks();
      }
    });
  });

  describe('getMedia', () => {
    it('should return list of media', async () => {
      mockPrisma.media.findMany.mockResolvedValue([{ id: 'media-1' }, { id: 'media-2' }]);
      const result = await service.getMedia({});
      expect(result).toHaveLength(2);
    });

    it('should filter by uploader_id', async () => {
      mockPrisma.media.findMany.mockResolvedValue([]);
      await service.getMedia({ uploader_id: 'user-1' });
      expect(mockPrisma.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ uploader_id: 'user-1' }) }),
      );
    });
  });

  describe('deleteMedia', () => {
    it('should delete media record and blob file', async () => {
      mockPrisma.media.findUnique.mockResolvedValue({ id: 'media-1', file_path: 'https://blob.vercel-storage.com/img.jpg' });
      mockPrisma.media.delete.mockResolvedValue({ id: 'media-1' });

      await service.deleteMedia('media-1');
      const { del } = require('@vercel/blob');
      expect(del).toHaveBeenCalledWith('https://blob.vercel-storage.com/img.jpg', expect.any(Object));
      expect(mockPrisma.media.delete).toHaveBeenCalledWith({ where: { id: 'media-1' } });
    });

    it('should throw NotFoundException when media not found', async () => {
      mockPrisma.media.findUnique.mockResolvedValue(null);
      await expect(service.deleteMedia('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
