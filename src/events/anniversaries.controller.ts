import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiBadRequestResponse, ApiConflictResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ParseOptionalIntPipe } from '../utils/parse-optional-int.pipe';
import { ANNIVERSARY_KINDS, AnniversaryKind, UPCOMING_MAX_DAYS } from './anniversary-occurrence';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EventsService } from './events.service';
import { CreateAnniversaryDto, UpdateAnniversaryDto } from './dto/create-event.dto';
import { AnniversaryResponseDto, AnniversaryTodayResponseDto } from './dto/event-response.dto';

@ApiTags('Anniversaries (Ngày kỵ / giỗ)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('anniversaries')
export class AnniversariesController {
  constructor(private readonly eventsService: EventsService) {}

  // Đọc là công khai (cùng mức với ban thờ tưởng niệm): chỉ tên, đời, ngày kỵ —
  // không có liên lạc.
  @Get()
  @Public()
  @ApiOperation({ summary: 'Danh sách ngày kỵ / tưởng niệm, xếp theo tháng-ngày' })
  @ApiQuery({ name: 'member_id', required: false })
  @ApiQuery({ name: 'kind', required: false, enum: ANNIVERSARY_KINDS })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Tháng của ngày kỵ (tháng âm với kỵ âm lịch)' })
  @ApiOkResponse({ type: [AnniversaryResponseDto] })
  getAnniversaries(
    @Query('member_id') member_id?: string,
    @Query('kind') kind?: string,
    @Query('month', new ParseOptionalIntPipe()) month?: any,
  ) {
    return this.eventsService.getAnniversaries({
      member_id,
      kind: (ANNIVERSARY_KINDS as readonly string[]).includes(kind ?? '') ? (kind as AnniversaryKind) : undefined,
      month,
    });
  }

  @Get('today')
  @Public()
  @ApiOperation({ summary: 'Hôm nay (giờ Việt Nam) là ngày kỵ của ai' })
  @ApiOkResponse({ type: AnniversaryTodayResponseDto })
  getToday() {
    return this.eventsService.getTodayAnniversaries();
  }

  @Get('upcoming')
  @Public()
  @ApiOperation({ summary: `Ngày kỵ sắp tới, tính cả hôm nay (tối đa ${UPCOMING_MAX_DAYS} ngày)` })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Mặc định 30' })
  @ApiOkResponse({ type: [AnniversaryResponseDto] })
  getUpcoming(@Query('days', new ParseOptionalIntPipe()) days?: any) {
    return this.eventsService.getUpcomingAnniversaries(days ?? 30);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get anniversary by ID' })
  @ApiOkResponse({ type: AnniversaryResponseDto })
  getById(@Param('id') id: string) {
    return this.eventsService.getAnniversaryById(id);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Tạo ngày kỵ / tưởng niệm' })
  @ApiBadRequestResponse({ description: 'Ngày không hợp lệ, hoặc thành viên chưa ở trạng thái đã mất' })
  @ApiConflictResponse({ description: 'Thành viên đã có ngày kỵ' })
  @ApiCreatedResponse({ type: AnniversaryResponseDto })
  create(@Body() dto: CreateAnniversaryDto) {
    return this.eventsService.createAnniversary(dto);
  }

  @Put(':id')
  @Roles('editor')
  @ApiOperation({ summary: 'Sửa ngày kỵ / tưởng niệm' })
  @ApiConflictResponse({ description: 'Thành viên đã có ngày kỵ' })
  @ApiOkResponse({ type: AnniversaryResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateAnniversaryDto) {
    return this.eventsService.updateAnniversary(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete anniversary' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(@Param('id') id: string) {
    return this.eventsService.deleteAnniversary(id);
  }
}
