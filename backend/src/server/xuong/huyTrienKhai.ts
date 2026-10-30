import type { SuKien } from './types.js';
import { suKienConHieuLuc, slGiaoDenDongBo, tuyenTheoThanhPhan } from './state.js';

// ============================================================================
// HUỶ MỘT ĐỢT TRIỂN KHAI (máy tính) — đợt = sự kiện trien_khai + các khai_bao_cd gắn trienKhaiId (cả của xưởng phụ, QT2).
// Hàm thuần, không đọc DB: chọn sự kiện cần huỷ và kiểm có chặn không. Chặn khi sau huỷ, ở công đoạn đầu tuyến
// số tổ đã nhận trong app > số giao tới còn lại (hàng của đợt đã được tổ nhận) — phải huỷ nhận ở tổ trước.
// ============================================================================

const so = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const EPS = 0.0005;

export interface ChanHuyDot {
  congDoanId: string;
  /** Tổ đã nhận ở công đoạn này (theo sự kiện nhận còn hiệu lực) */
  toIds: number[];
  slNhan: number;
  slGiaoDenConLai: number;
}

/** Sự kiện còn hiệu lực của đợt (trien_khai trước); rỗng = không có / đã huỷ */
export function suKienCuaDot(evts: SuKien[], trienKhaiId: string): SuKien[] {
  const con = suKienConHieuLuc(evts);
  const tk = con.find(e => e.id === trienKhaiId && e.loai === 'trien_khai');
  if (!tk) return [];
  return [tk, ...con.filter(e => e.loai === 'khai_bao_cd' && String(e.duLieu?.trienKhaiId ?? '') === trienKhaiId)];
}

/** Hàng giao tới công đoạn (đồng bộ theo thành phần ở công đoạn hợp nhánh) */
const giaoDen = (evts: SuKien[], cd: string) => slGiaoDenDongBo(
  suKienConHieuLuc(evts.filter(e => (e.loai === 'giao' || e.loai === 'khai_bao_cd' || e.loai === 'huy') && (e.congDoanDenId === cd || e.loai === 'huy')))
    .filter(e => e.loai === 'giao' || e.loai === 'khai_bao_cd'),
  tuyenTheoThanhPhan(evts), cd);

/**
 * Kiểm huỷ đợt triển khai của một hạng mục. `evts`: mọi sự kiện app của hex (gồm cả huy).
 * Trả null khi đợt không còn hiệu lực; `chan` rỗng = huỷ được.
 */
export function kiemTraHuyDot(evts: SuKien[], trienKhaiId: string): { huy: SuKien[]; chan: ChanHuyDot[] } | null {
  const huy = suKienCuaDot(evts, trienKhaiId);
  if (!huy.length) return null;
  const tsCuoi = Math.max(0, ...evts.map(e => e.ts)) + 1;
  const sau: SuKien[] = [...evts, ...huy.map(e => ({
    ...e, id: `huy:${e.id}`, loai: 'huy' as const, suaCho: e.id, soLuong: null, congDoanDenId: null, duLieu: null, ts: tsCuoi, serverTs: tsCuoi,
  }))];
  const chan: ChanHuyDot[] = [];
  for (const cd of [...new Set(huy.map(e => e.congDoanDenId).filter((x): x is string => !!x))]) {
    // Nhận ngoài app (ghi nguồn) không cần hàng giao tới (R10) — không tính
    const nhan = suKienConHieuLuc(evts.filter(e => e.congDoanId === cd || e.loai === 'huy'))
      .filter(e => e.loai === 'nhan' && !e.congDoanNguonId && !e.xuongNguon);
    const slNhan = nhan.reduce((a, e) => a + so(e.soLuong), 0);
    const truoc = giaoDen(evts, cd);
    const conLai = giaoDen(sau, cd);
    // Chỉ chặn khi huỷ làm thiếu hàng (đã nhận vượt từ trước mà đợt này không chạm thì không chặn)
    if (slNhan > conLai + EPS && conLai < truoc - EPS) {
      chan.push({ congDoanId: cd, toIds: [...new Set(nhan.map(e => e.toId).filter((x): x is number => x !== null))], slNhan, slGiaoDenConLai: conLai });
    }
  }
  return { huy, chan };
}
