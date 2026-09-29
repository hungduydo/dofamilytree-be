import { Body, Controller, Get, Header, HttpCode, HttpStatus, NotFoundException, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { escapeHtml } from '../mail/escape-html';
import { NotificationPreferencesDto } from './dto/notification-preferences.dto';
import { verifyUnsubscribeToken } from './unsubscribe-token';

@ApiTags('Notifications')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tuỳ chọn thông báo của tài khoản đang đăng nhập' })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  async getPreferences(@CurrentUser() user: { id: string }): Promise<NotificationPreferencesDto> {
    const meta = await this.prisma.userMetadata.findUnique({
      where: { user_id: user.id },
      select: { anniversary_reminders: true },
    });
    if (!meta) throw new NotFoundException('Không tìm thấy tài khoản');
    return { anniversaryReminders: meta.anniversary_reminders };
  }

  @Put('preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bật / tắt email nhắc ngày giỗ' })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  async updatePreferences(
    @CurrentUser() user: { id: string },
    @Body() dto: NotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    const { count } = await this.prisma.userMetadata.updateMany({
      where: { user_id: user.id },
      data: { anniversary_reminders: dto.anniversaryReminders },
    });
    if (!count) throw new NotFoundException('Không tìm thấy tài khoản');
    return { anniversaryReminders: dto.anniversaryReminders };
  }

  /**
   * Trang XÁC NHẬN tắt nhắc — link trong email trỏ vào đây. GET không đổi gì:
   * bộ quét link của hộp thư (Outlook Safe Links, antivirus) tự mở mọi link,
   * nếu GET tắt luôn thì người ta bị tắt nhắc mà không hề bấm.
   */
  @Public()
  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Trang xác nhận tắt email nhắc ngày giỗ (link trong email, không cần đăng nhập)' })
  @ApiQuery({ name: 'token', required: true })
  unsubscribePage(@Query('token') token: string): string {
    if (!verifyUnsubscribeToken(token)) return page('Link không hợp lệ', 'Link tắt nhắc này không đúng hoặc đã bị sửa.');
    return page(
      'Tắt nhắc ngày giỗ?',
      'Bạn sẽ không nhận email nhắc ngày giỗ nữa. Có thể bật lại bất cứ lúc nào trong trang Cài đặt.',
      `<form method="post" action="?token=${encodeURIComponent(token)}">
  <button type="submit" style="padding:10px 18px;font-size:15px;border-radius:6px;border:1px solid #8a5a2b;background:#8a5a2b;color:#fff;cursor:pointer">Tắt nhắc ngày giỗ</button>
</form>`,
    );
  }

  /**
   * Tắt thật. Nhận cả nút trên trang xác nhận lẫn POST one-click của Gmail
   * (header List-Unsubscribe-Post, RFC 8058). Luôn trả 200: Gmail không đọc body.
   */
  @Public()
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Tắt email nhắc ngày giỗ bằng token trong email (one-click, RFC 8058)' })
  @ApiQuery({ name: 'token', required: true })
  async unsubscribe(@Query('token') token: string): Promise<string> {
    const userId = verifyUnsubscribeToken(token);
    if (!userId) return page('Link không hợp lệ', 'Link tắt nhắc này không đúng hoặc đã bị sửa.');
    await this.prisma.userMetadata.updateMany({
      where: { user_id: userId },
      data: { anniversary_reminders: false },
    });
    const settingsUrl = `${(process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '')}/settings`;
    return page(
      'Đã tắt nhắc ngày giỗ',
      'Bạn sẽ không nhận email nhắc ngày giỗ nữa.',
      `<p><a href="${escapeHtml(settingsUrl)}">Bật lại trong trang Cài đặt</a></p>`,
    );
  }
}

function page(title: string, message: string, extra = ''): string {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#2b2118;line-height:1.5">
<h1 style="font-size:22px">${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
${extra}
</body></html>`;
}
