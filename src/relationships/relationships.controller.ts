import {
  Controller, Get, Post, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RelationshipsService } from './relationships.service';
import { CreateRelationshipDto, SearchRelationshipDto } from './dto/create-relationship.dto';

@ApiTags('Relationships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RelationshipsController {
  constructor(private readonly relationshipsService: RelationshipsService) {}

  @Get('members/:id/relationships')
  @ApiOperation({ summary: 'Get all relationships for a member' })
  getRelationships(@Param('id') id: string) {
    return this.relationshipsService.getRelationships(id);
  }

  @Get('members/:id/relationships/parents')
  @ApiOperation({ summary: 'Get parents of a member' })
  getParents(@Param('id') id: string) {
    return this.relationshipsService.getParents(id);
  }

  @Get('members/:id/relationships/children')
  @ApiOperation({ summary: 'Get children of a member' })
  getChildren(@Param('id') id: string) {
    return this.relationshipsService.getChildren(id);
  }

  @Get('members/:id/relationships/spouses')
  @ApiOperation({ summary: 'Get spouses of a member' })
  getSpouses(@Param('id') id: string) {
    return this.relationshipsService.getSpouses(id);
  }

  @Get('members/:id/relationships/ancestors')
  @ApiOperation({ summary: 'Get all ancestors (recursive)' })
  getAncestors(@Param('id') id: string) {
    return this.relationshipsService.getAncestors(id);
  }

  @Get('members/:id/relationships/descendants')
  @ApiOperation({ summary: 'Get all descendants (recursive)' })
  getDescendants(@Param('id') id: string) {
    return this.relationshipsService.getDescendants(id);
  }

  @Get('relationships/search')
  @ApiOperation({ summary: 'Search relationships by type, memberId, role' })
  searchRelationships(@Query() query: SearchRelationshipDto) {
    return this.relationshipsService.searchRelationships(query);
  }

  @Post('members/:memberId/relationships')
  @ApiOperation({ summary: 'Add relationship between two members' })
  addRelationship(@Body() dto: CreateRelationshipDto) {
    return this.relationshipsService.addRelationship(dto);
  }

  @Delete('relationships/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a relationship' })
  deleteRelationship(@Param('id') id: string) {
    return this.relationshipsService.deleteRelationship(id);
  }
}
