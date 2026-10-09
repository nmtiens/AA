import { describe, it, expect } from 'vitest';
import { parseQcEntries } from './qcParse';

// Định dạng thật của cột tong_hop_thong_tin_qc (bảng sản xuất): nhiều lần kiểm, link ảnh xuống dòng,
// dòng trùng (một có trạng thái, một trống) do nguồn ghi 2 lần.
const SAMPLE = [
  '11/05/2026:  # QC: NGUYỄN THỊ KIM CHI # Công đoạn: P20 - Lắp ráp hoàn thiện - Fitting # Trạng thái: rejected # SL Kiểm: 1 # SL Đạt: 0 # TL Đạt: 0% # SL Lỗi: 1 # TL Lỗi: 100% # Ghi chú: QĐ-QAQC-015 lỗi kim loại\n\n[LÝ DO TỪ CHỐI]: KHÔNG CHẤP NHẬN  # Link Ảnh: https://drive.google.com/file/d/AAA/view\nhttps://drive.google.com/file/d/BBB/view',
  '19/04/2026:  # QC: Y LUIS # Công đoạn: P16 - Lắp Ráp Tinh Chỉnh # Trạng thái: APPROVED # SL Kiểm: 2 # SL Đạt: 2 # TL Đạt: 100% # SL Lỗi: 0 # TL Lỗi: 0% # Ghi chú: Tổ a Tú # Link Ảnh: ',
  '19/04/2026:  # QC: Y LUIS # Công đoạn: P16 - Lắp Ráp Tinh Chỉnh # Trạng thái:  # SL Kiểm: 2 # SL Đạt: 2 # TL Đạt: 100% # SL Lỗi: 0 # TL Lỗi: 0% # Ghi chú: Tổ a Tú # Link Ảnh: https://drive.google.com/file/d/CCC/view',
  '03/05/2026:  # QC: LÊ QUANG HUY # Công đoạn: P17 - Làm Nguội # Trạng thái: flagged # SL Kiểm: 1 # SL Đạt: 0 # TL Đạt: 0% # SL Lỗi: 1 # TL Lỗi: 100% # Ghi chú: Nguội P17 # Link Ảnh: ',
].join('\n');

describe('parseQcEntries', () => {
  it('tách từng lần kiểm, đọc số, chuẩn hoá trạng thái, gom link ảnh', () => {
    const e = parseQcEntries(SAMPLE);
    expect(e.map(x => x.date)).toEqual(['11/05/2026', '03/05/2026', '19/04/2026']); // mới nhất trước, dòng trùng gộp
    const rej = e[0];
    expect(rej.status).toBe('rejected');
    expect(rej.stage).toBe('P20 - Lắp ráp hoàn thiện - Fitting');
    expect(rej.qc).toBe('NGUYỄN THỊ KIM CHI');
    expect(rej.checked).toBe(1); expect(rej.pass).toBe(0); expect(rej.fail).toBe(1);
    expect(rej.photos).toEqual(['https://drive.google.com/file/d/AAA/view', 'https://drive.google.com/file/d/BBB/view']);
    expect(rej.note).not.toMatch(/https?:/);
    expect(rej.note).toContain('LÝ DO TỪ CHỐI');
  });

  it('dòng trùng: giữ 1, trạng thái trống + không lỗi = đạt, ảnh của cả 2 dòng được gộp', () => {
    const e = parseQcEntries(SAMPLE);
    const ok = e.find(x => x.date === '19/04/2026')!;
    expect(e.filter(x => x.date === '19/04/2026')).toHaveLength(1);
    expect(ok.status).toBe('approved'); // "APPROVED" -> approved; bản trống cũng là approved
    expect(ok.photos).toEqual(['https://drive.google.com/file/d/CCC/view']);
  });

  it('trạng thái trống nhưng có lỗi -> unknown; flagged giữ nguyên', () => {
    const e = parseQcEntries('01/01/2026:  # QC: A # Công đoạn: P18 # Trạng thái:  # SL Kiểm: 3 # SL Đạt: 1 # SL Lỗi: 2 # Ghi chú: x # Link Ảnh: ');
    expect(e[0].status).toBe('unknown');
    expect(parseQcEntries(SAMPLE).find(x => x.date === '03/05/2026')!.status).toBe('flagged');
  });

  it('chuỗi rỗng / không đúng định dạng -> mảng rỗng', () => {
    expect(parseQcEntries('')).toEqual([]);
    expect(parseQcEntries(null)).toEqual([]);
    expect(parseQcEntries('ghi chú tự do không có ngày')).toEqual([]);
  });
});
