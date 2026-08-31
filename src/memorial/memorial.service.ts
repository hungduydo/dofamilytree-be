import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Redis as UpstashRedis } from '@upstash/redis';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseUsersService } from '../supabase/supabase-users.service';
import { SafeCache } from '../utils/safe-cache';
import {
  CACHE_KEY_MEMORIAL_STATS,
  MEMORIAL_CACHE_KEYS,
  MEMORIAL_CACHE_TTL,
  memorialAncestorsKey,
  memorialTributesKey,
} from './memorial.cache-keys';
import { MEMORIAL_ANCESTOR_SELECT, MEMORIAL_TRIBUTE_SELECT } from './memorial.select';
import type {
  BurnIncenseResponseDto,
  MemorialAncestorDto,
  MemorialStatsDto,
  MemorialTributeDto,
} from './dto/memorial.dto';

/** Trần pageSize, giống MembersService.getAllMembers. */
const MAX_PAGE_SIZE = 100;

/**
 * Tên hiển thị cuối cùng khi không tra được nguồn nào. CỐ Ý là một hằng chứ
 * không phải email: `GET /memorial/tributes` là endpoint PUBLIC, và
 * MediaService.resolveUploaderName đã lập tiền lệ cấm email ở đúng tình huống
 * này. Type của FE là `authorName: string` (không nullable) nên phải có gì đó.
 */
const ANONYMOUS_AUTHOR = 'Thành viên dòng họ';

/**
 * "Đã khuất" = có ngày mất THẬT. api-memorial.md §2 nói "deathDate khác null",
 * nhưng dữ liệu thật KHÔNG chỉ có null: 12/25 member có `deathDate = ''` (chuỗi
 * rỗng do form v1 gửi lên) và tất cả đều còn sống. Chỉ lọc `not: null` là gần
 * một nửa danh sách tổ tiên thành người đang sống — trong đó có cả người bị gắn
 * nhãn "Thủy tổ".
 *
 * `deathDate` là String tự do chứ không phải DateTime, nên đây là chỗ duy nhất
 * biết cách đọc nó. Mọi query "người đã khuất" trong module này PHẢI dùng hằng
 * này, và index members_deceased_order_idx (005_memorial.sql) có mệnh đề WHERE
 * khớp CHÍNH XÁC với nó — sửa một bên phải sửa bên kia, nếu không index ngừng
 * phục vụ và query rơi về seq scan.
 */
export const DECEASED_WHERE: Prisma.MemberWhereInput = {
  AND: [{ deathDate: { not: null } }, { deathDate: { not: '' } }],
};

/** Người gọi, lấy từ req.user (jwt.strategy.validate). */
export interface MemorialCaller {
  id: string;
  displayName?: string | null;
  profileMemberId?: string | null;
}

