import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRateLimiter, AuthThrottleGuard, AuthThrottleInterceptor } from './auth-rate-limit';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '7d' },
    }),
    PrismaModule,
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService, AuthRateLimiter, AuthThrottleGuard, AuthThrottleInterceptor],
  exports: [JwtModule],
})
export class AuthModule {}
