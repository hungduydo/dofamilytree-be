import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ANONYMOUS_META, CallerMeta } from './user-meta';

/**
 * `true` nếu người gọi được xem phone/contactEmail/address/notes.
 *
 * Mặc định `false` khi CallerMetaGuard không chạy (controller quên gắn guard,
 * hoặc unit test dựng controller trần) — thiếu guard phải dẫn tới ÍT dữ liệu
 * hơn, không phải nhiều hơn.
 */
export const CanSeePii = createParamDecorator((_data: unknown, ctx: ExecutionContext): boolean => {
  return ctx.switchToHttp().getRequest().canSeePii ?? false;
});

/** Role + profile_member_id của người gọi, đọc từ DB (xem user-meta.ts). */
export const CurrentMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext): CallerMeta => {
  return ctx.switchToHttp().getRequest().__callerMeta ?? ANONYMOUS_META;
});
