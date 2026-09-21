import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** @Global theo đúng mẫu SupabaseModule — queue và các module sau này đều cần. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
