import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Redis as UpstashRedis } from '@upstash/redis';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { committeeRoleLabel, committeeRoleRank } from '../members/committee-role';
import { PrismaService } from '../prisma/prisma.service';
import { ContactRateLimiter } from './contact.rate-limiter';
import { StorageService } from '../storage/storage.service';
import { SafeCache } from '../utils/safe-cache';
import { CONTACT_CACHE_TTL, CONTACT_INFO_CACHE_KEYS, contactInfoKey } from './contact.cache-keys';
import {
  CONTACT_ATTACHMENTS_MAX,
  CONTACT_ATTACHMENTS_TOTAL_MAX_BYTES,
  CONTACT_ATTACHMENT_MAX_BYTES,
  REFERENCE_CODE_MAX_ATTEMPTS,
  contactStorageKey,
  generateReferenceCode,
  hashIp,
  isAllowedContactMime,
} from './contact.constants';
import type {
  ContactBoardMemberDto,
  ContactInfoDto,
  ContactMessageDto,
  ContactMessageReceiptDto,
  ContactMessageStatsDto,
  CreateContactMessageDto,
  PaginatedContactMessagesDto,
  UpdateContactInfoDto,
} from './dto/contact.dto';
import { CONTACT_STATUSES } from './contact.constants';
import { CONTACT_ACTIVE_STATUSES, ContactStatus, ContactTopic } from './contact.constants';

/** Dòng singleton của contact_info — xem ContactInfo trong schema.prisma. */
const CONTACT_INFO_ID = 'default';

/** Trần pageSize cho hộp thư admin, giống MembersService.getAllMembers. */
const MAX_PAGE_SIZE = 100;

/**
 * Trần số ghế ban liên lạc đọc ra từ `members`.
 *
 * CÙNG lý do `take: 50` trong MembersService.getCommitteeMembers: đây là
 * endpoint PUBLIC, và một lần sửa dữ liệu sai (bật nhầm isCommittee hàng loạt)
 * không được phép biến nó thành "trả về cả bảng members".
 */
const MAX_BOARD_SIZE = 50;

/**
 * Thứ tự và câu chữ của chức danh ban liên lạc DÙNG CHUNG với
 * `GET /members/committee` — xem members/committee-role.ts. Giữ hai bảng riêng
 * là mở đường cho trang chủ và trang liên hệ hiện hai chức danh cho cùng một
 * người.
 */

