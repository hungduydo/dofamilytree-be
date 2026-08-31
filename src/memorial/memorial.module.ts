import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { MemorialController } from './memorial.controller';
import { MemorialService } from './memorial.service';

// PrismaModule và RedisModule là @Global() nên không cần import ở đây.
// SupabaseModule thì không — cần cho nhánh cuối của resolveAuthorName.
@Module({
  imports: [SupabaseModule],
  controllers: [MemorialController],
  providers: [MemorialService],
})
export class MemorialModule {}
