import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FamilyData, loadFamilyData, restrictToBranch } from './family-data';
import { buildGedcom } from './gedcom';
import { buildFamilyBookHtml } from './family-book';
import { ExportQueryDto } from './dto/export-query.dto';

const DEFAULT_TITLE = 'Gia phả dòng họ';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async gedcom(q: ExportQueryDto, now = new Date()): Promise<string> {
    const { data, title } = await this.load(q);
    return buildGedcom(data, { title, generatedAt: now });
  }

  async book(q: ExportQueryDto, now = new Date()): Promise<string> {
    const { data, title, rootName } = await this.load(q);
    return buildFamilyBookHtml(data, { title, generatedAt: now, branchRootName: rootName });
  }

  private async load(q: ExportQueryDto): Promise<{ data: FamilyData; title: string; rootName: string | null }> {
    let data = await loadFamilyData(this.prisma);
    let rootName: string | null = null;
    if (q.rootId) {
      const root = data.members.find((m) => m.id === q.rootId);
      if (!root) throw new NotFoundException(`Member ${q.rootId} not found`);
      rootName = root.name;
      data = restrictToBranch(data, q.rootId);
    }
    return { data, title: q.title?.trim() || DEFAULT_TITLE, rootName };
  }
}

/** Tên file an toàn cho Content-Disposition: gia-pha-2026-09-29.ged */
export function exportFilename(ext: string, now = new Date()): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
  return `gia-pha-${day}.${ext}`;
}
