import {
  Controller, Get, Post, Put, Delete, Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { TreeService } from './tree.service';

class CreateTreeDto {
  title?: string;
  description?: string;
  image?: string;
  owner_id: string;
  show?: boolean;
}

class UpdateTreeDto {
  title?: string;
  description?: string;
  image?: string;
  show?: boolean;
}

@ApiTags('Tree')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tree')
export class TreeController {
  constructor(private readonly treeService: TreeService) {}

  @Get('chart')
  @ApiOperation({ summary: 'Get full family tree chart (Redis cached, 1h TTL)' })
  getChart() {
    return this.treeService.getFamilyTreeChart();
  }

  @Get('chart/:memberId')
  @ApiOperation({ summary: 'Get 4-generation subtree from member' })
  getSubTreeChart(@Param('memberId') memberId: string) {
    return this.treeService.getFamilySubTreeChart(memberId);
  }

  @Post('regenerate')
  @ApiOperation({ summary: 'Force regenerate tree chart + invalidate Redis cache' })
  regenerate() {
    return this.treeService.regenerateFamilyTreeChart();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get tree statistics + cache status' })
  getStats() {
    return this.treeService.getStats();
  }

  @Public()
  @Get('home')
  @ApiOperation({ summary: 'Get trees with show=true (for homepage)' })
  getHomeTrees() {
    return this.treeService.getHomeTrees();
  }

  @Get()
  @ApiOperation({ summary: 'List all tree records' })
  getAllTrees() {
    return this.treeService.getAllTrees();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tree by ID' })
  getTreeById(@Param('id') id: string) {
    return this.treeService.getTreeById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new tree record (branch)' })
  createTree(@Body() dto: CreateTreeDto) {
    return this.treeService.createTree(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update tree record' })
  updateTree(@Param('id') id: string, @Body() dto: UpdateTreeDto) {
    return this.treeService.updateTree(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete tree record' })
  deleteTree(@Param('id') id: string) {
    return this.treeService.deleteTree(id);
  }
}
