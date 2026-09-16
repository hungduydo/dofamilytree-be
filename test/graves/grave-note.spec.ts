import { graveNameFor, parseGraveNote } from '../../src/graves/grave-note';

describe('parseGraveNote', () => {
  it.each([
    ['Mộ: Đùng Vành. Kỵ: không rõ.', { place: 'Đùng Vành' }],
    ['Sinh năm 1920.\nMộ: Lăng tập thể Cồn Choi.\r\n', { place: 'Lăng tập thể Cồn Choi' }],
    ['Mộ: Làng Phương Ngạn, Triệu Phong, Quảng Trị. Kỵ: 03.3 Âm lịch.', { place: 'Làng Phương Ngạn, Triệu Phong, Quảng Trị' }],
    ['Mộ: Nghĩa trang phía Nam Tp. Huế. Kỵ: không rõ.', { place: 'Nghĩa trang phía Nam Tp. Huế' }],
    ['Mộ: P. 7, Q. 3, TP. HCM.', { place: 'P. 7, Q. 3, TP. HCM' }],
    ['Mộ:  Khu âm hồn   Đùng Lăng', { place: 'Khu âm hồn Đùng Lăng' }],
    ['Mộ: không rõ. Kỵ: 24.4 Âm lịch.', 'unknown'],
    ['Mộ: Không rõ\r', 'unknown'],
    ['Mộ: .', 'unknown'],
    ['Mộ phần đã cải táng', null],
    [null, null],
  ])('%j', (text, expected) => {
    expect(parseGraveNote(text)).toEqual(expected);
  });

  it('đặt tên mộ theo thành viên', () => {
    expect(graveNameFor('Đỗ Khắc Sắt')).toBe('Mộ Đỗ Khắc Sắt');
  });
});
