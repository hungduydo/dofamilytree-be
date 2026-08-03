import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLifeEventDto } from './dto/life-event.dto';

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

  async create(memberId: string, dto: CreateLifeEventDto) {
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

  async delete(id: string) {
    await this.prisma.lifeEvent.deleteMany({ where: { id } });
  }
}
