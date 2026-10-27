import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { DiemTonKhoVt, TongHopTonKhoVt } from '../../../services/tonKhoVtApi';
import { dungChuoi } from './xuLy';
import { chenBieuDoVaoXlsx, dungBieuDoExcel, tenCot, TEN_SHEET_BIEU_DO, TEN_SHEET_SO_LIEU } from './excelBieuDo';

const NGAY = ['2026-02-26', '2026-03-26', '2026-04-23', '2026-05-28', '2026-06-25', '2026-07-30', '2026-08-27', '2026-09-24', '2026-10-22'];
const VAI = [[26.56, 18.32], [29.94, 23.07], [30.81, 24.22], [31.74, 25.24], [36.86, 26.25], [50.64, 27.9], [51.04, 28.04], [44.15, 0], [39.73, 29.01]];
const KL = [[0.27, 0.1], [0.3, 0.1], [0.4, 0.2], [0.5, 0.2], [0.6, 0.3], [0.92, 0.4], [0.8, 0.4], [0.7, 0], [0.52, 0.27]];
const diem = (ngay: string, nhom: string, v: number, c: number): DiemTonKhoVt =>
  ({ ngay, nhom, giaTri: v * 1000, giaTriCham: c * 1000, soMa: 100, soMaCham: c ? 60 : 0 });
// Lần chốt 24/09 cả bảng 0 cờ chậm luân chuyển => thiếu số
const th: TongHopTonKhoVt = {
  capNhat: null, ngay: NGAY, nhom: ['KVT Vải Da Mouss', 'KVT Kim Loại'],
  diem: NGAY.flatMap((n, i) => [diem(n, 'KVT Vải Da Mouss', VAI[i][0], VAI[i][1]), diem(n, 'KVT Kim Loại', KL[i][0], KL[i][1])]),
};
const chuoi = dungChuoi(th, { moc: 'thang', chiSo: 'giaTri' });
const bd = dungBieuDoExcel({
  chuoi, chiSo: 'giaTri', moc: 'thang', mau: { 'KVT Vải Da Mouss': '#d55181', 'KVT Kim Loại': '#c98500' },
  loc: { 'KVT Vải Da Mouss': { moTa: 'tên chứa “vải”' } },
});

/** Kiểm XML đóng mở thẻ cân (không có trình phân tích XML trong môi trường test node) */
const xmlCan = (xml: string): boolean => {
  const ngan: string[] = [];
  for (const m of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) { if (ngan.pop() !== m[2]) return false; } else ngan.push(m[2]);
  }
  return ngan.length === 0;
};

