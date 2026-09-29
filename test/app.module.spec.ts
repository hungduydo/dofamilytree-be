import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Dựng TOÀN BỘ đồ thị DI của app (không mở kết nối DB / Redis thật). Unit test
 * dựng từng service với mock nên không bắt được lỗi nối module: quên export
 * một provider, import vòng giữa hai module… — những lỗi chỉ nổ lúc cold start
 * trên production. Test này nổ trên CI thay vào đó.
 */
describe('AppModule', () => {
  beforeAll(() => {
    process.env.UPSTASH_REDIS_REST_URL ??= 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN ??= 'test';
  });

  it('resolve được mọi provider và controller', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
