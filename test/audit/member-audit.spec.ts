import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { TasksService } from '../../src/queue/tasks.service';
import { GenerationService } from '../../src/generation/generation.service';
import { MemberSnapshot, captureMemberSnapshot, restoreMemberSnapshot } from '../../src/members/member-snapshot';
import { Prisma } from '@prisma/client';
import { withAuditTx } from '../helpers/audit-tx';
import { removeVietnameseTones } from '../../src/utils/vietnamese-helper';

function makePrisma() {
  const prisma: any = withAuditTx({
    member: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    profile: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn(), delete: jest.fn().mockResolvedValue({}) },
    userMetadata: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
  });
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  return prisma;
}

async function build(prisma: any) {
  const module = await Test.createTestingModule({
    providers: [
      MembersService,
      { provide: PrismaService, useValue: prisma },
      { provide: QStashService, useValue: { publish: jest.fn().mockResolvedValue({}) } },
      { provide: TasksService, useValue: {} },
      { provide: GenerationService, useValue: { enqueueRecompute: jest.fn() } },
      { provide: 'REDIS_CLIENT', useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
    ],
  }).compile();
  return module.get(MembersService);
}

const auditCalls = (prisma: any) => prisma.auditLog.create.mock.calls.map((c: any) => c[0].data);

describe('MembersService — audit', () => {
  it('tạo member ghi CREATE kèm người tạo', async () => {
    const prisma = makePrisma();
    prisma.member.create.mockResolvedValue({ id: 'm1', name: 'Đỗ Văn A' });
    prisma.profile.create.mockResolvedValue({ id: 'p1', member_id: 'm1' });
    const service = await build(prisma);

    await service.createMember({ fullName: 'Đỗ Văn A' } as any, 'editor-1');

    expect(auditCalls(prisma)).toEqual([
      expect.objectContaining({ entity_type: 'member', entity_id: 'm1', action: 'CREATE', actor_id: 'editor-1' }),
    ]);
  });

  it('sửa member chỉ ghi field đổi, tách member / profile', async () => {
    const prisma = makePrisma();
    prisma.member.findUnique.mockResolvedValue({
      id: 'm1', name: 'A', normalized_name: removeVietnameseTones('A'), gender: 'M', lifeStatus: 'ALIVE', deathDate: null,
      profile: { fullName: 'A', occupation: 'Nông dân', biography: 'x' },
    });
    prisma.member.update.mockResolvedValue({ id: 'm1', name: 'A' });
    const service = await build(prisma);

    await service.updateMemberProfile(
      'm1',
      { fullName: 'A', gender: 'M', occupation: 'Kỹ sư', biography: 'x' } as any,
      undefined,
      { roles: ['editor'], profileMemberId: null },
      'editor-1',
    );

    const [row] = auditCalls(prisma);
    expect(row).toMatchObject({ action: 'UPDATE', actor_id: 'editor-1' });
    expect(row.before).toEqual({ member: {}, profile: { occupation: 'Nông dân' } });
    expect(row.after).toEqual({ member: {}, profile: { occupation: 'Kỹ sư' } });
  });

  it('lưu lại y nguyên ⇒ KHÔNG có dòng audit', async () => {
    const prisma = makePrisma();
    prisma.member.findUnique.mockResolvedValue({ id: 'm1', name: 'A', gender: 'M', profile: { occupation: 'Kỹ sư' } });
    prisma.member.update.mockResolvedValue({ id: 'm1', name: 'A' });
    const service = await build(prisma);

    await service.updateMemberProfile('m1', { gender: 'M', occupation: 'Kỹ sư' } as any, undefined, {
      roles: ['editor'], profileMemberId: null,
    });

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('xoá member ghi DELETE với snapshot TRƯỚC lệnh xoá, trong cùng transaction', async () => {
    const prisma = makePrisma();
    prisma.member.findUnique.mockResolvedValue({ id: 'm1', name: 'Đỗ Văn A' });
    prisma.profile.findUnique.mockResolvedValue({ id: 'p1', member_id: 'm1', phone: '0900' });
    prisma.anniversary.findMany.mockResolvedValue([{ id: 'ann-1' }]);
    prisma.lifeEvent.findMany.mockResolvedValue([{ id: 'le-1', member_id: 'm1' }]);
    const order: string[] = [];
    prisma.auditLog.create.mockImplementation(async () => order.push('audit'));
    prisma.member.delete.mockImplementation(async () => order.push('delete'));
    const service = await build(prisma);

    await service.deleteMember('m1', 'admin-1');

    expect(order).toEqual(['audit', 'delete']);
    const [row] = auditCalls(prisma);
    expect(row).toMatchObject({ action: 'DELETE', actor_id: 'admin-1', summary: 'Xoá Đỗ Văn A' });
    expect(row.before.profile.phone).toBe('0900');
    expect(row.before.relinks.anniversaries).toEqual(['ann-1']);
    expect(row.before.lifeEvents).toHaveLength(1);
  });
});

describe('member-snapshot', () => {
  const snap = (over: Partial<MemberSnapshot> = {}): MemberSnapshot => ({
    version: 1,
    member: { id: 'm1', name: 'A', tree_id: null },
    profile: { id: 'p1', member_id: 'm1' },
    userMetadata: [],
    relationships: [],
    lifeEvents: [],
    memorialIncense: [],
    eventAttendees: [],
    relinks: { anniversaries: [], cemeteries: [], media: [], memories: [], memorialTributes: [] },
    ...over,
  });

  it('captureMemberSnapshot: member không tồn tại ⇒ null', async () => {
    const prisma = makePrisma();
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(captureMemberSnapshot(prisma, 'x')).resolves.toBeNull();
  });

  it('id đã có người dùng ⇒ 409, không đè', async () => {
    const prisma = makePrisma();
    prisma.member.findUnique.mockResolvedValue({ id: 'm1' });
    await expect(restoreMemberSnapshot(prisma, snap())).rejects.toThrow(ConflictException);
    expect(prisma.member.create).not.toHaveBeenCalled();
  });

  it('dựng lại member + profile giữ nguyên id, gắn lại ngày giỗ / mộ CHỈ khi còn mồ côi', async () => {
    const prisma = makePrisma();
    prisma.member.findUnique.mockResolvedValue(null);
    await restoreMemberSnapshot(
      prisma,
      snap({ relinks: { anniversaries: ['ann-1'], cemeteries: ['c-1'], media: [], memories: [], memorialTributes: [] } }),
    );
    expect(prisma.member.create.mock.calls[0][0].data.id).toBe('m1');
    expect(prisma.profile.create).toHaveBeenCalled();
    expect(prisma.anniversary.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ann-1'] }, member_id: null },
      data: { member_id: 'm1' },
    });
    expect(prisma.cemetery.updateMany).toHaveBeenCalled();
    expect(prisma.media.updateMany).not.toHaveBeenCalled();
  });

  it('bỏ qua phần không dựng lại được và báo trong warnings', async () => {
    const prisma = makePrisma();
    prisma.member.findUnique.mockResolvedValue(null);
    prisma.tree.findUnique.mockResolvedValue(null); // chi cũ đã xoá
    prisma.member.findMany.mockResolvedValue([{ id: 'p-alive' }]); // chỉ còn 1 người bên kia
    prisma.userMetadata.findUnique.mockResolvedValue({ id: 'existing' }); // tài khoản đã có row mới

    const warnings = await restoreMemberSnapshot(
      prisma,
      snap({
        member: { id: 'm1', name: 'A', tree_id: 'tree-gone' },
        userMetadata: [{ id: 'um1', user_id: 'u1', profile_member_id: 'm1' }],
        relationships: [
          { id: 'r1', parent_id: 'p-alive', child_id: 'm1', type: 'BIOLOGICAL' },
          { id: 'r2', parent_id: 'p-gone', child_id: 'm1', type: 'BIOLOGICAL' },
        ],
      }),
    );

    expect(prisma.member.create.mock.calls[0][0].data.tree_id).toBeNull();
    expect(prisma.userMetadata.create).not.toHaveBeenCalled();
    expect(prisma.memberRelationship.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ id: 'r1' }),
    ]);
    expect(warnings).toHaveLength(3);
  });

  it('gắn lại tài khoản; claim_request null thành DbNull (Prisma từ chối null thô cho cột Json)', async () => {
    const prisma = makePrisma();
    prisma.member.findUnique.mockResolvedValue(null);
    prisma.userMetadata.findUnique.mockResolvedValue(null);
    await restoreMemberSnapshot(
      prisma,
      snap({ userMetadata: [{ id: 'um1', user_id: 'u1', profile_member_id: 'm1', roles: ['member'], claim_request: null }] }),
    );
    const data = prisma.userMetadata.create.mock.calls[0][0].data;
    expect(data.claim_request).toBe(Prisma.DbNull);
    expect(data.profile_member_id).toBe('m1');
  });
});
