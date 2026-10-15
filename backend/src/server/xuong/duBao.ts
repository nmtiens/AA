import { taiCap, taiMra, NGAY } from './mraLichSu.js';
import { tuyenTheoThanhPhan, suKienConHieuLuc } from './state.js';
import type { SuKien } from './types.js';

// ============================================================================
// DỰ BÁO NGUY CƠ RỚT KẾ HOẠCH (tab Kế hoạch & phân tích): hạng mục kế hoạch tuần còn bao nhiêu ngày lịch nữa mới xong
// xưởng, so với số ngày còn tới ngày KHNK.
//   Mốc từng công đoạn = "thường mất" (trung vị) số NGÀY LỊCH từ thao tác đầu ở công đoạn tới lần xong / giao cuối —
//   gồm cả chờ, nghỉ, đêm như thực tế. Ưu tiên số liệu app (≥ 10 hạng mục ở công đoạn đó); chưa đủ thì lịch sử MRA cũ
//   (03/2025 – 02/2026, ≥ 3 hạng mục). Tự chuyển sang mốc app khi app đủ số liệu.
//   Còn lại = Σ mốc các công đoạn chưa xong trong tuyến (công đoạn đang làm trừ phần đã qua); thành phần song song lấy
//   nhánh dài nhất. Chỉ ước tính được khi hạng mục có tuyến triển khai.
// ============================================================================

export interface MocCd { ngay: number; n: number; nguon: 'app' | 'mra' }
export interface DuBao {
  /** Ngày lịch còn cần (ước tính) */
  canNgay: number;
  /** Ngày lịch còn lại tới hết ngày KHNK (hoặc hết tuần kế hoạch) */
  conNgay: number;
  muc: 'rot' | 'sat' | 'kip';
  /** Nguồn mốc đã dùng */
  nguonMoc: 'app' | 'mra' | 'ca_hai';
  /** Công đoạn còn lại chưa có mốc (không cộng được — dự báo có thể thấp hơn thực tế) */
  thieuMoc: string[];
  /** Công đoạn còn lại theo thứ tự (nhánh dài nhất) */
  conLai: string[];
}

const APP_TOI_THIEU = 10;
const MRA_TOI_THIEU = 3;
const trungVi = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Mốc "thường mất" (ngày lịch) từng công đoạn của các xưởng */
export async function mocChuanTheoCd(
  xuongs: string[], toSuKien: (r: Record<string, unknown>) => SuKien, cot: string,
): Promise<Map<string, MocCd>> {
  const out = new Map<string, MocCd>();
  for (const xg of [...new Set(xuongs)]) {
    const [app, mra] = await Promise.all([taiCap(xg, 'app', toSuKien, cot), taiMra(xg, toSuKien, cot)]);
    const gom = (caps: typeof app) => {
      const m = new Map<string, number[]>();
      for (const c of caps) {
        if (c.xongCuoi === null || c.xongCuoi <= c.dau) continue;
        if (!m.has(c.cd)) m.set(c.cd, []);
        m.get(c.cd)!.push((c.xongCuoi - c.dau) / NGAY);
      }
      return m;
    };
    const a = gom(app), b = gom(mra);
    for (const cd of new Set([...a.keys(), ...b.keys()])) {
      const da = a.get(cd) ?? [], db = b.get(cd) ?? [];
      if (da.length >= APP_TOI_THIEU) out.set(cd, { ngay: trungVi(da), n: da.length, nguon: 'app' });
      else if (db.length >= MRA_TOI_THIEU) out.set(cd, { ngay: trungVi(db), n: db.length, nguon: 'mra' });
      else if (da.length >= MRA_TOI_THIEU) out.set(cd, { ngay: trungVi(da), n: da.length, nguon: 'app' });
    }
  }
  return out;
}

/**
 * Dự báo cho một hạng mục: `evts` = sự kiện app của hạng mục (đủ để lấy tuyến + lúc bắt đầu ở từng công đoạn),
 * `xong(cd)` = công đoạn đã xong đủ số, `hanCuoi` = mốc hết hạn (ms), `now` = bây giờ (ms). null = không ước tính được.
 */
export function duBaoHangMuc(
  evts: SuKien[], moc: Map<string, MocCd>, xong: (cd: string) => boolean, hanCuoi: number, now: number,
): DuBao | null {
  const tuyen = tuyenTheoThanhPhan(evts);
  if (!tuyen.length) return null;
  const hl = suKienConHieuLuc(evts);
  const dauTai = new Map<string, number>();
  for (const e of hl) if (e.congDoanId && e.loai !== 'trien_khai' && e.loai !== 'khai_bao_cd') {
    dauTai.set(e.congDoanId, Math.min(dauTai.get(e.congDoanId) ?? Infinity, e.ts));
  }
  let tot: { can: number; conLai: string[]; nguon: Set<string> } | null = null;
  // Công đoạn còn lại thiếu mốc ở MỌI nhánh (nhánh thiếu mốc bị cộng thấp, có thể không phải nhánh dài nhất)
  const thieuMoc = new Set<string>();
  for (const t of tuyen) {
    let can = 0; const conLai: string[] = []; const nguon = new Set<string>();
    for (const cd of t.tuyen) {
      if (xong(cd)) continue;
      conLai.push(cd);
      const m = moc.get(cd);
      if (!m) { thieuMoc.add(cd); continue; }
      nguon.add(m.nguon);
      const daQua = dauTai.has(cd) ? (now - dauTai.get(cd)!) / NGAY : 0;
      // Đang làm lâu hơn mốc: vẫn tính tối thiểu nửa ngày cho phần còn lại
      can += dauTai.has(cd) ? Math.max(0.5, m.ngay - daQua) : m.ngay;
    }
    if (!tot || can > tot.can) tot = { can, conLai, nguon };
  }
  if (!tot || !tot.conLai.length) return null;
  const conNgay = Math.max(0, (hanCuoi - now) / NGAY);
  const muc = tot.can > conNgay ? 'rot' : tot.can > conNgay * 0.8 ? 'sat' : 'kip';
  const nguonMoc = tot.nguon.size > 1 ? 'ca_hai' : tot.nguon.has('app') ? 'app' : 'mra';
  return { canNgay: Math.round(tot.can * 10) / 10, conNgay: Math.round(conNgay * 10) / 10, muc, nguonMoc, thieuMoc: [...thieuMoc], conLai: tot.conLai };
}
