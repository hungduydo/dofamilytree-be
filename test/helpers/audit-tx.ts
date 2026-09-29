/**
 * Bổ sung vào một mockPrisma các delegate mà transaction ghi của member / quan
 * hệ giờ đụng tới: `auditLog` (ghi lịch sử) và các bảng captureMemberSnapshot
 * đọc trước khi xoá. Chỉ THÊM method còn thiếu — mock sẵn có của spec giữ nguyên.
 *
 * Mặc định "rỗng": findMany → [], findUnique → null, updateMany → { count: 1 }.
 */
const DEFAULTS: Record<string, () => jest.Mock> = {
  findMany: () => jest.fn().mockResolvedValue([]),
  findUnique: () => jest.fn().mockResolvedValue(null),
  create: () => jest.fn().mockResolvedValue({}),
  createMany: () => jest.fn().mockResolvedValue({ count: 0 }),
  updateMany: () => jest.fn().mockResolvedValue({ count: 1 }),
};

const DELEGATES: Record<string, string[]> = {
  auditLog: ['create', 'updateMany', 'findMany', 'findUnique'],
  member: ['findUnique', 'findMany', 'create'],
  profile: ['findUnique', 'create'],
  userMetadata: ['findMany', 'findUnique', 'create'],
  memberRelationship: ['findMany', 'createMany'],
  lifeEvent: ['findMany', 'createMany'],
  memorialIncense: ['findMany', 'createMany'],
  eventAttendee: ['findMany', 'createMany'],
  event: ['findMany'],
  tree: ['findUnique'],
  anniversary: ['findMany', 'updateMany'],
  cemetery: ['findMany', 'updateMany'],
  media: ['findMany', 'updateMany'],
  memory: ['findMany', 'updateMany'],
  memorialTribute: ['findMany', 'updateMany'],
};

export function withAuditTx<T extends Record<string, any>>(mockPrisma: T): T {
  const target = mockPrisma as Record<string, any>;
  for (const [delegate, methods] of Object.entries(DELEGATES)) {
    target[delegate] ??= {};
    for (const m of methods) target[delegate][m] ??= DEFAULTS[m]();
  }
  target.$transaction ??= jest.fn();
  return mockPrisma;
}
