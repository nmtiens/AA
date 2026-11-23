import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';
import { createCache, cachedByVersions, hashKey } from '../server/cache.js';
import { getRelevantVersions, hanPhienBan } from '../server/data.js';
import { vnDayKey } from '../server/common.js';
import { userHasPermission, MATERIAL_PRICE_PERMISSION } from '../server/permissions.js';
import { laNgayHopLe } from './tonKhoVt.js';
import { sqlHeSoGia } from '../server/heSoGiaVatTu.js';

// ============================================================================
// VẬT TƯ — ĐẶT / MUA THEO NHÓM SAP (bảng vat_tu: 1 dòng = 1 PR line) — trang /vat-tu/dat-mua (đợt 1, 21/11/2026)
//   GET /api/vat-tu/dat-mua/theo-nhom   mỗi nhóm SAP 3 số (split_part(nhom_vt,' - ',1)) 1 dòng: đếm dòng PR theo trạng
//                                       thái, giá trị PR / chờ về, PR chưa PO > 14 ngày, cần ≤ 14 ngày, về 7 ngày tới
//   GET /api/vat-tu/dat-mua/theo-ma     như trên nhưng gom theo (mã SAP, ĐVT) — bấm 1 nhóm ra bảng mã của nhóm
//   GET /api/vat-tu/dat-mua/dong        từng dòng PR (phân trang: trang, co) — bấm 1 ô số ra danh sách
//   GET /api/vat-tu/dat-mua/theo-thang  PR tạo (theo ngày PR) và hàng về (theo ngày thực tế về) mỗi tháng
//
// Bộ lọc chung (query): tu, den (ngày PR 'YYYY-MM-DD' — cột date, đã là ngày VN, không đổi múi giờ); ct (trackingno,
// nhiều mã cách dấu phẩy, kể cả SDC…); nhom (mã nhóm 3 số, nhiều; '-' = chưa phân nhóm); trangThai (khoá TRANG_THAI,
// nhiều); q (nhiều số PR / PO / mã SAP cách dấu cách, phẩy, chấm phẩy; chữ thì tìm trong tên vật tư / code VL);
// an806 / an401 / an800 / anHuy (mặc định 1 = ẨN nhóm 806 Gia công, 401 CCDC, mã đầu 800, dòng HỦY; gửi 0 để hiện —
// người dùng chốt 21/11/2026).
//
// - Trạng thái dòng tính ở MỘT chỗ trong SQL (sqlTrangThai) và có bản TS y hệt (trangThaiDongPr) để test — khớp
//   materialLineState (frontend/utils/productionMetrics.ts) cả nhóm cấp 1 lẫn cấp 2: HỦY ưu tiên; SAP 'Hoàn thành' = về
//   đủ; SAP 'Đóng' tách theo đã nhận; dòng còn mở mà PO hủy / tạm dừng / pending (isOnHoldLine) hoặc CCLD => 'tamDung'
//   (không còn chờ); kho báo về đủ (sl_hang_ve_thuc_te trong [yc; 1,5·yc]) hoặc Team PR ghi "HOÀN THÀNH" => về đủ; gia
//   công ngoài (806 / ghi chú GC…) => 'giaCong' (không bao giờ trễ); quá hạn mà cố ý về theo nhu cầu SX => 'theoNhuCau'
//   (không tính trễ). Hạn giao = ngày dự kiến PMH, Team PR ghi ngày muộn hơn vào ghi chú thì lấy ngày đó (materialDueDate).
//   3.ĐÃ NHẬP KHO gồm cả Hoàn thành lẫn Đóng => "về đủ" xét so_luong_da_nhan_sap ≥ so_luong_yeu_cau, không theo nhãn.
//   DB chạy locale C (upper() / ~* không biết chữ có dấu) => so khớp chữ dùng lớp hoa / thường tường minh (khongPhanBietHoa).
// - vat_tu.ma_vat_tu_sap / so_pr / so_po / pr_line là double precision => trả chuỗi (x::bigint)::text.
// - Tiền trong vat_tu là ĐỒNG => trả TRIỆU ĐỒNG (/1e6); riêng đơn giá dòng PR giữ đồng / 1 đvt. Mọi tổng bỏ dòng HỦY.
// - Quyền: 'materials' (như trang Dữ liệu vật tư). Giá trị PR / chờ về / đơn giá / thành tiền / NCC chỉ trả cho người có
//   'materials_view_price' — bỏ SAU cache (kết quả cache là bản đủ, không sửa tại chỗ), khoá cache có cờ quyền giá.
// - Cache theo phiên bản bảng 'material' (table_versions vat_tu) + ngày hôm nay giờ VN (trạng thái trễ / đúng hẹn đổi
//   theo ngày).
// ============================================================================

const QUYEN_XEM = 'materials';
const LOI_QUYEN = { error: 'Bạn chưa có quyền xem vật tư (Đặt – Mua)' };
const TIMEOUT_MS = 15000;
export const NHOM_TRONG_MA = '-';
export const NHOM_TRONG_TEN = 'Chưa phân nhóm';
const TRANG_MAC_DINH = 200;
const TRANG_TOI_DA = 30000; // xuất Excel lấy 1 lượt (vat_tu ~30 nghìn dòng)
const SO_MA_TOI_DA = 3000;
const SO_TU_TOI_DA = 300;

// ---------------------------------------------------------------------------
// TRẠNG THÁI DÒNG PR
// ---------------------------------------------------------------------------
export const TRANG_THAI = [
  'chuaMua', 'dungHen', 'tre', 'motPhan', 'theoNhuCau', 'giaCong', 'du', 'dongThieu', 'dongKhongPo', 'tamDung', 'huy',
] as const;
export type TrangThaiPr = typeof TRANG_THAI[number];
/** Có PO, đang chờ về (gồm về theo nhu cầu SX + gia công ngoài — như isMaterialPending) */
export const TT_DANG_VE: readonly TrangThaiPr[] = ['dungHen', 'tre', 'motPhan', 'theoNhuCau', 'giaCong'];
/** Còn phải chờ (chưa mua + đang về) */
export const TT_CON_CHO: readonly TrangThaiPr[] = ['chuaMua', ...TT_DANG_VE];
/** Mọi trạng thái trừ HỦY (ô "Số dòng PR") */
export const TT_KHONG_HUY: readonly TrangThaiPr[] = TRANG_THAI.filter(t => t !== 'huy');
/** Số kho báo về vượt quá bội số này của SL yêu cầu => coi là ghi khác đơn vị (= KHO_BAO_MAX_RATIO ở frontend) */
export const KHO_BAO_TOI_DA = 1.5;

// Biểu thức chính quy dùng CHUNG cho SQL (~) và JS (chuỗi đã NFC + viết hoa). Ghi tường minh hoa / thường từng chữ có dấu
// (upper() / ~* của Postgres với chữ có dấu tuỳ locale DB). Thêm nhãn mới thì sửa ở đây.
export const RE_HUY = '[Hh]([Ủủ][Yy]|[Uu][Ỷỷ])';
export const RE_DONG = '[Đđ][Óó][Nn][Gg]';
export const RE_HOAN_THANH = '[Hh][Oo][Àà][Nn] [Tt][Hh][Àà][Nn][Hh]';
export const RE_NHAP_KHO = '[Nn][Hh][Ậậ][Pp] [Kk][Hh][Oo]';
export const RE_CHUA_MUA = '[Cc][Hh][Ưư][Aa] [Mm][Uu][Aa]';
/**
 * Biểu thức viết HOA => không phân biệt hoa / thường bằng lớp ký tự tường minh, dùng chung cho SQL (~) và JS. Chỉ đổi
 * chữ cái, giữ nguyên ký tự đứng sau dấu gạch chéo ngược. Không dùng cho lớp có khoảng (a-z): ghép phần đó ngoài hàm này.
 */
export const khongPhanBietHoa = (re: string): string => {
  let ra = '', trongLop = false;
  const kt = [...re];
  for (let i = 0; i < kt.length; i++) {
    const ch = kt[i];
    if (ch === '\\') { ra += ch + (kt[++i] ?? ''); continue; }
    if (ch === '[') { trongLop = true; ra += ch; continue; }
    if (ch === ']') { trongLop = false; ra += ch; continue; }
    const t = ch.toLowerCase(), h = ch.toUpperCase();
    if (t === h || [...t].length !== 1 || [...h].length !== 1) { ra += ch; continue; }
    ra += trongLop ? h + t : `[${h}${t}]`;
  }
  return ra;
};
const ci = khongPhanBietHoa;
/** Ranh giới từ sau mã (như \b của JS: hết chuỗi hoặc ký tự không thuộc [0-9A-Za-z_]) */
const RANH_TU = '($|[^0-9A-Za-z_])';
// Luật cấp 2 của materialLineState (productionMetrics.ts: isOnHoldLine / isCcldLine / isDeferredLine / isOutsourcedLine /
// isDoneNote) — sửa bên đó thì sửa cả đây.
/** Tình trạng PO: hủy / tạm ngưng / công trình tạm dừng / chuyển thầu phụ / công trình đã hoàn thành */
export const RE_DUNG_PO = ci('H(ỦY|UỶ)|TẠM NG[ƯỪU]NG|TẠM D[ỪU]NG|THẦU PHỤ|CÔNG TRÌNH ĐÃ HOÀN THÀNH');
/** Ghi chú Team PR: hủy / tạm ngưng / pending */
export const RE_DUNG_GHI_CHU = ci('H(ỦY|UỶ)|TẠM NG[ƯỪU]NG|TẠM D[ỪU]NG|PENDING');
/** Ghi chú tình trạng PO: hủy yêu cầu / hủy phần còn lại / không mua nữa / tạm ngưng */
export const RE_DUNG_GHI_CHU_PO = ci('H(ỦY|UỶ) YÊU CẦU|H(ỦY|UỶ) PHẦN CÒN LẠI|KHÔNG MUA NỮA|TẠM NG[ƯỪU]NG|TẠM D[ỪU]NG');
export const RE_CCLD = ci('CCLD');
export const RE_CCLD_PO = ci('CUNG CẤP LẮP ĐẶT');
/** Team PR note + ' ' + ghi chú PO: về theo nhu cầu SX / dùng trước tồn kho */
export const RE_THEO_NHU_CAU = ci('NHU C[ẦA]U (SX|S[ẢA]N XU[ẤA]T)|D[ÙU]NG TR[ƯU][ỚO]C T[ỒO]N KHO');
/** Nhóm VT (đã trim) bắt đầu bằng mã 806 */
export const RE_NHOM_GIA_CONG = `^806${RANH_TU}`;
/** Ghi chú Team PR (đã trim): "GC BTP-…", "GC CÔNG ĐOẠN-…", "…#GIA CÔNG…" */
export const RE_GHI_CHU_GIA_CONG = `^${ci('GC')}${RANH_TU}|${ci('#GIA CÔNG')}`;
/** Ghi chú Team PR (đã trim) đúng "HOÀN THÀNH": hàng đã về, SAP chưa ghi nhập */
export const RE_GHI_CHU_XONG = `^${ci('HOÀN THÀNH')}$`;
/** sl_hang_ve_thuc_te là cột chữ: chỉ đọc khi là số */
export const RE_SO = '^-?[0-9]+([.][0-9]+)?$';
/** Ghi chú Team PR chỉ là 1 ngày ("2026-11-25", "… 00:00:00", "… 00:00:00.000") — ngày có thật (bỏ 29/02 cho chắc: to_date
 *  của Postgres báo lỗi ngày không có thật => hỏng cả truy vấn) */
export const RE_NGAY_GHI_CHU = String.raw`^\d{4}-((0[1-9]|1[0-2])-(0[1-9]|1\d|2[0-8])|(0[13-9]|1[0-2])-(29|30)|(0[13578]|1[02])-31)([ T]00:00(:00(\.0+)?)?)?$`;

/** Hạn giao dùng xét trễ (giống materialDueDate): ngày dự kiến PMH; ghi chú Team PR là ngày MUỘN hơn thì lấy ngày đó */
export const sqlHan = (b = 'v') =>
  `GREATEST(${b}.ngay_du_kien_giao_hang_pmh_nhap, CASE WHEN btrim(${b}.team_pr_note) ~ '${RE_NGAY_GHI_CHU}' THEN to_date(left(btrim(${b}.team_pr_note), 10), 'YYYY-MM-DD') END)`;

/** CASE trạng thái — MỘT chỗ duy nhất; `homNay` = biểu thức ngày hôm nay (tham số $n::date). Bản TS: trangThaiDongPr. */
export const sqlTrangThai = (homNay: string, b = 'v'): string => {
  const yc = `COALESCE(${b}.so_luong_yeu_cau, 0)`;
  const nhan = `COALESCE(${b}.so_luong_da_nhan_sap, 0)`;
  const st = `COALESCE(${b}.trang_thai, '')`;
  const sap = `COALESCE(${b}.trang_thai_sap, '')`;
  // Chữ ghi tay: chuẩn NFC (vài ô ghi chú PO dạng NFD) + bỏ khoảng trắng đầu / cuối (như upNfc)
  const note = `btrim(normalize(COALESCE(${b}.team_pr_note, ''), NFC))`;
  const po = `normalize(COALESCE(${b}.tinh_trang_po, ''), NFC)`;
  const gpo = `normalize(COALESCE(${b}.ghi_chu_tinh_trang_po, ''), NFC)`;
  const kho = `CASE WHEN btrim(${b}.sl_hang_ve_thuc_te) ~ '${RE_SO}' THEN btrim(${b}.sl_hang_ve_thuc_te)::float8 ELSE 0 END`;
  return `CASE
    WHEN ${st} ~ '${RE_HUY}' OR ${sap} ~ '${RE_HUY}' THEN 'huy'
    WHEN ${sap} ~ '${RE_HOAN_THANH}' THEN 'du'
    WHEN ${nhan} > 0 AND ${nhan} >= ${yc} THEN 'du'
    WHEN ${b}.so_luong_con_lai IS NOT NULL AND ${b}.so_luong_con_lai <= 0 AND ${yc} > 0 THEN 'du'
    WHEN ${sap} ~ '${RE_DONG}' OR ${st} ~ '${RE_NHAP_KHO}' THEN CASE WHEN ${b}.so_po IS NULL THEN 'dongKhongPo' ELSE 'dongThieu' END
    WHEN ${po} ~ '${RE_DUNG_PO}' OR ${note} ~ '${RE_DUNG_GHI_CHU}' OR ${gpo} ~ '${RE_DUNG_GHI_CHU_PO}' THEN 'tamDung'
    WHEN ${st} ~ '${RE_CHUA_MUA}' OR ${b}.so_po IS NULL THEN 'chuaMua'
    WHEN ${note} ~ '${RE_CCLD}' OR ${po} ~ '${RE_CCLD_PO}' THEN 'tamDung'
    WHEN ${yc} > 0 AND ${kho} >= ${yc} AND ${kho} <= ${yc} * ${KHO_BAO_TOI_DA} THEN 'du'
    WHEN ${note} ~ '${RE_GHI_CHU_XONG}' THEN 'du'
    WHEN btrim(normalize(COALESCE(${b}.nhom_vt, ''), NFC)) ~ '${RE_NHOM_GIA_CONG}' OR ${note} ~ '${RE_GHI_CHU_GIA_CONG}' THEN 'giaCong'
    WHEN ${sqlHan(b)} < ${homNay} THEN CASE WHEN (${note} || ' ' || ${gpo}) ~ '${RE_THEO_NHU_CAU}' THEN 'theoNhuCau' ELSE 'tre' END
    WHEN ${nhan} > 0 THEN 'motPhan'
    ELSE 'dungHen'
  END`;
};

