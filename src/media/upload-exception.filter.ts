import {
  ArgumentsHost, Catch, ExceptionFilter, HttpStatus, PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';
import { MAX_UPLOAD_BYTES, formatBytes } from './media.constants';

/**
 * Đổi 413 trống nghĩa của multer ("File too large") thành message tiếng Việt có
 * kèm CON SỐ giới hạn thật + gợi ý đường presigned.
 *
 * Chỉ bắt được 413 do multer ném ra, tức file ĐÃ tới được function. 413 do
 * Vercel chặn ở tầng platform (body > trần Fluid Compute) không bao giờ chạm
 * tới NestJS nên filter này không thấy — đó là lý do trần platform phải được
 * nâng ở dashboard chứ không thể vá bằng code.
 */
@Catch(PayloadTooLargeException)
export class UploadPayloadTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      error: 'Payload Too Large',
      message:
        `File vượt quá giới hạn ${formatBytes(MAX_UPLOAD_BYTES)} cho upload trực tiếp. ` +
        `Với file lớn hơn, hãy dùng POST /v2/media/upload-url để upload thẳng lên storage.`,
      maxUploadBytes: MAX_UPLOAD_BYTES,
    });
  }
}
