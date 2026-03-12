import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
  UseGuards, UseInterceptors, UploadedFile, ParseIntPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@ApiTags('Members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all members (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  getAllMembers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
  ) {
    return this.membersService.getAllMembers(page, pageSize);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search members by name (Vietnamese-insensitive)' })
  @ApiQuery({ name: 'name', required: true })
  searchMembers(@Query('name') name: string) {
    return this.membersService.searchMembers(name);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get member basic info' })
  getMemberById(@Param('id') id: string) {
    return this.membersService.getMemberById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new member + profile' })
  createMember(@Body() dto: CreateMemberDto) {
    return this.membersService.createMember(dto);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get member with full profile + relationships' })
  getMemberProfile(@Param('id') id: string) {
    return this.membersService.getMemberProfile(id);
  }

  @Put(':id/profile')
  @ApiOperation({ summary: 'Update member profile (supports avatar upload)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('avatar'))
  updateMemberProfile(
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
    @UploadedFile() avatarFile?: Express.Multer.File,
  ) {
    return this.membersService.updateMemberProfile(id, dto, avatarFile);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete member (cascade: profile, userMetadata)' })
  deleteMember(@Param('id') id: string) {
    return this.membersService.deleteMember(id);
  }
}