/** Một tệp đính kèm sau khi đã lên storage — hình dạng lưu trong cột `attachments`. */
export interface ContactAttachment {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly cache: SafeCache;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly rateLimiter: ContactRateLimiter,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
  ) {
    this.cache = new SafeCache(this.redis, this.logger, CONTACT_CACHE_TTL);
  }

  // ─── Đọc ────────────────────────────────────────────────────────────────────

  /**
   * Toàn bộ khối thông tin liên hệ cho trang /contact.
   *
   * `canSeePii` đến từ CallerMetaGuard (đọc role TỪ DB, không từ JWT) và quyết
   * định `board[].phone` / `.email` là số thật hay null. Nó cũng là một phần
   * KHOÁ CACHE — xem contact.cache-keys.ts, đó là chỗ dễ rò rỉ PII nhất.
   */
  async getInfo(canSeePii: boolean): Promise<ContactInfoDto> {
    const key = contactInfoKey(canSeePii);
    const cached = await this.cache.get<ContactInfoDto>(key);
    if (cached) return cached;

    const [info, board] = await Promise.all([
      this.prisma.contactInfo.findUnique({
        where: { id: CONTACT_INFO_ID },
        include: {
          channels: { orderBy: { position: 'asc' } },
          hours: { orderBy: { position: 'asc' } },
        },
      }),
      this.getBoard(canSeePii),
    ]);

    // CHƯA seed dòng contact_info ⇒ 200 với danh sách rỗng, KHÔNG PHẢI 404.
    // Trang phân biệt "dòng họ chưa điền" (empty state) với "request lỗi"
    // (banner đỏ); 404 làm nó hiện đúng cái sai (api-contact.md §3.1).
    //
    // `board` vẫn trả BÌNH THƯỜNG kể cả khi chưa seed: nó chiếu từ `members`
    // chứ không phụ thuộc contact_info, nên bắt nó rỗng theo sẽ giấu mất ban
    // liên lạc đã có thật trong cây.
    const result: ContactInfoDto = {
      channels: (info?.channels ?? []).map((c) => ({
        type: c.type,
        label: c.label,
        value: c.value,
        href: c.href,
      })),
      // `venue` là một khối: thiếu tên HOẶC thiếu địa chỉ thì không dựng được
      // thẻ nhà thờ họ, nên trả null cả cụm thay vì object có chuỗi rỗng.
      venue:
        info?.venue_name && info?.venue_address
          ? {
              name: info.venue_name,
              address: info.venue_address,
              imageUrl: info.venue_image,
            }
          : null,
      hours: (info?.hours ?? []).map((h) => ({ label: h.label, value: h.value })),
      board,
      boardTerm: info?.board_term ?? null,
      responseDays: info?.response_days ?? null,
      updatedAt: info?.updated_at ?? null,
    };

    await this.cache.set(key, result, CONTACT_CACHE_TTL);
    return result;
  }

  /**
   * Ban liên lạc = CHIẾU từ `members`, KHÔNG phải bảng thứ tư.
   *
   * api-contact.md §2 giải thích vì sao: schema member đã mang isCommittee /
   * committeeRole / phone / contactEmail. Dựng bảng ban liên lạc song song là
   * cho dòng họ hai chỗ ghi cùng một con người, và một trong hai chắc chắn sẽ cũ.
   */
  private async getBoard(canSeePii: boolean): Promise<ContactBoardMemberDto[]> {
    const members = await this.prisma.member.findMany({
      where: { profile: { isCommittee: true } },
      select: {
        id: true,
        name: true,
        avatar_url: true,
        profile: { select: { committeeRole: true, phone: true, contactEmail: true } },
      },
      take: MAX_BOARD_SIZE,
    });

    return members
      .map((m) => {
        const rawRole = m.profile?.committeeRole ?? '';
        return {
          id: m.id,
          // Ban liên lạc chiếu từ cây nên memberId LUÔN có giá trị hôm nay.
          // Trường vẫn nullable trong hợp đồng để sau này thêm được một ghế do
          // người ngoài cây nắm giữ mà không phải đổi shape (§2).
          memberId: m.id,
          name: m.name,
          role: committeeRoleLabel(rawRole),
          // PII: null hoá TỪNG TRƯỜNG, không bỏ key và không 403 cả route —
          // thẻ vẫn dựng được tên + vai trò và tự hiện một dòng giải thích
          // (ContactPage.boardPiiHidden). Xem api-contact.md §3.1.
          phone: canSeePii ? (m.profile?.phone ?? null) : null,
          email: canSeePii ? (m.profile?.contactEmail ?? null) : null,
          avatarUrl: m.avatar_url,
          _rank: committeeRoleRank(rawRole),
        };
      })
      // Sắp trong JS chứ không phải trong SQL: thứ tự là theo THỨ BẬC của
      // committeeRole, mà thứ bậc đó không phải thứ tự alphabet của mã enum.
      // Tập dữ liệu bị chặn ở MAX_BOARD_SIZE nên chi phí không đáng kể.
      .sort((a, b) => a._rank - b._rank || a.name.localeCompare(b.name, 'vi'))
      .map(({ _rank, ...member }) => member);
  }

  // ─── Ghi ────────────────────────────────────────────────────────────────────

  /**
   * Nhận một lá thư gửi ban liên lạc.
   *
   * THỨ TỰ CÓ CHỦ Ý: upload file TRƯỚC, insert row SAU, và nếu insert hỏng thì
   * xoá file đã lên (best-effort). Làm ngược lại — insert trước rồi upload — sẽ
   * sinh ra những lá thư nói "xem ảnh tôi gửi kèm" mà không có ảnh nào, và ban
   * liên lạc không có cách nào biết là đã mất file. Ở đây hoặc được cả, hoặc
   * người gửi nhận lỗi và bấm gửi lại.
   */
  async createMessage(
    dto: CreateContactMessageDto,
    files: Express.Multer.File[] = [],
    caller: { userId?: string | null; ip?: string | null } = {},
  ): Promise<ContactMessageReceiptDto> {
    this.assertAttachmentsAcceptable(files);

    // id sinh TRƯỚC khi insert vì đường dẫn storage `contact/<messageId>/` cần
    // nó. Prisma cũng sinh uuid ở phía client (@default(uuid())) nên tự sinh ở
    // đây không lệch quy ước nào.
    const messageId = randomUUID();
    const attachments = await this.uploadAttachments(messageId, files);

    let receipt: ContactMessageReceiptDto;
    try {
      receipt = await this.insertMessage(messageId, dto, attachments, caller);
    } catch (err) {
      await this.deleteAttachments(attachments);
      throw err;
    }

    // Tính vào hạn mức CHỈ KHI đã ghi được lá thư. ContactThrottleGuard chỉ
    // ĐỌC bộ đếm; đếm ở đó là tính cả request gõ sai (guard chạy trước
    // ValidationPipe) và khoá mất người gửi vì chính lỗi đánh máy của họ.
    // Xem chú thích đầu ContactRateLimiter.
    await this.rateLimiter.recordSubmission(caller.ip ?? null);
    return receipt;
  }

  /**
   * Ba lớp kiểm tra: SỐ LƯỢNG, LOẠI, và KÍCH THƯỚC — cả từng file lẫn TỔNG.
   *
   * Kiểm tổng là bắt buộc chứ không thừa: ba file 4,4 MB đều lọt kiểm tra từng
   * file nhưng cộng lại vượt trần body của Vercel, và lúc đó platform trả 413
   * của chính nó — người gửi nhận một lỗi không có tiếng Việt và mất bài viết
   * vừa gõ (api-contact.md §3.2).
   */
  private assertAttachmentsAcceptable(files: Express.Multer.File[]): void {
    if (files.length > CONTACT_ATTACHMENTS_MAX) {
      throw new BadRequestException(
        `Chỉ đính kèm được tối đa ${CONTACT_ATTACHMENTS_MAX} tệp cho mỗi tin nhắn.`,
      );
    }

    for (const file of files) {
      if (!isAllowedContactMime(file.mimetype)) {
        throw new BadRequestException(
          `Tệp "${file.originalname}" không được hỗ trợ. ` +
            `Chỉ nhận ảnh JPG, PNG hoặc tệp PDF.`,
        );
      }
      if (file.size > CONTACT_ATTACHMENT_MAX_BYTES) {
        throw new PayloadTooLargeException(
          `Tệp "${file.originalname}" vượt quá ${formatMb(CONTACT_ATTACHMENT_MAX_BYTES)}. ` +
            `Vui lòng chọn tệp nhỏ hơn.`,
        );
      }
    }

    const total = files.reduce((sum, f) => sum + f.size, 0);
    if (total > CONTACT_ATTACHMENTS_TOTAL_MAX_BYTES) {
      throw new PayloadTooLargeException(
        `Tổng dung lượng tệp đính kèm vượt quá ${formatMb(CONTACT_ATTACHMENTS_TOTAL_MAX_BYTES)}. ` +
          `Vui lòng bớt tệp hoặc gửi làm nhiều lần.`,
      );
    }
  }

  /**
   * Đưa tệp lên storage dưới `contact/<messageId>/`, qua StorageService y hệt
   * MediaService (nên đổi STORAGE_PROVIDER là cả hai module đi theo).
   */
  private async uploadAttachments(
    messageId: string,
    files: Express.Multer.File[],
  ): Promise<ContactAttachment[]> {
    const uploaded: ContactAttachment[] = [];

    for (const file of files) {
      const buffer = await this.reencodeImage(file);
      const path = contactStorageKey(messageId, file.originalname);

      try {
        const url = await this.storage.put(path, buffer, file.mimetype);
        uploaded.push({
          url,
          name: file.originalname,
          mimeType: file.mimetype,
          size: buffer.length,
        });
      } catch (err) {
        // Một file hỏng ⇒ dọn những file đã lên rồi mới ném. Không dọn thì lá
        // thư này không bao giờ được ghi mà file vẫn nằm lại tính tiền mãi mãi.
        await this.deleteAttachments(uploaded);
        this.logger.error(`Upload tệp đính kèm thất bại: ${(err as Error).message}`);
        throw new BadRequestException(
          'Không tải được tệp đính kèm lên. Vui lòng thử lại, hoặc gửi tin nhắn không kèm tệp.',
        );
      }
    }

    return uploaded;
  }

  /**
   * Giải mã rồi MÃ HOÁ LẠI ảnh bằng sharp.
   *
   * Đây là biện pháp AN NINH, không phải tối ưu dung lượng: một tệp được gắn
   * mác `image/jpeg` nhưng thực chất chứa payload khác sẽ không sống sót qua
   * vòng decode–encode này, nên không thể bị phục vụ lại như thứ chạy được.
   * Endpoint này KHÔNG có guard nên đó là rủi ro thật, không phải giả định.
   *
   * `.rotate()` áp EXIF orientation TRƯỚC khi sharp strip metadata (mặc định),
   * nếu không ảnh chụp dọc bị xoay ngang — cùng lý do TasksService làm vậy.
   *
   * PDF trả nguyên buffer: sharp không đọc được PDF. Bù lại chúng chỉ được phục
   * vụ từ domain storage chứ không phải domain app.
   */
  private async reencodeImage(file: Express.Multer.File): Promise<Buffer> {
    if (file.mimetype === 'image/jpeg') {
      return sharp(file.buffer).rotate().jpeg({ mozjpeg: true, quality: 100 }).toBuffer();
    }
    if (file.mimetype === 'image/png') {
      return sharp(file.buffer).rotate().png({ compressionLevel: 9, effort: 10 }).toBuffer();
    }
    return file.buffer;
  }

  /** Dọn file đã lên storage. Best-effort: lỗi ở đây không được che lỗi gốc. */
  private async deleteAttachments(attachments: ContactAttachment[]): Promise<void> {
    await Promise.all(
      attachments.map((a) =>
        this.storage
          .del(a.url)
          .catch((err) => this.logger.warn(`Không xoá được tệp mồ côi ${a.url}: ${err.message}`)),
      ),
    );
  }

  /**
   * Ghi lá thư, sinh lại `referenceCode` khi đụng UNIQUE.
   *
   * Bắt P2002 thay vì SELECT-rồi-INSERT: kiểm tra trước tốn một round-trip cho
   * MỌI lá thư để phòng một va chạm gần như không xảy ra, và vẫn thua hai
   * request đồng thời. Cùng thủ pháp MemorialService dùng cho giới hạn thắp
   * hương mỗi ngày.
   */
  private async insertMessage(
    messageId: string,
    dto: CreateContactMessageDto,
    attachments: ContactAttachment[],
    caller: { userId?: string | null; ip?: string | null },
  ): Promise<ContactMessageReceiptDto> {
    const data = {
      id: messageId,
      topic: dto.topic,
      full_name: dto.fullName,
      phone: dto.phone,
      // Chuỗi rỗng → null. `email=""` nghĩa là "không điền", và lưu chuỗi rỗng
      // làm mọi chỗ đọc sau này phải kiểm tra hai dạng "trống" khác nhau.
      email: dto.email || null,
      branch: dto.branch || null,
      content: dto.content,
      attachments: attachments as unknown as Prisma.InputJsonValue,
      user_id: caller.userId ?? null,
      sender_ip_hash: this.hashSenderIp(caller.ip),
    };

    for (let attempt = 1; attempt <= REFERENCE_CODE_MAX_ATTEMPTS; attempt++) {
      try {
        const created = await this.prisma.contactMessage.create({
          data: { ...data, reference_code: generateReferenceCode() },
          select: { id: true, created_at: true, reference_code: true },
        });
        return {
          id: created.id,
          createdAt: created.created_at,
          referenceCode: created.reference_code,
        };
      } catch (err) {
        const isDuplicateCode =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String(err.meta?.target ?? '').includes('reference_code');
        if (!isDuplicateCode || attempt === REFERENCE_CODE_MAX_ATTEMPTS) throw err;
        this.logger.warn(`Mã tham chiếu trùng, sinh lại (lần ${attempt})`);
      }
    }

    // Không tới được: vòng lặp ở trên hoặc return hoặc throw. TypeScript không
    // suy ra được điều đó nên vẫn cần một lối thoát tường minh.
    throw new Error('Không sinh được mã tham chiếu duy nhất');
  }

  /**
   * Băm IP để lưu, hoặc KHÔNG LƯU GÌ CẢ.
   *
   * Thiếu `CONTACT_IP_HASH_SECRET` thì trả null chứ KHÔNG rơi về sha256(ip)
   * trần: hash không muối của một IPv4 tra ngược được bằng bảng dựng trong vài
   * phút, tức là ta vẫn đang lưu địa chỉ IP nhưng lại tưởng đã ẩn danh hoá.
   * Không có cột này thì mất khả năng gom cụm spam — mất một tiện ích rà soát
   * còn hơn lưu dữ liệu cá nhân mà không biết mình đang lưu.
   */
  private hashSenderIp(ip?: string | null): string | null {
    if (!ip) return null;
    const secret = process.env.CONTACT_IP_HASH_SECRET;
    if (!secret) {
      this.logger.warn(
        'CONTACT_IP_HASH_SECRET chưa được đặt — bỏ trống sender_ip_hash. ' +
          'Đặt biến này để bật rà soát lạm dụng.',
      );
      return null;
    }
    return hashIp(ip, secret);
  }

  // ─── Back-office (admin) ──────────────────────────────────────────────────

  /**
   * THAY THẾ TRỌN KHỐI thông tin liên hệ.
   *
   * `channels` và `hours` bị XOÁ rồi ghi lại theo đúng thứ tự trong mảng, chứ
   * không đối chiếu từng dòng để sửa tại chỗ. Lý do: `position` là thuộc tính
   * của CẢ DANH SÁCH, không phải của từng dòng — đổi chỗ hai kênh bằng cách sửa
   * từng dòng sẽ đụng UNIQUE (nếu có) hoặc để lại thứ tự trung gian sai. Xoá và
   * ghi lại cho ra đúng trạng thái mong muốn trong mọi trường hợp, và với vài
   * chục dòng thì chi phí không đáng kể.
   *
   * TẤT CẢ nằm trong MỘT transaction: nửa chừng thất bại mà đã xoá xong channels
   * sẽ để trang liên hệ trống trơn cho tới lần sửa sau.
   */
  async updateInfo(dto: UpdateContactInfoDto): Promise<ContactInfoDto> {
    await this.prisma.$transaction(async (tx) => {
      // upsert chứ không update: dòng singleton có thể chưa được seed (mục 5
      // của 006_contact.sql là tuỳ chọn), và lần sửa đầu tiên ở BO phải chạy
      // được chứ không phải báo "không tìm thấy".
      const venue = dto.venue ?? null;
      const fields = {
        venue_name: venue?.name ?? null,
        venue_address: venue?.address ?? null,
        venue_image: venue?.imageUrl || null,
        board_term: dto.boardTerm || null,
        response_days: dto.responseDays ?? null,
      };

      await tx.contactInfo.upsert({
        where: { id: CONTACT_INFO_ID },
        create: { id: CONTACT_INFO_ID, ...fields },
        update: fields,
      });

      await tx.contactChannel.deleteMany({ where: { info_id: CONTACT_INFO_ID } });
      await tx.contactHours.deleteMany({ where: { info_id: CONTACT_INFO_ID } });

      if (dto.channels.length) {
        await tx.contactChannel.createMany({
          data: dto.channels.map((c, index) => ({
            info_id: CONTACT_INFO_ID,
            type: c.type,
            label: c.label,
            value: c.value,
            href: c.href || null,
            // Thứ tự trong mảng LÀ thứ tự hiển thị — xem UpdateContactInfoDto.
            position: index,
          })),
        });
      }

      if (dto.hours.length) {
        await tx.contactHours.createMany({
          data: dto.hours.map((h, index) => ({
            info_id: CONTACT_INFO_ID,
            label: h.label,
            value: h.value,
            position: index,
          })),
        });
      }
    });

    // Xoá CẢ HAI biến thể cache (pii + public). Quên một cái là trang public
    // hiện thông tin cũ tới một tiếng — xem contact.cache-keys.ts.
    await this.cache.del(...CONTACT_INFO_CACHE_KEYS);

    // Đọc lại với canSeePii=true: người gọi là admin, và BO cần thấy đúng thứ
    // vừa lưu để render lại form mà không phải gọi thêm một vòng GET.
    return this.getInfo(true);
  }

  /**
   * Hộp thư ban liên lạc. Mới nhất trước, lọc được theo trạng thái và chủ đề.
   *
   * KHÔNG cache: admin vừa đổi trạng thái một lá thư phải thấy ngay, và đây là
   * endpoint ít lượt gọi (vài admin, không phải cả dòng họ).
   */
  async getMessages(
    page: number,
    pageSize: number,
    status?: ContactStatus,
    topic?: ContactTopic,
    q?: string,
  ): Promise<PaginatedContactMessagesDto> {
    const take = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
    const currentPage = Math.max(page, 1);
    const where = this.messageWhere(status, topic, q);

    const [rows, total] = await Promise.all([
      this.prisma.contactMessage.findMany({
        where,
        // `id` là tiebreaker để phân trang ổn định khi hai lá thư trùng
        // created_at — cùng quy ước getAllMembers/getTributes.
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (currentPage - 1) * take,
        take,
      }),
      this.prisma.contactMessage.count({ where }),
    ]);

    return {
      data: rows.map(toContactMessageDto),
      total,
      page: currentPage,
      pageSize: take,
    };
  }

  /**
   * Đánh dấu một lá thư đã xử lý tới đâu, kèm dấu vết AI làm việc đó.
   *
   * `handledBy`/`handledAt` ghi từ danh tính người gọi chứ KHÔNG nhận từ body:
   * để client tự khai ai đã xử lý thì trường kiểm toán này vô giá trị.
   *
   * `note` bỏ trống ⇒ GIỮ NGUYÊN ghi chú cũ (PATCH là vá từng phần, không phải
   * thay thế); gửi chuỗi rỗng ⇒ xoá.
   */
  async updateMessageStatus(
    id: string,
    status: ContactStatus,
    handledBy?: string | null,
    note?: string | null,
  ): Promise<ContactMessageDto> {
    try {
      const updated = await this.prisma.contactMessage.update({
        where: { id },
        data: {
          status,
          handled_by: handledBy ?? null,
          handled_at: new Date(),
          ...(note === undefined ? {} : { handled_note: note || null }),
        },
      });

      return toContactMessageDto(updated);
    } catch (err) {
      // P2025 = "record to update not found". Đổi thành 404 để BO phân biệt
      // "thư đã bị xoá" với "server hỏng".
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Không tìm thấy tin nhắn này.');
      }
      throw err;
    }
  }

  /** Một lá thư, cho trang chi tiết deep-link được (`/bo/contact/messages/:id`). */
  async getMessageById(id: string): Promise<ContactMessageDto> {
    const row = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy tin nhắn này.');
    return toContactMessageDto(row);
  }

  /**
   * XOÁ MỀM: chuyển sang `DELETED`, giữ nguyên dòng và tệp đính kèm.
   *
   * Thư người trong họ gửi tới không nên biến mất vĩnh viễn vì một cú bấm nhầm,
   * và trạng thái này khôi phục được bằng PATCH.
   *
   * ĐIỀU PHẢI NÓI RÕ: bucket R2 để public-read, nên tệp đính kèm của lá thư đã
   * "xoá" VẪN đọc được bởi bất kỳ ai còn giữ URL. Hàm này giấu thư khỏi hộp thư,
   * KHÔNG thu hồi quyền đọc tệp — muốn vậy phải xoá object trên storage.
   */
  async softDeleteMessage(id: string, handledBy?: string | null): Promise<void> {
    await this.updateMessageStatus(id, 'DELETED', handledBy);
  }

  /**
   * Số thư theo từng trạng thái, cho badge trên thanh điều hướng BO.
   *
   * MỘT round-trip cho tất cả (groupBy) thay vì một count() mỗi trạng thái —
   * cùng thủ pháp MemorialService.getStats dùng.
   */
  async getMessageStats(): Promise<ContactMessageStatsDto> {
    const grouped = await this.prisma.contactMessage.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    // Khởi tạo MỌI trạng thái về 0 trước: groupBy chỉ trả về trạng thái CÓ dòng,
    // nên thiếu bước này thì badge của một trạng thái rỗng là `undefined` chứ
    // không phải 0, và FE phải tự đoán.
    const counts = Object.fromEntries(CONTACT_STATUSES.map((s) => [s, 0])) as Record<string, number>;
    for (const row of grouped) {
      if (row.status in counts) counts[row.status] = row._count._all;
      // Trạng thái lạ dưới DB (dữ liệu cũ, sửa tay) KHÔNG được âm thầm bỏ qua:
      // nếu không, `total` cộng ra khác con số hộp thư thật sự hiển thị.
      else counts[row.status] = row._count._all;
    }

    return {
      counts,
      // Tổng KHỚP với hộp thư mặc định (đã trừ thư xoá mềm), nếu không badge
      // "58 thư" lại đứng cạnh một danh sách 57 dòng.
      total: CONTACT_ACTIVE_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0),
    };
  }

  /**
   * Bộ lọc dùng chung cho danh sách.
   *
   * KHÔNG truyền `status` ⇒ loại `DELETED` ra. Truyền `?status=DELETED` tường
   * minh thì vẫn xem được thùng rác — nếu không, thư đã xoá không có đường nào
   * khôi phục.
   */
  private messageWhere(
    status?: ContactStatus,
    topic?: ContactTopic,
    q?: string,
  ): Prisma.ContactMessageWhereInput {
    const term = q?.trim();

    return {
      // `status`/`topic` đã qua allowlist ở tầng controller nên vào thẳng
      // `where` được — cùng quy ước members.service.ts: giá trị từ query string
      // CHỈ đi tiếp nếu nằm trong danh sách.
      ...(status ? { status } : { status: { in: [...CONTACT_ACTIVE_STATUSES] } }),
      ...(topic ? { topic } : {}),
      // Ô tìm kiếm của người trực điện thoại: người nhà đọc "LH-2608-0431" hoặc
      // xưng tên/số điện thoại. Ba cột này đều có GIN trgm index (007).
      //
      // `mode: 'insensitive'` cho tên; mã tham chiếu vốn viết hoa nhưng người
      // trực hay gõ thường, nên cũng không phân biệt hoa thường.
      ...(term
        ? {
            OR: [
              { reference_code: { contains: term, mode: 'insensitive' as const } },
              { full_name: { contains: term, mode: 'insensitive' as const } },
              { phone: { contains: term } },
            ],
          }
        : {}),
    };
  }
}

