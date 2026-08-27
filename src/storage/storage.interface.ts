export interface StorageUsage {
  totalBytes: number;
  totalFiles: number;
}

/**
 * Một backend lưu file (Vercel Blob, Cloudflare R2, …). `put` luôn nhận `path`
 * tương đối (vd `media/<id>/<filename>`) và trả về URL public đầy đủ; `del`/
 * `ownsUrl` nhận lại đúng URL đó để mỗi provider tự nhận diện file của mình.
 */
export interface StorageProvider {
  readonly name: string;

  /** True nếu provider có đủ credentials/config để dùng được. */
  isConfigured(): boolean;

  put(path: string, buffer: Buffer, contentType: string): Promise<string>;

  del(url: string): Promise<void>;

  /** URL này có phải do provider này tạo ra không — dùng để route `del` đúng nơi. */
  ownsUrl(url: string): boolean;

  getUsage(): Promise<StorageUsage>;

  /**
   * True nếu provider cấp được presigned PUT URL để client upload THẲNG lên
   * storage, bỏ qua function. Không phải provider nào cũng làm được (Vercel
   * Blob dùng cơ chế client-token khác hẳn), nên các method dưới là optional
   * và chỉ được gọi sau khi check cờ này.
   */
  supportsPresign(): boolean;

  /**
   * URL để client PUT thẳng file lên. `contentType` được ký kèm nên client
   * BẮT BUỘC gửi đúng header `Content-Type` đó, nếu không R2 trả 403.
   */
  presignPut?(path: string, contentType: string, expiresIn: number): Promise<string>;

  /** URL public cuối cùng của `path` — biết trước khi file được upload xong. */
  publicUrlFor?(path: string): string;

  /**
   * Size thật của object trên storage, `null` nếu chưa tồn tại. Dùng ở bước
   * `complete` để XÁC MINH client đã upload xong thay vì tin lời client.
   */
  headSize?(path: string): Promise<number | null>;
}
