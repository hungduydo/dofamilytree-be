import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MemoriesService } from '../../src/memories/memories.service';

/** Kỷ niệm thuộc về người viết: chỉ tác giả hoặc admin sửa/xoá được. */
const mockPrisma = {
  memory: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const MEMBER_ID = 'member-1';
const AUTHOR = 'user-tac-gia';
const STRANGER = 'user-khac';

const member = { roles: ['member'], profileMemberId: MEMBER_ID };
const editor = { roles: ['editor'], profileMemberId: null };
const admin = { roles: ['admin'], profileMemberId: null };

describe('MemoriesService — tác giả sửa/xoá', () => {
  let service: MemoriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MemoriesService(mockPrisma as any);
    mockPrisma.memory.findFirst.mockResolvedValue({ id: 'm1', member_id: MEMBER_ID, author_id: AUTHOR });
    mockPrisma.memory.update.mockResolvedValue({ id: 'm1' });
  });

  it('tác giả sửa và xoá được kỷ niệm của mình', async () => {
    await expect(service.update(MEMBER_ID, 'm1', AUTHOR, { text: 'Sửa lại' }, member)).resolves.toBeDefined();
    await expect(service.delete(MEMBER_ID, 'm1', AUTHOR, member)).resolves.toBeUndefined();
    expect(mockPrisma.memory.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });

  it('người khác — kể cả chính chủ hồ sơ hay editor — không sửa/xoá được → 403', async () => {
    await expect(service.update(MEMBER_ID, 'm1', STRANGER, { text: 'X' }, member)).rejects.toThrow(ForbiddenException);
    await expect(service.delete(MEMBER_ID, 'm1', STRANGER, editor)).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.memory.update).not.toHaveBeenCalled();
    expect(mockPrisma.memory.delete).not.toHaveBeenCalled();
  });

  it('admin xoá được kỷ niệm của bất kỳ ai', async () => {
    await expect(service.delete(MEMBER_ID, 'm1', STRANGER, admin)).resolves.toBeUndefined();
  });

  it('kỷ niệm không thuộc member trên URL → 404', async () => {
    mockPrisma.memory.findFirst.mockResolvedValue(null);
    await expect(service.update('member-khac', 'm1', AUTHOR, { text: 'X' }, member)).rejects.toThrow(NotFoundException);
    expect(mockPrisma.memory.findFirst).toHaveBeenCalledWith({ where: { id: 'm1', member_id: 'member-khac' } });
  });
});
