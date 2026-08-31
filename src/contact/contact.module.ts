import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ContactRateLimiter } from './contact.rate-limiter';
import { ContactThrottleGuard } from './contact.throttle.guard';

/**
 * PrismaModule và RedisModule là @Global() nên không cần import ở đây.
 * StorageModule thì có — tệp đính kèm đi qua StorageService y hệt MediaModule.
 *
 * ContactThrottleGuard khai báo làm provider (chứ không chỉ dùng qua
 * @UseGuards) vì nó có dependency cần inject: Nest chỉ resolve được dependency
 * của một guard khi guard đó nằm trong DI container.
 *
 * ContactRateLimiter dùng chung bởi CẢ guard (đọc hạn mức) lẫn ContactService
 * (tăng bộ đếm sau khi ghi thành công) — đó là lý do nó là provider riêng chứ
 * không nằm gọn trong guard.
 */
@Module({
  imports: [StorageModule],
  controllers: [ContactController],
  providers: [ContactService, ContactRateLimiter, ContactThrottleGuard],
})
export class ContactModule {}
