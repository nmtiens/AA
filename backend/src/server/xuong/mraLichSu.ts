import { pool } from '../../db.js';
import { tinhTrangThai, suKienConHieuLuc } from './state.js';
import type { SuKien, LichCaRow } from './types.js';

// ============================================================================
// LỊCH SỬ MRA CŨ (sự kiện nguon = 'mra', nạp bằng C:\data mra\nap_lich_su_mra.py) — đọc chung cho báo cáo,
// kế hoạch tuần và tab Lịch sử MRA. MRA đã ngừng (dữ liệu tới ~02–04/2026), không có quân số tổ; số nhân công
// khai theo hạng mục (có thể đếm trùng). Giờ chạy MRA = từ lúc bấm bắt đầu tới xong (gồm cả đêm) => dùng
// GIỜ TRONG CA: phần đoạn chạy nằm trong ca chính của xưởng (trừ giờ nghỉ), bỏ Chủ nhật.
// ============================================================================

export const GIO = 3_600_000;
export const NGAY = 86_400_000;
const VN = 7 * GIO;

const gioSo = (s: string) => { const [h, m] = String(s).split(':').map(Number); return h + (m || 0) / 60; };

/** Khoảng giờ làm trong ngày của ca chính (giờ, đã trừ nghỉ), vd [[7.5, 11.5], [12.25, 15.75]] */
export function khungCaChinh(lich: LichCaRow[]): Array<[number, number]> {
  const c = lich.find(x => x.loaiCa === 'chinh');
  if (!c) return [[7.5, 11.5], [12.25, 15.75]];
  let khung: Array<[number, number]> = [[gioSo(c.gioBatDau), gioSo(c.gioKetThuc)]];
  for (const n of c.nghi ?? []) {
    const [a, b] = [gioSo(String(n[0])), gioSo(String(n[1]))];
    khung = khung.flatMap(([x, y]): Array<[number, number]> =>
      (b <= x || a >= y ? [[x, y]] : ([[x, a], [b, y]] as Array<[number, number]>).filter(([p, q]) => q > p)));
  }
  return khung;
}

/** Mốc 00:00 giờ VN của ngày 'YYYY-MM-DD' */
export const dauNgayVN = (ngay: string) => Date.parse(`${ngay}T00:00:00Z`) - VN;
export const ngayCuaTs = (ts: number) => new Date(ts + VN).toISOString().slice(0, 10);

/** Giờ trong ca của [a, b) chỉ tính trong ngày bắt đầu lúc d (00:00 VN); Chủ nhật = 0 trừ khi tinhChuNhat
 *  (báo cáo bật khi Dữ liệu Điểm danh cho thấy xưởng có làm Chủ nhật đó) */
export function gioTrongCaNgay(a: number, b: number, d: number, khung: Array<[number, number]>, tinhChuNhat = false): number {
  if (b <= a || (!tinhChuNhat && new Date(d + VN).getUTCDay() === 0)) return 0;
  let t = 0;
  for (const [x, y] of khung) t += Math.max(0, Math.min(b, d + y * GIO) - Math.max(a, d + x * GIO));
  return t / GIO;
}
/** Giờ trong ca của cả đoạn [a, b) */
export function gioTrongCa(a: number, b: number, khung: Array<[number, number]>): number {
  if (b <= a) return 0;
  let t = 0;
  for (let d = Math.floor((a + VN) / NGAY) * NGAY - VN; d < b; d += NGAY) t += gioTrongCaNgay(a, b, d, khung);
  return t;
}

export interface CapMra {
  hex: string; cd: string;
  /** Các đoạn chạy (đoạn còn mở kết thúc ở thao tác cuối) */
  doan: Array<{ start: number; end: number }>;
  /** Số nhân công MRA bình quân của cặp (null = không khai) */
  nc: number | null;
  nhan: Array<{ ts: number; sl: number }>;
  xong: Array<{ ts: number; sl: number }>;
  soNgung: number; gioNgung: number;
  dau: number; xongCuoi: number | null; slNhan: number; slXong: number;
  evs: SuKien[];
}

const nho = new Map<string, { luc: number; caps: CapMra[] }>();

/** Mọi cặp (hạng mục, công đoạn) MRA của xưởng — nhớ 1 giờ (dữ liệu cũ không đổi) */
export async function taiMra(xuong: string, toSuKien: (r: Record<string, unknown>) => SuKien, cot: string, moi = false): Promise<CapMra[]> {
  return taiCap(xuong, 'mra', toSuKien, cot, moi);
}

/**
 * Cặp (hạng mục, công đoạn) của xưởng dựng từ sổ sự kiện — dùng chung cho MRA cũ (nguon = 'mra', nhớ 1 giờ) và số liệu
 * app hiện tại (nguon = 'app', bỏ thao tác đã huỷ, nhớ 5 phút) để phân tích cùng một cách: giờ trong ca từng công đoạn,
 * ngày nằm trong xưởng, tạm ngưng. Số người: MRA = nhân công khai (chia_nguoi); app = số người khai lúc bắt đầu / tiếp tục /
 * chia người.
 */
