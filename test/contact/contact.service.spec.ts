import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ContactService } from '../../src/contact/contact.service';
import { contactInfoKey } from '../../src/contact/contact.cache-keys';

/**
 * ContactService dựng bằng tay với prisma/storage/redis giả — cùng lối
 * memorial/members spec dùng, không cần Nest TestingModule cho một service
 * không có gì ngoài ba dependency.
 */
function build() {
  const prisma = {
    contactInfo: { findUnique: jest.fn().mockResolvedValue(null) },
    member: { findMany: jest.fn().mockResolvedValue([]) },
    contactMessage: { create: jest.fn() },
  } as any;

  const storage = {
    put: jest.fn(async (path: string) => `https://blob.example/${path}`),
    del: jest.fn().mockResolvedValue(undefined),
  } as any;

  // Redis giả LUÔN miss: SafeCache nuốt lỗi nên cache không che khuất hành vi.
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  } as any;

  // Bộ đếm tần suất giả: spec này chỉ cần biết recordSubmission được gọi ĐÚNG
  // LÚC NÀO (sau khi ghi thành công), không cần hành vi Redis thật.
  const rateLimiter = {
    assertWithinLimits: jest.fn().mockResolvedValue(undefined),
    recordSubmission: jest.fn().mockResolvedValue(undefined),
  } as any;

  return {
    service: new ContactService(prisma, storage, rateLimiter, redis),
    prisma,
    storage,
    rateLimiter,
    redis,
  };
}

const boardRow = (over: Partial<any> = {}) => ({
  id: 'm1',
  name: 'Nguyễn Văn An',
  avatar_url: null,
  profile: { committeeRole: 'TRUONG_TOC', phone: '0988123456', contactEmail: 'an@example.com' },
  ...over,
});

