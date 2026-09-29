import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [MembersModule, RelationshipsModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
