import {
  Controller, Get, Post, Put, Delete, Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CallerMetaGuard } from '../auth/caller-meta.guard';
import { CurrentMeta } from '../auth/caller-meta.decorator';
import { CallerMeta } from '../auth/user-meta';
import { Public } from '../auth/public.decorator';
import { LifeEventsService } from './life-events.service';
import { CreateLifeEventDto, LifeEventResponseDto, UpdateLifeEventDto } from './dto/life-event.dto';

@ApiTags('Life Events (Quá trình sinh sống)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CallerMetaGuard)
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
  // `member` chỉ là cửa vào — "chính chủ, hoặc editor trở lên" nằm trong
  // LifeEventsService.assertCanManage.
  @Roles('member')
  @ApiOperation({ summary: 'Add a life event (member: chỉ hồ sơ của chính mình; editor trở lên: mọi người)' })
  @ApiCreatedResponse({ type: LifeEventResponseDto })
  create(
    @Param('memberId') memberId: string,
    @Body() dto: CreateLifeEventDto,
    @CurrentMeta() caller: CallerMeta,
  ) {
    return this.lifeEventsService.create(memberId, dto, caller);
  }

  @Put(':id')
  @Roles('member')
  @ApiOperation({ summary: 'Update a life event (member: chỉ hồ sơ của chính mình; editor trở lên: mọi người)' })
  @ApiOkResponse({ type: LifeEventResponseDto })
  update(
    @Param('memberId') memberId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLifeEventDto,
    @CurrentMeta() caller: CallerMeta,
  ) {
    return this.lifeEventsService.update(memberId, id, dto, caller);
  }

  @Delete(':id')
  @Roles('member')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a life event (member: chỉ hồ sơ của chính mình; admin: mọi người)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(
    @Param('memberId') memberId: string,
    @Param('id') id: string,
    @CurrentMeta() caller: CallerMeta,
  ) {
    return this.lifeEventsService.delete(memberId, id, caller);
  }
}
