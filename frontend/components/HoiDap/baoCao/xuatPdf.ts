import type {
  Alignment, Content, ContentTable, DynamicContent, Size, TableCell,
  TCreatedPdf, TDocumentDefinitions, TFontDictionary, TVirtualFileSystem,
} from 'pdfmake/interfaces';
import type { Bang } from '../traLoi';
import type { BaoCao, MucBaoCao } from './moHinh';
import { tenFile } from './moHinh';

// ============================================================================
// XUẤT PDF — dựng định nghĩa tài liệu pdfmake từ BaoCao (moHinh.ts) rồi tải về máy.
//   dungDocDef: thuần, không cần trình duyệt (xuatPdf.test.ts render thật bằng bản server của pdfmake).
//   taiPdf: import ĐỘNG pdfmake + font Roboto (có đủ dấu tiếng Việt) — chỉ nạp lúc người dùng xuất,
//     để bundle chính không phình (font ~2 MB). Không chỗ nào khác được import tĩnh pdfmake.
// Bố cục: tiêu đề → "Ngày lập · Người lập" → bảng "Tóm tắt" (STT / Câu hỏi / Kết quả / Điều kiện)
//   → mỗi câu có bảng số liệu: đề mục, "Hiểu là", ghi chú, bảng (ô giữ NGUYÊN chuỗi đã định dạng).
// ============================================================================

const XAM = '#666666';
const XAM_NHAT = '#999999';
const NEN_TIEU_DE = '#f1f5f9';
/** Bảng nhiều hơn số cột này: xoay ngang trang, cột đều 'auto', chữ nhỏ hơn */
const COT_TOI_DA_DOC = 5;
const LE_TRANG: [number, number, number, number] = [36, 48, 36, 40];

const chuoi = (v: string | number | undefined): string => (v === undefined || v === null ? '' : String(v));

/** Hàng ô bảng chuẩn theo số cột (thiếu → '', thừa → cắt) để pdfmake không lỗi lệch cột */
const hangBang = (soCot: number, dong: Array<string | number>): string[] =>
  Array.from({ length: soCot }, (_, i) => chuoi(dong[i]));

const canhCot = (phai: Set<number>, i: number): Alignment => (phai.has(i) ? 'right' : 'left');

/** Mục có bảng số liệu thật (có cột) — mục chỉ có con số thì chỉ nằm trong Tóm tắt */
const coBangSoLieu = (m: MucBaoCao): m is MucBaoCao & { bang: Bang } => !!m.bang && m.bang.cot.length > 0;

/** Bảng "Tóm tắt": 1 dòng / câu; ghi chú ghép dưới ô điều kiện, in nghiêng */
function bangTomTat(muc: MucBaoCao[]): ContentTable {
  const tieuDe = ['STT', 'Câu hỏi', 'Kết quả', 'Điều kiện (Hiểu là)'];
  const body: TableCell[][] = [tieuDe.map(t => ({ text: t, bold: true, fillColor: NEN_TIEU_DE }))];
  for (const m of muc) {
    const dieuKien: Content[] = [];
    if (m.hieuLa) dieuKien.push({ text: m.hieuLa });
    for (const g of m.ghiChu) dieuKien.push({ text: g, italics: true, color: XAM, fontSize: 7.5 });
    body.push([
      { text: String(m.stt), alignment: 'right' },
      { text: m.cauHoi },
      { text: m.ketQua },
      dieuKien.length ? { stack: dieuKien } : { text: '' },
    ]);
  }
  return {
    table: { headerRows: 1, widths: ['auto', '*', '*', '*'], body, dontBreakRows: true },
    layout: 'lightHorizontalLines',
    fontSize: 8.5,
  };
}

/** Bảng số liệu của 1 câu: ô lấy nguyên chuỗi đã định dạng ("1,263", "41.87"), cột trong `phai` canh phải, dòng `cuoi` đậm */
function bangSoLieu(bang: Bang): ContentTable {
  const soCot = bang.cot.length;
  const phai = new Set(bang.phai ?? []);
  const rong = soCot > COT_TOI_DA_DOC;
  const body: TableCell[][] = [
    bang.cot.map((c, i) => ({ text: c, bold: true, fillColor: NEN_TIEU_DE, alignment: canhCot(phai, i) })),
    ...bang.dong.map(d => hangBang(soCot, d).map((o, i) => ({ text: o, alignment: canhCot(phai, i) }))),
  ];
  if (bang.cuoi) body.push(hangBang(soCot, bang.cuoi).map((o, i) => ({ text: o, bold: true, alignment: canhCot(phai, i) })));
  // ≤ 5 cột: cột đầu (tên nhóm) giãn hết chỗ, cột số 'auto'; > 5 cột: tất cả 'auto' cho vừa trang ngang
  const widths: Size[] = bang.cot.map((_, i): Size => (rong || i > 0 ? 'auto' : '*'));
  return {
    table: { headerRows: 1, widths, body, dontBreakRows: true },
    layout: 'lightHorizontalLines',
    fontSize: rong ? 7 : 8.5,
    margin: [0, 4, 0, 0],
  };
}

