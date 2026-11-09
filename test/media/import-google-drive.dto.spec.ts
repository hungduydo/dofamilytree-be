import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImportGoogleDriveDto } from '../../src/media/dto/import-google-drive.dto';

const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUv';

async function errorsFor(payload: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(ImportGoogleDriveDto, payload));
  return errors.map((e) => e.property);
}

describe('ImportGoogleDriveDto', () => {
  it('chế độ Picker: access_token + file_ids', async () => {
    expect(await errorsFor({ access_token: 'tok', file_ids: [FILE_ID] })).toEqual([]);
  });

  it('chế độ link: access_token không bắt buộc, resource_keys tuỳ chọn', async () => {
    expect(await errorsFor({ file_ids: [FILE_ID] })).toEqual([]);
    expect(await errorsFor({ file_ids: [FILE_ID], resource_keys: [`${FILE_ID}/0-AbC_d`] })).toEqual([]);
  });

  it.each([
    ['thiếu dấu /', FILE_ID],
    ['resource key rỗng', `${FILE_ID}/`],
    ['file id quá ngắn', 'abc/rk'],
    ['ký tự lạ', `${FILE_ID}/rk,${FILE_ID}/rk2`],
  ])('resource_keys sai định dạng (%s) ⇒ lỗi', async (_label, rk) => {
    expect(await errorsFor({ file_ids: [FILE_ID], resource_keys: [rk] })).toEqual(['resource_keys']);
  });

  it('resource_keys tối đa 200 phần tử', async () => {
    const keys = Array.from({ length: 201 }, () => `${FILE_ID}/rk`);
    expect(await errorsFor({ file_ids: [FILE_ID], resource_keys: keys })).toEqual(['resource_keys']);
  });
});
