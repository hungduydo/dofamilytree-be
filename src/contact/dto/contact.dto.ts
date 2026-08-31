import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CONTACT_BRANCH_MAX_LENGTH,
  CONTACT_CONTENT_MAX_LENGTH,
  CONTACT_CONTENT_MIN_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_NAME_MIN_LENGTH,
  CONTACT_PHONE_PATTERN,
  CONTACT_STATUSES,
  CONTACT_TOPICS,
  ContactStatus,
  ContactTopic,
} from '../contact.constants';

/**
 * `trim()` áp cho MỌI trường text trước khi đo độ dài.
 *
 * @Transform chạy TRƯỚC @Length/@Matches (class-transformer đi trước
 * class-validator trong ValidationPipe), nên một chuỗi toàn khoảng trắng bị đo
 * là rỗng chứ không lọt qua nhờ độ dài — cùng thủ pháp CreateTributeDto dùng.
 */
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

// ─── Ghi ─────────────────────────────────────────────────────────────────────

/**
 * Thân của `POST /v2/contact/messages`.
 *
 * Đến từ multipart/form-data, nên MỌI giá trị tới đây đều là chuỗi — kể cả khi
 * FE gửi số. Không có trường số nào trong DTO này nên không cần ép kiểu.
 */
export class CreateContactMessageDto {
  @ApiProperty({
    enum: CONTACT_TOPICS,
    description:
      'Thư về việc gì. Nhãn hiển thị do FE dịch (ContactPage.topic<VALUE>), API chỉ nhận giá trị enum.',
  })
  @IsIn(CONTACT_TOPICS as readonly string[], {
    message: `topic phải là một trong: ${CONTACT_TOPICS.join(', ')}`,
  })
  topic: ContactTopic;

  @ApiProperty({
    minLength: CONTACT_NAME_MIN_LENGTH,
    maxLength: CONTACT_NAME_MAX_LENGTH,
    example: 'Nguyễn Văn An',
  })
  @trim()
  @IsString({ message: 'Vui lòng nhập họ tên.' })
  @Length(CONTACT_NAME_MIN_LENGTH, CONTACT_NAME_MAX_LENGTH, {
    message: `Họ tên phải từ ${CONTACT_NAME_MIN_LENGTH} đến ${CONTACT_NAME_MAX_LENGTH} ký tự.`,
  })
  fullName: string;

  @ApiProperty({
    example: '0988 123 456',
    description: 'Bắt đầu bằng 0 hoặc +84. Cho phép khoảng trắng, dấu chấm, gạch ngang.',
  })
  @trim()
  @IsString({ message: 'Vui lòng nhập số điện thoại.' })
  @Matches(CONTACT_PHONE_PATTERN, {
    message: 'Số điện thoại không hợp lệ. Ví dụ: 0988 123 456 hoặc +84 988 123 456.',
  })
  phone: string;

  /**
   * KHÔNG bắt buộc, một cách CỐ Ý: cụ ông có điện thoại mà không có hòm thư vẫn
   * phải viết được cho ban liên lạc. `phone` bắt buộc nên ban liên lạc luôn có
   * đường trả lời.
   *
   * @ValidateIf cho phép chuỗi RỖNG đi qua: FE gửi `email` chỉ khi người dùng
   * điền, nhưng một form gửi `email=""` không được vì thế mà 400 — đó là "bỏ
   * trống", không phải "sai định dạng".
   */
  @ApiPropertyOptional({ example: 'an.nguyen@example.com' })
  @IsOptional()
  @trim()
  @ValidateIf((_o, value) => value !== '' && value !== undefined && value !== null)
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email?: string;

  @ApiPropertyOptional({
    maxLength: CONTACT_BRANCH_MAX_LENGTH,
    example: 'Chi thứ ba, Đông Ngạc',
    description: 'Người gửi thuộc chi/nhánh nào — giúp ban liên lạc định vị nhanh.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @Length(0, CONTACT_BRANCH_MAX_LENGTH, {
    message: `Chi/nhánh tối đa ${CONTACT_BRANCH_MAX_LENGTH} ký tự.`,
  })
  branch?: string;

