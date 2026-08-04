import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Parse một query param số KHÔNG bắt buộc, trả `undefined` khi không được truyền.
 *
 * Vì sao không dùng `new ParseIntPipe({ optional: true })`:
 * `main.ts` bật global `ValidationPipe({ transform: true })`, pipe này chạy TRƯỚC
 * pipe cấp tham số. Với một param khai báo kiểu `number`, nó ép giá trị vắng mặt
 * thành `NaN` (`typeof 'number'`, nên `isNil` = false) → `optional: true` không
 * bao giờ kích hoạt và `ParseIntPipe` ném "Validation failed (numeric string is
 * expected)" cho MỌI request không truyền param đó. Nó cũng ép chuỗi rỗng thành
 * `0`, mà 0 là một thế hệ CÓ THẬT trong dữ liệu — `?generation=` sẽ lặng lẽ lọc
 * theo thế hệ 0 thay vì bỏ lọc.
 *
 * Cách chữa: khai báo tham số ở controller là `any` (không phải `number`) để
 * `design:type` không kích hoạt ép kiểu, rồi parse tường minh ở đây.
 */
@Injectable()
export class ParseOptionalIntPipe implements PipeTransform<unknown, number | undefined> {
  transform(value: unknown): number | undefined {
    // Không truyền, hoặc truyền rỗng (`?generation=`) → không lọc.
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;

    // Phòng xa: nếu một global pipe nào đó vẫn ép sang number trước.
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) {
        throw new BadRequestException('Validation failed (numeric string is expected)');
      }
      return value;
    }

    const raw = String(value).trim();
    if (!/^-?\d+$/.test(raw)) {
      throw new BadRequestException('Validation failed (numeric string is expected)');
    }
    return parseInt(raw, 10);
  }
}
