import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MoveMediaDto } from '../../src/media/dto/move-media.dto';

const ID = '22222222-2222-4222-8222-222222222222';
const ALBUM = '11111111-1111-4111-8111-111111111111';

async function errorsFor(payload: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(MoveMediaDto, payload));
  return errors.map((e) => e.property);
}

describe('MoveMediaDto', () => {
  it('album uuid hoặc null đều hợp lệ', async () => {
    expect(await errorsFor({ media_ids: [ID], album_id: ALBUM })).toEqual([]);
    expect(await errorsFor({ media_ids: [ID], album_id: null })).toEqual([]);
  });

  it('thiếu album_id ⇒ lỗi (phải nói rõ null nếu muốn gỡ khỏi album)', async () => {
    expect(await errorsFor({ media_ids: [ID] })).toEqual(['album_id']);
  });

  it('album_id không phải uuid ⇒ lỗi', async () => {
    expect(await errorsFor({ media_ids: [ID], album_id: 'abc' })).toEqual(['album_id']);
  });

  it('media_ids: rỗng, quá 200, hoặc chứa id lạ ⇒ lỗi', async () => {
    expect(await errorsFor({ media_ids: [], album_id: null })).toEqual(['media_ids']);
    expect(await errorsFor({ media_ids: Array(201).fill(ID), album_id: null })).toEqual(['media_ids']);
    expect(await errorsFor({ media_ids: [ID, 'nope'], album_id: null })).toEqual(['media_ids']);
  });
});
