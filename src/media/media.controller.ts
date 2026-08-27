import {
  Controller, Get, Post, Delete, Param, Query, Body, UseGuards,
  UseInterceptors, UploadedFile, Request, HttpCode, HttpStatus,
  DefaultValuePipe, ParseIntPipe, BadRequestException, UseFilters, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { ParseOptionalIntPipe } from '../utils/parse-optional-int.pipe';
import { MediaService } from './media.service';
import {
  MEDIA_TYPES, MEDIA_SORT_FIELDS, MediaSortField, SortOrder,
  MAX_UPLOAD_BYTES, isAllowedMime,
} from './media.constants';
import { UploadMediaDto } from './dto/upload-media.dto';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { UploadUrlResponseDto } from './dto/upload-url-response.dto';
import { UploadPayloadTooLargeFilter } from './upload-exception.filter';
import { CreateAlbumDto } from './dto/create-album.dto';
import {
  MediaResponseDto,
  PaginatedMediaResponseDto,
  MediaAlbumResponseDto,
  MediaStatsResponseDto,
  MediaViewResponseDto,
  MediaProgressResponseDto,
} from './dto/media-response.dto';

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Upload media (ảnh → nén lossless bằng sharp; video/audio/tài liệu → upload thẳng)',
    description:
      'File đi QUA serverless function nên chịu trần request body của platform ' +
      '(Vercel: 4.5MB nếu chưa bật Fluid Compute, 100MB nếu đã bật). ' +
      'Với file lớn hơn, dùng POST /v2/media/upload-url.',
  })
  @ApiConsumes('multipart/form-data')
  @UseFilters(UploadPayloadTooLargeFilter)
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

  @Post('upload-url')
  @ApiOperation({
    summary: 'Cấp presigned URL để client upload file THẲNG lên storage (không qua function)',
    description:
      'Dùng cho audio/video/file lớn vượt trần request body của platform. Luồng 3 bước: ' +
      '(1) POST /v2/media/upload-url → nhận upload_url + media_id; ' +
      '(2) PUT file lên upload_url với đúng header Content-Type đã trả về; ' +
      '(3) POST /v2/media/:id/complete để backend xác minh và chuyển sang ready. ' +
      'Lưu ý: đường này KHÔNG nén ảnh — ảnh nhỏ nên đi POST /v2/media/upload.',
  })
  @ApiCreatedResponse({ type: UploadUrlResponseDto })
  createUploadUrl(@Body() body: CreateUploadUrlDto, @Request() req: any) {
    return this.mediaService.createUploadUrl(req.user.id, body);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xác nhận đã PUT xong file lên presigned URL — chuyển media sang ready',
    description:
      'Backend HEAD object trên storage để lấy size thật; nếu chưa thấy file sẽ trả 400. ' +
      'Gọi lại trên media đã ready là no-op (idempotent).',
  })
  @ApiOkResponse({ type: MediaResponseDto })
  completeUpload(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.completeUpload(id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Theo dõi tiến độ upload media (đọc Redis, fallback DB nếu key hết hạn)' })
  @ApiOkResponse({ type: MediaProgressResponseDto })
  getUploadProgress(@Param('id') id: string) {
    return this.mediaService.getUploadProgress(id);
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

  @Get('blob-storage-usage')
  @ApiOperation({ summary: 'Dung lượng thực tế trên Vercel Blob (quét trực tiếp, để đối chiếu với /media/stats)' })
  getBlobStorageUsage() {
    return this.mediaService.getBlobStorageUsage();
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
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá album (gỡ liên kết media của album) — chỉ admin' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiForbiddenResponse({ description: 'Requires admin role' })
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
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá media record + file trên storage — chỉ admin' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiForbiddenResponse({ description: 'Requires admin role' })
  deleteMedia(@Param('id') id: string) {
    return this.mediaService.deleteMedia(id);
  }
}
