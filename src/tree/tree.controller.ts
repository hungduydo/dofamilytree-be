import {
  Controller, Get, Post, Put, Delete, Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse,
  ApiNoContentResponse, ApiProperty, ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';
import { TreeService } from './tree.service';
import {
  FamilyTreeChartResponseDto,
  TreeRecordDto,
  StatsResponseDto,
} from './dto/tree-response.dto';

class CreateTreeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  owner_id: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  show?: boolean;
}

class UpdateTreeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show?: boolean;
}

@ApiTags('Tree')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tree')
export class TreeController {
  constructor(private readonly treeService: TreeService) {}

  @Public()
  @Get('chart')
  @ApiOperation({ summary: 'Get full family tree chart (Redis cached, 1h TTL)' })
  @ApiOkResponse({ type: FamilyTreeChartResponseDto })
  getChart() {
    return this.treeService.getFamilyTreeChart();
  }

  @Public()
  @Get('chart/:memberId')
  @ApiOperation({ summary: 'Get 4-generation subtree from member' })
  @ApiOkResponse({ type: FamilyTreeChartResponseDto })
  getSubTreeChart(@Param('memberId') memberId: string) {
    return this.treeService.getFamilySubTreeChart(memberId);
  }

  @Post('regenerate')
  @Roles('editor')
  @ApiOperation({ summary: 'Force regenerate tree chart + invalidate Redis cache' })
  @ApiOkResponse({ type: FamilyTreeChartResponseDto })
  regenerate() {
    return this.treeService.regenerateFamilyTreeChart();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get tree statistics + cache status' })
  @ApiOkResponse({ type: StatsResponseDto })
  getStats() {
    return this.treeService.getStats();
  }

  @Public()
  @Get('home')
  @ApiOperation({ summary: 'Get trees with show=true (for homepage)' })
  @ApiOkResponse({ type: [TreeRecordDto] })
  getHomeTrees() {
    return this.treeService.getHomeTrees();
  }

  @Get()
  @ApiOperation({ summary: 'List all tree records' })
  @ApiOkResponse({ type: [TreeRecordDto] })
  getAllTrees() {
    return this.treeService.getAllTrees();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tree by ID' })
  @ApiOkResponse({ type: TreeRecordDto })
  getTreeById(@Param('id') id: string) {
    return this.treeService.getTreeById(id);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Create new tree record (branch)' })
  @ApiCreatedResponse({ type: TreeRecordDto })
  createTree(@Body() dto: CreateTreeDto) {
    return this.treeService.createTree(dto);
  }

  @Put(':id')
  @Roles('editor')
  @ApiOperation({ summary: 'Update tree record' })
  @ApiOkResponse({ type: TreeRecordDto })
  updateTree(@Param('id') id: string, @Body() dto: UpdateTreeDto) {
    return this.treeService.updateTree(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete tree record' })
  @ApiNoContentResponse({ description: 'Deleted' })
  deleteTree(@Param('id') id: string) {
    return this.treeService.deleteTree(id);
  }
}
