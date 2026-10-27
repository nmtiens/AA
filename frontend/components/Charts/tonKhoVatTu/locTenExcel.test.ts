import { describe, expect, it } from 'vitest';
import {
  boLocTuDieuKien, boLocTuKhoa, dungDanhSachMuc, khoaDangChon, khopTimKiem, moTaBoLoc, NHAN_TRONG, soSanhExcel, TEN_TRONG,
  tenThoa, thoaDieuKien, type BoLocTen, type ToanTu,
} from './locTenExcel';

// Mọi kỳ vọng dưới đây đã chạy qua AutoFilter của Excel thật (Microsoft 365, Windows en-US) — xem chú thích đầu
// locTenExcel.ts. Tên lấy từ bảng ton_kho_vt (có cả tên "VAI …" gõ không dấu: Excel tìm "vải" KHÔNG ra các tên này).
const TEN = [
  'CHỈ_VẢI MÀU THEO MẪU', 'DA 622 NERO', 'DÂY KẸP VẢI', 'VAI 10 CONCERSE', 'VAI_ALMOST TEXTURA ATX-605 DUNE_140CM',
  'VẢI 0106-KHỔ 2.8M', 'VẢI NAVY BLUE-1.4M', 'Vải lót', 'MOUSS D40', 'ĐÁ MẪU',
];
const thoa = (ds: string[], toanTu: ToanTu, giaTri: string) => ds.filter(x => thoaDieuKien(x, { toanTu, giaTri }));

describe('bộ lọc tên kiểu Excel — ô Tìm kiếm', () => {
  it('không phân biệt hoa thường, CÓ phân biệt dấu', () => {
    const tim = (t: string) => TEN.filter(x => khopTimKiem(x, t));
    expect(tim('vải')).toEqual(['CHỈ_VẢI MÀU THEO MẪU', 'DÂY KẸP VẢI', 'VẢI 0106-KHỔ 2.8M', 'VẢI NAVY BLUE-1.4M', 'Vải lót']);
    expect(tim('VAI')).toEqual(['VAI 10 CONCERSE', 'VAI_ALMOST TEXTURA ATX-605 DUNE_140CM']);
    expect(tim('da')).toEqual(['DA 622 NERO']); // không khớp "ĐÁ", "DÂY"
    expect(tim('')).toHaveLength(TEN.length);
  });
  it('gõ "-" không làm hỏng (RegExp cờ u không cho thoát "-")', () => {
    expect(khopTimKiem('VẢI 04-CREAM', '04-cream')).toBe(true);
    expect(khopTimKiem('VẢI 04 CREAM', '04-cream')).toBe(false);
    expect(thoa(['A-B', 'AB'], 'chua', '-')).toEqual(['A-B']);
    expect(thoa(['LAMINATE FORMICA-CORA CJ5667NT_1220X2440'], 'bang', 'LAMINATE FORMICA-CORA CJ5667NT_1220X2440')).toHaveLength(1);
    expect(thoa(['a(b)', 'a[b]', 'a.b', 'a/b', 'a\\b', 'a|b', 'a^b', 'a$b', 'a+b'], 'chua', '(b)')).toEqual(['a(b)']);
  });
  it('ký tự đại diện * ? và ~: ~ lấy nguyên ký tự ngay sau (kể cả chữ thường), ~ cuối bị bỏ', () => {
    expect(TEN.filter(x => khopTimKiem(x, 'v?i 0'))).toEqual(['VẢI 0106-KHỔ 2.8M']);
    expect(TEN.filter(x => khopTimKiem(x, 'vải*1.4'))).toEqual(['VẢI NAVY BLUE-1.4M']);
    expect(khopTimKiem('LAMINATE 0927HG 0.7~1X1220X2440', '0.7~1')).toBe(false); // "~1" là "1"
    expect(khopTimKiem('LAMINATE 0.71X', '0.7~1')).toBe(true);
    expect(khopTimKiem('LAMINATE 0927HG 0.7~1X1220X2440', '0.7~~1')).toBe(true);
    expect(thoa(['ax', 'ax~'], 'ketThuc', 'x~')).toEqual(['ax']);
    expect(thoa(['ax', 'ax*'], 'chua', 'x~')).toEqual(['ax*']); // "*x~*": ~ thoát dấu * của phép "chứa"
    expect(thoa(['a?b', 'axb'], 'bang', 'a~?b')).toEqual(['a?b']);
    expect(khopTimKiem('1.4', '1.4')).toBe(true);
    expect(khopTimKiem('104', '1.4')).toBe(false); // "." là chữ, không phải ký tự đại diện
  });
  it('NFD: so mẫu theo từng mã ký tự (không khớp chữ dựng sẵn); so nguyên văn thì NFD = NFC', () => {
    const nfd = 'RAY TRƯỢT 401.30.609_2500MM'.normalize('NFD');
    expect(khopTimKiem(nfd, 'trượt')).toBe(false);
    expect(thoaDieuKien(nfd, { toanTu: 'batDau', giaTri: 'ray trượt' })).toBe(false);
    expect(thoaDieuKien(nfd, { toanTu: 'bang', giaTri: 'ray trượt 401.30.609_2500mm' })).toBe(true);
  });
  it('dấu cách: bỏ dấu cách thường 2 đầu ô và cuối tiêu chí; NBSP / 2 dấu cách giữa giữ nguyên', () => {
    const O = ['M', 'M ', ' M', 'xM', 'xM ', 'M  ', 'A B', 'A  B', 'A B', 'AB', 'a b', 'M '];
    expect(thoa(O, 'ketThuc', 'M')).toEqual(['M', 'M ', ' M', 'xM', 'xM ', 'M  ']);
    expect(thoa(O, 'bang', 'M')).toEqual(['M', 'M ', ' M', 'M  ']);
    expect(thoa(O, 'bang', 'M ')).toEqual(['M', 'M ', ' M', 'M  ']);
    expect(thoa(O, 'ketThuc', ' ')).toHaveLength(O.length); // "=* " => "=*"
    expect(thoa(O, 'chua', ' M')).toEqual([]);
    expect(thoa(O, 'bang', 'A B')).toEqual(['A B', 'a b']);
    expect(thoa(O, 'bang', 'A  B')).toEqual(['A  B']);
    expect(thoa(O, 'bang', 'M ')).toEqual(['M ']);
    expect(thoa(O, 'batDau', 'M')).toEqual(['M', 'M ', ' M', 'M  ', 'M ']);
  });
});

