import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';
import { GravesService } from './graves.service';
import { CreateGraveDto, UpdateGraveDto } from './dto/create-grave.dto';
import { GraveResponseDto } from './dto/grave-response.dto';

@ApiTags('Graves (Mộ phần)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('graves')
export class GravesController {
  constructor(private readonly gravesService: GravesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all graves (filter by name)' })
  @ApiQuery({ name: 'name', required: false })
  @ApiOkResponse({ type: [GraveResponseDto] })
  getAllGraves(@Query('name') name?: string) {
    return this.gravesService.getAllGraves({ name });
  }

  @Public()
  @Get('nearby')
  @ApiOperation({ summary: 'Find graves near coordinates (lat, lng, radiusKm)' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'radiusKm', required: false, type: Number })
  @ApiOkResponse({ type: [GraveResponseDto] })
  getNearbyGraves(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    return this.gravesService.getNearbyGraves({
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radiusKm: radiusKm ? parseFloat(radiusKm) : 10,
    });
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get grave by ID' })
  @ApiOkResponse({ type: GraveResponseDto })
  getGraveById(@Param('id') id: string) {
    return this.gravesService.getGraveById(id);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Create new grave with GPS coordinates' })
  @ApiCreatedResponse({ type: GraveResponseDto })
  createGrave(@Body() dto: CreateGraveDto) {
    return this.gravesService.createGrave(dto);
  }

  @Put(':id')
  @Roles('editor')
  @ApiOperation({ summary: 'Update grave info + coordinates' })
  @ApiOkResponse({ type: GraveResponseDto })
  updateGrave(@Param('id') id: string, @Body() dto: UpdateGraveDto) {
    return this.gravesService.updateGrave(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete grave' })
  @ApiNoContentResponse({ description: 'Deleted' })
  deleteGrave(@Param('id') id: string) {
    return this.gravesService.deleteGrave(id);
  }
}
