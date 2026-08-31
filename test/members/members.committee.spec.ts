import { MembersService } from '../../src/members/members.service';
import { committeeRoleLabel, committeeRoleRank } from '../../src/members/committee-role';
import { CONTACT_INFO_CACHE_KEYS } from '../../src/contact/contact.cache-keys';

/**
 * `GET /members/committee` (trang chủ) và `GET /contact/info` → `board[]`
 * (trang liên hệ) PHẢI nói về cùng một nhóm người.
 *
 * Trước đợt này chúng không: /members/committee dò chuỗi con trong
 * `profile.notes` ('committee' / 'ban quản lý' / 'hội đồng') và lấy vai trò từ
 * `profile.occupation`, còn board[] đọc `isCommittee` / `committeeRole`. Hai
 * định nghĩa cho một khái niệm nghĩa là hai trang nêu tên hai nhóm khác nhau,
 * và một lần sửa `clanRole` ở BO chỉ cập nhật được một nửa sản phẩm
 * (api-contact.md §6.1).
 */
// MembersService nhận 5 dependency; redis là dependency CUỐI. Dựng bằng đúng
// thứ tự đó chứ không phải (prisma, redis) — sai vị trí thì `this.redis` là
// undefined, SafeCache nuốt lỗi, và spec vẫn xanh vì lý do sai.
const buildService = () => {
  const prisma = { member: { findMany: jest.fn().mockResolvedValue([]) } } as any;
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  } as any;
  const service = new MembersService(prisma, {} as any, {} as any, {} as any, redis);
  return { service, prisma, redis };
};


describe('committee-role — bảng dịch DÙNG CHUNG hai màn hình', () => {
  describe('committeeRoleLabel', () => {
    it('dịch mã enum sang câu chữ FE render nguyên văn', () => {
      expect(committeeRoleLabel('TRUONG_TOC')).toBe('Trưởng tộc');
      expect(committeeRoleLabel('PHO_TRUONG_TOC')).toBe('Phó trưởng tộc');
      expect(committeeRoleLabel('THANH_VIEN')).toBe('Thành viên');
    });

    it('giá trị tự do (admin gõ tay) đi thẳng qua', () => {
      // `committeeRole` là cột text tự do — "Thủ quỹ" phải hiện đúng như đã gõ.
      expect(committeeRoleLabel('Thủ quỹ')).toBe('Thủ quỹ');
    });

    it('null/rỗng ⇒ chuỗi rỗng, không phải "null"', () => {
      expect(committeeRoleLabel(null)).toBe('');
      expect(committeeRoleLabel(undefined)).toBe('');
      expect(committeeRoleLabel('')).toBe('');
    });
  });

  describe('committeeRoleRank', () => {
    it('trưởng tộc trước phó trưởng tộc, còn lại xếp cuối', () => {
      expect(committeeRoleRank('TRUONG_TOC')).toBeLessThan(committeeRoleRank('PHO_TRUONG_TOC'));
      expect(committeeRoleRank('PHO_TRUONG_TOC')).toBeLessThan(committeeRoleRank('Thủ quỹ'));
    });

    it('mã lạ và null cùng rơi xuống cuối', () => {
      expect(committeeRoleRank(null)).toBe(committeeRoleRank('KHONG_BIET'));
    });
  });
});

describe('MembersService.getCommitteeMembers — đã chuyển sang isCommittee', () => {
  it('lọc theo profile.isCommittee, KHÔNG dò chuỗi con trong notes', async () => {
    const { service, prisma } = buildService();
    await service.getCommitteeMembers();

    const where = prisma.member.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ profile: { isCommittee: true } });
    // `notes` là ô ghi chú TỰ DO: câu "không thuộc ban quản lý" cũng khớp chuỗi
    // con và đưa nhầm người đó vào ban liên lạc.
    expect(JSON.stringify(where)).not.toContain('notes');
  });

  it('vai trò lấy từ committeeRole (đã dịch), khớp board[] của trang liên hệ', async () => {
    const { service, prisma } = buildService();
    prisma.member.findMany.mockResolvedValue([
      { id: 'm1', name: 'An', avatar_url: null, profile: { committeeRole: 'TRUONG_TOC' } },
    ]);

    expect((await service.getCommitteeMembers())[0].role).toBe('Trưởng tộc');
  });

  it('committeeRole trống ⇒ rơi về occupation (dữ liệu cũ)', async () => {
    const { service, prisma } = buildService();
    prisma.member.findMany.mockResolvedValue([
      { id: 'm1', name: 'An', avatar_url: null, profile: { committeeRole: null, occupation: 'Thủ quỹ' } },
    ]);

    expect((await service.getCommitteeMembers())[0].role).toBe('Thủ quỹ');
  });

  it('giữ nguyên shape { id, name, role, avatar } — FE không phải đổi', async () => {
    const { service, prisma } = buildService();
    prisma.member.findMany.mockResolvedValue([
      { id: 'm1', name: 'An', avatar_url: 'a.jpg', profile: { committeeRole: 'TRUONG_TOC' } },
    ]);

    expect((await service.getCommitteeMembers())[0]).toEqual({
      id: 'm1', name: 'An', role: 'Trưởng tộc', avatar: 'a.jpg',
    });
  });

  it('vẫn chặn ở 50 dòng — endpoint public không được trả cả bảng', async () => {
    const { service, prisma } = buildService();
    await service.getCommitteeMembers();
    expect(prisma.member.findMany.mock.calls[0][0].take).toBe(50);
  });
});

describe('Ghi member phải xoá luôn cache của /contact/info', () => {
  it('invalidateMemberCaches xoá CẢ khoá contact — board chiếu từ members', async () => {
    const { service, redis } = buildService();

    await (service as any).invalidateMemberCaches();

    // Không xoá ở đây thì admin bật clanRole cho một người rồi mở trang liên hệ
    // sẽ không thấy gì đổi suốt một tiếng (đã bị đúng lỗi này lúc kiểm thử).
    const deleted = redis.del.mock.calls[0];
    for (const key of CONTACT_INFO_CACHE_KEYS) expect(deleted).toContain(key);
    expect(deleted).toContain('members:committee');
  });
});
