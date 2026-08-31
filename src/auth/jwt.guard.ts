import { Injectable, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Cờ đặt lên request để handleRequest biết đây là route @Public(). */
const OPTIONAL_AUTH_KEY = '__optionalAuth';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Route @Public() KHÔNG đòi token, nhưng VẪN đọc token nếu người gọi có gửi.
   *
   * VÌ SAO KHÔNG `return true` NGAY (hành vi trước đây): làm vậy thì passport
   * không chạy, `req.user` không tồn tại, và CallerMetaGuard đứng sau coi MỌI
   * người là ẩn danh. Hệ quả cụ thể: một `member` đã đăng nhập mở
   * GET /v2/contact/info vẫn thấy `board[].phone` = null, dù họ có đúng quyền
   * xem — vì route đó là public. Nói cách khác, route public trước đây KHÔNG
   * phân biệt nổi khách vãng lai với người trong nhà.
   *
   * Đây là điều kiện tiên quyết của quy tắc PII trong api-contact.md §3.1, và
   * cũng sửa luôn khiếm khuyết đó cho mọi route @Public() khác.
   *
   * FAIL OPEN, có chủ ý: token hỏng/hết hạn trên route public KHÔNG được biến
   * thành 401 (xem handleRequest) — người dùng có token cũ trong localStorage
   * vẫn phải đọc được trang công khai, chỉ là đọc với tư cách khách.
   *
   * Cờ đặt trên REQUEST chứ không phải trên `this`: guard là singleton dùng
   * chung cho mọi request đồng thời, để trạng thái trên instance là hai request
   * ghi đè lẫn nhau.
   */
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) return super.canActivate(context);

    const req = context.switchToHttp().getRequest();
    // Không có header Authorization ⇒ khỏi gọi passport cho tốn công. Đây là
    // đường đi của gần như mọi lượt truy cập trang public.
    if (!req?.headers?.authorization) return true;

    req[OPTIONAL_AUTH_KEY] = true;
    return super.canActivate(context);
  }

  /**
   * Trên route public: token hợp lệ ⇒ gắn user, mọi trường hợp khác ⇒ ẩn danh,
   * KHÔNG BAO GIỜ ném. Route thường giữ nguyên hành vi cũ của passport.
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any) {
    const req = context.switchToHttp().getRequest();
    if (req?.[OPTIONAL_AUTH_KEY]) return user || null;
    return super.handleRequest(err, user, info, context, status);
  }
}
