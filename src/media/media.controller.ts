import {
  Controller, Get, Post, Delete, Param, Query, UseGuards,
  UseInterceptors, UploadedFile, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
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
  ) {
    return this.mediaService.uploadMedia(file, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List media (filter by uploader_id)' })
  @ApiQuery({ name: 'uploader_id', required: false })
  getMedia(@Query('uploader_id') uploader_id?: string) {
    return this.mediaService.getMedia({ uploader_id });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete media record + Vercel Blob file' })
  deleteMedia(@Param('id') id: string) {
    return this.mediaService.deleteMedia(id);
  }
}
