import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from './roles.decorator';
import { highestRole, roleRank } from './roles.constants';
import { resolveCallerMeta } from './user-meta';
import { logEvent } from '../observability/log-event';

/**
 * PHÂN CẤP: guest < member < editor < admin. `@Roles('editor')` nghĩa là
 * "editor TRỞ LÊN", nên admin qua được mọi route mà không phải liệt kê admin ở
 * từng chỗ. Nhiều role trong một @Roles() vẫn là OR — lấy mức thấp nhất.
 *
 * LƯU Ý: thứ bậc này CHỈ nói về quyền ghi. Quyền xem thông tin liên lạc không
 * đơn điệu (editor xếp trên member nhưng không được xem) — xem PII_ROLES trong
 * roles.constants.ts, và đừng bao giờ dùng guard này để gác PII.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest();
    const forbidden = (reason: string, message: string) => {
      logEvent('auth.forbidden', 'warn', 'Request forbidden by role guard', {
        'auth.reason': reason,
        'auth.required_roles': required.join(','),
        'http.request.method': req.method,
        'http.route': req.route?.path,
      });
      return new ForbiddenException(message);
    };
    if (!req.user?.id) throw forbidden('unauthenticated', 'Authentication required');

    // Toàn role lạ (gõ sai tên trong @Roles) ⇒ chặn, KHÔNG cho qua. Một typo
    // phải làm route hỏng ồn ào chứ không phải mở toang nó.
    const threshold = Math.min(...required.map(roleRank).filter((rank) => rank >= 0));
    if (!Number.isFinite(threshold)) {
      throw forbidden('unknown_role_requirement', `Unknown role requirement: ${required.join(', ')}`);
    }

    // KHÔNG dùng `user.roles` từ JWT payload: token phát hành trước khi admin đổi
    // role vẫn mang role cũ. Đọc thẳng UserMetadata (xem auth.service.assignRoles).
    const { roles } = await resolveCallerMeta(req, this.prisma);

    if (roleRank(highestRole(roles)) < threshold) {
      throw forbidden('insufficient_role', `Requires one of roles: ${required.join(', ')}`);
    }
    return true;
  }
}
