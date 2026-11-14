// ============================================================================
// BOT THEO CÔNG ĐOẠN (thuần) — ngày BOT các bộ phận nhập cho từng HEX × công đoạn (GET / POST /api/bot-cong-doan).
// Quyền kiểm lại ở máy chủ (backend/src/server/botCongDoan.ts); ở đây chỉ để khoá ô / báo trước khi gửi.
// ============================================================================

export const CONG_DOAN_BOT = ['P001', 'P002', 'P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021', 'P022', 'P025'] as const;
export type CongDoanBot = typeof CONG_DOAN_BOT[number];
export const TEN_CONG_DOAN_BOT: Record<CongDoanBot, string> = {
  P001: 'Triển khai', P002: 'Bản vẽ KT', P012: 'Có phiếu', P013: 'Ra phôi', GCVT: 'GCVT', P014: 'Tinh chỉnh',
  P016: 'Lắp ráp TC', P018: 'Sơn màu', P020: 'Lắp ráp HT', P021: 'Đóng gói', P022: 'Nhập kho', P025: 'Xuất hàng',
};
export const laCongDoanBot = (x: unknown): x is CongDoanBot => typeof x === 'string' && (CONG_DOAN_BOT as readonly string[]).includes(x);

export interface QuyenBot { admin: boolean; boPhan: string | null; congDoan: string[]; xuong: string[] | null }
export const chuanTen = (s: unknown) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();

/** Được nhập ô (HEX thuộc xưởng `xuong`, công đoạn `cd`) không — như máy chủ */
export const duocNhap = (q: QuyenBot | null | undefined, cd: string, xuong: unknown) =>
  !!q && (q.admin || (q.congDoan.includes(cd) && (!q.xuong || q.xuong.includes(chuanTen(xuong)))));

/** Ngày nhập tay / dán từ Excel => 'YYYY-MM-DD'; '' => null (xoá); sai => undefined.
 *  Nhận: 30/11/2026, 30-11-2026, 30.11.26, 2026-11-30, số ngày Excel (46356). */
