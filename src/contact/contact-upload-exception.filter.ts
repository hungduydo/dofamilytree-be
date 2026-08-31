import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';
import { CONTACT_ATTACHMENT_MAX_BYTES } from './contact.constants';

/**
 * Đổi 413 trống nghĩa của multer ("File too large") thành message tiếng Việt.
 *
 * FE hiển thị THẲNG `error.response?.data?.message` trong toast
 * (api-contact.md §3.2), nên chuỗi này là thứ người trong dòng họ ĐỌC — viết
 * cho họ, không phải cho log.
 *
 * Chỉ bắt được 413 do multer ném, tức file ĐÃ tới được function. 413 do Vercel
 * chặn ở tầng platform (body vượt trần 4,5 MB) không bao giờ chạm tới NestJS
 * nên filter này không thấy — đó chính là lý do CONTACT_ATTACHMENT_MAX_BYTES
 * phải bám sát trần platform thay vì hứa 10 MB như mockup.
 */
@Catch(PayloadTooLargeException)
export class ContactUploadPayloadTooLargeFilter implements ExceptionFilter {
  catch(exception: PayloadTooLargeException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    // Giữ nguyên message của ta khi 413 do ContactService ném (đã có tên tệp
    // cụ thể); chỉ thay khi nó đến từ multer.
    const original = exception.getResponse() as any;
    const ownMessage = typeof original === 'object' ? original?.message : undefined;

    res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      error: 'Payload Too Large',
      message:
        ownMessage && ownMessage !== 'File too large'
          ? ownMessage
          : `Tệp đính kèm vượt quá ${formatMb(CONTACT_ATTACHMENT_MAX_BYTES)}. ` +
            `Vui lòng chọn tệp nhỏ hơn.`,
      maxAttachmentBytes: CONTACT_ATTACHMENT_MAX_BYTES,
    });
  }
}

function formatMb(bytes: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(
    bytes / (1024 * 1024),
  )} MB`;
}
