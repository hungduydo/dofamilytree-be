import {
  Controller, Get, Post, Put, Delete, Param, Body, UseGuards, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';
import { GraveAreasService } from './grave-areas.service';
import { CreateGraveAreaDto, GraveAreaResponseDto, UpdateGraveAreaDto } from './dto/grave-area.dto';

@ApiTags('Grave areas (Khu mộ)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('grave-areas')
export class GraveAreasController {
  constructor(private readonly graveAreasService: GraveAreasService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List burial areas with polygon, center and grave count' })
  @ApiOkResponse({ type: [GraveAreaResponseDto] })
  getAllAreas() {
    return this.graveAreasService.getAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get burial area by ID' })
  @ApiOkResponse({ type: GraveAreaResponseDto })
  getAreaById(@Param('id', ParseUUIDPipe) id: string) {
    return this.graveAreasService.getById(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create burial area' })
  @ApiCreatedResponse({ type: GraveAreaResponseDto })
  @ApiConflictResponse({ description: 'Name already used' })
  createArea(@Body() dto: CreateGraveAreaDto) {
    return this.graveAreasService.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update burial area (name, description, polygon)' })
  @ApiOkResponse({ type: GraveAreaResponseDto })
  @ApiConflictResponse({ description: 'Name already used' })
  updateArea(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGraveAreaDto) {
    return this.graveAreasService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete burial area — its graves stay, with no area' })
  @ApiNoContentResponse({ description: 'Deleted' })
  deleteArea(@Param('id', ParseUUIDPipe) id: string) {
    return this.graveAreasService.delete(id);
  }
}
