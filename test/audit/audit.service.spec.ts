import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../src/audit/audit.service';

const NOW = new Date('2026-09-29T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function build(row: any) {
  const prisma: any = {
    auditLog: {
      findUnique: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    userMetadata: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const members = { restoreMember: jest.fn().mockResolvedValue({ id: 'm1', warnings: [] }) };
  const relationships = { restoreRelationship: jest.fn().mockResolvedValue({ id: 'r1', warnings: [] }) };
  return { prisma, members, relationships, service: new AuditService(prisma, members as any, relationships as any) };
}

describe('AuditService', () => {
  it('khôi phục member → MembersService.restoreMember với snapshot', async () => {
    const row = { id: 'a1', action: 'DELETE', entity_type: 'member', created_at: daysAgo(3), before: { member: { id: 'm1' } } };
    const t = build(row);
    await t.service.restore('a1', 'admin-1', NOW);
    expect(t.members.restoreMember).toHaveBeenCalledWith('a1', row.before, 'admin-1');
  });

  it('khôi phục quan hệ → RelationshipsService.restoreRelationship', async () => {
    const t = build({ id: 'a2', action: 'DELETE', entity_type: 'relationship', created_at: daysAgo(1), before: { id: 'r1' } });
    await t.service.restore('a2', 'admin-1', NOW);
    expect(t.relationships.restoreRelationship).toHaveBeenCalled();
  });

  it('dòng không phải DELETE hoặc không tồn tại ⇒ 404', async () => {
    await expect(build(null).service.restore('x', null, NOW)).rejects.toThrow(NotFoundException);
    await expect(
      build({ id: 'a', action: 'UPDATE', entity_type: 'member', created_at: NOW }).service.restore('a', null, NOW),
    ).rejects.toThrow(NotFoundException);
  });

  it('quá 30 ngày ⇒ 410', async () => {
    const t = build({ id: 'a', action: 'DELETE', entity_type: 'member', created_at: daysAgo(31), before: {} });
    await expect(t.service.restore('a', null, NOW)).rejects.toThrow(GoneException);
  });

  it('loại chưa hỗ trợ ⇒ 400', async () => {
    const t = build({ id: 'a', action: 'DELETE', entity_type: 'grave', created_at: NOW, before: {} });
    await expect(t.service.restore('a', null, NOW)).rejects.toThrow(BadRequestException);
  });

  it('thùng rác chỉ lấy DELETE chưa khôi phục trong 30 ngày, không kéo snapshot', async () => {
    const t = build(null);
    t.prisma.auditLog.findMany.mockResolvedValue([
      { id: 'a1', entity_type: 'member', entity_id: 'm1', summary: 'Xoá A', actor_id: 'u1', created_at: daysAgo(2) },
    ]);
    t.prisma.auditLog.count.mockResolvedValue(1);
    t.prisma.userMetadata.findMany.mockResolvedValue([
      { user_id: 'u1', claim_request: { fullName: 'Tự khai' }, profile_member: { name: 'Đỗ Văn Admin' } },
    ]);

    const res = await t.service.listTrash({ page: 1, pageSize: 20 }, NOW);

    const args = t.prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ action: 'DELETE', restored_at: null, created_at: { gte: daysAgo(30) } });
    expect(args.select).not.toHaveProperty('before');
    expect(res.data[0]).toMatchObject({ actorName: 'Đỗ Văn Admin', expiresAt: new Date(daysAgo(2).getTime() + 30 * 86_400_000) });
  });
});
