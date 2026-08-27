import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCallerMeta } from './user-meta';
import { canViewContactPii } from './roles.constants';

/**
 * Nạp role + member đã link của người gọi vào request, rồi suy ra `canSeePii`.
 *
 * LUÔN trả true — đây là bộ LÀM GIÀU request, không phải bộ chặn. Route
 * `@Public()` phải chạy được với người chưa đăng nhập (khi đó canSeePii = false),
 * nên ném ở đây sẽ làm hỏng chính những endpoint công khai.
 *
 * THỨ TỰ BẮT BUỘC: `@UseGuards(JwtAuthGuard, CallerMetaGuard)` — Nest chạy guard
 * từ trái sang phải; đặt trước JwtAuthGuard thì req.user chưa tồn tại và mọi
 * người sẽ bị coi là ẩn danh.
 *
 * Dùng chung memo với RolesGuard (resolveCallerMeta) ⇒ 1 query cho cả hai.
 */
@Injectable()
export class CallerMetaGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const meta = await resolveCallerMeta(req, this.prisma);
    req.canSeePii = canViewContactPii(meta.roles);
    return true;
  }
}
