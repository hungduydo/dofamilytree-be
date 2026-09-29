import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditService } from './audit.service';
import {
  AuditQueryDto,
  PaginatedAuditDto,
  PaginatedTrashDto,
  RestoreResultDto,
  TrashQueryDto,
} from './dto/audit.dto';

/**
 * Toàn bộ controller chỉ admin: dòng audit chứa PII (phone/email/địa chỉ trong
 * snapshot profile) và cho thấy ai đã làm gì — editor thuê ngoài không được
 * xem, member càng không.
 */
@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Lịch sử thay đổi member / quan hệ (admin)' })
  @ApiOkResponse({ type: PaginatedAuditDto })
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }

  @Get('trash')
  @Roles('admin')
  @ApiOperation({ summary: 'Thùng rác: bản ghi đã xoá trong 30 ngày, chưa khôi phục (admin)' })
  @ApiOkResponse({ type: PaginatedTrashDto })
  listTrash(@Query() query: TrashQueryDto) {
    return this.audit.listTrash(query);
  }

  @Post('trash/:id/restore')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khôi phục từ thùng rác (admin). 404 không có, 409 đã khôi phục / xung đột, 410 quá hạn',
  })
  @ApiOkResponse({ type: RestoreResultDto })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: { id: string }) {
    return this.audit.restore(id, user?.id ?? null);
  }
}
