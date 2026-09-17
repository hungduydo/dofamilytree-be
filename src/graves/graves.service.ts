import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGraveDto, UpdateGraveDto } from './dto/create-grave.dto';
import { profileSelectFor } from '../members/members.select';
import { resolveGraveLocation } from './grave-location';

// Các endpoint dưới đây nhúng profile của member. Chúng KHÔNG bao giờ trả 4 cột
// liên lạc (phone/contactEmail/address/notes) — kể cả cho admin — vì nhiều route
// trong file này là @Public(). Ai cần số điện thoại thì gọi
// GET /v2/members/:id/profile, nơi có kiểm tra role thật sự.
const EMBEDDED_PROFILE = profileSelectFor(false);

const GRAVE_INCLUDE = {
  member: { include: { profile: EMBEDDED_PROFILE } },
  area: { select: { id: true, name: true, description: true, polygon: true } },
} as const;

/** Gắn vị trí hiển thị: toạ độ của mộ, không có thì tâm khu (grave-location.ts). */
const withLocation = <T extends { latitude: number | null; longitude: number | null; area?: { polygon: unknown } | null }>(
  grave: T,
) => ({ ...grave, location: resolveGraveLocation(grave) });

/** Haversine formula — distance between two lat/lng points in km */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class GravesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllGraves(filter: { name?: string }) {
    const graves = await this.prisma.cemetery.findMany({
      where: filter.name ? { name: { contains: filter.name, mode: 'insensitive' } } : {},
      include: GRAVE_INCLUDE,
      orderBy: { created_at: 'desc' },
    });
    return graves.map(withLocation);
  }

  async getGraveById(id: string) {
    const grave = await this.prisma.cemetery.findUnique({ where: { id }, include: GRAVE_INCLUDE });
    if (!grave) throw new NotFoundException(`Grave ${id} not found`);
    return withLocation(grave);
  }

  async getNearbyGraves(params: { lat: number; lng: number; radiusKm?: number }) {
    const radius = params.radiusKm ?? 10;

    // Fetch then filter by Haversine distance on the resolved location, so graves
    // known only by their burial area are found too. Graves with no location are skipped.
    // For production: use PostGIS or bounding box pre-filter.
    const all = await this.prisma.cemetery.findMany({
      where: { OR: [{ latitude: { not: null }, longitude: { not: null } }, { area_id: { not: null } }] },
      include: GRAVE_INCLUDE,
    });
    return all.map(withLocation).filter(
      (g) => g.location && haversineDistance(params.lat, params.lng, g.location.latitude, g.location.longitude) <= radius,
    );
  }

  async createGrave(dto: CreateGraveDto) {
    await this.assertAreaExists(dto.area_id);
    const grave = await this.prisma.cemetery.create({ data: dto, include: GRAVE_INCLUDE });
    return withLocation(grave);
  }

  async updateGrave(id: string, dto: UpdateGraveDto) {
    await this.getGraveById(id);
    await this.assertAreaExists(dto.area_id);
    const grave = await this.prisma.cemetery.update({ where: { id }, data: dto, include: GRAVE_INCLUDE });
    return withLocation(grave);
  }

  async deleteGrave(id: string) {
    await this.getGraveById(id);
    return this.prisma.cemetery.delete({ where: { id } });
  }

  /** FK sẽ chặn area_id sai, nhưng dưới dạng lỗi 500 khó hiểu — kiểm tra trước để trả 400. */
  private async assertAreaExists(areaId: string | null | undefined) {
    if (!areaId) return;
    const exists = await this.prisma.graveArea.count({ where: { id: areaId } });
    if (!exists) throw new BadRequestException(`Khu mộ ${areaId} không tồn tại`);
  }
}