export interface DongPrTho {
  trang_thai?: string | null;
  trang_thai_sap?: string | null;
  so_luong_yeu_cau?: number | null;
  so_luong_da_nhan_sap?: number | null;
  so_luong_con_lai?: number | null;
  so_po?: number | string | null;
  ngay_du_kien_giao_hang_pmh_nhap?: string | null;
  team_pr_note?: string | null;
  tinh_trang_po?: string | null;
  ghi_chu_tinh_trang_po?: string | null;
  sl_hang_ve_thuc_te?: string | number | null;
  nhom_vt?: string | null;
}

const reJs = (s: string) => new RegExp(s);
const RE_JS = {
  huy: reJs(RE_HUY), dong: reJs(RE_DONG), hoanThanh: reJs(RE_HOAN_THANH), nhapKho: reJs(RE_NHAP_KHO),
  chuaMua: reJs(RE_CHUA_MUA), ngayGhiChu: reJs(RE_NGAY_GHI_CHU),
  dungPo: reJs(RE_DUNG_PO), dungGhiChu: reJs(RE_DUNG_GHI_CHU), dungGhiChuPo: reJs(RE_DUNG_GHI_CHU_PO),
  ccld: reJs(RE_CCLD), ccldPo: reJs(RE_CCLD_PO), theoNhuCau: reJs(RE_THEO_NHU_CAU),
  nhomGiaCong: reJs(RE_NHOM_GIA_CONG), ghiChuGiaCong: reJs(RE_GHI_CHU_GIA_CONG), ghiChuXong: reJs(RE_GHI_CHU_XONG), so: reJs(RE_SO),
};
const chuoi = (v: unknown) => String(v ?? '').normalize('NFC');
const soHuu = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Hạn giao 'YYYY-MM-DD' (như sqlHan); không có => null */
export const hanGiao = (r: DongPrTho): string | null => {
  const pmh = /^\d{4}-\d{2}-\d{2}/.test(chuoi(r.ngay_du_kien_giao_hang_pmh_nhap)) ? chuoi(r.ngay_du_kien_giao_hang_pmh_nhap).slice(0, 10) : null;
  const note = chuoi(r.team_pr_note).trim();
  const n = RE_JS.ngayGhiChu.test(note) ? note.slice(0, 10) : null;
  if (pmh && n) return n > pmh ? n : pmh;
  return pmh ?? n;
};

/** Bản TS của sqlTrangThai (cùng thứ tự điều kiện) — `homNay` 'YYYY-MM-DD' giờ VN */
export const trangThaiDongPr = (r: DongPrTho, homNay: string): TrangThaiPr => {
  const st = chuoi(r.trang_thai), sap = chuoi(r.trang_thai_sap);
  const yc = soHuu(r.so_luong_yeu_cau) ?? 0, nhan = soHuu(r.so_luong_da_nhan_sap) ?? 0, cl = soHuu(r.so_luong_con_lai);
  const coPo = r.so_po !== null && r.so_po !== undefined && String(r.so_po).trim() !== '';
  if (RE_JS.huy.test(st) || RE_JS.huy.test(sap)) return 'huy';
  if (RE_JS.hoanThanh.test(sap)) return 'du';
  if (nhan > 0 && nhan >= yc) return 'du';
  if (cl !== null && cl <= 0 && yc > 0) return 'du';
  if (RE_JS.dong.test(sap) || RE_JS.nhapKho.test(st)) return coPo ? 'dongThieu' : 'dongKhongPo';
  const note = chuoi(r.team_pr_note).trim(), po = chuoi(r.tinh_trang_po), gpo = chuoi(r.ghi_chu_tinh_trang_po);
  if (RE_JS.dungPo.test(po) || RE_JS.dungGhiChu.test(note) || RE_JS.dungGhiChuPo.test(gpo)) return 'tamDung';
  if (RE_JS.chuaMua.test(st) || !coPo) return 'chuaMua';
  if (RE_JS.ccld.test(note) || RE_JS.ccldPo.test(po)) return 'tamDung';
  const khoTho = chuoi(r.sl_hang_ve_thuc_te).trim();
  const kho = RE_JS.so.test(khoTho) ? Number(khoTho) : 0;
  if (yc > 0 && kho >= yc && kho <= yc * KHO_BAO_TOI_DA) return 'du';
  if (RE_JS.ghiChuXong.test(note)) return 'du';
  if (RE_JS.nhomGiaCong.test(chuoi(r.nhom_vt).trim()) || RE_JS.ghiChuGiaCong.test(note)) return 'giaCong';
  const han = hanGiao(r);
  if (han !== null && han < homNay) return RE_JS.theoNhuCau.test(`${note} ${gpo}`) ? 'theoNhuCau' : 'tre';
  if (nhan > 0) return 'motPhan';
  return 'dungHen';
};

/** % đúng hẹn của dòng có PO chưa về đủ có xét hạn (không gồm gia công ngoài / về theo nhu cầu SX):
 *  (đúng hẹn + về một phần chưa trễ) / (đúng hẹn + về một phần + trễ); không có => null */
export const phanTramDungHen = (x: { dungHen: number; tre: number; motPhan: number }): number | null => {
  const mau = x.dungHen + x.tre + x.motPhan;
  return mau > 0 ? ((x.dungHen + x.motPhan) / mau) * 100 : null;
};

// ---------------------------------------------------------------------------
// ĐỌC THAM SỐ (hàm thuần — test backend/test/vatTu.test.ts)
// ---------------------------------------------------------------------------
export interface BoLoc {
  tu: string | null;
  den: string | null;
  ct: string[];
  nhom: string[];
  trangThai: TrangThaiPr[];
  /** số (PR / PO / mã) */
  so: string[];
  /** chữ (tên vật tư / code VL) */
  chu: string[];
  an806: boolean;
  an401: boolean;
  an800: boolean;
  anHuy: boolean;
}

/** Danh sách từ query: chuỗi hoặc mảng (lặp tham số), tách dấu phẩy (tachPhay = false: mỗi tham số là 1 giá trị nguyên
 *  vẹn — khoá có dấu phẩy như HEX ghép 'H1, H2'); bỏ trống, bỏ trùng, xếp tăng (khoá cache ổn định) */
export const docDanhSach = (v: unknown, toiDa = 200, kyTu = 100, tachPhay = true): string[] | null => {
  if (v === undefined || v === null || v === '') return [];
  const ds = Array.isArray(v) ? v : [v];
  const ra = new Set<string>();
  for (const x of ds) {
    if (typeof x !== 'string') return null;
    for (const p of tachPhay ? x.split(',') : [x]) {
      const t = p.trim();
      if (!t) continue;
      if (t.length > kyTu) return null;
      ra.add(t);
    }
  }
  if (ra.size > toiDa) return null;
  return [...ra].sort();
};

const docCo = (v: unknown, macDinh: boolean): boolean => {
  if (v === undefined || v === null || v === '') return macDinh;
  const s = String(v).toLowerCase();
  return !(s === '0' || s === 'false');
};

/** Ô tìm: tách dấu cách / phẩy / chấm phẩy / xuống dòng; số (≤ 15 chữ số, bỏ ".0" đuôi khi dán từ Excel) => so số PR / PO /
 *  mã; còn lại => tìm chữ trong tên vật tư / code VL */
export const tachTimKiem = (q: string): { so: string[]; chu: string[] } | null => {
  const tu = q.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  if (tu.length > SO_TU_TOI_DA) return null;
  const so = new Set<string>(), chu = new Set<string>();
  for (const t of tu) {
    const m = /^0*(\d{1,15})(?:\.0+)?$/.exec(t);
    if (m) so.add(m[1]);
    else chu.add(t.normalize('NFC'));
  }
  return { so: [...so].sort(), chu: [...chu].sort() };
};

export const docBoLoc = (q: Record<string, unknown>): { hopLe: true; loc: BoLoc } | { hopLe: false; loi: string } => {
  const tu = q.tu === undefined || q.tu === '' ? null : q.tu;
  const den = q.den === undefined || q.den === '' ? null : q.den;
  if (tu !== null && !laNgayHopLe(tu)) return { hopLe: false, loi: 'Ngày "từ" không hợp lệ' };
  if (den !== null && !laNgayHopLe(den)) return { hopLe: false, loi: 'Ngày "đến" không hợp lệ' };
  const ct = docDanhSach(q.ct);
  const nhom = docDanhSach(q.nhom, 100, 10);
  const tt = docDanhSach(q.trangThai, 20, 20);
  if (!ct) return { hopLe: false, loi: 'Danh sách công trình không hợp lệ' };
  if (!nhom || nhom.some(n => n !== NHOM_TRONG_MA && !/^\d{1,5}$/.test(n))) return { hopLe: false, loi: 'Danh sách nhóm không hợp lệ' };
  if (!tt || tt.some(t => !(TRANG_THAI as readonly string[]).includes(t))) return { hopLe: false, loi: 'Trạng thái không hợp lệ' };
  let so: string[] = [], chu: string[] = [];
  if (q.q !== undefined && q.q !== '') {
    if (typeof q.q !== 'string' || q.q.length > 4000) return { hopLe: false, loi: 'Ô tìm quá dài' };
    const t = tachTimKiem(q.q);
    if (!t) return { hopLe: false, loi: 'Ô tìm có quá nhiều mục' };
    ({ so, chu } = t);
  }
  return {
    hopLe: true,
    loc: {
      tu: tu as string | null, den: den as string | null, ct, nhom, trangThai: tt as TrangThaiPr[], so, chu,
      an806: docCo(q.an806, true), an401: docCo(q.an401, true), an800: docCo(q.an800, true), anHuy: docCo(q.anHuy, true),
    },
  };
};

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
/** Dòng đã tính sẵn: trạng thái, hạn, mã nhóm, mã SAP chuỗi */
export const sqlNguon = (homNay: string) => `
  SELECT v.*,
         ${sqlTrangThai(homNay)} AS tt,
         ${sqlHan()} AS han,
         COALESCE(NULLIF(split_part(btrim(v.nhom_vt), ' - ', 1), ''), '${NHOM_TRONG_MA}') AS ma_nhom,
         CASE WHEN v.ma_vat_tu_sap IS NULL THEN NULL ELSE (v.ma_vat_tu_sap::bigint)::text END AS ma,
         CASE WHEN v.so_pr IS NULL THEN NULL ELSE (v.so_pr::bigint)::text END AS so_pr_txt,
         CASE WHEN v.so_po IS NULL THEN NULL ELSE (v.so_po::bigint)::text END AS so_po_txt,
         v.don_gia / ${sqlHeSoGia()} AS don_gia_dc,
         v.thanh_tien / ${sqlHeSoGia()} AS thanh_tien_dc
  FROM vat_tu v`;

// Hệ số đơn giá bê tông 117 (TẠM) — chuyển sang server/heSoGiaVatTu.ts để /api/material dùng chung
export { sqlHeSoGia };

/** Điều kiện lọc trên dòng đã tính (bí danh b). Tham số $1 luôn là ngày hôm nay; trả thêm tham số từ $2. */
export const sqlDieuKien = (loc: BoLoc, params: unknown[], boNgay = false): string => {
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const dk: string[] = [];
  if (!boNgay && loc.tu) dk.push(`b.ngay_pr >= ${p(loc.tu)}::date`);
  if (!boNgay && loc.den) dk.push(`b.ngay_pr <= ${p(loc.den)}::date`);
  if (loc.ct.length) dk.push(`btrim(b.trackingno) = ANY(${p(loc.ct)}::text[])`);
  if (loc.nhom.length) dk.push(`b.ma_nhom = ANY(${p(loc.nhom)}::text[])`);
  if (loc.trangThai.length) dk.push(`b.tt = ANY(${p(loc.trangThai)}::text[])`);
  if (loc.anHuy && !loc.trangThai.includes('huy')) dk.push(`b.tt <> 'huy'`);
  if (loc.an806 && !loc.nhom.includes('806')) dk.push(`b.ma_nhom <> '806'`);
  if (loc.an401 && !loc.nhom.includes('401')) dk.push(`b.ma_nhom <> '401'`);
  if (loc.an800) dk.push(`COALESCE(b.ma, '') NOT LIKE '800%'`);
  // Ô tìm: các số (PR / PO / mã) nối OR; các từ chữ nối AND ("kính ghép" = có cả "kính" lẫn "ghép"); hai nhóm nối OR
  const tim: string[] = [];
  if (loc.so.length) {
    const ps = p(loc.so);
    tim.push(`b.so_pr_txt = ANY(${ps}::text[]) OR b.so_po_txt = ANY(${ps}::text[]) OR b.ma = ANY(${ps}::text[])`);
  }
  if (loc.chu.length) {
    tim.push(loc.chu.map(c => {
      const pc = p(`%${c.replace(/[\\%_]/g, m => `\\${m}`)}%`);
      return `(b.ten_vat_tu ILIKE ${pc} OR b.code_vat_lieu ILIKE ${pc} OR b.ma_nha_may ILIKE ${pc})`;
    }).join(' AND '));
  }
  if (tim.length) dk.push(`(${tim.map(t => `(${t})`).join(' OR ')})`);
  return dk.length ? `WHERE ${dk.join(' AND ')}` : '';
};

export const DS_SQL = (xs: readonly string[]) => xs.map(x => `'${x}'`).join(',');

/** Các cột gộp dùng chung cho theo-nhom / theo-ma (bí danh b; $1 = hôm nay) */
export const SQL_GOP = `
  COUNT(*) FILTER (WHERE b.tt <> 'huy') AS so_dong,
  ${TRANG_THAI.map(t => `COUNT(*) FILTER (WHERE b.tt = '${t}') AS "${t}"`).join(',\n  ')},
  COALESCE(SUM(b.thanh_tien_dc) FILTER (WHERE b.tt <> 'huy'), 0) / 1e6 AS gia_tri_pr,
  COALESCE(SUM(GREATEST(COALESCE(b.so_luong_con_lai, 0), 0) * COALESCE(b.don_gia_dc, 0)) FILTER (WHERE b.tt IN (${DS_SQL(TT_DANG_VE)})), 0) / 1e6 AS gia_tri_cho,
  COUNT(*) FILTER (WHERE b.tt = 'chuaMua' AND b.ngay_pr < $1::date - 14) AS pr_chua_po_14,
  COUNT(*) FILTER (WHERE b.tt IN (${DS_SQL(TT_CON_CHO)}) AND b.ngay_can_vat_tu <= $1::date + 14) AS can_14,
  COUNT(*) FILTER (WHERE b.tt IN ('dungHen','motPhan') AND b.han BETWEEN $1::date AND $1::date + 7) AS ve_7`;