describe('ContactService.getInfo', () => {
  it('CHƯA seed contact_info ⇒ 200 với danh sách rỗng, KHÔNG ném 404', async () => {
    const { service } = build();

    // Trang phân biệt "dòng họ chưa điền" (empty state) với "request lỗi"
    // (banner đỏ). 404 làm nó hiện đúng cái sai — api-contact.md §3.1.
    await expect(service.getInfo(false)).resolves.toEqual({
      channels: [],
      venue: null,
      hours: [],
      board: [],
      boardTerm: null,
      responseDays: null,
      // Nền móng cho hàng rào tương tranh của PUT (api-contact.md §6.1) — null
      // khi chưa có dòng nào để mà sửa.
      updatedAt: null,
    });
  });

  it('chưa seed contact_info nhưng ĐÃ có ban liên lạc ⇒ vẫn trả board', async () => {
    const { service, prisma } = build();
    prisma.member.findMany.mockResolvedValue([boardRow()]);

    // board chiếu từ `members`, không phụ thuộc contact_info: bắt nó rỗng theo
    // sẽ giấu mất ban liên lạc đã có thật trong cây.
    const info = await service.getInfo(true);
    expect(info.board).toHaveLength(1);
    expect(info.channels).toEqual([]);
  });

  it('trả channels và hours theo đúng thứ tự position', async () => {
    const { service, prisma } = build();
    prisma.contactInfo.findUnique.mockResolvedValue({
      venue_name: 'Nhà thờ họ Nguyễn',
      venue_address: 'Đông Ngạc, Từ Liêm, Hà Nội',
      venue_image: null,
      board_term: 'Nhiệm kỳ 2023 – 2028',
      response_days: 3,
      channels: [{ type: 'phone', label: 'Điện thoại', value: '0988123456', href: null }],
      hours: [{ label: 'Thứ Hai – Thứ Sáu', value: '08:00 – 17:00' }],
    });

    const info = await service.getInfo(false);
    expect(info.venue).toEqual({
      name: 'Nhà thờ họ Nguyễn',
      address: 'Đông Ngạc, Từ Liêm, Hà Nội',
      imageUrl: null,
    });
    expect(info.boardTerm).toBe('Nhiệm kỳ 2023 – 2028');
    expect(info.responseDays).toBe(3);
    expect(prisma.contactInfo.findUnique.mock.calls[0][0].include.channels.orderBy).toEqual({
      position: 'asc',
    });
    expect(prisma.contactInfo.findUnique.mock.calls[0][0].include.hours.orderBy).toEqual({
      position: 'asc',
    });
  });

  it('venue là một KHỐI: thiếu tên hoặc địa chỉ ⇒ null cả cụm', async () => {
    const { service, prisma } = build();
    prisma.contactInfo.findUnique.mockResolvedValue({
      venue_name: 'Nhà thờ họ Nguyễn',
      venue_address: null,
      channels: [],
      hours: [],
    });
    expect((await service.getInfo(false)).venue).toBeNull();
  });

  describe('PII trên board — quy tắc trung tâm của route này', () => {
    it('canSeePii=true (member/admin) ⇒ thấy số điện thoại và email', async () => {
      const { service, prisma } = build();
      prisma.member.findMany.mockResolvedValue([boardRow()]);

      expect((await service.getInfo(true)).board[0]).toMatchObject({
        phone: '0988123456',
        email: 'an@example.com',
      });
    });

    it('canSeePii=false (editor/guest/khách) ⇒ phone và email là NULL', async () => {
      const { service, prisma } = build();
      prisma.member.findMany.mockResolvedValue([boardRow()]);

      const member = (await service.getInfo(false)).board[0];
      expect(member.phone).toBeNull();
      expect(member.email).toBeNull();
    });

    it('null hoá TỪNG TRƯỜNG — không bỏ key, không 403 cả route', async () => {
      const { service, prisma } = build();
      prisma.member.findMany.mockResolvedValue([boardRow()]);

      // Thẻ vẫn phải dựng được tên + vai trò và hiện dòng giải thích
      // (ContactPage.boardPiiHidden), nên KEY phải còn.
      const member = (await service.getInfo(false)).board[0];
      expect(Object.keys(member).sort()).toEqual(
        ['avatarUrl', 'email', 'id', 'memberId', 'name', 'phone', 'role'].sort(),
      );
      expect(member.name).toBe('Nguyễn Văn An');
      expect(member.role).toBe('Trưởng tộc');
    });

    it('CACHE tách khoá theo canSeePii — nếu không, member sẽ nhồi PII cho editor đọc', async () => {
      const { service, prisma, redis } = build();
      prisma.member.findMany.mockResolvedValue([boardRow()]);

      await service.getInfo(true);
      await service.getInfo(false);

      const keysWritten = redis.set.mock.calls.map((c: any[]) => c[0]);
      expect(keysWritten).toEqual([contactInfoKey(true), contactInfoKey(false)]);
      expect(new Set(keysWritten).size).toBe(2);
    });

    it('bản cache của nhóm PII KHÔNG được phục vụ cho nhóm không có quyền', async () => {
      const { service, prisma, redis } = build();
      prisma.member.findMany.mockResolvedValue([boardRow()]);

      // Redis chỉ có sẵn bản "pii"; người gọi không có quyền phải MISS.
      redis.get.mockImplementation(async (key: string) =>
        key === contactInfoKey(true) ? JSON.stringify({ board: [{ phone: '0988123456' }] }) : null,
      );

      expect((await service.getInfo(false)).board[0].phone).toBeNull();
    });
  });

  describe('Ban liên lạc chiếu từ members', () => {
    it('chỉ lấy người có profile.isCommittee = true', async () => {
      const { service, prisma } = build();
      await service.getInfo(false);
      expect(prisma.member.findMany.mock.calls[0][0].where).toEqual({
        profile: { isCommittee: true },
      });
    });

    it('trưởng tộc đứng trước phó trưởng tộc, còn lại xếp cuối rồi sắp theo tên', async () => {
      const { service, prisma } = build();
      prisma.member.findMany.mockResolvedValue([
        boardRow({ id: 'c', name: 'Cường', profile: { committeeRole: 'THU_QUY' } }),
        boardRow({ id: 'b', name: 'Bình', profile: { committeeRole: 'PHO_TRUONG_TOC' } }),
        boardRow({ id: 'a', name: 'An', profile: { committeeRole: 'TRUONG_TOC' } }),
        boardRow({ id: 'd', name: 'An Nhiên', profile: { committeeRole: 'THU_QUY' } }),
      ]);

      expect((await service.getInfo(false)).board.map((m) => m.id)).toEqual(['a', 'b', 'd', 'c']);
    });

    it('dịch mã enum sang câu chữ — FE render `role` NGUYÊN VĂN', async () => {
      const { service, prisma } = build();
      prisma.member.findMany.mockResolvedValue([
        boardRow({ id: 'a', profile: { committeeRole: 'TRUONG_TOC' } }),
        boardRow({ id: 'b', profile: { committeeRole: 'PHO_TRUONG_TOC' } }),
      ]);

      expect((await service.getInfo(false)).board.map((m) => m.role)).toEqual([
        'Trưởng tộc',
        'Phó trưởng tộc',
      ]);
    });

    it('committeeRole tự do (admin gõ tay) đi thẳng qua, không bị nuốt', async () => {
      const { service, prisma } = build();
      prisma.member.findMany.mockResolvedValue([
        boardRow({ profile: { committeeRole: 'Thủ quỹ' } }),
      ]);
      expect((await service.getInfo(false)).board[0].role).toBe('Thủ quỹ');
    });
  });
});

