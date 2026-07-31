import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto/create-event.dto';
import { EventResponseDto } from './dto/event-response.dto';

@ApiTags('Events (Sự kiện dòng họ)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Get('gallery')
  @ApiOperation({ summary: 'Get highlighted events with images for homepage gallery (public)' })
  @ApiOkResponse({ type: [EventResponseDto] })
  getGallery() {
    return this.eventsService.getGalleryEvents();
  }

  @Get()
  @ApiOperation({ summary: 'Get events (filter: highlight, fromDate, toDate)' })
  @ApiQuery({ name: 'highlight', required: false, type: Boolean })
  @ApiQuery({ name: 'fromDate', required: false })
  @ApiQuery({ name: 'toDate', required: false })
  @ApiOkResponse({ type: [EventResponseDto] })
  getEvents(
    @Query('highlight') highlight?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.eventsService.getEvents({
      highlight: highlight !== undefined ? highlight === 'true' : undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  @ApiOkResponse({ type: EventResponseDto })
  getById(@Param('id') id: string) {
    return this.eventsService.getEventById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create event + emit notification queue' })
  @ApiCreatedResponse({ type: EventResponseDto })
  create(@Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update event' })
  @ApiOkResponse({ type: EventResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.updateEvent(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete event' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(@Param('id') id: string) {
    return this.eventsService.deleteEvent(id);
  }
}
