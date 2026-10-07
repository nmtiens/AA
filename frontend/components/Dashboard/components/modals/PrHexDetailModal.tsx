import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Download } from 'lucide-react';
import { formatSmartDecimal } from '../../utils/numberParsers';
import { downloadCsvFile, rowsToCsvString } from '../../utils/csvExport';

// 1 PR mua cho những hex nào (trên toàn bộ dữ liệu vật tư) và các hex đó thuộc
// hạng mục / công trình / PC nào. Mở từ ô "Tổng hex của PR" trong bảng Theo PR.
// Hex "Trong bộ lọc" = nằm trong danh sách HEX đang mở (đã qua bộ lọc của trang);
// hex ngoài bộ lọc được ghi lý do bằng cách so thuộc tính với các hex trong bộ lọc.
interface PrHexRow {
  pr_line: number | null;
  ten_vat_tu: string | null;
  trang_thai: string | null;
  dvt: string | null;
  so_luong_yeu_cau: number | null;
  so_luong_con_lai: number | null;
  hex: string;
  ma_nha_may: string;
  in_production: boolean;
  ten_hang_muc: string | null;
  ma_cong_trinh: string | null;
  tinh_trang_ipo: string | null;
  ten_pc: string | null;
  ten_pm: string | null;
  khu_vuc_du_an: string | null;
  ten_cong_trinh: string | null;
  thang_can_giao: string | null;
}

interface PrHexDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pr: string;
  /** Các hex trong danh sách HEX đang mở (đã qua bộ lọc của trang) */
  viewingHexes: Set<string>;
}

const NO_PROJECT = '(Không tìm thấy hex bên sản xuất)';

// Thứ tự = thứ tự ưu tiên khi ghi lý do
const REASON_FIELDS: { key: keyof PrHexRow; label: string }[] = [
  { key: 'tinh_trang_ipo', label: 'Tình trạng IPO' },
  { key: 'ten_cong_trinh', label: 'Công trình' },
  { key: 'ten_pc', label: 'PC' },
  { key: 'ten_pm', label: 'PM' },
  { key: 'khu_vuc_du_an', label: 'Khu vực' },
  { key: 'thang_can_giao', label: 'Hạn giao' },
];
const REASON_OTHER = 'Bị loại bởi ô tìm kiếm / ô "Chỉ hex có vật tư" / lọc khác';
const REASON_NO_PROD = 'Không có hex này bên sản xuất';

const fmtNum = (v: number | null) =>
  v === null || v === undefined ? '' : formatSmartDecimal(Number(v), 3);

