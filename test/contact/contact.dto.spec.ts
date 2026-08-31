import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateContactMessageDto,
  UpdateContactInfoDto,
  UpdateContactMessageStatusDto,
} from '../../src/contact/dto/contact.dto';

/**
 * Chạy DTO qua ĐÚNG đường ValidationPipe đi: plainToInstance (chạy @Transform)
 * rồi validate. Gọi thẳng validate() sẽ bỏ qua bước trim và spec sẽ bỏ lọt
 * chính những ca mà trim sinh ra.
 */
async function errorsFor(payload: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateContactMessageDto, payload);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

const valid = {
  topic: 'GENEALOGY',
  fullName: 'Nguyễn Văn An',
  phone: '0988 123 456',
  content: 'Con là cháu đời thứ 6, xin hỏi về việc bổ sung tên vào gia phả.',
};

describe('CreateContactMessageDto', () => {
  it('payload hợp lệ tối thiểu (không email, không branch) đi qua', async () => {
    expect(await errorsFor(valid)).toEqual([]);
  });

  describe('topic — enum là hợp đồng, không phải free text', () => {
    it.each(['GENEALOGY', 'GRAVE', 'EVENT', 'SCHOLARSHIP', 'OTHER'])('nhận %s', async (topic) => {
      expect(await errorsFor({ ...valid, topic })).toEqual([]);
    });

    it.each([['KHAC'], ['genealogy'], [''], [undefined]])('từ chối %s', async (topic) => {
      expect(await errorsFor({ ...valid, topic })).toContain('topic');
    });
  });

  describe('content — 20–2000 ký tự SAU KHI trim', () => {
    it('19 ký tự ⇒ lỗi', async () => {
      expect(await errorsFor({ ...valid, content: 'a'.repeat(19) })).toContain('content');
    });

    it('20 ký tự ⇒ qua', async () => {
      expect(await errorsFor({ ...valid, content: 'a'.repeat(20) })).toEqual([]);
    });

    it('2000 ký tự ⇒ qua', async () => {
      expect(await errorsFor({ ...valid, content: 'a'.repeat(2000) })).toEqual([]);
    });

    it('2001 ký tự ⇒ lỗi', async () => {
      expect(await errorsFor({ ...valid, content: 'a'.repeat(2001) })).toContain('content');
    });

    it('19 ký tự bọc trong khoảng trắng KHÔNG lách qua được nhờ độ dài', async () => {
      // @Transform chạy TRƯỚC @Length, nên chuỗi được đo sau khi trim.
      expect(await errorsFor({ ...valid, content: `   ${'a'.repeat(19)}   ` })).toContain('content');
    });

    it('chuỗi toàn khoảng trắng bị đo là RỖNG', async () => {
      expect(await errorsFor({ ...valid, content: ' '.repeat(50) })).toContain('content');
    });
  });

  describe('fullName — 2–120 ký tự sau trim', () => {
    it.each([['A', 'quá ngắn'], ['a'.repeat(121), 'quá dài'], [' A ', 'trim rồi còn 1 ký tự']])(
      'từ chối (%s)',
      async (fullName) => {
        expect(await errorsFor({ ...valid, fullName })).toContain('fullName');
      },
    );

    it('trim khoảng trắng thừa rồi mới đo', async () => {
      const dto = plainToInstance(CreateContactMessageDto, { ...valid, fullName: '  An  ' });
      expect(await validate(dto)).toEqual([]);
      expect(dto.fullName).toBe('An');
    });
  });

  describe('phone — bắt buộc, khớp mẫu của FE', () => {
    it.each(['0988123456', '+84 988 123 456', '0988.123.456'])('nhận %s', async (phone) => {
      expect(await errorsFor({ ...valid, phone })).toEqual([]);
    });

    it.each(['', '1988123456', '0988', 'abc'])('từ chối %s', async (phone) => {
      expect(await errorsFor({ ...valid, phone })).toContain('phone');
    });

    it('bắt buộc — ban liên lạc phải luôn có đường trả lời', async () => {
      expect(await errorsFor({ ...valid, phone: undefined })).toContain('phone');
    });
  });

  describe('email — KHÔNG bắt buộc, cố ý', () => {
    it('bỏ trống hẳn ⇒ qua: cụ ông có điện thoại mà không có hòm thư vẫn viết được', async () => {
      expect(await errorsFor({ ...valid, email: undefined })).toEqual([]);
    });

    it('chuỗi RỖNG ⇒ qua — "" là "không điền", không phải "sai định dạng"', async () => {
      expect(await errorsFor({ ...valid, email: '' })).toEqual([]);
    });

    it('có giá trị nhưng sai định dạng ⇒ lỗi', async () => {
      expect(await errorsFor({ ...valid, email: 'khong-phai-email' })).toContain('email');
    });

    it('email hợp lệ ⇒ qua', async () => {
      expect(await errorsFor({ ...valid, email: 'an.nguyen@example.com' })).toEqual([]);
    });
  });

  describe('branch — tuỳ chọn, ≤ 120 ký tự', () => {
    it('bỏ trống ⇒ qua', async () => {
      expect(await errorsFor({ ...valid, branch: undefined })).toEqual([]);
    });

    it('121 ký tự ⇒ lỗi', async () => {
      expect(await errorsFor({ ...valid, branch: 'a'.repeat(121) })).toContain('branch');
    });
  });
});

