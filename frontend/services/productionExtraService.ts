import { getToken } from './userService';

// ============================================================================
// Thông tin thêm theo HEX cho cửa sổ Tổng quan công trình (POST /api/production/by-hex-extra):
// số lượng đã giao theo công đoạn sản xuất, tóm tắt QC, gia công ngoài, mốc ngày triển khai / phiếu.
// ============================================================================

export type StepKey = 'cts' | 'may' | 'moc' | 'kl' | 'vecni' | 'sofa' | 'da' | 'kinh' | 'fit' | 'bb';

/** Công đoạn sản xuất theo thứ tự chuyền; `flag` = chỉ áp dụng khi hạng mục có cờ (co_vecni…) hoặc đã có số */
export const STEPS: { key: StepKey; label: string; flag?: 'vecni' | 'sofa' | 'kl' | 'kinhDa' }[] = [
  { key: 'cts', label: 'CTS' },
  { key: 'may', label: 'Máy' },
  { key: 'moc', label: 'Mộc' },
  { key: 'kl', label: 'Kim loại', flag: 'kl' },
  { key: 'vecni', label: 'Vecni', flag: 'vecni' },
  { key: 'sofa', label: 'Sofa', flag: 'sofa' },
  { key: 'da', label: 'Đá', flag: 'kinhDa' },
  { key: 'kinh', label: 'Kính', flag: 'kinhDa' },
  { key: 'fit', label: 'Fitting' },
  { key: 'bb', label: 'Bao bì' },
];

export interface QcSummary {
  n: number;
  checked: number; pass: number; fail: number;
  /** số lần kiểm có lỗi (SL lỗi > 0) hoặc bị từ chối / gắn cờ */
  bad: number;
  last: { date: string; stage: string; status: string; fail: number } | null;
}

export interface HexExtra {
  pm: string | null;
  bv: string | null; bvSt: string | null;
  ph: string | null; dp: string | null; phSt: string | null;
  qtyTicket: number;
  qtyOut: number; qtyStock: number;
  steps: Record<StepKey, number>;
  flags: { vecni: boolean; sofa: boolean; kl: boolean; kinhDa: boolean };
  gcn: { st: string | null; due: string | null; note: string | null; xuong: string | null } | null;
  qc: QcSummary | null;
}

const BATCH = 3000;

export const fetchHexExtra = async (hexes: string[], signal?: AbortSignal): Promise<Record<string, HexExtra>> => {
  const unique = [...new Set(hexes.filter(Boolean))];
  if (unique.length === 0) return {};
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH) chunks.push(unique.slice(i, i + BATCH));
  const parts = await Promise.all(chunks.map(async chunk => {
    const r = await fetch('/api/production/by-hex-extra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
      body: JSON.stringify({ hexes: chunk }),
      signal,
    });
    if (!r.ok) throw new Error(`by-hex-extra ${r.status}`);
    return r.json() as Promise<Record<string, HexExtra>>;
  }));
  return Object.assign({}, ...parts);
};

/** Trạng thái QC gần nhất -> nhóm hiển thị */
export type QcState = 'none' | 'ok' | 'bad' | 'wait';
export const qcStateOf = (qc: QcSummary | null | undefined): QcState => {
  if (!qc || !qc.last) return 'none';
  const st = qc.last.status;
  if (st === 'rejected' || st === 'flagged' || qc.last.fail > 0) return 'bad';
  if (st === 'pending' || st === 'submitted') return 'wait';
  return 'ok';
};
export const QC_STATE_META: Record<QcState, { label: string; badge: string }> = {
  none: { label: 'Chưa kiểm', badge: 'bg-slate-100 text-slate-500' },
  ok: { label: 'Đạt', badge: 'bg-emerald-50 text-emerald-700' },
  bad: { label: 'Có lỗi / từ chối', badge: 'bg-red-50 text-red-700' },
  wait: { label: 'Chờ duyệt', badge: 'bg-amber-50 text-amber-700' },
};
export const QC_STATUS_VI: Record<string, string> = {
  approved: 'Đạt', rejected: 'Từ chối', flagged: 'Gắn cờ', pending: 'Chờ duyệt', submitted: 'Đã gửi', unknown: '—',
};

/** Gia công ngoài: "10. HOÀN THÀNH" / "12. HỦY" là xong; còn lại đang chờ NCC */
export const gcnPending = (st: string | null | undefined): boolean => {
  const s = String(st ?? '').toUpperCase();
  if (!s) return true;
  return !(s.includes('HOÀN THÀNH') || s.includes('HỦY') || s.includes('ĐÃ VỀ'));
};
