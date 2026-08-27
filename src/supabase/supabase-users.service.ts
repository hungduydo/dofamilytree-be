import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
    return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  /** Lazy — không dựng client ở môi trường (test) không có credentials. */
  private getClient(): SupabaseClient {
    if (!this.client) {
      this.client = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
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
}

/** Tách hàm thuần để test được thứ tự ưu tiên mà không cần đụng tới Supabase. */
export function pickDisplayName(metadata: Record<string, unknown> | undefined | null): string | null {
  for (const key of ['display_name', 'full_name', 'name'] as const) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
