import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, X, Plus } from 'lucide-react';
import type { CongDoanTk } from '../../services/xuongSetupApi';
import { BTN } from './xuongDesktopUi';

// ============================================================================
// Chọn tuyến công đoạn chi tiết (thứ tự hàng đi qua) — dùng ở Triển khai (QT1, từng thành phần) và Khai CĐ chi tiết
// của xưởng phụ (QT2). Công đoạn đầu tuyến phải thuộc xưởng thực hiện; các công đoạn sau có thể ở xưởng khác
// (vd tuyến Kim loại của 8C kết thúc ở Fitting của xưởng chính).
// ============================================================================

export const tenCongDoan = (congDoan: CongDoanTk[], xuongGoc: string) => {
  const m = new Map(congDoan.map(c => [c.id, c]));
  return (id: string) => { const c = m.get(id); return c ? (c.xuong === xuongGoc ? c.ten : `${c.ten} (${c.xuong})`) : id; };
};

export default function ChonTuyen({ tuyen, onDoi, congDoan, xuong, xuongGoc }: {
  tuyen: string[]; onDoi: (t: string[]) => void; congDoan: CongDoanTk[];
  /** Xưởng thực hiện — công đoạn đầu tuyến phải thuộc xưởng này */
  xuong: string;
  /** Xưởng đang xem (tên công đoạn của xưởng này không kèm mã xưởng) */
  xuongGoc: string;
}) {
  const [them, setThem] = useState('');
  const ten = useMemo(() => tenCongDoan(congDoan, xuongGoc), [congDoan, xuongGoc]);
  const nhom = useMemo(() => {
    const g = new Map<string, CongDoanTk[]>();
    for (const c of congDoan) { if (!g.has(c.xuong)) g.set(c.xuong, []); g.get(c.xuong)!.push(c); }
    return [...g.entries()].sort(([a], [b]) => (a === xuong ? -1 : b === xuong ? 1 : a.localeCompare(b)));
  }, [congDoan, xuong]);
  const dauSai = tuyen.length > 0 && congDoan.find(c => c.id === tuyen[0])?.xuong !== xuong;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tuyen.length === 0 && <span className="text-sm text-slate-500">Chưa có công đoạn — thêm theo thứ tự hàng đi qua.</span>}
        {tuyen.map((id, i) => (
          <span key={`${id}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
            <span className="text-xs text-slate-400">{i + 1}.</span> {ten(id)}
            <button type="button" aria-label="Lên" disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
              onClick={() => { const n = [...tuyen]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onDoi(n); }}><ArrowUp size={13} /></button>
            <button type="button" aria-label="Xuống" disabled={i === tuyen.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
              onClick={() => { const n = [...tuyen]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; onDoi(n); }}><ArrowDown size={13} /></button>
            <button type="button" aria-label="Bỏ" className="text-slate-400 hover:text-red-600" onClick={() => onDoi(tuyen.filter((_, j) => j !== i))}><X size={13} /></button>
          </span>
        ))}
      </div>
      {dauSai && <p className="text-xs text-red-700">Công đoạn đầu tuyến phải thuộc xưởng {xuong}.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select value={them} onChange={e => setThem(e.target.value)} className="min-w-64 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" aria-label="Chọn công đoạn thêm vào tuyến">
          <option value="">— Chọn công đoạn —</option>
          {nhom.map(([x, ds]) => (
            <optgroup key={x} label={`Xưởng ${x}${x === xuong ? ' (xưởng thực hiện)' : ''}`}>
              {ds.map(c => <option key={c.id} value={c.id}>{c.cdTachMa ? `${c.cdTachMa} · ` : ''}{c.ten}</option>)}
            </optgroup>
          ))}
        </select>
        <button type="button" className={BTN} disabled={!them} onClick={() => { onDoi([...tuyen, them]); setThem(''); }}><Plus size={14} /> Thêm</button>
      </div>
    </div>
  );
}
