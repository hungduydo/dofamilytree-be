import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiProperty,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { TreeService } from './tree.service';
import { StatsResponseDto } from './dto/tree-response.dto';

class CachedReportDataDto {
  @ApiProperty({ type: () => StatsResponseDto })
  stats: StatsResponseDto;
}

class CachedReportResponseDto {
  @ApiProperty({ type: () => CachedReportDataDto })
  data: CachedReportDataDto;
}

// Backwards-compatible endpoint the frontend dashboard consumes.
// Wraps TreeService stats in the { data: { stats } } envelope the FE's
// getCachedReport() expects (res.data.data.stats).
@ApiTags('Report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('report')
export class ReportController {
  constructor(private readonly treeService: TreeService) {}

  @Get('cached')
  @ApiOperation({ summary: 'Cached family tree stats for the dashboard' })
  @ApiOkResponse({ type: CachedReportResponseDto })
  async getCachedReport() {
    const stats = await this.treeService.getStats();
    return { data: { stats } };
  }
}
