import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secret',
    });
  }

  async validate(payload: any) {
    if (!payload?.sub && !payload?.id) {
      throw new UnauthorizedException();
    }
    // `profileMemberId` được auth.service ký vào token (xem login) — phải trả ra
    // đây, nếu không mọi chỗ dùng `req.user` đều mất liên kết user → thành viên
    // và phải tự query lại UserMetadata.
    return {
      id: payload.sub || payload.id,
      email: payload.email,
      roles: payload.roles,
      profileMemberId: payload.profileMemberId ?? null,
      displayName: payload.displayName ?? null,
    };
  }
}
