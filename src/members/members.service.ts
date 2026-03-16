import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { QStashService } from '../queue/qstash.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { removeVietnameseTones } from '../utils/vietnamese-helper';
import {
  QUEUE_AVATAR_UPLOAD,
  QUEUE_REPORT_GENERATE,
  QUEUE_NOTIFICATION,
} from '../queue/queue.constants';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qstashService: QStashService,
  ) {}

  /**
   * Committee members — members whose profile notes contain "committee" or "ban quản lý"
   * Returns shape: { id, name, role, avatar }
   */
  async getCommitteeMembers() {
    const members = await this.prisma.member.findMany({
      where: {
        profile: {
          notes: { not: null },
          OR: [
            { notes: { contains: 'committee', mode: 'insensitive' } },
            { notes: { contains: 'ban quản lý', mode: 'insensitive' } },
            { notes: { contains: 'hội đồng', mode: 'insensitive' } },
          ],
        },
      },
      include: { profile: true },
      orderBy: { created_at: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.profile?.occupation ?? '',
      avatar: m.avatar_url ?? '',
    }));
  }

  /**
   * Notable members — members whose profile biography is not empty
   * Returns shape: { id, name, description, avatar }
   */
  async getNotableMembers() {
    const members = await this.prisma.member.findMany({
      where: {
        profile: {
          biography: { not: null },
          NOT: { biography: '' },
        },
      },
      include: { profile: true },
      orderBy: { created_at: 'asc' },
      take: 9,
    });

    return members.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.profile?.biography ?? '',
      avatar: m.avatar_url ?? '',
    }));
  }

  async getAllMembers(page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;
    const take = Math.min(pageSize, 100);

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        skip,
        take,
        include: { profile: true },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.member.count(),
    ]);

    return { data, total, page, pageSize };
  }

  async searchMembers(query: string, includeProfile = false) {
    if (!query?.trim()) return [];
    const normalized = removeVietnameseTones(query);
    return this.prisma.member.findMany({
      where: {
        OR: [
          { normalized_name: { contains: normalized, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: includeProfile ? { profile: true } : undefined,
      take: 50,
    });
  }

  async getMemberById(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!member) throw new NotFoundException(`Member ${id} not found`);
    return member;
  }

  async getMemberProfile(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        profile: true,
        parent_relationships: { include: { parent: { include: { profile: true } } } },
        child_relationships: { include: { child: { include: { profile: true } } } },
      },
    });
    if (!member) throw new NotFoundException(`Member ${id} not found`);
    return member;
  }

  async createMember(dto: CreateMemberDto) {
    if (!dto.fullName?.trim()) {
      throw new BadRequestException('fullName is required');
    }

    const normalizedName = removeVietnameseTones(dto.fullName);

    const member = await this.prisma.$transaction(async (tx) => {
      const newMember = await tx.member.create({
        data: {
          name: dto.fullName,
          normalized_name: normalizedName,
          gender: dto.gender,
          birthDate: dto.birthDate,
          deathDate: dto.deathDate,
        },
      });

      await tx.profile.create({
        data: {
          member_id: newMember.id,
          fullName: dto.fullName,
          generation: dto.generation,
          occupation: dto.occupation,
          address: dto.address,
          biography: dto.biography,
        },
      });

      return newMember;
    });

    // Queue notifications and report update (best-effort, don't fail the operation)
    Promise.all([
      this.qstashService.publish(QUEUE_NOTIFICATION, { type: 'NEW_MEMBER', message: `New member: ${member.name}`, payload: { id: member.id, name: member.name } }),
      this.qstashService.publish(QUEUE_REPORT_GENERATE, {}),
    ]).catch(() => {});

    return member;
  }

  async updateMemberProfile(id: string, dto: UpdateMemberDto, avatarFile?: Express.Multer.File) {
    const existing = await this.prisma.member.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!existing) throw new NotFoundException(`Member ${id} not found`);

    const updated = await this.prisma.$transaction(async (tx) => {
      const memberData: any = {};
      if (dto.fullName) {
        memberData.name = dto.fullName;
        memberData.normalized_name = removeVietnameseTones(dto.fullName);
      }
      if (dto.gender) memberData.gender = dto.gender;
      if (dto.birthDate !== undefined) memberData.birthDate = dto.birthDate;
      if (dto.deathDate !== undefined) memberData.deathDate = dto.deathDate;

      const updatedMember = await tx.member.update({ where: { id }, data: memberData });

      const profileData: any = {};
      if (dto.fullName) profileData.fullName = dto.fullName;
      if (dto.generation !== undefined) profileData.generation = dto.generation;
      if (dto.occupation !== undefined) profileData.occupation = dto.occupation;
      if (dto.address !== undefined) profileData.address = dto.address;
      if (dto.biography !== undefined) profileData.biography = dto.biography;
      if (dto.notes !== undefined) profileData.notes = dto.notes;

      if (Object.keys(profileData).length > 0 && existing.profile) {
        await tx.profile.update({ where: { member_id: id }, data: profileData });
      }

      return updatedMember;
    });

    // Queue avatar upload if file provided
    if (avatarFile) {
      await this.qstashService.publish(QUEUE_AVATAR_UPLOAD, {
        memberId: id,
        buffer: avatarFile.buffer.toString('base64'),
        filename: avatarFile.originalname,
        mimetype: avatarFile.mimetype,
      });
    }

    return updated;
  }

  async deleteMember(id: string) {
    const member = await this.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundException(`Member ${id} not found`);

    await this.prisma.$transaction(async (tx) => {
      await tx.profile.delete({ where: { member_id: id } }).catch(() => {}); // profile may not exist
      await tx.userMetadata.deleteMany({ where: { profile_member_id: id } });
      await tx.member.delete({ where: { id } });
    });

    // Best-effort queue notification — don't fail the delete
    this.qstashService.publish(QUEUE_REPORT_GENERATE, {}).catch(() => {});
  }
}
