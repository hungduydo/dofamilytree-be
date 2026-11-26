import 'reflect-metadata';
import { MembersService } from '../../src/members/members.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { COMMITTEE_ROLE_LABELS, committeeRoleLabel, committeeRoleRank } from '../../src/members/committee-role';
import { CLAN_ROLES, CLAN_ROLE_MAX_LENGTH, CreateMemberDto } from '../../src/members/dto/create-member.dto';
import { UpdateMemberDto } from '../../src/members/dto/update-member.dto';
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

    it('ban liên lạc: trưởng ban → phó ban → thư ký → thủ quỹ → người liên lạc → chức danh tự do', () => {
      const ordered = ['PHO_TRUONG_TOC', 'TRUONG_BAN', 'PHO_BAN', 'THU_KY', 'THU_QUY', 'LIEN_LAC', 'Phụ trách hương khói'];
      const ranks = ordered.map(committeeRoleRank);
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      expect(new Set(ranks).size).toBe(ranks.length);
    });
  });
});

describe('Vai trò ban liên lạc — dòng họ không có trưởng tộc', () => {
  it('mã có sẵn nào cũng có nhãn, không lộ mã thô ra trang public', () => {
    for (const code of CLAN_ROLES) {
      expect(COMMITTEE_ROLE_LABELS[code]).toBeTruthy();
    }
    expect(committeeRoleLabel('THU_QUY')).toBe('Thủ quỹ');
    expect(committeeRoleLabel('LIEN_LAC')).toBe('Người liên lạc');
    expect(committeeRoleLabel('TRUONG_BAN')).toBe('Trưởng ban liên lạc');
  });

  const check = async (clanRole: unknown) => {
    const dto = plainToInstance(UpdateMemberDto, { clanRole });
    const errors = await validate(dto);
    return { dto, errors: errors.filter((e) => e.property === 'clanRole') };
  };

  it('nhận mã có sẵn', async () => {
    expect((await check('THU_QUY')).errors).toHaveLength(0);
    expect((await check('THANH_VIEN')).errors).toHaveLength(0);
  });

  it('nhận chức danh tự do và cắt khoảng trắng hai đầu', async () => {
    const { dto, errors } = await check('  Phụ trách hương khói  ');
    expect(errors).toHaveLength(0);
    expect(dto.clanRole).toBe('Phụ trách hương khói');
  });

  it('từ chối chuỗi rỗng / toàn khoảng trắng và chuỗi quá dài', async () => {
    expect((await check('   ')).errors).not.toHaveLength(0);
    expect((await check('x'.repeat(CLAN_ROLE_MAX_LENGTH + 1))).errors).not.toHaveLength(0);
  });

  it('CreateMemberDto dùng cùng luật', async () => {
    const ok = await validate(plainToInstance(CreateMemberDto, { fullName: 'Nguyễn A', gender: 'M', clanRole: 'Thủ quỹ' }));
    expect(ok.filter((e) => e.property === 'clanRole')).toHaveLength(0);
    const bad = await validate(plainToInstance(CreateMemberDto, { fullName: 'Nguyễn A', gender: 'M', clanRole: '' }));
    expect(bad.filter((e) => e.property === 'clanRole')).not.toHaveLength(0);
  });

  it('THANH_VIEN rời ban; mã khác hay chức danh tự do đều vào ban, lưu nguyên văn', () => {
    const { service } = buildService();
    const map = (service as any).clanRoleToCommittee.bind(service);
    expect(map(undefined)).toBeUndefined();
    expect(map('THANH_VIEN')).toEqual({ committeeRole: null, isCommittee: false });
    expect(map('THU_QUY')).toEqual({ committeeRole: 'THU_QUY', isCommittee: true });
    expect(map('Phụ trách hương khói')).toEqual({ committeeRole: 'Phụ trách hương khói', isCommittee: true });
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
