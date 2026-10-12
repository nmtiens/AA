import React, { useCallback, useEffect, useState } from 'react';
import { Factory, RefreshCw, Rocket, Users, ListOrdered, Clock, ShieldCheck, AlertTriangle, BarChart3 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { xuongSetupApi, type SetupXuong } from '../../services/xuongSetupApi';
import { XuongToSetup, XuongCongDoanSetup, XuongLichCaSetup, XuongQuanLySetup, XuongCanXem } from './XuongSetupMuc';
import TrienKhaiXuong from './TrienKhaiXuong';
import BaoCaoXuong from './BaoCaoXuong';

// ============================================================================
// THẺ "XƯỞNG" TRONG SETUP DỮ LIỆU (T8 — docs/designs/xuong-checkin.md).
// Mục con: Báo cáo xưởng / tổ · Triển khai hạng mục (QT1/QT2, 7A) · Tổ & tổ trưởng · Công đoạn · Lịch ca · Quản lý xưởng · Cần xem.
// Quyền: admin mọi xưởng; quản lý xưởng chỉ xưởng của mình (backend kiểm lại).
// ============================================================================

type Muc = 'bao-cao' | 'trien-khai' | 'to' | 'cong-doan' | 'lich-ca' | 'quan-ly' | 'can-xem';
const MUC: Array<{ id: Muc; ten: string; icon: React.ReactNode }> = [
  { id: 'bao-cao', ten: 'Báo cáo', icon: <BarChart3 size={15} /> },
  { id: 'trien-khai', ten: 'Triển khai hạng mục', icon: <Rocket size={15} /> },
  { id: 'to', ten: 'Tổ & tổ trưởng', icon: <Users size={15} /> },
  { id: 'cong-doan', ten: 'Công đoạn', icon: <ListOrdered size={15} /> },
  { id: 'lich-ca', ten: 'Lịch ca', icon: <Clock size={15} /> },
  { id: 'quan-ly', ten: 'Quản lý xưởng', icon: <ShieldCheck size={15} /> },
  { id: 'can-xem', ten: 'Cần xem', icon: <AlertTriangle size={15} /> },
];
const KHOA_XUONG = 'xuong_setup_xuong';
const KHOA_MUC = 'xuong_setup_muc';

export default function XuongSetup() {
  const { showToast } = useToast();
  const [xuong, setXuong] = useState<string | undefined>(() => localStorage.getItem(KHOA_XUONG) || undefined);
  const [muc, setMuc] = useState<Muc>(() => (localStorage.getItem(KHOA_MUC) as Muc) || 'bao-cao');
  const [d, setD] = useState<SetupXuong | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(true);

  const tai = useCallback(async () => {
    setDang(true);
    const r = await xuongSetupApi.setup(xuong);
    if (r.ok) {
      setD(r.data); setLoi('');
      if (r.data.xuong && r.data.xuong !== xuong) setXuong(r.data.xuong);
    } else setLoi(r.message);
    setDang(false);
  }, [xuong]);
  useEffect(() => { tai(); }, [tai]);
  useEffect(() => { if (xuong) localStorage.setItem(KHOA_XUONG, xuong); }, [xuong]);
  useEffect(() => { localStorage.setItem(KHOA_MUC, muc); }, [muc]);

  const bao = useCallback((ok: boolean, msg: string) => showToast(msg, ok ? 'success' : 'error'), [showToast]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-wood-50">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <Factory size={18} className="text-wood-700" aria-hidden />
        <h2 className="text-base font-bold text-slate-800">Xưởng</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Xưởng
          <select value={xuong ?? ''} onChange={e => setXuong(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-wood-300">
            {(d?.dsXuong ?? (xuong ? [xuong] : [])).map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <nav className="flex flex-wrap gap-1" aria-label="Mục cấu hình Xưởng">
          {MUC.map(m => (
            <button key={m.id} type="button" onClick={() => setMuc(m.id)} aria-pressed={muc === m.id}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${muc === m.id ? 'bg-wood-600 font-semibold text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {m.icon}{m.ten}
            </button>
          ))}
        </nav>
        <button type="button" onClick={tai} className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Tải lại" title="Tải lại">
          <RefreshCw size={16} className={dang ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        {loi && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
        {!d && dang && <div className="flex justify-center py-16 text-slate-400"><RefreshCw className="animate-spin" size={20} /></div>}
        {d && !d.xuong && <p className="text-sm text-slate-600">Chưa có xưởng nào trong danh mục. Chạy file SQL danh mục (backend/sql/2026-10-12_xuong_danh_muc_mra.sql) hoặc thêm công đoạn.</p>}
        {d && d.xuong && (
          <>
            {muc === 'bao-cao' && <BaoCaoXuong xuong={d.xuong} />}
            {muc === 'trien-khai' && <TrienKhaiXuong xuong={d.xuong} bao={bao} />}
            {muc === 'to' && <XuongToSetup d={d} bao={bao} tai={tai} />}
            {muc === 'cong-doan' && <XuongCongDoanSetup d={d} bao={bao} tai={tai} />}
            {muc === 'lich-ca' && <XuongLichCaSetup d={d} bao={bao} tai={tai} />}
            {muc === 'quan-ly' && <XuongQuanLySetup d={d} bao={bao} tai={tai} />}
            {muc === 'can-xem' && <XuongCanXem xuong={d.xuong} congDoan={d.congDoan} to={d.to} bao={bao} />}
          </>
        )}
      </div>
    </div>
  );
}
