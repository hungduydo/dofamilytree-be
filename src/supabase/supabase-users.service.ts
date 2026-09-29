import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey, getSupabaseUrl, hasSupabaseSecretKey } from './supabase-key';

/**
 * Đọc thông tin tài khoản từ Supabase Auth bằng service role key.
 *
 * Tách riêng khỏi AuthService vì các module khác (media) cần đọc tên hiển thị
 * mà không kéo theo cả luồng đăng nhập/đăng ký.
 */
@Injectable()
export class SupabaseUsersService {
  private readonly logger = new Logger(SupabaseUsersService.name);
  private client: SupabaseClient | null = null;

  isConfigured(): boolean {
    return hasSupabaseSecretKey();
  }

  /** Lazy — không dựng client ở môi trường (test) không có credentials. */
  private getClient(): SupabaseClient {
    if (!this.client) {
      this.client = createClient(getSupabaseUrl(), getSupabaseSecretKey());
    }
    return this.client;
  }

  /**
   * "Display name" như hiển thị ở bảng Users của Supabase Studio. Studio đọc
   * `raw_user_meta_data`, và tuỳ cách tài khoản được tạo mà key là
   * `display_name`, `full_name` hay `name` — thử lần lượt cả ba.
   *
   * Best-effort: Supabase chết KHÔNG được làm hỏng một upload. Trả `null` để
   * chỗ gọi rơi xuống nguồn tên tiếp theo.
   */
  async getDisplayName(userId: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.getClient().auth.admin.getUserById(userId);
      if (error || !data.user) return null;
      return pickDisplayName(data.user.user_metadata);
    } catch (error) {
      this.logger.warn(`Không đọc được display name của ${userId}: ${(error as Error).message}`);
      return null;
    }
  }
  /**
   * Email đăng nhập của một tài khoản. Email chỉ nằm ở Supabase Auth, không ở
   * DB của ta. Trả `null` khi không đọc được — chỗ gọi tự quyết đó là lỗi hay không.
   */
  async getEmail(userId: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.getClient().auth.admin.getUserById(userId);
      if (error || !data.user) return null;
      return data.user.email ?? null;
    } catch (error) {
      this.logger.warn(`Không đọc được email của ${userId}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Email của nhiều tài khoản trong MỘT lượt: duyệt danh sách user theo trang
   * thay vì gọi getUserById N lần (job nhắc ngày giỗ gửi cho cả dòng họ).
   * Tài khoản không có email / không tìm thấy thì vắng mặt trong Map.
   *
   * KHÁC getEmail: lỗi thì NÉM — job gọi hàm này cần thất bại để QStash retry,
   * không phải lặng lẽ gửi cho 0 người.
   */
  async getEmails(userIds: string[]): Promise<Map<string, string>> {
    const wanted = new Set(userIds);
    const out = new Map<string, string>();
    if (!wanted.size) return out;

    const perPage = 1000;
    for (let page = 1; ; page++) {
      const { data, error } = await this.getClient().auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(`Supabase listUsers lỗi: ${error.message}`);
      for (const user of data.users) {
        if (wanted.has(user.id) && user.email) out.set(user.id, user.email);
      }
      if (data.users.length < perPage || out.size === wanted.size) break;
    }
    return out;
  }
}

/** Tách hàm thuần để test được thứ tự ưu tiên mà không cần đụng tới Supabase. */
export function pickDisplayName(metadata: Record<string, unknown> | undefined | null): string | null {
  for (const key of ['display_name', 'full_name', 'name'] as const) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
