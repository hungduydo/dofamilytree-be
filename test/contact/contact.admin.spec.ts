import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContactService } from '../../src/contact/contact.service';
import { CONTACT_INFO_CACHE_KEYS } from '../../src/contact/contact.cache-keys';

function build() {
  // $transaction nhận callback ⇒ chạy luôn với chính đối tượng tx giả, để spec
  // quan sát được THỨ TỰ các lệnh bên trong transaction.
  const tx = {
    contactInfo: { upsert: jest.fn().mockResolvedValue({}) },
    contactChannel: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    contactHours: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    contactInfo: { findUnique: jest.fn().mockResolvedValue(null) },
    member: { findMany: jest.fn().mockResolvedValue([]) },
    contactMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
  } as any;

  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  } as any;

  const storage = { put: jest.fn(), del: jest.fn() } as any;
  const rateLimiter = {
    assertWithinLimits: jest.fn().mockResolvedValue(undefined),
    recordSubmission: jest.fn().mockResolvedValue(undefined),
  } as any;

  return { service: new ContactService(prisma, storage, rateLimiter, redis), prisma, tx, redis };
}

const messageRow = (over: Partial<any> = {}): any => ({
  id: 'm1',
  reference_code: 'LH-2608-0431',
  topic: 'GENEALOGY',
  full_name: 'Nguyễn Văn An',
  phone: '0988123456',
  email: null,
  branch: null,
  content: 'noi dung',
  attachments: [],
  status: 'NEW',
  user_id: null,
  sender_ip_hash: null,
  handled_by: null,
  handled_at: null,
  handled_note: null,
  created_at: new Date('2026-08-31T02:10:00.000Z'),
  updated_at: new Date('2026-08-31T02:10:00.000Z'),
  ...over,
});

const body = (over: Partial<any> = {}): any => ({
  venue: { name: 'Nhà thờ họ Nguyễn', address: 'Đông Ngạc, Từ Liêm, Hà Nội', imageUrl: null },
  channels: [
    { type: 'address', label: 'Nhà thờ', value: 'Thôn Nguyễn Xá', href: null },
    { type: 'phone', label: 'Điện thoại', value: '0988123456', href: null },
  ],
  hours: [{ label: 'Thứ Hai – Thứ Sáu', value: '08:00 – 17:00' }],
  boardTerm: 'Nhiệm kỳ 2023 – 2028',
  responseDays: 3,
  ...over,
});

