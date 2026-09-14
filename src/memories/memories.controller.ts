import {
  Controller, Get, Post, Put, Delete, Param, Body, Request, UseGuards, HttpCode, HttpStatus,
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
import { MemoriesService } from './memories.service';
import { CreateMemoryDto, MemoryResponseDto, UpdateMemoryDto } from './dto/memory.dto';

@ApiTags('Memories (Kỷ niệm)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CallerMetaGuard)
@Controller('members/:memberId/memories')
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get memories attached to a member (public)' })
  @ApiOkResponse({ type: [MemoryResponseDto] })
  getByMember(@Param('memberId') memberId: string) {
    return this.memoriesService.getByMember(memberId);
  }

  @Post()
  @Roles('member')
  @ApiOperation({ summary: 'Add a memory to a member (author = current user)' })
  @ApiCreatedResponse({ type: MemoryResponseDto })
  create(
    @Param('memberId') memberId: string,
    @Body() dto: CreateMemoryDto,
    @Request() req: any,
  ) {
    return this.memoriesService.create(memberId, req.user.id, dto);
  }

  @Put(':id')
  // `member` chỉ là cửa vào — "tác giả hoặc admin" nằm trong
  // MemoriesService.assertCanChange.
  @Roles('member')
  @ApiOperation({ summary: 'Update a memory (tác giả hoặc admin)' })
  @ApiOkResponse({ type: MemoryResponseDto })
  update(
    @Param('memberId') memberId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
    @Request() req: any,
    @CurrentMeta() caller: CallerMeta,
  ) {
    return this.memoriesService.update(memberId, id, req.user.id, dto, caller);
  }

  @Delete(':id')
  @Roles('member')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a memory (tác giả hoặc admin)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(
    @Param('memberId') memberId: string,
    @Param('id') id: string,
    @Request() req: any,
    @CurrentMeta() caller: CallerMeta,
  ) {
    return this.memoriesService.delete(memberId, id, req.user.id, caller);
  }
}
