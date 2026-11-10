import { describe, it, expect, afterEach } from 'vitest';
import { setServerProjectAliases } from '../../../utils/productionMetrics';
import { maTrongTen, docThuTu, ghepThuTu, danhLaiStt, taoThuTuNhom, sapXepTheoThuTu, soSanhThuTu, sttHienThi, mauLuong, type ThuTuCongTrinh } from './thuTuNhom';

describe('docThuTu', () => {
  it('bỏ phần tử sai dạng, luồng lạ về đỏ', () => {
    expect(docThuTu([{ ten: 'A', stt: 2, luong: 'vang' }, { ten: 'B', stt: 0, luong: 'do' }, 'x', { ten: 'C', stt: 3, luong: 'xanh' }]))
      .toEqual([{ ten: 'A', stt: 2, luong: 'vang' }, { ten: 'C', stt: 3, luong: 'do' }]);
    expect(docThuTu(null)).toEqual([]);
  });
});

describe('ghepThuTu', () => {
  it('chưa lưu thì STT theo vị trí, luồng đỏ; khớp tên không phân biệt hoa/thường, khoảng trắng', () => {
    const daLuu: ThuTuCongTrinh[] = [{ ten: 'villa  bason', stt: 1, luong: 'vang' }];
    expect(ghepThuTu(['A', 'Villa Bason', 'C'], daLuu)).toEqual([
      { ten: 'A', stt: 1, luong: 'do' },
      { ten: 'Villa Bason', stt: 1, luong: 'vang' },
      { ten: 'C', stt: 3, luong: 'do' },
    ]);
  });
  it('danhLaiStt đưa về 1..n, giữ luồng', () => {
    expect(danhLaiStt([{ ten: 'A', stt: 4, luong: 'vang' }, { ten: 'B', stt: 4, luong: 'do' }]))
      .toEqual([{ ten: 'A', stt: 1, luong: 'vang' }, { ten: 'B', stt: 2, luong: 'do' }]);
  });
});

describe('taoThuTuNhom + sapXepTheoThuTu', () => {
  // Như ảnh mẫu: 2 dòng cùng số 1, 2–3 đỏ, 4+ vàng, không có số 5
  const ds = ['P1a', 'P1b', 'P2', 'P4', 'P6', 'P3'];
  const daLuu: ThuTuCongTrinh[] = [
    { ten: 'P1a', stt: 1, luong: 'do' }, { ten: 'P1b', stt: 1, luong: 'do' }, { ten: 'P2', stt: 2, luong: 'do' },
    { ten: 'P4', stt: 4, luong: 'vang' }, { ten: 'P6', stt: 6, luong: 'vang' }, { ten: 'P3', stt: 3, luong: 'do' },
  ];
  const tra = taoThuTuNhom(ds, daLuu);

  it('tra theo tên chuẩn; ngoài danh sách = null', () => {
    expect(tra('p4')).toEqual({ stt: 4, luong: 'vang', viTri: 3 });
    expect(tra('Khác')).toBeNull();
    expect(tra(undefined)).toBeNull();
  });

  it('trong danh sách lên trước theo STT (trùng thì theo vị trí), ngoài danh sách giữ thứ tự cũ phía sau', () => {
    const rows = ['Z', 'P6', 'P1b', 'Y', 'P3', 'P1a', 'P4', 'P2', 'X'].map(ten => ({ ten }));
    expect(sapXepTheoThuTu(rows, r => r.ten, tra).map(r => r.ten))
      .toEqual(['P1a', 'P1b', 'P2', 'P3', 'P4', 'P6', 'Z', 'Y', 'X']);
    expect(rows[0].ten).toBe('Z');
  });

  it('chưa có thứ tự lưu thì xếp theo vị trí trong danh sách', () => {
    const t = taoThuTuNhom(['B', 'A'], []);
    expect(sapXepTheoThuTu(['A', 'C', 'B'], x => x, t)).toEqual(['B', 'A', 'C']);
  });
});

describe('soSanhThuTu + sttHienThi', () => {
  const tra = (stt: number, viTri: number) => ({ stt, luong: 'do' as const, viTri });
  it('trong danh sách lên trước, ngoài danh sách trả 0', () => {
    expect(soSanhThuTu(tra(1, 3), tra(2, 0))).toBeLessThan(0);
    expect(soSanhThuTu(tra(1, 3), tra(1, 0))).toBeGreaterThan(0);
    expect(soSanhThuTu(null, tra(9, 9))).toBe(1);
    expect(soSanhThuTu(tra(9, 9), null)).toBe(-1);
    expect(soSanhThuTu(null, null)).toBe(0);
  });
  it('STT người dùng (trùng, thiếu số), ngoài luồng đánh tiếp', () => {
    expect(sttHienThi([tra(1, 0), tra(1, 1), tra(2, 2), tra(4, 3), tra(6, 4), null, null])).toEqual([1, 1, 2, 4, 6, 7, 8]);
    expect(sttHienThi([null, null, null])).toEqual([1, 2, 3]);
  });
  it('mauLuong: ngoài luồng null', () => {
    expect(mauLuong(null)).toBeNull();
    expect(mauLuong({ stt: 1, luong: 'vang', viTri: 0 })?.nen).toBe('bg-yellow-100');
  });
});

describe('khớp theo mã CTxx-xxx', () => {
  const R61 = 'ST.REGIS_ĐẠI TRÀ-HOÀN THIỆN NỘI THẤT_CT26-061';
  const R143 = 'ST.REGIS_ĐẠI TRÀ_HTNT_KHU PUBLIC_CT26-143';
  afterEach(() => setServerProjectAliases([]));

  it('maTrongTen lấy mã cuối, chuẩn hoá', () => {
    expect(maTrongTen(R61)).toBe('CT26-061');
    expect(maTrongTen('SOVANNY (ct21-084)')).toBe('CT21-084');
    expect(maTrongTen('PO26-001 VĂN PHÒNG ORIX')).toBe('PO26-001');
    expect(maTrongTen('NHÀ XINH')).toBe('');
  });

  it('bảng tên phụ gộp nhầm 2 mã => không coi là 1 công trình (STT 12 chỉ cho CT26-061)', () => {
    // bảng tên tự dựng qua HEX: tên CT26-143 -> tên chuẩn của CT26-061
    setServerProjectAliases([{ k: R143.toUpperCase(), c: R61 }]);
    const tra = taoThuTuNhom(['A_CT26-001', R61], [{ ten: R61, stt: 12, luong: 'do' }]);
    expect(tra(R61)).toEqual({ stt: 12, luong: 'do', viTri: 1 });
    expect(tra(R143)).toBeNull();
  });

  it('cùng mã khác cách viết vẫn khớp; tên không mã vẫn khớp qua bảng tên phụ', () => {
    setServerProjectAliases([{ k: 'ST REGIS ĐẠI TRÀ', c: R61 }]);
    const tra = taoThuTuNhom([R61], [{ ten: R61, stt: 3, luong: 'vang' }]);
    expect(tra('ST.REGIS HTNT CT26-061')).toEqual({ stt: 3, luong: 'vang', viTri: 0 });
    expect(tra('st regis đại trà')).toEqual({ stt: 3, luong: 'vang', viTri: 0 });
  });

  it('ghepThuTu: dòng lưu của mã khác không đè lên công trình', () => {
    setServerProjectAliases([{ k: R143.toUpperCase(), c: R61 }]);
    expect(ghepThuTu([R143], [{ ten: R61, stt: 12, luong: 'vang' }])).toEqual([{ ten: R143, stt: 1, luong: 'do' }]);
  });
});
