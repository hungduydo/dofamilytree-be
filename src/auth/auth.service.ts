import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { removeVietnameseTones } from '../utils/vietnamese-helper';
import { QUEUE_AVATAR_UPLOAD } from '../queue/queue.constants';

export const AVAILABLE_ROLES = [
  { id: 'guest-role-id', name: 'guest', permissions: ['read:public'] },
  { id: 'viewer-role-id', name: 'viewer', permissions: ['read:shared'] },
  { id: 'member-role-id', name: 'member', permissions: ['read:private'] },
  { id: 'editor-role-id', name: 'editor', permissions: ['manage:own_branch'] },
  { id: 'admin-role-id', name: 'admin', permissions: ['manage:roles', 'full:access'] },
];

@Injectable()
export class AuthService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @InjectQueue(QUEUE_AVATAR_UPLOAD) private avatarQueue: Queue,
  ) {}

  async register(dto: RegisterDto, avatarFile?: Express.Multer.File) {
    const { email, password, fullName, gender, birthDate, deathDate, generation, occupation, address, biography } = dto;

    const { data: authData, error: authError } = await this.supabase.auth.signUp({ email, password });

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

    const { member, userMetadata } = await this.prisma.$transaction(async (tx) => {
      const newMember = await tx.member.create({
        data: {
          name: fullName,
          normalized_name: removeVietnameseTones(fullName),
          gender: gender ?? null,
          birthDate: birthDate ?? null,
          deathDate: deathDate ?? null,
        },
      });

      await tx.profile.create({
        data: {
          member_id: newMember.id,
          fullName,
          generation: generation ?? null,
          occupation: occupation ?? null,
          address: address ?? null,
          biography: biography ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      const meta = await tx.userMetadata.create({
        data: {
          user_id: userId,
          profile_member_id: newMember.id,
          roles: ['member'],
        },
      });

      return { member: newMember, userMetadata: meta };
    });

    // Queue avatar upload if file was provided
    if (avatarFile) {
      await this.avatarQueue.add({
        memberId: member.id,
        buffer: avatarFile.buffer,
        filename: avatarFile.originalname,
        mimetype: avatarFile.mimetype,
      });
    }

    return {
      id: userId,
      email: authData.user.email,
      name: fullName,
      roles: userMetadata.roles,
      profileMemberId: userMetadata.profile_member_id,
    };
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
      profileMemberId: userMetadata.profile_member_id,
    };

    const token = this.jwtService.sign(payload, { expiresIn: '1d' });

    return {
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        roles: userMetadata.roles,
        profileMemberId: userMetadata.profile_member_id,
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
      profileMemberId: userMetadata.profile_member_id,
    };
  }

  getRoles() {
    return AVAILABLE_ROLES;
  }

  async assignRoles(requesterId: string, targetUserId: string, dto: AssignRolesDto) {
    const requesterMeta = await this.prisma.userMetadata.findUnique({
      where: { user_id: requesterId },
    });

    if (!requesterMeta?.roles.includes('admin')) {
      throw new ForbiddenException('Admin role required to assign roles');
    }

    const targetMeta = await this.prisma.userMetadata.findUnique({
      where: { user_id: targetUserId },
    });

    if (!targetMeta) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    const updated = await this.prisma.userMetadata.update({
      where: { user_id: targetUserId },
      data: { roles: dto.roles },
    });

    return {
      message: `Roles updated for user ${targetUserId}`,
      roles: updated.roles,
    };
  }
}
