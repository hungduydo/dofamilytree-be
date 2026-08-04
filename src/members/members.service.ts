import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Redis as UpstashRedis } from '@upstash/redis';
import { QStashService } from '../queue/qstash.service';
import { TasksService } from '../queue/tasks.service';
import { runInBackground } from '../utils/run-in-background';
import { SafeCache } from '../utils/safe-cache';
import { PrismaService } from '../prisma/prisma.service';
import {
  CACHE_KEY_MEMBERS_COMMITTEE,
  CACHE_KEY_MEMBERS_NOTABLE,
  CACHE_KEY_MEMBERS_STATS,
  MEMBERS_CACHE_KEYS,
  MEMBERS_CACHE_TTL_LIST,
  MEMBERS_CACHE_TTL_STATS,
} from './members.cache-keys';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { removeVietnameseTones } from '../utils/vietnamese-helper';
import { GenerationService } from '../generation/generation.service';
import {
  QUEUE_REPORT_GENERATE,
  QUEUE_NOTIFICATION,
} from '../queue/queue.constants';
import { MemberView } from './members.view';
import {
  MEMBER_LITE_SELECT,
  MEMBER_TABLE_SELECT,
  TREE_BRIEF_SELECT,
  RELATIONSHIP_EDGE_SELECT,
} from './members.select';

/**
 * Allowlist cho `sortBy`. Giá trị từ query string KHÔNG bao giờ được nội suy
 * thẳng vào `orderBy` — chỉ những khoá ở đây mới đi tiếp.
 */
export const MEMBER_SORT_FIELDS = ['created_at', 'name', 'generation'] as const;
export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

/** Allowlist cho `?gender=` — cùng cơ chế MEMBER_SORT_FIELDS. */
export const MEMBER_GENDERS = ['M', 'F', 'O', 'U'] as const;

/** Shape gọn cache được cho hai endpoint public (khớp CommitteeMemberDto/NotableMemberDto). */
export interface CommitteeMember { id: string; name: string; role: string; avatar: string }
export interface NotableMember { id: string; name: string; description: string; avatar: string }
export interface MemberStats { total: number; male: number; female: number; newThisMonth: number; generations: number }

/**
 * Việt Nam là UTC+7 cố định (không DST từ 1975), nên offset cứng là đúng và
 * không phải kéo thêm thư viện timezone.
 */
const VN_UTC_OFFSET_MINUTES = 7 * 60;

/**
 * Mốc đầu tháng theo giờ VN, trả về instant UTC. Bind thẳng vào query như một
 * `Date` — KHÔNG dùng `date_trunc(... AT TIME ZONE ...)` vì `members.created_at`
 * là `timestamp` (không timezone), so với `timestamptz` sẽ ép kiểu ngầm qua GUC
 * `TimeZone` của session.
 */