@Injectable()
export class MemorialService {
  private readonly logger = new Logger(MemorialService.name);
  private readonly cache: SafeCache;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseUsers: SupabaseUsersService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
  ) {
    this.cache = new SafeCache(this.redis, this.logger, MEMORIAL_CACHE_TTL);
  }

  // ─── Đọc ──────────────────────────────────────────────────────────────────

  /**
   * Ba con số trên ban thờ. MỘT round-trip cho cả ba thay vì ba `count()` —
   * cùng thủ pháp MembersService.getMemberStats dùng.
   *
   * `generations` = MAX(members.generation), ĐÚNG công thức TreeService.computeStats
   * dùng (tree.service.ts). Không tự suy ra kiểu khác, nếu không hai trang trong
   * cùng một site sẽ hiện hai số "đời" khác nhau.
   */
  async getStats(): Promise<MemorialStatsDto> {
    const cached = await this.cache.get<MemorialStatsDto>(CACHE_KEY_MEMORIAL_STATS);
    if (cached) return cached;

    // COUNT của Postgres trả int8 → BigInt trong Prisma. KHÔNG bọc Number() thì
    // JSON.stringify ném "Do not know how to serialize a BigInt" ở tầng response.
    const [row] = await this.prisma.$queryRaw<
      Array<{ generations: bigint | number; incense_total: bigint; tribute_total: bigint }>
    >`
      SELECT (SELECT COALESCE(MAX(generation), 0) FROM members) AS generations,
             (SELECT COUNT(*) FROM memorial_incense)            AS incense_total,
             (SELECT COUNT(*) FROM memorial_tribute)            AS tribute_total
    `;

    const stats: MemorialStatsDto = {
      generations: Number(row?.generations ?? 0),
      incenseTotal: Number(row?.incense_total ?? 0),
      tributeTotal: Number(row?.tribute_total ?? 0),
    };
    await this.cache.set(CACHE_KEY_MEMORIAL_STATS, stats, MEMORIAL_CACHE_TTL);
    return stats;
  }

  /**
   * Tổ tiên = member CÓ ngày mất. Không cờ riêng, không bảng tuyển chọn — xem
   * api-memorial.md §2.
   *
   * Thứ tự: generation ASC NULLS LAST, deathDate ASC, name ASC, id ASC. `id` là
   * tiebreaker để phân trang ổn định (cùng quy ước với getAllMembers). Index
   * members_deceased_order_idx (partial, 005_memorial.sql) phục vụ trọn bộ lọc +
   * sắp xếp + phân trang.
   */
  async getAncestors(page: number, pageSize: number) {
    const take = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
    const currentPage = Math.max(page, 1);
    const skip = (currentPage - 1) * take;

    const cacheKey = currentPage === 1 ? memorialAncestorsKey(take) : null;
    if (cacheKey) {
      const cached = await this.cache.get<{ data: MemorialAncestorDto[]; total: number }>(cacheKey);
      if (cached) return { ...cached, page: currentPage, pageSize: take };
    }

    const where = DECEASED_WHERE;

    const [rows, total, minGen] = await Promise.all([
      this.prisma.member.findMany({
        where,
        orderBy: [
          { generation: { sort: 'asc', nulls: 'last' } },
          { deathDate: 'asc' },
          { name: 'asc' },
          { id: 'asc' },
        ],
        skip,
        take,
        select: MEMORIAL_ANCESTOR_SELECT,
      }),
      this.prisma.member.count({ where }),
      // "Thủy tổ" = thế hệ THẤP NHẤT của CẢ CÂY, không hardcode 1: cây này bắt
      // rễ ở đời 0, cây khác có thể nhập từ đời 2 trở đi.
      //
      // CỐ Ý tính trên toàn bộ members chứ KHÔNG chỉ trên người đã khuất. Trên
      // dữ liệu hiện tại, người ở đời gốc chưa được nhập ngày mất nên không có
      // mặt trong danh sách này, và kết quả là KHÔNG AI mang nhãn "Thủy tổ" —
      // đúng như mong muốn. Nếu tính _min chỉ trong nhóm đã khuất thì người đời
      // thấp nhất CÒN LẠI sẽ bị phong nhầm là thủy tổ dù cha ông họ vẫn nằm
      // trong cây. Thiếu nhãn còn hơn gắn sai nhãn.
      this.prisma.member.aggregate({ _min: { generation: true } }),
    ]);

    const incenseByMember = await this.countIncenseFor(rows.map((row) => row.id));
    const founderGeneration = minGen._min.generation;

    const data: MemorialAncestorDto[] = rows.map((row) => ({
      memberId: row.id,
      name: row.name,
      birthDate: row.birthDate,
      deathDate: row.deathDate,
      generation: row.generation,
      isFounder: row.generation != null && row.generation === founderGeneration,
      avatarUrl: row.avatar_url,
      incenseCount: incenseByMember.get(row.id) ?? 0,
    }));

    if (cacheKey) await this.cache.set(cacheKey, { data, total }, MEMORIAL_CACHE_TTL);
    return { data, total, page: currentPage, pageSize: take };
  }

  /**
   * MỘT query gộp cho cả trang, KHÔNG phải mỗi thẻ một lần đếm. Lượt clan-wide
   * có `member_id = null` nên `in: ids` tự động loại chúng ra — đúng yêu cầu
   * "lượt gửi tổ tiên nói chung không được quy cho cá nhân nào".
   */
  private async countIncenseFor(memberIds: string[]): Promise<Map<string, number>> {
    if (memberIds.length === 0) return new Map();
    const grouped = await this.prisma.memorialIncense.groupBy({
      by: ['member_id'],
      where: { member_id: { in: memberIds } },
      _count: { _all: true },
    });
    return new Map(
      grouped
        .filter((g): g is typeof g & { member_id: string } => g.member_id !== null)
        .map((g) => [g.member_id, g._count._all]),
    );
  }

  async getTributes(page: number, pageSize: number, memberId?: string) {
    const take = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
    const currentPage = Math.max(page, 1);
    const skip = (currentPage - 1) * take;

    // Bộ lọc theo cụ không cache: nó là đường phụ, ít lượt gọi, và thêm một
    // chiều nữa vào khoá là mở đường cho cache phình không kiểm soát.
    const cacheKey = currentPage === 1 && !memberId ? memorialTributesKey(take) : null;
    if (cacheKey) {
      const cached = await this.cache.get<{ data: MemorialTributeDto[]; total: number }>(cacheKey);
      if (cached) return { ...cached, page: currentPage, pageSize: take };
    }

    const where: Prisma.MemorialTributeWhereInput = memberId ? { member_id: memberId } : {};

    const [rows, total] = await Promise.all([
      this.prisma.memorialTribute.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: MEMORIAL_TRIBUTE_SELECT,
      }),
      this.prisma.memorialTribute.count({ where }),
    ]);

    const data = rows.map(toTributeDto);
    if (cacheKey) await this.cache.set(cacheKey, { data, total }, MEMORIAL_CACHE_TTL);
    return { data, total, page: currentPage, pageSize: take };
  }

  // ─── Ghi ──────────────────────────────────────────────────────────────────

  async burnIncense(caller: MemorialCaller, memberId?: string): Promise<BurnIncenseResponseDto> {
    if (memberId) await this.assertDeceasedMember(memberId);

    try {
      await this.prisma.memorialIncense.create({
        data: {
          member_id: memberId ?? null,
          user_id: caller.id,
          offered_on: new Date(todayInVietnam()),
        },
      });
    } catch (error) {
      // P2002 = vi phạm unique. Việc chặn 1 lượt/user/người-nhận/ngày nằm ở HAI
      // partial unique index (005_memorial.sql), không phải ở đây: không tốn
      // round-trip kiểm tra trước, và hai request đồng thời không lách qua được
      // như SELECT-rồi-INSERT.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          memberId
            ? 'Hôm nay bạn đã thắp hương cho cụ rồi. Xin mời trở lại vào ngày mai.'
            : 'Hôm nay bạn đã thắp hương rồi. Xin mời trở lại vào ngày mai.',
        );
      }
      throw error;
    }

    // Hai COUNT trong MỘT round-trip. Lượt clan-wide không thuộc về ai nên
    // incenseCount trả 0 — đúng hợp đồng ở api-memorial.md §3.4.
    const [row] = await this.prisma.$queryRaw<Array<{ member_count: bigint; total: bigint }>>`
      SELECT COUNT(*) FILTER (WHERE member_id = ${memberId ?? null}::uuid) AS member_count,
             COUNT(*)                                                      AS total
      FROM memorial_incense
    `;

    await this.invalidateMemorialCaches();
    return {
      incenseCount: memberId ? Number(row?.member_count ?? 0) : 0,
      incenseTotal: Number(row?.total ?? 0),
    };
  }

  async createTribute(
    caller: MemorialCaller,
    content: string,
    memberId?: string,
  ): Promise<MemorialTributeDto> {
    if (memberId) await this.assertDeceasedMember(memberId);

    const created = await this.prisma.memorialTribute.create({
      data: {
        content,
        member_id: memberId ?? null,
        user_id: caller.id,
        author_name: await this.resolveAuthorName(caller),
      },
      select: MEMORIAL_TRIBUTE_SELECT,
    });

    await this.invalidateMemorialCaches();
    return toTributeDto(created);
  }

  async deleteTribute(id: string): Promise<void> {
    // deleteMany (không phải delete) để "đã bị xoá rồi" là 404 của ta chứ không
    // phải P2025 rơi ra thành 500.
    const { count } = await this.prisma.memorialTribute.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundException('Không tìm thấy lời tưởng niệm này');
    await this.invalidateMemorialCaches();
  }

  // ─── Hỗ trợ ───────────────────────────────────────────────────────────────

  /** 404 nếu không có member; 422 nếu còn sống — hương chỉ dành cho người đã khuất. */
  private async assertDeceasedMember(memberId: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, deathDate: true },
    });
    if (!member) throw new NotFoundException('Không tìm thấy thành viên này');
    // Chuỗi rỗng = chưa nhập ngày mất, tức là còn sống — xem DECEASED_WHERE.
    if (member.deathDate == null || member.deathDate.trim() === '') {
      throw new UnprocessableEntityException(
        'Chỉ có thể dâng hương và lời tưởng niệm cho người đã khuất',
      );
    }
  }

  /**
   * Tên tác giả, chốt MỘT LẦN lúc ghi rồi lưu vào cột author_name — endpoint đọc
   * vì thế không phải hỏi Supabase cho từng dòng.
   *
   * Thứ tự phỏng theo MediaService.resolveUploaderName, nhưng ĐẢO tên thành viên
   * lên đầu: ở góc nhớ tổ tiên, danh tính đúng là tên trong gia phả chứ không
   * phải nickname của tài khoản. profileMemberId đã có sẵn trên JWT nên bước này
   * chỉ tốn một query members, không phải join qua user_metadata.
   *
   * CỐ Ý không có nhánh nào rơi về email, kể cả local-part: đây là dữ liệu hiển
   * thị trên endpoint public, và đó chính là lý do media.service cấm điều đó.
   */
  private async resolveAuthorName(caller: MemorialCaller): Promise<string> {
    if (caller.profileMemberId) {
      const member = await this.prisma.member.findUnique({
        where: { id: caller.profileMemberId },
        select: { name: true },
      });
      if (member?.name?.trim()) return member.name.trim();
    }

    // Display name ký vào token lúc login — miễn phí, không tốn round-trip.
    if (caller.displayName?.trim()) return caller.displayName.trim();

    // Token cũ chưa mang displayName, hoặc user đổi tên sau khi đăng nhập. Chỉ
    // tới đây mới hỏi Supabase, nên network call này KHÔNG nằm trên đường nóng.
    // Best-effort: hỏng thì trả null và ta rơi xuống hằng cuối.
    const fromSupabase = await this.supabaseUsers.getDisplayName(caller.id);
    if (fromSupabase?.trim()) return fromSupabase.trim();

    // Token cũ (ký trước khi strategy trả profileMemberId) — tra lại từ DB.
    const metadata = await this.prisma.userMetadata.findUnique({
      where: { user_id: caller.id },
      select: { profile_member: { select: { name: true } } },
    });
    return metadata?.profile_member?.name?.trim() || ANONYMOUS_AUTHOR;
  }

  /**
   * PHẢI await, KHÔNG fire-and-forget: trên Vercel serverless function có thể
   * đóng băng ngay khi response ghi xong ⇒ DEL không await có thể không bao giờ
   * chạy (xem chú thích media.service.invalidateMediaCaches). Ở đây còn gắt hơn:
   * FE refetch NGAY sau khi thắp hương, một response cached sẽ hiện số cũ.
   */
  private async invalidateMemorialCaches(): Promise<void> {
    await this.cache.del(...MEMORIAL_CACHE_KEYS);
  }
}

/**
 * Ngày hôm nay theo giờ VN, dạng YYYY-MM-DD. Tính trong app chứ KHÔNG dùng
 * CURRENT_DATE của Postgres: DB chạy UTC, nên sau 17h giờ VN mọi lượt thắp sẽ bị
 * ghi sang ngày hôm sau và giới hạn mỗi-ngày lệch đúng một múi giờ.
 *
 * Locale 'en-CA' là mẹo lấy đúng định dạng ISO YYYY-MM-DD từ Intl.
 */
export function todayInVietnam(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Row Prisma (snake_case) → hợp đồng của FE (camelCase). */
function toTributeDto(row: {
  id: string;
  content: string;
  created_at: Date;
  author_name: string;
  user_id: string;
  member_id: string | null;
  member: { name: string } | null;
}): MemorialTributeDto {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    authorName: row.author_name,
    authorUserId: row.user_id,
    memberId: row.member_id,
    memberName: row.member?.name ?? null,
  };
}
