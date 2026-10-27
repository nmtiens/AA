import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import type {
  Content, ContentColumns, ContentStack, ContentTable, ContentText, DynamicContent,
  TableCell, TCreatedPdf, TDocumentDefinitions, TFontDictionary,
} from 'pdfmake/interfaces';
import { FONT_ROBOTO, dungDocDef, layModule } from './xuatPdf';
import type { BaoCao } from './moHinh';

// ---- Mẫu báo cáo ---------------------------------------------------------------------------------------
/** 2 câu: câu 1 chỉ có con số; câu 2 có bảng 3 cột (2 cột số canh phải, dòng tổng) → trang dọc */
const bcDoc = (): BaoCao => ({
  tieuDe: 'Báo cáo số liệu',
  ngayLap: '23/10/2026 14:05',
  nguoiLap: 'ĐINH BÁ LỘC',
  muc: [
    { stt: 1, cauHoi: 'nhập kho tháng này', ketQua: 'Nhập kho (P022) tháng 10: 84.64 tỷ', ghiChu: [], tenSheet: '1. nhập kho tháng này' },
    {
      stt: 2, cauHoi: 'Nhập kho xưởng 4A · Tổng giá trị (tỷ)', ketQua: 'Tổng giá trị nhập kho (tỷ): 41.87 · Số HEX: 1,263',
      hieuLa: 'Nhập kho · tổng giá trị nhập kho · lọc: Xưởng = 4A',
      ghiChu: ['Tồn kho chốt ngày 15/10/2026 (tồn kho là số chụp từng ngày, không cộng dồn).'],
      bang: {
        cot: ['Công trình', 'Số HEX', 'Tổng giá trị (tỷ)'],
        dong: [['CT25-070', '428', '21.88'], ['CT25-071', '835', '19.99']],
        phai: [1, 2],
        cuoi: ['Tổng', '1,263', '41.87'],
      },
      tenSheet: '2. Nhập kho xưởng 4A',
    },
  ],
});

/** Thêm câu 3 có bảng 6 cột → trang ngang */
const bcNgang = (): BaoCao => {
  const bc = bcDoc();
  bc.muc.push({
    stt: 3, cauHoi: 'tiến độ theo tuần', ketQua: '1 tuần', ghiChu: [],
    bang: { cot: ['Tuần', 'T2', 'T3', 'T4', 'T5', 'T6'], dong: [['42', 1, 2, 3, 4, 5]], phai: [1, 2, 3, 4, 5] },
    tenSheet: '3. tiến độ theo tuần',
  });
  return bc;
};

const cacBang = (dd: TDocumentDefinitions): ContentTable[] =>
  (dd.content as Content[]).filter((c): c is ContentTable => typeof c === 'object' && c !== null && 'table' in c);
const oChu = (o: TableCell) => o as ContentText;