// ---------------------------------------------------------------------------
// KIỂU KẾT QUẢ (hợp đồng với frontend/services/vatTuApi.ts)
// ---------------------------------------------------------------------------
export interface SoGop {
  soDong: number;
  chuaMua: number; dungHen: number; tre: number; motPhan: number; theoNhuCau: number; giaCong: number;
  du: number; dongThieu: number; dongKhongPo: number; tamDung: number; huy: number;
  /** % đúng hẹn của dòng đang về; null = không có dòng đang về */
  ptDungHen: number | null;
  /** Triệu đồng — null khi không có quyền giá */
  giaTriPr: number | null;
  giaTriCho: number | null;
  prChuaPoQua14: number;
  canTrong14: number;
  ve7Ngay: number;
}
export interface DongNhom extends SoGop {
  ma: string; ten: string; soMa: number;
  /** Tiêu hao TB 3 tháng đủ (triệu, bảng xuat_tieu_hao_vt); null = chưa có bảng / không có quyền giá */
  tieuHaoTb3?: number | null;
}
/** Thông tin tiêu hao gắn kèm Đặt – Mua: null = chưa có bảng xuat_tieu_hao_vt */
export interface KemTieuHao { thangTb3: string[] }
export interface TheoNhom {
  capNhat: string | null; homNay: string; coGia: boolean; nhom: DongNhom[]; tong: SoGop & { soMa: number; tieuHaoTb3?: number | null };
  tieuHao?: KemTieuHao | null;
}
export interface DongMa extends SoGop {
  ma: string | null; ten: string | null; dvt: string | null; nhom: string;
  slCho: number; veGanNhat: string | null;
  /** Tiêu hao TB 3 tháng đủ theo MÃ (mọi ĐVT): giá trị (triệu), SL + ĐVT xuất (SAP base unit) */
  tieuHaoTb3?: number | null;
  slTieuHaoTb3?: number | null;
  dvtTieuHao?: string | null;
  /** Tồn hiện tại (ton_kho_vt lần chốt mới nhất) + ĐVT tồn */
  tonHienTai?: number | null;
  dvtTon?: string | null;
  /** Tồn / SL tiêu hao TB 3 tháng (null khi khác ĐVT / không tiêu hao) */
  soThangDuDung?: number | null;
}
export interface TheoMa { capNhat: string | null; homNay: string; coGia: boolean; ma: DongMa[]; catBot: boolean; tieuHao?: KemTieuHao | null }
export interface DongPr {
  id: number; soPr: string | null; prLine: number | null; ngayPr: string | null; trackingno: string | null; tenCongTrinh: string | null;
  ma: string | null; tenVatTu: string | null; nhomVt: string | null; dvt: string | null;
  slYeuCau: number | null; slDaNhan: number | null; slConLai: number | null;
  soPo: string | null; nhaCungCap: string | null; tinhTrangPo: string | null;
  ngayCan: string | null; han: string | null; ngayDuKien: string | null; ngayThucTeVe: string | null;
  /** Đồng / 1 đvt */
  donGia: number | null;
  /** Triệu đồng */
  thanhTien: number | null;
  trangThai: string | null; trangThaiSap: string | null; tt: TrangThaiPr;
  teamPrNote: string | null; ghiChuPo: string | null; nguoiYeuCau: string | null; maNhaMay: string | null; codeVatLieu: string | null; itemNote: string | null;
}
export interface DanhSachDong { capNhat: string | null; homNay: string; coGia: boolean; tong: number; trang: number; co: number; dong: DongPr[] }
export interface DiemThang { thang: string; prDong: number; prGiaTri: number | null; veDong: number; veGiaTri: number | null }
export interface TheoThang { capNhat: string | null; homNay: string; coGia: boolean; thang: DiemThang[] }

const so = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const chuoiHoacNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

const docGop = (r: Record<string, unknown>): SoGop => {
  const x = {
    soDong: so(r.so_dong),
    chuaMua: so(r.chuaMua), dungHen: so(r.dungHen), tre: so(r.tre), motPhan: so(r.motPhan),
    theoNhuCau: so(r.theoNhuCau), giaCong: so(r.giaCong), du: so(r.du),
    dongThieu: so(r.dongThieu), dongKhongPo: so(r.dongKhongPo), tamDung: so(r.tamDung), huy: so(r.huy),
    giaTriPr: so(r.gia_tri_pr), giaTriCho: so(r.gia_tri_cho),
    prChuaPoQua14: so(r.pr_chua_po_14), canTrong14: so(r.can_14), ve7Ngay: so(r.ve_7),
  };
  return { ...x, ptDungHen: phanTramDungHen(x) };
};

/** Bỏ số tiền khi không có quyền giá — trả bản MỚI (không sửa đối tượng đang nằm trong cache) */
export const boGia = <T extends { giaTriPr: number | null; giaTriCho: number | null }>(x: T): T => ({ ...x, giaTriPr: null, giaTriCho: null });

