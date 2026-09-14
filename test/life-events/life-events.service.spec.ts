import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LifeEventsService } from '../../src/life-events/life-events.service';

/**
 * "Member tự quản lý quá trình sinh sống của mình" là ràng buộc theo BẢN GHI —
 * RolesGuard chỉ biết route là 'member', nên phần chính chủ được khoá ở đây.
 */
const mockPrisma = {
  lifeEvent: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const OWN_ID = 'member-cua-toi';
const OTHER_ID = 'member-nguoi-khac';
const EVENT = { date: '2010-09-01', title: 'Vào đại học' };

const member = { roles: ['member'], profileMemberId: OWN_ID };
const unlinked = { roles: ['member'], profileMemberId: null };
const editor = { roles: ['editor'], profileMemberId: null };
const admin = { roles: ['admin'], profileMemberId: null };

describe('LifeEventsService — quyền theo bản ghi', () => {
  let service: LifeEventsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LifeEventsService(mockPrisma as any);
    mockPrisma.lifeEvent.create.mockResolvedValue({ id: 'e1' });
    mockPrisma.lifeEvent.update.mockResolvedValue({ id: 'e1' });
    mockPrisma.lifeEvent.findFirst.mockResolvedValue({ id: 'e1', member_id: OWN_ID });
  });

  describe('member — chính chủ', () => {
    it('thêm, sửa, xoá mốc trên hồ sơ của chính mình', async () => {
      await expect(service.create(OWN_ID, EVENT, member)).resolves.toBeDefined();
      await expect(service.update(OWN_ID, 'e1', { title: 'Tốt nghiệp' }, member)).resolves.toBeDefined();
      await expect(service.delete(OWN_ID, 'e1', member)).resolves.toBeUndefined();
      expect(mockPrisma.lifeEvent.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
    });

    it('thêm/sửa/xoá trên hồ sơ NGƯỜI KHÁC → 403, không chạm DB', async () => {
      await expect(service.create(OTHER_ID, EVENT, member)).rejects.toThrow(ForbiddenException);
      await expect(service.update(OTHER_ID, 'e1', { title: 'X' }, member)).rejects.toThrow(ForbiddenException);
      await expect(service.delete(OTHER_ID, 'e1', member)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.lifeEvent.create).not.toHaveBeenCalled();
      expect(mockPrisma.lifeEvent.update).not.toHaveBeenCalled();
      expect(mockPrisma.lifeEvent.delete).not.toHaveBeenCalled();
    });

    it('chưa được liên kết → 403', async () => {
      await expect(service.create(OWN_ID, EVENT, unlinked)).rejects.toThrow(ForbiddenException);
    });

    it('ghép id mốc của người khác vào URL của mình → 404', async () => {
      mockPrisma.lifeEvent.findFirst.mockResolvedValue(null);
      await expect(service.update(OWN_ID, 'e-la', { title: 'X' }, member)).rejects.toThrow(NotFoundException);
      await expect(service.delete(OWN_ID, 'e-la', member)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.lifeEvent.findFirst).toHaveBeenCalledWith({ where: { id: 'e-la', member_id: OWN_ID } });
      expect(mockPrisma.lifeEvent.update).not.toHaveBeenCalled();
      expect(mockPrisma.lifeEvent.delete).not.toHaveBeenCalled();
    });
  });

  describe('editor / admin', () => {
    it('editor thêm và sửa được mốc của người khác', async () => {
      await expect(service.create(OTHER_ID, EVENT, editor)).resolves.toBeDefined();
      mockPrisma.lifeEvent.findFirst.mockResolvedValue({ id: 'e1', member_id: OTHER_ID });
      await expect(service.update(OTHER_ID, 'e1', { title: 'X' }, editor)).resolves.toBeDefined();
    });

    it('editor KHÔNG xoá được mốc của người khác', async () => {
      await expect(service.delete(OTHER_ID, 'e1', editor)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.lifeEvent.delete).not.toHaveBeenCalled();
    });

    it('admin xoá được mốc của người khác', async () => {
      mockPrisma.lifeEvent.findFirst.mockResolvedValue({ id: 'e1', member_id: OTHER_ID });
      await expect(service.delete(OTHER_ID, 'e1', admin)).resolves.toBeUndefined();
    });
  });
});