export async function taiCap(xuong: string, nguon: 'mra' | 'app', toSuKien: (r: Record<string, unknown>) => SuKien, cot: string, moi = false): Promise<CapMra[]> {
  const khoa = `${nguon}|${xuong}`;
  const n = nho.get(khoa);
  if (n && !moi && Date.now() - n.luc < (nguon === 'mra' ? GIO : 5 * 60_000)) return n.caps;
  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = (await pool.query(
      nguon === 'mra'
        ? `SELECT ${cot} FROM xuong_su_kien WHERE nguon = 'mra' AND xuong = $1 AND hex IS NOT NULL AND cong_doan_id IS NOT NULL`
        // App: kèm sự kiện huỷ (huỷ không luôn có công đoạn) để bỏ đúng thao tác bị huỷ
        : `SELECT ${cot} FROM xuong_su_kien WHERE nguon = 'app' AND xuong = $1 AND hex IS NOT NULL AND (cong_doan_id IS NOT NULL OR loai = 'huy')`,
      [xuong])).rows;
  } catch { rows = []; }
  const tatCa = rows.map(toSuKien);
  const conLai = nguon === 'app' ? suKienConHieuLuc(tatCa) : tatCa;
  const theoCap = new Map<string, SuKien[]>();
  for (const e of conLai) {
    if (!e.congDoanId) continue;
    const k = `${e.hex}|${e.congDoanId}`;
    if (!theoCap.has(k)) theoCap.set(k, []);
    theoCap.get(k)!.push(e);
  }
  const loaiSoNguoi = nguon === 'mra' ? new Set(['chia_nguoi']) : new Set(['bat_dau', 'tiep_tuc', 'chia_nguoi']);
  const caps: CapMra[] = [];
  for (const [k, evs] of theoCap) {
    const [hex, cd] = k.split('|');
    evs.sort((a, b) => a.ts - b.ts);
    const t = tinhTrangThai(evs, []);
    const cuoi = t.suKienCuoi ?? evs[evs.length - 1].ts;
    let soNgung = 0, gioNgung = 0, ngungTu: number | null = null;
    for (const e of evs) {
      if (e.loai === 'tam_ngung') { soNgung++; ngungTu = e.ts; }
      else if (ngungTu !== null && (e.loai === 'tiep_tuc' || e.loai === 'bat_dau' || e.loai === 'hoan_thanh')) { gioNgung += (e.ts - ngungTu) / GIO; ngungTu = null; }
    }
    const ncs = evs.filter(e => loaiSoNguoi.has(e.loai) && e.soNguoi !== null && e.soNguoi !== undefined && e.soNguoi > 0).map(e => e.soNguoi!);
    const xong = evs.filter(e => e.loai === 'hoan_thanh').map(e => ({ ts: e.ts, sl: e.soLuong ?? 0 }));
    const raTs = evs.filter(e => e.loai === 'hoan_thanh' || e.loai === 'giao').map(e => e.ts);
    caps.push({
      hex, cd, doan: t.doanChay.map(d => ({ start: d.start, end: d.end ?? (nguon === 'app' && t.trangThai === 'dang_lam' ? Date.now() : cuoi) })).filter(d => d.end > d.start),
      nc: ncs.length ? ncs.reduce((a, b) => a + b, 0) / ncs.length : null,
      nhan: evs.filter(e => e.loai === 'nhan').map(e => ({ ts: e.ts, sl: e.soLuong ?? 0 })), xong,
      soNgung, gioNgung, dau: evs[0].ts, xongCuoi: raTs.length ? Math.max(...raTs) : null,
      slNhan: t.slNhan, slXong: t.slHoanThanh, evs,
    });
  }
  nho.set(khoa, { luc: Date.now(), caps });
  return caps;
}

/** Trạng thái công đoạn MRA của hạng mục tại thời điểm `luc` (cho tuần kế hoạch thuộc giai đoạn MRA) */
export function trangThaiMraLuc(cap: CapMra, luc: number) {
  const evs = cap.evs.filter(e => e.ts <= luc);
  if (!evs.length) return null;
  const t = tinhTrangThai(evs, []);
  // MRA hay ghi trùng số giao tới => theo số đã nhận / xong
  const trangThai = t.trangThai === 'cho_nhan' || t.trangThai === 'cho_giao'
    ? (t.slNhan > 0 && t.slHoanThanh >= t.slNhan ? 'xong' : t.slNhan > 0 ? 'da_nhan' : t.trangThai)
    : t.trangThai;
  return { trangThai, slNhan: t.slNhan, slHoanThanh: t.slHoanThanh, slGiao: t.slGiao };
}
