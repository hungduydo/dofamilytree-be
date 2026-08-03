import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
  UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto, AddAttendeeDto } from './dto/create-event.dto';
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

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get events (filter: highlight, fromDate, toDate, category)' })
  @ApiQuery({ name: 'highlight', required: false, type: Boolean })
  @ApiQuery({ name: 'fromDate', required: false })
  @ApiQuery({ name: 'toDate', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiOkResponse({ type: [EventResponseDto] })
  getEvents(
    @Query('highlight') highlight?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('category') category?: string,
  ) {
    return this.eventsService.getEvents({
      highlight: highlight !== undefined ? highlight === 'true' : undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      category: category || undefined,
    });
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  @ApiOkResponse({ type: EventResponseDto })
  getById(@Param('id') id: string) {
    return this.eventsService.getEventById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create event + emit notification queue' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiCreatedResponse({ type: EventResponseDto })
  @UseInterceptors(FilesInterceptor('images'))
  create(
    @Body() dto: CreateEventDto,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    return this.eventsService.createEvent(dto, images);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update event' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOkResponse({ type: EventResponseDto })
  @UseInterceptors(FilesInterceptor('images'))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    return this.eventsService.updateEvent(id, dto, images);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete event' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(@Param('id') id: string) {
    return this.eventsService.deleteEvent(id);
  }

  // ─── Attendees ────────────────────────────────────────────────────────────

  @Get(':id/attendees')
  @ApiOperation({ summary: 'List attendees of an event' })
  getAttendees(@Param('id') id: string) {
    return this.eventsService.getAttendees(id);
  }

  @Post(':id/attendees')
  @ApiOperation({ summary: 'Add/update an attendee (RSVP) for an event' })
  addAttendee(@Param('id') id: string, @Body() dto: AddAttendeeDto) {
    return this.eventsService.addAttendee(id, dto.member_id, dto.rsvp_status);
  }

  @Delete(':id/attendees/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an attendee from an event' })
  @ApiNoContentResponse({ description: 'Removed' })
  removeAttendee(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.eventsService.removeAttendee(id, memberId);
  }
}
