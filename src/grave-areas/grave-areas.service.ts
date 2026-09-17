import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GraveArea, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LatLng, polygonCentroid } from '../graves/grave-location';
import { CreateGraveAreaDto, UpdateGraveAreaDto } from './dto/grave-area.dto';

const WITH_COUNT = { _count: { select: { graves: true } } } as const;

type AreaRow = GraveArea & { _count: { graves: number } };

function toResponse({ _count, ...area }: AreaRow) {
  return {
    ...area,
    polygon: (area.polygon as LatLng[] | null) ?? null,
    center: polygonCentroid(area.polygon),
    graveCount: _count.graves,
  };
}

/** Json? của Prisma: null phải là DbNull, undefined = không đổi. */
const polygonData = (polygon: LatLng[] | null | undefined) =>
  polygon === undefined ? undefined : polygon === null ? Prisma.DbNull : polygon;

@Injectable()
export class GraveAreasService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll() {
    const rows = await this.prisma.graveArea.findMany({ include: WITH_COUNT, orderBy: { name: 'asc' } });
    return rows.map(toResponse);
  }

  async getById(id: string) {
    const row = await this.prisma.graveArea.findUnique({ where: { id }, include: WITH_COUNT });
    if (!row) throw new NotFoundException(`Không tìm thấy khu mộ ${id}`);
    return toResponse(row);
  }

  async create(dto: CreateGraveAreaDto) {
    const row = await this.prisma.graveArea
      .create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          polygon: polygonData(dto.polygon),
        },
        include: WITH_COUNT,
      })
      .catch(this.rethrowDuplicate(dto.name));
    return toResponse(row);
  }

  async update(id: string, dto: UpdateGraveAreaDto) {
    await this.getById(id);
    const row = await this.prisma.graveArea
      .update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description === undefined ? undefined : dto.description?.trim() || null,
          polygon: polygonData(dto.polygon),
        },
        include: WITH_COUNT,
      })
      .catch(this.rethrowDuplicate(dto.name));
    return toResponse(row);
  }

  /** Mộ thuộc khu KHÔNG bị xoá — FK ON DELETE SET NULL (010_grave_areas.sql). */
  async delete(id: string) {
    await this.getById(id);
    await this.prisma.graveArea.delete({ where: { id } });
  }

  private rethrowDuplicate(name?: string) {
    return (error: unknown): never => {
      // P2002 = vi phạm unique trên grave_areas.name.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Đã có khu mộ tên "${name?.trim()}"`);
      }
      throw error;
    };
  }
}
