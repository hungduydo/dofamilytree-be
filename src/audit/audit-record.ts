import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Ghi lịch sử thay đổi. Hàm THUẦN nhận `tx` chứ không phải một service inject:
 *
 *   - Dòng audit phải nằm TRONG CÙNG transaction với thay đổi. Ghi ngoài
 *     transaction thì hoặc có thay đổi mà không có dấu vết (audit lỗi sau
 *     commit), hoặc có dấu vết cho thay đổi đã rollback.
 *   - Không inject ⇒ MembersService / RelationshipsService không phải phụ thuộc
 *     AuditModule, còn AuditModule (khôi phục) phụ thuộc NGƯỢC lại hai service
 *     đó mà không vòng.
 */

export const AUDIT_ENTITY = {
  member: 'member',
  relationship: 'relationship',
} as const;
export type AuditEntity = (typeof AUDIT_ENTITY)[keyof typeof AUDIT_ENTITY];

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Bản ghi đã xoá khôi phục được trong bao lâu. Audit thì giữ mãi. */
export const TRASH_RETENTION_DAYS = 30;

type Tx = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AuditEntry {
  entityType: AuditEntity;
  entityId: string;
  action: AuditAction;
  /** null = hệ thống / script. */
  actorId?: string | null;
  /** Một dòng cho người đọc: "Xoá Nguyễn Văn A", "Thêm cha: A → B". */
  summary?: string;
  before?: unknown;
  after?: unknown;
}

export async function recordAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: entry.action,
      actor_id: entry.actorId ?? null,
      summary: entry.summary ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}

/**
 * Đánh dấu một dòng DELETE là đã khôi phục. Điều kiện `restored_at: null` nằm
 * TRONG câu UPDATE (không đọc-rồi-ghi) nên hai admin bấm khôi phục cùng lúc thì
 * chỉ một người thắng; người kia nhận 409 và transaction của họ rollback.
 */
export async function markRestored(tx: Tx, auditId: string, actorId: string | null): Promise<void> {
  const { count } = await tx.auditLog.updateMany({
    where: { id: auditId, action: 'DELETE', restored_at: null },
    data: { restored_at: new Date(), restored_by: actorId },
  });
  if (count === 0) throw new ConflictException('Bản ghi này đã được khôi phục rồi');
}

/**
 * Chỉ giữ các field ĐỔI giữa hai object phẳng: `{ field: giá trị }` ở hai phía.
 * So bằng JSON để Date / mảng so theo giá trị. Trả null khi không có gì đổi —
 * caller dùng nó để bỏ qua dòng audit rỗng.
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  fields: readonly string[],
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    const prev = before?.[f] ?? null;
    const next = after[f] ?? null;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      b[f] = prev;
      a[f] = next;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

/** Date → ISO; undefined → DbNull (Prisma không nhận undefined cho cột Json). */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
