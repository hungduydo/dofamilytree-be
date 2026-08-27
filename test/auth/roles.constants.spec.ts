import {
  ROLE_ORDER,
  Role,
  roleRank,
  highestRole,
  hasAtLeast,
  canViewContactPii,
  AVAILABLE_ROLES,
} from '../../src/auth/roles.constants';

describe('roles.constants', () => {
  describe('highestRole', () => {
    it('rỗng / null / undefined → guest', () => {
      expect(highestRole([])).toBe('guest');
      expect(highestRole(null)).toBe('guest');
      expect(highestRole(undefined)).toBe('guest');
    });

    it("'viewer' (role đã bỏ) rơi về guest, KHÔNG được nâng quyền", () => {
      expect(highestRole(['viewer'])).toBe('guest');
      expect(roleRank('viewer')).toBe(-1);
    });

    it('nhiều role → cao nhất thắng, không phụ thuộc thứ tự', () => {
      expect(highestRole(['member', 'admin'])).toBe('admin');
      expect(highestRole(['admin', 'member'])).toBe('admin');
      expect(highestRole(['guest', 'editor', 'member'])).toBe('editor');
    });

    it('role lạ lẫn role thật → lấy role thật', () => {
      expect(highestRole(['superuser', 'member'])).toBe('member');
    });
  });

  describe('hasAtLeast — ma trận đầy đủ', () => {
    it.each(ROLE_ORDER)('role %s thoả đúng những mức ≤ chính nó', (actual: Role) => {
      for (const required of ROLE_ORDER) {
        const expected = ROLE_ORDER.indexOf(actual) >= ROLE_ORDER.indexOf(required);
        expect(hasAtLeast([actual], required)).toBe(expected);
      }
    });

    it('không có role nào → chỉ thoả guest', () => {
      expect(hasAtLeast([], 'guest')).toBe(true);
      expect(hasAtLeast([], 'member')).toBe(false);
    });
  });

  describe('canViewContactPii — quy tắc KHÔNG đơn điệu', () => {
    // Đây là bẫy lớn nhất của hệ role này: editor xếp TRÊN member về quyền ghi
    // nhưng là người ngoài dòng họ nên KHÔNG được xem thông tin liên lạc. Viết
    // PII bằng hasAtLeast(roles,'member') sẽ âm thầm cấp PII cho editor.
    it('editor: quyền ghi ≥ member NHƯNG không được xem PII', () => {
      expect(hasAtLeast(['editor'], 'member')).toBe(true);
      expect(canViewContactPii(['editor'])).toBe(false);
    });

    it('chỉ member và admin xem được PII', () => {
      expect(canViewContactPii(['guest'])).toBe(false);
      expect(canViewContactPii(['member'])).toBe(true);
      expect(canViewContactPii(['admin'])).toBe(true);
      expect(canViewContactPii([])).toBe(false);
    });
  });

  describe('AVAILABLE_ROLES (GET /auth/roles)', () => {
    it("không còn 'viewer' và khớp đúng ROLE_ORDER", () => {
      expect(AVAILABLE_ROLES.map((r) => r.name)).toEqual([...ROLE_ORDER]);
    });
  });
});
