import { TasksService, DriveImportJob } from '../../src/queue/tasks.service';
import { DriveApiError, DriveFileTooLargeError } from '../../src/media/google-drive';
import * as drive from '../../src/media/google-drive';

// Ảnh thật đi qua sharp được test riêng ở test/media/image-optimize.spec.ts.
jest.mock('../../src/media/image-optimize', () => ({
  ...jest.requireActual('../../src/media/image-optimize'),
  optimizeImage: jest.fn(async () => ({
    buffer: Buffer.from('compressed'), mimetype: 'image/webp', optimized: true, width: 3840, height: 2560,
  })),
}));

const JOB: DriveImportJob = {
  mediaId: 'm1',
  batchId: 'b1',
  driveFileId: '1AbCdEfGhIjKlMnOpQrStUv',
  filename: 'Giỗ Tổ 2024.jpg',
  mimetype: 'image/jpeg',
};

function setup() {
  const prisma = {
    media: {
      findUnique: jest.fn().mockResolvedValue({ status: 'pending' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  // Cache client: progress + stats. Durable client: auth của đợt import.
  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  const durable = { get: jest.fn().mockResolvedValue({ access_token: 'tok' }) };
  const storage = { put: jest.fn().mockResolvedValue('https://cdn.example/media/m1/Gio-To-2024.webp') };
  const service = new TasksService(
    prisma as any, redis as any, {} as any, storage as any, {} as any, {} as any, durable as any,
  );
  return { service, prisma, redis, durable, storage };
}

describe('TasksService.handleDriveImport', () => {
  let download: jest.SpyInstance;
  beforeEach(() => {
    download = jest.spyOn(drive, 'downloadDriveFile').mockResolvedValue(Buffer.from('original-bytes'));
  });
  afterEach(() => download.mockRestore());

  it('tải từ Drive bằng token trong Redis, chuyển WebP rồi lưu và chuyển ready', async () => {
    const { service, prisma, redis, durable, storage } = setup();
    await service.handleDriveImport(JOB);

    expect(durable.get).toHaveBeenCalledWith('media:drive-import:token:b1');
    expect(download).toHaveBeenCalledWith({ kind: 'token', accessToken: 'tok' }, JOB.driveFileId, expect.any(Number));
    expect(storage.put).toHaveBeenCalledWith('media/m1/Gio-To-2024.webp', Buffer.from('compressed'), 'image/webp');
    expect(prisma.media.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: {
        file_path: 'https://cdn.example/media/m1/Gio-To-2024.webp', size_bytes: 10, status: 'ready', mime_type: 'image/webp',
      },
    });
  });

  it('dạng token mới trong Redis ({ kind: token })', async () => {
    const { service, redis, durable } = setup();
    durable.get.mockResolvedValue({ kind: 'token', accessToken: 'tok2' });
    await service.handleDriveImport(JOB);
    expect(download).toHaveBeenCalledWith({ kind: 'token', accessToken: 'tok2' }, JOB.driveFileId, expect.any(Number));
  });

  describe('batch link chia sẻ', () => {
    const env = process.env;
    beforeEach(() => {
      process.env = { ...env, GOOGLE_DRIVE_API_KEY: 'server-key' };
    });
    afterEach(() => {
      process.env = env;
    });

    it('dựng auth từ resource key trong Redis + key trong env', async () => {
      const { service, prisma, redis, durable } = setup();
      durable.get.mockResolvedValue({ kind: 'apiKey', resourceKeys: [`${JOB.driveFileId}/rk`] });
      await service.handleDriveImport(JOB);
      expect(download).toHaveBeenCalledWith(
        { kind: 'apiKey', apiKey: 'server-key', resourceKeys: [`${JOB.driveFileId}/rk`] },
        JOB.driveFileId,
        expect.any(Number),
      );
      expect(prisma.media.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ready' }) }),
      );
    });

    it('404 ở chế độ link ⇒ message hướng dẫn chia sẻ link', async () => {
      const { service, redis, durable } = setup();
      durable.get.mockResolvedValue({ kind: 'apiKey', resourceKeys: [] });
      download.mockRejectedValue(new DriveApiError('x', 404, false));
      await service.handleDriveImport(JOB);
      expect(redis.set).toHaveBeenLastCalledWith(
        'media:progress:m1',
        expect.stringContaining('Bất kỳ ai có đường liên kết'),
        expect.anything(),
      );
    });

    it('env mất GOOGLE_DRIVE_API_KEY ⇒ failed, không tải, không ném', async () => {
      process.env = { ...env, GOOGLE_DRIVE_API_KEY: '' };
      const { service, prisma, redis, durable } = setup();
      durable.get.mockResolvedValue({ kind: 'apiKey', resourceKeys: [] });
      await expect(service.handleDriveImport(JOB)).resolves.toBeUndefined();
      expect(download).not.toHaveBeenCalled();
      expect(prisma.media.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'failed' } });
      expect(redis.set).toHaveBeenLastCalledWith(
        'media:progress:m1', expect.stringContaining('chưa được cấu hình'), expect.anything(),
      );
    });
  });

  it('Redis không đọc được ⇒ failed (không kẹt processing) rồi NÉM để retry — không coi là hết hạn', async () => {
    const { service, prisma, durable, redis } = setup();
    durable.get.mockRejectedValue(new Error('The operation was aborted due to timeout'));
    await expect(service.handleDriveImport(JOB)).rejects.toThrow('timeout');
    expect(download).not.toHaveBeenCalled();
    expect(prisma.media.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'failed' } });
    expect(redis.set).toHaveBeenLastCalledWith(
      'media:progress:m1', expect.not.stringContaining('hết hạn'), expect.anything(),
    );
  });

  it('bỏ qua record đã ready (QStash giao lặp)', async () => {
    const { service, prisma } = setup();
    prisma.media.findUnique.mockResolvedValue({ status: 'ready' });
    await service.handleDriveImport(JOB);
    expect(download).not.toHaveBeenCalled();
  });

  it('bỏ qua record đã bị xoá', async () => {
    const { service, prisma } = setup();
    prisma.media.findUnique.mockResolvedValue(null);
    await service.handleDriveImport(JOB);
    expect(download).not.toHaveBeenCalled();
    expect(prisma.media.update).not.toHaveBeenCalled();
  });

  it('token hết hạn trong Redis ⇒ failed, KHÔNG ném (retry vô ích)', async () => {
    const { service, prisma, redis, durable } = setup();
    durable.get.mockResolvedValue(null);
    await expect(service.handleDriveImport(JOB)).resolves.toBeUndefined();
    expect(prisma.media.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'failed' } });
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    ['401', new DriveApiError('x', 401, false)],
    ['404', new DriveApiError('x', 404, false)],
    ['quá lớn', new DriveFileTooLargeError(1)],
  ])('lỗi vĩnh viễn (%s) ⇒ failed, không ném', async (_label, error) => {
    const { service, prisma } = setup();
    download.mockRejectedValue(error);
    await expect(service.handleDriveImport(JOB)).resolves.toBeUndefined();
    expect(prisma.media.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'failed' } });
  });

  it('lỗi tạm của Drive ⇒ failed rồi NÉM để QStash retry', async () => {
    const { service, prisma } = setup();
    download.mockRejectedValue(new DriveApiError('x', 503, true));
    await expect(service.handleDriveImport(JOB)).rejects.toBeInstanceOf(DriveApiError);
    expect(prisma.media.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'failed' } });
  });

  it('lần retry sau failed vẫn chạy lại và thành ready', async () => {
    const { service, prisma } = setup();
    prisma.media.findUnique.mockResolvedValue({ status: 'failed' });
    await service.handleDriveImport(JOB);
    expect(prisma.media.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ready' }) }),
    );
  });

  it('storage lỗi ⇒ ném để retry', async () => {
    const { service, storage } = setup();
    storage.put.mockRejectedValue(new Error('R2 down'));
    await expect(service.handleDriveImport(JOB)).rejects.toThrow('R2 down');
  });
});
