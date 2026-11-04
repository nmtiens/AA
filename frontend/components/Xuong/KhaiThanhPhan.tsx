import { X, Plus } from 'lucide-react';
import type { CongDoanTk, ThanhPhanTrienKhai } from '../../services/xuongSetupApi';
import { BTN } from './xuongDesktopUi';
import ChonTuyen from './ChonTuyen';

// ============================================================================
// Khai danh sách thành phần (Gỗ / Sofa / Kim loại / Kính / Đá): mỗi thành phần một xưởng thực hiện + tuyến công đoạn.
// Dùng ở Triển khai hạng mục và Tuyến mặc định.
// ============================================================================

/** Lỗi đầu tiên của danh sách thành phần (hợp lệ: null) — backend kiểm lại khi lưu / triển khai */
export const loiThanhPhan = (ds: ThanhPhanTrienKhai[], xuong: string, xuongCd: Map<string, string>): string | null => {
  if (!ds.length) return 'chưa có thành phần';
  for (const t of ds) {
    if (t.xuong === xuong && !t.tuyen.length) return `${t.ten}: chưa có tuyến`;
    if (t.tuyen.length && xuongCd.get(t.tuyen[0]) !== t.xuong) return `${t.ten}: đầu tuyến phải thuộc xưởng ${t.xuong}`;
  }
  return null;
};

export default function KhaiThanhPhan({ ds, onDoi, tenThanhPhan, congDoan, xuong }: {
  ds: ThanhPhanTrienKhai[]; onDoi: (ds: ThanhPhanTrienKhai[]) => void; tenThanhPhan: string[]; congDoan: CongDoanTk[]; xuong: string;
}) {
  const dsXuong = [...new Set(congDoan.map(c => c.xuong))].sort((a, b) => (a === xuong ? -1 : b === xuong ? 1 : a.localeCompare(b)));
  const sua = (k: number, moi: Partial<ThanhPhanTrienKhai>) => onDoi(ds.map((x, j) => (j === k ? { ...x, ...moi } : x)));
  return (
    <>
      {ds.map((t, k) => (
        <div key={k} className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={t.ten} aria-label="Thành phần" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold"
              onChange={e => sua(k, { ten: e.target.value })}>
              {tenThanhPhan.filter(n => n === t.ten || !ds.some(x => x.ten === n)).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">Xưởng thực hiện
              <select value={t.xuong} aria-label="Xưởng thực hiện" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                onChange={e => sua(k, { xuong: e.target.value, tuyen: [] })}>
                {dsXuong.map(x => <option key={x} value={x}>{x}{x === xuong ? ' (xưởng chính)' : ' — xưởng phụ'}</option>)}
              </select>
            </label>
            <button type="button" className="ml-auto text-slate-400 hover:text-red-600" aria-label={`Bỏ thành phần ${t.ten}`}
              onClick={() => onDoi(ds.filter((_, j) => j !== k))}><X size={15} /></button>
          </div>
          {t.xuong !== xuong && !t.tuyen.length && <p className="text-xs text-slate-500">Để trống: xưởng {t.xuong} nhận thông báo và tự khai CĐ chi tiết.</p>}
          <ChonTuyen tuyen={t.tuyen} onDoi={tuyen => sua(k, { tuyen })} congDoan={congDoan} xuong={t.xuong} xuongGoc={xuong} />
        </div>
      ))}
      <button type="button" className={BTN} disabled={ds.length >= tenThanhPhan.length}
        onClick={() => onDoi([...ds, { ten: tenThanhPhan.find(n => !ds.some(x => x.ten === n)) ?? 'GỖ', xuong, tuyen: [] }])}>
        <Plus size={14} /> Thêm thành phần
      </button>
    </>
  );
}