/** Phần riêng của 1 câu có bảng: đề mục, "Hiểu là", ghi chú, bảng */
function phanMuc(m: MucBaoCao & { bang: Bang }): Content[] {
  const ra: Content[] = [{ text: `${m.stt}. ${m.cauHoi}`, bold: true, fontSize: 11, margin: [0, 16, 0, 2] }];
  if (m.hieuLa) ra.push({ text: `Hiểu là: ${m.hieuLa}`, italics: true, color: XAM, fontSize: 8.5, margin: [0, 0, 0, 2] });
  for (const g of m.ghiChu) ra.push({ text: g, fontSize: 8, color: XAM });
  ra.push(bangSoLieu(m.bang));
  return ra;
}

/** Dựng định nghĩa tài liệu pdfmake (thuần, test được không cần trình duyệt) */
export function dungDocDef(bc: BaoCao): TDocumentDefinitions {
  const ngang = bc.muc.some(m => (m.bang?.cot.length ?? 0) > COT_TOI_DA_DOC);
  const header: DynamicContent = () => ({
    columns: [
      { text: 'Hỏi số liệu · Operations Hub', alignment: 'left' },
      { text: bc.ngayLap, alignment: 'right' },
    ],
    fontSize: 7.5, color: XAM_NHAT, margin: [LE_TRANG[0], 20, LE_TRANG[2], 0],
  });
  const footer: DynamicContent = (trang, tongTrang) => ({
    text: `Trang ${trang} / ${tongTrang}`, alignment: 'center', fontSize: 7.5, color: XAM_NHAT, margin: [0, 12, 0, 0],
  });
  const content: Content[] = [
    { text: bc.tieuDe, fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
    { text: `Ngày lập: ${bc.ngayLap} · Người lập: ${bc.nguoiLap}`, fontSize: 9, color: XAM, margin: [0, 0, 0, 12] },
    { text: 'Tóm tắt', fontSize: 12, bold: true, margin: [0, 0, 0, 6] },
    bangTomTat(bc.muc),
    ...bc.muc.filter(coBangSoLieu).flatMap(phanMuc),
  ];
  return {
    pageSize: 'A4',
    pageOrientation: ngang ? 'landscape' : 'portrait',
    pageMargins: LE_TRANG,
    info: { title: bc.tieuDe, author: bc.nguoiLap, creator: 'Operations Hub · Hỏi số liệu' },
    header,
    footer,
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9 },
  };
}

// ---- Nạp pdfmake trên trình duyệt --------------------------------------------------------------------

/**
 * Hình dạng THẬT của build/pdfmake.js 0.3: UMD, `module.exports` = thể hiện pdfMake (js/browser-extensions/index.js),
 * đã cài sẵn từ điển font Roboto → Roboto-*.ttf; Vite đưa CJS về `.default`. @types/pdfmake 0.3.3 lại khai báo
 * dạng named export (createPdf, addFonts…) nên không mô tả được thể hiện này → dùng kiểu cục bộ hẹp.
 */
interface PdfMakeTrinhDuyet {
  createPdf(docDef: TDocumentDefinitions): TCreatedPdf;
  addVirtualFileSystem(vfs: TVirtualFileSystem): void;
  addFonts(fonts: TFontDictionary): void;
  fonts?: TFontDictionary;
}

/** Lấy module thật từ namespace import động: CJS/UMD qua Vite/Node nằm ở `.default`, ESM thì là chính namespace */
export function layModule<T extends object>(ns: unknown): T {
  const o = ns as { default?: unknown } | null;
  return (o && typeof o.default === 'object' && o.default !== null ? o.default : ns) as T;
}

/** Từ điển font Roboto theo tên file trong build/vfs_fonts.js (Roboto có đủ chữ tiếng Việt) */
export const FONT_ROBOTO: TFontDictionary = {
  Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
};

/** Cờ mức module: vfs + font chỉ nạp 1 lần cho cả phiên (xuất lần 2 trở đi chỉ dựng tài liệu) */
let daNapFont = false;

/** Tải file .pdf về máy (nạp pdfmake + font lúc cần, không nằm trong bundle chính) */
export async function taiPdf(bc: BaoCao): Promise<void> {
  const [nsPdf, nsVfs] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const pdfMake = layModule<PdfMakeTrinhDuyet>(nsPdf);
  if (!daNapFont) {
    pdfMake.addVirtualFileSystem(layModule<TVirtualFileSystem>(nsVfs));
    // Bản build 0.3 đã có sẵn Roboto trong `fonts`; chỉ bổ sung nếu bản sau đổi mặc định
    if (!pdfMake.fonts?.Roboto) pdfMake.addFonts(FONT_ROBOTO);
    daNapFont = true;
  }
  await pdfMake.createPdf(dungDocDef(bc)).download(tenFile(bc, 'pdf'));
}