/** "4,5 MB" cho message hiển thị thẳng cho người gửi. */
function formatMb(bytes: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(
    bytes / (1024 * 1024),
  )} MB`;
}

/**
 * Một dòng contact_message → shape FE/BO nhận.
 *
 * MỘT chỗ duy nhất, dùng bởi cả list, detail lẫn patch. Trước đây map lặp lại ở
 * từng method và mỗi lần thêm cột là một cơ hội để một đường quên trường mới —
 * hoặc tệ hơn, để một đường lỡ tay trả ra `sender_ip_hash`.
 *
 * `sender_ip_hash` CỐ Ý không có ở đây. Nó tồn tại để gom cụm hành vi spam khi
 * rà soát trực tiếp trên DB, không phải để hiện lên BO — đưa nó vào response là
 * biến một biện pháp ẩn danh hoá thành một định danh mà admin bắt đầu dùng để
 * nhận diện người gửi.
 */
function toContactMessageDto(row: {
  id: string;
  reference_code: string;
  topic: string;
  full_name: string;
  phone: string;
  email: string | null;
  branch: string | null;
  content: string;
  attachments: unknown;
  status: string;
  user_id: string | null;
  handled_by: string | null;
  handled_at: Date | null;
  handled_note: string | null;
  created_at: Date;
  updated_at: Date;
}): ContactMessageDto {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    topic: row.topic,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    branch: row.branch,
    content: row.content,
    attachments: (row.attachments as unknown[]) ?? [],
    status: row.status,
    userId: row.user_id,
    handledBy: row.handled_by,
    handledAt: row.handled_at,
    handledNote: row.handled_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
