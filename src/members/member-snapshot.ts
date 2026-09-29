import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Snapshot đủ để khôi phục MỘT member đã xoá — lưu vào `audit_log.before`.
 *
 * Xoá một member kéo theo nhiều thứ ngoài `members` + `profiles`:
 *   - DB tự CASCADE: life_events, memorial_incense (và member_relationships /
 *     event_attendees nếu FK dưới DB là cascade — schema không nói rõ, nên chụp
 *     luôn: nếu FK là RESTRICT thì lệnh xoá fail và dòng audit rollback cùng).
 *   - DB tự SET NULL member_id: anniversaries, cemeteries, media, memories,
 *     memorial_tribute. Dòng vẫn còn, chỉ mất liên kết ⇒ chỉ cần lưu ID để gắn
 *     lại, không cần chụp cả dòng.
 *   - Service tự xoá: user_metadata trỏ tới member (tài khoản mất liên kết).
 *
 * Thiếu một trong số đó thì "khôi phục" trả về một người không còn ngày giỗ,
 * mộ, ảnh — tệ hơn là không khôi phục, vì admin tưởng đã xong.
 */
export interface MemberSnapshot {
  version: 1;
  member: Record<string, any>;
  profile: Record<string, any> | null;
  userMetadata: Record<string, any>[];
  relationships: Record<string, any>[];
  lifeEvents: Record<string, any>[];
  memorialIncense: Record<string, any>[];
  eventAttendees: Record<string, any>[];
  relinks: {
    anniversaries: string[];
    cemeteries: string[];
    media: string[];
    memories: string[];
    memorialTributes: string[];
  };
}

type Tx = Prisma.TransactionClient;

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

/** Chụp snapshot. Gọi TRONG transaction xoá, TRƯỚC lệnh xoá. null = không tồn tại. */
export async function captureMemberSnapshot(tx: Tx, memberId: string): Promise<MemberSnapshot | null> {
  const member = await tx.member.findUnique({ where: { id: memberId } });
  if (!member) return null;

  const byMember = { where: { member_id: memberId } };
  const idOnly = { ...byMember, select: { id: true } };

  const [
    profile, userMetadata, relationships, lifeEvents, memorialIncense, eventAttendees,
    anniversaries, cemeteries, media, memories, memorialTributes,
  ] = await Promise.all([
    tx.profile.findUnique(byMember),
    tx.userMetadata.findMany({ where: { profile_member_id: memberId } }),
    tx.memberRelationship.findMany({ where: { OR: [{ parent_id: memberId }, { child_id: memberId }] } }),
    tx.lifeEvent.findMany(byMember),
    tx.memorialIncense.findMany(byMember),
    tx.eventAttendee.findMany(byMember),
    tx.anniversary.findMany(idOnly),
    tx.cemetery.findMany(idOnly),
    tx.media.findMany(idOnly),
    tx.memory.findMany(idOnly),
    tx.memorialTribute.findMany(idOnly),
  ]);

  return {
    version: 1,
    member,
    profile,
    userMetadata,
    relationships,
    lifeEvents,
    memorialIncense,
    eventAttendees,
    relinks: {
      anniversaries: ids(anniversaries),
      cemeteries: ids(cemeteries),
      media: ids(media),
      memories: ids(memories),
      memorialTributes: ids(memorialTributes),
    },
  };
}

/**
 * Dựng lại member từ snapshot, giữ NGUYÊN id (link cũ, bookmark, ảnh đều trỏ
 * theo id). Những gì không dựng lại được vì bên kia đã đổi thì BỎ QUA và báo
 * trong `warnings` — khôi phục phần lớn tốt hơn là từ chối cả lần.
 */
