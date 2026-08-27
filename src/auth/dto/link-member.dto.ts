import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkMemberDto {
  /** Member CÓ SẴN trong cây để gắn tài khoản này vào. */
  @ApiProperty({ example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' })
  @IsUUID()
  memberId: string;
}
