import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { EventsService } from './events.service';
import { CreateAnniversaryDto, UpdateAnniversaryDto } from './dto/create-event.dto';
import { AnniversaryResponseDto } from './dto/event-response.dto';

@ApiTags('Anniversaries (Ngày giỗ)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('anniversaries')
export class AnniversariesController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Get anniversaries (filter by member_id, month)' })
  @ApiQuery({ name: 'member_id', required: false })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiOkResponse({ type: [AnniversaryResponseDto] })
  getAnniversaries(
    @Query('member_id') member_id?: string,
    @Query('month') month?: number,
  ) {
    return this.eventsService.getAnniversaries({ member_id, month: month ? +month : undefined });
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming anniversaries (next 30 days)' })
  @ApiOkResponse({ type: [AnniversaryResponseDto] })
  getUpcoming() {
    return this.eventsService.getUpcomingAnniversaries();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get anniversary by ID' })
  @ApiOkResponse({ type: AnniversaryResponseDto })
  getById(@Param('id') id: string) {
    return this.eventsService.getAnniversaryById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create anniversary (optional member link)' })
  @ApiCreatedResponse({ type: AnniversaryResponseDto })
  create(@Body() dto: CreateAnniversaryDto) {
    return this.eventsService.createAnniversary(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update anniversary' })
  @ApiOkResponse({ type: AnniversaryResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateAnniversaryDto) {
    return this.eventsService.updateAnniversary(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete anniversary' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(@Param('id') id: string) {
    return this.eventsService.deleteAnniversary(id);
  }
}
