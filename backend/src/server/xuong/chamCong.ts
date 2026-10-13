import type { DoanCoMat } from './allocation.js';
import type { LichCaRow, LoaiCa, SuKien } from './types.js';
import { LOAI_CA } from './types.js';

// ============================================================================
// CHẤM CÔNG THEO NGƯỜI (docs/designs/xuong-cham-cong.md) — dựng khoảng có mặt từ sổ sự kiện.
//   vao_ca: { loaiCa, nguoi: [{ mnv, luc? }] }  — có mặt từ `luc` (mặc định giờ bấm)
//   ra_ca:  { loaiCa, nguoi: [{ mnv, luc?, lyDo? }] } — rời từ `luc`; lyDo 'vang' với luc = giờ vào => khoảng rỗng
// Hết ca thì cửa sổ ca tự cắt (allocation.ts), không cần ra_ca.
// ============================================================================

export const MNV_RE = /^[A-Z0-9][A-Z0-9._-]{1,19}$/;
export const chuanMnv = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');

export interface NguoiDiemDanh { mnv: string; luc: number | null; lyDo: string | null }

/** Danh sách người trong du_lieu.nguoi của vao_ca / ra_ca (bỏ dòng sai) */
export function nguoiTrongSuKien(duLieu: Record<string, unknown> | null | undefined): NguoiDiemDanh[] {
  const ds = Array.isArray(duLieu?.nguoi) ? (duLieu!.nguoi as unknown[]) : [];
  const out: NguoiDiemDanh[] = [];
  for (const x of ds) {
    const o = (typeof x === 'string' ? { mnv: x } : x) as Record<string, unknown>;
    const mnv = chuanMnv(o?.mnv);
    if (!MNV_RE.test(mnv)) continue;
    const luc = typeof o.luc === 'number' && Number.isFinite(o.luc) ? o.luc : null;
    out.push({ mnv, luc, lyDo: typeof o.lyDo === 'string' ? o.lyDo.slice(0, 40) : null });
  }
  return out;
}

/** Kiểm tra du_lieu của vao_ca / ra_ca; trả lý do từ chối hoặc null */
export function kiemTraDiemDanh(duLieu: Record<string, unknown> | null | undefined): string | null {
  const ca = duLieu?.loaiCa;
  if (typeof ca !== 'string' || !LOAI_CA.includes(ca as LoaiCa)) return 'Loại ca không hợp lệ';
  const ds = Array.isArray(duLieu?.nguoi) ? (duLieu!.nguoi as unknown[]) : [];
  if (!ds.length || ds.length > 300) return 'Danh sách điểm danh trống hoặc quá dài';
  if (nguoiTrongSuKien(duLieu).length !== ds.length) return 'Mã nhân viên không hợp lệ';
  return null;
}

/**
 * Khoảng có mặt theo loại ca từ các sự kiện vao_ca / ra_ca còn hiệu lực (đã bỏ sự kiện bị huỷ).
 * Giờ trong `luc` được giới hạn không muộn hơn giờ bấm quá 3 giờ (điểm danh sớm trước giờ vào ca thì ghi đúng giờ ca).
 */
export function doanCoMat(evts: SuKien[]): Partial<Record<LoaiCa, DoanCoMat[]>> {
  type Moc = { mnv: string; ca: LoaiCa; luc: number; vao: boolean; thuTu: number };
  const mocs: Moc[] = [];
  let i = 0;
  for (const e of evts) {
    if (e.loai !== 'vao_ca' && e.loai !== 'ra_ca') continue;
    const ca = String(e.duLieu?.loaiCa ?? '') as LoaiCa;
    if (!LOAI_CA.includes(ca)) continue;
    for (const n of nguoiTrongSuKien(e.duLieu)) {
      const luc = Math.min(n.luc ?? e.ts, e.ts + 3 * 3_600_000);
      mocs.push({ mnv: n.mnv, ca, luc, vao: e.loai === 'vao_ca', thuTu: i++ });
    }
  }
  // Cùng giờ: thứ tự ghi (vắng ngay sau khi tick vẫn đúng)
  mocs.sort((a, b) => a.luc - b.luc || a.thuTu - b.thuTu);
  const out: Partial<Record<LoaiCa, DoanCoMat[]>> = {};
  const mo = new Map<string, DoanCoMat>();
  for (const m of mocs) {
    const k = `${m.ca}|${m.mnv}`;
    const dang = mo.get(k);
    if (m.vao) {
      if (dang) continue; // đã có mặt
      const d: DoanCoMat = { mnv: m.mnv, start: m.luc, end: null };
      (out[m.ca] ??= []).push(d);
      mo.set(k, d);
    } else if (dang) {
      dang.end = Math.max(dang.start, m.luc);
      mo.delete(k);
    }
  }
  // Bỏ khoảng rỗng (đánh vắng ngay sau khi tick)
  for (const ca of Object.keys(out) as LoaiCa[]) out[ca] = out[ca]!.filter(d => d.end === null || d.end > d.start);
  return out;
}

/** Giờ vào / ra, phút trễ / về sớm so với ca chính của từng người trong ngày */
export function tomTatDiemDanh(coMat: Partial<Record<LoaiCa, DoanCoMat[]>>, ngay: string, lichCa: LichCaRow[]) {
  const moc = (hhmm: string) => Date.parse(`${ngay}T${hhmm.slice(0, 5)}:00+07:00`);
  const chinh = lichCa.find(c => c.loaiCa === 'chinh');
  const bd = chinh ? moc(chinh.gioBatDau) : null;
  const kt = chinh ? moc(chinh.gioKetThuc) : null;
  const out: Record<string, { vao: number; ra: number | null; ca: LoaiCa[]; treP: number; veSomP: number }> = {};
  for (const [ca, ds] of Object.entries(coMat) as Array<[LoaiCa, DoanCoMat[]]>) {
    for (const d of ds) {
      const x = (out[d.mnv] ??= { vao: d.start, ra: d.end, ca: [], treP: 0, veSomP: 0 });
      x.vao = Math.min(x.vao, d.start);
      x.ra = x.ra === null || d.end === null ? null : Math.max(x.ra, d.end);
      if (!x.ca.includes(ca)) x.ca.push(ca);
      if (ca === 'chinh' && bd !== null && kt !== null) {
        x.treP = Math.max(x.treP, Math.round((d.start - bd) / 60_000));
        if (d.end !== null && d.end < kt) x.veSomP = Math.max(x.veSomP, Math.round((kt - d.end) / 60_000));
      }
    }
  }
  for (const x of Object.values(out)) { x.treP = Math.max(0, x.treP); x.veSomP = Math.max(0, x.veSomP); }
  return out;
}
