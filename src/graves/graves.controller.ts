import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { GravesService } from './graves.service';
import { CreateGraveDto, UpdateGraveDto } from './dto/create-grave.dto';

@ApiTags('Graves (Mộ phần)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('graves')
export class GravesController {
  constructor(private readonly gravesService: GravesService) {}

  @Get()
  @ApiOperation({ summary: 'List all graves (filter by name)' })
  @ApiQuery({ name: 'name', required: false })
  getAllGraves(@Query('name') name?: string) {
    return this.gravesService.getAllGraves({ name });
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Find graves near coordinates (lat, lng, radiusKm)' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'radiusKm', required: false, type: Number })
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

  @Get(':id')
  @ApiOperation({ summary: 'Get grave by ID' })
  getGraveById(@Param('id') id: string) {
    return this.gravesService.getGraveById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new grave with GPS coordinates' })
  createGrave(@Body() dto: CreateGraveDto) {
    return this.gravesService.createGrave(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update grave info + coordinates' })
  updateGrave(@Param('id') id: string, @Body() dto: UpdateGraveDto) {
    return this.gravesService.updateGrave(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete grave' })
  deleteGrave(@Param('id') id: string) {
    return this.gravesService.deleteGrave(id);
  }
}
