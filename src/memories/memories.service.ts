import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hasAtLeast } from '../auth/roles.constants';
import { ANONYMOUS_META, CallerMeta } from '../auth/user-meta';
import { CreateMemoryDto, UpdateMemoryDto } from './dto/memory.dto';

@Injectable()
export class MemoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Memories for the member's "Kỷ niệm" tab, newest first. */
  async getByMember(memberId: string) {
    return this.prisma.memory.findMany({
      where: { member_id: memberId },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(memberId: string, authorId: string, dto: CreateMemoryDto) {
    return this.prisma.memory.create({
      data: {
        event_id: dto.event_id,
        // Prisma không cho trộn khoá thô (member_id) với nested relation → dùng connect.
        member: { connect: { id: memberId } },
        // Bảng "User" chỉ là bảng neo cho FK author_id (user thật nằm ở Supabase
        // auth) và không có luồng nào ghi vào — gán thẳng author_id sẽ vỡ FK
        // (P2003 → 500). connectOrCreate tạo dòng neo ở lần viết đầu tiên.
        author: { connectOrCreate: { where: { id: authorId }, create: { id: authorId } } },
        text: dto.text,
        photos: dto.photos ?? [],
      },
    });
  }

  /**
   * Kỷ niệm là lời của NGƯỜI VIẾT, không phải của người được nhắc tới — nên chỉ
   * tác giả (hoặc admin gỡ nội dung) sửa/xoá được, kể cả khi kỷ niệm nằm trên hồ
   * sơ của chính mình. Kỷ niệm phải thuộc đúng member trên URL, không thì ghép id
   * lạ vào URL nào cũng qua.
   */
  private async assertCanChange(memberId: string, id: string, userId: string, caller: CallerMeta) {
    const memory = await this.prisma.memory.findFirst({ where: { id, member_id: memberId } });
    if (!memory) throw new NotFoundException(`Memory ${id} not found`);
    if (memory.author_id === userId || hasAtLeast(caller.roles, 'admin')) return memory;
    throw new ForbiddenException('Chỉ người viết mới sửa hoặc xoá được kỷ niệm này');
  }

  async update(
    memberId: string,
    id: string,
    userId: string,
    dto: UpdateMemoryDto,
    caller: CallerMeta = ANONYMOUS_META,
  ) {
    await this.assertCanChange(memberId, id, userId, caller);
    return this.prisma.memory.update({
      where: { id },
      data: { text: dto.text, photos: dto.photos, event_id: dto.event_id },
    });
  }

  async delete(memberId: string, id: string, userId: string, caller: CallerMeta = ANONYMOUS_META) {
    await this.assertCanChange(memberId, id, userId, caller);
    await this.prisma.memory.delete({ where: { id } });
  }
}