  @ApiProperty({
    minLength: CONTACT_CONTENT_MIN_LENGTH,
    maxLength: CONTACT_CONTENT_MAX_LENGTH,
    example: 'Con là cháu đời thứ 6, xin hỏi ban liên lạc về việc bổ sung tên vào gia phả...',
  })
  @trim()
  @IsString({ message: 'Vui lòng nhập nội dung.' })
  @Length(CONTACT_CONTENT_MIN_LENGTH, CONTACT_CONTENT_MAX_LENGTH, {
    message: `Nội dung phải từ ${CONTACT_CONTENT_MIN_LENGTH} đến ${CONTACT_CONTENT_MAX_LENGTH} ký tự.`,
  })
  content: string;
}

export class UpdateContactMessageStatusDto {
  @ApiProperty({ enum: CONTACT_STATUSES })
  @IsIn(CONTACT_STATUSES as readonly string[], {
    message: `status phải là một trong: ${CONTACT_STATUSES.join(', ')}`,
  })
  status: ContactStatus;
}

// ─── Đọc ─────────────────────────────────────────────────────────────────────

export class ContactChannelDto {
  @ApiProperty({
    enum: ['address', 'phone', 'email', 'group'],
    description: 'Quyết định icon và nhãn hành động — FE tự suy nhãn, API KHÔNG gửi.',
  })
  type: string;

  @ApiProperty({ example: 'Nhà thờ họ Nguyễn' })
  label: string;

  @ApiProperty({ example: 'Thôn Nguyễn Xá, xã Đông Ngạc, huyện Từ Liêm, Hà Nội' })
  value: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Có thể null. channelHref() bên FE tự suy tel:/mailto: từ `value` cho kênh phone/email.',
  })
  href: string | null;
}

export class ContactVenueDto {
  @ApiProperty({ example: 'Nhà thờ họ Nguyễn' })
  name: string;

  @ApiProperty({ example: 'Đông Ngạc, Từ Liêm, Hà Nội' })
  address: string;

  @ApiProperty({ nullable: true, type: String })
  imageUrl: string | null;
}

export class ContactHoursDto {
  @ApiProperty({ example: 'Thứ Hai – Thứ Sáu' })
  label: string;

  @ApiProperty({ example: '08:00 – 17:00' })
  value: string;
}

export class ContactBoardMemberDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Có giá trị khi người này nằm trong cây gia phả, để thẻ liên kết sang trang cá nhân. ' +
      'Tách khỏi `id` để sau này thêm được một ghế ban liên lạc do người NGOÀI cây nắm giữ.',
  })
  memberId: string | null;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  name: string;

  @ApiProperty({ example: 'Trưởng tộc' })
  role: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'PII: null với người gọi không có quyền xem (thấp hơn `member`, và cả `editor`).',
  })
  phone: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'PII: null với người gọi không có quyền xem — xem `phone`.',
  })
  email: string | null;

  @ApiProperty({ nullable: true, type: String })
  avatarUrl: string | null;
}

export class ContactInfoDto {
  @ApiProperty({ type: [ContactChannelDto] })
  channels: ContactChannelDto[];

  @ApiProperty({
    type: ContactVenueDto,
    nullable: true,
    description: 'null khi dòng họ chưa có nhà thờ riêng, hoặc chưa khai báo.',
  })
  venue: ContactVenueDto | null;

  @ApiProperty({ type: [ContactHoursDto] })
  hours: ContactHoursDto[];

  @ApiProperty({
    type: [ContactBoardMemberDto],
    description: 'Chiếu từ `members` (profile.isCommittee), KHÔNG phải bảng riêng.',
  })
  board: ContactBoardMemberDto[];

  @ApiProperty({ nullable: true, type: String, example: 'Nhiệm kỳ 2023 – 2028' })
  boardTerm: string | null;

  @ApiProperty({ nullable: true, type: Number, example: 3 })
  responseDays: number | null;
}

export class ContactMessageReceiptDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({
    example: 'LH-2608-0431',
    description: 'Mã ngắn để người nhà đọc qua điện thoại khi hỏi lại.',
  })
  referenceCode: string;
}

