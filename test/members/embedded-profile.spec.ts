import { readFileSync } from 'fs';
import { join } from 'path';
import { PROFILE_CONTACT_FIELDS } from '../../src/members/members.select';

/**
 * `include: { profile: true }` là cách duy nhất để 4 cột liên lạc lọt ra ngoài
 * mà không qua kiểm tra role. Nó từng có ở graves/events/relationships — và ba
 * trong số các route đó là @Public(), tức là phone/address của cả dòng họ đang
 * trả cho người CHƯA đăng nhập.
 *
 * Test này quét mã nguồn thay vì mock từng service: nó bắt được cả những
 * endpoint sẽ được viết trong tương lai, thứ mà spec theo từng hàm bỏ sót.
 */
const SRC = join(__dirname, '../../src');

const GUARDED_SERVICES = [
  'graves/graves.service.ts',
  'events/events.service.ts',
  'relationships/relationships.service.ts',
  'tree/tree.service.ts',
  'members/members.service.ts',
];

describe('Không nhúng profile thô ở service nào', () => {
  it.each(GUARDED_SERVICES)('%s không dùng `profile: true`', (relative) => {
    const source = readFileSync(join(SRC, relative), 'utf8');
    const offenders = source
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      // Bỏ qua comment — chỉ code thật mới rò dữ liệu.
      .filter(([, line]) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .filter(([, line]) => /profile:\s*true/.test(line))
      // members.service dùng một lần trong updateMemberProfile — read NỘI BỘ để
      // biết profile có tồn tại không, giá trị không đi ra response.
      // Một ngoại lệ được đánh dấu tường minh: read NỘI BỘ trong
      // updateMemberProfile chỉ để biết profile có tồn tại, không ra response.
      .filter(([, line]) => !line.includes('// đọc nội bộ'));

    expect(offenders).toEqual([]);
  });

  it('PROFILE_CONTACT_FIELDS đúng 4 cột đang được bảo vệ', () => {
    expect([...PROFILE_CONTACT_FIELDS]).toEqual(['phone', 'contactEmail', 'address', 'notes']);
  });
});
