// Trang "Setup gộp xưởng" (chỉ ADMIN): mỗi mã xưởng đang có trong dữ liệu chọn 1 xưởng gộp.
// Áp dụng cho toàn bộ app: backend gộp ở mọi API chia / lọc theo xưởng, frontend đổi cột
// xưởng của dữ liệu tải về (utils/workshopGroups.ts).

import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Check, RotateCcw, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { fetchWorkshopGroups, saveWorkshopGroups, WorkshopCodeInfo } from '../../services/dataService';
import { applyWorkshopMapping, normWorkshop } from '../../utils/workshopGroups';

interface Props {
  /** Nằm trong trang chung Setup dữ liệu (thẻ): tiêu đề gọn, không icon lớn */
  embedded?: boolean;
  /** Gọi sau khi lưu thành công để App gộp lại dữ liệu đã tải. */
  onSaved?: () => void;
}

const TABLE_LABELS: Record<string, string> = {
  production_status_app: 'Sản xuất',
  nhap_kho: 'Nhập kho',
  xuat_kho: 'Xuất kho',
  dht: 'Đơn hàng',
  khsx: 'KHSX',
  khsx_nam: 'KH năm',
};
const TABLE_ORDER = Object.keys(TABLE_LABELS);

const WorkshopGroupSetup: React.FC<Props> = ({ onSaved, embedded = false }) => {
  const { showToast } = useToast();
  const [codes, setCodes] = useState<WorkshopCodeInfo[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    const d = await fetchWorkshopGroups(true);
    setCodes(d.codes || []);
    setSaved(d.mapping || {});
    setDraft(d.mapping || {});
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Mã có trong setup nhưng không còn trong dữ liệu vẫn hiện (để còn sửa / bỏ)
  const rows = useMemo(() => {
    const list = [...codes];
    const have = new Set(list.map(c => c.code));
    Object.keys(draft).forEach(code => { if (!have.has(code)) list.push({ code, counts: {}, total: 0 }); });
    const k = q.trim().toUpperCase();
    return k ? list.filter(c => c.code.includes(k) || (draft[c.code] || '').includes(k)) : list;
  }, [codes, draft, q]);

  // Danh sách chọn: mã xưởng trong dữ liệu (nhiều dòng trước) + các xưởng gộp đã đặt + KHÁC
  const groupOptions = useMemo(() => {
    const s = new Set<string>();
    codes.forEach(c => s.add(c.code));
    Object.values(draft).forEach(g => g && s.add(g));
    s.add('KHÁC');
    return [...s];
  }, [codes, draft]);


  // Tóm tắt: xưởng gộp -> các mã gốc
  const summary = useMemo(() => {
    const m = new Map<string, string[]>();
    codes.forEach(c => {
      const g = draft[c.code] || c.code;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(c.code);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [codes, draft]);

  const dirty = JSON.stringify(Object.entries(draft).filter(([, v]) => v).sort())
    !== JSON.stringify(Object.entries(saved).sort());

  const setGroup = (code: string, value: string) => {
    const g = normWorkshop(value);
    setDraft(prev => {
      const next = { ...prev };
      if (!g || g === code) delete next[code]; else next[code] = g;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const r = await saveWorkshopGroups(draft);
    setSaving(false);
    if (!r.success) { showToast(r.message || 'Lưu thất bại', 'error'); return; }
    const m = r.mapping || draft;
    applyWorkshopMapping(m);
    setSaved(m);
    setDraft(m);
    showToast('Đã lưu setup gộp xưởng', 'success');
    onSaved?.();
  };

  const soDaGop = Object.keys(draft).length;
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Thanh trên: tìm + số mã + Lưu (báo khi có thay đổi chưa lưu) */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        {!embedded && <h1 className="page-title mr-2">Setup gộp xưởng</h1>}
        <div className="relative w-64">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã xưởng…"
            className="h-9 w-full rounded-lg border border-slate-300 pl-8 pr-3 text-sm focus:border-slate-500 focus:outline-none" />
        </div>
        <span className="text-sm text-slate-500">
          <b className="font-semibold text-slate-900">{codes.length}</b> mã xưởng trong dữ liệu · đang gộp <b className="font-semibold text-slate-900">{soDaGop}</b> mã
        </span>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Có thay đổi chưa lưu</span>}
          {dirty && (
            <button onClick={() => setDraft(saved)} disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
              <RotateCcw size={15} /> Huỷ thay đổi
            </button>
          )}
          <button onClick={handleSave} disabled={!dirty || saving}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
            Lưu setup
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-900">Mã xưởng gốc</h2>
              <span className="text-sm text-slate-500">số dòng dữ liệu theo từng bảng · chọn xưởng gộp ở cột cuối</span>
            </div>
            {loading ? (
              <div className="py-16 flex justify-center text-slate-400"><RefreshCw className="animate-spin" size={20} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium w-10">#</th>
                      <th className="px-3 py-2 text-left font-medium">Mã xưởng</th>
                      {TABLE_ORDER.map(t => (
                        <th key={t} className="px-3 py-2 text-right font-medium whitespace-nowrap">{TABLE_LABELS[t]}</th>
                      ))}
                      <th className="px-3 py-2 text-left font-medium min-w-[180px]">Gộp vào xưởng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c, i) => {
                      const g = draft[c.code] || '';
                      const changed = (saved[c.code] || '') !== g;
                      return (
                        <tr key={c.code} className={`border-t border-slate-100 ${changed ? 'bg-amber-50' : g ? 'bg-slate-50' : ''}`}>
                          <td className="px-3 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800 whitespace-nowrap">
                            {c.code}
                            {c.total === 0 && <span className="ml-2 text-[0.6875rem] font-normal text-slate-400">(không còn trong dữ liệu)</span>}
                          </td>
                          {TABLE_ORDER.map(t => (
                            <td key={t} className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                              {c.counts[t] ? c.counts[t].toLocaleString('vi-VN') : <span className="text-slate-300">–</span>}
                            </td>
                          ))}
                          <td className="px-3 py-1.5">
                            <select
                              value={g}
                              onChange={e => setGroup(c.code, e.target.value)}
                              className={`h-8 w-full rounded-md border px-2 text-sm focus:border-slate-500 focus:outline-none ${g ? 'border-slate-400 bg-white font-medium text-slate-900' : 'border-slate-200 bg-white text-slate-400'}`}
                            >
                              <option value="">{c.code} (giữ nguyên)</option>
                              {groupOptions.filter(o => o !== c.code).map(o => (
                                <option key={o} value={o} className="text-slate-800">{o}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white xl:sticky xl:top-0">
            <div className="border-b border-slate-100 px-4 py-3 text-base font-semibold text-slate-900">Kết quả sau khi gộp <span className="text-sm font-normal text-slate-400">({summary.length} xưởng)</span></div>
            <ul className="divide-y divide-slate-100">
              {summary.map(([g, raws]) => (
                <li key={g} className="px-4 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{g}</span>
                    {(raws.length > 1 || raws[0] !== g) && <span className="text-xs text-slate-400">{raws.length} mã</span>}
                  </div>
                  {(raws.length > 1 || raws[0] !== g) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {raws.map(r => <span key={r} className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6875rem] text-slate-600">{r}</span>)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="px-4 py-3 border-t border-slate-100 text-[0.6875rem] text-slate-500">
              Chọn "giữ nguyên" = không gộp. Chọn xưởng có sẵn (vd. 4A) để gộp vào xưởng đó, hoặc KHÁC.
              Sau khi lưu, số liệu các trang tính lại theo setup mới.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkshopGroupSetup;