describe('báo cáo — xuất PDF: định nghĩa tài liệu', () => {
  it('khung trang: A4, lề, header/footer, font Roboto; chữ tiếng Việt còn nguyên dấu', () => {
    const dd = dungDocDef(bcDoc());
    expect(dd.pageSize).toBe('A4');
    expect(dd.pageMargins).toEqual([36, 48, 36, 40]);
    expect(dd.defaultStyle).toEqual({ font: 'Roboto', fontSize: 9 });

    const header = (dd.header as DynamicContent)(1, 3, { width: 595, height: 842, orientation: 'portrait' }) as ContentColumns;
    expect((header.columns[0] as ContentText).text).toBe('Hỏi số liệu · Operations Hub');
    expect((header.columns[1] as ContentText).text).toBe('23/10/2026 14:05');
    const footer = (dd.footer as DynamicContent)(2, 5, { width: 595, height: 842, orientation: 'portrait' }) as ContentText;
    expect(footer.text).toBe('Trang 2 / 5');
    expect(footer.alignment).toBe('center');

    const content = dd.content as ContentText[];
    expect(content[0]).toMatchObject({ text: 'Báo cáo số liệu', fontSize: 16, bold: true });
    expect(content[1]).toMatchObject({ text: 'Ngày lập: 23/10/2026 14:05 · Người lập: ĐINH BÁ LỘC', fontSize: 9 });
    expect(content[2]).toMatchObject({ text: 'Tóm tắt', fontSize: 12, bold: true });
    expect(JSON.stringify(dd.content)).toContain('Nhập kho xưởng 4A · Tổng giá trị (tỷ)');
  });

  it('hướng trang: dọc khi mọi bảng ≤ 5 cột, ngang khi có bảng > 5 cột', () => {
    expect(dungDocDef(bcDoc()).pageOrientation).toBe('portrait');
    expect(dungDocDef(bcNgang()).pageOrientation).toBe('landscape');
  });

  it('bảng Tóm tắt: 1 dòng tiêu đề + 1 dòng / câu; ghi chú nghiêng dưới ô điều kiện', () => {
    const [tomTat] = cacBang(dungDocDef(bcDoc()));
    expect(tomTat.layout).toBe('lightHorizontalLines');
    expect(tomTat.table.headerRows).toBe(1);
    expect(tomTat.table.widths).toEqual(['auto', '*', '*', '*']);
    expect(tomTat.table.body).toHaveLength(1 + 2);
    expect(tomTat.table.body[0].map(o => oChu(o).text)).toEqual(['STT', 'Câu hỏi', 'Kết quả', 'Điều kiện (Hiểu là)']);
    expect(oChu(tomTat.table.body[0][0]).bold).toBe(true);
    // Câu 1 không có Hiểu là / ghi chú → ô điều kiện rỗng
    expect(oChu(tomTat.table.body[1][1]).text).toBe('nhập kho tháng này');
    expect(oChu(tomTat.table.body[1][3]).text).toBe('');
    // Câu 2: ô điều kiện là stack [Hiểu là, ghi chú nghiêng]
    const dieuKien = tomTat.table.body[2][3] as ContentStack;
    expect((dieuKien.stack[0] as ContentText).text).toBe('Nhập kho · tổng giá trị nhập kho · lọc: Xưởng = 4A');
    expect(dieuKien.stack[1]).toMatchObject({ text: 'Tồn kho chốt ngày 15/10/2026 (tồn kho là số chụp từng ngày, không cộng dồn).', italics: true });
  });

  it('bảng số liệu: giữ nguyên chuỗi, canh phải theo `phai`, dòng cuối đậm, cột đầu giãn khi ≤ 5 cột', () => {
    const dd = dungDocDef(bcDoc());
    const bang = cacBang(dd);
    expect(bang).toHaveLength(2); // Tóm tắt + 1 bảng của câu 2 (câu 1 không có bảng)
    const b = bang[1];
    expect(b.table.headerRows).toBe(1);
    expect(b.table.widths).toEqual(['*', 'auto', 'auto']);
    expect(b.fontSize).toBe(8.5);
    expect(b.table.body).toHaveLength(1 + 2 + 1); // tiêu đề + 2 dòng + dòng tổng
    expect(b.table.body[0].map(o => oChu(o).text)).toEqual(['Công trình', 'Số HEX', 'Tổng giá trị (tỷ)']);
    expect(b.table.body[0].every(o => oChu(o).bold && oChu(o).fillColor)).toBe(true);
    expect(b.table.body[1].map(o => oChu(o).text)).toEqual(['CT25-070', '428', '21.88']);
    expect(b.table.body[1].map(o => oChu(o).alignment)).toEqual(['left', 'right', 'right']);
    expect(b.table.body[3]).toMatchObject([{ text: 'Tổng', bold: true }, { text: '1,263', bold: true, alignment: 'right' }, { text: '41.87', bold: true }]);
    expect(oChu(b.table.body[1][0]).bold).toBeUndefined();

    // Đề mục + "Hiểu là" + ghi chú đứng ngay trước bảng
    const content = dd.content as Content[];
    const viTri = content.indexOf(b);
    expect(content[viTri - 3]).toMatchObject({ text: '2. Nhập kho xưởng 4A · Tổng giá trị (tỷ)', bold: true, fontSize: 11 });
    expect(content[viTri - 2]).toMatchObject({ text: 'Hiểu là: Nhập kho · tổng giá trị nhập kho · lọc: Xưởng = 4A', italics: true });
    expect(content[viTri - 1]).toMatchObject({ text: 'Tồn kho chốt ngày 15/10/2026 (tồn kho là số chụp từng ngày, không cộng dồn).', fontSize: 8 });
  });

  it('bảng > 5 cột: mọi cột auto, chữ 7, ô số chuyển thành chuỗi', () => {
    const bang = cacBang(dungDocDef(bcNgang()));
    expect(bang).toHaveLength(3);
    const b = bang[2];
    expect(b.table.widths).toEqual(['auto', 'auto', 'auto', 'auto', 'auto', 'auto']);
    expect(b.fontSize).toBe(7);
    expect(b.table.body).toHaveLength(2); // không có dòng tổng
    expect(b.table.body[1].map(o => oChu(o).text)).toEqual(['42', '1', '2', '3', '4', '5']);
  });

  it('bảng rỗng (không cột) không tạo phần riêng, không làm pdfmake lỗi', () => {
    const bc = bcDoc();
    bc.muc[0].bang = { cot: [], dong: [] };
    expect(cacBang(dungDocDef(bc))).toHaveLength(2);
  });
});

