import {
  Controller, Get, Post, Delete, Param, Query, Body, UseGuards,
  UseInterceptors, UploadedFile, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { MediaService } from './media.service';

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload image → emit image-process queue (sharp compress + Vercel Blob)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
    @Body() body: { title?: string; type?: string; member_id?: string; album_id?: string; uploader_name?: string } = {},
  ) {
    return this.mediaService.uploadMedia(file, req.user.id, {
      title: body.title,
      type: body.type,
      member_id: body.member_id,
      album_id: body.album_id,
      uploader_name: body.uploader_name,
    });
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List media (filter by uploader_id, member_id, type, album_id) — public library' })
  @ApiQuery({ name: 'uploader_id', required: false })
  @ApiQuery({ name: 'member_id', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'album_id', required: false })
  getMedia(
    @Query('uploader_id') uploader_id?: string,
    @Query('member_id') member_id?: string,
    @Query('type') type?: string,
    @Query('album_id') album_id?: string,
  ) {
    return this.mediaService.getMedia({ uploader_id, member_id, type, album_id });
  }

  @Public()
  @Get('albums')
  @ApiOperation({ summary: 'List media albums with counts (public)' })
  getAlbums() {
    return this.mediaService.getAlbums();
  }

  @Post('albums')
  @ApiOperation({ summary: 'Create a media album' })
  createAlbum(@Body() body: { name: string; description?: string; cover_url?: string; date?: string }) {
    return this.mediaService.createAlbum(body);
  }

  @Delete('albums/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a media album (detaches its media)' })
  deleteAlbum(@Param('id') id: string) {
    return this.mediaService.deleteAlbum(id);
  }

  @Get('member/:memberId')
  @ApiOperation({ summary: 'List documents/photos attached to a member (Tài liệu liên quan)' })
  getMemberMedia(@Param('memberId') memberId: string) {
    return this.mediaService.getMemberMedia(memberId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete media record + Vercel Blob file' })
  deleteMedia(@Param('id') id: string) {
    return this.mediaService.deleteMedia(id);
  }
}
