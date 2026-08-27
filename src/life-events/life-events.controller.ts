import {
  Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';
import { LifeEventsService } from './life-events.service';
import { CreateLifeEventDto, LifeEventResponseDto } from './dto/life-event.dto';

@ApiTags('Life Events (Quá trình sinh sống)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('members/:memberId/life-events')
export class LifeEventsController {
  constructor(private readonly lifeEventsService: LifeEventsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get a member life-event timeline (public)' })
  @ApiOkResponse({ type: [LifeEventResponseDto] })
  getByMember(@Param('memberId') memberId: string) {
    return this.lifeEventsService.getByMember(memberId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Add a life event to a member' })
  @ApiCreatedResponse({ type: LifeEventResponseDto })
  create(@Param('memberId') memberId: string, @Body() dto: CreateLifeEventDto) {
    return this.lifeEventsService.create(memberId, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a life event' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(@Param('id') id: string) {
    return this.lifeEventsService.delete(id);
  }
}
