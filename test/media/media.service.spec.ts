import { Prisma } from '@prisma/client';
import { REDIS_DURABLE_CLIENT } from '../../src/redis.provider';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException, BadRequestException,
  PayloadTooLargeException, ServiceUnavailableException,
} from '@nestjs/common';
import { MediaService } from '../../src/media/media.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TasksService } from '../../src/queue/tasks.service';
import { StorageService } from '../../src/storage/storage.service';
import { SupabaseUsersService } from '../../src/supabase/supabase-users.service';
import { classifyMediaType, MAX_DRIVE_IMPORT_BYTES } from '../../src/media/media.constants';
import { QStashService } from '../../src/queue/qstash.service';
import * as drive from '../../src/media/google-drive';
import { DriveApiError } from '../../src/media/google-drive';

const mockPrisma = {
  media: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  userMetadata: {
    findUnique: jest.fn(),
  },
  member: {
    findUnique: jest.fn(),
  },
  mediaAlbum: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  $queryRaw: jest.fn(),
  // Mảng promise (create…) ⇒ chạy tuần tự như Prisma batch transaction.
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const mockTasksService = { handleMediaProcess: jest.fn(), handleDriveImport: jest.fn() };
const mockQStash = { publish: jest.fn() };
// Mặc định: provider KHÔNG hỗ trợ presign → các test cũ (multipart) không đổi
// hành vi; test presign tự bật lại cờ này.
// Mặc định Supabase không có display name → các test cũ giữ nguyên hành vi.
const mockSupabaseUsers = { getDisplayName: jest.fn().mockResolvedValue(null) };
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
/** Client riêng cho dữ liệu bắt buộc (auth import Drive) — timeout rộng, có retry. */
const mockDurableRedis = { get: jest.fn(), set: jest.fn() };

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
        { provide: SupabaseUsersService, useValue: mockSupabaseUsers },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: REDIS_DURABLE_CLIENT, useValue: mockDurableRedis },
        { provide: QStashService, useValue: mockQStash },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockStorage.supportsPresign.mockReturnValue(false);
    mockSupabaseUsers.getDisplayName.mockResolvedValue(null);
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

  describe('getMediaFeed', () => {
    const at = (min: number) => new Date(Date.UTC(2026, 10, 9, 10, min));
    const loose = (id: string, min: number) => ({ id, album_id: null, created_at: at(min) });

    beforeEach(() => {
      // Album "đám tang" vừa nhận 160 ảnh (mới nhất 10:50); album cũ 3 ảnh (10:05).
      mockPrisma.media.groupBy.mockResolvedValue([
        { album_id: 'funeral', _max: { created_at: at(50) }, _count: { _all: 160 } },
        { album_id: 'old', _max: { created_at: at(5) }, _count: { _all: 3 } },
      ]);
      mockPrisma.mediaAlbum.findMany.mockImplementation(({ where }) =>
        Promise.resolve(
          [
            { id: 'funeral', name: 'Đám tang ông A', cover_url: null, date: null },
            { id: 'old', name: 'Giỗ tổ', cover_url: null, date: null },
          ].filter((a) => where.id.in.includes(a.id)),
        ),
      );
    });

    it('collapses an album into one entry placed at its newest photo', async () => {
      mockPrisma.media.findMany.mockImplementation(({ where }) =>
        Promise.resolve(
          where.album_id === null
            ? [loose('m-new', 55), loose('m-mid', 30), loose('m-old', 1)]
            : [{ id: `${where.album_id}-p1` }, { id: `${where.album_id}-p2` }],
        ),
      );
      mockPrisma.media.count.mockResolvedValue(3);

      const result = await service.getMediaFeed({ page: 1, pageSize: 12 });

      expect(result.data.map((e: any) => (e.kind === 'album' ? `album:${e.album.id}` : e.media.id))).toEqual([
        'm-new', 'album:funeral', 'm-mid', 'album:old', 'm-old',
      ]);
      expect(result).toMatchObject({ total: 5, media_total: 166, page: 1, pageSize: 12 });
      expect(result.data[1]).toMatchObject({
        kind: 'album',
        album: { name: 'Đám tang ông A' },
        count: 160,
        preview: [{ id: 'funeral-p1' }, { id: 'funeral-p2' }],
      });
      // Previews only take a handful, never the whole album.
      expect(mockPrisma.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ album_id: 'funeral' }), take: 4 }),
      );
    });

    it('paginates over entries, not media', async () => {
      mockPrisma.media.findMany.mockImplementation(({ where, take }) =>
        Promise.resolve(
          where.album_id === null
            ? [loose('m-new', 55), loose('m-mid', 30), loose('m-old', 1)].slice(0, take)
            : [],
        ),
      );
      mockPrisma.media.count.mockResolvedValue(3);

      const page2 = await service.getMediaFeed({ page: 2, pageSize: 2 });

      // Page 1 = m-new, funeral → page 2 = m-mid, old.
      expect(page2.data.map((e: any) => (e.kind === 'album' ? e.album.id : e.media.id))).toEqual(['m-mid', 'old']);
      expect(mockPrisma.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ album_id: null }), take: 4 }),
      );
    });

    it('applies the same filters to loose media, album counts and previews', async () => {
      mockPrisma.media.findMany.mockResolvedValue([]);
      mockPrisma.media.count.mockResolvedValue(0);

      await service.getMediaFeed({ type: 'image', tag: 'tang lễ' });

      const filters = expect.objectContaining({ status: 'ready', type: 'image', tags: { has: 'tang lễ' } });
      expect(mockPrisma.media.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['album_id'], where: expect.objectContaining({ album_id: { not: null } }) }),
      );
      expect(mockPrisma.media.groupBy.mock.calls[0][0].where).toEqual(filters);
      expect(mockPrisma.media.count.mock.calls[0][0].where).toEqual(filters);
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

  describe('uploader_name resolution', () => {
    beforeEach(() => {
      mockPrisma.media.create.mockResolvedValue({ id: 'media-1', status: 'pending' });
    });

    const file = {
      buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', size: 10,
    } as Express.Multer.File;

    const createdWith = () => mockPrisma.media.create.mock.calls[0][0].data;

    it('keeps the name the client sent (đăng hộ)', async () => {
      await service.uploadMedia(file, 'user-1', { uploader_name: 'Ban truyền thông dòng họ' });
      expect(createdWith().uploader_name).toBe('Ban truyền thông dòng họ');
      // Đã có tên thì không đụng tới DB để tra cứu.
      expect(mockPrisma.member.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.userMetadata.findUnique).not.toHaveBeenCalled();
    });

    it('uses the Supabase display name carried in the token', async () => {
      await service.uploadMedia(file, 'user-1', { display_name: 'Đỗ Duy Hưng' });
      expect(createdWith().uploader_name).toBe('Đỗ Duy Hưng');
      // Token đã có tên ⇒ không gọi Supabase.
      expect(mockSupabaseUsers.getDisplayName).not.toHaveBeenCalled();
    });

    it('asks Supabase when the token predates displayName', async () => {
      mockSupabaseUsers.getDisplayName.mockResolvedValue('Đỗ Duy Hưng');
      await service.uploadMedia(file, 'user-1', {});
      expect(createdWith().uploader_name).toBe('Đỗ Duy Hưng');
      expect(mockSupabaseUsers.getDisplayName).toHaveBeenCalledWith('user-1');
    });

    it('prefers the client-sent name over the display name (đăng hộ)', async () => {
      await service.uploadMedia(file, 'user-1', {
        uploader_name: 'Ban truyền thông dòng họ',
        display_name: 'Đỗ Duy Hưng',
      });
      expect(createdWith().uploader_name).toBe('Ban truyền thông dòng họ');
    });

    it('falls back to the linked member name when the client sends nothing', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ name: 'Đỗ Xuân Khôi' });
      await service.uploadMedia(file, 'user-1', { profile_member_id: 'member-9' });
      expect(createdWith().uploader_name).toBe('Đỗ Xuân Khôi');
    });

    it('looks up user_metadata when the token carries no profileMemberId', async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue({
        profile_member: { name: 'Đỗ Xuân Khôi' },
      });
      await service.uploadMedia(file, 'user-1', {});
      expect(createdWith().uploader_name).toBe('Đỗ Xuân Khôi');
    });

    it('stays null for an account with no linked member — never leaks the email', async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ profile_member: null });
      await service.uploadMedia(file, 'user-1', {});
      expect(createdWith().uploader_name).toBeNull();
    });

    it('applies the same resolution on the presigned path', async () => {
      mockStorage.supportsPresign.mockReturnValue(true);
      mockStorage.presignPut.mockResolvedValue('https://r2.example/signed');
      mockStorage.publicUrlFor.mockReturnValue('https://cdn.example/x.mp3');
      mockPrisma.member.findUnique.mockResolvedValue({ name: 'Đỗ Xuân Khôi' });

      await service.createUploadUrl('user-1', {
        filename: 'a.mp3', mime_type: 'audio/mpeg', size_bytes: 100,
        profile_member_id: 'member-9',
      });

      expect(createdWith().uploader_name).toBe('Đỗ Xuân Khôi');
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
    mockSupabaseUsers.getDisplayName.mockResolvedValue(null);
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

  describe('importFromGoogleDrive', () => {
    const ID_A = '1AAAAAAAAAAAAAAAAAAAAA';
    const ID_B = '1BBBBBBBBBBBBBBBBBBBBB';
    const env = process.env;
    let getMeta: jest.SpyInstance;

    const meta = (id: string, extra: Partial<drive.DriveFileMeta> = {}): drive.DriveFileMeta => ({
      id, name: `${id}.jpg`, mimeType: 'image/jpeg', size: 25 * 1024 * 1024, trashed: false, ...extra,
    });
    const dto = (file_ids: string[]) => ({
      access_token: 'tok', file_ids, album_id: 'album-1', display_name: 'Chú Ba',
    });

    beforeEach(() => {
      process.env = { ...env, QSTASH_TOKEN: 'q', APP_URL: 'https://api.giapha.example' };
      getMeta = jest.spyOn(drive, 'getDriveFileMeta').mockImplementation(async (_t, id) => meta(id));
      let n = 0;
      mockPrisma.media.create.mockImplementation(async () => ({ id: `media-${++n}` }));
      mockDurableRedis.set.mockResolvedValue('OK');
      mockQStash.publish.mockResolvedValue(undefined);
    });
    afterEach(() => {
      getMeta.mockRestore();
      process.env = env;
    });

    it('tạo record pending, lưu token vào Redis và publish mỗi file một job (không kèm token)', async () => {
      const res = await service.importFromGoogleDrive('user-1', dto([ID_A, ID_B, ID_A]));

      expect(getMeta).toHaveBeenCalledTimes(2); // ID trùng bị gộp
      expect(res.accepted.map((a) => a.media_id)).toEqual(['media-1', 'media-2']);
      expect(res.rejected).toEqual([]);
      expect(mockPrisma.media.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'pending', album_id: 'album-1', uploader_name: 'Chú Ba', mime_type: 'image/jpeg', type: 'image',
          }),
        }),
      );
      expect(mockDurableRedis.set).toHaveBeenCalledWith(
        `media:drive-import:token:${res.batch_id}`,
        { kind: 'token', accessToken: 'tok' },
        { ex: 3600 },
      );
      expect(getMeta).toHaveBeenCalledWith({ kind: 'token', accessToken: 'tok' }, ID_A);
      expect(mockQStash.publish).toHaveBeenCalledTimes(2);
      const [task, payload, opts] = mockQStash.publish.mock.calls[0];
      expect(task).toBe('drive-import');
      expect(payload).toEqual({
        mediaId: 'media-1', batchId: res.batch_id, driveFileId: ID_A, filename: `${ID_A}.jpg`, mimetype: 'image/jpeg',
      });
      expect(JSON.stringify(payload)).not.toContain('tok');
      expect(opts).toEqual({ deduplicationId: 'drive-import-media-1' });
      expect(mockTasksService.handleDriveImport).not.toHaveBeenCalled();
    });

    it('token Google hỏng ⇒ 400 (không phải 401) và không tạo gì', async () => {
      getMeta.mockRejectedValue(new DriveApiError('x', 401, false));
      await expect(service.importFromGoogleDrive('user-1', dto([ID_A]))).rejects.toThrow(BadRequestException);
      expect(mockPrisma.media.create).not.toHaveBeenCalled();
      expect(mockDurableRedis.set).not.toHaveBeenCalled();
    });

    it('loại file không hợp lệ trước khi tạo record', async () => {
      const ids = ['1CCCCCCCCCCCCCCCCCCCCC', '1DDDDDDDDDDDDDDDDDDDDD', '1EEEEEEEEEEEEEEEEEEEEE', '1FFFFFFFFFFFFFFFFFFFFF', '1GGGGGGGGGGGGGGGGGGGGG'];
      getMeta.mockImplementation(async (_t, id) => {
        switch (id) {
          case ids[0]: return meta(id, { mimeType: 'application/vnd.google-apps.folder' });
          case ids[1]: return meta(id, { mimeType: 'application/vnd.google-apps.document' });
          case ids[2]: return meta(id, { size: MAX_DRIVE_IMPORT_BYTES + 1 });
          case ids[3]: return meta(id, { trashed: true });
          default: throw new DriveApiError('x', 404, false);
        }
      });
      const res = await service.importFromGoogleDrive('user-1', dto(ids));

      expect(res.accepted).toEqual([]);
      expect(res.rejected.map((r) => r.reason)).toEqual([
        'unsupported_type', 'unsupported_type', 'too_large', 'trashed', 'not_found',
      ]);
      expect(mockPrisma.media.create).not.toHaveBeenCalled();
      expect(mockDurableRedis.set).not.toHaveBeenCalled();
    });

    it('lỗi tạm khi đọc metadata ⇒ drive_unavailable, file khác vẫn đi tiếp', async () => {
      getMeta.mockImplementation(async (_t, id) => {
        if (id === ID_B) throw new DriveApiError('x', 503, true);
        return meta(id);
      });
      const res = await service.importFromGoogleDrive('user-1', dto([ID_A, ID_B]));
      expect(res.accepted.map((a) => a.drive_file_id)).toEqual([ID_A]);
      expect(res.rejected).toEqual([expect.objectContaining({ drive_file_id: ID_B, reason: 'drive_unavailable' })]);
    });

    it('publish hỏng ⇒ record bị đánh dấu failed và chuyển sang rejected', async () => {
      mockQStash.publish.mockImplementation(async (_t: string, job: { mediaId: string }) => {
        if (job.mediaId === 'media-2') throw new Error('qstash down');
      });
      const res = await service.importFromGoogleDrive('user-1', dto([ID_A, ID_B]));

      expect(res.accepted.map((a) => a.media_id)).toEqual(['media-1']);
      expect(res.rejected).toEqual([expect.objectContaining({ drive_file_id: ID_B, reason: 'enqueue_failed' })]);
      expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['media-2'] } }, data: { status: 'failed' },
      });
    });

    it('Redis không lưu được token ⇒ 503, không tạo record', async () => {
      mockDurableRedis.set.mockRejectedValue(new Error('redis down'));
      await expect(service.importFromGoogleDrive('user-1', dto([ID_A]))).rejects.toThrow(ServiceUnavailableException);
      expect(mockPrisma.media.create).not.toHaveBeenCalled();
    });

    it('dev-local (APP_URL localhost) ⇒ chạy job trong process thay vì QStash', async () => {
      process.env.APP_URL = 'http://localhost:3002';
      mockTasksService.handleDriveImport.mockResolvedValue(undefined);
      await service.importFromGoogleDrive('user-1', dto([ID_A]));
      await new Promise((r) => setImmediate(r));

      expect(mockQStash.publish).not.toHaveBeenCalled();
      expect(mockTasksService.handleDriveImport).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'media-1', driveFileId: ID_A }),
      );
    });
    describe('chế độ link chia sẻ (không access_token)', () => {
      const linkDto = (file_ids: string[], resource_keys?: string[]) => ({
        file_ids, resource_keys, album_id: 'album-1', display_name: 'Chú Ba',
      });
      beforeEach(() => {
        process.env.GOOGLE_DRIVE_API_KEY = 'server-key';
      });

      it('đọc metadata bằng key server, Redis chỉ giữ resource key — không bao giờ giữ key', async () => {
        const res = await service.importFromGoogleDrive('user-1', linkDto([ID_A, ID_B], [`${ID_A}/rk`, `${ID_A}/rk`]));

        expect(getMeta).toHaveBeenCalledWith(
          { kind: 'apiKey', apiKey: 'server-key', resourceKeys: [`${ID_A}/rk`] }, ID_A,
        );
        expect(res.accepted).toHaveLength(2);
        expect(mockDurableRedis.set).toHaveBeenCalledWith(
          `media:drive-import:token:${res.batch_id}`,
          { kind: 'apiKey', resourceKeys: [`${ID_A}/rk`] },
          { ex: 3600 },
        );
        expect(JSON.stringify(mockDurableRedis.set.mock.calls)).not.toContain('server-key');
        expect(JSON.stringify(mockQStash.publish.mock.calls)).not.toContain('server-key');
      });

      it('thiếu GOOGLE_DRIVE_API_KEY ⇒ 503 và không gọi Drive', async () => {
        delete process.env.GOOGLE_DRIVE_API_KEY;
        const err = await service.importFromGoogleDrive('user-1', linkDto([ID_A])).catch((e) => e);
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.message).toBe('Import từ link Google Drive chưa được cấu hình.');
        expect(getMeta).not.toHaveBeenCalled();
        expect(mockPrisma.media.create).not.toHaveBeenCalled();
      });

      it('404 ⇒ not_found với hướng dẫn chia sẻ link', async () => {
        getMeta.mockRejectedValue(new DriveApiError('x', 404, false));
        const res = await service.importFromGoogleDrive('user-1', linkDto([ID_A]));
        expect(res.rejected).toEqual([{
          drive_file_id: ID_A,
          reason: 'not_found',
          message: "File chưa được chia sẻ công khai — hãy đặt quyền 'Bất kỳ ai có đường liên kết'.",
        }]);
      });

      it('401 ở chế độ link KHÔNG ra 400 "token không hợp lệ"', async () => {
        getMeta.mockRejectedValue(new DriveApiError('x', 401, false));
        const res = await service.importFromGoogleDrive('user-1', linkDto([ID_A]));
        expect(res.rejected).toEqual([expect.objectContaining({ reason: 'not_found' })]);
      });
    });
  });
  describe('moveMedia', () => {
    const ALBUM = '11111111-1111-4111-8111-111111111111';
    const MINE = '22222222-2222-4222-8222-222222222222';
    const THEIRS = '33333333-3333-4333-8333-333333333333';
    const GHOST = '44444444-4444-4444-8444-444444444444';

    beforeEach(() => {
      mockPrisma.mediaAlbum.findUnique.mockResolvedValue({ id: ALBUM });
      mockPrisma.media.findMany.mockResolvedValue([
        { id: MINE, uploader_id: 'user-1' },
        { id: THEIRS, uploader_id: 'user-2' },
      ]);
      mockPrisma.media.updateMany.mockResolvedValue({ count: 0 });
      mockRedis.del.mockResolvedValue(1);
    });

    it('editor chuyển được media của bất kỳ ai', async () => {
      const res = await service.moveMedia('user-9', ['editor'], { media_ids: [MINE, THEIRS], album_id: ALBUM });

      expect(res).toEqual({ album_id: ALBUM, moved: [MINE, THEIRS], skipped: [] });
      expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [MINE, THEIRS] } }, data: { album_id: ALBUM },
      });
      expect(mockRedis.del).toHaveBeenCalledWith('media:stats', 'media:albums');
    });

    it('admin cũng chuyển được mọi media', async () => {
      const res = await service.moveMedia('user-9', ['admin'], { media_ids: [THEIRS], album_id: ALBUM });
      expect(res.moved).toEqual([THEIRS]);
    });

    it('member chuyển media của mình, media người khác ⇒ not_owner', async () => {
      const res = await service.moveMedia('user-1', ['member'], { media_ids: [MINE, THEIRS], album_id: ALBUM });

      expect(res).toEqual({
        album_id: ALBUM, moved: [MINE], skipped: [{ media_id: THEIRS, reason: 'not_owner' }],
      });
      expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [MINE] } }, data: { album_id: ALBUM },
      });
    });

    it('không được phép gì ⇒ 200 với mọi thứ trong skipped, không ghi, không xoá cache', async () => {
      const res = await service.moveMedia('user-1', ['member'], { media_ids: [THEIRS], album_id: ALBUM });
      expect(res).toEqual({ album_id: ALBUM, moved: [], skipped: [{ media_id: THEIRS, reason: 'not_owner' }] });
      expect(mockPrisma.media.updateMany).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('album_id: null gỡ khỏi album, không tra album', async () => {
      const res = await service.moveMedia('user-1', ['member'], { media_ids: [MINE], album_id: null });
      expect(res).toEqual({ album_id: null, moved: [MINE], skipped: [] });
      expect(mockPrisma.mediaAlbum.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [MINE] } }, data: { album_id: null },
      });
    });

    it('album không tồn tại ⇒ 404 "Không tìm thấy album." và không chuyển gì', async () => {
      mockPrisma.mediaAlbum.findUnique.mockResolvedValue(null);
      const err = await service
        .moveMedia('user-9', ['admin'], { media_ids: [MINE], album_id: ALBUM })
        .catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.message).toBe('Không tìm thấy album.');
      expect(mockPrisma.media.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.media.updateMany).not.toHaveBeenCalled();
    });

    it('album bị xoá ngay trước khi ghi (P2003) ⇒ vẫn là 404', async () => {
      mockPrisma.media.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
      );
      await expect(
        service.moveMedia('user-9', ['admin'], { media_ids: [MINE], album_id: ALBUM }),
      ).rejects.toThrow(NotFoundException);
    });

    it('ID không tồn tại ⇒ not_found, phần còn lại vẫn chuyển; trùng lặp bị gộp', async () => {
      const res = await service.moveMedia('user-1', ['member'], {
        media_ids: [MINE, GHOST, MINE], album_id: ALBUM,
      });
      expect(res).toEqual({
        album_id: ALBUM, moved: [MINE], skipped: [{ media_id: GHOST, reason: 'not_found' }],
      });
      expect(mockPrisma.media.findMany).toHaveBeenCalledWith({
        where: { id: { in: [MINE, GHOST] } }, select: { id: true, uploader_id: true },
      });
    });
  });
});
