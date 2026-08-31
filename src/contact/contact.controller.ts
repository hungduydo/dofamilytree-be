import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { CallerMetaGuard } from '../auth/caller-meta.guard';
import { CanSeePii } from '../auth/caller-meta.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ContactUploadPayloadTooLargeFilter } from './contact-upload-exception.filter';
import {
  CONTACT_ATTACHMENTS_MAX,
  CONTACT_ATTACHMENT_MAX_BYTES,
  CONTACT_ATTACHMENT_MIME_TYPES,
  CONTACT_RATE_LIMITS,
  CONTACT_STATUSES,
  CONTACT_TOPICS,
  ContactStatus,
  ContactTopic,
} from './contact.constants';
import { ContactService } from './contact.service';
import { ContactThrottleGuard, clientIpOf } from './contact.throttle.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  ContactInfoDto,
  ContactMessageDto,
  ContactMessageStatsDto,
  ContactMessageReceiptDto,
  CreateContactMessageDto,
  PaginatedContactMessagesDto,
  UpdateContactInfoDto,
  UpdateContactMessageStatusDto,
} from './dto/contact.dto';

/**
 * Liên hệ ban liên lạc. Hai route, CẢ HAI đều @Public().
 *
 * VỀ ROUTE GHI KHÔNG CÓ GUARD — đây là điều bất thường DUY NHẤT trong API này
 * và nó là CHỦ Ý, không phải chỗ bị quên gắn quyền:
 *
 * Người có nhu cầu viết cho ban liên lạc nhất lại chính là những người KHÔNG có
 * tài khoản — chắt chút chưa bao giờ đăng ký, và người thân đang chờ admin
 * duyệt liên kết (trang cài đặt trỏ họ sang đây). Gắn @Roles('member') là đóng
 * cửa với đúng nhóm người mà cái form này sinh ra để phục vụ (api-contact.md §4).
 *
 * Lớp bảo vệ vì thế là RATE LIMIT (ContactThrottleGuard, đếm trên Redis), không
 * phải role. Đừng gỡ nó ra mà không thay bằng thứ khác.
 *
 * CallerMetaGuard vẫn được gắn ở cấp class: route đọc là public nhưng
 * `board[].phone` / `.email` chỉ hiện với người gọi từ `member` trở lên (và
 * KHÔNG hiện với `editor`) — xem PII_ROLES trong roles.constants.ts.
 * THỨ TỰ BẮT BUỘC: JwtAuthGuard trước, nếu không req.user chưa tồn tại và mọi
 * người đều bị coi là ẩn danh.
 */
