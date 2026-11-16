import { describe, it, expect } from 'vitest';
import type { DataRow, ColumnDefinition } from '../../../types';
import { dwellBucket } from '../../../utils/productionMetrics';
import { phuViTriMra, nhanTheoMa, soNgayTuMoc, demNguonBop, NHAN_DU_PHONG, type BanDoMra, type ViTriMra } from './viTriMra';
import { tinhTongQuanSanXuat, DEFAULT_FILTERS, TUY_CHON_MAC_DINH } from './tongQuanSanXuat';
import { extractStage, ON_LINE_STAGES, remainBucketOf } from './stages';
import { taoBanGhi } from '../../Construction/core/banGhiCongTrinh';
import { mucBopTuDong } from '../../Construction/core/bopPivot';

const NGAY = 86_400_000;
const NOW = Date.parse('2026-11-11T05:00:00Z');
const truoc = (ngay: number) => new Date(NOW - ngay * NGAY).toISOString();

const dong = (p: Partial<Record<string, unknown>>): DataRow => ({
  hex: 'H00000001', ten_cong_trinh: 'CT A', xuong_chinh: '3A', tinh_trang: '05. MỘC', tinh_trang_ipo: '01. ĐANG SẢN XUẤT',
  bop: 'P013. RA PHÔI SƠ CHẾ', so_ngay_cd_hien_tai: 'TỪ 8 TUẦN TRỞ LÊN', tri_gia_don_hang_tong: 100,
  thanh_tien_nhap_kho_luy_ke: 0, thanh_tien_tinh_phieu: 100, ...p,
} as DataRow);
const cotCua = (rows: DataRow[]) => Object.keys(rows[0]).map(key => ({ key, label: key })) as ColumnDefinition[];
const vt = (ma: ViTriMra['ma'], tuNgay: number | null = 2, cd = ['MỘC']): ViTriMra =>
  ({ ma, tu: tuNgay == null ? null : truoc(tuNgay), cd, trangThai: 'dang_lam' });
const ban = (map: Record<string, ViTriMra>): BanDoMra => ({ ver: 'v1', map });

describe('soNgayTuMoc', () => {
  it('đúng các mốc ngày như file PC', () => {
    const bang: [number, string][] = [
      [0, '<3 NGÀY'], [3, '<3 NGÀY'], [4, '4-7 NGÀY'], [7, '4-7 NGÀY'], [8, '2 TUẦN'], [14, '2 TUẦN'],
      [15, '3 TUẦN'], [21, '3 TUẦN'], [22, '4 TUẦN'], [55, '7 TUẦN'], [56, 'TỪ 8 TUẦN TRỞ LÊN'],
    ];
    for (const [d, s] of bang) expect(soNgayTuMoc(truoc(d), NOW), `${d} ngày`).toBe(s);
  });
  it('mốc trống / sai ra "0"', () => {
    expect(soNgayTuMoc(null, NOW)).toBe('0');
    expect(soNgayTuMoc('abc', NOW)).toBe('0');
  });
  it('vào đúng nhóm điểm nghẽn', () => {
    const bang: [number | null, string][] = [
      [0, '<3 NGÀY'], [3, '<3 NGÀY'], [4, '4-7 NGÀY'], [7, '4-7 NGÀY'], [8, '2 tuần'], [14, '2 tuần'],
      [15, '3 tuần'], [21, '3 tuần'], [22, 'Từ 4 tuần trở lên'], [55, 'Từ 4 tuần trở lên'], [56, 'Từ 4 tuần trở lên'],
      [null, 'Chưa có số ngày'],
    ];
    for (const [d, nhom] of bang) expect(dwellBucket(soNgayTuMoc(d == null ? null : truoc(d), NOW)), `${d} ngày`).toBe(nhom);
  });
});

describe('nhanTheoMa', () => {
  it('lấy chuỗi PC hay gặp nhất, thiếu thì dùng nhãn dự phòng', () => {
    const rows = [dong({ bop: 'P016. LẮP RÁP' }), dong({ bop: 'P016. LẮP RÁP' }), dong({ bop: 'P016 lắp ráp' }), dong({ bop: '' })];
    const nhan = nhanTheoMa(rows, 'bop');
    expect(nhan.get('P016')).toBe('P016. LẮP RÁP');
    expect(nhan.get('P013')).toBe(NHAN_DU_PHONG.P013);
  });
});

