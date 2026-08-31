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
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
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

  it('không lọc ⇒ where rỗng', async () => {
    const { service, prisma } = build();
    await service.getMessages(1, 20);
    expect(prisma.contactMessage.findMany.mock.calls[0][0].where).toEqual({});
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

  it('lỗi DB khác ⇒ ném nguyên, không nuốt thành 404', async () => {
    const { service, prisma } = build();
    prisma.contactMessage.update.mockRejectedValue(new Error('connection lost'));

    await expect(service.updateMessageStatus('m1', 'ANSWERED' as any)).rejects.toThrow(
      'connection lost',
    );
  });
});
