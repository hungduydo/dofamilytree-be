import {
  DECEASED_WHERE,
  deriveLifeStatus,
  hasRealDeathDate,
  isLifeStatus,
  parseBirthYear,
} from '../../src/members/life-status';

const NOW = new Date('2026-09-14T00:00:00Z');

describe('life-status', () => {
  it('DECEASED_WHERE khớp mệnh đề WHERE của members_deceased_order_idx_v2', () => {
    expect(DECEASED_WHERE).toEqual({ lifeStatus: 'DECEASED' });
  });

  it.each([
    [null, false],
    [undefined, false],
    ['', false],
    ['   ', false],
    ['1905', true],
    ['1905-01-01', true],
  ])('hasRealDeathDate(%p) = %p', (value, expected) => {
    expect(hasRealDeathDate(value as string | null | undefined)).toBe(expected);
  });

  it.each([
    ['1990-01-01', 1990],
    ['1850', 1850],
    ['không rõ', null],
    ['', null],
    [null, null],
  ])('parseBirthYear(%p) = %p', (value, expected) => {
    expect(parseBirthYear(value as string | null)).toBe(expected);
  });

  it('isLifeStatus chỉ nhận 3 giá trị hợp lệ', () => {
    expect(isLifeStatus('ALIVE')).toBe(true);
    expect(isLifeStatus('alive')).toBe(false);
    expect(isLifeStatus(undefined)).toBe(false);
  });

  describe('deriveLifeStatus', () => {
    it('có ngày mất thật → DECEASED', () => {
      expect(deriveLifeStatus({ deathDate: '1990' }, { now: NOW })).toEqual({
        status: 'DECEASED',
        reason: 'deathDate',
      });
    });

    it('ngày mất rỗng/khoảng trắng KHÔNG phải ngày mất', () => {
      expect(deriveLifeStatus({ deathDate: '  ' }, { now: NOW }).status).toBe('UNKNOWN');
    });

    it('không bao giờ tự suy ra ALIVE', () => {
      expect(deriveLifeStatus({ birthDate: '2000-01-01' }, { now: NOW }).status).toBe('UNKNOWN');
    });

    it('ranh giới tuổi: sinh cách đây 111 năm → DECEASED, 110 năm → UNKNOWN', () => {
      expect(deriveLifeStatus({ birthDate: '1915' }, { now: NOW })).toEqual({
        status: 'DECEASED',
        reason: 'age',
      });
      expect(deriveLifeStatus({ birthDate: '1916' }, { now: NOW }).status).toBe('UNKNOWN');
    });

    it('birthDate không đọc được → UNKNOWN', () => {
      expect(deriveLifeStatus({ birthDate: 'không rõ' }, { now: NOW }).status).toBe('UNKNOWN');
    });

    it('quy tắc đời chỉ bật khi truyền ancestorMaxGeneration', () => {
      expect(deriveLifeStatus({ generation: 3 }, { now: NOW }).status).toBe('UNKNOWN');
      expect(deriveLifeStatus({ generation: 13 }, { now: NOW, ancestorMaxGeneration: 13 })).toEqual({
        status: 'DECEASED',
        reason: 'generation',
      });
      expect(
        deriveLifeStatus({ generation: 14 }, { now: NOW, ancestorMaxGeneration: 13 }).status,
      ).toBe('UNKNOWN');
      expect(
        deriveLifeStatus({ generation: null }, { now: NOW, ancestorMaxGeneration: 13 }).status,
      ).toBe('UNKNOWN');
    });
  });
});
