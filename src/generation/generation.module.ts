import { Global, Module } from '@nestjs/common';
import { GenerationService } from './generation.service';

/**
 * `@Global()` vì `MembersService`, `RelationshipsService`, `AuthService` và
 * `TasksService` đều cần inject `GenerationService`. Nếu export theo lối thường
 * thì `QueueModule` (đã `@Global`) phải import module này trong khi module này
 * lại cần `QStashService` của nó — một vòng lặp module-graph thật sự. Global hoá
 * cả hai phía làm module này không phải import gì cả.
 */
@Global()
@Module({
  providers: [GenerationService],
  exports: [GenerationService],
})
export class GenerationModule {}
