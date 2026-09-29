import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExportQueryDto } from './dto/export-query.dto';
import { ExportService, exportFilename } from './export.service';

/**
 * Xuất cả cây ra một file mang đi được — `member` trở lên, không cho guest:
 * guest xem được từng trang, nhưng một file chứa ngày sinh của mọi người còn
 * sống trong họ là thứ chỉ người trong nhà mới nên cầm. Không có cột liên lạc
 * nào trong file (xem family-data.ts).
 *
 * FE gọi bằng fetch (cần header Authorization) rồi tạo blob để tải / mở tab mới.
 */
@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('gedcom')
  @Roles('member')
  @ApiOperation({ summary: 'Tải gia phả dạng GEDCOM 5.5.1 (Gramps, MyHeritage, FamilySearch…)' })
  @ApiProduces('text/plain')
  @Header('Cache-Control', 'no-store')
  async gedcom(@Query() query: ExportQueryDto, @Res({ passthrough: true }) res: Response) {
    const body = await this.exportService.gedcom(query);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('ged')}"`);
    return body;
  }

  @Get('book')
  @Roles('member')
  @ApiOperation({ summary: 'Sách gia phả HTML khổ A4, chia theo đời — in hoặc "Lưu thành PDF" từ trình duyệt' })
  @ApiProduces('text/html')
  @Header('Cache-Control', 'no-store')
  async book(@Query() query: ExportQueryDto, @Res({ passthrough: true }) res: Response) {
    const body = await this.exportService.book(query);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${exportFilename('html')}"`);
    return body;
  }
}
