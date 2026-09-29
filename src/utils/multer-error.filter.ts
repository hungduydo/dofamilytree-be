import {
  ArgumentsHost, Catch, ExceptionFilter, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

/**
 * Lưới an toàn cho MulterError mà @nestjs/platform-express KHÔNG dịch được.
 *
 * `transformException` của platform-express v10 so khớp theo `error.message`
 * với bảng chuỗi cứng của multer 1.x/2.0. multer ≥2.1 đã đổi chữ (vd.
 * LIMIT_UNEXPECTED_FILE: "Unexpected field" → "Unexpected file field") và thêm
 * mã mới (LIMIT_FIELD_NESTING, INVALID_FIELD_NAME…). Lỗi nào lọt bảng đó sẽ bay
 * ra thô và thành 500 — trong khi đó là lỗi của request, phải là 4xx.
 *
 * Filter này ánh xạ theo `code` (ổn định giữa các bản) thay vì message.
 * LIMIT_FILE_SIZE vẫn khớp message nên Nest đã đổi sẵn thành
 * PayloadTooLargeException và đi tới các filter 413 tiếng Việt ở media/contact;
 * nhánh 413 ở đây chỉ phòng khi message đó cũng đổi.
 *
 * `@Catch(MulterError)` dựa trên instanceof, nên cần đúng MỘT bản multer trong
 * cây — `overrides.multer` trong pnpm-workspace.yaml đảm bảo điều đó.
 */
@Catch(MulterError)
export class MulterErrorFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const tooLarge = exception.code === 'LIMIT_FILE_SIZE';
    const status = tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;

    res.status(status).json({
      statusCode: status,
      error: tooLarge ? 'Payload Too Large' : 'Bad Request',
      message: exception.message,
      code: exception.code,
      ...(exception.field ? { field: exception.field } : {}),
    });
  }
}
