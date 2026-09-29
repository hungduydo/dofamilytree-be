import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { diffFields, markRestored, recordAudit } from '../../src/audit/audit-record';

describe('audit-record', () => {
  describe('diffFields', () => {
    it('chỉ giữ field thật sự đổi — form BO gửi lại cả hồ sơ mỗi lần lưu', () => {
      const d = diffFields(
        { name: 'A', gender: 'M', generation: 5 },
        { name: 'A', gender: 'F', generation: 5 },
        ['name', 'gender', 'generation'],
      );
      expect(d).toEqual({ before: { gender: 'M' }, after: { gender: 'F' } });
    });

    it('không đổi gì ⇒ null (caller bỏ qua, không ghi dòng rỗng)', () => {
      expect(diffFields({ name: 'A' }, { name: 'A' }, ['name'])).toBeNull();
    });

    it('so mảng theo giá trị, undefined/null coi như nhau', () => {
      expect(diffFields({ roleTags: ['a'] }, { roleTags: ['a'] }, ['roleTags'])).toBeNull();
      expect(diffFields({ notes: null }, { notes: undefined }, ['notes'])).toBeNull();
      expect(diffFields({}, { notes: 'x' }, ['notes'])).toEqual({ before: { notes: null }, after: { notes: 'x' } });
    });
  });

  it('recordAudit: Date thành ISO, thiếu before/after ghi DbNull', async () => {
    const tx = { auditLog: { create: jest.fn() } } as any;
    await recordAudit(tx, {
      entityType: 'member',
      entityId: 'm1',
      action: 'CREATE',
      after: { at: new Date('2026-01-02T03:04:05Z') },
    });
    const data = tx.auditLog.create.mock.calls[0][0].data;
    expect(data.after).toEqual({ at: '2026-01-02T03:04:05.000Z' });
    expect(data.before).toBe(Prisma.DbNull);
    expect(data.actor_id).toBeNull();
  });

  it('markRestored: điều kiện restored_at null nằm TRONG câu UPDATE; không trúng dòng nào ⇒ 409', async () => {
    const tx = { auditLog: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } } as any;
    await expect(markRestored(tx, 'a1', 'admin')).rejects.toThrow(ConflictException);
    expect(tx.auditLog.updateMany.mock.calls[0][0].where).toEqual({ id: 'a1', action: 'DELETE', restored_at: null });
  });
});
