import {
  Controller, Get, Post, Delete, Param, Body, Request, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { MemoriesService } from './memories.service';
import { CreateMemoryDto, MemoryResponseDto } from './dto/memory.dto';

@ApiTags('Memories (Kỷ niệm)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
  @ApiOperation({ summary: 'Add a memory to a member (author = current user)' })
  @ApiCreatedResponse({ type: MemoryResponseDto })
  create(
    @Param('memberId') memberId: string,
    @Body() dto: CreateMemoryDto,
    @Request() req: any,
  ) {
    return this.memoriesService.create(memberId, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a memory' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(@Param('id') id: string) {
    return this.memoriesService.delete(id);
  }
}
