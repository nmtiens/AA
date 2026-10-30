import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { DiemTonKhoVt, TongHopTonKhoVt } from '../../../services/tonKhoVtApi';
import { dungChuoi, xuHuongTong, type DoanhThuKeHoach, type DuBaoTon } from './xuLy';
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
    const x = bd.bieuDo[0].xml;
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
    expect(bd.bieuDo[1].xml).toContain('formatCode="0.00"');
    expect(bd.bieuDo[1].xml).toMatch(/<c:valAx>.*<c:numFmt formatCode="General" sourceLinked="0"\/>/);
    // biểu đồ nhóm 2 tham chiếu đúng dòng của khối 2
    expect(bd.bieuDo[1].xml).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$C$16:$C$24</c:f>`);
    expect(bd.bieuDo[1].xml).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$A$16:$A$24</c:f>`);
    expect(xmlCan(bd.bieuDo[1].xml)).toBe(true);
  });
});

describe('biểu đồ Excel — doanh thu tháng (số bảng kế hoạch năm) + dự báo tồn', () => {
  // Doanh thu = khsx_nam: trang truyền thucTe = keHoach
  const keHoach = Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(t => [`2026-${String(t).padStart(2, '0')}`, 100 + t]));
  const doanhThu: DoanhThuKeHoach = { thucTe: { ...keHoach }, keHoach };
  const duBaoVai: DuBaoTon = {
    tyLeDat: 1, tyLeTu: '2026-07', tyLeDen: '2026-09', saiSo: [3200, 4100], saiSoGiuNguyen: [5000, 9000], soLanKiem: [6, 5],
    diem: [
      { khoa: '2026-11', nhan: 'T11/26', h: 1, ton: 41500, thap: 38300, cao: 44700, keHoach: 111, dtDuKien: 111 },
      { khoa: '2026-12', nhan: 'T12/26', h: 2, ton: 42000, thap: 37900, cao: 46100, keHoach: 112, dtDuKien: 112 },
    ],
  };
  const bdDT = dungBieuDoExcel({
    chuoi, chiSo: 'giaTri', moc: 'thang', mau: { 'KVT Vải Da Mouss': '#d55181', 'KVT Kim Loại': '#c98500' },
    doanhThu, thangHienTai: '2026-10', duBao: { 'KVT Vải Da Mouss': duBaoVai, 'KVT Kim Loại': null },
  });
  it('cột F doanh thu (KH năm), G–H dự báo tồn + sai số, I xu hướng; thêm dòng tháng dự báo', () => {
    expect(bdDT.soLieu.every(h => h.length === 9)).toBe(true);
    expect(bdDT.soLieu[1].slice(5)).toEqual(['Doanh số cần đạt (tỷ)', 'Dự báo tồn (tỷ)', 'Sai số ± (tỷ)', 'Xu hướng (tỷ)']);
    expect(bdDT.soLieu[2].slice(5, 8)).toEqual([102, null, null]); // T2/26
    expect(bdDT.soLieu[10].slice(5, 8)).toEqual([110, 39.73, null]); // T10/26: nối đường dự báo
    const xh = xuHuongTong(chuoi[0].diem)!;
    expect(bdDT.soLieu[2][8]).toBeCloseTo(xh.giaTri[0] / 1000, 5);
    expect(bdDT.soLieu[11]).toEqual(['T11/26', 'dự báo', null, null, null, 111, 41.5, 3.2, null]);
    expect(bdDT.soLieu[12]).toEqual(['T12/26', 'dự báo', null, null, null, 112, 42, 4.1, null]);
    expect(bdDT.soLieu[13][0]).toMatch(/^39\.73 tỷ — tăng/);
    expect(bdDT.soLieu[14][0]).toBe('Dự báo theo kế hoạch doanh thu: T11/26 ≈ 41.50 tỷ (±3.2) · T12/26 ≈ 42.00 tỷ (±4.1)');
    expect(bdDT.soLieu[16][0]).toBe('Kim Loại'); // nhóm không có dự báo: không thêm dòng
    expect(bdDT.congThuc[0]).toMatchObject({ r: 2, c: 4, f: 'AVERAGE($C$3:$C$11)' });
    expect(bdDT.rongCot).toHaveLength(9);
  });
  it('biểu đồ tồn: các dãy trải tới tháng dự báo, thêm dãy dự báo nét đứt + thanh sai số (cột H), tiêu đề ghi số dự báo', () => {
    const x = bdDT.bieuDo[1].xml;
    expect(xmlCan(x)).toBe(true);
    // chậm LC, trung bình, dự báo, xu hướng (dãy cột I — trendline của Excel sẽ kéo sang cả tháng dự báo), tổng tồn
    expect(x.match(/<c:ser>/g)).toHaveLength(5);
    expect(x).not.toContain('<c:trendline>');
    expect(x).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$I$3:$I$13</c:f>`);
    expect(x).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$A$3:$A$13</c:f>`);
    expect(x).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$G$3:$G$13</c:f>`);
    expect(x).toContain(`<c:plus><c:numRef><c:f>'${TEN_SHEET_SO_LIEU}'!$H$3:$H$13</c:f>`);
    expect(x).toContain('Dự báo theo kế hoạch doanh thu: T11/26 ≈ 41.50 tỷ (±3.2)');
    const db = x.slice(x.indexOf('Dự báo theo kế hoạch doanh thu (±'));
    const boDem = db.slice(db.indexOf('<c:val>'), db.indexOf('</c:val>'));
    expect(boDem).not.toContain('<c:pt idx="7">');
    expect(boDem).toContain('<c:pt idx="8"><c:v>39.73</c:v>');
    expect(boDem).toContain('<c:pt idx="10"><c:v>42</c:v>');
    expect(bdDT.bieuDo[2].xml.match(/<c:ser>/g)).toHaveLength(4);
    expect(bdDT.bieuDo[2].xml).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$C$19:$C$27</c:f>`);
  });
  it('1 biểu đồ doanh thu chung ở đầu sheet (cột cần đạt + đường thực tế), không lặp dưới từng nhóm', () => {
    expect(bdDT.bieuDo).toHaveLength(3);
    const [dt, ton1, ton2] = bdDT.bieuDo;
    expect(xmlCan(dt.xml)).toBe(true);
    expect(dt.dong).toBe(5);
    expect(ton1.dong).toBe(5 + 17);
    expect(ton2.dong - ton1.dong).toBe(25);
    expect(dt.xml.match(/<c:ser>/g)).toHaveLength(2);
    expect(dt.xml).toContain('<c:barChart>');
    expect(dt.xml).toContain('<c:lineChart>');
    // khối số liệu doanh thu ở cuối sheet số liệu: tiêu đề, dòng cột, 11 tháng T2–T12
    const i = bdDT.soLieu.findIndex(h => h[0] === 'Doanh số cần đạt & thực tế từng tháng (cả công ty, tỷ)');
    expect(i).toBeGreaterThan(0);
    expect(bdDT.soLieu[i + 2].slice(0, 4)).toEqual(['T2/26', null, 102, 102]);
    expect(bdDT.soLieu[i + 12].slice(0, 4)).toEqual(['T12/26', null, 112, null]); // tháng tới: chưa có thực tế
    expect(dt.xml).toContain(`<c:f>'${TEN_SHEET_SO_LIEU}'!$C$${i + 3}:$C$${i + 13}</c:f>`);
    expect(dt.xml).toContain('<c:dPt><c:idx val="9"/>'); // T11, T12 viền đứt
    expect(dt.xml).toContain('<c:dPt><c:idx val="10"/>');
    expect(dt.xml).not.toContain('<c:dPt><c:idx val="8"/>');
  });
  it('xem theo tuần: không có cột doanh thu / dự báo; không có doanh thu: 5 cột, mỗi nhóm 1 biểu đồ, cách 25 dòng', () => {
    const tuan = dungBieuDoExcel({
      chuoi: dungChuoi(th, { moc: 'tuan', chiSo: 'giaTri' }), chiSo: 'giaTri', moc: 'tuan', mau: {},
      doanhThu, thangHienTai: '2026-10', duBao: { 'KVT Vải Da Mouss': duBaoVai },
    });
    expect(tuan.soLieu.every(h => h.length === 5)).toBe(true);
    expect(tuan.bieuDo).toHaveLength(2);
    expect(bd.soLieu.every(h => h.length === 5)).toBe(true);
    expect(bd.bieuDo.map(b => b.dong)).toEqual([5, 30]);
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
