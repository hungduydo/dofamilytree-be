import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
  UseGuards, UseInterceptors, UploadedFile, ParseIntPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import {
  MemberResponseDto,
  MemberProfileResponseDto,
  PaginatedMembersResponseDto,
  CommitteeMemberDto,
  NotableMemberDto,
} from './dto/member-response.dto';

@ApiTags('Members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Public()
  @Get('committee')
  @ApiOperation({ summary: 'Get committee/council members (public)' })
  @ApiOkResponse({ type: [CommitteeMemberDto] })
  getCommitteeMembers() {
    return this.membersService.getCommitteeMembers();
  }

  @Public()
  @Get('notable')
  @ApiOperation({ summary: 'Get notable/distinguished members (public)' })
  @ApiOkResponse({ type: [NotableMemberDto] })
  getNotableMembers() {
    return this.membersService.getNotableMembers();
  }

  @Get()
  @ApiOperation({ summary: 'Get all members (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ type: PaginatedMembersResponseDto })
  getAllMembers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
  ) {
    return this.membersService.getAllMembers(page, pageSize);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search members by name (Vietnamese-insensitive)' })
  @ApiQuery({ name: 'name', required: true })
  @ApiQuery({ name: 'includeProfile', required: false, type: Boolean })
  @ApiOkResponse({ type: [MemberResponseDto] })
  searchMembers(
    @Query('name') name: string,
    @Query('includeProfile') includeProfile?: string,
  ) {
    return this.membersService.searchMembers(name, includeProfile === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get member basic info' })
  @ApiOkResponse({ type: MemberResponseDto })
  getMemberById(@Param('id') id: string) {
    return this.membersService.getMemberById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new member + profile' })
  @ApiCreatedResponse({ type: MemberResponseDto })
  createMember(@Body() dto: CreateMemberDto) {
    return this.membersService.createMember(dto);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get member with full profile + relationships' })
  @ApiOkResponse({ type: MemberProfileResponseDto })
  getMemberProfile(@Param('id') id: string) {
    return this.membersService.getMemberProfile(id);
  }

  @Put(':id/profile')
  @ApiOperation({ summary: 'Update member profile (supports avatar upload)' })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ type: MemberResponseDto })
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
  @ApiNoContentResponse({ description: 'Deleted' })
  deleteMember(@Param('id') id: string) {
    return this.membersService.deleteMember(id);
  }
}
