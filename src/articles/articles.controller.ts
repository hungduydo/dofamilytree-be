import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';
import { ArticlesService } from './articles.service';
import { CreateArticleDto, UpdateArticleDto, ArticleResponseDto } from './dto/article.dto';

@ApiTags('Articles (Tin tức dòng họ)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List articles (filter: category, year, search) — public' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiOkResponse({ type: [ArticleResponseDto] })
  getArticles(
    @Query('category') category?: string,
    @Query('year') year?: string,
    @Query('search') search?: string,
  ) {
    return this.articlesService.getArticles({
      category: category || undefined,
      year: year ? parseInt(year, 10) : undefined,
      search: search || undefined,
    });
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get article by ID (public)' })
  @ApiOkResponse({ type: ArticleResponseDto })
  getById(@Param('id') id: string) {
    return this.articlesService.getArticleById(id);
  }

  @Public()
  @Post(':id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Increment article view count (public)' })
  @ApiNoContentResponse({ description: 'View counted' })
  async incrementView(@Param('id') id: string) {
    await this.articlesService.incrementView(id);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Create article' })
  @ApiCreatedResponse({ type: ArticleResponseDto })
  create(@Body() dto: CreateArticleDto) {
    return this.articlesService.createArticle(dto);
  }

  @Put(':id')
  @Roles('editor')
  @ApiOperation({ summary: 'Update article' })
  @ApiOkResponse({ type: ArticleResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articlesService.updateArticle(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete article' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(@Param('id') id: string) {
    return this.articlesService.deleteArticle(id);
  }
}