export function startOfMonthVN(now = new Date()): Date {
  const vnNow = new Date(now.getTime() + VN_UTC_OFFSET_MINUTES * 60_000);
  const vnMonthStartAsUtc = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), 1);
  return new Date(vnMonthStartAsUtc - VN_UTC_OFFSET_MINUTES * 60_000);
}

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);
  private readonly cache: SafeCache;

  constructor(
    private readonly prisma: PrismaService,
    private readonly qstashService: QStashService,
    private readonly tasksService: TasksService,
    private readonly generationService: GenerationService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
  ) {
    this.cache = new SafeCache(this.redis, this.logger, MEMBERS_CACHE_TTL_LIST);
  }

  /**
   * Map the UI's clanRole onto the existing Profile.committeeRole/isCommittee columns.
   * TRUONG_TOC / PHO_TRUONG_TOC => committee member; THANH_VIEN (or unset) => not a committee role.
   */
  private clanRoleToCommittee(clanRole?: string): { committeeRole: string | null; isCommittee: boolean } | undefined {
    if (clanRole === undefined) return undefined;
    if (clanRole === 'THANH_VIEN') return { committeeRole: null, isCommittee: false };
    return { committeeRole: clanRole, isCommittee: true };
  }

  /**
   * Committee members — members whose profile notes contain "committee" or "ban quản lý"
   * Returns shape: { id, name, role, avatar }
   */
  async getCommitteeMembers() {
    const cached = await this.cache.get<CommitteeMember[]>(CACHE_KEY_MEMBERS_COMMITTEE);
    if (cached) return cached;

    const members = await this.prisma.member.findMany({
      where: {
        profile: {
          notes: { not: null },
          OR: [
            { notes: { contains: 'committee', mode: 'insensitive' } },
            { notes: { contains: 'ban quản lý', mode: 'insensitive' } },
            { notes: { contains: 'hội đồng', mode: 'insensitive' } },
          ],
        },
      },
      // include:{profile:true} kéo cả biography/notes chỉ để đọc occupation.
      select: { id: true, name: true, avatar_url: true, profile: { select: { occupation: true } } },
      orderBy: { created_at: 'asc' },
      // Trước đây KHÔNG có take — một lần sửa dữ liệu sai là endpoint public này
      // trả về cả bảng. 50 rộng hơn số hiện tại rất nhiều nên không đổi kết quả.
      take: 50,
    });

    const result: CommitteeMember[] = members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.profile?.occupation ?? '',
      avatar: m.avatar_url ?? '',
    }));

    await this.cache.set(CACHE_KEY_MEMBERS_COMMITTEE, result, MEMBERS_CACHE_TTL_LIST);
    return result;
  }

  /**
   * Notable members — members whose profile biography is not empty
   * Returns shape: { id, name, description, avatar }
   */
  async getNotableMembers() {
    const cached = await this.cache.get<NotableMember[]>(CACHE_KEY_MEMBERS_NOTABLE);
    if (cached) return cached;

    const members = await this.prisma.member.findMany({
      where: {
        profile: {
          biography: { not: null },
          NOT: { biography: '' },
        },
      },
      select: { id: true, name: true, avatar_url: true, profile: { select: { biography: true } } },
      orderBy: { created_at: 'asc' },
      take: 9,
    });

    const result: NotableMember[] = members.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.profile?.biography ?? '',
      avatar: m.avatar_url ?? '',
    }));

    await this.cache.set(CACHE_KEY_MEMBERS_NOTABLE, result, MEMBERS_CACHE_TTL_LIST);
    return result;
  }

  /**
   * Table listing for the BO /members page: paginated, with full profile + tree,
   * optionally filtered by `name` (Vietnamese-insensitive). Used by the admin table
   * search — NOT the lightweight autocomplete search (see `searchMembers` below).
   */
  async getAllMembers(
    page = 1,
    pageSize = 10,
    name?: string,
    generation?: number,
    sortBy: MemberSortField = 'created_at',
    sortOrder: SortOrder = 'desc',
    view: MemberView = 'full',
    treeId?: string,
    gender?: string,
  ) {
    // `take` phải tính TRƯỚC rồi mới suy ra `skip`. Trước đây `skip` dùng
    // `pageSize` chưa cap trong khi `take` cap ở 100, nên ?pageSize=1000&page=2
    // trả về dòng 1001–1100 thay vì 101–200. Clamp ≥1 để pageSize=0 không ra NaN.
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const where = {
      ...this.nameSearchWhere(name),
      ...(generation !== undefined ? { generation } : {}),
      ...(treeId ? { tree_id: treeId } : {}),
      ...(gender && (MEMBER_GENDERS as readonly string[]).includes(gender) ? { gender } : {}),
    };

    const field: MemberSortField = MEMBER_SORT_FIELDS.includes(sortBy) ? sortBy : 'created_at';
    const order: SortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    // Luôn có khoá phụ: phân trang trên cột ít giá trị (generation, name) mà
    // không có tiebreaker sẽ sinh dòng trùng/thiếu giữa các trang.
    const orderBy =
      field === 'generation'
        ? [{ generation: { sort: order, nulls: 'last' as const } }, { id: 'asc' as const }]
        : [{ [field]: order }, { id: 'asc' as const }];

    // ĐÚNG một trong hai khoá — `select` và `include` cạnh nhau là lỗi Prisma.
    // `full` giữ `include` (cột mới trong schema tự xuất hiện, đúng hợp đồng
    // "full = nguyên row Member"); chỉ thu hẹp `tree` xuống {id,title} cho khớp
    // MemberTreeBriefDto mà swagger vẫn hứa.
    const shape: Pick<Prisma.MemberFindManyArgs, 'select' | 'include'> =
      view === 'lite'
        ? { select: MEMBER_LITE_SELECT }
        : view === 'table'
          ? { select: MEMBER_TABLE_SELECT }
          : { include: { profile: true, tree: { select: TREE_BRIEF_SELECT } } };

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip,
        take,
        orderBy,
        ...shape,
      }),
      this.prisma.member.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  private nameSearchWhere(query?: string) {
    if (!query?.trim()) return undefined;
    const normalized = removeVietnameseTones(query);
    return {
      OR: [
        { normalized_name: { contains: normalized, mode: 'insensitive' as const } },
        { name: { contains: query, mode: 'insensitive' as const } },
      ],
    };
  }

  /**
   * Search tên cho <select>/autocomplete (MemberAutocomplete): unpaginated, chỉ
   * trả đủ để render một option và lấy `id`. Trước đây trả toàn bộ cột Member
   * (+ profile khi includeProfile) — thừa ~10× cho use-case này.
   */
  async searchMembers(query: string) {
    if (!query?.trim()) return [];
    return this.prisma.member.findMany({
      where: this.nameSearchWhere(query),
      select: MEMBER_LITE_SELECT,
      // Trước đây KHÔNG có orderBy: với take:50 thì 50 dòng nào lọt vào là tuỳ
      // planner, đổi giữa hai lần gọi giống hệt nhau. Autocomplete cần ổn định.
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 50,
    });
  }

  async getMemberById(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      // Thu hẹp `tree` xuống {id,title} cho khớp MemberTreeBriefDto (đóng drift +
      // chặn leak owner_id). Profile giữ nguyên full.
      include: { profile: true, tree: { select: TREE_BRIEF_SELECT } },
    });
    if (!member) throw new NotFoundException(`Member ${id} not found`);
    return member;
  }

  async getMemberProfile(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        profile: true, // chính chủ — GIỮ NGUYÊN, đây là mục đích của endpoint
        tree: { select: TREE_BRIEF_SELECT },
        // Người thân chỉ cần đủ render một chip/link — bỏ hẳn profile lồng.
        // Trước đây mỗi người kèm full Member + full Profile (cả biography):
        // 8 người thân là 8 biography không ai render.
        parent_relationships: {
          select: { ...RELATIONSHIP_EDGE_SELECT, parent: { select: MEMBER_LITE_SELECT } },
        },
        child_relationships: {
          select: { ...RELATIONSHIP_EDGE_SELECT, child: { select: MEMBER_LITE_SELECT } },
        },
      },
    });
    if (!member) throw new NotFoundException(`Member ${id} not found`);
    return member;
  }

  async createMember(dto: CreateMemberDto) {
    if (!dto.fullName?.trim()) {
      throw new BadRequestException('fullName is required');
    }

    const normalizedName = removeVietnameseTones(dto.fullName);

    const committee = this.clanRoleToCommittee(dto.clanRole);

    const member = await this.prisma.$transaction(async (tx) => {
      const newMember = await tx.member.create({
        data: {
          name: dto.fullName,
          normalized_name: normalizedName,
          gender: dto.gender,
          birthDate: dto.birthDate,
          deathDate: dto.deathDate,
          tree_id: dto.tree_id,
          // Giá trị nhập tay hiện ngay, không phải chờ job nền chạy xong.
          generation: dto.generation ?? null,
        },
      });

      await tx.profile.create({
        data: {
          member_id: newMember.id,
          fullName: dto.fullName,
          generation: dto.generation,
          occupation: dto.occupation,
          address: dto.address,
          biography: dto.biography,
          phone: dto.phone,
          contactEmail: dto.contactEmail,
          familyPosition: dto.familyPosition,
          roleTags: dto.roleTags ?? [],
          ...(committee ?? {}),
        },
      });

      return newMember;
    });

    // Tạo mới đổi total + newThisMonth (và có thể committee/notable). Await —
    // xem invalidateMemberCaches. Không fire-and-forget để tránh race + serverless freeze.
    await this.invalidateMemberCaches();

    // Queue notifications and report update (best-effort, don't fail the operation)
    Promise.all([
      this.qstashService.publish(QUEUE_NOTIFICATION, { type: 'NEW_MEMBER', message: `New member: ${member.name}`, payload: { id: member.id, name: member.name } }),
      this.qstashService.publish(QUEUE_REPORT_GENERATE, {}),
    ]).catch(() => {});
    this.generationService.enqueueRecompute();

    return member;
  }

  /**
   * Xoá cache ba endpoint public sau một lần ghi. Xoá thừa (cả ba khoá) rẻ hơn
   * nhiều so với truy vết field nào ảnh hưởng khoá nào: create/delete đổi
   * total + newThisMonth; update có thể đổi gender (male/female), notes
   * (committee) hoặc biography (notable).
   *
   * PHẢI await, KHÔNG fire-and-forget: trên Vercel serverless function có thể bị
   * đóng băng ngay khi response ghi xong ⇒ DEL không await có thể không bao giờ
   * chạy; và nó race với GET đồng thời đang re-populate giá trị cũ. SafeCache.del
   * nuốt mọi lỗi và bị chặn ~300ms (AbortSignal.timeout + retry:false) nên không
   * thể fail hay làm chậm đáng kể write.
   */
  private invalidateMemberCaches(): Promise<void> {
    return this.cache.del(...MEMBERS_CACHE_KEYS);
  }

  async updateMemberProfile(id: string, dto: UpdateMemberDto, avatarFile?: Express.Multer.File) {
    const existing = await this.prisma.member.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!existing) throw new NotFoundException(`Member ${id} not found`);

    const updated = await this.prisma.$transaction(async (tx) => {
      const memberData: any = {};
      if (dto.fullName) {
        memberData.name = dto.fullName;
        memberData.normalized_name = removeVietnameseTones(dto.fullName);
      }
      if (dto.gender) memberData.gender = dto.gender;
      if (dto.birthDate !== undefined) memberData.birthDate = dto.birthDate;
      if (dto.deathDate !== undefined) memberData.deathDate = dto.deathDate;
      if (dto.tree_id !== undefined) memberData.tree_id = dto.tree_id;
      // Mirror giá trị nhập tay sang cột hiệu lực để editor thấy ngay; job nền
      // sau đó lan nó xuống hậu duệ.
      if (dto.generation !== undefined) memberData.generation = dto.generation;

      const updatedMember = await tx.member.update({ where: { id }, data: memberData });

      const profileData: any = {};
      if (dto.fullName) profileData.fullName = dto.fullName;
      if (dto.generation !== undefined) profileData.generation = dto.generation;
      if (dto.occupation !== undefined) profileData.occupation = dto.occupation;
      if (dto.address !== undefined) profileData.address = dto.address;
      if (dto.biography !== undefined) profileData.biography = dto.biography;
      if (dto.notes !== undefined) profileData.notes = dto.notes;
      if (dto.phone !== undefined) profileData.phone = dto.phone;
      if (dto.contactEmail !== undefined) profileData.contactEmail = dto.contactEmail;
      if (dto.familyPosition !== undefined) profileData.familyPosition = dto.familyPosition;
      if (dto.roleTags !== undefined) profileData.roleTags = dto.roleTags;
      const committee = this.clanRoleToCommittee(dto.clanRole);
      if (committee) Object.assign(profileData, committee);

      if (Object.keys(profileData).length > 0 && existing.profile) {
        await tx.profile.update({ where: { member_id: id }, data: profileData });
      }

      return updatedMember;
    });

    // Update có thể đổi gender/notes/biography → xoá cache ba endpoint public.
    await this.invalidateMemberCaches();

    // Một pin thủ công lan xuống toàn bộ hậu duệ, nên phải tính lại cả cây.
    if (dto.generation !== undefined) this.generationService.enqueueRecompute();

    // Upload avatar off the request path. Called directly (not via QStash) since the
    // webhook callback requires a publicly reachable APP_URL, which local dev lacks.
    if (avatarFile) {
      runInBackground(
        this.tasksService.handleAvatarUpload({
          memberId: id,
          buffer: avatarFile.buffer.toString('base64'),
          filename: avatarFile.originalname,
          mimetype: avatarFile.mimetype,
        }),
      );
    }

    return updated;
  }

  /**
   * Aggregate figures for the /members header tiles (replaces the old client-side
   * "fetch every member and count" approach and the FE MOCK_MEMBER_STATS constant).
   */
  async getMemberStats() {
    const cached = await this.cache.get<MemberStats>(CACHE_KEY_MEMBERS_STATS);
    if (cached) return cached;

    const monthStart = startOfMonthVN();

    // MỘT lượt quét `members` thay vì 5 round-trip. `COUNT(DISTINCT generation)`
    // chạy TRONG Postgres — `distinct` của Prisma áp ở engine nên phải kéo toàn
    // bộ dòng về chỉ để đếm ~6 giá trị.
    const [row] = await this.prisma.$queryRaw<
      Array<{ total: bigint; male: bigint; female: bigint; new_this_month: bigint; generations: bigint }>
    >`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE gender = 'M')                  AS male,
        COUNT(*) FILTER (WHERE gender = 'F')                  AS female,
        COUNT(*) FILTER (WHERE created_at >= ${monthStart})   AS new_this_month,
        COUNT(DISTINCT generation)                            AS generations
      FROM members
    `;

    // BẮT BUỘC ép Number: COUNT của Postgres là int8 → Prisma trả BigInt →
    // JSON.stringify NÉM "Do not know how to serialize a BigInt".
    const result: MemberStats = {
      total: Number(row.total),
      male: Number(row.male),
      female: Number(row.female),
      newThisMonth: Number(row.new_this_month),
      generations: Number(row.generations),
    };

    await this.cache.set(CACHE_KEY_MEMBERS_STATS, result, MEMBERS_CACHE_TTL_STATS);
    return result;
  }

  /**
   * Tính lại thế hệ toàn bộ, chạy đồng bộ (admin). Job nền đã tự chạy sau mỗi
   * lần ghi — endpoint này dành cho sửa dữ liệu ngoài luồng hoặc khi cần kết quả
   * ngay thay vì chờ cửa sổ debounce.
   */
  async recomputeGenerations(requesterId: string) {
    const requesterMeta = await this.prisma.userMetadata.findUnique({
      where: { user_id: requesterId },
    });
    if (!requesterMeta?.roles.includes('admin')) {
      throw new ForbiddenException('Admin role required to recompute generations');
    }
    return this.generationService.recomputeAll();
  }

  async deleteMember(id: string) {
    const member = await this.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundException(`Member ${id} not found`);

    await this.prisma.$transaction(async (tx) => {
      await tx.profile.delete({ where: { member_id: id } }).catch(() => {}); // profile may not exist
      await tx.userMetadata.deleteMany({ where: { profile_member_id: id } });
      await tx.member.delete({ where: { id } });
    });

    // Xoá đổi total + newThisMonth → xoá cache ba endpoint public.
    await this.invalidateMemberCaches();

    // Best-effort queue notification — don't fail the delete
    this.qstashService.publish(QUEUE_REPORT_GENERATE, {}).catch(() => {});
    // Xoá một member có thể cắt rời cả một nhánh khỏi gốc.
    this.generationService.enqueueRecompute();
  }
}
