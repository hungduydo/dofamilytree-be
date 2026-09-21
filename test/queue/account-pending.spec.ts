import { TasksService } from '../../src/queue/tasks.service';

jest.mock('sharp', () => jest.fn());

const PENDING = {
  user_id: 'u1',
  profile_member_id: null,
  claim_request: { fullName: 'Đỗ Văn A' },
};

function setup() {
  const prisma = {
    userMetadata: {
      findUnique: jest.fn().mockResolvedValue(PENDING),
      findMany: jest.fn().mockResolvedValue([{ user_id: 'a1' }, { user_id: 'a2' }]),
      count: jest.fn().mockResolvedValue(3),
    },
  };
  const mail = { isConfigured: jest.fn().mockReturnValue(true), send: jest.fn().mockResolvedValue(undefined) };
  const emails: Record<string, string | null> = { u1: 'chau@x.vn', a1: 'truongtoc@x.vn', a2: 'thuky@x.vn' };
  const supabaseUsers = { getEmail: jest.fn(async (id: string) => emails[id] ?? null) };
  const service = new TasksService(prisma as any, {} as any, {} as any, {} as any, mail as any, supabaseUsers as any);
  return { service, prisma, mail, emails };
}

describe('TasksService.handleAccountPending', () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, FRONTEND_URL: 'https://giapha.example/' };
  });
  afterAll(() => {
    process.env = env;
  });

  it('gửi một email tới mọi admin, kèm độ dài hàng đợi và link duyệt', async () => {
    const { service, prisma, mail } = setup();
    await service.handleAccountPending({ userId: 'u1' });

    expect(prisma.userMetadata.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roles: { has: 'admin' }, deactivated_at: null } }),
    );
    expect(mail.send).toHaveBeenCalledTimes(1);
    const sent = mail.send.mock.calls[0][0];
    expect(sent.to).toEqual(['truongtoc@x.vn', 'thuky@x.vn']);
    expect(sent.subject).toContain('Đỗ Văn A');
    expect(sent.text).toContain('Email: chau@x.vn');
    expect(sent.text).toContain('Hàng đợi hiện có 3 tài khoản');
    expect(sent.text).toContain('https://giapha.example/bo/users');
  });

  it('bỏ qua admin không đọc được email', async () => {
    const { service, mail, emails } = setup();
    emails.a2 = null;
    await service.handleAccountPending({ userId: 'u1' });
    expect(mail.send.mock.calls[0][0].to).toEqual(['truongtoc@x.vn']);
  });

  it('không gửi khi tài khoản đã được duyệt trước khi job chạy', async () => {
    const { service, prisma, mail } = setup();
    prisma.userMetadata.findUnique.mockResolvedValue({ ...PENDING, profile_member_id: 'm1' });
    await service.handleAccountPending({ userId: 'u1' });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('không gửi khi tài khoản đã bị khoá trước khi job chạy', async () => {
    const { service, prisma, mail } = setup();
    prisma.userMetadata.findUnique.mockResolvedValue({ ...PENDING, deactivated_at: new Date() });
    await service.handleAccountPending({ userId: 'u1' });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('chỉ báo admin đang hoạt động, chỉ đếm tài khoản chờ đang hoạt động', async () => {
    const { service, prisma } = setup();
    await service.handleAccountPending({ userId: 'u1' });
    expect(prisma.userMetadata.findMany.mock.calls[0][0].where).toEqual({
      roles: { has: 'admin' },
      deactivated_at: null,
    });
    expect(prisma.userMetadata.count).toHaveBeenCalledWith({
      where: { profile_member_id: null, deactivated_at: null },
    });
  });

  it('không gửi khi tài khoản không còn tồn tại', async () => {
    const { service, prisma, mail } = setup();
    prisma.userMetadata.findUnique.mockResolvedValue(null);
    await service.handleAccountPending({ userId: 'u1' });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('mail chưa cấu hình: không ném (retry vô ích) và không gửi', async () => {
    const { service, mail } = setup();
    mail.isConfigured.mockReturnValue(false);
    await expect(service.handleAccountPending({ userId: 'u1' })).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('ném khi không có admin nào — để lỗi hiện ra, không im lặng', async () => {
    const { service, prisma } = setup();
    prisma.userMetadata.findMany.mockResolvedValue([]);
    await expect(service.handleAccountPending({ userId: 'u1' })).rejects.toThrow('bootstrap:admin');
  });

  it('ném khi không đọc được email admin nào, để QStash retry', async () => {
    const { service, emails } = setup();
    emails.a1 = null;
    emails.a2 = null;
    await expect(service.handleAccountPending({ userId: 'u1' })).rejects.toThrow('2 admin');
  });

  it('lỗi gửi mail được ném lại, để QStash retry', async () => {
    const { service, mail } = setup();
    mail.send.mockRejectedValue(new Error('Resend trả 500'));
    await expect(service.handleAccountPending({ userId: 'u1' })).rejects.toThrow('Resend trả 500');
  });
});
