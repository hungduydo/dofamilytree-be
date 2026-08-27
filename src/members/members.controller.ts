import {
  Controller, Get, Post, Put, Delete, Param, Query, Body,
  UseGuards, UseInterceptors, UploadedFile, ParseIntPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiExtraModels,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { ParseOptionalIntPipe } from '../utils/parse-optional-int.pipe';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CallerMetaGuard } from '../auth/caller-meta.guard';
import { CanSeePii, CurrentMeta } from '../auth/caller-meta.decorator';
import { CallerMeta } from '../auth/user-meta';
import { MembersService, MEMBER_SORT_FIELDS, MEMBER_GENDERS, MemberSortField, SortOrder } from './members.service';
import { MEMBER_VIEWS, resolveView } from './members.view';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import {
  MemberResponseDto,
  MemberLiteDto,
  MemberProfileResponseDto,
  PaginatedMembersResponseDto,
  PaginatedMembersTableResponseDto,
  PaginatedMembersLiteResponseDto,
  MemberTableDto,
  ProfileTableDto,
  CommitteeMemberDto,
  NotableMemberDto,
  MemberStatsResponseDto,
  RecomputeGenerationsResponseDto,
} from './dto/member-response.dto';

@ApiTags('Members')
@ApiBearerAuth()
@ApiExtraModels(
  // Đăng ký các biến thể `?view=` vào components.schemas mà không đụng paths —
  // FE opt-in tường minh qua components['schemas'][...], type mặc định không đổi.
  MemberLiteDto,
  ProfileTableDto,
  MemberTableDto,
  PaginatedMembersTableResponseDto,
  PaginatedMembersLiteResponseDto,
)
@UseGuards(JwtAuthGuard, RolesGuard, CallerMetaGuard)
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

  @Public()
  @Get('stats')
  @ApiOperation({ summary: 'Aggregate member stats for header tiles (public)' })
  @ApiOkResponse({ type: MemberStatsResponseDto })
  getMemberStats() {
    return this.membersService.getMemberStats();
  }

  @Get()
  @ApiOperation({ summary: 'Get all members (paginated, optional name filter for the BO table)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'name', required: false, description: 'Filter by name (Vietnamese-insensitive), used by the members table search' })
  @ApiQuery({ name: 'generation', required: false, type: Number, description: 'Lọc theo thế hệ (giá trị hiệu lực trên member)' })
  @ApiQuery({ name: 'sortBy', required: false, enum: MEMBER_SORT_FIELDS })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'tree_id', required: false, type: String, description: 'Lọc theo chi nhánh (UUID, FK tới Tree). Dropdown lấy từ GET /v2/tree.' })
  @ApiQuery({ name: 'gender', required: false, enum: MEMBER_GENDERS, description: 'Lọc theo giới tính' })
  @ApiQuery({
    name: 'view',
    required: false,
    enum: MEMBER_VIEWS,
    description:
      'Độ chi tiết của payload. Bỏ trống = `full` (mặc định, KHÔNG đổi shape).\n' +
      '- `full`  → PaginatedMembersResponseDto (mặc định)\n' +
      '- `table` → PaginatedMembersTableResponseDto (bỏ biography/notes — dùng cho bảng data BO)\n' +
      '- `lite`  → PaginatedMembersLiteResponseDto (id + name + avatar + generation)',
  })
  @ApiOkResponse({ type: PaginatedMembersResponseDto })
  getAllMembers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('name') name?: string,
    // `any` là CỐ Ý, không phải `number`: global ValidationPipe({ transform: true })
    // sẽ ép param kiểu `number` vắng mặt thành NaN → 400 cho mọi request không
    // truyền `generation`. Xem ParseOptionalIntPipe để biết chi tiết.
    @Query('generation', ParseOptionalIntPipe) generation?: any,
    @Query('sortBy') sortBy?: MemberSortField,
    @Query('sortOrder') sortOrder?: SortOrder,
    // Các param dưới đây kiểu `string` ⇒ KHÔNG dính bẫy NaN của ParseOptionalIntPipe,
    // không cần pipe. `resolveView` chuẩn hoá; allowlist gender nằm trong service.
    @Query('view') view?: string,
    @Query('tree_id') treeId?: string,
    @Query('gender') gender?: string,
    @CanSeePii() canSeePii?: boolean,
  ) {
    return this.membersService.getAllMembers(
      page, pageSize, name, generation, sortBy, sortOrder,
      resolveView(view), treeId, gender, canSeePii,
    );
  }

  @Post('generations/recompute')
  @Roles('admin')
  @ApiOperation({
    summary: 'Tính lại thế hệ cho toàn bộ thành viên (admin). Job nền vốn đã tự chạy sau mỗi lần ghi.',
  })
  @ApiOkResponse({ type: RecomputeGenerationsResponseDto })
  recomputeGenerations() {
    return this.membersService.recomputeGenerations();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search tên cho select/autocomplete (unpaginated, trả MemberLiteDto)' })
  @ApiQuery({ name: 'name', required: true })
  @ApiOkResponse({ type: [MemberLiteDto] })
  searchMembers(@Query('name') name: string) {
    return this.membersService.searchMembers(name);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get member basic info' })
  @ApiOkResponse({ type: MemberResponseDto })
  getMemberById(@Param('id') id: string, @CanSeePii() canSeePii: boolean) {
    return this.membersService.getMemberById(id, canSeePii);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Create new member + profile (editor trở lên)' })
  @ApiCreatedResponse({ type: MemberResponseDto })
  createMember(@Body() dto: CreateMemberDto) {
    return this.membersService.createMember(dto);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get member with full profile + relationships' })
  @ApiOkResponse({ type: MemberProfileResponseDto })
  getMemberProfile(@Param('id') id: string, @CanSeePii() canSeePii: boolean) {
    return this.membersService.getMemberProfile(id, canSeePii);
  }

  @Put(':id/profile')
  // `member` chỉ sửa được hồ sơ CỦA CHÍNH MÌNH và chỉ những cột trong
  // MEMBER_SELF_EDITABLE_FIELDS — guard không diễn đạt được ràng buộc theo BẢN
  // GHI, nên phần đó nằm trong service (xem assertCanEditMember).
  @Roles('member')
  @ApiOperation({
    summary:
      'Update member profile (member: chỉ hồ sơ của chính mình + field cho phép; editor trở lên: mọi người, mọi field)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ type: MemberResponseDto })
  @UseInterceptors(FileInterceptor('avatar'))
  updateMemberProfile(
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
    @CurrentMeta() caller: CallerMeta,
    @UploadedFile() avatarFile?: Express.Multer.File,
  ) {
    return this.membersService.updateMemberProfile(id, dto, avatarFile, caller);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete member (cascade: profile, userMetadata)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  deleteMember(@Param('id') id: string) {
    return this.membersService.deleteMember(id);
  }
}