export const PrHexDetailModal = ({ isOpen, onClose, pr, viewingHexes }: PrHexDetailModalProps) => {
  const [rows, setRows] = useState<PrHexRow[] | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyOutside, setOnlyOutside] = useState(false);
  const [projectFilter, setProjectFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');

  useEffect(() => {
    if (!isOpen || !pr) {
      setSearch(''); setOnlyOutside(false); setProjectFilter(''); setReasonFilter('');
      return;
    }
    const ctrl = new AbortController();
    setRows(null); setError(false);
    fetch('/api/material/pr-hexes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pr, inFilterHexes: [...viewingHexes] }),
      signal: ctrl.signal,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { rows?: PrHexRow[]; filterValues?: Record<string, string[]> }) => {
        setRows(Array.isArray(d?.rows) ? d.rows : []);
        setFilterValues(d?.filterValues ?? {});
      })
      .catch(e => { if (e?.name !== 'AbortError') { setError(true); setRows([]); } });
    return () => ctrl.abort();
  }, [isOpen, pr, viewingHexes]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    // capture: đóng popup này trước, không để Escape đóng luôn popup vật tư phía sau
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  const all = rows || [];
  const inFilter = (h: string) => viewingHexes.has(h);

  // Lý do 1 hex nằm ngoài bộ lọc: thuộc tính có giá trị không xuất hiện ở hex nào trong bộ lọc
  const reasonsByHex = useMemo(() => {
    const sets: Record<string, Set<string>> = {};
    Object.entries(filterValues).forEach(([k, list]) => { sets[k] = new Set(list); });
    const out = new Map<string, string[]>();
    all.forEach(r => {
      if (inFilter(r.hex) || out.has(r.hex)) return;
      if (!r.in_production) { out.set(r.hex, [REASON_NO_PROD]); return; }
      const reasons = REASON_FIELDS
        .filter(f => sets[f.key]?.size && !sets[f.key].has(String(r[f.key] ?? '')))
        .map(f => `${f.label}: ${String(r[f.key] ?? '') || '(trống)'}`);
      out.set(r.hex, reasons.length ? reasons : [REASON_OTHER]);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filterValues, viewingHexes]);

  // Lý do chính (đầu tiên) của mỗi hex ngoài bộ lọc -> đếm để hiện thành các chip lọc nhanh
  const reasonChips = useMemo(() => {
    const m = new Map<string, number>();
    reasonsByHex.forEach(list => m.set(list[0], (m.get(list[0]) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [reasonsByHex]);

  const byProject = useMemo(() => {
    const m = new Map<string, { name: string; pcs: Set<string>; hexes: Set<string>; inside: Set<string>; lines: Set<number | null> }>();
    all.forEach(r => {
      const name = r.ten_cong_trinh || NO_PROJECT;
      let g = m.get(name);
      if (!g) { g = { name, pcs: new Set(), hexes: new Set(), inside: new Set(), lines: new Set() }; m.set(name, g); }
      if (r.ten_pc) g.pcs.add(r.ten_pc);
      g.hexes.add(r.hex);
      if (inFilter(r.hex)) g.inside.add(r.hex);
      g.lines.add(r.pr_line);
    });
    return [...m.values()].sort((a, b) => b.hexes.size - a.hexes.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, viewingHexes]);

  const stats = useMemo(() => {
    const hexes = new Set(all.map(r => r.hex));
    const inside = [...hexes].filter(inFilter).length;
    return {
      hexes: hexes.size,
      inside,
      outside: hexes.size - inside,
      projects: byProject.length,
      lines: new Set(all.map(r => r.pr_line)).size,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, viewingHexes, byProject]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(r => {
      if ((onlyOutside || reasonFilter) && inFilter(r.hex)) return false;
      if (reasonFilter && reasonsByHex.get(r.hex)?.[0] !== reasonFilter) return false;
      if (projectFilter && (r.ten_cong_trinh || NO_PROJECT) !== projectFilter) return false;
      if (!q) return true;
      return [r.hex, r.ma_nha_may, r.ten_hang_muc, r.ten_cong_trinh, r.ten_pc, r.ten_vat_tu, r.tinh_trang_ipo]
        .some(v => String(v ?? '').toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, onlyOutside, projectFilter, reasonFilter, reasonsByHex, viewingHexes]);

  const handleExport = () => {
    downloadCsvFile(`pr_${pr}_hex.csv`, rowsToCsvString(filtered.map((r, i) => ({
      STT: i + 1,
      'PR line': r.pr_line ?? '',
      'Tên vật tư': r.ten_vat_tu ?? '',
      'Trạng thái': r.trang_thai ?? '',
      'Mã Hex': r.hex,
      'Mã nhà máy': r.ma_nha_may,
      'Hạng mục': r.ten_hang_muc ?? '',
      'Công trình': r.ten_cong_trinh ?? '',
      PC: r.ten_pc ?? '',
      'Tình trạng IPO': r.tinh_trang_ipo ?? '',
      'Trong bộ lọc': inFilter(r.hex) ? 'Có' : 'Không',
      'Lý do ngoài bộ lọc': (reasonsByHex.get(r.hex) ?? []).join('; '),
    }))));
  };

  if (!isOpen) return null;

  const th = 'border-b border-r border-emerald-200 bg-emerald-50 px-2 py-2.5 text-left';
  const td = 'border-b border-r border-slate-100 px-2 py-2 align-top';

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex flex-col rounded-xl bg-white shadow-xl" style={{ width: '94vw', maxWidth: 1800, height: '90vh' }}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">PR {pr} — mua cho những hex nào</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Tính trên toàn bộ dữ liệu vật tư ·{' '}
              <span className="font-semibold text-amber-700">Trong bộ lọc</span> = hex nằm trong danh sách HEX đang mở
              (đã qua bộ lọc của trang) · hex ngoài bộ lọc có ghi lý do
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={15} />
              <span>Xuất CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-4 custom-scrollbar">
          {rows === null ? (
            <div className="p-8 text-center text-sm text-slate-400">Đang tải...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-500">Không tải được dữ liệu PR.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-5">
                {[
                  { label: 'Tổng hex của PR', value: stats.hexes, cls: 'text-slate-800' },
                  { label: 'Trong bộ lọc', value: stats.inside, cls: 'text-amber-700' },
                  { label: 'Ngoài bộ lọc', value: stats.outside, cls: 'text-slate-800' },
                  { label: 'Công trình', value: stats.projects, cls: 'text-slate-800' },
                  { label: 'Dòng vật tư của PR', value: stats.lines, cls: 'text-slate-800' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="text-[0.6875rem] text-slate-500">{s.label}</div>
                    <div className={`text-lg font-bold ${s.cls}`}>{s.value}</div>
                  </div>
                ))}
              </div>

              {reasonChips.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600">Lý do ngoài bộ lọc (số hex):</span>
                  {reasonChips.map(([reason, n]) => {
                    const active = reasonFilter === reason;
                    return (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setReasonFilter(active ? '' : reason)}
                        title="Bấm để lọc danh sách hex bên dưới theo lý do này"
                        className={`rounded-full border px-2.5 py-0.5 transition-colors ${
                          active
                            ? 'border-slate-700 bg-slate-800 text-white'
                            : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {reason} <span className="font-bold">({n})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <h4 className="mt-4 mb-2 text-xs font-bold uppercase tracking-tight text-slate-700">Theo công trình</h4>
              <table className="w-full border-separate border-spacing-0 text-xs">
                <thead className="font-bold uppercase tracking-tight text-slate-800">
                  <tr>
                    <th className={`${th} w-10 text-right`}>STT</th>
                    <th className={th}>Công trình</th>
                    <th className={th}>PC</th>
                    <th className={`${th} text-right`}>Số hex</th>
                    <th className={`${th} text-right`}>Trong bộ lọc</th>
                    <th className={`${th} text-right`}>Số dòng VT</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map((g, idx) => {
                    const active = projectFilter === g.name;
                    return (
                      <tr
                        key={g.name}
                        onClick={() => setProjectFilter(active ? '' : g.name)}
                        title="Bấm để lọc danh sách hex bên dưới theo công trình này"
                        className={`cursor-pointer ${active ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className={`${td} text-right tabular-nums text-slate-400`}>{idx + 1}</td>
                        <td className={`${td} font-medium text-slate-700`}>{g.name}</td>
                        <td className={`${td} text-slate-600`}>{[...g.pcs].join(', ') || '—'}</td>
                        <td className={`${td} text-right font-bold tabular-nums`}>{g.hexes.size}</td>
                        <td className={`${td} text-right tabular-nums ${g.inside.size ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>
                          {g.inside.size}
                        </td>
                        <td className={`${td} text-right tabular-nums text-slate-600`}>{g.lines.size}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-4 mb-2 flex flex-wrap items-center gap-3">
                <h4 className="text-xs font-bold uppercase tracking-tight text-slate-700">Chi tiết hex</h4>
                <div className="relative w-full max-w-xs">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Tìm hex, hạng mục, công trình, PC, vật tư..."
                    className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={onlyOutside} onChange={e => setOnlyOutside(e.target.checked)} />
                  Chỉ hex ngoài bộ lọc
                </label>
                {[projectFilter, reasonFilter].filter(Boolean).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => (f === projectFilter ? setProjectFilter('') : setReasonFilter(''))}
                    className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-amber-800 hover:bg-amber-200"
                  >
                    {f} ✕
                  </button>
                ))}
                <span className="ml-auto text-xs text-slate-500">{filtered.length} dòng</span>
              </div>
              <table className="w-full border-separate border-spacing-0 text-xs" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: 55 }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: 115 }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: 115 }} />
                </colgroup>
                <thead className="sticky top-0 z-10 font-bold uppercase tracking-tight text-slate-800">
                  <tr>
                    <th className={`${th} text-right`}>STT</th>
                    <th className={th}>PR line</th>
                    <th className={th}>Tên vật tư</th>
                    <th className={th}>Trạng thái</th>
                    <th className={th}>Mã Hex</th>
                    <th className={th}>Hạng mục</th>
                    <th className={th}>Công trình</th>
                    <th className={th}>PC</th>
                    <th className={th}>Bộ lọc / Lý do</th>
                    <th className={`${th} text-right`}>SL YC / còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const inside = inFilter(r.hex);
                    const reasons = reasonsByHex.get(r.hex) ?? [];
                    return (
                      <tr key={`${r.pr_line}-${r.hex}`} className={inside ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                        <td className={`${td} text-right tabular-nums text-slate-400`}>{idx + 1}</td>
                        <td className={`${td} text-slate-500`}>{r.pr_line ?? ''}</td>
                        <td className={`${td} break-words text-slate-700`}>{r.ten_vat_tu}</td>
                        <td className={`${td} text-slate-600`}>{r.trang_thai}</td>
                        <td className={`${td} font-medium text-slate-700`}>{r.hex}</td>
                        <td className={`${td} break-words text-slate-600`}>{r.ten_hang_muc || <span className="text-slate-300">—</span>}</td>
                        <td className={`${td} break-words text-slate-600`}>{r.ten_cong_trinh || <span className="italic text-slate-400">{NO_PROJECT}</span>}</td>
                        <td className={`${td} text-slate-600`}>{r.ten_pc || '—'}</td>
                        <td className={`${td} break-words`}>
                          {inside ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-amber-700">Trong bộ lọc</span>
                          ) : (
                            <div className="space-y-0.5 text-[0.6875rem] text-slate-500">
                              <div className="font-semibold text-slate-400">Ngoài bộ lọc:</div>
                              {reasons.map(x => <div key={x}>{x}</div>)}
                            </div>
                          )}
                        </td>
                        <td className={`${td} text-right tabular-nums text-slate-600`}>
                          {fmtNum(r.so_luong_yeu_cau)} / {fmtNum(r.so_luong_con_lai)} {r.dvt}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