// ---------------------------------------------------------------------------
// TÍNH (chay = hàm chạy truy vấn; mặc định timedQuery — truyền hàm khác để chạy thử trên giao dịch chỉ đọc)
// ---------------------------------------------------------------------------
export type Chay = (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
const chayMacDinh: Chay = (text, params) => timedQuery(text, params, { timeoutMs: TIMEOUT_MS, workMemMb: 32 });

export const tinhTheoNhom = async (loc: BoLoc, homNay: string, capNhat: string | null, chay: Chay = chayMacDinh): Promise<TheoNhom> => {
  const params: unknown[] = [homNay];
  const where = sqlDieuKien(loc, params);
  const r = await chay(
    `WITH b AS (${sqlNguon('$1::date')})
     SELECT b.ma_nhom, MIN(btrim(b.nhom_vt)) AS ten, COUNT(DISTINCT b.ma) AS so_ma, GROUPING(b.ma_nhom) AS la_tong, ${SQL_GOP}
     FROM b ${where}
     GROUP BY GROUPING SETS ((b.ma_nhom), ())`,
    params);
  let tong: TheoNhom['tong'] | null = null;
  const nhom: DongNhom[] = [];
  for (const row of r.rows as Array<Record<string, unknown>>) {
    const g = docGop(row);
    if (so(row.la_tong) === 1) { tong = { ...g, soMa: so(row.so_ma) }; continue; }
    const ma = String(row.ma_nhom ?? NHOM_TRONG_MA);
    nhom.push({ ...g, ma, ten: ma === NHOM_TRONG_MA ? NHOM_TRONG_TEN : (chuoiHoacNull(row.ten) ?? ma), soMa: so(row.so_ma) });
  }
  nhom.sort((a, b) => b.soDong - a.soDong || a.ma.localeCompare(b.ma));
  const rong: TheoNhom['tong'] = {
    soDong: 0, chuaMua: 0, dungHen: 0, tre: 0, motPhan: 0, theoNhuCau: 0, giaCong: 0, du: 0, dongThieu: 0, dongKhongPo: 0,
    tamDung: 0, huy: 0,
    ptDungHen: null, giaTriPr: 0, giaTriCho: 0, prChuaPoQua14: 0, canTrong14: 0, ve7Ngay: 0, soMa: 0,
  };
  return { capNhat, homNay, coGia: true, nhom, tong: tong ?? rong };
};

export const tinhTheoMa = async (loc: BoLoc, homNay: string, capNhat: string | null, chay: Chay = chayMacDinh): Promise<TheoMa> => {
  const params: unknown[] = [homNay];
  const where = sqlDieuKien(loc, params);
  const r = await chay(
    `WITH b AS (${sqlNguon('$1::date')})
     SELECT b.ma, NULLIF(btrim(b.dvt), '') AS dvt,
            (ARRAY_AGG(b.ten_vat_tu ORDER BY b.ngay_pr DESC NULLS LAST, b.id DESC))[1] AS ten,
            MIN(b.ma_nhom) AS nhom,
            COALESCE(SUM(GREATEST(COALESCE(b.so_luong_con_lai, 0), 0)) FILTER (WHERE b.tt IN (${DS_SQL(TT_DANG_VE)})), 0) AS sl_cho,
            to_char(MIN(b.han) FILTER (WHERE b.tt IN ('dungHen','motPhan') AND b.han >= $1::date), 'YYYY-MM-DD') AS ve_gan_nhat,
            ${SQL_GOP}
     FROM b ${where}
     GROUP BY b.ma, 2
     ORDER BY COUNT(*) FILTER (WHERE b.tt IN (${DS_SQL(TT_CON_CHO)})) DESC, COUNT(*) DESC, b.ma NULLS LAST
     LIMIT ${SO_MA_TOI_DA + 1}`,
    params);
  const rows = r.rows as Array<Record<string, unknown>>;
  const ma: DongMa[] = rows.slice(0, SO_MA_TOI_DA).map(row => ({
    ...docGop(row),
    ma: chuoiHoacNull(row.ma), ten: chuoiHoacNull(row.ten), dvt: chuoiHoacNull(row.dvt), nhom: String(row.nhom ?? NHOM_TRONG_MA),
    slCho: so(row.sl_cho), veGanNhat: chuoiHoacNull(row.ve_gan_nhat),
  }));
  return { capNhat, homNay, coGia: true, ma, catBot: rows.length > SO_MA_TOI_DA };
};

export type LoaiO = 'prChuaPoQua14' | 'canTrong14' | 've7Ngay' | 'conCho' | 'dangVe';
const LOAI_O: Record<LoaiO, string> = {
  prChuaPoQua14: `b.tt = 'chuaMua' AND b.ngay_pr < $1::date - 14`,
  canTrong14: `b.tt IN (${DS_SQL(TT_CON_CHO)}) AND b.ngay_can_vat_tu <= $1::date + 14`,
  ve7Ngay: `b.tt IN ('dungHen','motPhan') AND b.han BETWEEN $1::date AND $1::date + 7`,
  conCho: `b.tt IN (${DS_SQL(TT_CON_CHO)})`,
  dangVe: `b.tt IN (${DS_SQL(TT_DANG_VE)})`,
};

/** Ô / mã được bấm của /dong: ma ('' = dòng không có mã SAP), dvt (bảng mã gom theo mã + ĐVT; '' = không ghi ĐVT;
 *  null = mọi ĐVT), loai (ô bấm đặc biệt) */
export interface ChonDong { ma: string | null; dvt: string | null; loai: LoaiO | null }

/** Điều kiện của /dong: bộ lọc chung + mã + ĐVT + ô bấm */
const dieuKienDong = (loc: BoLoc, chon: ChonDong, params: unknown[]): string => {
  const where = sqlDieuKien(loc, params);
  const them: string[] = [];
  const { ma, dvt, loai } = chon;
  if (ma !== null) {
    if (ma === '') them.push('b.ma IS NULL');
    else { params.push(ma); them.push(`b.ma = $${params.length}`); }
  }
  // Cùng biểu thức ĐVT với GROUP BY của tinhTheoMa
  if (dvt !== null) { params.push(dvt === '' ? null : dvt); them.push(`NULLIF(btrim(b.dvt), '') IS NOT DISTINCT FROM $${params.length}::text`); }
  if (loai) them.push(LOAI_O[loai]);
  if (!them.length) return where;
  return where ? `${where} AND ${them.join(' AND ')}` : `WHERE ${them.join(' AND ')}`;
};

export const tinhDong = async (
  loc: BoLoc, chon: ChonDong, trang: number, co: number, homNay: string, capNhat: string | null,
  chay: Chay = chayMacDinh,
): Promise<DanhSachDong> => {
  const params: unknown[] = [homNay];
  const where = dieuKienDong(loc, chon, params);
  params.push(co, (trang - 1) * co);
  const r = await chay(
    `WITH b AS (${sqlNguon('$1::date')})
     SELECT b.id, b.so_pr_txt, b.pr_line, to_char(b.ngay_pr, 'YYYY-MM-DD') AS ngay_pr, b.trackingno, b.ten_cong_trinh,
            b.ma, b.ten_vat_tu, b.nhom_vt, b.dvt, b.so_luong_yeu_cau, b.so_luong_da_nhan_sap, b.so_luong_con_lai,
            b.so_po_txt, b.nha_cung_cap, b.tinh_trang_po,
            to_char(b.ngay_can_vat_tu, 'YYYY-MM-DD') AS ngay_can, to_char(b.han, 'YYYY-MM-DD') AS han,
            to_char(b.ngay_du_kien_giao_hang_pmh_nhap, 'YYYY-MM-DD') AS ngay_du_kien, to_char(b.ngay_thuc_te_ve, 'YYYY-MM-DD') AS ngay_ve,
            b.don_gia_dc AS don_gia, b.thanh_tien_dc / 1e6 AS thanh_tien, b.trang_thai, b.trang_thai_sap, b.tt,
            b.team_pr_note, b.ghi_chu_tinh_trang_po, b.nguoi_yeu_cau, b.ma_nha_may, b.code_vat_lieu, b.item_note_pr,
            COUNT(*) OVER () AS tong
     FROM b ${where}
     ORDER BY b.ngay_pr DESC NULLS LAST, b.so_pr DESC NULLS LAST, b.pr_line NULLS LAST, b.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params);
  const rows = r.rows as Array<Record<string, unknown>>;
  let tong = rows.length ? so(rows[0].tong) : 0;
  if (!rows.length && trang > 1) {
    // Trang vượt cuối: vẫn trả tổng đúng
    const p2: unknown[] = [homNay];
    const c = await chay(`WITH b AS (${sqlNguon('$1::date')}) SELECT COUNT(*) AS n FROM b ${dieuKienDong(loc, chon, p2)}`, p2);
    tong = so((c.rows[0] as Record<string, unknown>)?.n);
  }
  const soHoacNull = (v: unknown) => { if (v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const dong: DongPr[] = rows.map(x => ({
    id: so(x.id), soPr: chuoiHoacNull(x.so_pr_txt), prLine: soHoacNull(x.pr_line), ngayPr: chuoiHoacNull(x.ngay_pr),
    trackingno: chuoiHoacNull(x.trackingno), tenCongTrinh: chuoiHoacNull(x.ten_cong_trinh),
    ma: chuoiHoacNull(x.ma), tenVatTu: chuoiHoacNull(x.ten_vat_tu), nhomVt: chuoiHoacNull(x.nhom_vt), dvt: chuoiHoacNull(x.dvt),
    slYeuCau: soHoacNull(x.so_luong_yeu_cau), slDaNhan: soHoacNull(x.so_luong_da_nhan_sap), slConLai: soHoacNull(x.so_luong_con_lai),
    soPo: chuoiHoacNull(x.so_po_txt), nhaCungCap: chuoiHoacNull(x.nha_cung_cap), tinhTrangPo: chuoiHoacNull(x.tinh_trang_po),
    ngayCan: chuoiHoacNull(x.ngay_can), han: chuoiHoacNull(x.han), ngayDuKien: chuoiHoacNull(x.ngay_du_kien), ngayThucTeVe: chuoiHoacNull(x.ngay_ve),
    donGia: soHoacNull(x.don_gia), thanhTien: soHoacNull(x.thanh_tien),
    trangThai: chuoiHoacNull(x.trang_thai), trangThaiSap: chuoiHoacNull(x.trang_thai_sap), tt: String(x.tt) as TrangThaiPr,
    teamPrNote: chuoiHoacNull(x.team_pr_note), ghiChuPo: chuoiHoacNull(x.ghi_chu_tinh_trang_po), nguoiYeuCau: chuoiHoacNull(x.nguoi_yeu_cau),
    maNhaMay: chuoiHoacNull(x.ma_nha_may), codeVatLieu: chuoiHoacNull(x.code_vat_lieu), itemNote: chuoiHoacNull(x.item_note_pr),
  }));
  return { capNhat, homNay, coGia: true, tong, trang, co, dong };
};

export const tinhTheoThang = async (loc: BoLoc, homNay: string, capNhat: string | null, chay: Chay = chayMacDinh): Promise<TheoThang> => {
  // Lọc chung (trừ khoảng ngày); khoảng ngày áp theo từng cột: ngày PR cho "PR tạo", ngày thực tế về cho "hàng về"
  const params: unknown[] = [homNay];
  const where = sqlDieuKien(loc, params, true);
  const khoang = (cot: string) => {
    const d: string[] = [];
    if (loc.tu) { params.push(loc.tu); d.push(`${cot} >= $${params.length}::date`); }
    if (loc.den) { params.push(loc.den); d.push(`${cot} <= $${params.length}::date`); }
    return d.length ? `AND ${d.join(' AND ')}` : '';
  };
  const kPr = khoang('l.ngay_pr');
  const kVe = khoang('l.ngay_thuc_te_ve');
  const r = await chay(
    `WITH b AS (${sqlNguon('$1::date')}),
          l AS (SELECT * FROM b ${where})
     SELECT thang, SUM(pr_dong) AS pr_dong, SUM(pr_gt) AS pr_gt, SUM(ve_dong) AS ve_dong, SUM(ve_gt) AS ve_gt
     FROM (
       SELECT to_char(l.ngay_pr, 'YYYY-MM') AS thang, COUNT(*) AS pr_dong, COALESCE(SUM(l.thanh_tien_dc), 0) / 1e6 AS pr_gt, 0 AS ve_dong, 0 AS ve_gt
       FROM l WHERE l.tt <> 'huy' AND l.ngay_pr IS NOT NULL ${kPr} GROUP BY 1
       UNION ALL
       SELECT to_char(l.ngay_thuc_te_ve, 'YYYY-MM'), 0, 0, COUNT(*),
              COALESCE(SUM(COALESCE(l.so_luong_da_nhan_sap, 0) * COALESCE(l.don_gia_dc, 0)), 0) / 1e6
       FROM l WHERE l.tt <> 'huy' AND l.ngay_thuc_te_ve IS NOT NULL AND COALESCE(l.so_luong_da_nhan_sap, 0) > 0 ${kVe} GROUP BY 1
     ) x
     GROUP BY thang ORDER BY thang`,
    params);
  const thang: DiemThang[] = (r.rows as Array<Record<string, unknown>>).map(x => ({
    thang: String(x.thang), prDong: so(x.pr_dong), prGiaTri: so(x.pr_gt), veDong: so(x.ve_dong), veGiaTri: so(x.ve_gt),
  }));
  return { capNhat, homNay, coGia: true, thang };
};

// ============================================================================
// XUẤT TIÊU HAO VẬT TƯ (bảng xuat_tieu_hao_vt: 1 dòng = 1 dòng chứng từ MB51) — trang /vat-tu/tieu-hao (đợt 4)
//   GET /api/vat-tu/tieu-hao/tong-hop  thẻ số + bảng gộp theo `theo` (thang | nhom | ct | hex | ma | xuong) × tháng
//   GET /api/vat-tu/tieu-hao/chi-tiet  từng dòng chứng từ (phân trang: trang, co) — bấm 1 ô số ra danh sách
//
// - Bảng do tool nạp từ file tháng 14_XUAT_TIEU_HAO_SAP (người dùng tự tạo bảng + nạp lượt đầu). CHƯA có bảng (42P01)
//   => mọi endpoint trả { chuaCo: true } (không 500); Đặt – Mua thì các cột tiêu hao = null.
// - so_luong / gia_tri giữ DẤU như SAP: xuất (261, Z14) âm, hoàn trả 262 dương. gia_tri đã là TRIỆU ĐỒNG.
//   TIÊU HAO (số dương) = −SUM(261 + 262) (xuất trừ hoàn trả — người dùng chốt 21/11/2026);
//   HAO HỤT = −SUM(Z14), hiện RIÊNG; % hao hụt = hao hụt / (tiêu hao + hao hụt).
// - Trục nhóm: nhóm SAP 3 số (cột nhom_sap đã phân giải lúc nạp; lấy phần trước ' - ' cho chắc), trống => '-' (chưa phân
//   nhóm). Mặc định ẨN nhóm 806 / 401 (an806 / an401 = 0 để hiện) như Đặt – Mua.
// - Mã 200* (bán thành phẩm) / 300* (thành phẩm) xuất lại vào lệnh: tool nạp ghi nguon_nhom 'BTP' / 'TP' => khoá nhóm
//   riêng 'BTP' / 'TP', mặc định ẨN (anBtp = 0 để hiện) — vật tư làm ra BTP đã tính ở lệnh BTP, cộng nữa là trùng.
//   Đặt – Mua (TB 3 tháng theo nhóm) luôn bỏ 2 nhóm này.
// - Z15 (hoàn hao hụt, nếu SAP có) trừ vào hao hụt như 262 trừ vào tiêu hao.
// - Bộ lọc: tu, den (tháng 'YYYY-MM'); nhom (mã 3 số, nhiều; '-' = chưa phân nhóm); ct (mã CT, nhiều; '-' = chưa ghép);
//   hex (nhiều; '-' = chưa ghép; KHÔNG tách dấu phẩy — HEX ghép 'H1, H2' là 1 khoá, gửi lặp tham số); xuong (như hex); mvt ('' = tất cả, 'tieuHao' = 261/262, 'z14'); q (số: mã VT / số chứng
//   từ / lệnh SX / SO; chữ: tên vật tư / HEX / mã CT); chuaGhep=1 (dòng không ghép được cả CT lẫn HEX).
// - TB 3 tháng = trung bình 3 tháng ĐỦ gần nhất theo ngày dữ liệu mới nhất (thangTb3): dữ liệu tới 20/11 => T8–T10;
//   tới 30/11 => T9–T11. Không theo khoảng tháng đang lọc. Tháng không có dòng tính 0.
// - Quyền xem 'vt_tieu_hao'; giá trị chỉ trả cho 'materials_view_price' — bỏ SAU cache (cache là bản đủ).
// - Cache theo phiên bản RIÊNG (table_versions 'xuat_tieu_hao_vt' + 'ton_kho_vt'; chưa có dòng phiên bản thì theo bộ đếm
//   ghi của pg_stat_user_tables), như tonKhoVt.ts — không thêm vào TABLE_TO_VERSION_KEY.
// ============================================================================

export const QUYEN_TIEU_HAO = 'vt_tieu_hao';
const LOI_QUYEN_TH = { error: 'Bạn chưa có quyền xem xuất tiêu hao vật tư' };
export const BANG_TIEU_HAO = 'xuat_tieu_hao_vt';
export const THEO_TIEU_HAO = ['thang', 'nhom', 'ct', 'hex', 'ma', 'xuong'] as const;
export type TheoTieuHao = typeof THEO_TIEU_HAO[number];
export const MVT_TIEU_HAO = ['', 'tieuHao', 'z14'] as const;
export type MvtTieuHao = typeof MVT_TIEU_HAO[number];
/** Khoá "chưa ghép / trống" của CT / HEX / xưởng / nhóm */
export const KHOA_TRONG = '-';
/** Khoá nhóm của mã bán thành phẩm (200*) / thành phẩm (300*) xuất lại vào lệnh (nguon_nhom của tool nạp) */
export const NHOM_BTP = ['BTP', 'TP'];
const TEN_NHOM_BTP: Record<string, string> = { BTP: 'BTP - Bán thành phẩm xuất lại vào lệnh', TP: 'TP - Thành phẩm xuất lại vào lệnh' };
/** Bảng ct / hex / mã: tối đa bấy nhiêu dòng (xếp theo tiêu hao + hao hụt giảm dần) */
const SO_DONG_TH_TOI_DA = 2000;

export const laThang = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** 'YYYY-MM' lùi / tiến n tháng */
export const congThang = (thang: string, n: number): string => {
  const y = Number(thang.slice(0, 4)), m = Number(thang.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}`;
};

/** Tháng ĐỦ cuối cùng theo ngày dữ liệu mới nhất: ngày cuối tháng => chính tháng đó, còn lại => tháng trước */
export const thangDuCuoi = (maxNgay: string | null): string | null => {
  if (!maxNgay || !/^\d{4}-\d{2}-\d{2}/.test(maxNgay)) return null;
  const y = Number(maxNgay.slice(0, 4)), m = Number(maxNgay.slice(5, 7)), d = Number(maxNgay.slice(8, 10));
  const cuoi = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const thang = maxNgay.slice(0, 7);
  return d >= cuoi ? thang : congThang(thang, -1);
};

/** 3 tháng đủ gần nhất (tăng dần) — mẫu số của TB 3 tháng luôn là 3 */
export const thangTb3 = (maxNgay: string | null): string[] => {
  const c = thangDuCuoi(maxNgay);
  return c ? [congThang(c, -2), congThang(c, -1), c] : [];
};

/** ĐVT so khớp: bỏ khoảng trắng, viết hoa */
const dvtChuan = (v: string | null | undefined) => String(v ?? '').trim().toUpperCase();

/**
 * Số tháng đủ dùng = tồn hiện tại / SL tiêu hao TB 3 tháng. null khi: thiếu tồn, TB ≤ 0, hoặc ĐVT tồn và ĐVT xuất
 * khác nhau (cả hai đều có ghi) — không chia 2 số khác đơn vị. Tồn ≤ 0 => 0.
 */
export const soThangDuDung = (ton: number | null, dvtTon: string | null, slTb3: number | null, dvtXuat: string | null): number | null => {
  if (ton === null || slTb3 === null || !Number.isFinite(ton) || !Number.isFinite(slTb3) || slTb3 <= 0) return null;
  const a = dvtChuan(dvtTon), b = dvtChuan(dvtXuat);
  if (a && b && a !== b) return null;
  return ton <= 0 ? 0 : ton / slTb3;
};

/** % hao hụt = hao hụt / (tiêu hao + hao hụt) × 100; mẫu ≤ 0 hoặc thiếu => null */
export const phanTramHaoHut = (tieuHao: number | null, haoHut: number | null): number | null => {
  if (tieuHao === null || haoHut === null) return null;
  const mau = tieuHao + haoHut;
  return mau > 0 ? (haoHut / mau) * 100 : null;
};

export interface BoLocTieuHao {
  tu: string | null;
  den: string | null;
  nhom: string[];
  ct: string[];
  hex: string[];
  xuong: string[];
  mvt: MvtTieuHao;
  so: string[];
  chu: string[];
  an806: boolean;
  an401: boolean;
  /** Ẩn nhóm BTP / TP (mã 200* / 300* xuất lại vào lệnh) */
  anBtp: boolean;
  chuaGhep: boolean;
}

export const docBoLocTieuHao = (q: Record<string, unknown>): { hopLe: true; loc: BoLocTieuHao } | { hopLe: false; loi: string } => {
  const tu = q.tu === undefined || q.tu === '' ? null : q.tu;
  const den = q.den === undefined || q.den === '' ? null : q.den;
  if (tu !== null && !laThang(tu)) return { hopLe: false, loi: 'Tháng "từ" không hợp lệ (YYYY-MM)' };
  if (den !== null && !laThang(den)) return { hopLe: false, loi: 'Tháng "đến" không hợp lệ (YYYY-MM)' };
  const nhom = docDanhSach(q.nhom, 100, 10);
  if (!nhom || nhom.some(n => n !== KHOA_TRONG && !NHOM_BTP.includes(n) && !/^\d{1,5}$/.test(n))) return { hopLe: false, loi: 'Danh sách nhóm không hợp lệ' };
  const hoa = (xs: string[] | null) => (xs ? [...new Set(xs.map(x => x.toUpperCase()))].sort() : null);
  const ct = hoa(docDanhSach(q.ct, 500, 50));
  if (!ct) return { hopLe: false, loi: 'Danh sách công trình không hợp lệ' };
  const hex = hoa(docDanhSach(q.hex, 2000, 400, false));
  if (!hex) return { hopLe: false, loi: 'Danh sách HEX không hợp lệ' };
  const xuong = docDanhSach(q.xuong, 100, 100, false);
  if (!xuong) return { hopLe: false, loi: 'Danh sách xưởng không hợp lệ' };
  const mvt = q.mvt === undefined ? '' : q.mvt;
  if (typeof mvt !== 'string' || !(MVT_TIEU_HAO as readonly string[]).includes(mvt)) return { hopLe: false, loi: 'Loại xuất (mvt) không hợp lệ' };
  let so: string[] = [], chu: string[] = [];
  if (q.q !== undefined && q.q !== '') {
    if (typeof q.q !== 'string' || q.q.length > 4000) return { hopLe: false, loi: 'Ô tìm quá dài' };
    const t = tachTimKiem(q.q);
    if (!t) return { hopLe: false, loi: 'Ô tìm có quá nhiều mục' };
    ({ so, chu } = t);
  }
  return {
    hopLe: true,
    loc: {
      tu: tu as string | null, den: den as string | null, nhom, ct, hex, xuong, mvt: mvt as MvtTieuHao, so, chu,
      an806: docCo(q.an806, true), an401: docCo(q.an401, true), anBtp: docCo(q.anBtp, true), chuaGhep: docCo(q.chuaGhep, false),
    },
  };
};

/** Dòng nguồn đã tính sẵn khoá + số đổi dấu (bí danh b). Loại xuất: 261 / 262 (tiêu hao), Z14 / Z15 (hao hụt). */
export const sqlNguonTieuHao = () => `
  SELECT x.*,
         upper(btrim(x.mvt::text)) AS k_mvt,
         CASE WHEN btrim(x.nguon_nhom) IN ('BTP','TP') THEN btrim(x.nguon_nhom)
              ELSE COALESCE(NULLIF(split_part(btrim(x.nhom_sap), ' - ', 1), ''), '${KHOA_TRONG}') END AS k_nhom,
         upper(NULLIF(btrim(x.ma_ct), '')) AS k_ct,
         upper(NULLIF(btrim(x.hex), '')) AS k_hex,
         COALESCE(NULLIF(btrim(x.xuong), ''), NULLIF(btrim(x.plant::text), ''), '${KHOA_TRONG}') AS k_xuong,
         NULLIF(ltrim(btrim(x.ma_vat_tu::text), '0'), '') AS k_ma,
         NULLIF(upper(btrim(x.dvt)), '') AS k_dvt,
         CASE WHEN upper(btrim(x.mvt::text)) IN ('261','262') THEN -COALESCE(x.gia_tri, 0) ELSE 0 END AS th_gt,
         CASE WHEN upper(btrim(x.mvt::text)) IN ('Z14','Z15') THEN -COALESCE(x.gia_tri, 0) ELSE 0 END AS hh_gt,
         CASE WHEN upper(btrim(x.mvt::text)) IN ('261','262') THEN -COALESCE(x.so_luong, 0) ELSE 0 END AS th_sl,
         CASE WHEN upper(btrim(x.mvt::text)) IN ('Z14','Z15') THEN -COALESCE(x.so_luong, 0) ELSE 0 END AS hh_sl
  FROM ${BANG_TIEU_HAO} x
  WHERE upper(btrim(x.mvt::text)) IN ('261','262','Z14','Z15')`;

/** Điều kiện lọc (bí danh b, tham số nối vào `params`). boThang = bỏ khoảng tháng (thẻ TB 3 tháng / tháng này). */
export const sqlDieuKienTieuHao = (loc: BoLocTieuHao, params: unknown[], boThang = false): string => {
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const dk: string[] = [];
  if (!boThang && loc.tu) dk.push(`b.thang >= ${p(loc.tu)}`);
  if (!boThang && loc.den) dk.push(`b.thang <= ${p(loc.den)}`);
  if (loc.nhom.length) dk.push(`b.k_nhom = ANY(${p(loc.nhom)}::text[])`);
  if (loc.an806 && !loc.nhom.includes('806')) dk.push(`b.k_nhom <> '806'`);
  if (loc.an401 && !loc.nhom.includes('401')) dk.push(`b.k_nhom <> '401'`);
  if (loc.anBtp) {
    const an = NHOM_BTP.filter(n => !loc.nhom.includes(n));
    if (an.length) dk.push(`b.k_nhom NOT IN (${an.map(n => `'${n}'`).join(', ')})`);
  }
  if (loc.ct.length) dk.push(`COALESCE(b.k_ct, '${KHOA_TRONG}') = ANY(${p(loc.ct)}::text[])`);
  if (loc.hex.length) dk.push(`COALESCE(b.k_hex, '${KHOA_TRONG}') = ANY(${p(loc.hex)}::text[])`);
  if (loc.xuong.length) dk.push(`b.k_xuong = ANY(${p(loc.xuong)}::text[])`);
  if (loc.mvt === 'tieuHao') dk.push(`b.k_mvt IN ('261','262')`);
  if (loc.mvt === 'z14') dk.push(`b.k_mvt IN ('Z14','Z15')`);
  if (loc.chuaGhep) dk.push(`b.k_ct IS NULL AND b.k_hex IS NULL`);
  const tim: string[] = [];
  if (loc.so.length) {
    const ps = p(loc.so);
    tim.push(`b.k_ma = ANY(${ps}::text[]) OR ltrim(b.so_ct::text, '0') = ANY(${ps}::text[]) OR ltrim(b.order_sx::text, '0') = ANY(${ps}::text[]) OR ltrim(b.sales_order::text, '0') = ANY(${ps}::text[])`);
  }
  if (loc.chu.length) {
    tim.push(loc.chu.map(c => {
      const pc = p(`%${c.replace(/[\\%_]/g, m => `\\${m}`)}%`);
      return `(b.ten_vat_tu ILIKE ${pc} OR b.hex ILIKE ${pc} OR b.ma_ct ILIKE ${pc})`;
    }).join(' AND '));
  }
  if (tim.length) dk.push(`(${tim.map(t => `(${t})`).join(' OR ')})`);
  return dk.length ? `WHERE ${dk.join(' AND ')}` : '';
};

// ---------------------------------------------------------------------------
// BẢNG GỘP xuat_tieu_hao_vt_gop (21/11/2026) — trang Xuất tiêu hao + cột tiêu hao Đặt – Mua đọc bảng gộp thay vì tính
// k_* trên ~640 nghìn dòng mỗi lượt (4–5 truy vấn song song × ~5 giây => quá TIMEOUT_MS, HTTP 500).
// - 1 dòng gộp = (thang, k_nhom, k_loai, k_ct, k_xuong, k_ma, k_dvt, chua_ghep): khoá chuẩn hoá Y HỆT sqlNguonTieuHao.
//   k_loai 'TH' = 261/262 (tiêu hao), 'HH' = Z14/Z15 (hao hụt) => lọc mvt trên bảng gộp; chua_ghep = dòng không có cả mã CT
//   lẫn HEX => lọc chuaGhep + thẻ "chưa ghép" trên bảng gộp. k_ct / k_ma / k_dvt giữ NULL như k_* (lọc dùng COALESCE '-').
// - Câu gộp CHỈ viết ở sqlGopTieuHao(); backend/sql/2026-11-21_xuat_tieu_hao_vt_gop.sql và tool nạp
//   (13_MR_TIEN\tieu-hao-vt\nap_tieu_hao.py, SQL_GOP) là BẢN CHÉP — sửa ở đây thì chép sang 2 nơi đó (test so file .sql).
// - Tool nạp ghi lại các tháng của file trong CÙNG giao dịch với bảng gốc + table_versions 'xuat_tieu_hao_vt_gop'.
//   Bảng gộp chưa có / cũ hơn bảng gốc (table_versions) => đọc thẳng bảng gốc qua cùng câu gộp (đường "tho").
// - Lọc cần cột gốc (hex, ô tìm số / chữ) hoặc theo = 'hex' => đường "tho": gộp từ bảng gốc với điều kiện trên dòng gốc.
// - ten_vat_tu của 1 dòng gộp = tên ở ngày mới nhất (hoà thì tên lớn nhất, NULL sau cùng); gộp tiếp lấy theo ngay_ten
//   => cùng kết quả với ARRAY_AGG theo ngày trên dòng gốc.
// ---------------------------------------------------------------------------
export const BANG_GOP_TIEU_HAO = 'xuat_tieu_hao_vt_gop';

/**
 * Câu gộp từ bảng gốc (bí danh x). where = điều kiện thêm trên dòng gốc (không có chữ WHERE); theoHex = thêm khoá k_hex;
 * coTen = false: ten_vat_tu / ngay_ten để NULL (đường gốc không cần tên => bỏ ARRAY_AGG có sắp xếp, gộp bằng hash).
 * Bản chép (file .sql, tool nạp) là sqlGopTieuHao() mặc định.
 */
export const sqlGopTieuHao = (o: { where?: string; theoHex?: boolean; coTen?: boolean } = {}): string => `SELECT x.thang,
       CASE WHEN btrim(x.nguon_nhom) IN ('BTP','TP') THEN btrim(x.nguon_nhom)
            ELSE COALESCE(NULLIF(split_part(btrim(x.nhom_sap), ' - ', 1), ''), '${KHOA_TRONG}') END AS k_nhom,
       CASE WHEN upper(btrim(x.mvt::text)) IN ('261','262') THEN 'TH' ELSE 'HH' END AS k_loai,
       upper(NULLIF(btrim(x.ma_ct), '')) AS k_ct,
       COALESCE(NULLIF(btrim(x.xuong), ''), NULLIF(btrim(x.plant::text), ''), '${KHOA_TRONG}') AS k_xuong,
       NULLIF(ltrim(btrim(x.ma_vat_tu::text), '0'), '') AS k_ma,
       NULLIF(upper(btrim(x.dvt)), '') AS k_dvt,
       (NULLIF(btrim(x.ma_ct), '') IS NULL AND NULLIF(btrim(x.hex), '') IS NULL) AS chua_ghep,${o.theoHex ? `
       upper(NULLIF(btrim(x.hex), '')) AS k_hex,` : ''}
       MAX(btrim(x.ma_vat_tu::text)) AS ma_goc,
       ${o.coTen === false ? 'NULL::text' : '(ARRAY_AGG(x.ten_vat_tu ORDER BY x.ngay DESC NULLS LAST, x.ten_vat_tu DESC NULLS LAST))[1]'} AS ten_vat_tu,
       ${o.coTen === false ? 'NULL::date' : 'MAX(x.ngay)'} AS ngay_ten,
       MAX(NULLIF(btrim(x.phan_loai_nhom_sp), '')) AS phan_loai,
       SUM(CASE WHEN upper(btrim(x.mvt::text)) IN ('261','262') THEN -COALESCE(x.gia_tri, 0) ELSE 0 END) AS th_gt,
       SUM(CASE WHEN upper(btrim(x.mvt::text)) IN ('Z14','Z15') THEN -COALESCE(x.gia_tri, 0) ELSE 0 END) AS hh_gt,
       SUM(CASE WHEN upper(btrim(x.mvt::text)) IN ('261','262') THEN -COALESCE(x.so_luong, 0) ELSE 0 END) AS th_sl,
       SUM(CASE WHEN upper(btrim(x.mvt::text)) IN ('Z14','Z15') THEN -COALESCE(x.so_luong, 0) ELSE 0 END) AS hh_sl,
       COUNT(*)::int AS sd,
       (COUNT(*) FILTER (WHERE upper(btrim(x.mvt::text)) IN ('261','262')))::int AS sd_th,
       (COUNT(*) FILTER (WHERE upper(btrim(x.mvt::text)) = '262'))::int AS sd_262
FROM ${BANG_TIEU_HAO} x
WHERE upper(btrim(x.mvt::text)) IN ('261','262','Z14','Z15')${o.where ? ` AND (${o.where})` : ''}
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8${o.theoHex ? ', 9' : ''}`;

/** Bộ lọc / cách gộp này đọc được bảng gộp không (lọc HEX, ô tìm, theo HEX cần cột gốc) */
export const dungDuocGop = (loc: BoLocTieuHao, theo: TheoTieuHao | null): boolean =>
  theo !== 'hex' && !loc.hex.length && !loc.so.length && !loc.chu.length;

/** Điều kiện trên DÒNG GỐC (bí danh x) chỉ đường "tho" cần: HEX, ô tìm số / chữ. '' = không có */
export const sqlDieuKienTho = (loc: BoLocTieuHao, params: unknown[]): string => {
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const dk: string[] = [];
  if (loc.hex.length) dk.push(`COALESCE(upper(NULLIF(btrim(x.hex), '')), '${KHOA_TRONG}') = ANY(${p(loc.hex)}::text[])`);
  const tim: string[] = [];
  if (loc.so.length) {
    const ps = p(loc.so);
    tim.push(`NULLIF(ltrim(btrim(x.ma_vat_tu::text), '0'), '') = ANY(${ps}::text[]) OR ltrim(x.so_ct::text, '0') = ANY(${ps}::text[]) OR ltrim(x.order_sx::text, '0') = ANY(${ps}::text[]) OR ltrim(x.sales_order::text, '0') = ANY(${ps}::text[])`);
  }
  if (loc.chu.length) {
    tim.push(loc.chu.map(c => {
      const pc = p(`%${c.replace(/[\\%_]/g, m => `\\${m}`)}%`);
      return `(x.ten_vat_tu ILIKE ${pc} OR x.hex ILIKE ${pc} OR x.ma_ct ILIKE ${pc})`;
    }).join(' AND '));
  }
  if (tim.length) dk.push(`(${tim.map(t => `(${t})`).join(' OR ')})`);
  return dk.join(' AND ');
};

/** Điều kiện trên DÒNG GỘP (bí danh b; bảng gộp hoặc câu gộp từ bảng gốc). boThang = bỏ khoảng tháng. */
export const sqlDieuKienGop = (loc: BoLocTieuHao, params: unknown[], boThang = false): string => {
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const dk: string[] = [];
  if (!boThang && loc.tu) dk.push(`b.thang >= ${p(loc.tu)}`);
  if (!boThang && loc.den) dk.push(`b.thang <= ${p(loc.den)}`);
  if (loc.nhom.length) dk.push(`b.k_nhom = ANY(${p(loc.nhom)}::text[])`);
  if (loc.an806 && !loc.nhom.includes('806')) dk.push(`b.k_nhom <> '806'`);
  if (loc.an401 && !loc.nhom.includes('401')) dk.push(`b.k_nhom <> '401'`);
  if (loc.anBtp) {
    const an = NHOM_BTP.filter(n => !loc.nhom.includes(n));
    if (an.length) dk.push(`b.k_nhom NOT IN (${an.map(n => `'${n}'`).join(', ')})`);
  }
  if (loc.ct.length) dk.push(`COALESCE(b.k_ct, '${KHOA_TRONG}') = ANY(${p(loc.ct)}::text[])`);
  if (loc.xuong.length) dk.push(`b.k_xuong = ANY(${p(loc.xuong)}::text[])`);
  if (loc.mvt === 'tieuHao') dk.push(`b.k_loai = 'TH'`);
  if (loc.mvt === 'z14') dk.push(`b.k_loai = 'HH'`);
  if (loc.chuaGhep) dk.push('b.chua_ghep');
  return dk.length ? `WHERE ${dk.join(' AND ')}` : '';
};

/** Nguồn dòng gộp cho 1 truy vấn: bảng gộp, hoặc câu gộp từ bảng gốc (điều kiện dòng gốc nối vào params) */
const nguonGop = (loc: BoLocTieuHao | null, coGop: boolean, params: unknown[], theoHex = false, coTen = false): string => {
  if (coGop) return BANG_GOP_TIEU_HAO;
  const where = loc ? sqlDieuKienTho(loc, params) : '';
  return `(${sqlGopTieuHao({ where, theoHex, coTen })})`;
};

/** Chạy các truy vấn tối đa `n` cái cùng lúc (không bắn 5 truy vấn nặng song song) */
export const chayTungDot = async <T>(viec: Array<() => Promise<T>>, n = 2): Promise<T[]> => {
  const ra: T[] = new Array(viec.length);
  for (let i = 0; i < viec.length; i += n) {
    const dot = await Promise.all(viec.slice(i, i + n).map(f => f()));
    dot.forEach((v, j) => { ra[i + j] = v; });
  }
  return ra;
};

/** Khoá gộp theo `theo` (trên dòng nguồn b) */
export const KHOA_THEO: Record<Exclude<TheoTieuHao, 'ma'>, string> = {
  thang: 'b.thang',
  nhom: 'b.k_nhom',
  ct: `COALESCE(b.k_ct, '${KHOA_TRONG}')`,
  hex: `COALESCE(b.k_hex, '${KHOA_TRONG}')`,
  xuong: 'b.k_xuong',
};
/** Chữ phụ của 1 dòng gộp (trên dòng gộp b): ct => phân loại nhóm SP; hex => mã CT */
const PHU_THEO: Partial<Record<TheoTieuHao, string>> = {
  ct: 'MAX(b.phan_loai)',
  hex: 'MAX(b.k_ct)',
};

// Kiểu kết quả (hợp đồng với frontend/services/vatTuApi.ts)
/** 1 ô: giá trị (triệu, null = không có quyền giá), SL (chỉ có nghĩa trong 1 mã + ĐVT), số dòng chứng từ */
export interface OTieuHao {
  th: number | null; hh: number | null; sl: number; slHh: number; sd: number;
  /** Số dòng chứng từ tiêu hao (261 / 262) / hao hụt (Z14 / Z15) — khớp danh sách khi bấm ô */
  sdTh: number; sdHh: number;
}
export interface DongTieuHao {
  khoa: string; ten: string; phu: string | null;
  thang: Record<string, OTieuHao>;
  tong: OTieuHao;
  soMa: number;
  /** TB 3 tháng đủ (thangTb3): giá trị (triệu) và SL (chỉ theo mã) */
  gtTb3: number | null;
  slTb3: number | null;
  // Chỉ có khi theo = 'ma'
  ma?: string | null; dvt?: string | null; nhom?: string;
  ton?: number | null; dvtTon?: string | null; soThangDuDung?: number | null;
}
export interface TheSoTieuHao {
  /** Tháng của ngày dữ liệu mới nhất ('YYYY-MM') */
  thangMoi: string | null;
  thMoi: number | null; thTruoc: number | null; thTb3: number | null;
  /** Trong khoảng tháng đang lọc */
  th: number | null; hh: number | null; ptHaoHut: number | null;
  soMa: number; soDong: number; soDongChuaGhep: number; ptChuaGhep: number | null;
}
export interface TongHopTieuHao {
  chuaCo: false;
  capNhat: string | null; homNay: string; coGia: boolean; theo: TheoTieuHao;
  /** Ngày dữ liệu mới nhất cả bảng 'YYYY-MM-DD' (file tháng do người dùng tự xuất) */
  duLieuToi: string | null;
  /** Tháng đầu tiên có dòng hoàn trả 262 (null = chưa có): tháng trước đó là file MB51 cũ chỉ xuất 261 + Z14 — tiêu hao
   *  các tháng đó CHƯA trừ hoàn trả */
  thang262Tu: string | null;
  thangTb3: string[];
  /** Các tháng có số trong khoảng lọc (tăng dần) */
  thang: string[];
  dong: DongTieuHao[];
  /** Có hơn SO_DONG_TH_TOI_DA dòng => chỉ trả các dòng lớn nhất (tổng vẫn đủ) */
  catBot: boolean;
  soKhoa: number;
  tong: { thang: Record<string, OTieuHao>; tong: OTieuHao; soMa: number };
  the: TheSoTieuHao;
}
export interface DongChungTu {
  nam: number | null; soCt: string | null; dong: number | null; ngay: string | null; thang: string | null; mvt: string | null;
  ma: string | null; tenVatTu: string | null; nhom: string; dvt: string | null;
  /** SL xuất = −so_luong (261 / Z14 dương, 262 hoàn trả âm) */
  sl: number | null;
  /** Triệu đồng, = −gia_tri */
  giaTri: number | null;
  orderSx: string | null; salesOrder: string | null; wbs: string | null; hex: string | null; maCt: string | null;
  phanLoai: string | null; xuong: string | null; plant: string | null; sloc: string | null; nguoi: string | null;
  nguonNhom: string | null; nguonFile: string | null;
}
export interface ChiTietTieuHao {
  chuaCo: false; capNhat: string | null; homNay: string; coGia: boolean; tong: number; trang: number; co: number; dong: DongChungTu[];
}
export type ChuaCoTieuHao = { chuaCo: true; homNay: string };

const soHoacNullTH = (v: unknown) => { if (v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const oTH = (r: Record<string, unknown>): OTieuHao => ({
  th: so(r.th), hh: so(r.hh), sl: so(r.sl), slHh: so(r.sl_hh), sd: so(r.sd), sdTh: so(r.sd_th), sdHh: so(r.sd) - so(r.sd_th),
});
const O_RONG: OTieuHao = { th: 0, hh: 0, sl: 0, slHh: 0, sd: 0, sdTh: 0, sdHh: 0 };
// Truy vấn tổng hợp gộp 2 bậc (bậc 1 theo ... × k_ma bằng hash, bậc 2 đếm k_ma không cần COUNT(DISTINCT) => không sắp
// xếp tràn đĩa). Số dòng chứng từ sd / sd_th đã đếm sẵn ở dòng gộp.
/** Bậc 1: cộng các cột số của dòng gộp b */
const SQL_COT_M = `SUM(b.th_gt) AS th, SUM(b.hh_gt) AS hh, SUM(b.th_sl) AS sl, SUM(b.hh_sl) AS sl_hh, SUM(b.sd) AS sd,
  SUM(b.sd_th) AS sd_th`;
/** Bậc 2: 1 ô từ các dòng bậc 1 */
const SQL_O = `COALESCE(SUM(th), 0) AS th, COALESCE(SUM(hh), 0) AS hh, COALESCE(SUM(sl), 0) AS sl,
  COALESCE(SUM(sl_hh), 0) AS sl_hh, COALESCE(SUM(sd), 0) AS sd, COALESCE(SUM(sd_th), 0) AS sd_th`;
/** Tên mới nhất của nhiều dòng (cột ten_vat_tu / ngay_ten) — khớp ARRAY_AGG(ten ORDER BY ngay DESC) trên dòng gốc */
const tenMoi = (b: string, ten = 'ten_vat_tu') =>
  `(ARRAY_AGG(${b}.${ten} ORDER BY ${b}.ngay_ten DESC NULLS LAST, ${b}.${ten} DESC NULLS LAST))[1]`;

/** Tên nhóm SAP '115 - Phụ kiện': từ vat_tu.nhom_vt, thiếu thì ban_vt_master; không có => mã */
const SQL_TEN_NHOM = `
  SELECT ma, COALESCE(MIN(ten) FILTER (WHERE uu_tien = 0), MIN(ten)) AS ten FROM (
    SELECT split_part(btrim(nhom_vt), ' - ', 1) AS ma, btrim(nhom_vt) AS ten, 0 AS uu_tien FROM vat_tu WHERE btrim(nhom_vt) LIKE '% - %'
    UNION ALL
    SELECT btrim(nhom_sap), btrim(nhom_sap) || ' - ' || btrim(ten_nhom_sap), 1 FROM ban_vt_master
    WHERE NULLIF(btrim(nhom_sap), '') IS NOT NULL AND NULLIF(btrim(ten_nhom_sap), '') IS NOT NULL
  ) t
  GROUP BY ma`;

const docTenNhom = async (chay: Chay): Promise<Record<string, string>> => {
  try {
    const r = await chay(SQL_TEN_NHOM, []);
    const ra: Record<string, string> = {};
    for (const x of r.rows as Array<Record<string, unknown>>) if (x.ma) ra[String(x.ma)] = String(x.ten);
    return ra;
  } catch (e) {
    if (laThieuBangHoacCot(e)) return {};
    throw e;
  }
};

const laThieuBangTH = (e: unknown) => (e as { code?: string })?.code === '42P01';
const laThieuBangHoacCot = (e: unknown) => laThieuBangTH(e) || (e as { code?: string })?.code === '42703';

/** Ngày dữ liệu mới nhất của cả bảng — chỉ quét tháng mới nhất (chỉ mục (thang)), không quét cả bảng */
const docMaxNgay = async (chay: Chay): Promise<string | null> => {
  const r = await chay(
    // Bỏ chứng từ ghi ngày tương lai (vd 1 dòng Posting Date 30/11 trong file T11 lấy ngày 21/11) — không thì "Dữ liệu tới" sai
    `SELECT to_char(MAX(ngay), 'YYYY-MM-DD') AS d FROM ${BANG_TIEU_HAO}
      WHERE thang = (SELECT MAX(thang) FROM ${BANG_TIEU_HAO}) AND ngay <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`, []);
  return chuoiHoacNull((r.rows[0] as Record<string, unknown> | undefined)?.d);
};

/** Tồn hiện tại theo mã (lần chốt mới nhất của ton_kho_vt): khoá = mã bỏ số 0 đầu */
const docTon = async (ma: string[], chay: Chay): Promise<Map<string, { ton: number; dvt: string | null }>> => {
  const ra = new Map<string, { ton: number; dvt: string | null }>();
  if (!ma.length) return ra;
  try {
    const r = await chay(
      `SELECT ltrim(btrim(t.ma_vat_tu), '0') AS ma, COALESCE(SUM(t.so_luong), 0) AS ton, MAX(NULLIF(upper(btrim(t.dvt)), '')) AS dvt
       FROM ton_kho_vt t
       WHERE t."date" = (SELECT MAX(x."date") FROM ton_kho_vt x) AND ltrim(btrim(t.ma_vat_tu), '0') = ANY($1::text[])
       GROUP BY 1`, [ma]);
    for (const x of r.rows as Array<Record<string, unknown>>) ra.set(String(x.ma), { ton: so(x.ton), dvt: chuoiHoacNull(x.dvt) });
  } catch (e) {
    if (!laThieuBangHoacCot(e)) throw e;
  }
  return ra;
};

/**
 * Tổng hợp trang Xuất tiêu hao. coGop = bảng gộp dùng được (docPhienBanTH) — chỉ dùng khi bộ lọc / theo cho phép
 * (dungDuocGop), còn lại gộp từ bảng gốc bằng cùng câu gộp. Truy vấn chạy TỐI ĐA 2 cái cùng lúc.
 */
export const tinhTongHopTieuHao = async (
  loc: BoLocTieuHao, theo: TheoTieuHao, homNay: string, capNhat: string | null, chay: Chay = chayMacDinh, coGop = false,
): Promise<TongHopTieuHao> => {
  const maxNgay = await docMaxNgay(chay);
  const tb3 = thangTb3(maxNgay);
  const thangMoi = maxNgay ? maxNgay.slice(0, 7) : null;
  const gop = coGop && dungDuocGop(loc, theo);
  const theoHex = theo === 'hex';

  // (1) Thẻ số: tháng mới / trước / TB3 không theo khoảng tháng; còn lại theo khoảng tháng
  const pThe: unknown[] = [];
  const nguonThe = nguonGop(loc, gop, pThe);
  const whereThe = sqlDieuKienGop(loc, pThe, true);
  const kTu = loc.tu ? (pThe.push(loc.tu), `$${pThe.length}`) : null;
  const kDen = loc.den ? (pThe.push(loc.den), `$${pThe.length}`) : null;
  const trongKhoang = [kTu ? `b.thang >= ${kTu}` : '', kDen ? `b.thang <= ${kDen}` : ''].filter(Boolean).join(' AND ') || 'TRUE';
  pThe.push(thangMoi ?? '', thangMoi ? congThang(thangMoi, -1) : '', tb3);
  const [iMoi, iTruoc, iTb3] = [pThe.length - 2, pThe.length - 1, pThe.length];
  const pheThe = () => chay(
    `WITH m AS (SELECT b.k_ma, b.thang, SUM(b.th_gt) AS th, SUM(b.hh_gt) AS hh, SUM(b.sd) AS sd,
                       SUM(b.sd) FILTER (WHERE b.chua_ghep) AS cg
                FROM ${nguonThe} b ${whereThe} GROUP BY 1, 2)
     SELECT COALESCE(SUM(b.th) FILTER (WHERE b.thang = $${iMoi}), 0) AS th_moi,
            COALESCE(SUM(b.th) FILTER (WHERE b.thang = $${iTruoc}), 0) AS th_truoc,
            COALESCE(SUM(b.th) FILTER (WHERE b.thang = ANY($${iTb3}::text[])), 0) / 3 AS th_tb3,
            COALESCE(SUM(b.th) FILTER (WHERE ${trongKhoang}), 0) AS th,
            COALESCE(SUM(b.hh) FILTER (WHERE ${trongKhoang}), 0) AS hh,
            (SELECT COUNT(*) FROM (SELECT b.k_ma FROM m b WHERE ${trongKhoang} AND b.k_ma IS NOT NULL GROUP BY 1) z) AS so_ma,
            COALESCE(SUM(b.sd) FILTER (WHERE ${trongKhoang}), 0) AS so_dong,
            COALESCE(SUM(b.cg) FILTER (WHERE ${trongKhoang}), 0) AS chua_ghep
     FROM m b`, pThe);

  // (2) Tổng theo tháng + tổng cả khoảng
  const pTong: unknown[] = [];
  const nguonTong = nguonGop(loc, gop, pTong);
  const whereTong = sqlDieuKienGop(loc, pTong);
  const pheTong = () => chay(
    `WITH m AS (SELECT b.thang, b.k_ma, ${SQL_COT_M} FROM ${nguonTong} b ${whereTong} GROUP BY 1, 2)
     SELECT thang, 0 AS la_tong, ${SQL_O}, COUNT(k_ma) AS so_ma FROM m GROUP BY thang
     UNION ALL
     SELECT NULL, 1, ${SQL_O}, (SELECT COUNT(*) FROM (SELECT k_ma FROM m WHERE k_ma IS NOT NULL GROUP BY 1) z) FROM m`, pTong);

  // (3) Dòng gộp theo khoá × tháng (chỉ các khoá lớn nhất) + TB3 từng khoá (bỏ khoảng tháng)
  const laMa = theo === 'ma';
  const khoaSql = laMa ? `COALESCE(b.k_ma, '${KHOA_TRONG}') || '|' || COALESCE(b.k_dvt, '')` : KHOA_THEO[theo];
  const phuSql = laMa ? 'NULL' : PHU_THEO[theo] ?? 'NULL';
  const pDong: unknown[] = [];
  // Tên vật tư chỉ cần khi theo mã (đường gốc: bỏ ARRAY_AGG có sắp xếp trên ~640 nghìn dòng khi không cần)
  const nguonDong = nguonGop(loc, gop, pDong, theoHex, laMa);
  const whereDong = sqlDieuKienGop(loc, pDong);
  const pheDong = () => chay(
    `WITH l AS (SELECT ${khoaSql} AS khoa, b.thang, b.k_ma, ${SQL_COT_M}, ${phuSql} AS phu, MAX(b.k_nhom) AS nhom,
                       MAX(b.ma_goc) AS ma, MAX(b.k_dvt) AS dvt${laMa ? `, ${tenMoi('b')} AS ten, MAX(b.ngay_ten) AS ngay_ten` : ''}
                FROM ${nguonDong} b ${whereDong} GROUP BY 1, 2, 3),
          k AS (SELECT khoa FROM l GROUP BY khoa ORDER BY SUM(th + hh) DESC, SUM(sd) DESC, khoa LIMIT ${SO_DONG_TH_TOI_DA}),
          n AS (SELECT COUNT(*) AS so_khoa FROM (SELECT khoa FROM l GROUP BY 1) z),
          lk AS (SELECT * FROM l WHERE khoa IN (SELECT khoa FROM k)),
          km AS (SELECT khoa, COUNT(k_ma) AS so_ma FROM (SELECT khoa, k_ma FROM lk GROUP BY 1, 2) z GROUP BY 1)
     SELECT khoa, thang, 0 AS la_tong, ${SQL_O}, COUNT(k_ma) AS so_ma, NULL AS phu, NULL AS nhom, NULL AS ma, NULL AS ten,
            NULL AS dvt, (SELECT so_khoa FROM n) AS so_khoa
     FROM lk GROUP BY khoa, thang
     UNION ALL
     SELECT lk.khoa, NULL, 1, ${SQL_O}, MAX(km.so_ma), MAX(lk.phu), MAX(lk.nhom), MAX(lk.ma),
            ${laMa ? tenMoi('lk', 'ten') : 'NULL'}, MAX(lk.dvt), (SELECT so_khoa FROM n)
     FROM lk JOIN km ON km.khoa = lk.khoa GROUP BY lk.khoa`, pDong);

  const pTb3: unknown[] = [];
  const nguonTb3 = nguonGop(loc, gop, pTb3, theoHex);
  const whereTb3 = sqlDieuKienGop(loc, pTb3, true);
  pTb3.push(tb3);
  const pheTb3 = () => tb3.length ? chay(
    `SELECT ${khoaSql} AS khoa, COALESCE(SUM(b.th_gt), 0) / 3 AS gt, COALESCE(SUM(b.th_sl), 0) / 3 AS sl
     FROM ${nguonTb3} b ${whereTb3 ? `${whereTb3} AND` : 'WHERE'} b.thang = ANY($${pTb3.length}::text[])
     GROUP BY 1`, pTb3) : Promise.resolve({ rows: [] as unknown[] });

  // Tháng đầu có hoàn trả 262 (cả bảng, không theo bộ lọc): bảng gộp có sẵn sd_262
  const phe262 = () => chay(coGop
    ? `SELECT MIN(thang) AS t FROM ${BANG_GOP_TIEU_HAO} WHERE sd_262 > 0`
    : `SELECT MIN(thang) AS t FROM ${BANG_TIEU_HAO} WHERE upper(btrim(mvt::text)) = '262'`, []);
  const pheTenNhom = async () => ({ rows: [theo === 'nhom' ? await docTenNhom(chay) : {}] as unknown[] });
  const [rThe, rTong, rDong, rTb3, r262, rTenNhom] = await chayTungDot([pheThe, pheTong, pheDong, pheTb3, phe262, pheTenNhom]);
  const tenNhom = rTenNhom.rows[0] as Record<string, string>;

  const x = (rThe.rows[0] ?? {}) as Record<string, unknown>;
  const th = so(x.th), hh = so(x.hh), soDong = so(x.so_dong), chuaGhep = so(x.chua_ghep);
  const the: TheSoTieuHao = {
    thangMoi, thMoi: so(x.th_moi), thTruoc: so(x.th_truoc), thTb3: tb3.length ? so(x.th_tb3) : null,
    th, hh, ptHaoHut: phanTramHaoHut(th, hh),
    soMa: so(x.so_ma), soDong, soDongChuaGhep: chuaGhep, ptChuaGhep: soDong > 0 ? (chuaGhep / soDong) * 100 : null,
  };

  const tong: TongHopTieuHao['tong'] = { thang: {}, tong: { ...O_RONG }, soMa: 0 };
  for (const r of rTong.rows as Array<Record<string, unknown>>) {
    if (so(r.la_tong) === 1) { tong.tong = oTH(r); tong.soMa = so(r.so_ma); } else if (r.thang) tong.thang[String(r.thang)] = oTH(r);
  }
  const thang = Object.keys(tong.thang).sort();

  const tb3Map = new Map<string, { gt: number; sl: number }>();
  for (const r of rTb3.rows as Array<Record<string, unknown>>) tb3Map.set(String(r.khoa), { gt: so(r.gt), sl: so(r.sl) });

  const theoKhoa = new Map<string, DongTieuHao>();
  let soKhoa = 0;
  for (const r of rDong.rows as Array<Record<string, unknown>>) {
    const khoa = String(r.khoa ?? KHOA_TRONG);
    soKhoa = so(r.so_khoa);
    let d = theoKhoa.get(khoa);
    if (!d) {
      d = { khoa, ten: khoa, phu: null, thang: {}, tong: { ...O_RONG }, soMa: 0, gtTb3: null, slTb3: null };
      theoKhoa.set(khoa, d);
    }
    if (so(r.la_tong) === 1) {
      d.tong = oTH(r);
      d.soMa = so(r.so_ma);
      d.phu = chuoiHoacNull(r.phu);
      if (laMa) {
        d.ma = chuoiHoacNull(r.ma);
        d.ten = chuoiHoacNull(r.ten) ?? d.ma ?? '(không mã)';
        d.dvt = chuoiHoacNull(r.dvt);
        d.nhom = String(r.nhom ?? KHOA_TRONG);
      }
    } else if (r.thang) d.thang[String(r.thang)] = oTH(r);
  }
  const dong = [...theoKhoa.values()];
  for (const d of dong) {
    const t = tb3Map.get(d.khoa);
    d.gtTb3 = tb3.length ? t?.gt ?? 0 : null;
    if (laMa) d.slTb3 = tb3.length ? t?.sl ?? 0 : null;
    if (theo === 'nhom') d.ten = d.khoa === KHOA_TRONG ? NHOM_TRONG_TEN : TEN_NHOM_BTP[d.khoa] ?? tenNhom[d.khoa] ?? d.khoa;
    else if (theo === 'ct' || theo === 'hex') { if (d.khoa === KHOA_TRONG) d.ten = 'Chưa ghép được'; }
    else if (theo === 'xuong') { if (d.khoa === KHOA_TRONG) d.ten = '(không ghi xưởng)'; }
  }
  if (laMa) {
    const ton = await docTon([...new Set(dong.map(d => d.khoa.split('|')[0]).filter(m => m && m !== KHOA_TRONG))], chay);
    for (const d of dong) {
      const t = ton.get(d.khoa.split('|')[0]);
      d.ton = t ? t.ton : null;
      d.dvtTon = t ? t.dvt : null;
      d.soThangDuDung = soThangDuDung(d.ton, d.dvtTon ?? null, d.slTb3, d.dvt ?? null);
    }
  }
  // Xếp theo giá trị làm tròn 1 đồng (1e-6 triệu): tổng double cộng theo thứ tự khác nhau lệch ~1e-14 => không đảo chỗ
  // các dòng bằng nhau (rồi theo số dòng chứng từ, khoá)
  const gtXep = (d: DongTieuHao) => Math.round(((d.tong.th ?? 0) + (d.tong.hh ?? 0)) * 1e6);
  dong.sort(theo === 'thang' ? (a, b) => a.khoa.localeCompare(b.khoa)
    : (a, b) => gtXep(b) - gtXep(a) || b.tong.sd - a.tong.sd || a.khoa.localeCompare(b.khoa));
  return {
    chuaCo: false, capNhat, homNay, coGia: true, theo, duLieuToi: maxNgay,
    thang262Tu: chuoiHoacNull((r262.rows[0] as Record<string, unknown> | undefined)?.t), thangTb3: tb3, thang, dong,
    catBot: soKhoa > dong.length, soKhoa, tong, the,
  };
};

/** Bỏ giá trị khi không có quyền giá — bản MỚI (không sửa đối tượng trong cache) */
const boGiaO = (o: OTieuHao): OTieuHao => ({ ...o, th: null, hh: null });
const boGiaThang = (t: Record<string, OTieuHao>) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, boGiaO(v)]));
/** Không có quyền giá: bỏ giá + xếp lại dòng theo số dòng chứng từ (không để lộ thứ hạng giá trị) */
export const boGiaTongHopTieuHao = (x: TongHopTieuHao): TongHopTieuHao => ({
  ...x, coGia: false,
  dong: x.dong.map(d => ({ ...d, thang: boGiaThang(d.thang), tong: boGiaO(d.tong), gtTb3: null }))
    .sort(x.theo === 'thang' ? (a, b) => a.khoa.localeCompare(b.khoa) : (a, b) => b.tong.sd - a.tong.sd || a.khoa.localeCompare(b.khoa)),
  tong: { ...x.tong, thang: boGiaThang(x.tong.thang), tong: boGiaO(x.tong.tong) },
  the: { ...x.the, thMoi: null, thTruoc: null, thTb3: null, th: null, hh: null, ptHaoHut: null },
});

/** Tham số riêng của /chi-tiet: ma (mã VT; '-' = không mã), dvt ('-' = không ghi; không gửi = mọi ĐVT), trang, co */
export const docThamSoChiTietTH = (q: Record<string, unknown>): { ma: string | null; dvt: string | null; trang: number; co: number } | null => {
  let ma: string | null = null;
  if (q.ma !== undefined && q.ma !== '') {
    if (typeof q.ma !== 'string') return null;
    if (q.ma === KHOA_TRONG) ma = '';
    else if (/^\d{1,18}$/.test(q.ma)) ma = q.ma.replace(/^0+(?=\d)/, '');
    else return null;
  }
  let dvt: string | null = null;
  if (q.dvt !== undefined && q.dvt !== '') {
    if (typeof q.dvt !== 'string' || q.dvt.length > 50) return null;
    dvt = q.dvt === KHOA_TRONG ? '' : q.dvt.trim().toUpperCase();
  }
  const trang = q.trang === undefined || q.trang === '' ? 1 : Number(q.trang);
  const co = q.co === undefined || q.co === '' ? TRANG_MAC_DINH : Number(q.co);
  if (!Number.isInteger(trang) || trang < 1 || trang > 100000) return null;
  if (!Number.isInteger(co) || co < 1 || co > TRANG_TOI_DA) return null;
  return { ma, dvt, trang, co };
};

export const tinhChiTietTieuHao = async (
  loc: BoLocTieuHao, t: { ma: string | null; dvt: string | null; trang: number; co: number }, homNay: string, capNhat: string | null,
  chay: Chay = chayMacDinh,
): Promise<ChiTietTieuHao> => {
  const params: unknown[] = [];
  let where = sqlDieuKienTieuHao(loc, params);
  const them: string[] = [];
  if (t.ma !== null) {
    if (t.ma === '') them.push('b.k_ma IS NULL');
    else { params.push(t.ma); them.push(`b.k_ma = $${params.length}`); }
  }
  if (t.dvt !== null) { params.push(t.dvt === '' ? null : t.dvt); them.push(`b.k_dvt IS NOT DISTINCT FROM $${params.length}::text`); }
  if (them.length) where = where ? `${where} AND ${them.join(' AND ')}` : `WHERE ${them.join(' AND ')}`;
  params.push(t.co, (t.trang - 1) * t.co);
  const r = await chay(
    `WITH b AS (${sqlNguonTieuHao()})
     SELECT b.nam, b.so_ct::text AS so_ct, b.dong, to_char(b.ngay, 'YYYY-MM-DD') AS ngay, b.thang, b.k_mvt AS mvt,
            btrim(b.ma_vat_tu::text) AS ma, b.ten_vat_tu, b.k_nhom, b.dvt, -b.so_luong AS sl, -b.gia_tri AS gia_tri,
            b.order_sx::text AS order_sx, b.sales_order::text AS sales_order, b.wbs::text AS wbs, b.hex, b.ma_ct,
            b.phan_loai_nhom_sp, b.xuong, b.plant::text AS plant, b.sloc::text AS sloc, b.nguoi, b.nguon_nhom, b.nguon_file,
            COUNT(*) OVER () AS tong
     FROM b ${where}
     ORDER BY b.ngay DESC NULLS LAST, b.so_ct DESC NULLS LAST, b.dong NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params);
  const rows = r.rows as Array<Record<string, unknown>>;
  let tong = rows.length ? so(rows[0].tong) : 0;
  if (!rows.length && t.trang > 1) {
    const c = await chay(`WITH b AS (${sqlNguonTieuHao()}) SELECT COUNT(*) AS n FROM b ${where}`, params.slice(0, -2));
    tong = so((c.rows[0] as Record<string, unknown>)?.n);
  }
  const dong: DongChungTu[] = rows.map(x => ({
    nam: soHoacNullTH(x.nam), soCt: chuoiHoacNull(x.so_ct), dong: soHoacNullTH(x.dong), ngay: chuoiHoacNull(x.ngay),
    thang: chuoiHoacNull(x.thang), mvt: chuoiHoacNull(x.mvt), ma: chuoiHoacNull(x.ma), tenVatTu: chuoiHoacNull(x.ten_vat_tu),
    nhom: String(x.k_nhom ?? KHOA_TRONG), dvt: chuoiHoacNull(x.dvt), sl: soHoacNullTH(x.sl), giaTri: soHoacNullTH(x.gia_tri),
    orderSx: chuoiHoacNull(x.order_sx), salesOrder: chuoiHoacNull(x.sales_order), wbs: chuoiHoacNull(x.wbs),
    hex: chuoiHoacNull(x.hex), maCt: chuoiHoacNull(x.ma_ct), phanLoai: chuoiHoacNull(x.phan_loai_nhom_sp),
    xuong: chuoiHoacNull(x.xuong), plant: chuoiHoacNull(x.plant), sloc: chuoiHoacNull(x.sloc), nguoi: chuoiHoacNull(x.nguoi),
    nguonNhom: chuoiHoacNull(x.nguon_nhom), nguonFile: chuoiHoacNull(x.nguon_file),
  }));
  return { chuaCo: false, capNhat, homNay, coGia: true, tong, trang: t.trang, co: t.co, dong };
};

// ---------------------------------------------------------------------------
// Tiêu hao gắn vào bảng Đặt – Mua (theo-nhom / theo-ma): TB 3 tháng đủ + số tháng đủ dùng
// ---------------------------------------------------------------------------
export interface TieuHaoNhom { thangTb3: string[]; gt: Map<string, number> }
export interface TieuHaoMa {
  thangTb3: string[];
  ma: Map<string, { gt: number; sl: number; dvt: string | null; soDvt: number; ton: number | null; dvtTon: string | null }>;
}

/** TB 3 tháng giá trị tiêu hao (261/262) mỗi nhóm SAP (bỏ BTP / TP); lọc công trình của Đặt – Mua (trackingno) áp theo mã CT */
export const tinhTieuHaoNhom = async (ct: string[], chay: Chay = chayMacDinh, coGop = false): Promise<TieuHaoNhom> => {
  const tb3 = thangTb3(await docMaxNgay(chay));
  const gt = new Map<string, number>();
  if (!tb3.length) return { thangTb3: tb3, gt };
  const params: unknown[] = [tb3];
  const dkCt = ct.length ? (params.push(ct.map(c => c.toUpperCase())), `AND b.k_ct = ANY($2::text[])`) : '';
  const r = await chay(
    `SELECT b.k_nhom, COALESCE(SUM(b.th_gt), 0) / 3 AS gt FROM ${nguonGop(null, coGop, params)} b
     WHERE b.thang = ANY($1::text[]) AND b.k_nhom NOT IN ('BTP','TP') ${dkCt} GROUP BY 1`, params);
  for (const x of r.rows as Array<Record<string, unknown>>) gt.set(String(x.k_nhom), so(x.gt));
  return { thangTb3: tb3, gt };
};

/** TB 3 tháng (giá trị + SL) của các mã + tồn hiện tại (ton_kho_vt lần chốt mới nhất) */
export const tinhTieuHaoMa = async (ma: string[], ct: string[], chay: Chay = chayMacDinh, coGop = false): Promise<TieuHaoMa> => {
  const tb3 = thangTb3(await docMaxNgay(chay));
  const ra: TieuHaoMa['ma'] = new Map();
  const ds = [...new Set(ma.map(m => m.replace(/^0+(?=\d)/, '')).filter(Boolean))];
  if (!ds.length) return { thangTb3: tb3, ma: ra };
  const [r, ton] = await Promise.all([
    tb3.length ? (() => {
      const params: unknown[] = [tb3, ds];
      const dkCt = ct.length ? (params.push(ct.map(c => c.toUpperCase())), `AND b.k_ct = ANY($3::text[])`) : '';
      return chay(
        `SELECT b.k_ma, COALESCE(SUM(b.th_gt), 0) / 3 AS gt, COALESCE(SUM(b.th_sl), 0) / 3 AS sl,
                MAX(b.k_dvt) AS dvt, COUNT(DISTINCT b.k_dvt) AS so_dvt
         FROM ${nguonGop(null, coGop, params)} b WHERE b.thang = ANY($1::text[]) AND b.k_ma = ANY($2::text[]) ${dkCt} GROUP BY 1`, params);
    })() : Promise.resolve({ rows: [] as unknown[] }),
    docTon(ds, chay),
  ]);
  const tieuHao = new Map<string, Record<string, unknown>>();
  for (const x of r.rows as Array<Record<string, unknown>>) tieuHao.set(String(x.k_ma), x);
  for (const m of ds) {
    const x = tieuHao.get(m), t = ton.get(m);
    ra.set(m, {
      gt: x ? so(x.gt) : 0, sl: x ? so(x.sl) : 0, dvt: x ? chuoiHoacNull(x.dvt) : null, soDvt: x ? so(x.so_dvt) : 0,
      ton: t ? t.ton : null, dvtTon: t ? t.dvt : null,
    });
  }
  return { thangTb3: tb3, ma: ra };
};

// Phiên bản riêng của bảng tiêu hao + tồn kho vật tư (cache + biết bảng đã có chưa) — giữ 30 giây
/** coGop = bảng gộp có và không cũ hơn bảng gốc (table_versions của bảng gộp >= của bảng gốc) */
interface PhienBanTH { coBang: boolean; coGop: boolean; khoa: string; capNhat: string | null }
let pbThNho: { luc: number; giaTri: PhienBanTH } | null = null;
let pbThDangDoc: Promise<PhienBanTH> | null = null;
const PB_TH_TTL_MS = 30_000;
const chuoiLuc = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return String(v);
};
const docPhienBanTH = async (): Promise<PhienBanTH> => {
  if (pbThNho && Date.now() - pbThNho.luc < hanPhienBan(PB_TH_TTL_MS)) return pbThNho.giaTri;
  if (pbThDangDoc) return pbThDangDoc;
  pbThDangDoc = (async () => {
    try {
      const r = await timedQuery(
        `SELECT to_regclass('${BANG_TIEU_HAO}') IS NOT NULL AS co_bang,
                (SELECT last_updated FROM table_versions WHERE table_name = '${BANG_TIEU_HAO}') AS tv,
                (SELECT last_updated FROM table_versions WHERE table_name = 'ton_kho_vt') AS tv_ton,
                (SELECT n_tup_ins + n_tup_upd + n_tup_del FROM pg_stat_user_tables WHERE relname = '${BANG_TIEU_HAO}' LIMIT 1) AS so_ghi,
                to_regclass('${BANG_GOP_TIEU_HAO}') IS NOT NULL
                  AND COALESCE((SELECT last_updated FROM table_versions WHERE table_name = '${BANG_GOP_TIEU_HAO}')
                               >= COALESCE((SELECT last_updated FROM table_versions WHERE table_name = '${BANG_TIEU_HAO}'), '-infinity'),
                               FALSE) AS co_gop,
                (SELECT last_updated FROM table_versions WHERE table_name = '${BANG_GOP_TIEU_HAO}') AS tv_gop`);
      const x = (r.rows[0] ?? {}) as Record<string, unknown>;
      const tv = chuoiLuc(x.tv);
      const coGop = x.co_bang === true && x.co_gop === true;
      const giaTri: PhienBanTH = {
        coBang: x.co_bang === true,
        coGop,
        // Khoá cache gồm đường đọc (gộp / gốc) + phiên bản bảng gộp
        khoa: `${x.co_bang === true ? 1 : 0}|${tv ?? `st:${String(x.so_ghi ?? '')}`}|${chuoiLuc(x.tv_ton) ?? ''}|${coGop ? `g:${chuoiLuc(x.tv_gop) ?? ''}` : 'tho'}`,
        capNhat: tv,
      };
      pbThNho = { luc: Date.now(), giaTri };
      return giaTri;
    } finally {
      pbThDangDoc = null;
    }
  })();
  return pbThDangDoc;
};
/** Vừa gặp 42P01: quên phiên bản đã nhớ (lần sau đọc lại) */
const quenPhienBanTH = () => { pbThNho = null; };

// ---------------------------------------------------------------------------
// ROUTE
// ---------------------------------------------------------------------------
const cacheNhom = createCache<TheoNhom>(40);
const cacheMa = createCache<TheoMa>(40);
const cacheDong = createCache<DanhSachDong>(30);
const cacheThang = createCache<TheoThang>(20);

/** Khoá cache bộ lọc (đã chuẩn hoá, xếp tăng) */
const khoaLoc = (loc: BoLoc) => hashKey(loc);

const docCapNhat = async (): Promise<string | null> => {
  const v = await getRelevantVersions(['material']);
  const x = v.material as unknown;
  if (x === null || x === undefined) return null;
  return x instanceof Date ? x.toISOString() : String(x);
};

type XuLy = (req: Request, loc: BoLoc, homNay: string, coGia: boolean) => Promise<unknown>;
const dangKy = (duong: string, xuLy: XuLy) => {
  app.get(`/api/vat-tu/dat-mua/${duong}`, async (req: Request, res: Response) => {
    try {
      if (!(await userHasPermission(req, QUYEN_XEM))) return res.status(403).json(LOI_QUYEN);
      const kq = docBoLoc(req.query as Record<string, unknown>);
      if (!kq.hopLe) return res.status(400).json({ error: kq.loi });
      const coGia = await userHasPermission(req, MATERIAL_PRICE_PERMISSION);
      const homNay = vnDayKey(new Date());
      const ra = await xuLy(req, kq.loc, homNay, coGia);
      if (ra === null) return res.status(400).json({ error: 'Tham số không hợp lệ' });
      res.json(ra);
    } catch (error) {
      console.error(`Lỗi vat-tu/dat-mua/${duong}:`, error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
};

/** Gắn tiêu hao TB 3 tháng vào bảng nhóm (bảng tiêu hao chưa có / thiếu cột => giữ nguyên, tieuHao = null) */
export const ganTieuHaoNhom = (x: TheoNhom, th: TieuHaoNhom | null): TheoNhom => {
  if (!th) return { ...x, tieuHao: null };
  let tong = 0;
  const nhom = x.nhom.map(n => { const v = th.gt.get(n.ma) ?? 0; tong += v; return { ...n, tieuHaoTb3: v }; });
  return { ...x, nhom, tong: { ...x.tong, tieuHaoTb3: tong }, tieuHao: { thangTb3: th.thangTb3 } };
};

/** Gắn tiêu hao TB 3 tháng + tồn + số tháng đủ dùng vào bảng mã */
export const ganTieuHaoMa = (x: TheoMa, th: TieuHaoMa | null): TheoMa => {
  if (!th) return { ...x, tieuHao: null };
  const ma = x.ma.map(m => {
    const t = m.ma ? th.ma.get(m.ma.replace(/^0+(?=\d)/, '')) : undefined;
    if (!t) return { ...m, tieuHaoTb3: null, slTieuHaoTb3: null, dvtTieuHao: null, tonHienTai: null, dvtTon: null, soThangDuDung: null };
    // Mã xuất nhiều ĐVT: không cộng SL
    const sl = t.soDvt > 1 ? null : t.sl;
    return {
      ...m, tieuHaoTb3: t.gt, slTieuHaoTb3: sl, dvtTieuHao: t.dvt, tonHienTai: t.ton, dvtTon: t.dvtTon,
      soThangDuDung: soThangDuDung(t.ton, t.dvtTon, sl, t.dvt),
    };
  });
  return { ...x, ma, tieuHao: { thangTb3: th.thangTb3 } };
};

/** Chạy phần tiêu hao của Đặt – Mua: chưa có bảng => null; thiếu bảng / cột lúc chạy => null (không làm hỏng Đặt – Mua) */
const thuTieuHao = async <T>(pb: PhienBanTH, f: () => Promise<T>): Promise<T | null> => {
  if (!pb.coBang) return null;
  try {
    return await f();
  } catch (e) {
    if (!laThieuBangHoacCot(e)) throw e;
    if (laThieuBangTH(e)) quenPhienBanTH();
    return null;
  }
};

/** Cột tiêu hao bên Đặt – Mua chỉ cho người có quyền 'vt_tieu_hao' (cache là bản đủ — bỏ SAU cache, như giá) */
const coQuyenTH = (req: Request) => userHasPermission(req, QUYEN_TIEU_HAO);

dangKy('theo-nhom', async (req, loc, homNay, coGia) => {
  const capNhat = await docCapNhat();
  const [pb, coTH] = await Promise.all([docPhienBanTH(), coQuyenTH(req)]);
  const tho = await cachedByVersions(cacheNhom, `nhom|${coGia ? 1 : 0}|${khoaLoc(loc)}`, ['material'],
    async () => ganTieuHaoNhom(await tinhTheoNhom(loc, homNay, capNhat), await thuTieuHao(pb, () => tinhTieuHaoNhom(loc.ct, chayMacDinh, pb.coGop))),
    `${homNay}|${pb.khoa}`, '', false);
  const x = coTH ? tho : { ...tho, tieuHao: null, nhom: tho.nhom.map(n => ({ ...n, tieuHaoTb3: null })), tong: { ...tho.tong, tieuHaoTb3: null } };
  if (coGia) return x;
  return { ...x, coGia: false, nhom: x.nhom.map(n => ({ ...boGia(n), tieuHaoTb3: null })), tong: { ...boGia(x.tong), tieuHaoTb3: null } };
});

dangKy('theo-ma', async (req, loc, homNay, coGia) => {
  const capNhat = await docCapNhat();
  const [pb, coTH] = await Promise.all([docPhienBanTH(), coQuyenTH(req)]);
  const tho = await cachedByVersions(cacheMa, `ma|${coGia ? 1 : 0}|${khoaLoc(loc)}`, ['material'],
    async () => {
      const x = await tinhTheoMa(loc, homNay, capNhat);
      const ma = x.ma.map(m => m.ma).filter((m): m is string => !!m);
      return ganTieuHaoMa(x, await thuTieuHao(pb, () => tinhTieuHaoMa(ma, loc.ct, chayMacDinh, pb.coGop)));
    },
    `${homNay}|${pb.khoa}`, '', false);
  const x = coTH ? tho : {
    ...tho, tieuHao: null,
    ma: tho.ma.map(m => ({ ...m, tieuHaoTb3: null, slTieuHaoTb3: null, dvtTieuHao: null, tonHienTai: null, dvtTon: null, soThangDuDung: null })),
  };
  if (coGia) return x;
  return { ...x, coGia: false, ma: x.ma.map(m => ({ ...boGia(m), tieuHaoTb3: null })) };
});

/** Tham số riêng của /dong: ma (mã SAP; '-' = dòng không có mã), dvt (ĐVT; '-' = không ghi ĐVT; không gửi = mọi ĐVT),
 *  loai (ô bấm), trang (từ 1), co (số dòng / trang) */
export const docThamSoDong = (q: Record<string, unknown>):
  (ChonDong & { trang: number; co: number }) | null => {
  let ma: string | null = null;
  if (q.ma !== undefined && q.ma !== '') {
    if (typeof q.ma !== 'string') return null;
    if (q.ma === NHOM_TRONG_MA) ma = '';
    else if (/^\d{1,15}$/.test(q.ma)) ma = q.ma.replace(/^0+(?=\d)/, '');
    else return null;
  }
  let dvt: string | null = null;
  if (q.dvt !== undefined && q.dvt !== '') {
    if (typeof q.dvt !== 'string' || q.dvt.length > 50) return null;
    dvt = q.dvt === NHOM_TRONG_MA ? '' : q.dvt.trim();
  }
  let loai: LoaiO | null = null;
  if (q.loai !== undefined && q.loai !== '') {
    if (typeof q.loai !== 'string' || !(q.loai in LOAI_O)) return null;
    loai = q.loai as LoaiO;
  }
  const trang = q.trang === undefined || q.trang === '' ? 1 : Number(q.trang);
  const co = q.co === undefined || q.co === '' ? TRANG_MAC_DINH : Number(q.co);
  if (!Number.isInteger(trang) || trang < 1 || trang > 100000) return null;
  if (!Number.isInteger(co) || co < 1 || co > TRANG_TOI_DA) return null;
  return { ma, dvt, loai, trang, co };
};

/** Lượt lấy lớn hơn cỡ này (xuất Excel tới 30 nghìn dòng) không cache — tránh giữ hàng chục MB mỗi mục cache */
const CO_CACHE_TOI_DA = 500;

dangKy('dong', async (req, loc, homNay, coGia) => {
  const t = docThamSoDong(req.query as Record<string, unknown>);
  if (!t) return null;
  const capNhat = await docCapNhat();
  const chon: ChonDong = { ma: t.ma, dvt: t.dvt, loai: t.loai };
  const tho = t.co > CO_CACHE_TOI_DA
    ? await tinhDong(loc, chon, t.trang, t.co, homNay, capNhat)
    : await cachedByVersions(cacheDong,
      `dong|${coGia ? 1 : 0}|${khoaLoc(loc)}|${t.ma ?? '*'}|${t.dvt ?? '*'}|${t.loai ?? ''}|${t.trang}|${t.co}`, ['material'],
      () => tinhDong(loc, chon, t.trang, t.co, homNay, capNhat), homNay, '', false);
  if (coGia) return tho;
  return { ...tho, coGia: false, dong: tho.dong.map(d => ({ ...d, donGia: null, thanhTien: null, nhaCungCap: null })) };
});

dangKy('theo-thang', async (_req, loc, homNay, coGia) => {
  const capNhat = await docCapNhat();
  const tho = await cachedByVersions(cacheThang, `thang|${coGia ? 1 : 0}|${khoaLoc(loc)}`, ['material'],
    () => tinhTheoThang(loc, homNay, capNhat), homNay, '', false);
  if (coGia) return tho;
  return { ...tho, coGia: false, thang: tho.thang.map(x => ({ ...x, prGiaTri: null, veGiaTri: null })) };
});

// ---------------------------------------------------------------------------
// ROUTE — XUẤT TIÊU HAO
// ---------------------------------------------------------------------------
const cacheThTongHop = createCache<TongHopTieuHao>(40);
const cacheThChiTiet = createCache<ChiTietTieuHao>(30);

type XuLyTH = (req: Request, loc: BoLocTieuHao, homNay: string, coGia: boolean, pb: PhienBanTH) => Promise<unknown>;
const dangKyTH = (duong: string, xuLy: XuLyTH) => {
  app.get(`/api/vat-tu/tieu-hao/${duong}`, async (req: Request, res: Response) => {
    try {
      if (!(await userHasPermission(req, QUYEN_TIEU_HAO))) return res.status(403).json(LOI_QUYEN_TH);
      const kq = docBoLocTieuHao(req.query as Record<string, unknown>);
      if (!kq.hopLe) return res.status(400).json({ error: kq.loi });
      const coGia = await userHasPermission(req, MATERIAL_PRICE_PERMISSION);
      const homNay = vnDayKey(new Date());
      const pb = await docPhienBanTH();
      const chuaCo: ChuaCoTieuHao = { chuaCo: true, homNay };
      if (!pb.coBang) return res.json(chuaCo);
      let ra: unknown;
      try {
        ra = await xuLy(req, kq.loc, homNay, coGia, pb);
      } catch (e) {
        if (!laThieuBangTH(e)) throw e;
        quenPhienBanTH();
        return res.json(chuaCo);
      }
      if (ra === null) return res.status(400).json({ error: 'Tham số không hợp lệ' });
      res.json(ra);
    } catch (error) {
      console.error(`Lỗi vat-tu/tieu-hao/${duong}:`, error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
};

dangKyTH('tong-hop', async (req, loc, homNay, coGia, pb) => {
  const theo = req.query.theo === undefined || req.query.theo === '' ? 'nhom' : req.query.theo;
  if (typeof theo !== 'string' || !(THEO_TIEU_HAO as readonly string[]).includes(theo)) return null;
  const gop = pb.coGop && dungDuocGop(loc, theo as TheoTieuHao);
  const tinh = (g: boolean) => tinhTongHopTieuHao(loc, theo as TheoTieuHao, homNay, pb.capNhat, chayMacDinh, g);
  let tho: TongHopTieuHao;
  try {
    tho = await cachedByVersions(cacheThTongHop, `th|${theo}|${gop ? 'gop' : 'tho'}|${hashKey(loc)}`, [], () => tinh(gop), pb.khoa, '', false);
  } catch (e) {
    // Bảng gộp vừa bị xoá (42P01) => quên phiên bản, tính lại từ bảng gốc lượt này
    if (!gop || !laThieuBangTH(e)) throw e;
    quenPhienBanTH();
    tho = await tinh(false);
  }
  // Số không phụ thuộc ngày hôm nay => trả homNay của lượt này (bản cache có thể tính từ hôm trước)
  return coGia ? { ...tho, homNay } : { ...boGiaTongHopTieuHao(tho), homNay };
});

dangKyTH('chi-tiet', async (req, loc, homNay, coGia, pb) => {
  const t = docThamSoChiTietTH(req.query as Record<string, unknown>);
  if (!t) return null;
  const tho = t.co > CO_CACHE_TOI_DA
    ? await tinhChiTietTieuHao(loc, t, homNay, pb.capNhat)
    : await cachedByVersions(cacheThChiTiet, `ct|${hashKey(loc)}|${t.ma ?? '*'}|${t.dvt ?? '*'}|${t.trang}|${t.co}`, [],
      () => tinhChiTietTieuHao(loc, t, homNay, pb.capNhat), pb.khoa, '', false);
  if (coGia) return { ...tho, homNay };
  return { ...tho, homNay, coGia: false, dong: tho.dong.map(d => ({ ...d, giaTri: null })) };
});