// ─── Back-office ─────────────────────────────────────────────────────────────

describe('UpdateContactInfoDto — PUT /contact/info', () => {
  const valid = {
    venue: { name: 'Nhà thờ họ Nguyễn', address: 'Đông Ngạc', imageUrl: null },
    channels: [{ type: 'phone', label: 'Điện thoại', value: '0988123456', href: null }],
    hours: [{ label: 'Thứ Hai – Thứ Sáu', value: '08:00 – 17:00' }],
    boardTerm: 'Nhiệm kỳ 2023 – 2028',
    responseDays: 3,
  };

  async function infoErrors(payload: Record<string, unknown>): Promise<string[]> {
    const dto = plainToInstance(UpdateContactInfoDto, payload);
    return (await validate(dto)).map((e) => e.property);
  }

  it('payload đầy đủ đi qua', async () => {
    expect(await infoErrors(valid)).toEqual([]);
  });

  it('danh sách rỗng hợp lệ — dòng họ có quyền xoá hết kênh liên lạc', async () => {
    expect(await infoErrors({ ...valid, channels: [], hours: [] })).toEqual([]);
  });

  it('venue bỏ trống / null ⇒ qua', async () => {
    expect(await infoErrors({ ...valid, venue: null })).toEqual([]);
    expect(await infoErrors({ ...valid, venue: undefined })).toEqual([]);
  });

  describe('channels[].type là ALLOWLIST, không phải gợi ý', () => {
    it.each(['address', 'phone', 'email', 'group'])('nhận %s', async (type) => {
      expect(await infoErrors({ ...valid, channels: [{ type, label: 'L', value: 'V' }] })).toEqual([]);
    });

    it('type lạ ⇒ lỗi: FE render ra thẻ không icon, không nút bấm', async () => {
      expect(
        await infoErrors({ ...valid, channels: [{ type: 'zalo', label: 'L', value: 'V' }] }),
      ).toContain('channels');
    });
  });

  it('label/value rỗng ⇒ lỗi (một thẻ trống không dựng được)', async () => {
    expect(
      await infoErrors({ ...valid, channels: [{ type: 'phone', label: '', value: 'V' }] }),
    ).toContain('channels');
    expect(
      await infoErrors({ ...valid, hours: [{ label: 'L', value: '   ' }] }),
    ).toContain('hours');
  });

  it('quá 20 kênh ⇒ lỗi: một lần gõ nhầm ở BO không được nhồi response của route public', async () => {
    const many = Array.from({ length: 21 }, () => ({ type: 'phone', label: 'L', value: 'V' }));
    expect(await infoErrors({ ...valid, channels: many })).toContain('channels');
  });

  describe('responseDays', () => {
    it.each([[0, 'không ngày nào là vô nghĩa'], [366, 'hơn một năm cũng vậy'], [1.5, 'không nguyên']])(
      'từ chối %s (%s)',
      async (responseDays) => {
        expect(await infoErrors({ ...valid, responseDays })).toContain('responseDays');
      },
    );

    it.each([1, 3, 365])('nhận %s', async (responseDays) => {
      expect(await infoErrors({ ...valid, responseDays })).toEqual([]);
    });

    it('bỏ trống ⇒ qua', async () => {
      expect(await infoErrors({ ...valid, responseDays: undefined })).toEqual([]);
    });
  });
});

describe('UpdateContactMessageStatusDto', () => {
  async function statusErrors(payload: Record<string, unknown>): Promise<string[]> {
    const dto = plainToInstance(UpdateContactMessageStatusDto, payload);
    return (await validate(dto)).map((e) => e.property);
  }

  it.each(['NEW', 'IN_PROGRESS', 'ANSWERED', 'SPAM'])('nhận %s', async (status) => {
    expect(await statusErrors({ status })).toEqual([]);
  });

  it.each(['DONE', 'new', '', undefined])('từ chối %s', async (status) => {
    expect(await statusErrors({ status })).toContain('status');
  });
});