describe('ContactService.updateInfo — PUT /contact/info', () => {
  it('upsert dòng singleton: lần sửa ĐẦU TIÊN phải chạy được dù chưa seed', async () => {
    const { service, tx } = build();
    await service.updateInfo(body());

    const call = tx.contactInfo.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'default' });
    expect(call.create.id).toBe('default');
    expect(call.update).toMatchObject({
      venue_name: 'Nhà thờ họ Nguyễn',
      board_term: 'Nhiệm kỳ 2023 – 2028',
      response_days: 3,
    });
  });

  it('THAY THẾ TRỌN KHỐI: xoá channels/hours cũ rồi ghi lại', async () => {
    const { service, tx } = build();
    await service.updateInfo(body());

    expect(tx.contactChannel.deleteMany).toHaveBeenCalledWith({ where: { info_id: 'default' } });
    expect(tx.contactHours.deleteMany).toHaveBeenCalledWith({ where: { info_id: 'default' } });
    expect(tx.contactChannel.createMany).toHaveBeenCalled();
  });

  it('THỨ TỰ trong mảng trở thành `position`', async () => {
    const { service, tx } = build();
    await service.updateInfo(body());

    expect(tx.contactChannel.createMany.mock.calls[0][0].data).toEqual([
      { info_id: 'default', type: 'address', label: 'Nhà thờ', value: 'Thôn Nguyễn Xá', href: null, position: 0 },
      { info_id: 'default', type: 'phone', label: 'Điện thoại', value: '0988123456', href: null, position: 1 },
    ]);
    expect(tx.contactHours.createMany.mock.calls[0][0].data[0].position).toBe(0);
  });

  it('danh sách RỖNG ⇒ vẫn xoá, nhưng không gọi createMany với mảng rỗng', async () => {
    const { service, tx } = build();
    await service.updateInfo(body({ channels: [], hours: [] }));

    expect(tx.contactChannel.deleteMany).toHaveBeenCalled();
    expect(tx.contactChannel.createMany).not.toHaveBeenCalled();
    expect(tx.contactHours.createMany).not.toHaveBeenCalled();
  });

  it('venue = null ⇒ ghi null cả ba cột', async () => {
    const { service, tx } = build();
    await service.updateInfo(body({ venue: null }));

    expect(tx.contactInfo.upsert.mock.calls[0][0].update).toMatchObject({
      venue_name: null,
      venue_address: null,
      venue_image: null,
    });
  });

  it('chuỗi rỗng ⇒ null, không lưu chuỗi rỗng', async () => {
    const { service, tx } = build();
    await service.updateInfo(body({ boardTerm: '', venue: { name: 'A', address: 'B', imageUrl: '' } }));

    expect(tx.contactInfo.upsert.mock.calls[0][0].update).toMatchObject({
      board_term: null,
      venue_image: null,
    });
  });

  it('TẤT CẢ nằm trong MỘT transaction', async () => {
    const { service, prisma } = build();
    await service.updateInfo(body());
    // Nửa chừng thất bại mà đã xoá xong channels sẽ để trang liên hệ trống
    // trơn cho tới lần sửa sau.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('xoá CẢ HAI biến thể cache — quên một cái là trang public hiện dữ liệu cũ 1 tiếng', async () => {
    const { service, redis } = build();
    await service.updateInfo(body());

    expect(redis.del).toHaveBeenCalledWith(...CONTACT_INFO_CACHE_KEYS);
    expect(CONTACT_INFO_CACHE_KEYS).toHaveLength(2);
  });

  it('trả về khối vừa lưu để BO render lại form mà không cần gọi thêm GET', async () => {
    const { service, prisma } = build();
    prisma.contactInfo.findUnique.mockResolvedValue({
      venue_name: 'Nhà thờ họ Nguyễn',
      venue_address: 'Đông Ngạc',
      venue_image: null,
      board_term: null,
      response_days: 3,
      channels: [],
      hours: [],
    });

    const result = await service.updateInfo(body());
    expect(result.venue?.name).toBe('Nhà thờ họ Nguyễn');
    expect(result.responseDays).toBe(3);
  });
});