// ─── Back-office (admin) ─────────────────────────────────────────────────────

/**
 * Bốn loại kênh liên lạc. Quyết định icon + nhãn hành động phía FE, nên đây là
 * ALLOWLIST chứ không phải gợi ý: một `type` lạ lọt xuống DB sẽ render ra thẻ
 * không có icon và không có nút bấm.
 */
export const CONTACT_CHANNEL_TYPES = ['address', 'phone', 'email', 'group'] as const;
export type ContactChannelType = (typeof CONTACT_CHANNEL_TYPES)[number];

/**
 * Trần số dòng cho channels/hours. Rộng hơn nhu cầu thật rất nhiều (một dòng họ
 * có 4 kênh và ~3 dòng giờ), chỉ để một lần gõ nhầm ở BO không nhồi được hàng
 * nghìn dòng vào response của endpoint PUBLIC.
 */
export const CONTACT_MAX_CHANNELS = 20;
export const CONTACT_MAX_HOURS = 20;

/** Trần `responseDays`. 0 ngày là vô nghĩa; hơn một năm cũng vậy. */
export const CONTACT_RESPONSE_DAYS_MIN = 1;
export const CONTACT_RESPONSE_DAYS_MAX = 365;

export class UpsertContactChannelDto {
  @ApiProperty({ enum: CONTACT_CHANNEL_TYPES })
  @IsIn(CONTACT_CHANNEL_TYPES as readonly string[], {
    message: `type phải là một trong: ${CONTACT_CHANNEL_TYPES.join(', ')}`,
  })
  type: ContactChannelType;

  @ApiProperty({ example: 'Nhà thờ họ Nguyễn' })
  @trim()
  @IsString()
  @Length(1, 200, { message: 'Nhãn kênh liên lạc phải từ 1 đến 200 ký tự.' })
  label: string;

  @ApiProperty({ example: 'Thôn Nguyễn Xá, xã Đông Ngạc, huyện Từ Liêm, Hà Nội' })
  @trim()
  @IsString()
  @Length(1, 500, { message: 'Nội dung kênh liên lạc phải từ 1 đến 500 ký tự.' })
  value: string;

  /**
   * Bỏ trống được. channelHref() bên FE tự suy `tel:`/`mailto:` từ `value` cho
   * kênh phone/email, nên chỉ cần điền khi muốn trỏ đi chỗ khác (bản đồ, link
   * nhóm Zalo).
   */
  @ApiPropertyOptional({ nullable: true, example: 'https://maps.google.com/?q=...' })
  @IsOptional()
  @trim()
  @IsString()
  @Length(0, 1000)
  href?: string | null;
}

export class UpsertContactHoursDto {
  @ApiProperty({ example: 'Thứ Hai – Thứ Sáu' })
  @trim()
  @IsString()
  @Length(1, 200, { message: 'Nhãn giờ mở cửa phải từ 1 đến 200 ký tự.' })
  label: string;

  @ApiProperty({ example: '08:00 – 17:00' })
  @trim()
  @IsString()
  @Length(1, 200, { message: 'Giờ mở cửa phải từ 1 đến 200 ký tự.' })
  value: string;
}

export class UpsertContactVenueDto {
  @ApiProperty({ example: 'Nhà thờ họ Nguyễn' })
  @trim()
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiProperty({ example: 'Đông Ngạc, Từ Liêm, Hà Nội' })
  @trim()
  @IsString()
  @Length(1, 500)
  address: string;

  @ApiPropertyOptional({ nullable: true, description: 'URL ảnh đã upload qua /v2/media.' })
  @IsOptional()
  @trim()
  @IsString()
  @Length(0, 1000)
  imageUrl?: string | null;
}

/**
 * Thân của `PUT /v2/contact/info`.
 *
 * SHAPE KHỚP CHÍNH XÁC thứ `GET /contact/info` trả về (trừ `board`, vốn là
 * chiếu từ `members` chứ không phải dữ liệu của bảng này). BO vì thế đọc lên,
 * sửa, rồi PUT thẳng lại mà không cần lớp chuyển đổi nào ở giữa.
 *
 * PUT chứ không phải PATCH, và ngữ nghĩa là THAY THẾ TRỌN KHỐI: `channels` và
 * `hours` là danh sách CÓ THỨ TỰ, mà thứ tự thì không diễn đạt được bằng một
 * bản vá từng phần — muốn đổi chỗ hai kênh bằng PATCH thì phải phát minh ra cú
 * pháp thao tác riêng. Gửi cả mảng, thứ tự trong mảng LÀ thứ tự hiển thị.
 */
