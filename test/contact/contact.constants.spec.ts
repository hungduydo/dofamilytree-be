import {
  CONTACT_ACTIVE_STATUSES,
  CONTACT_ATTACHMENTS_MAX,
  CONTACT_ATTACHMENT_MAX_BYTES,
  CONTACT_CONTENT_MAX_LENGTH,
  CONTACT_CONTENT_MIN_LENGTH,
  CONTACT_PHONE_PATTERN,
  CONTACT_STATUSES,
  CONTACT_TOPICS,
  contactStorageKey,
  generateReferenceCode,
  hashIp,
  isAllowedContactMime,
} from '../../src/contact/contact.constants';

/**
 * Những con số và mẫu ở đây là BẢN SAO của frontend/src/lib/contactView.ts.
 * Spec này là chỗ phát hiện hai bên lệch nhau — lệch một con số nghĩa là người
 * dùng gõ xong mới ăn 400.
 */
describe('Contact — hằng số và helper', () => {
  describe('Enum là hợp đồng với FE', () => {
    it('CONTACT_TOPICS khớp CHÍNH XÁC contactView.ts', () => {
      expect(CONTACT_TOPICS).toEqual(['GENEALOGY', 'GRAVE', 'EVENT', 'SCHOLARSHIP', 'OTHER']);
    });

    it('CONTACT_STATUSES phủ trọn vòng đời một lá thư', () => {
      expect(CONTACT_STATUSES).toEqual(['NEW', 'IN_PROGRESS', 'ANSWERED', 'SPAM', 'DELETED']);
    });

    it('CONTACT_ACTIVE_STATUSES = mọi thứ TRỪ DELETED', () => {
      // Hộp thư mặc định dựng từ danh sách này; thiếu bước loại DELETED thì
      // thư đã xoá mềm vẫn hiện ra như chưa xoá.
      expect(CONTACT_ACTIVE_STATUSES).toEqual(['NEW', 'IN_PROGRESS', 'ANSWERED', 'SPAM']);
      expect(CONTACT_ACTIVE_STATUSES).not.toContain('DELETED');
    });
  });

  describe('Biên độ khớp FE', () => {
    it('nội dung 20–2000 ký tự', () => {
      expect(CONTACT_CONTENT_MIN_LENGTH).toBe(20);
      expect(CONTACT_CONTENT_MAX_LENGTH).toBe(2000);
    });

    it('tối đa 3 tệp, mỗi tệp 4,5 MB — KHÔNG phải 10 MB như mockup', () => {
      expect(CONTACT_ATTACHMENTS_MAX).toBe(3);
      expect(CONTACT_ATTACHMENT_MAX_BYTES).toBe(4.5 * 1024 * 1024);
    });
  });

  describe('CONTACT_PHONE_PATTERN', () => {
    it.each([
      ['0988123456', 'số di động thường gặp'],
      ['0988 123 456', 'có khoảng trắng'],
      ['0988.123.456', 'có dấu chấm'],
      ['0988-123-456', 'có gạch ngang'],
      ['+84988123456', 'dạng quốc tế'],
      ['+84 988 123 456', 'quốc tế có khoảng trắng'],
      ['02439330000', 'số cố định Hà Nội'],
    ])('nhận %s (%s)', (phone) => {
      expect(CONTACT_PHONE_PATTERN.test(phone)).toBe(true);
    });

    it.each([
      ['', 'rỗng'],
      ['0988', 'quá ngắn'],
      ['1988123456', 'không bắt đầu bằng 0 hoặc +84'],
      ['+8498812345678901', 'quá dài — hơn 13 ký tự sau tiền tố'],
      ['0988abc456', 'có chữ cái'],
    ])('từ chối %s (%s)', (phone) => {
      expect(CONTACT_PHONE_PATTERN.test(phone)).toBe(false);
    });
  });

  describe('isAllowedContactMime — allowlist HẸP cho endpoint không có guard', () => {
    it.each(['image/jpeg', 'image/png', 'application/pdf'])('nhận %s', (mime) => {
      expect(isAllowedContactMime(mime)).toBe(true);
    });

    it.each([
      'image/svg+xml', // SVG chứa được script
      'text/html',
      'application/x-msdownload',
      'video/mp4', // media cho phép, contact thì KHÔNG
      'image/gif',
    ])('từ chối %s', (mime) => {
      expect(isAllowedContactMime(mime)).toBe(false);
    });

    it('thiếu mimetype ⇒ từ chối (fail closed)', () => {
      expect(isAllowedContactMime(undefined)).toBe(false);
      expect(isAllowedContactMime('')).toBe(false);
    });
  });

  describe('generateReferenceCode', () => {
    it('đúng dạng LH-<YYMM>-<4 ký tự base32>', () => {
      expect(generateReferenceCode()).toMatch(/^LH-\d{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    });

    it('KHÔNG chứa I, L, O, U — bốn ký tự dễ đọc nhầm qua điện thoại', () => {
      const suffixes = Array.from({ length: 300 }, () => generateReferenceCode().slice(-4)).join('');
      expect(suffixes).not.toMatch(/[ILOU]/);
    });

    it('lấy YYMM theo GIỜ VIỆT NAM, không phải UTC', () => {
      // 2026-09-30T18:00Z là 2026-10-01T01:00 giờ VN ⇒ phải ra tháng 10 (2610).
      expect(generateReferenceCode(new Date('2026-09-30T18:00:00Z'))).toMatch(/^LH-2610-/);
      expect(generateReferenceCode(new Date('2026-09-30T10:00:00Z'))).toMatch(/^LH-2609-/);
    });

    it('ngẫu nhiên, KHÔNG tuần tự — mã tuần tự làm lộ lưu lượng hộp thư', () => {
      const codes = new Set(Array.from({ length: 200 }, () => generateReferenceCode()));
      // 32^4 ≈ 1,05 triệu tổ hợp ⇒ 200 mã gần như chắc chắn không trùng nhau.
      expect(codes.size).toBeGreaterThan(190);
    });
  });

  describe('contactStorageKey', () => {
    it('đặt tệp dưới contact/<messageId>/', () => {
      expect(contactStorageKey('abc-123', 'don.pdf')).toBe('contact/abc-123/don.pdf');
    });

    it('bỏ dấu tiếng Việt và khoảng trắng — key nằm trong URL public', () => {
      expect(contactStorageKey('m1', 'Đơn xin bổ sung gia phả.pdf')).toBe(
        'contact/m1/Don-xin-bo-sung-gia-pha.pdf',
      );
    });

    it('tên toàn ký tự lạ vẫn ra key dùng được', () => {
      expect(contactStorageKey('m1', '###')).toBe('contact/m1/file');
    });

    it('giữ nguyên chữ Đ/đ — NFD KHÔNG tách được U+0110', () => {
      // Không có bước thay Đ→D riêng thì chữ cái đầu bị xoá hẳn: "Đơn" → "on".
      expect(contactStorageKey('m1', 'Đơn.pdf')).toBe('contact/m1/Don.pdf');
      expect(contactStorageKey('m1', 'đình.pdf')).toBe('contact/m1/dinh.pdf');
    });

    it('chặn path traversal — tệp luôn nằm TRONG thư mục của tin nhắn', () => {
      // `/` đã bị thay bằng `-` nên không leo ra ngoài được; điều PHẢI đúng là
      // key không sinh thêm đoạn đường dẫn nào ngoài prefix.
      const key = contactStorageKey('m1', '../../etc/passwd');
      expect(key.startsWith('contact/m1/')).toBe(true);
      expect(key.split('/')).toHaveLength(3);
    });

    it('tên tệp đúng bằng ".." không sinh key trỏ lên thư mục cha', () => {
      expect(contactStorageKey('m1', '..')).toBe('contact/m1/file');
    });
  });

  describe('hashIp', () => {
    it('cùng IP + cùng muối ⇒ cùng hash (gom cụm được)', () => {
      expect(hashIp('1.2.3.4', 's')).toBe(hashIp('1.2.3.4', 's'));
    });

    it('đổi muối ⇒ đổi hash: muối là thứ chặn tra ngược bảng IPv4', () => {
      expect(hashIp('1.2.3.4', 's1')).not.toBe(hashIp('1.2.3.4', 's2'));
    });

    it('không bao giờ chứa lại địa chỉ IP gốc', () => {
      expect(hashIp('1.2.3.4', 's')).not.toContain('1.2.3.4');
    });
  });
});
