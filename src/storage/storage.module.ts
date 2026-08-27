import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { VercelBlobProvider } from './vercel-blob.provider';
import { R2Provider } from './r2.provider';

@Global()
@Module({
  providers: [VercelBlobProvider, R2Provider, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
