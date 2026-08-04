import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis as UpstashRedis } from '@upstash/redis';
import { PrismaService } from '../prisma/prisma.service';
import { QStashService } from '../queue/qstash.service';
import { QUEUE_GENERATION_RECOMPUTE } from '../queue/queue.constants';
import { runInBackground } from '../utils/run-in-background';
import { CACHE_KEY_FULL, CACHE_KEY_STATS } from '../tree/tree.cache-keys';
import { computeGenerations } from './generation.algorithm';

export interface RecomputeResult {
  members: number;
  /** Số dòng thực sự đổi giá trị — dùng để quyết định có bust cache hay không. */
  updated: number;
  durationMs: number;
  warnings: string[];
}

/**
 * Mọi ghi trong cùng cửa sổ này gộp thành một lần recompute. Job chạy sau đúng
 * chừng đó giây, nên bucket CUỐI luôn thực thi sau lần ghi cuối — tự sửa sai,
 * không có lock nào để rò rỉ.
 */
const DEBOUNCE_MS = 15_000;

/** Chunk phòng thủ cho câu UPDATE; ở quy mô hiện tại luôn chỉ chạy 1 vòng. */
const PERSIST_CHUNK = 5_000;

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qstashService: QStashService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
  ) {}

  /**
   * Xếp hàng một lần tính lại thế hệ, gộp các lần gọi liên tiếp.
   *
   * Luôn đi qua `runInBackground` — QStash chết không được làm hỏng lệnh ghi đã
   * commit thành công.
   */
  enqueueRecompute(): void {
    const bucket = Math.floor(Date.now() / DEBOUNCE_MS);
    runInBackground(
      this.qstashService.publish(
        QUEUE_GENERATION_RECOMPUTE,
        {},
        {
          delay: Math.floor(DEBOUNCE_MS / 1000),
          deduplicationId: `${QUEUE_GENERATION_RECOMPUTE}-${bucket}`,
        },
      ),
    );
  }

  /**
   * Tính lại thế hệ cho TOÀN BỘ thành viên và ghi vào `members.generation`.
   *
   * Không bao giờ ghi vào `profiles.generation` — đó là ô nhập tay của người
   * dùng và là nguồn sự thật cho phần override.
   */
  async recomputeAll(): Promise<RecomputeResult> {
    const startedAt = Date.now();

    const [members, edges, pinRows] = await Promise.all([
      this.prisma.member.findMany({ select: { id: true } }),
      this.prisma.memberRelationship.findMany({
        select: { parent_id: true, child_id: true, type: true },
      }),
      this.prisma.profile.findMany({
        where: { generation: { not: null } },
        select: { member_id: true, generation: true },
      }),
    ]);

    const { generations, warnings } = computeGenerations({
      memberIds: members.map((m) => m.id),
      parentEdges: edges.filter((e) => e.type !== 'SPOUSE'),
      spouseEdges: edges.filter((e) => e.type === 'SPOUSE'),
      pins: new Map(pinRows.map((p) => [p.member_id, p.generation as number])),
    });

    const updated = await this.persist(generations);
    if (updated > 0) await this.invalidateCaches();

    for (const warning of warnings) this.logger.warn(warning);

    const result: RecomputeResult = {
      members: members.length,
      updated,
      durationMs: Date.now() - startedAt,
      warnings,
    };
    this.logger.log(
      `Generation recompute: ${result.members} members, ${result.updated} updated, ${result.durationMs}ms`,
    );
    return result;
  }

  /**
   * Ghi bằng MỘT round trip qua `unnest`, thay vì ~15 lần `updateMany` gom theo
   * giá trị. Chỉ 2 bind parameter nên không đụng trần 65535 param và không sinh
   * chuỗi SQL vài trăm KB.
   *
   * `IS DISTINCT FROM` làm trạng thái ổn định gần như miễn phí: trigger phổ biến
   * là "thêm 1 quan hệ" — vài dòng đổi, hàng nghìn dòng không. Không có nó thì
   * mỗi lần chạy đều rewrite toàn bảng (dead tuple, WAL, autovacuum churn).
   */
  private async persist(generations: Map<string, number>): Promise<number> {
    const ids = [...generations.keys()];
    if (ids.length === 0) return 0;

    let updated = 0;
    for (let i = 0; i < ids.length; i += PERSIST_CHUNK) {
      const idChunk = ids.slice(i, i + PERSIST_CHUNK);
      const genChunk = idChunk.map((id) => generations.get(id) as number);

      updated += await this.prisma.$executeRaw`
        UPDATE members AS m
        SET generation = v.gen, generation_updated_at = NOW()
        FROM (
          SELECT UNNEST(${idChunk}::uuid[]) AS id,
                 UNNEST(${genChunk}::int[]) AS gen
        ) AS v
        WHERE m.id = v.id
          AND m.generation IS DISTINCT FROM v.gen
      `;
    }
    return updated;
  }

  /**
   * `tree:chart:full` nhúng `data.generation` từng node và `tree:stats` nhúng
   * `generations`; cả hai TTL 1h, nên không xoá thì chart hiện số cũ tới một
   * tiếng. Best-effort như `TreeService.safeCacheDel` — Redis không bao giờ là
   * hard dependency.
   */
  private async invalidateCaches(): Promise<void> {
    try {
      await this.redis.del(CACHE_KEY_FULL, CACHE_KEY_STATS);
    } catch (err) {
      this.logger.warn(`Redis DEL after recompute failed (non-fatal): ${(err as Error).message}`);
    }
  }
}