describe('biểu đồ Excel — số liệu', () => {
  it('tên cột Excel', () => {
    expect([0, 5, 25, 26, 51, 52].map(tenCot)).toEqual(['A', 'F', 'Z', 'AA', 'AZ', 'BA']);
  });
  it('các nhóm xếp DỌC trong 5 cột A–E: tên (kèm bộ lọc), tiêu đề cột, số theo tỷ, chậm LC trống ở lần chốt thiếu cờ, TB là công thức', () => {
    // Khối 1 (Vải): dòng 0 tên, 1 tiêu đề, 2–10 từng tháng, 11 câu tóm tắt; dòng 12 trống; khối 2 (Kim Loại) từ dòng 13
    expect(bd.soLieu.every(h => h.length === 5)).toBe(true);
    expect(bd.soLieu[0][0]).toBe('Vải Da Mouss (lọc: tên chứa “vải”)');
    expect(bd.soLieu[1]).toEqual(['Kỳ', 'Ngày chốt', 'Tổng tồn (tỷ)', 'Chậm luân chuyển > 3 tháng (tỷ)', 'Trung bình (tỷ)']);
    expect(bd.soLieu[2].slice(0, 4)).toEqual(['T2/26', '26/02/2026', 26.56, 18.32]);
    expect(bd.soLieu[9][3]).toBeNull(); // T9/26 (24/09) thiếu cờ
    expect(bd.soLieu[11][0]).toMatch(/^39\.73 tỷ — tăng/);
    expect(bd.soLieu[12].every(o => o === null)).toBe(true);
    expect(bd.soLieu[13][0]).toBe('Kim Loại');
    expect(bd.soLieu[15].slice(0, 3)).toEqual(['T2/26', '26/02/2026', 0.27]);
    expect(bd.congThuc[0]).toMatchObject({ r: 2, c: 4, f: 'AVERAGE($C$3:$C$11)' });
    expect(bd.congThuc[0].v).toBeCloseTo(VAI.reduce((s, x) => s + x[0], 0) / 9);
    expect(bd.congThuc.find(x => x.r === 15)).toMatchObject({ c: 4, f: 'AVERAGE($C$16:$C$24)' });
    expect(bd.rongCot).toHaveLength(5);
  });
  it('XML biểu đồ: 3 dãy (chậm LC, trung bình, tổng tồn) + trendline tuyến tính, tham chiếu đúng sheet số liệu, trục Y từ 0', () => {
    const x = bd.bieuDo[0];
    expect(xmlCan(x)).toBe(true);
    expect(x.match(/<c:ser>/g)).toHaveLength(3);
    expect(x).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$C$3:$C$11</c:f>`);
    expect(x).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$A$3:$A$11</c:f>`);
    expect(x).toContain('<c:trendlineType val="linear"/>');
    expect(x).toContain('<c:min val="0"/>');
    expect(x).toContain('<c:dispBlanksAs val="span"/>');
    expect(x).toContain('Vải Da Mouss (lọc: tên chứa “vải”)');
    // chậm LC ở lần chốt thiếu cờ (idx 7) không có điểm trong bộ đệm => Excel để trống
    const cham = x.slice(x.indexOf('Chậm luân chuyển'), x.indexOf('Trung bình'));
    const boDemCham = cham.slice(cham.indexOf('<c:numCache>'));
    expect(boDemCham).toContain('<c:pt idx="6">');
    expect(boDemCham).not.toContain('<c:pt idx="7">');
    // nhóm nhỏ (< 2 tỷ) ghi 2 số lẻ; trục tỷ để General (vạch 0.1 không bị làm tròn thành 0 / 1)
    expect(bd.bieuDo[1]).toContain('formatCode="0.00"');
    expect(bd.bieuDo[1]).toMatch(/<c:valAx>.*<c:numFmt formatCode="General" sourceLinked="0"\/>/);
    // biểu đồ nhóm 2 tham chiếu đúng dòng của khối 2
    expect(bd.bieuDo[1]).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$C$16:$C$24</c:f>`);
    expect(bd.bieuDo[1]).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$A$16:$A$24</c:f>`);
    expect(xmlCan(bd.bieuDo[1])).toBe(true);
  });
});

