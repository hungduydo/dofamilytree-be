import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hasAtLeast } from '../auth/roles.constants';
import { ANONYMOUS_META, CallerMeta } from '../auth/user-meta';
import { CreateLifeEventDto, UpdateLifeEventDto } from './dto/life-event.dto';

type LifeEventAction = 'write' | 'delete';

@Injectable()
export class LifeEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Timeline for the member's "Quá trình sinh sống" tab, oldest first. */
  async getByMember(memberId: string) {
    return this.prisma.lifeEvent.findMany({
      where: { member_id: memberId },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Quyền theo BẢN GHI — RolesGuard chỉ gác được "đã là member trở lên".
   *
   * - Chính chủ (`caller.profileMemberId === memberId`) thêm/sửa/xoá được mốc
   *   của mình. `profileMemberId` đến từ DB (CallerMetaGuard), không từ JWT, nên
   *   gỡ link là mất quyền ngay.
   * - Ghi hộ người khác: editor trở lên — giữ nguyên quyền cũ của route POST.
   * - Xoá hộ người khác: chỉ admin — editor không xoá gì (USERS_AND_ROLES.md).
   */
  private assertCanManage(memberId: string, caller: CallerMeta, action: LifeEventAction) {
    if (caller.profileMemberId !== null && caller.profileMemberId === memberId) return;
    if (hasAtLeast(caller.roles, action === 'write' ? 'editor' : 'admin')) return;
    throw new ForbiddenException('Chỉ quản lý được quá trình sinh sống của chính bạn');
  }

  /**
   * Mốc phải thuộc đúng member trên URL. Không kiểm tra thì chính chủ có thể ghép
   * id mốc của người khác vào URL của mình và qua được assertCanManage.
   */
  private async findOwned(memberId: string, id: string) {
    const event = await this.prisma.lifeEvent.findFirst({ where: { id, member_id: memberId } });
    if (!event) throw new NotFoundException(`Life event ${id} not found`);
    return event;
  }

  async create(memberId: string, dto: CreateLifeEventDto, caller: CallerMeta = ANONYMOUS_META) {
    this.assertCanManage(memberId, caller, 'write');
    return this.prisma.lifeEvent.create({
      data: {
        member_id: memberId,
        date: dto.date,
        title: dto.title,
        description: dto.description,
        category: dto.category,
      },
    });
  }

  async update(
    memberId: string,
    id: string,
    dto: UpdateLifeEventDto,
    caller: CallerMeta = ANONYMOUS_META,
  ) {
    this.assertCanManage(memberId, caller, 'write');
    await this.findOwned(memberId, id);
    return this.prisma.lifeEvent.update({
      where: { id },
      data: {
        date: dto.date,
        title: dto.title,
        description: dto.description,
        category: dto.category,
      },
    });
  }

  async delete(memberId: string, id: string, caller: CallerMeta = ANONYMOUS_META) {
    this.assertCanManage(memberId, caller, 'delete');
    await this.findOwned(memberId, id);
    await this.prisma.lifeEvent.delete({ where: { id } });
  }
}
