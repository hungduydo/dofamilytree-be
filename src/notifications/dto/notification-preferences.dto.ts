import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class NotificationPreferencesDto {
  @ApiProperty({ description: 'Nhận email nhắc ngày giỗ của tổ tiên trực hệ, vợ/chồng và các ngày chung của dòng họ' })
  @IsBoolean()
  anniversaryReminders: boolean;
}
