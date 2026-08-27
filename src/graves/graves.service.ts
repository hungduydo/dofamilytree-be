import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGraveDto, UpdateGraveDto } from './dto/create-grave.dto';
import { profileSelectFor } from '../members/members.select';

// Các endpoint dưới đây nhúng profile của member. Chúng KHÔNG bao giờ trả 4 cột
// liên lạc (phone/contactEmail/address/notes) — kể cả cho admin — vì nhiều route
// trong file này là @Public(). Ai cần số điện thoại thì gọi
// GET /v2/members/:id/profile, nơi có kiểm tra role thật sự.
const EMBEDDED_PROFILE = profileSelectFor(false);

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
    return this.prisma.cemetery.findMany({
      where: filter.name ? { name: { contains: filter.name, mode: 'insensitive' } } : {},
      include: { member: { include: { profile: EMBEDDED_PROFILE } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async getGraveById(id: string) {
    const grave = await this.prisma.cemetery.findUnique({
      where: { id },
      include: { member: { include: { profile: EMBEDDED_PROFILE } } },
    });
    if (!grave) throw new NotFoundException(`Grave ${id} not found`);
    return grave;
  }

  async getNearbyGraves(params: { lat: number; lng: number; radiusKm?: number }) {
    const radius = params.radiusKm ?? 10;

    // Fetch all cemeteries then filter by Haversine distance.
    // Graves without confirmed GPS (null lat/lng) are excluded from proximity search.
    // For production: use PostGIS or bounding box pre-filter.
    const all = await this.prisma.cemetery.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      include: { member: { include: { profile: EMBEDDED_PROFILE } } },
    });
    return all.filter(
      (g) => haversineDistance(params.lat, params.lng, g.latitude as number, g.longitude as number) <= radius,
    );
  }

  async createGrave(dto: CreateGraveDto) {
    return this.prisma.cemetery.create({ data: dto });
  }

  async updateGrave(id: string, dto: UpdateGraveDto) {
    await this.getGraveById(id);
    return this.prisma.cemetery.update({ where: { id }, data: dto });
  }

  async deleteGrave(id: string) {
    await this.getGraveById(id);
    return this.prisma.cemetery.delete({ where: { id } });
  }
}
