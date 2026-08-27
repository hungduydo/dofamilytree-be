import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from './roles.decorator';

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

    const user = context.switchToHttp().getRequest().user;
    if (!user?.id) throw new ForbiddenException('Authentication required');

    // KHÔNG dùng `user.roles` từ JWT payload: token phát hành trước khi admin đổi
    // role vẫn mang role cũ. Đọc thẳng UserMetadata (xem auth.service.assignRoles).
    const meta = await this.prisma.userMetadata.findUnique({
      where: { user_id: user.id },
      select: { roles: true },
    });

    if (!required.some((role) => meta?.roles.includes(role))) {
      throw new ForbiddenException(`Requires one of roles: ${required.join(', ')}`);
    }
    return true;
  }
}
