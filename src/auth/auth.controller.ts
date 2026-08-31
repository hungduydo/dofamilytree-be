import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { LinkMemberDto } from './dto/link-member.dto';
import { JwtAuthGuard } from './jwt.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import { ROLE_ORDER } from './roles.constants';
import { ParseOptionalIntPipe } from '../utils/parse-optional-int.pipe';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user (multipart: optional profilePicture)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profilePicture'))
  register(
    @Body() dto: RegisterDto,
    @UploadedFile() profilePicture?: Express.Multer.File,
  ) {
    return this.authService.register(dto, profilePicture);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and receive JWT token' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout (client should discard JWT)' })
  logout() {
    return this.authService.logout();
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gửi email đặt lại mật khẩu (không cần đăng nhập). Luôn trả về thông điệp trung lập.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change password (requires current password verification)' })
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current authenticated user info' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id);
  }

  @Get('roles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get list of available roles' })
  getRoles() {
    return this.authService.getRoles();
  }

  @Get('users')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Danh sách tài khoản để duyệt (admin). status=pending là hàng đợi guest chờ gắn member.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'linked', 'all'] })
  @ApiQuery({ name: 'role', required: false, enum: ROLE_ORDER })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  listUsers(
    @Query('status') status?: 'pending' | 'linked' | 'all',
    @Query('role') role?: string,
    @Query('page', new ParseOptionalIntPipe()) page?: number,
    @Query('pageSize', new ParseOptionalIntPipe()) pageSize?: number,
  ) {
    return this.authService.listUsers({ status, role, page, pageSize });
  }

  @Put('users/:userId/roles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Đổi role của một tài khoản (admin). Không tự đổi role của chính mình.' })
  assignRoles(
    @CurrentUser() user: { id: string },
    @Param('userId') userId: string,
    @Body() dto: AssignRolesDto,
  ) {
    return this.authService.assignRoles(user.id, userId, dto);
  }

  @Post('users/:userId/link-member')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Gắn tài khoản vào một member CÓ SẴN (admin). Guest được nâng lên member.',
  })
  linkMember(
    @CurrentUser() user: { id: string },
    @Param('userId') userId: string,
    @Body() dto: LinkMemberDto,
  ) {
    return this.authService.linkMember(user.id, userId, dto);
  }

  @Delete('users/:userId/link-member')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Gỡ liên kết tài khoản ↔ member (admin). Member bị hạ về guest.' })
  unlinkMember(@CurrentUser() user: { id: string }, @Param('userId') userId: string) {
    return this.authService.unlinkMember(user.id, userId);
  }
}