export function docNgayNhap(s: unknown): string | null | undefined {
  const t = String(s ?? '').trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let k: RegExpMatchArray | null;
  if ((k = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +k[1]; m = +k[2]; d = +k[3]; }
  else if ((k = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) { d = +k[1]; m = +k[2]; y = +k[3] < 100 ? 2000 + +k[3] : +k[3]; }
  else if (/^\d{5}$/.test(t)) {   // số ngày Excel (1900): 46356 = 30/11/2026
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86_400_000);
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  } else return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const fmtNgayBot = (iso: string | null | undefined) => (iso ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** Đợt của ngày BOT: đợt đầu (xong lô đầu) / đợt cuối (xong hết) */
export type DotBot = 'dau' | 'cuoi';
export const TEN_DOT: Record<DotBot, string> = { dau: 'Đợt đầu', cuoi: 'Đợt cuối' };
/** Khoá trong bảng ngày của 1 HEX (GET /api/bot-cong-doan): 'P014' = đợt cuối, 'P014:dau' = đợt đầu */
export const khoaNgay = (cd: string, dot: DotBot) => (dot === 'dau' ? `${cd}:dau` : cd);
export interface OGhi { hex: string; congDoan: string; dot: DotBot; ngay: string | null }
export interface KetQuaDan { ghi: OGhi[]; loi: { dong: number; noiDung: string; lyDo: string }[] }

/**
 * Đọc bảng dán từ Excel (cột cách bằng tab):
 *  - Dòng đầu không phải số => dòng tiêu đề: cột có chữ "HEX" là cột HEX, các cột còn lại theo tên công đoạn + đợt
 *    ("P014 ĐẦU", "P014 CUỐI"; chỉ "P014" = đợt cuối); cột lạ bỏ qua. Tiêu đề 2 dòng cũng được: dòng 1 "P014" gộp 2 cột,
 *    dòng 2 "ĐẦU" / "CUỐI" (file mẫu nhập BOT x BOP). Có tiêu đề mà không thấy cột HEX / công đoạn => báo.
 *  - Không tiêu đề: đúng 2 cột HEX + ngày cho công đoạn `cdMacDinh`, đợt `dotMacDinh` (dòng nhiều cột hơn => báo).
 * Ô ngày trống = bỏ qua (không xoá); muốn xoá gõ "xoá" / "-". HEX bỏ số 0 đầu (khớp mã HEX của dữ liệu sản xuất).
 */
export function docDan(text: string, cdMacDinh: string | null, dotMacDinh: DotBot = 'cuoi'): KetQuaDan {
  const dong = text.replace(/\r/g, '').split('\n').map(x => x.split('\t')).filter(c => c.some(x => x.trim()));
  const ra: KetQuaDan = { ghi: [], loi: [] };
  if (!dong.length) return ra;
  const dau = dong[0].map(x => x.trim()).find(Boolean) ?? '';
  const coTieuDe = !/^\d/.test(dau);
  let cot: { i: number; cd: string; dot: DotBot }[];
  let hexCot = 0, batDau = 0;
  if (coTieuDe) {
    let tieuDe = dong[0].map(chuanTen);
    hexCot = tieuDe.findIndex(x => /\bHEX\b/.test(x));
    if (hexCot < 0) { ra.loi.push({ dong: 1, noiDung: dong[0].join(' | '), lyDo: 'Dòng tiêu đề không có cột HEX' }); return ra; }
    // Tiêu đề 2 dòng (file mẫu gộp ô): dòng 1 = công đoạn gộp 2 cột (ô sau trống), dòng 2 = ĐẦU / CUỐI
    const d2 = dong.length > 1 ? dong[1].map(chuanTen) : [];
    const laDot = (x: string) => /^(ĐỢT |DOT )?(ĐẦU|DAU|CUỐI|CUOI)$/.test(x);
    const haiDong = d2.some(laDot) && !/^\d/.test(d2[hexCot] ?? '');
    if (haiDong) {
      let cd = '';
      tieuDe = Array.from({ length: Math.max(tieuDe.length, d2.length) }, (_, i) => {
        if (tieuDe[i]) cd = tieuDe[i];
        return laDot(d2[i] ?? '') ? `${cd} ${d2[i]}` : tieuDe[i] ?? '';
      });
    }
    cot = tieuDe.map((x, i) => {
      const dot: DotBot = /ĐẦU|DAU/.test(x) ? 'dau' : 'cuoi';
      const gon = x.replace(/^(NGÀY BOT|BOT)\s*/, '').replace(/[\s_-]*(ĐỢT|DOT)?[\s_-]*(ĐẦU|DAU|CUỐI|CUOI)$/, '').trim();
      return { i, dot, cd: CONG_DOAN_BOT.find(c => gon === c) ?? '' };
    }).filter(x => x.i !== hexCot && x.cd);
    batDau = haiDong ? 2 : 1;
    if (!cot.length) { ra.loi.push({ dong: 1, noiDung: dong[0].join(' | '), lyDo: 'Không thấy cột công đoạn nào (P001, P014, GCVT…) cạnh cột HEX' }); return ra; }
  } else {
    if (!cdMacDinh) { ra.loi.push({ dong: 1, noiDung: dong[0].join(' | '), lyDo: 'Chọn công đoạn (dán 2 cột HEX + ngày) hoặc dán kèm dòng tiêu đề HEX, P001…' }); return ra; }
    cot = [{ i: 1, cd: cdMacDinh, dot: dotMacDinh }];
  }
  for (let r = batDau; r < dong.length; r++) {
    const c = dong[r];
    if (!coTieuDe && c.filter(x => x.trim()).length > 2) {
      ra.loi.push({ dong: r + 1, noiDung: c.join(' | '), lyDo: 'Dòng có hơn 2 cột — dán kèm dòng tiêu đề (HEX, P001, P014…) để biết cột nào là công đoạn nào' });
      continue;
    }
    const hex = String(c[hexCot] ?? '').trim().replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');
    if (!/^\d{6,15}$/.test(hex)) { ra.loi.push({ dong: r + 1, noiDung: c.join(' | '), lyDo: `HEX không hợp lệ: "${hex}"` }); continue; }
    for (const { i, cd, dot } of cot) {
      const raw = String(c[i] ?? '').trim();
      if (!raw) continue;
      const xoa = /^(-|xoá|xóa|xoa)$/i.test(raw);
      const ngay = xoa ? null : docNgayNhap(raw);
      if (ngay === undefined) { ra.loi.push({ dong: r + 1, noiDung: c.join(' | '), lyDo: `${cd}: ngày không đọc được "${raw}"` }); continue; }
      ra.ghi.push({ hex, congDoan: cd, dot, ngay });
    }
  }
  return ra;
}

/** Ngày của 1 nhóm HEX ở 1 công đoạn: giống nhau / khác nhau / thiếu */
export interface NgayNhom { ngay: string | null; tu: string | null; den: string | null; co: number; tong: number }
export function ngayNhom(hexs: readonly string[], khoa: string, ngay: Record<string, Record<string, string>>): NgayNhom {
  let tu: string | null = null, den: string | null = null, co = 0;
  for (const h of hexs) {
    const v = ngay[h]?.[khoa];
    if (!v) continue;
    co++;
    if (!tu || v < tu) tu = v;
    if (!den || v > den) den = v;
  }
  return { ngay: co && tu === den ? tu : null, tu, den, co, tong: hexs.length };
}