describe('ContactService.getMessages — hộp thư admin', () => {
  it('mới nhất trước, có tiebreaker id để phân trang ổn định', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20);

    expect(prisma.contactMessage.findMany.mock.calls[0][0].orderBy).toEqual([
      { created_at: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('không lọc ⇒ LOẠI thư đã xoá mềm ra khỏi hộp thư mặc định', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20);
    expect(prisma.contactMessage.findMany.mock.calls[0][0].where).toEqual({
      status: { in: ['NEW', 'IN_PROGRESS', 'ANSWERED', 'SPAM'] },
    });
  });

  it('?status=DELETED ⇒ vẫn xem được thùng rác', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20, 'DELETED' as any);
    // Không có đường này thì thư xoá mềm không bao giờ khôi phục được.
    expect(prisma.contactMessage.findMany.mock.calls[0][0].where).toEqual({ status: 'DELETED' });
  });

  it('lọc theo status và topic', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20, 'NEW' as any, 'GRAVE' as any);
    expect(prisma.contactMessage.findMany.mock.calls[0][0].where).toEqual({
      status: 'NEW',
      topic: 'GRAVE',
    });
  });

  it('pageSize bị chặn ở 100, page tối thiểu 1', async () => {
    const { service, prisma } = build();
    await service.getMessages(-5, 5000);

    expect(prisma.contactMessage.findMany.mock.calls[0][0].take).toBe(100);
    expect(prisma.contactMessage.findMany.mock.calls[0][0].skip).toBe(0);
  });

  it('KHÔNG trả sender_ip_hash ra ngoài', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.findMany.mockResolvedValue([
      {
        id: 'm1',
        reference_code: 'LH-2608-0431',
        topic: 'GENEALOGY',
        full_name: 'Nguyễn Văn An',
        phone: '0988123456',
        email: null,
        branch: null,
        content: 'noi dung',
        attachments: [],
        status: 'NEW',
        user_id: null,
        sender_ip_hash: 'abc123deadbeef',
        created_at: new Date(),
      },
    ]);
    prisma.contactMessage.count.mockResolvedValue(1);

    const page = await service.getMessages(1, 20);
    // Hash tồn tại để gom cụm spam khi rà soát trên DB, KHÔNG phải để hiện lên
    // BO — đưa nó vào response là biến biện pháp ẩn danh hoá thành một định
    // danh mà admin bắt đầu dùng để nhận diện người gửi.
    expect(JSON.stringify(page)).not.toContain('abc123deadbeef');
    expect(page.data[0]).not.toHaveProperty('senderIpHash');
  });

  it('map sang camelCase đúng hợp đồng', async () => {
    const { service, prisma } = build();
    const createdAt = new Date('2026-08-31T02:10:00.000Z');
    prisma.contactMessage.findMany.mockResolvedValue([
      {
        id: 'm1',
        reference_code: 'LH-2608-0431',
        topic: 'GENEALOGY',
        full_name: 'Nguyễn Văn An',
        phone: '0988123456',
        email: 'an@example.com',
        branch: 'Chi ba',
        content: 'noi dung',
        attachments: [{ url: 'u', name: 'n', mimeType: 'application/pdf', size: 1 }],
        status: 'NEW',
        user_id: null,
        sender_ip_hash: null,
        created_at: createdAt,
      },
    ]);
    prisma.contactMessage.count.mockResolvedValue(1);

    expect((await service.getMessages(1, 20)).data[0]).toEqual({
      id: 'm1',
      referenceCode: 'LH-2608-0431',
      topic: 'GENEALOGY',
      fullName: 'Nguyễn Văn An',
      phone: '0988123456',
      email: 'an@example.com',
      branch: 'Chi ba',
      content: 'noi dung',
      attachments: [{ url: 'u', name: 'n', mimeType: 'application/pdf', size: 1 }],
      status: 'NEW',
      userId: null,
      createdAt,
    });
  });
});

describe('Tìm kiếm `q` — đường người trực điện thoại dùng', () => {
  /**
   * api-contact.md §6.1 gọi thiếu sót này là PHÁ VỠ QUY TRÌNH: mã tham chiếu
   * tồn tại để người nhà đọc qua điện thoại, mà người trực lại không có cách
   * nào tìm ra ngoài lật từng trang hộp thư — tức mã chỉ để trang trí.
   */
  const orOf = (prisma: any) => prisma.contactMessage.findMany.mock.calls[0][0].where.OR;

  it('tìm trong CẢ BA cột: mã tham chiếu, họ tên, số điện thoại', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20, undefined, undefined, 'LH-2608-0431');

    expect(orOf(prisma)).toEqual([
      { reference_code: { contains: 'LH-2608-0431', mode: 'insensitive' } },
      { full_name: { contains: 'LH-2608-0431', mode: 'insensitive' } },
      { phone: { contains: 'LH-2608-0431' } },
    ]);
  });

  it('không phân biệt hoa thường cho mã — người trực hay gõ chữ thường', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20, undefined, undefined, 'lh-2608');
    expect(orOf(prisma)[0].reference_code.mode).toBe('insensitive');
  });

  it('trim khoảng trắng thừa', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20, undefined, undefined, '  An  ');
    expect(orOf(prisma)[1].full_name.contains).toBe('An');
  });

  it('q rỗng / toàn khoảng trắng ⇒ KHÔNG thêm điều kiện OR', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20, undefined, undefined, '   ');
    // Một OR rỗng sẽ khớp KHÔNG dòng nào và làm hộp thư trống trơn.
    expect(prisma.contactMessage.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it('tìm kiếm vẫn LOẠI thư đã xoá mềm', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20, undefined, undefined, 'An');
    expect(prisma.contactMessage.findMany.mock.calls[0][0].where.status).toEqual({
      in: ['NEW', 'IN_PROGRESS', 'ANSWERED', 'SPAM'],
    });
  });

  it('kết hợp được với bộ lọc status/topic', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20, 'NEW' as any, 'GRAVE' as any, 'An');
    const where = prisma.contactMessage.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('NEW');
    expect(where.topic).toBe('GRAVE');
    expect(where.OR).toHaveLength(3);
  });
});

