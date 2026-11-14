import { describe, it, expect } from 'vitest';
import { docNgayNhap, docDan, ngayNhom, duocNhap, CONG_DOAN_BOT } from './botCongDoan';

describe('docNgayNhap', () => {
  it('nhận các dạng ngày thường gặp', () => {
    expect(docNgayNhap('30/11/2026')).toBe('2026-11-30');
    expect(docNgayNhap('3/1/27')).toBe('2027-01-03');
    expect(docNgayNhap('30.11.2026')).toBe('2026-11-30');
    expect(docNgayNhap('2026-11-30')).toBe('2026-11-30');
    expect(docNgayNhap('46356')).toBe('2026-11-30');
  });
  it('trống => null, sai => undefined', () => {
    expect(docNgayNhap('')).toBeNull();
    expect(docNgayNhap('31/02/2026')).toBeUndefined();
    expect(docNgayNhap('abc')).toBeUndefined();
  });
});

describe('docDan (dán từ Excel)', () => {
  it('có tiêu đề HEX + nhiều cột công đoạn; ô trống bỏ qua, "xoá" = xoá', () => {
    const kq = docDan('HEX\tTên\tBOT P014\tP022\n260000001\tBàn\t30/11/2026\t\n260000002\tGhế\txoá\t15/12/2026\n', null);
    expect(kq.ghi).toEqual([
      { hex: '260000001', congDoan: 'P014', dot: 'cuoi', ngay: '2026-11-30' },
      { hex: '260000002', congDoan: 'P014', dot: 'cuoi', ngay: null },
      { hex: '260000002', congDoan: 'P022', dot: 'cuoi', ngay: '2026-12-15' },
    ]);
    expect(kq.loi).toEqual([]);
  });
  it('không tiêu đề: 2 cột HEX + ngày cho công đoạn đã chọn; báo dòng lỗi', () => {
    const kq = docDan('260000001\t30/11/2026\nabc\t1/1/2027\n260000003\t99/99/2026', 'P002');
    expect(kq.ghi).toEqual([{ hex: '260000001', congDoan: 'P002', dot: 'cuoi', ngay: '2026-11-30' }]);
    expect(kq.loi.map(x => x.dong)).toEqual([2, 3]);
  });
  it('tiêu đề "HEX CODE" vẫn nhận; tiêu đề không có HEX => báo, không đoán', () => {
    expect(docDan('HEX CODE\tP014\n260000001\t30/11/2026', 'P001').ghi).toEqual([{ hex: '260000001', congDoan: 'P014', dot: 'cuoi', ngay: '2026-11-30' }]);
    expect(docDan('Mã\tP014\n260000001\t30/11/2026', 'P001').loi[0].lyDo).toMatch(/không có cột HEX/);
  });
  it('không tiêu đề mà dòng nhiều cột => báo (không ghi nhầm công đoạn); HEX bỏ số 0 đầu', () => {
    const kq = docDan('260000001\t30/11/2026\t15/12/2026\n0260000002\t30/11/2026', 'P001');
    expect(kq.loi.map(x => x.dong)).toEqual([1]);
    expect(kq.ghi).toEqual([{ hex: '260000002', congDoan: 'P001', dot: 'cuoi', ngay: '2026-11-30' }]);
  });
  it('tiêu đề có đợt: "P014 ĐẦU" / "P014_CUỐI" / "BOT P022 đợt đầu"; 2 cột theo đợt đã chọn', () => {
    expect(docDan('HEX\tP014 ĐẦU\tP014_CUỐI\tBOT P022 đợt đầu\n260000001\t1/11/2026\t30/11/2026\t5/12/2026', null).ghi).toEqual([
      { hex: '260000001', congDoan: 'P014', dot: 'dau', ngay: '2026-11-01' },
      { hex: '260000001', congDoan: 'P014', dot: 'cuoi', ngay: '2026-11-30' },
      { hex: '260000001', congDoan: 'P022', dot: 'dau', ngay: '2026-12-05' },
    ]);
    expect(docDan('260000001\t1/11/2026', 'P002', 'dau').ghi).toEqual([{ hex: '260000001', congDoan: 'P002', dot: 'dau', ngay: '2026-11-01' }]);
  });
  it('không tiêu đề và chưa chọn công đoạn => báo', () => {
    expect(docDan('260000001\t30/11/2026', null).loi[0].lyDo).toMatch(/Chọn công đoạn/);
  });
});

describe('ngayNhom', () => {
  const ngay = { a: { P014: '2026-11-30' }, b: { P014: '2026-11-30' }, c: { P014: '2026-12-05' } };
  it('cùng ngày / khác ngày / thiếu', () => {
    expect(ngayNhom(['a', 'b'], 'P014', ngay)).toMatchObject({ ngay: '2026-11-30', co: 2, tong: 2 });
    expect(ngayNhom(['a', 'c', 'd'], 'P014', ngay)).toMatchObject({ ngay: null, tu: '2026-11-30', den: '2026-12-05', co: 2, tong: 3 });
    expect(ngayNhom(['d'], 'P014', ngay)).toMatchObject({ ngay: null, co: 0 });
  });
});

describe('duocNhap', () => {
  it('như máy chủ: ADMIN mọi ô; bộ phận theo công đoạn + xưởng', () => {
    expect(duocNhap({ admin: true, boPhan: null, congDoan: [], xuong: null }, 'P022', '4A')).toBe(true);
    const x5 = { admin: false, boPhan: 'X5', congDoan: ['P014'], xuong: ['5A'] };
    expect(duocNhap(x5, 'P014', ' 5a ')).toBe(true);
    expect(duocNhap(x5, 'P014', '4A')).toBe(false);
    expect(duocNhap(x5, 'P016', '5A')).toBe(false);
    expect(duocNhap(null, 'P014', '5A')).toBe(false);
  });
});

describe('docDan — tiêu đề 2 dòng (file mẫu gộp ô)', () => {
  it('dòng 1 công đoạn gộp 2 cột, dòng 2 ĐẦU / CUỐI', () => {
    const td1 = ['HEX', 'CÔNG TRÌNH', 'HẠNG MỤC', ...CONG_DOAN_BOT.flatMap(c => [c, ''])];
    const td2 = ['', '', '', ...CONG_DOAN_BOT.flatMap(() => ['ĐẦU', 'CUỐI'])];
    const dong = ['260815398', 'CT A', 'TỦ', ...CONG_DOAN_BOT.flatMap((_, i) => [`${String(i + 1).padStart(2, '0')}/11/2026`, i === 0 ? 'xoá' : ''])];
    const kq = docDan([td1, td2, dong].map(x => x.join('\t')).join('\n'), null);
    expect(kq.loi).toEqual([]);
    expect(kq.ghi.filter(x => x.dot === 'dau').map(x => x.congDoan)).toEqual([...CONG_DOAN_BOT]);
    expect(kq.ghi.find(x => x.congDoan === 'P014' && x.dot === 'dau')?.ngay).toBe('2026-11-06');
    expect(kq.ghi.filter(x => x.dot === 'cuoi')).toEqual([{ hex: '260815398', congDoan: 'P001', dot: 'cuoi', ngay: null }]);
  });
  it('tiêu đề 1 dòng vẫn như cũ; dòng 2 là dữ liệu thì không coi là tiêu đề', () => {
    const kq = docDan('HEX\tP014 ĐẦU\tP014\n260815398\t20/11/2026\t30/11/2026', null);
    expect(kq.ghi.map(x => [x.dot, x.ngay])).toEqual([['dau', '2026-11-20'], ['cuoi', '2026-11-30']]);
  });
});
