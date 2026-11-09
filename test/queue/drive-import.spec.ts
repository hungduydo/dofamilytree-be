import { TasksService, DriveImportJob } from '../../src/queue/tasks.service';
import { DriveApiError, DriveFileTooLargeError } from '../../src/media/google-drive';
import * as drive from '../../src/media/google-drive';

jest.mock('sharp', () =>
  jest.fn(() => ({
    rotate: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from('compressed') }) }),
  })),
);

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
  const redis = {
    get: jest.fn().mockResolvedValue({ access_token: 'tok' }),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  const storage = { put: jest.fn().mockResolvedValue('https://cdn.example/media/m1/Gio-To-2024.jpg') };
  const service = new TasksService(prisma as any, redis as any, {} as any, storage as any, {} as any, {} as any);
  return { service, prisma, redis, storage };
}

describe('TasksService.handleDriveImport', () => {
  let download: jest.SpyInstance;
  beforeEach(() => {
    download = jest.spyOn(drive, 'downloadDriveFile').mockResolvedValue(Buffer.from('original-bytes'));
  });
  afterEach(() => download.mockRestore());

  it('tải từ Drive bằng token trong Redis, nén rồi lưu và chuyển ready', async () => {
    const { service, prisma, redis, storage } = setup();
    await service.handleDriveImport(JOB);

    expect(redis.get).toHaveBeenCalledWith('media:drive-import:token:b1');
    expect(download).toHaveBeenCalledWith('tok', JOB.driveFileId, expect.any(Number));
    expect(storage.put).toHaveBeenCalledWith('media/m1/Gio-To-2024.jpg', Buffer.from('compressed'), 'image/jpeg');
    expect(prisma.media.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { file_path: 'https://cdn.example/media/m1/Gio-To-2024.jpg', size_bytes: 10, status: 'ready' },
    });
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
    const { service, prisma, redis } = setup();
    redis.get.mockResolvedValue(null);
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
