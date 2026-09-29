import { Controller, INestApplication, Post, UseFilters, UseInterceptors } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { MulterErrorFilter } from '../../src/utils/multer-error.filter';
import { UploadPayloadTooLargeFilter } from '../../src/media/upload-exception.filter';
import { ContactUploadPayloadTooLargeFilter } from '../../src/contact/contact-upload-exception.filter';
import { MAX_UPLOAD_BYTES } from '../../src/media/media.constants';

/**
 * Chạy multer THẬT qua interceptor của @nestjs/platform-express, để khoá hợp
 * đồng giữa multer 2.x và platform-express v10: nếu multer đổi chữ trong
 * message, 413 tiếng Việt hoặc 400 sẽ vỡ ở đây thay vì thành 500 trên prod.
 */
const LIMIT = 16;

@Controller()
class UploadTestController {
  @Post('media')
  @UseFilters(UploadPayloadTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMIT } }))
  media() {
    return { ok: true };
  }

  @Post('contact')
  @UseFilters(ContactUploadPayloadTooLargeFilter)
  @UseInterceptors(FilesInterceptor('attachments', 2, { limits: { fileSize: LIMIT } }))
  contact() {
    return { ok: true };
  }
}

describe('multer 2.x errors through platform-express', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadTestController],
      // Cùng thứ tự với AppModule: Sentry bắt-tất-cả trước, MulterErrorFilter sau.
      providers: [
        { provide: APP_FILTER, useClass: SentryGlobalFilter },
        { provide: APP_FILTER, useClass: MulterErrorFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(() => app.close());

  const file = (bytes: number) => new Blob([Buffer.alloc(bytes)], { type: 'image/png' });

  async function post(path: string, form: FormData) {
    const res = await fetch(`${baseUrl.replace('[::1]', 'localhost')}/${path}`, { method: 'POST', body: form });
    return { status: res.status, body: await res.json() };
  }

  it('accepts a file within the limit', async () => {
    const form = new FormData();
    form.append('file', file(LIMIT), 'a.png');
    expect(await post('media', form)).toEqual({ status: 201, body: { ok: true } });
  });

  it('LIMIT_FILE_SIZE still reaches the media 413 filter', async () => {
    const form = new FormData();
    form.append('file', file(LIMIT + 1), 'a.png');
    const { status, body } = await post('media', form);
    expect(status).toBe(413);
    expect(body.maxUploadBytes).toBe(MAX_UPLOAD_BYTES);
    expect(body.message).toContain('upload-url');
  });

  it('LIMIT_FILE_SIZE still gets the Vietnamese contact message, not multer\'s', async () => {
    const form = new FormData();
    form.append('attachments', file(LIMIT + 1), 'a.png');
    const { status, body } = await post('contact', form);
    expect(status).toBe(413);
    expect(body.message).toMatch(/^Tệp đính kèm vượt quá/);
  });

  it('unexpected field name is a 400, not a 500', async () => {
    const form = new FormData();
    form.append('wrong', file(1), 'a.png');
    const { status, body } = await post('media', form);
    expect(status).toBe(400);
    expect(body.code).toBe('LIMIT_UNEXPECTED_FILE');
  });

  it('exceeding maxCount is a 400, not a 500', async () => {
    const form = new FormData();
    for (let i = 0; i < 3; i++) form.append('attachments', file(1), `${i}.png`);
    const { status } = await post('contact', form);
    expect(status).toBe(400);
  });
});