export class UpdateContactInfoDto {
  @ApiPropertyOptional({
    type: UpsertContactVenueDto,
    nullable: true,
    description: 'null = dòng họ không có nhà thờ riêng. Bỏ qua trường này cũng được hiểu là null.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertContactVenueDto)
  venue?: UpsertContactVenueDto | null;

  @ApiProperty({ type: [UpsertContactChannelDto], description: 'Thứ tự trong mảng LÀ thứ tự hiển thị.' })
  @IsArray()
  @ArrayMaxSize(CONTACT_MAX_CHANNELS, {
    message: `Tối đa ${CONTACT_MAX_CHANNELS} kênh liên lạc.`,
  })
  @ValidateNested({ each: true })
  @Type(() => UpsertContactChannelDto)
  channels: UpsertContactChannelDto[];

  @ApiProperty({ type: [UpsertContactHoursDto], description: 'Thứ tự trong mảng LÀ thứ tự hiển thị.' })
  @IsArray()
  @ArrayMaxSize(CONTACT_MAX_HOURS, { message: `Tối đa ${CONTACT_MAX_HOURS} dòng giờ mở cửa.` })
  @ValidateNested({ each: true })
  @Type(() => UpsertContactHoursDto)
  hours: UpsertContactHoursDto[];

  @ApiPropertyOptional({ nullable: true, example: 'Nhiệm kỳ 2023 – 2028' })
  @IsOptional()
  @trim()
  @IsString()
  @Length(0, 200)
  boardTerm?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    minimum: CONTACT_RESPONSE_DAYS_MIN,
    maximum: CONTACT_RESPONSE_DAYS_MAX,
    example: 3,
  })
  @IsOptional()
  // Body của PUT là JSON (khác POST /messages vốn là multipart), nên số tới đây
  // đã là number. @Type vẫn cần cho trường hợp client gửi chuỗi "3".
  @Type(() => Number)
  @IsInt({ message: 'responseDays phải là số nguyên.' })
  @Min(CONTACT_RESPONSE_DAYS_MIN, { message: `responseDays tối thiểu ${CONTACT_RESPONSE_DAYS_MIN}.` })
  @Max(CONTACT_RESPONSE_DAYS_MAX, { message: `responseDays tối đa ${CONTACT_RESPONSE_DAYS_MAX}.` })
  responseDays?: number | null;
}

/**
 * Một lá thư trong hộp thư ban liên lạc.
 *
 * KHÁC ContactInfoDto ở chỗ: đây là dữ liệu người NGOÀI gửi vào, chỉ admin đọc
 * được, nên trả đủ — kể cả `phone`/`email` của người gửi. Đó là thông tin liên
 * lạc họ CHỦ ĐỘNG cung cấp để được trả lời, không phải PII bị lộ.
 */
export class ContactMessageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'LH-2608-0431' })
  referenceCode: string;

  @ApiProperty({ enum: CONTACT_TOPICS })
  topic: string;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  fullName: string;

  @ApiProperty({ example: '0988 123 456' })
  phone: string;

  @ApiProperty({ nullable: true, type: String })
  email: string | null;

  @ApiProperty({ nullable: true, type: String })
  branch: string | null;

  @ApiProperty()
  content: string;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        name: { type: 'string' },
        mimeType: { type: 'string' },
        size: { type: 'number' },
      },
    },
  })
  attachments: unknown[];

  @ApiProperty({ enum: CONTACT_STATUSES })
  status: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Có giá trị khi người gửi tình cờ đang đăng nhập. Phần lớn thư là của khách.',
  })
  userId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class PaginatedContactMessagesDto {
  @ApiProperty({ type: [ContactMessageDto] })
  data: ContactMessageDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}
