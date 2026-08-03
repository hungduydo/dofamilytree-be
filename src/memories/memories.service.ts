import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemoryDto } from './dto/memory.dto';

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
        member_id: memberId,
        event_id: dto.event_id,
        author_id: authorId,
        text: dto.text,
        photos: dto.photos ?? [],
      },
    });
  }

  async delete(id: string) {
    await this.prisma.memory.deleteMany({ where: { id } });
  }
}