describe('ContactService.getMessageStats — badge trên nav BO', () => {
  it('MỘT round-trip (groupBy), không phải một count mỗi trạng thái', async () => {
    const { service, prisma } = build();
    await service.getMessageStats();
    expect(prisma.contactMessage.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.contactMessage.count).not.toHaveBeenCalled();
  });

  it('trạng thái KHÔNG có dòng nào vẫn trả 0, không phải undefined', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.groupBy.mockResolvedValue([{ status: 'NEW', _count: { _all: 12 } }]);

    // Thiếu bước khởi tạo, badge của trạng thái rỗng là undefined và FE phải đoán.
    expect((await service.getMessageStats()).counts).toEqual({
      NEW: 12, IN_PROGRESS: 0, ANSWERED: 0, SPAM: 0, DELETED: 0,
    });
  });

  it('total KHÔNG tính thư đã xoá mềm — phải khớp hộp thư mặc định', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.groupBy.mockResolvedValue([
      { status: 'NEW', _count: { _all: 12 } },
      { status: 'ANSWERED', _count: { _all: 41 } },
      { status: 'DELETED', _count: { _all: 7 } },
    ]);

    const stats = await service.getMessageStats();
    // Badge "60 thư" đứng cạnh danh sách 53 dòng là lỗi người dùng thấy ngay.
    expect(stats.total).toBe(53);
    expect(stats.counts.DELETED).toBe(7);
  });
});

describe('ContactService.getMessageById', () => {
  it('trả về tin nhắn', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.findUnique.mockResolvedValue(messageRow());
    expect((await service.getMessageById('m1')).referenceCode).toBe('LH-2608-0431');
  });

  it('không tồn tại ⇒ 404', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.findUnique.mockResolvedValue(null);
    await expect(service.getMessageById('m1')).rejects.toThrow(NotFoundException);
  });

  it('KHÔNG rò sender_ip_hash qua đường chi tiết', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.findUnique.mockResolvedValue(
      messageRow({ sender_ip_hash: 'abc123deadbeef' }),
    );
    expect(JSON.stringify(await service.getMessageById('m1'))).not.toContain('abc123deadbeef');
  });
});

describe('ContactService.softDeleteMessage — xoá MỀM', () => {
  it('chuyển sang DELETED, KHÔNG xoá dòng', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.update.mockResolvedValue(messageRow({ status: 'DELETED' }));

    await service.softDeleteMessage('m1', 'admin-1');
    expect(prisma.contactMessage.delete).not.toHaveBeenCalled();
    expect(prisma.contactMessage.update.mock.calls[0][0].data).toMatchObject({
      status: 'DELETED',
      handled_by: 'admin-1',
    });
  });

  it('ghi lại AI đã xoá', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.update.mockResolvedValue(messageRow({ status: 'DELETED' }));
    await service.softDeleteMessage('m1', 'admin-1');
    expect(prisma.contactMessage.update.mock.calls[0][0].data.handled_at).toBeInstanceOf(Date);
  });
});

