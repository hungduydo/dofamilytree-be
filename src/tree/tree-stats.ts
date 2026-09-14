import type { PrismaClient } from '@prisma/client';
import { parseBirthYear } from '../members/life-status';

/**
 * Báo cáo cho dashboard: TreeService.computeStats (đọc trực tiếp) và
 * TasksService.handleReportGenerate (job nền) đều gọi hàm này. Trước đây mỗi bên
 * tự viết query riêng và đã lệch nhau — giờ chỉ còn một chỗ.
 */
export async function computeTreeStats(prisma: Pick<PrismaClient, 'member' | 'profile'>) {
  const [totalMembers, statusGroups, maxGen, birthMembers, latestProfile] = await Promise.all([
    prisma.member.count(),
    prisma.member.groupBy({ by: ['lifeStatus'], _count: { _all: true } }),
    // members.generation là giá trị HIỆU LỰC (nhập tay ưu tiên, ngược lại suy
    // ra), nên đây mới là độ sâu thật của dòng họ.
    prisma.member.aggregate({ _max: { generation: true } }),
    prisma.member.findMany({
      where: { birthDate: { not: null } },
      select: { birthDate: true },
    }),
    prisma.profile.aggregate({ _max: { updated_at: true } }),
  ]);

  const countOf = (status: string) =>
    statusGroups.find((g) => g.lifeStatus === status)?._count._all ?? 0;

  // birthDate is a free-form String; count those parsing to a year in 1901–2100.
  let born20th21st = 0;
  for (const m of birthMembers) {
    const year = parseBirthYear(m.birthDate);
    if (year !== null && year >= 1901 && year <= 2100) born20th21st++;
  }

  const generations = maxGen._max.generation || 0;
  const lastUpdate = latestProfile._max.updated_at
    ? latestProfile._max.updated_at.toISOString().split('T')[0]
    : null;

  return {
    totalMembers,
    generations,
    totalGenerations: generations, // backward-compat alias
    deceased: countOf('DECEASED'),
    alive: countOf('ALIVE'),
    unknownLifeStatus: countOf('UNKNOWN'),
    born20th21st,
    lastUpdate,
    generatedAt: new Date().toISOString(),
  };
}
