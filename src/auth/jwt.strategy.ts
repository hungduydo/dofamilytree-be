import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { seedCallerMeta } from './user-meta';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secret',
      passReqToCallback: true,
    });
  }

  /**
   * Chữ ký hợp lệ chưa đủ: tài khoản bị admin khoá phải mất quyền NGAY, không
   * phải khi token hết TTL 1 ngày. Nên mỗi request có token đọc UserMetadata
   * một lần, và ghi row đó vào memo của resolveCallerMeta — RolesGuard và
   * CallerMetaGuard dùng lại, nên route có guard đó không tốn thêm query nào.
   *
   * Trên route @Public(), lỗi ở đây bị JwtAuthGuard nuốt thành "ẩn danh" — người
   * bị khoá vẫn đọc được trang công khai như khách, đúng như mọi người lạ khác.
   */
  async validate(req: any, payload: any) {
    const userId = payload?.sub || payload?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const row = await this.prisma.userMetadata.findUnique({
      where: { user_id: userId },
      select: { roles: true, profile_member_id: true, deactivated_at: true },
    });
    if (row?.deactivated_at) {
      throw new UnauthorizedException('Account is deactivated');
    }
    seedCallerMeta(req, row);

    // `profileMemberId` được auth.service ký vào token (xem login) — phải trả ra
    // đây, nếu không mọi chỗ dùng `req.user` đều mất liên kết user → thành viên
    // và phải tự query lại UserMetadata.
    return {
      id: userId,
      email: payload.email,
      roles: payload.roles,
      profileMemberId: payload.profileMemberId ?? null,
      displayName: payload.displayName ?? null,
    };
  }
}
