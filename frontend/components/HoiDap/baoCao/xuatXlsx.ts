import * as XLSX from 'xlsx';
import type { BaoCao, MucBaoCao } from './moHinh';
import { oSangSo, tenFile } from './moHinh';

// ============================================================================
// XUẤT EXCEL cho báo cáo từ cuộc hỏi (mô hình ở moHinh.ts).
// File gồm: sheet "Tóm tắt" (tiêu đề, ngày lập, người lập, 1 dòng / câu hỏi) + mỗi câu có bảng số liệu 1 sheet riêng
// (tên sheet = MucBaoCao.tenSheet, đã hợp lệ & không trùng). Làm ngay trên trình duyệt từ số liệu đã có, không gọi DB.
// Ô số đã định dạng ("1,263", "41.87") được đổi về số thật để Excel cộng/lọc được; "27%", "▲ +8%" giữ nguyên chữ.
// Lưu ý: file này import tĩnh 'xlsx' => nơi gọi (HoiDapPopup) nên `await import('./baoCao/xuatXlsx')` để không kéo xlsx vào gói chính.
// ============================================================================

type O = string | number;

const RONG_MIN = 8;
const RONG_MAX = 60;

/** Độ rộng cột (!cols): wch = độ dài chuỗi dài nhất trong cột, kẹp trong [8, 60]. Chỉ tính trên các dòng bảng truyền vào. */
function doRongCot(dong: O[][]): XLSX.ColInfo[] {
  const soCot = dong.reduce((m, d) => Math.max(m, d.length), 0);
  const rong: XLSX.ColInfo[] = [];
  for (let c = 0; c < soCot; c++) {
    let max = 0;
    for (const d of dong) {
      const o = d[c];
      if (o === undefined || o === null) continue;
      max = Math.max(max, String(o).length);
    }
    rong.push({ wch: Math.min(RONG_MAX, Math.max(RONG_MIN, max)) });
  }
  return rong;
}

/** Sheet "Tóm tắt": tiêu đề, ngày lập, người lập, rồi bảng 1 dòng / câu hỏi */
function sheetTomTat(bc: BaoCao, muc: MucBaoCao[]): XLSX.WorkSheet {
  const tieuDeCot: O[] = ['STT', 'Câu hỏi', 'Kết quả', 'Điều kiện (Hiểu là)', 'Ghi chú', 'Bảng số liệu'];
  const dongMuc: O[][] = muc.map(m => [
    m.stt, m.cauHoi, m.ketQua, m.hieuLa ?? '', m.ghiChu.join(' · '), m.bang ? m.tenSheet : '',
  ]);
  const dong: O[][] = [
    [bc.tieuDe],
    ['Ngày lập', bc.ngayLap],
    ['Người lập', bc.nguoiLap],
    [],
    tieuDeCot,
    ...dongMuc,
  ];
  const ws = XLSX.utils.aoa_to_sheet(dong);
  // Độ rộng tính trên bảng câu hỏi (bỏ dòng tiêu đề để cột STT không bị kéo rộng theo tiêu đề báo cáo)
  ws['!cols'] = doRongCot([['Người lập', bc.nguoiLap], tieuDeCot, ...dongMuc]);
  return ws;
}

/** Sheet bảng số liệu của 1 câu: câu hỏi, "Hiểu là", ghi chú, dòng trống, rồi bảng (tiêu đề cột + dữ liệu + dòng tổng) */
function sheetBang(m: MucBaoCao): XLSX.WorkSheet {
  const bang = m.bang!;
  const dauTrang: O[][] = [[`${m.stt}. ${m.cauHoi}`]];
  if (m.hieuLa) dauTrang.push([`Hiểu là: ${m.hieuLa}`]);
  for (const g of m.ghiChu) dauTrang.push([g]);
  dauTrang.push([]);

  const dongBang: O[][] = [
    [...bang.cot],
    ...bang.dong.map(d => d.map(oSangSo)),
  ];
  if (bang.cuoi) dongBang.push(bang.cuoi.map(oSangSo));

  const ws = XLSX.utils.aoa_to_sheet([...dauTrang, ...dongBang]);
  // Định dạng số để Excel hiện "1,263" / "41.87" như trên cửa sổ (ô vẫn là số thật, cộng / lọc được)
  const hangDauDuLieu = dauTrang.length + 1; // sau dòng tiêu đề cột
  dongBang.slice(1).forEach((d, r) => d.forEach((o, c) => {
    if (typeof o !== 'number') return;
    const oExcel = ws[XLSX.utils.encode_cell({ r: hangDauDuLieu + r, c })];
    if (oExcel && oExcel.t === 'n') oExcel.z = Number.isInteger(o) ? '#,##0' : '#,##0.00';
  }));
  // Độ rộng tính trên phần bảng (câu hỏi / ghi chú ở trên là dòng chữ dài, không nên kéo rộng cột đầu)
  ws['!cols'] = doRongCot(dongBang);
  return ws;
}

/** Dựng workbook (SheetJS) từ báo cáo: sheet "Tóm tắt" + 1 sheet / câu có bảng, theo thứ tự stt */
export function dungWorkbook(bc: BaoCao): XLSX.WorkBook {
  const muc = [...bc.muc].sort((a, b) => a.stt - b.stt);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetTomTat(bc, muc), 'Tóm tắt');
  for (const m of muc) {
    if (!m.bang) continue;
    XLSX.utils.book_append_sheet(wb, sheetBang(m), m.tenSheet);
  }
  return wb;
}

/** Tải file .xlsx về máy (XLSX.writeFile) */
export function taiXlsx(bc: BaoCao): void {
  XLSX.writeFile(dungWorkbook(bc), tenFile(bc, 'xlsx'));
}