export async function restoreMemberSnapshot(tx: Tx, snap: MemberSnapshot): Promise<string[]> {
  const warnings: string[] = [];
  const memberId: string = snap.member.id;

  if (await tx.member.findUnique({ where: { id: memberId }, select: { id: true } })) {
    throw new ConflictException('Member với id này đang tồn tại — không khôi phục đè được');
  }

  const member = { ...snap.member };
  if (member.tree_id && !(await tx.tree.findUnique({ where: { id: member.tree_id }, select: { id: true } }))) {
    warnings.push('Chi/nhánh cũ đã bị xoá — member được khôi phục không thuộc chi nào');
    member.tree_id = null;
  }
  await tx.member.create({ data: member as Prisma.MemberUncheckedCreateInput });

  if (snap.profile) {
    await tx.profile.create({ data: snap.profile as Prisma.ProfileUncheckedCreateInput });
  }

  for (const meta of snap.userMetadata) {
    // Tài khoản đó có thể đã được admin gắn lại vào người khác, hoặc đã có row
    // mới — không cướp lại.
    const existing = await tx.userMetadata.findUnique({ where: { user_id: meta.user_id }, select: { id: true } });
    if (existing) {
      warnings.push(`Tài khoản ${meta.user_id} đã có liên kết mới — không gắn lại`);
      continue;
    }
    await tx.userMetadata.create({ data: meta as Prisma.UserMetadataUncheckedCreateInput });
  }

  if (snap.relationships.length) {
    const otherIds = snap.relationships.map((r) => (r.parent_id === memberId ? r.child_id : r.parent_id));
    const alive = new Set(
      ids(await tx.member.findMany({ where: { id: { in: otherIds } }, select: { id: true } })),
    );
    const restorable = snap.relationships.filter((r) =>
      alive.has(r.parent_id === memberId ? r.child_id : r.parent_id),
    );
    const lost = snap.relationships.length - restorable.length;
    if (lost) warnings.push(`${lost} quan hệ không khôi phục được vì người bên kia đã bị xoá`);
    if (restorable.length) {
      await tx.memberRelationship.createMany({
        data: restorable as Prisma.MemberRelationshipCreateManyInput[],
        skipDuplicates: true,
      });
    }
  }

  if (snap.lifeEvents.length) {
    await tx.lifeEvent.createMany({ data: snap.lifeEvents as Prisma.LifeEventCreateManyInput[], skipDuplicates: true });
  }
  if (snap.memorialIncense.length) {
    await tx.memorialIncense.createMany({
      data: snap.memorialIncense as Prisma.MemorialIncenseCreateManyInput[],
      skipDuplicates: true,
    });
  }

  if (snap.eventAttendees.length) {
    const events = new Set(
      ids(
        await tx.event.findMany({
          where: { id: { in: snap.eventAttendees.map((a) => a.event_id) } },
          select: { id: true },
        }),
      ),
    );
    const keep = snap.eventAttendees.filter((a) => events.has(a.event_id));
    if (keep.length < snap.eventAttendees.length) {
      warnings.push(`${snap.eventAttendees.length - keep.length} lượt tham dự sự kiện đã bị xoá sự kiện`);
    }
    if (keep.length) {
      await tx.eventAttendee.createMany({ data: keep as Prisma.EventAttendeeCreateManyInput[], skipDuplicates: true });
    }
  }

  // Chỉ gắn lại dòng VẪN đang mồ côi (member_id null). Dòng đã được ai đó gắn
  // sang người khác trong lúc member nằm thùng rác thì giữ nguyên.
  const relink = { where: (list: string[]) => ({ id: { in: list }, member_id: null }), data: { member_id: memberId } };
  const r = snap.relinks;
  if (r.anniversaries.length) await tx.anniversary.updateMany({ where: relink.where(r.anniversaries), data: relink.data });
  if (r.cemeteries.length) await tx.cemetery.updateMany({ where: relink.where(r.cemeteries), data: relink.data });
  if (r.media.length) await tx.media.updateMany({ where: relink.where(r.media), data: relink.data });
  if (r.memories.length) await tx.memory.updateMany({ where: relink.where(r.memories), data: relink.data });
  if (r.memorialTributes.length) {
    await tx.memorialTribute.updateMany({ where: relink.where(r.memorialTributes), data: relink.data });
  }

  return warnings;
}
