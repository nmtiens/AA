// Trang "Setup gộp xưởng" (chỉ ADMIN): mỗi mã xưởng đang có trong dữ liệu chọn 1 xưởng gộp.
// Áp dụng cho toàn bộ app: backend gộp ở mọi API chia / lọc theo xưởng, frontend đổi cột
// xưởng của dữ liệu tải về (utils/workshopGroups.ts).

import React, { useEffect, useMemo, useState } from 'react';
import { Factory, RefreshCw, Check, RotateCcw, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { fetchWorkshopGroups, saveWorkshopGroups, WorkshopCodeInfo } from '../../services/dataService';
import { applyWorkshopMapping, normWorkshop } from '../../utils/workshopGroups';

interface Props {
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

const WorkshopGroupSetup: React.FC<Props> = ({ onSaved }) => {
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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-wood-50">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-wood-600 flex items-center justify-center text-white shadow-sm">
            <Factory size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Setup gộp xưởng</h1>
            <p className="text-xs text-slate-500">Gộp các mã xưởng nhỏ phát sinh vào 1 xưởng — áp dụng cho mọi biểu đồ, bộ lọc, báo cáo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDraft(saved)}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 bg-white text-slate-700 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw size={16} /> Hoàn tác
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-wood-600 text-white rounded-lg font-medium hover:bg-wood-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
            Lưu setup
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Tìm mã xưởng…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wood-300"
                />
              </div>
              <span className="text-xs text-slate-500">{codes.length} mã xưởng trong dữ liệu</span>
            </div>
            {loading ? (
              <div className="py-16 flex justify-center text-slate-400"><RefreshCw className="animate-spin" size={20} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold w-10">STT</th>
                      <th className="px-3 py-2 text-left font-semibold">Mã xưởng gốc</th>
                      {TABLE_ORDER.map(t => (
                        <th key={t} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{TABLE_LABELS[t]}</th>
                      ))}
                      <th className="px-3 py-2 text-left font-semibold min-w-[180px]">Gộp vào xưởng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c, i) => {
                      const g = draft[c.code] || '';
                      const changed = (saved[c.code] || '') !== g;
                      return (
                        <tr key={c.code} className={`border-t border-slate-100 ${changed ? 'bg-amber-50' : g ? 'bg-sky-50/40' : ''}`}>
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
                              className={`w-full px-2 py-1 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-wood-300 ${g ? 'text-slate-800 font-medium' : 'text-slate-400'}`}
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

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Kết quả sau khi gộp</div>
            <ul className="divide-y divide-slate-100">
              {summary.map(([g, raws]) => (
                <li key={g} className="px-4 py-2">
                  <div className="text-sm font-semibold text-slate-800">{g}</div>
                  {(raws.length > 1 || raws[0] !== g) && (
                    <div className="text-xs text-slate-500 mt-0.5">gồm: {raws.join(', ')}</div>
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
