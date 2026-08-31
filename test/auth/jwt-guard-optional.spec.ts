import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../src/auth/jwt.guard';

/**
 * JwtAuthGuard trên route @Public(): KHÔNG đòi token, nhưng VẪN đọc token nếu
 * người gọi có gửi.
 *
 * Vì sao điều này quan trọng: trước đây guard `return true` ngay khi thấy
 * @Public(), nên passport không chạy và `req.user` không tồn tại. CallerMetaGuard
 * đứng sau vì thế coi MỌI người là ẩn danh, và một `member` đã đăng nhập mở
 * GET /v2/contact/info vẫn thấy `board[].phone` = null dù họ có đúng quyền xem.
 * Nói cách khác, route public KHÔNG phân biệt nổi khách vãng lai với người trong nhà.
 */
describe('JwtAuthGuard — xác thực TUỲ CHỌN trên route @Public()', () => {
  const ctxFor = (req: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as any;

  const guardFor = (isPublic: boolean) => {
    const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
    return new JwtAuthGuard(reflector);
  };

  describe('canActivate', () => {
    it('route public KHÔNG có header Authorization ⇒ qua luôn, không gọi passport', () => {
      const guard = guardFor(true);
      const superSpy = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true as any);

      expect(guard.canActivate(ctxFor({ headers: {} }))).toBe(true);
      // Đây là đường đi của gần như mọi lượt truy cập trang công khai — không
      // được trả thêm chi phí xác thực nào.
      expect(superSpy).not.toHaveBeenCalled();
      superSpy.mockRestore();
    });

    it('route public CÓ token ⇒ vẫn chạy passport để nạp req.user', () => {
      const guard = guardFor(true);
      const superSpy = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true as any);
      const req: any = { headers: { authorization: 'Bearer abc' } };

      guard.canActivate(ctxFor(req));
      expect(superSpy).toHaveBeenCalled();
      superSpy.mockRestore();
    });

    it('cờ đặt trên REQUEST, không phải trên instance guard', () => {
      // Guard là singleton dùng chung cho mọi request đồng thời; để trạng thái
      // trên `this` là hai request ghi đè lẫn nhau.
      const guard = guardFor(true);
      jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true as any);

      const withToken: any = { headers: { authorization: 'Bearer abc' } };
      const withoutToken: any = { headers: {} };
      guard.canActivate(ctxFor(withToken));
      guard.canActivate(ctxFor(withoutToken));

      expect(withToken.__optionalAuth).toBe(true);
      expect(withoutToken.__optionalAuth).toBeUndefined();
      jest.restoreAllMocks();
    });

    it('route KHÔNG public ⇒ giữ nguyên hành vi cũ (luôn qua passport)', () => {
      const guard = guardFor(false);
      const superSpy = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true as any);

      guard.canActivate(ctxFor({ headers: {} }));
      expect(superSpy).toHaveBeenCalled();
      superSpy.mockRestore();
    });
  });

  describe('handleRequest', () => {
    const guard = guardFor(true);

    it('route public + token hợp lệ ⇒ trả user', () => {
      const req: any = { __optionalAuth: true };
      expect(guard.handleRequest(null, { id: 'u1' }, null, ctxFor(req))).toEqual({ id: 'u1' });
    });

    it('route public + token HỎNG ⇒ ẩn danh, KHÔNG ném 401', () => {
      // Người dùng còn token cũ trong localStorage vẫn phải đọc được trang
      // công khai — chỉ là đọc với tư cách khách.
      const req: any = { __optionalAuth: true };
      expect(guard.handleRequest(new Error('jwt expired'), false, null, ctxFor(req))).toBeNull();
    });

    it('route thường + không có user ⇒ VẪN ném (không nới lỏng route có guard)', () => {
      const req: any = {};
      expect(() => guard.handleRequest(null, false, null, ctxFor(req))).toThrow();
    });
  });
});