@ApiTags('Contact (Liên hệ Ban liên lạc)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CallerMetaGuard)
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Get('info')
  @ApiOperation({
    summary: 'Thông tin liên hệ: kênh liên lạc, nhà thờ họ, giờ mở cửa, ban liên lạc (public)',
    description:
      'Chưa seed dòng contact_info vẫn trả 200 với danh sách rỗng — KHÔNG phải 404: trang cần ' +
      'phân biệt "dòng họ chưa điền" với "request lỗi". `board[].phone`/`.email` là null với ' +
      'người gọi không có quyền xem thông tin liên lạc (dưới `member`, và cả `editor`).',
  })
  @ApiOkResponse({ type: ContactInfoDto })
  getInfo(@CanSeePii() canSeePii: boolean) {
    return this.contactService.getInfo(canSeePii);
  }

  @Public()
  @Post('messages')
  @UseGuards(ContactThrottleGuard)
  @UseFilters(ContactUploadPayloadTooLargeFilter)
  @UseInterceptors(
    // maxCount CỐ Ý nới hơn CONTACT_ATTACHMENTS_MAX một bậc. Khi multer tự chặn
    // số tệp, nó ném "Unexpected field" — một câu vô nghĩa với người gửi. Nới
    // một bậc để trường hợp THƯỜNG GẶP (chọn 4 tệp thay vì 3) rơi vào
    // ContactService và nhận đúng câu "tối đa 3 tệp". Từ tệp thứ 5 trở đi mới
    // gặp lỗi thô của multer — đánh đổi chấp nhận được cho một ca hiếm.
    FilesInterceptor('attachments', CONTACT_ATTACHMENTS_MAX + 1, {
      limits: {
        fileSize: CONTACT_ATTACHMENT_MAX_BYTES,
        files: CONTACT_ATTACHMENTS_MAX + 1,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Gửi tin nhắn cho ban liên lạc (public, có giới hạn tần suất)',
    description:
      `Multipart MỘT LẦN GỬI, không phải upload-rồi-tham-chiếu: người nhà đính kèm ảnh chụp ` +
      `một trang viết tay, và luồng hai bước sẽ bỏ lại tệp mồ côi mỗi lần họ bỏ dở form. ` +
      `Tối đa ${CONTACT_ATTACHMENTS_MAX} tệp (${CONTACT_ATTACHMENT_MIME_TYPES.join(', ')}), ` +
      `mỗi tệp và TỔNG body đều bị chặn ở ${(CONTACT_ATTACHMENT_MAX_BYTES / 1024 / 1024).toFixed(1)} MB. ` +
      `Giới hạn tần suất: ${CONTACT_RATE_LIMITS.map((l) => `${l.max}/${l.label}`).join(', ')} theo IP.`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['topic', 'fullName', 'phone', 'content'],
      properties: {
        topic: { type: 'string', enum: ['GENEALOGY', 'GRAVE', 'EVENT', 'SCHOLARSHIP', 'OTHER'] },
        fullName: { type: 'string', example: 'Nguyễn Văn An' },
        phone: { type: 'string', example: '0988 123 456' },
        email: { type: 'string', example: 'an.nguyen@example.com' },
        branch: { type: 'string', example: 'Chi thứ ba, Đông Ngạc' },
        content: { type: 'string', minLength: 20, maxLength: 2000 },
        attachments: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          maxItems: CONTACT_ATTACHMENTS_MAX,
        },
      },
    },
  })
  @ApiCreatedResponse({ type: ContactMessageReceiptDto })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ — `message` là câu tiếng Việt cho người gửi đọc' })
  @ApiPayloadTooLargeResponse({ description: 'Tệp đính kèm hoặc tổng body vượt giới hạn' })
  @ApiTooManyRequestsResponse({ description: 'Vượt giới hạn tần suất theo IP' })
  createMessage(
    @Body() dto: CreateContactMessageDto,
    @UploadedFiles() attachments: Express.Multer.File[] = [],
    @Request() req: any,
  ) {
    return this.contactService.createMessage(dto, attachments ?? [], {
      // Có giá trị CHỈ KHI người gửi tình cờ đang đăng nhập. Route là @Public()
      // nên phần lớn thư sẽ có userId = null — đó là trường hợp THƯỜNG.
      userId: req.user?.id ?? null,
      ip: clientIpOf(req),
    });
  }

  // ─── Back-office (admin) ──────────────────────────────────────────────────

  @Put('info')
  @Roles('admin')
  @ApiOperation({
    summary: 'Cập nhật thông tin liên hệ của dòng họ (admin)',
    description:
      'THAY THẾ TRỌN KHỐI: `channels` và `hours` được ghi lại theo đúng thứ tự trong mảng, ' +
      'nên gửi cả danh sách chứ không gửi từng dòng. Shape khớp chính xác thứ GET /contact/info ' +
      'trả về (trừ `board`, vốn chiếu từ `members` — sửa ban liên lạc ở màn hình Thành viên, ' +
      'bằng cách bật `clanRole` cho người đó). Xoá cache của route public ngay sau khi lưu.',
  })
  @ApiOkResponse({ type: ContactInfoDto, description: 'Khối thông tin sau khi lưu.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  updateInfo(@Body() dto: UpdateContactInfoDto) {
    return this.contactService.updateInfo(dto);
  }

  @Get('messages')
  @Roles('admin')
  @ApiOperation({
    summary: 'Hộp thư ban liên lạc — mới nhất trước (admin)',
    description:
      'KHÔNG cache: admin vừa đổi trạng thái phải thấy ngay. `sender_ip_hash` cố ý KHÔNG được ' +
      'trả ra — nó để rà soát spam trực tiếp trên DB, không phải để nhận diện người gửi trên BO.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiQuery({ name: 'status', required: false, enum: CONTACT_STATUSES })
  @ApiQuery({ name: 'topic', required: false, enum: CONTACT_TOPICS })
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Tìm trong mã tham chiếu, họ tên và số điện thoại. Đây là đường người trực điện thoại ' +
      'dùng khi người nhà đọc "LH-2608-0431" qua máy.',
  })
  @ApiOkResponse({ type: PaginatedContactMessagesDto })
  getMessages(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('status') status?: string,
    @Query('topic') topic?: string,
    @Query('q') q?: string,
  ) {
    // Allowlist TẠI ĐÂY chứ không tin query string: giá trị này đi thẳng vào
    // `where` của Prisma. Cùng quy ước members.service.ts. Ném 400 thay vì âm
    // thầm bỏ qua bộ lọc sai — bỏ qua sẽ trả về CẢ hộp thư trong khi admin
    // tưởng mình đang xem một nhóm nhỏ.
    if (status && !(CONTACT_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`status phải là một trong: ${CONTACT_STATUSES.join(', ')}`);
    }
    if (topic && !(CONTACT_TOPICS as readonly string[]).includes(topic)) {
      throw new BadRequestException(`topic phải là một trong: ${CONTACT_TOPICS.join(', ')}`);
    }

    return this.contactService.getMessages(
      page,
      pageSize,
      status as ContactStatus | undefined,
      topic as ContactTopic | undefined,
      q,
    );
  }

  /**
   * PHẢI khai báo TRƯỚC `messages/:id`. Nest so khớp route theo thứ tự đăng ký,
   * và `:id` có ParseUUIDPipe — để sau thì "stats" bị nuốt vào `:id` và trả 400
   * "không phải UUID" thay vì chạy handler này.
   */
  @Get('messages/stats')
  @Roles('admin')
  @ApiOperation({
    summary: 'Đếm thư theo từng trạng thái, cho badge trên thanh điều hướng BO (admin)',
    description:
      'Endpoint riêng thay vì nhét vào response danh sách: badge được đọc ở MỌI trang của /bo, ' +
      'còn danh sách thì không — gộp lại buộc mọi trang tải cả một trang tin nhắn chỉ để lấy số.',
  })
  @ApiOkResponse({ type: ContactMessageStatsDto })
  getMessageStats() {
    return this.contactService.getMessageStats();
  }

  @Get('messages/:id')
  @Roles('admin')
  @ApiOperation({
    summary: 'Một tin nhắn (admin)',
    description:
      'Để `/bo/contact/messages/:id` deep-link và refresh được, kể cả khi tin nhắn đã trôi ' +
      'qua trang 1 của hộp thư.',
  })
  @ApiOkResponse({ type: ContactMessageDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tin nhắn này' })
  getMessageById(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactService.getMessageById(id);
  }

  @Patch('messages/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Đánh dấu một tin nhắn đã xử lý tới đâu (admin)' })
  @ApiOkResponse({ type: ContactMessageDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tin nhắn này' })
  updateMessageStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactMessageStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    // `handledBy` lấy từ token, KHÔNG từ body: để client tự khai ai đã xử lý
    // thì trường kiểm toán này chẳng chứng minh được gì.
    return this.contactService.updateMessageStatus(id, dto.status, user?.id ?? null, dto.note);
  }

  @Delete('messages/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xoá mềm một tin nhắn (admin)',
    description:
      'Chuyển sang trạng thái DELETED — dòng và tệp đính kèm VẪN CÒN, thư chỉ biến mất khỏi hộp ' +
      'thư mặc định. Khôi phục bằng PATCH với status khác; xem thùng rác bằng ?status=DELETED. ' +
      'LƯU Ý: bucket đang để public-read, nên tệp đính kèm của thư đã xoá vẫn đọc được bởi ai ' +
      'còn giữ URL — route này giấu thư, KHÔNG thu hồi quyền đọc tệp.',
  })
  @ApiNoContentResponse({ description: 'Đã chuyển sang DELETED' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tin nhắn này' })
  deleteMessage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.contactService.softDeleteMessage(id, user?.id ?? null);
  }
}