describe('bộ lọc tên kiểu Excel — hộp Tự Lọc Tùy chỉnh', () => {
  it('bằng / bắt đầu / kết thúc / chứa và các phép "không"', () => {
    expect(thoa(TEN, 'bang', 'vải lót')).toEqual(['Vải lót']);
    expect(thoa(TEN, 'bang', 'vải')).toEqual([]);
    expect(thoa(TEN, 'bang', 'vải*')).toEqual(['VẢI 0106-KHỔ 2.8M', 'VẢI NAVY BLUE-1.4M', 'Vải lót']);
    expect(thoa(TEN, 'khongBang', 'vải lót')).toHaveLength(TEN.length - 1);
    expect(thoa(TEN, 'batDau', 'vải')).toEqual(['VẢI 0106-KHỔ 2.8M', 'VẢI NAVY BLUE-1.4M', 'Vải lót']);
    expect(thoa(TEN, 'khongBatDau', 'vải')).toHaveLength(TEN.length - 3);
    expect(thoa(TEN, 'ketThuc', 'vải')).toEqual(['DÂY KẸP VẢI']);
    expect(thoa(TEN, 'chua', 'vải')).toHaveLength(5);
    expect(thoa(TEN, 'khongChua', 'vải')).toHaveLength(TEN.length - 5);
    // tên đúng có ~: "bằng" (không * ?) so nguyên văn, giữ ~; "bắt đầu với" cùng tên đó (thêm *) thì ~1 là "1"
    const ngaBang = 'LAMINATE 0927HG 0.7~1X1220X2440';
    expect(thoa([ngaBang], 'bang', ngaBang)).toEqual([ngaBang]);
    expect(thoa([ngaBang], 'batDau', ngaBang)).toEqual([]);
    expect(thoa(['a~~b', 'a~b'], 'bang', 'a~~b')).toEqual(['a~~b']);
    expect(thoa(['a~b'], 'bang', 'A~B')).toEqual(['a~b']);
  });
  it('lớn / nhỏ hơn theo thứ tự chữ của Excel', () => {
    const lon = (a: string, b: string) => soSanhExcel(a, b) > 0;
    expect(lon('CO-OP', 'COOP')).toBe(true);
    expect(lon('VAI_ALMOST TEXTURA ATX-605 X', 'VAI_ALMOST TEXTURA ATX6')).toBe(true); // bỏ qua "-"
    expect(lon('AZ', 'Ă')).toBe(true); // Ă = A + dấu
    expect(lon('DZ', 'Đ')).toBe(true); // Đ = D + dấu
    expect(soSanhExcel('VẢI TỒN SỐ 05', 'VAI TON SO 582')).toBeLessThan(0);
    expect(soSanhExcel('VẢI_GY-LX', 'VẢI_GYLX')).toBeGreaterThanOrEqual(0);
    expect(lon('VẢI  TON 2 AADH', 'VAI TON SO 582')).toBe(true); // NBSP xếp sau dấu cách
    // Thứ tự ký hiệu đo trên Excel: cách < NBSP < tab < ! " # % & ( ) * , . / : ; @ [ \ _ | ~ + < = > ° < số < chữ;
    // A'B < A-B < A–B (bỏ qua khi so, hoà thì đứng sau "AB")
    const ky = [' ', ' ', '\t', '!', '"', '#', '%', '&', '(', ')', '*', ',', '.', '/', ':', ';', '@', '[', '\\', '_', '|', '~', '+', '<', '=', '>', '°', '0', '2', '9', 'A'];
    const ds = ky.map(c => `A${c}B`);
    expect([...ds].reverse().sort(soSanhExcel)).toEqual(ds);
    expect(["A-B", 'AB', "A'B", 'A–B', 'ABB'].sort(soSanhExcel)).toEqual(['AB', "A'B", 'A-B', 'A–B', 'ABB']);
    expect(['AĐB', 'AÐB', 'ADB', 'AØB', 'AOB', 'AZB', 'AΦB'].sort(soSanhExcel)).toEqual(['ADB', 'AĐB', 'AÐB', 'AOB', 'AØB', 'AZB', 'AΦB']);
  });
  it('so lớn nhỏ: bỏ dấu cách 2 đầu ô / cuối tiêu chí; giá trị có * ? thì ">" = không khớp, ">=" = mọi dòng, "<" = không dòng nào, "<=" = khớp', () => {
    expect(thoa([' B', 'B ', 'A'], 'lonHon', 'A ')).toEqual([' B', 'B ']);
    const O = ['A', 'AB', 'A*B', 'B', 'BA', 'S150*75', 'T'];
    expect(thoa(O, 'lonHon', 'A*')).toEqual(['B', 'BA', 'S150*75', 'T']);
    expect(thoa(O, 'lonHonBang', 'A*')).toEqual(O);
    expect(thoa(O, 'nhoHon', 'Z*')).toEqual([]);
    expect(thoa(O, 'nhoHonBang', 'S150*75')).toEqual(['S150*75']);
    expect(thoa(O, 'lonHon', 'A~*B')).toEqual(O.filter(x => x !== 'A*B'));
  });
  it('2 điều kiện Và / Hoặc; điều kiện 2 để trống thì bỏ qua', () => {
    const va: BoLocTen = { kieu: 'dk', dk1: { toanTu: 'chua', giaTri: 'vải' }, noi: 'va', dk2: { toanTu: 'khongChua', giaTri: '1.4' } };
    expect(tenThoa(TEN, va)).toEqual(['CHỈ_VẢI MÀU THEO MẪU', 'DÂY KẸP VẢI', 'VẢI 0106-KHỔ 2.8M', 'Vải lót']);
    const hoac: BoLocTen = { kieu: 'dk', dk1: { toanTu: 'batDau', giaTri: 'da ' }, noi: 'hoac', dk2: { toanTu: 'batDau', giaTri: 'mouss' } };
    expect(tenThoa(TEN, hoac)).toEqual(['DA 622 NERO', 'MOUSS D40']);
    const l = boLocTuDieuKien(TEN, { toanTu: 'chua', giaTri: 'vải' }, 'va', { toanTu: 'chua', giaTri: '' });
    expect(l.boLoc).toEqual({ kieu: 'dk', dk1: { toanTu: 'chua', giaTri: 'vải' }, noi: 'va', dk2: null });
    expect(l.ten).toHaveLength(5);
    expect(l.moTa).toBe('tên chứa “vải”');
    expect(moTaBoLoc(hoac, 2)).toBe('tên bắt đầu với “da ” hoặc bắt đầu với “mouss”');
  });
  it('như Excel, áp dụng được cả khi không tên nào thoả (biểu đồ về 0) và khi giá trị trống ("bằng" trống = tên trống)', () => {
    expect(boLocTuDieuKien(TEN, { toanTu: 'chua', giaTri: 'xyz' }, 'va', null).ten).toEqual([]);
    expect(boLocTuDieuKien([...TEN, TEN_TRONG], { toanTu: 'bang', giaTri: '' }, 'va', null).ten).toEqual([TEN_TRONG]);
  });
  it('tên trống: "(Trống)" cuối danh sách; ô tìm không ra mục trống; "không …" giữ ô trống', () => {
    const muc = dungDanhSachMuc([{ ten: TEN_TRONG, soMa: 2, conTon: true }, { ten: 'A', soMa: 1, conTon: true }]);
    expect(muc.map(m => m.hien)).toEqual(['A', NHAN_TRONG]);
    expect(thoaDieuKien(TEN_TRONG, { toanTu: 'chua', giaTri: 'k' })).toBe(false);
    expect(thoaDieuKien(TEN_TRONG, { toanTu: 'khongChua', giaTri: 'k' })).toBe(true);
    expect(khopTimKiem(TEN_TRONG, 'trống')).toBe(false);
  });
});

