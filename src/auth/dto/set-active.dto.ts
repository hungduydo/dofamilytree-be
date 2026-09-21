import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetActiveDto {
  /** false = khoá tài khoản (không login được, token đang cầm bị từ chối). */
  @ApiProperty({ example: false })
  @IsBoolean()
  active: boolean;
}
