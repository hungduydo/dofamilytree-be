import {
  Controller, Get, Post, Delete, Param, Query, Body, UseGuards,
  UseInterceptors, UploadedFile, Request, HttpCode, HttpStatus,
  DefaultValuePipe, ParseIntPipe, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { ParseOptionalIntPipe } from '../utils/parse-optional-int.pipe';
import { MediaService } from './media.service';
import {
  MEDIA_TYPES, MEDIA_SORT_FIELDS, MediaSortField, SortOrder,
  MAX_UPLOAD_BYTES, isAllowedMime,
} from './media.constants';
import { UploadMediaDto } from './dto/upload-media.dto';
import { CreateAlbumDto } from './dto/create-album.dto';
import {
  MediaResponseDto,
  PaginatedMediaResponseDto,
  MediaAlbumResponseDto,
  MediaStatsResponseDto,
  MediaViewResponseDto,
} from './dto/media-response.dto';

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload media (ảnh → nén lossless bằng sharp; video/audio/tài liệu → upload thẳng)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) =>
        isAllowedMime(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false),
    }),
  )
  @ApiCreatedResponse({ type: MediaResponseDto })
  uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
    @Body() body: UploadMediaDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.mediaService.uploadMedia(file, req.user.id, {
      title: body.title,
      type: body.type,
      member_id: body.member_id,
      album_id: body.album_id,
      event_id: body.event_id,
      uploader_name: body.uploader_name,
      duration_seconds: body.duration_seconds,
      tags: body.tags,
    });
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Thư viện media — phân trang, lọc, tìm kiếm, sắp xếp (public)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Mặc định 12, tối đa 100' })
  @ApiQuery({ name: 'type', required: false, enum: MEDIA_TYPES })
  @ApiQuery({ name: 'album_id', required: false, type: String })
  @ApiQuery({ name: 'member_id', required: false, type: String })
  @ApiQuery({ name: 'uploader_id', required: false, type: String, description: 'Lọc theo người đăng' })
  @ApiQuery({ name: 'event_id', required: false, type: String, description: 'Lọc theo sự kiện' })
  @ApiQuery({ name: 'tag', required: false, type: String, description: 'Lọc theo một tag' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Từ ngày (ISO), lọc theo created_at' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Đến ngày (ISO)' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Tìm theo tên (VN-insensitive)' })
  @ApiQuery({ name: 'sortBy', required: false, enum: MEDIA_SORT_FIELDS, description: 'Mặc định created_at; views = "xem nhiều"' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiOkResponse({ type: PaginatedMediaResponseDto })
  getMedia(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(12), ParseIntPipe) pageSize: number,
    @Query('type') type?: string,
    @Query('album_id') album_id?: string,
    @Query('member_id') member_id?: string,
    @Query('uploader_id') uploader_id?: string,
    @Query('event_id') event_id?: string,
    @Query('tag') tag?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('sortBy') sortBy?: MediaSortField,
    @Query('sortOrder') sortOrder?: SortOrder,
  ) {
    return this.mediaService.getMedia({
      page, pageSize, type, album_id, member_id, uploader_id, event_id, tag, from, to, q, sortBy, sortOrder,
    });
  }

  @Public()
  @Get('stats')
  @ApiOperation({ summary: 'Thống kê media + dung lượng lưu trữ (public)' })
  @ApiOkResponse({ type: MediaStatsResponseDto })
  getMediaStats() {
    return this.mediaService.getMediaStats();
  }

  @Public()
  @Get('albums')
  @ApiOperation({ summary: 'Danh sách album kèm số lượng media (public)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Giới hạn số album (Album nổi bật)' })
  @ApiOkResponse({ type: [MediaAlbumResponseDto] })
  // `any` (không phải number) để tránh bẫy NaN của global ValidationPipe — xem ParseOptionalIntPipe.
  getAlbums(@Query('limit', ParseOptionalIntPipe) limit?: any) {
    return this.mediaService.getAlbums(limit);
  }

  @Post('albums')
  @ApiOperation({ summary: 'Tạo album media' })
  @ApiCreatedResponse({ type: MediaAlbumResponseDto })
  createAlbum(@Body() body: CreateAlbumDto) {
    return this.mediaService.createAlbum(body);
  }

  @Delete('albums/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá album (gỡ liên kết media của album)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  deleteAlbum(@Param('id') id: string) {
    return this.mediaService.deleteAlbum(id);
  }

  @Get('member/:memberId')
  @ApiOperation({ summary: 'Tài liệu/ảnh gắn với một thành viên (Tài liệu liên quan)' })
  @ApiOkResponse({ type: [MediaResponseDto] })
  getMemberMedia(@Param('memberId') memberId: string) {
    return this.mediaService.getMemberMedia(memberId);
  }

  @Public()
  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tăng lượt xem media (public)' })
  @ApiOkResponse({ type: MediaViewResponseDto })
  incrementViews(@Param('id') id: string) {
    return this.mediaService.incrementViews(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá media record + file trên Vercel Blob' })
  @ApiNoContentResponse({ description: 'Deleted' })
  deleteMedia(@Param('id') id: string) {
    return this.mediaService.deleteMedia(id);
  }
}
