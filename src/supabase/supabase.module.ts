import { Global, Module } from '@nestjs/common';
import { SupabaseUsersService } from './supabase-users.service';

/** @Global theo đúng mẫu StorageModule — nhiều module cần, không đáng import lẻ. */
@Global()
@Module({
  providers: [SupabaseUsersService],
  exports: [SupabaseUsersService],
})
export class SupabaseModule {}
