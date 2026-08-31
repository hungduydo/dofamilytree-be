import {
  Logger,
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { pickDisplayName } from '../supabase/supabase-users.service';
import { StorageService } from '../storage/storage.service';
import { highestRole, AVAILABLE_ROLES } from './roles.constants';
import { LinkMemberDto } from './dto/link-member.dto';

// Nguồn sự thật đã chuyển sang roles.constants.ts. Re-export để import cũ
// (`from './auth.service'`) không vỡ.
export { AVAILABLE_ROLES };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Đăng ký = tạo một tài khoản GUEST, KHÔNG tạo Member/Profile.
   *
   * Trước đây register tự dựng luôn một Member rồi link vào tài khoản, tức là
   * bất kỳ ai cũng tự thêm được người vào cây phả hệ và tự nhận mình là người
   * trong họ. Giờ những gì người dùng khai được cất vào `claim_request`; admin
   * đọc rồi gắn tài khoản vào một Member CÓ SẴN (xem linkMember).
   */
  async register(dto: RegisterDto, avatarFile?: Express.Multer.File) {
    const { email, password, fullName, gender, birthDate, deathDate, generation, occupation, address, biography } = dto;

    // Supabase Studio đọc Display name từ raw_user_meta_data — ghi cả ba key
    // (display_name/full_name/name) để mọi nơi đọc tên đều thấy, khớp thứ tự ưu
    // tiên của pickDisplayName.
    const displayName = fullName.trim();

    const { data: authData, error: authError } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          full_name: displayName,
          name: displayName,
        },
      },
    });

    if (authError) {
      if (authError.message.toLowerCase().includes('already registered')) {
        throw new ConflictException('User with this email already exists');
      }
      throw new BadRequestException(authError.message);
    }

    if (!authData.user) {
      throw new InternalServerErrorException('User not created in Supabase Auth');
    }

    const userId = authData.user.id;
    const avatarUrl = await this.storeClaimAvatar(userId, avatarFile);

    const meta = await this.prisma.userMetadata.create({
      data: {
        user_id: userId,
        profile_member_id: null,
        roles: ['guest'],
        claim_request: {
          fullName: displayName,
          gender: gender ?? null,
          birthDate: birthDate ?? null,
          deathDate: deathDate ?? null,
          generation: generation ?? null,
          occupation: occupation ?? null,
          address: address ?? null,
          biography: biography ?? null,
          avatarUrl,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    return {
      id: userId,
      email: authData.user.email,
      name: displayName,
      roles: meta.roles,
      profileMemberId: null,
      // Cờ tường minh cho FE: đăng ký xong KHÔNG có member để điều hướng tới.
      status: 'pending_link' as const,
    };
  }

  /**
   * Ảnh đại diện lúc đăng ký chưa có Member để gắn vào (job QStash
   * handleAvatarUpload bắt buộc có memberId), nên upload thẳng và chỉ giữ URL
   * trong claim_request; linkMember sẽ copy sang Member.avatar_url.
   *
   * Best-effort: storage hỏng KHÔNG được làm hỏng việc đăng ký.
   */
  private async storeClaimAvatar(
    userId: string,
    file?: Express.Multer.File,
  ): Promise<string | null> {
    if (!file) return null;
    try {
      return await this.storage.put(`claims/${userId}/${file.originalname}`, file.buffer, file.mimetype);
    } catch (error) {
      this.logger.warn(`Không lưu được avatar đăng ký của ${userId}: ${(error as Error).message}`);
      return null;
    }
  }

  async login(dto: LoginDto) {
    const { email, password } = dto;

    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const userMetadata = await this.prisma.userMetadata.findUnique({
      where: { user_id: data.user.id },
    });

    if (!userMetadata) {
      throw new UnauthorizedException('User profile data missing');
    }

    const payload = {
      sub: data.user.id,
      email: data.user.email,
      roles: userMetadata.roles,
      // Role hiệu lực (cao nhất thắng) — FE chỉ cần đọc field này thay vì tự
      // suy ra thứ bậc từ mảng `roles`.
      role: highestRole(userMetadata.roles),
      profileMemberId: userMetadata.profile_member_id,
      // Ký sẵn vào token để media khỏi phải gọi Supabase admin mỗi lần upload.
      // Đổi Display name trên Supabase chỉ có hiệu lực ở lần đăng nhập kế tiếp;
      // token cũ được media fallback bằng lookup trực tiếp.
      displayName: pickDisplayName(data.user.user_metadata),
    };

    const token = this.jwtService.sign(payload, { expiresIn: '1d' });

    return {
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        roles: userMetadata.roles,
        role: highestRole(userMetadata.roles),
        profileMemberId: userMetadata.profile_member_id,
        pendingLink: userMetadata.profile_member_id === null,
      },
    };
  }

  async logout() {
    // JWT is stateless — client should discard the token.
    // Supabase session sign-out is handled client-side.
    return { message: 'Logout successful' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const { currentPassword, newPassword } = dto;

    const { data: userData, error: fetchError } = await this.supabase.auth.admin.getUserById(userId);
    if (fetchError || !userData.user?.email) {
      throw new InternalServerErrorException('Failed to retrieve user');
    }

    const { error: verifyError } = await this.supabase.auth.signInWithPassword({
      email: userData.user.email,
      password: currentPassword,
    });

    if (verifyError) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const { error: updateError } = await this.supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      throw new InternalServerErrorException('Failed to update password');
    }

    return { message: 'Password updated successfully' };
  }

  /**
   * Quên mật khẩu: nhờ Supabase Auth gửi email chứa link đặt lại mật khẩu.
   *
   * Luôn trả về CÙNG một thông điệp dù email có tồn tại hay không — tránh lộ
   * việc email nào đã đăng ký (email enumeration). Supabase cũng không báo lỗi
   * khi email không tồn tại nên chỉ log lại lỗi hệ thống thật sự.
   *
   * `redirectTo` là trang FE nơi người dùng nhập mật khẩu mới; đặt qua env
   * PASSWORD_RESET_REDIRECT_URL, mặc định lấy theo APP_URL.
   */
  async forgotPassword(email: string) {
    const redirectTo =
      process.env.PASSWORD_RESET_REDIRECT_URL ||
      `${(process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '')}/reset-password`;

    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      this.logger.warn(`Không gửi được email đặt lại mật khẩu cho ${email}: ${error.message}`);
    }

    return {
      message: 'Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.',
    };
  }

  async getMe(userId: string) {
    const userMetadata = await this.prisma.userMetadata.findUnique({
      where: { user_id: userId },
    });

    if (!userMetadata) {
      throw new UnauthorizedException('User not found');
    }

    const { data: userData } = await this.supabase.auth.admin.getUserById(userId);

    return {
      id: userId,
      email: userData?.user?.email ?? null,
      roles: userMetadata.roles,
      role: highestRole(userMetadata.roles),
      profileMemberId: userMetadata.profile_member_id,
      // Guest chưa được admin gắn vào member nào — FE hiện màn "chờ duyệt" và
      // đọc claimRequest để cho người dùng xem lại thông tin mình đã khai.
      pendingLink: userMetadata.profile_member_id === null,
      claimRequest: userMetadata.claim_request,
    };
  }

  getRoles() {
    return AVAILABLE_ROLES;
  }

  /**
   * Chuẩn hoá về MỘT role: cột DB là String[] nhưng ngữ nghĩa là "cao nhất
   * thắng", nên lưu mảng nhiều phần tử chỉ tạo ra trạng thái mơ hồ.
   */
  async assignRoles(requesterId: string, targetUserId: string, dto: AssignRolesDto) {
    // Chống tự khoá: admin cuối cùng tự hạ cấp mình là mất đường vào hệ thống,
    // chỉ còn cách sửa thẳng DB. Muốn đổi role của chính mình thì nhờ admin khác.
    if (requesterId === targetUserId) {
      throw new ForbiddenException('Không thể tự đổi role của chính mình');
    }

    const targetMeta = await this.prisma.userMetadata.findUnique({
      where: { user_id: targetUserId },
    });
    if (!targetMeta) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    const role = highestRole(dto.roles);

    // `member` nghĩa là "người trong dòng họ" và phải trỏ tới một Member cụ thể.
    // Cho phép member mà chưa link chính là trạng thái ta đang xoá bỏ.
    if (role === 'member' && !targetMeta.profile_member_id) {
      throw new BadRequestException(
        'Tài khoản chưa gắn với member nào — dùng POST /auth/users/:userId/link-member trước',
      );
    }

    const updated = await this.prisma.userMetadata.update({
      where: { user_id: targetUserId },
      data: { roles: [role] },
    });

    return { message: `Roles updated for user ${targetUserId}`, roles: updated.roles, role };
  }

  /**
   * Nâng một guest thành member bằng cách gắn tài khoản vào Member CÓ SẴN.
   *
   * Không bao giờ HẠ role: editor/admin được link vẫn giữ nguyên role của họ —
   * link chỉ nói "tài khoản này ứng với người này trong cây".
   */
  async linkMember(requesterId: string, targetUserId: string, dto: LinkMemberDto) {
    const targetMeta = await this.prisma.userMetadata.findUnique({
      where: { user_id: targetUserId },
    });
    if (!targetMeta) throw new NotFoundException(`User ${targetUserId} not found`);

    if (targetMeta.profile_member_id) {
      throw new ConflictException(
        'Tài khoản đã gắn với một member — gỡ link trước khi gắn sang member khác',
      );
    }

    const member = await this.prisma.member.findUnique({ where: { id: dto.memberId } });
    if (!member) throw new NotFoundException(`Member ${dto.memberId} not found`);

    // profile_member_id là @unique. Kiểm tra trước để trả 409 có thông điệp rõ
    // thay vì để Prisma ném P2002 thành 500.
    const taken = await this.prisma.userMetadata.findUnique({
      where: { profile_member_id: dto.memberId },
    });
    if (taken) {
      throw new ConflictException(`Member ${dto.memberId} đã thuộc về một tài khoản khác`);
    }

    const claim = (targetMeta.claim_request ?? {}) as { avatarUrl?: string | null };
    const role = highestRole(targetMeta.roles);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Ảnh người dùng tự gửi lúc đăng ký giờ mới có chỗ để gắn. Chỉ dùng khi
      // member chưa có avatar — dữ liệu dòng họ đã có luôn được ưu tiên.
      if (claim.avatarUrl && !member.avatar_url) {
        await tx.member.update({
          where: { id: dto.memberId },
          data: { avatar_url: claim.avatarUrl },
        });
      }

      return tx.userMetadata.update({
        where: { user_id: targetUserId },
        data: {
          profile_member_id: dto.memberId,
          linked_at: new Date(),
          roles: role === 'guest' ? ['member'] : targetMeta.roles,
        },
      });
    });

    return {
      message: `User ${targetUserId} linked to member ${dto.memberId}`,
      roles: updated.roles,
      role: highestRole(updated.roles),
      profileMemberId: updated.profile_member_id,
    };
  }

  /** Gỡ link. Chỉ hạ về guest nếu đang là member — editor/admin giữ nguyên. */
  async unlinkMember(requesterId: string, targetUserId: string) {
    if (requesterId === targetUserId) {
      throw new ForbiddenException('Không thể tự gỡ link của chính mình');
    }

    const targetMeta = await this.prisma.userMetadata.findUnique({
      where: { user_id: targetUserId },
    });
    if (!targetMeta) throw new NotFoundException(`User ${targetUserId} not found`);

    const role = highestRole(targetMeta.roles);
    const updated = await this.prisma.userMetadata.update({
      where: { user_id: targetUserId },
      data: {
        profile_member_id: null,
        linked_at: null,
        roles: role === 'member' ? ['guest'] : targetMeta.roles,
      },
    });

    return {
      message: `User ${targetUserId} unlinked`,
      roles: updated.roles,
      role: highestRole(updated.roles),
      profileMemberId: null,
    };
  }

  /**
   * Danh sách tài khoản cho màn duyệt của admin. `status=pending` là hàng đợi
   * chính: những guest đã đăng ký và đang chờ được gắn vào một member.
   */
  async listUsers(params: {
    status?: 'pending' | 'linked' | 'all';
    role?: string;
    page?: number;
    pageSize?: number;
  }) {
    const take = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    const skip = (Math.max(params.page ?? 1, 1) - 1) * take;

    const where: Prisma.UserMetadataWhereInput = {
      ...(params.status === 'pending' ? { profile_member_id: null } : {}),
      ...(params.status === 'linked' ? { NOT: { profile_member_id: null } } : {}),
      ...(params.role ? { roles: { has: params.role } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.userMetadata.findMany({
        where,
        skip,
        take,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        include: { profile_member: { select: { id: true, name: true, avatar_url: true } } },
      }),
      this.prisma.userMetadata.count({ where }),
    ]);

    // Email/tên hiển thị nằm ở Supabase Auth chứ không phải DB của ta, nên phải
    // hỏi từng user. Giới hạn `take` ≤ 100 giữ số lần gọi trong tầm kiểm soát.
    const data = await Promise.all(
      rows.map(async (row) => {
        const { data: authUser } = await this.supabase.auth.admin.getUserById(row.user_id);
        return {
          userId: row.user_id,
          email: authUser?.user?.email ?? null,
          displayName: pickDisplayName(authUser?.user?.user_metadata),
          roles: row.roles,
          role: highestRole(row.roles),
          profileMemberId: row.profile_member_id,
          profileMember: row.profile_member,
          claimRequest: row.claim_request,
          createdAt: row.created_at,
          linkedAt: row.linked_at,
        };
      }),
    );

    return { data, total, page: params.page ?? 1, pageSize: take };
  }
}
