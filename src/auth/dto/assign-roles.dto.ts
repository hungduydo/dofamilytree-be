import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn } from 'class-validator';
import { ROLE_ORDER } from '../roles.constants';

export class AssignRolesDto {
  /**
   * Trước đây nhận chuỗi TUỲ Ý và cả mảng rỗng, nên `PUT .../roles` với `[]`
   * lột sạch quyền của một tài khoản, còn `['superuser']` thì tạo ra role không
   * guard nào hiểu. Giờ chỉ 4 giá trị hợp lệ và không được rỗng.
   *
   * Truyền nhiều role vẫn hợp lệ nhưng service chuẩn hoá về CAO NHẤT — mảng chỉ
   * còn tồn tại vì cột DB là String[] và FE cũ đang gửi mảng.
   */
  @ApiProperty({ enum: ROLE_ORDER, isArray: true, example: ['editor'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(ROLE_ORDER.length)
  @IsIn(ROLE_ORDER as unknown as string[], { each: true })
  roles: string[];
}
