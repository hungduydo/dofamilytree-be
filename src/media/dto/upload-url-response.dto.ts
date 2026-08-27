import { ApiProperty } from '@nestjs/swagger';

/**
 * Trả về từ `POST /v2/media/upload-url`. Record media đã được tạo ở trạng thái
 * `pending` — client PUT file lên `upload_url` rồi gọi `POST /v2/media/:id/complete`
 * để backend xác minh và chuyển sang `ready`.
 */
export class UploadUrlResponseDto {
  @ApiProperty({ format: 'uuid', description: 'ID record media vừa tạo (status = pending)' })
  media_id: string;

  @ApiProperty({ description: 'URL để PUT file lên. Hết hạn sau `expires_in` giây.' })
  upload_url: string;

  @ApiProperty({ example: 'PUT' })
  method: string;

  @ApiProperty({
    example: { 'Content-Type': 'audio/mpeg' },
    description: 'Header BẮT BUỘC khi PUT — đã nằm trong chữ ký, sai là storage trả 403.',
  })
  headers: Record<string, string>;

  @ApiProperty({ example: 900, description: 'Thời hạn của upload_url (giây)' })
  expires_in: number;

  @ApiProperty({ description: 'URL public cuối cùng của file sau khi upload xong' })
  public_url: string;
}