describe('ContactService.createMessage', () => {
  const dto = {
    topic: 'GENEALOGY',
    fullName: 'Nguyễn Văn An',
    phone: '0988123456',
    content: 'Con là cháu đời thứ 6, xin hỏi về việc bổ sung tên vào gia phả.',
  } as any;

  const fileOf = (over: Partial<any> = {}): any => ({
    originalname: 'don.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('x'),
    ...over,
  });

  const created = {
    id: 'msg-1',
    created_at: new Date('2026-08-31T02:10:00.000Z'),
    reference_code: 'LH-2608-0431',
  };

  it('trả về đúng biên nhận FE mong đợi (id, createdAt, referenceCode)', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.create.mockResolvedValue(created);

    await expect(service.createMessage(dto)).resolves.toEqual({
      id: 'msg-1',
      createdAt: created.created_at,
      referenceCode: 'LH-2608-0431',
    });
  });

  it('email/branch bỏ trống ⇒ ghi NULL, không phải chuỗi rỗng', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.create.mockResolvedValue(created);

    await service.createMessage({ ...dto, email: '', branch: '' });
    expect(prisma.contactMessage.create.mock.calls[0][0].data).toMatchObject({
      email: null,
      branch: null,
    });
  });

  it('khách vãng lai ⇒ user_id null (trường hợp THƯỜNG, không phải ngoại lệ)', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.create.mockResolvedValue(created);

    await service.createMessage(dto, []);
    expect(prisma.contactMessage.create.mock.calls[0][0].data.user_id).toBeNull();
  });

  it('thiếu CONTACT_IP_HASH_SECRET ⇒ KHÔNG lưu hash thay vì lưu sha256(ip) trần', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.create.mockResolvedValue(created);
    const saved = process.env.CONTACT_IP_HASH_SECRET;
    delete process.env.CONTACT_IP_HASH_SECRET;

    try {
      await service.createMessage(dto, [], { ip: '1.2.3.4' });
      const { sender_ip_hash } = prisma.contactMessage.create.mock.calls[0][0].data;
      // Hash không muối của IPv4 tra ngược được — lưu nó là vẫn đang lưu IP.
      expect(sender_ip_hash).toBeNull();
    } finally {
      if (saved !== undefined) process.env.CONTACT_IP_HASH_SECRET = saved;
    }
  });

  it('có muối ⇒ lưu hash, KHÔNG BAO GIỜ lưu địa chỉ IP', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.create.mockResolvedValue(created);
    process.env.CONTACT_IP_HASH_SECRET = 'muoi';

    try {
      await service.createMessage(dto, [], { ip: '1.2.3.4' });
      const { sender_ip_hash } = prisma.contactMessage.create.mock.calls[0][0].data;
      expect(sender_ip_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(sender_ip_hash).not.toContain('1.2.3.4');
    } finally {
      delete process.env.CONTACT_IP_HASH_SECRET;
    }
  });

  describe('Tệp đính kèm', () => {
    it('quá 3 tệp ⇒ 400 với câu tiếng Việt', async () => {
      const { service } = build();
      await expect(service.createMessage(dto, [fileOf(), fileOf(), fileOf(), fileOf()])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('MIME ngoài allowlist ⇒ 400 kèm TÊN tệp bị từ chối', async () => {
      const { service } = build();
      await expect(
        service.createMessage(dto, [fileOf({ originalname: 'x.svg', mimetype: 'image/svg+xml' })]),
      ).rejects.toThrow(/x\.svg/);
    });

    it('một tệp vượt trần ⇒ 413', async () => {
      const { service } = build();
      await expect(
        service.createMessage(dto, [fileOf({ size: 5 * 1024 * 1024 })]),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('TỔNG vượt trần ⇒ 413, dù từng tệp đều hợp lệ', async () => {
      const { service } = build();
      // Ba tệp 2 MB: mỗi tệp lọt, cộng lại 6 MB vượt trần body của Vercel.
      const files = [fileOf({ size: 2e6 }), fileOf({ size: 2e6 }), fileOf({ size: 2e6 })];
      await expect(service.createMessage(dto, files)).rejects.toThrow(PayloadTooLargeException);
    });

    it('lưu dưới contact/<messageId>/ và ghi metadata vào cột attachments', async () => {
      const { service, prisma, storage } = build();
      prisma.contactMessage.create.mockResolvedValue(created);

      await service.createMessage(dto, [fileOf()]);

      const [path, , contentType] = storage.put.mock.calls[0];
      const messageId = prisma.contactMessage.create.mock.calls[0][0].data.id;
      expect(path).toBe(`contact/${messageId}/don.pdf`);
      expect(contentType).toBe('application/pdf');
      expect(prisma.contactMessage.create.mock.calls[0][0].data.attachments).toEqual([
        {
          url: `https://blob.example/contact/${messageId}/don.pdf`,
          name: 'don.pdf',
          mimeType: 'application/pdf',
          size: 1,
        },
      ]);
    });

    it('insert hỏng ⇒ DỌN tệp đã lên, không để lại blob mồ côi tính tiền mãi mãi', async () => {
      const { service, prisma, storage } = build();
      prisma.contactMessage.create.mockRejectedValue(new Error('db down'));

      await expect(service.createMessage(dto, [fileOf()])).rejects.toThrow('db down');
      expect(storage.del).toHaveBeenCalledTimes(1);
    });

    it('upload tệp thứ hai hỏng ⇒ dọn tệp thứ nhất rồi mới ném', async () => {
      const { service, storage } = build();
      storage.put
        .mockResolvedValueOnce('https://blob.example/a')
        .mockRejectedValueOnce(new Error('storage down'));

      await expect(service.createMessage(dto, [fileOf(), fileOf()])).rejects.toThrow(
        BadRequestException,
      );
      expect(storage.del).toHaveBeenCalledWith('https://blob.example/a');
    });
  });

  /**
   * Hạn mức đếm LÁ THƯ ĐƯỢC LƯU, không phải request nhận được.
   *
   * ContactThrottleGuard chạy TRƯỚC ValidationPipe, nên nếu bộ đếm tăng trong
   * guard thì một cụ ông gõ nhầm số điện thoại ba lần sẽ bị khoá nguyên giờ và
   * mất đoạn văn vừa viết — đúng nhóm người mà form này sinh ra để phục vụ.
   */
  describe('Hạn mức chỉ tính lá thư ĐÃ LƯU', () => {
    it('ghi thành công ⇒ tính một lượt vào hạn mức', async () => {
      const { service, prisma, rateLimiter } = build();
      prisma.contactMessage.create.mockResolvedValue(created);

      await service.createMessage(dto, [], { ip: '1.2.3.4' });
      expect(rateLimiter.recordSubmission).toHaveBeenCalledWith('1.2.3.4');
    });

    it('ghi HỎNG ⇒ KHÔNG tính lượt nào', async () => {
      const { service, prisma, rateLimiter } = build();
      prisma.contactMessage.create.mockRejectedValue(new Error('db down'));

      await expect(service.createMessage(dto, [], { ip: '1.2.3.4' })).rejects.toThrow();
      expect(rateLimiter.recordSubmission).not.toHaveBeenCalled();
    });

    it('tệp bị từ chối ⇒ KHÔNG tính lượt: lỗi chọn nhầm tệp không được đốt hạn mức', async () => {
      const { service, rateLimiter } = build();

      await expect(
        service.createMessage(dto, [fileOf({ mimetype: 'image/svg+xml' })], { ip: '1.2.3.4' }),
      ).rejects.toThrow();
      expect(rateLimiter.recordSubmission).not.toHaveBeenCalled();
    });
  });
});