describe('biểu đồ Excel — doanh thu tháng (trục phụ)', () => {
  const dtThang: Record<string, number> = Object.fromEntries(NGAY.map((n, i) => [n.slice(0, 7), 80 + i * 10]));
  const bdDt = dungBieuDoExcel({
    chuoi, chiSo: 'giaTri', moc: 'thang', mau: { 'KVT Vải Da Mouss': '#d55181', 'KVT Kim Loại': '#c98500' },
    doanhThu: dtThang, thangTamTinh: '2026-10',
  });
  it('cột F "Doanh thu (tỷ)" ở mọi khối, 6 cột', () => {
    expect(bdDt.soLieu.every(h => h.length === 6)).toBe(true);
    expect(bdDt.soLieu[1][5]).toBe('Doanh thu (tỷ)');
    expect(bdDt.soLieu[2][5]).toBe(80);
    expect(bdDt.soLieu[10][5]).toBe(160);
    expect(bdDt.rongCot).toHaveLength(6);
  });
  it('lineChart thứ 2 trên trục phụ bên phải (cắt ở max), tham chiếu cột F, tháng đang chạy là điểm rỗng', () => {
    const x = bdDt.bieuDo[0];
    expect(xmlCan(x)).toBe(true);
    expect(x.match(/<c:lineChart>/g)).toHaveLength(2);
    expect(x).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$F$3:$F$11</c:f>`);
    expect(x).toMatch(/<c:valAx><c:axId val="5004"\/>.*<c:axPos val="r"\/>.*<c:crosses val="max"\/>/);
    expect(x).toContain('<c:dPt><c:idx val="8"/>');
    expect(x).toContain('Doanh thu tháng (tỷ, trục phải); T10/26 tạm tính');
  });
  it('xem theo tuần: không có doanh thu (5 cột, 1 lineChart)', () => {
    const tuan = dungBieuDoExcel({ chuoi: dungChuoi(th, { moc: 'tuan', chiSo: 'giaTri' }), chiSo: 'giaTri', moc: 'tuan', mau: {}, doanhThu: dtThang });
    expect(tuan.soLieu.every(h => h.length === 5)).toBe(true);
    expect(tuan.bieuDo[0].match(/<c:lineChart>/g)).toHaveLength(1);
  });
});

describe('biểu đồ Excel — chèn vào gói xlsx', () => {
  it('thêm drawing + 2 chart, quan hệ sheet, content types; sheet "Biểu đồ" có <drawing>', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Báo cáo']]), 'Báo cáo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Biểu đồ tồn kho vật tư']]), TEN_SHEET_BIEU_DO);
    const ws = XLSX.utils.aoa_to_sheet(bd.soLieu);
    for (const ct of bd.congThuc) ws[XLSX.utils.encode_cell({ r: ct.r, c: ct.c })] = { t: 'n', v: ct.v, f: ct.f };
    XLSX.utils.book_append_sheet(wb, ws, TEN_SHEET_SO_LIEU);
    const goc = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const ra = await chenBieuDoVaoXlsx(goc, TEN_SHEET_BIEU_DO, bd.bieuDo);
    const zip = await JSZip.loadAsync(ra);
    const doc = (p: string) => zip.file(p)!.async('string');
    expect(zip.file('xl/charts/chart1.xml')).toBeTruthy();
    expect(zip.file('xl/charts/chart2.xml')).toBeTruthy();
    const ve = await doc('xl/drawings/drawing1.xml');
    expect(xmlCan(ve)).toBe(true);
    expect(ve.match(/<xdr:oneCellAnchor>/g)).toHaveLength(2);
    expect(await doc('xl/drawings/_rels/drawing1.xml.rels')).toContain('Target="../charts/chart2.xml"');
    const sheet2 = await doc('xl/worksheets/sheet2.xml');
    expect(sheet2).toMatch(/<drawing r:id="rIdBieuDo1"\/><\/worksheet>$/);
    expect(sheet2.slice(0, 600)).toContain('xmlns:r=');
    expect(await doc('xl/worksheets/_rels/sheet2.xml.rels')).toContain('Target="../drawings/drawing1.xml"');
    expect(await doc('xl/worksheets/sheet1.xml')).not.toContain('<drawing');
    const ct = await doc('[Content_Types].xml');
    expect(ct).toContain('PartName="/xl/drawings/drawing1.xml"');
    expect(ct).toContain('PartName="/xl/charts/chart2.xml"');
    // SheetJS đọc lại được và giữ công thức trung bình
    const lai = XLSX.read(ra, { type: 'array' });
    expect(lai.SheetNames).toEqual(['Báo cáo', TEN_SHEET_BIEU_DO, TEN_SHEET_SO_LIEU]);
    expect(lai.Sheets[TEN_SHEET_SO_LIEU].E3.f).toBe('AVERAGE($C$3:$C$11)');
  });
});