describe('phuViTriMra', () => {
  const ROWS = [
    dong({ hex: 'H1', bop: 'P013. RA PHÔI SƠ CHẾ' }),
    dong({ hex: 'H2', bop: 'P016. LẮP RÁP TINH CHỈNH' }),
    dong({ hex: 'H3', bop: 'P001. CHƯA TRIỂN KHAI', tinh_trang: '11. CHƯA SX' }),
    dong({ hex: 'H4', bop: 'P002. BẢN VẼ KỸ THUẬT' }),
    dong({ hex: 'H5', bop: 'P022. TỒN KHO' }),
    dong({ hex: 'H6', bop: 'P025. ĐÃ GIAO' }),
    dong({ hex: 'H7', bop: 'GCVT' }),
    dong({ hex: 'H8', tinh_trang_ipo: '04. HỦY ĐƠN' }),
    dong({ hex: 'H9', bop: '' }),
    dong({ hex: 'H10', bop: 'P018. SƠN' }),
  ];
  const COLS = cotCua(ROWS);
  const BAN = ban(Object.fromEntries(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9'].map(h => [h, vt('P016')])));

  it('map rỗng / null trả đúng mảng cũ', () => {
    expect(phuViTriMra(ROWS, COLS, null, NOW).rows).toBe(ROWS);
    expect(phuViTriMra(ROWS, COLS, ban({}), NOW).rows).toBe(ROWS);
    expect(phuViTriMra(ROWS, COLS, ban({ KHAC: vt('P013') }), NOW)).toEqual({ rows: ROWS, soPhu: 0 });
  });

  it('phủ P001/P002 (đã triển khai trên MRA); không phủ P022/P025/GCVT và dòng HỦY', () => {
    const { rows, soPhu } = phuViTriMra(ROWS, COLS, BAN, NOW);
    const nguon = Object.fromEntries(rows.map(r => [r.hex, r.nguon_bop ?? 'PC']));
    expect(nguon).toEqual({ H1: 'MRA', H2: 'MRA', H3: 'MRA', H4: 'MRA', H5: 'PC', H6: 'PC', H7: 'PC', H8: 'PC', H9: 'MRA', H10: 'PC' });
    expect(soPhu).toBe(5);
    expect(demNguonBop(rows)).toBe(5);
  });

  it('dòng không phủ giữ nguyên object, không sửa mảng / dòng gốc', () => {
    const goc = JSON.stringify(ROWS);
    const { rows } = phuViTriMra(ROWS, COLS, BAN, NOW);
    expect(rows).not.toBe(ROWS);
    expect(rows.length).toBe(ROWS.length);
    rows.forEach((r, i) => { if (!r.nguon_bop) expect(r).toBe(ROWS[i]); });
    expect(JSON.stringify(ROWS)).toBe(goc);
  });

  it('đặt bop / so_ngay mới, giữ giá trị PC ở bop_pc / so_ngay_pc', () => {
    const { rows } = phuViTriMra(ROWS, COLS, ban({ H1: vt('P016', 10, ['MỘC', 'NGUỘI']) }), NOW);
    const r = rows[0];
    expect(r.bop).toBe('P016. LẮP RÁP TINH CHỈNH'); // chuỗi PC có sẵn của P016
    expect(r.so_ngay_cd_hien_tai).toBe('2 TUẦN');
    expect(r.bop_pc).toBe('P013. RA PHÔI SƠ CHẾ');
    expect(r.so_ngay_pc).toBe('TỪ 8 TUẦN TRỞ LÊN');
    expect(r.nguon_bop).toBe('MRA');
    expect(r.mra_cd).toBe('MỘC, NGUỘI');
    expect(r.mra_tu).toBe(truoc(10));
  });

  it('nhãn theo chuỗi PC phổ biến nhất: tập chuỗi bop không tăng', () => {
    const map = Object.fromEntries(ROWS.map((r, i) => [r.hex, vt((['P013', 'P016', 'P018'] as const)[i % 3])]));
    const { rows } = phuViTriMra(ROWS, COLS, ban(map), NOW);
    const truocPhu = new Set(ROWS.map(r => r.bop));
    for (const r of rows) expect(truocPhu.has(r.bop), String(r.bop)).toBe(true);
  });

  it('Tổng quan: tổng phễu không đổi; trên chuyền tăng đúng phần P001/P002 được phủ', () => {
    const tinh = (rows: DataRow[]) =>
      tinhTongQuanSanXuat(rows, COLS, { ...DEFAULT_FILTERS, tinhTrangIpo: [] }, { ...TUY_CHON_MAC_DINH, workshopMetric: 'COUNT_HEX' });
    const onLine = (kq: ReturnType<typeof tinh>) =>
      (kq.pivotFunnelData?.data ?? []).filter(d => (ON_LINE_STAGES as readonly string[]).includes(d.name)).reduce((s, d) => s + d.value, 0);
    const a = tinh(ROWS);
    const { rows } = phuViTriMra(ROWS, COLS, BAN, NOW);
    const b = tinh(rows);
    expect(b.pivotFunnelData?.total).toBe(a.pivotFunnelData?.total);
    const p001p002 = ROWS.filter(r => ['H3', 'H4'].includes(r.hex) && ['P001', 'P002'].includes(extractStage(r.bop) ?? '')).length;
    expect(onLine(b)).toBe(onLine(a) + p001p002 + 1); // + H9 (bop trống, trước nằm ngoài trên chuyền)
    // Không có dòng P001/P002/trống nào được phủ thì trên chuyền giữ nguyên
    const c = tinh(phuViTriMra(ROWS, COLS, ban({ H1: vt('P018'), H2: vt('P013') }), NOW).rows);
    expect(onLine(c)).toBe(onLine(a));
    expect(c.pivotFunnelData?.total).toBe(a.pivotFunnelData?.total);
  });
});

describe('nhóm phần còn lại của dòng đã phủ MRA', () => {
  // PC còn P001 + "15. CHƯA TRIỂN KHAI" nhưng MRA đã triển khai: phễu (đếm theo bop) xếp vào trên chuyền,
  // bảng công trình / tab BOP / danh sách bấm phễu (remainBucketOf) cũng phải ra trên chuyền
  const goc = dong({ hex: 'HX', bop: 'P001. CHỜ BẢN VẼ', tinh_trang: '15. CHƯA TRIỂN KHAI' });
  const cols = cotCua([goc]);
  const phu = phuViTriMra([goc], cols, ban({ HX: vt('P013') }), NOW).rows[0];

  it('remainBucketOf: laMra bỏ tình trạng 15, chỉ xét công đoạn', () => {
    expect(remainBucketOf('15. CHƯA TRIỂN KHAI', 'P013')).toBe('notDeployed');
    expect(remainBucketOf('15. CHƯA TRIỂN KHAI', 'P013', true)).toBe('onLine');
    expect(remainBucketOf('15. CHƯA TRIỂN KHAI', 'P001', true)).toBe('notDeployed');
  });

  it('dòng P001 + 15 đã phủ ra onLine ở phễu, taoBanGhi và tab BOP', () => {
    expect(phu.nguon_bop).toBe('MRA');
    expect(extractStage(phu.bop)).toBe('P013');
    const kq = tinhTongQuanSanXuat([phu], cols, { ...DEFAULT_FILTERS, tinhTrangIpo: [] }, { ...TUY_CHON_MAC_DINH, workshopMetric: 'COUNT_HEX' });
    const onLine = (kq.pivotFunnelData?.data ?? []).filter(d => (ON_LINE_STAGES as readonly string[]).includes(d.name)).reduce((t, d) => t + d.value, 0);
    expect(onLine).toBe(1);
    expect(taoBanGhi([phu], cols, NOW)[0].bucket).toBe('onLine');
    expect(taoBanGhi([goc], cols, NOW)[0].bucket).toBe('notDeployed');
    const k = { bopKey: 'bop', tinhTrangKey: 'tinh_trang', triGiaKey: 'tri_gia_don_hang_tong', nhapKhoKey: 'thanh_tien_nhap_kho_luy_ke' };
    expect(mucBopTuDong(phu, k).bucket).toBe('onLine');
    expect(mucBopTuDong(goc, k).bucket).toBe('notDeployed');
  });
});