describe('bộ lọc tên kiểu Excel — danh sách giá trị', () => {
  const ds = [
    { ten: 'VẢI A', soMa: 1, conTon: true }, { ten: 'Vải a', soMa: 2, conTon: false },
    { ten: 'VẢI B', soMa: 1, conTon: false }, { ten: 'DA C', soMa: 3, conTon: true },
  ];
  it('gộp tên chỉ khác hoa / thường thành 1 mục, giữ đủ tên gốc để gửi máy chủ; xếp A→Z như Excel', () => {
    const muc = dungDanhSachMuc(ds);
    expect(muc.map(m => m.hien)).toEqual(['DA C', 'VẢI A', 'VẢI B']);
    expect(muc[1]).toMatchObject({ ten: ['VẢI A', 'Vải a'], soMa: 3, conTon: true });
  });
  it('chọn hết = không lọc; chọn 1 mục gộp => gửi mọi tên gốc của mục', () => {
    const muc = dungDanhSachMuc(ds);
    expect(boLocTuKhoa(muc, new Set(muc.map(m => m.khoa)))).toBeNull();
    expect(boLocTuKhoa(muc, new Set())).toBeNull();
    const l = boLocTuKhoa(muc, new Set([muc[1].khoa]))!;
    expect(l.ten).toEqual(['VẢI A', 'Vải a']);
    expect(l.moTa).toBe('1 tên đã chọn');
  });
  it('mở lại bộ lọc: ô kiểm đánh dấu đúng các mục bộ lọc đang giữ (cả bộ lọc văn bản)', () => {
    const muc = dungDanhSachMuc(ds);
    expect(khoaDangChon(muc, null).size).toBe(3);
    expect([...khoaDangChon(muc, { kieu: 'ds', ten: ['VẢI B'] })]).toEqual([muc[2].khoa]);
    expect([...khoaDangChon(muc, { kieu: 'dk', dk1: { toanTu: 'batDau', giaTri: 'vải' }, noi: 'va', dk2: null })])
      .toEqual([muc[1].khoa, muc[2].khoa]);
  });
});
