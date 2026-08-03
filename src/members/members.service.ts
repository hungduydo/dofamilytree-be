import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { QStashService } from '../queue/qstash.service';
import { TasksService } from '../queue/tasks.service';
import { runInBackground } from '../utils/run-in-background';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { removeVietnameseTones } from '../utils/vietnamese-helper';
import {
  QUEUE_REPORT_GENERATE,
  QUEUE_NOTIFICATION,
} from '../queue/queue.constants';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qstashService: QStashService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Map the UI's clanRole onto the existing Profile.committeeRole/isCommittee columns.
   * TRUONG_TOC / PHO_TRUONG_TOC => committee member; THANH_VIEN (or unset) => not a committee role.
   */
  private clanRoleToCommittee(clanRole?: string): { committeeRole: string | null; isCommittee: boolean } | undefined {
    if (clanRole === undefined) return undefined;
    if (clanRole === 'THANH_VIEN') return { committeeRole: null, isCommittee: false };
    return { committeeRole: clanRole, isCommittee: true };
  }

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

  /**
   * Table listing for the BO /members page: paginated, with full profile + tree,
   * optionally filtered by `name` (Vietnamese-insensitive). Used by the admin table
   * search — NOT the lightweight autocomplete search (see `searchMembers` below).
   */
  async getAllMembers(page = 1, pageSize = 10, name?: string) {
    const skip = (page - 1) * pageSize;
    const take = Math.min(pageSize, 100);
    const where = this.nameSearchWhere(name);

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip,
        take,
        include: { profile: true, tree: true },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.member.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  private nameSearchWhere(query?: string) {
    if (!query?.trim()) return undefined;
    const normalized = removeVietnameseTones(query);
    return {
      OR: [
        { normalized_name: { contains: normalized, mode: 'insensitive' as const } },
        { name: { contains: query, mode: 'insensitive' as const } },
      ],
    };
  }

  /**
   * Lightweight search for select/autocomplete widgets (e.g. MemberAutocomplete):
   * unpaginated, id+name by default. Set `includeProfile` only when a caller needs
   * more than that (kept opt-in to stay cheap for the common typeahead case).
   */
  async searchMembers(query: string, includeProfile = false) {
    if (!query?.trim()) return [];
    return this.prisma.member.findMany({
      where: this.nameSearchWhere(query),
      include: includeProfile ? { profile: true } : undefined,
      take: 50,
    });
  }

  async getMemberById(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: { profile: true, tree: true },
    });
    if (!member) throw new NotFoundException(`Member ${id} not found`);
    return member;
  }

  async getMemberProfile(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        profile: true,
        tree: true,
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

    const committee = this.clanRoleToCommittee(dto.clanRole);

    const member = await this.prisma.$transaction(async (tx) => {
      const newMember = await tx.member.create({
        data: {
          name: dto.fullName,
          normalized_name: normalizedName,
          gender: dto.gender,
          birthDate: dto.birthDate,
          deathDate: dto.deathDate,
          tree_id: dto.tree_id,
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
          phone: dto.phone,
          contactEmail: dto.contactEmail,
          familyPosition: dto.familyPosition,
          roleTags: dto.roleTags ?? [],
          ...(committee ?? {}),
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
      if (dto.tree_id !== undefined) memberData.tree_id = dto.tree_id;

      const updatedMember = await tx.member.update({ where: { id }, data: memberData });

      const profileData: any = {};
      if (dto.fullName) profileData.fullName = dto.fullName;
      if (dto.generation !== undefined) profileData.generation = dto.generation;
      if (dto.occupation !== undefined) profileData.occupation = dto.occupation;
      if (dto.address !== undefined) profileData.address = dto.address;
      if (dto.biography !== undefined) profileData.biography = dto.biography;
      if (dto.notes !== undefined) profileData.notes = dto.notes;
      if (dto.phone !== undefined) profileData.phone = dto.phone;
      if (dto.contactEmail !== undefined) profileData.contactEmail = dto.contactEmail;
      if (dto.familyPosition !== undefined) profileData.familyPosition = dto.familyPosition;
      if (dto.roleTags !== undefined) profileData.roleTags = dto.roleTags;
      const committee = this.clanRoleToCommittee(dto.clanRole);
      if (committee) Object.assign(profileData, committee);

      if (Object.keys(profileData).length > 0 && existing.profile) {
        await tx.profile.update({ where: { member_id: id }, data: profileData });
      }

      return updatedMember;
    });

    // Upload avatar off the request path. Called directly (not via QStash) since the
    // webhook callback requires a publicly reachable APP_URL, which local dev lacks.
    if (avatarFile) {
      runInBackground(
        this.tasksService.handleAvatarUpload({
          memberId: id,
          buffer: avatarFile.buffer.toString('base64'),
          filename: avatarFile.originalname,
          mimetype: avatarFile.mimetype,
        }),
      );
    }

    return updated;
  }

  /**
   * Aggregate figures for the /members header tiles (replaces the old client-side
   * "fetch every member and count" approach and the FE MOCK_MEMBER_STATS constant).
   */
  async getMemberStats() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [total, male, female, newThisMonth, generationRows] = await Promise.all([
      this.prisma.member.count(),
      this.prisma.member.count({ where: { gender: 'M' } }),
      this.prisma.member.count({ where: { gender: 'F' } }),
      this.prisma.member.count({ where: { created_at: { gte: startOfMonth } } }),
      this.prisma.profile.findMany({
        where: { generation: { not: null } },
        distinct: ['generation'],
        select: { generation: true },
      }),
    ]);

    return {
      total,
      male,
      female,
      newThisMonth,
      generations: generationRows.length,
    };
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
