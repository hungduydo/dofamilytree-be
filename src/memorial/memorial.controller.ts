import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  BurnIncenseDto,
  BurnIncenseResponseDto,
  CreateTributeDto,
  MemorialStatsDto,
  MemorialTributeDto,
  PaginatedMemorialAncestorsDto,
  PaginatedMemorialTributesDto,
} from './dto/memorial.dto';
import { MemorialCaller, MemorialService } from './memorial.service';

/**
 * Góc nhớ tổ tiên. Ba route đọc là public (khách vãng lai vẫn thấy ban thờ), hai
 * route ghi cần đăng nhập, xoá là việc của admin.
 *
 * VỀ `editor`: RolesGuard của repo này PHÂN CẤP (guest < member < editor < admin),
 * nên @Roles('member') cho editor qua. api-memorial.md §4 đề nghị loại editor ra
 * với lý do "editor là nhân sự thuê ngoài, không phải người trong nhà" — muốn làm
 * đúng vậy phải có một guard theo Set như PII_ROLES trong roles.constants.ts.
 * Đã CÂN NHẮC VÀ QUYẾT ĐỊNH không làm: editor thắp hương được là chấp nhận được,
 * và route-roles.spec.ts còn assert mỗi route chỉ mang đúng một @Roles. Đây
 * KHÔNG phải chỗ bị quên gắn quyền.
 */
@ApiTags('Memorial (Góc nhớ tổ tiên)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('memorial')
export class MemorialController {
  constructor(private readonly memorialService: MemorialService) {}

  @Public()
  @Get('stats')
  @ApiOperation({ summary: 'Ba con số trên ban thờ: số đời, tổng nén hương, tổng lời tưởng niệm (public)' })
  @ApiOkResponse({ type: MemorialStatsDto })
  getStats() {
    return this.memorialService.getStats();
  }

  @Public()
  @Get('ancestors')
  @ApiOperation({
    summary: 'Danh sách tổ tiên (member có deathDate) kèm số nén hương của từng cụ (public)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiOkResponse({ type: PaginatedMemorialAncestorsDto })
  getAncestors(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.memorialService.getAncestors(page, pageSize);
  }

  @Public()
  @Get('tributes')
  @ApiOperation({ summary: 'Lời tưởng niệm, mới nhất trước (public)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiQuery({ name: 'memberId', required: false, description: 'Chỉ lấy lời tưởng niệm gửi riêng cụ này' })
  @ApiOkResponse({ type: PaginatedMemorialTributesDto })
  getTributes(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('memberId') memberId?: string,
  ) {
    return this.memorialService.getTributes(page, pageSize, memberId || undefined);
  }

  @Post('incense')
  @Roles('member')
  @ApiOperation({
    summary: 'Thắp hương. Bỏ trống memberId = thắp cho tổ tiên nói chung. Giới hạn 1 lượt/người/ngày.',
  })
  @ApiOkResponse({ type: BurnIncenseResponseDto })
  @ApiNotFoundResponse({ description: 'memberId không tồn tại' })
  @ApiUnprocessableEntityResponse({ description: 'Thành viên còn sống — hương chỉ dành cho người đã khuất' })
  @ApiConflictResponse({ description: 'Hôm nay đã thắp hương cho người này rồi' })
  burnIncense(@Body() dto: BurnIncenseDto, @CurrentUser() user: MemorialCaller) {
    return this.memorialService.burnIncense(user, dto.memberId);
  }

  @Post('tributes')
  @Roles('member')
  @ApiOperation({ summary: 'Viết lời tưởng niệm (10–500 ký tự sau khi trim)' })
  @ApiCreatedResponse({ type: MemorialTributeDto })
  @ApiNotFoundResponse({ description: 'memberId không tồn tại' })
  @ApiUnprocessableEntityResponse({ description: 'Thành viên còn sống' })
  createTribute(@Body() dto: CreateTributeDto, @CurrentUser() user: MemorialCaller) {
    return this.memorialService.createTribute(user, dto.content, dto.memberId);
  }

  @Delete('tributes/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá lời tưởng niệm (kiểm duyệt). Xoá hẳn, không có hàng đợi.' })
  @ApiNoContentResponse({ description: 'Đã xoá' })
  @ApiNotFoundResponse({ description: 'Không còn tồn tại' })
  deleteTribute(@Param('id', ParseUUIDPipe) id: string) {
    return this.memorialService.deleteTribute(id);
  }
}
