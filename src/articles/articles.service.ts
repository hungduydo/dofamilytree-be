import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async getArticles(filter: { category?: string; year?: number; search?: string }) {
    const where: any = {};
    if (filter.category) where.category = filter.category;
    if (filter.year) {
      where.date = {
        gte: new Date(filter.year, 0, 1),
        lt: new Date(filter.year + 1, 0, 1),
      };
    }
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { excerpt: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.article.findMany({ where, orderBy: { date: 'desc' } });
  }

  async getArticleById(id: string) {
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article) throw new NotFoundException(`Article ${id} not found`);
    return article;
  }

  /** Increment view count (fire-and-forget from the client). */
  async incrementView(id: string) {
    await this.getArticleById(id);
    return this.prisma.article.update({
      where: { id },
      data: { views: { increment: 1 } },
    });
  }

  async createArticle(dto: CreateArticleDto) {
    return this.prisma.article.create({
      data: {
        title: dto.title,
        content: dto.content,
        category: dto.category,
        excerpt: dto.excerpt,
        featured: dto.featured ?? false,
        coverUrl: dto.coverUrl,
        date: dto.date ?? new Date(),
      },
    });
  }

  async updateArticle(id: string, dto: UpdateArticleDto) {
    await this.getArticleById(id);
    return this.prisma.article.update({ where: { id }, data: dto });
  }

  async deleteArticle(id: string) {
    await this.getArticleById(id);
    return this.prisma.article.delete({ where: { id } });
  }
}