describe('ContactService.updateMessageStatus', () => {
  const row = {
    id: 'm1',
    reference_code: 'LH-2608-0431',
    topic: 'GENEALOGY',
    full_name: 'An',
    phone: '0988123456',
    email: null,
    branch: null,
    content: 'x',
    attachments: [],
    status: 'ANSWERED',
    user_id: null,
    created_at: new Date(),
  };

  it('đổi trạng thái và trả về bản ghi sau khi sửa', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.update.mockResolvedValue(row);

    expect((await service.updateMessageStatus('m1', 'ANSWERED' as any)).status).toBe('ANSWERED');
    expect(prisma.contactMessage.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'm1' },
      data: { status: 'ANSWERED' },
    });
  });

  it('không tìm thấy (P2025) ⇒ 404, không phải 500', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: '5',
      }),
    );

    // BO cần phân biệt "thư đã bị xoá" với "server hỏng".
    await expect(service.updateMessageStatus('m1', 'ANSWERED' as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('Dấu vết kiểm toán', () => {
    it('ghi handledBy TỪ DANH TÍNH NGƯỜI GỌI và handledAt', async () => {
      const { service, prisma } = build();
      prisma.contactMessage.update.mockResolvedValue(messageRow());

      await service.updateMessageStatus('m1', 'ANSWERED' as any, 'admin-1');
      const data = prisma.contactMessage.update.mock.calls[0][0].data;
      // Để client tự khai ai đã xử lý thì trường kiểm toán này vô giá trị —
      // controller lấy id từ token, không từ body.
      expect(data.handled_by).toBe('admin-1');
      expect(data.handled_at).toBeInstanceOf(Date);
    });

    it('note bỏ trống ⇒ GIỮ NGUYÊN ghi chú cũ (PATCH là vá từng phần)', async () => {
      const { service, prisma } = build();
      prisma.contactMessage.update.mockResolvedValue(messageRow());

      await service.updateMessageStatus('m1', 'ANSWERED' as any, 'admin-1');
      expect(prisma.contactMessage.update.mock.calls[0][0].data).not.toHaveProperty('handled_note');
    });

    it('note có giá trị ⇒ ghi đè', async () => {
      const { service, prisma } = build();
      prisma.contactMessage.update.mockResolvedValue(messageRow());

      await service.updateMessageStatus('m1', 'ANSWERED' as any, 'admin-1', 'Đã gọi lại');
      expect(prisma.contactMessage.update.mock.calls[0][0].data.handled_note).toBe('Đã gọi lại');
    });

    it('note = chuỗi rỗng ⇒ XOÁ ghi chú', async () => {
      const { service, prisma } = build();
      prisma.contactMessage.update.mockResolvedValue(messageRow());

      await service.updateMessageStatus('m1', 'ANSWERED' as any, 'admin-1', '');
      expect(prisma.contactMessage.update.mock.calls[0][0].data.handled_note).toBeNull();
    });

    it('trả ra handledBy/handledAt/handledNote/updatedAt cho BO hiển thị', async () => {
      const { service, prisma } = build();
      const handledAt = new Date('2026-09-01T00:00:00.000Z');
      prisma.contactMessage.update.mockResolvedValue(
        messageRow({ handled_by: 'admin-1', handled_at: handledAt, handled_note: 'xong' }),
      );

      const result = await service.updateMessageStatus('m1', 'ANSWERED' as any, 'admin-1');
      expect(result).toMatchObject({
        handledBy: 'admin-1',
        handledAt,
        handledNote: 'xong',
        updatedAt: expect.any(Date),
      });
    });
  });

  it('lỗi DB khác ⇒ ném nguyên, không nuốt thành 404', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.update.mockRejectedValue(new Error('connection lost'));

    await expect(service.updateMessageStatus('m1', 'ANSWERED' as any)).rejects.toThrow(
      'connection lost',
    );
  });
});