// ---- Render thật bằng pdfmake phía server (js/index.js) ----------------------------------------------
/**
 * Hình dạng thật của `pdfmake` main (js/index.js): `module.exports = new pdfmake()` — không có font mặc định,
 * font khai báo bằng tên file nằm trong virtualfs (0.3.12 không nhận Buffer trực tiếp: resolveUrls coi
 * object là {url, headers}). @types/pdfmake không mô tả `virtualfs` → kiểu cục bộ hẹp.
 */
interface PdfMakeServer {
  virtualfs: { writeFileSync(ten: string, noiDung: Buffer): void };
  setFonts(fonts: TFontDictionary): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  setLocalAccessPolicy(cb: (path: string) => boolean): void;
  createPdf(docDef: TDocumentDefinitions): TCreatedPdf;
}

/** Giải nén các stream FlateDecode trong PDF (pdfkit ghi "stream\n…\nendstream") để soi CMap ToUnicode của font nhúng */
function cacStreamGiaiNen(buf: Buffer): string[] {
  const chu = buf.toString('latin1');
  const ra: string[] = [];
  const re = /(?<!end)stream\r?\n/g; // không bắt "stream" nằm trong "endstream"
  let m: RegExpExecArray | null;
  while ((m = re.exec(chu))) {
    const bd = m.index + m[0].length;
    const ketThuc = chu.indexOf('endstream', bd);
    if (ketThuc < 0) break;
    const kt = chu[ketThuc - 1] === '\n' ? ketThuc - 1 : ketThuc;
    try { ra.push(inflateSync(Buffer.from(chu.slice(bd, kt), 'latin1')).toString('latin1')); } catch { /* stream không nén: bỏ qua */ }
    re.lastIndex = ketThuc + 'endstream'.length;
  }
  return ra;
}

async function renderPdf(bc: BaoCao): Promise<Buffer> {
  const pdfmake = layModule<PdfMakeServer>(await import('pdfmake'));
  const vfs = layModule<Record<string, string>>(await import('pdfmake/build/vfs_fonts'));
  for (const [ten, b64] of Object.entries(vfs)) {
    if (ten.endsWith('.ttf')) pdfmake.virtualfs.writeFileSync(ten, Buffer.from(b64, 'base64'));
  }
  pdfmake.setFonts(FONT_ROBOTO);
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => false);
  // getBuffer: lấy stream pdfkit, gom chunk 'data' tới 'end'
  return pdfmake.createPdf(dungDocDef(bc)).getBuffer();
}

describe('báo cáo — xuất PDF: render thật (pdfmake server + font Roboto từ vfs_fonts)', () => {
  it('ra file PDF có nhúng Roboto, trang dọc, chữ có dấu ("ậ") vào được font', async () => {
    const buf = await renderPdf(bcDoc());
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(3000);
    const tho = buf.toString('latin1');
    expect(tho).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect(tho).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto-Regular/);
    expect(tho).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto-Medium/); // chữ đậm
    expect(tho).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto-Italic/); // "Hiểu là" nghiêng
    expect(tho).toMatch(/\/Count 1\b/);
    // CMap ToUnicode của font nhúng phải có mã U+1EAD ("ậ" trong "Nhập") → glyph có trong Roboto, không rơi vào .notdef
    const cmap = cacStreamGiaiNen(buf).filter(s => s.includes('begincmap'));
    expect(cmap.length).toBeGreaterThan(0);
    expect(cmap.some(s => /1ead/i.test(s))).toBe(true);
  }, 30_000);

  it('bảng > 5 cột → trang ngang A4', async () => {
    const buf = await renderPdf(bcNgang());
    expect(buf.toString('latin1')).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
  }, 30_000);
});
