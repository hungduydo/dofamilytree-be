import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
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
    @InjectQueue(QUEUE_AVATAR_UPLOAD) private avatarQueue: Queue,
    @InjectQueue(QUEUE_REPORT_GENERATE) private reportQueue: Queue,
    @InjectQueue(QUEUE_NOTIFICATION) private notificationQueue: Queue,
  ) {}

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

  async searchMembers(query: string) {
    const normalized = removeVietnameseTones(query);
    return this.prisma.member.findMany({
      where: {
        normalized_name: { contains: normalized, mode: 'insensitive' },
      },
      include: { profile: true },
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

    // Queue notifications and report update
    await Promise.all([
      this.notificationQueue.add({ type: 'NEW_MEMBER', payload: { id: member.id, name: member.name } }),
      this.reportQueue.add({}),
    ]);

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
      await this.avatarQueue.add({
        memberId: id,
        buffer: avatarFile.buffer,
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

    await this.reportQueue.add({});
  }
}
