import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, ChevronRight, ChevronDown } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { API_BASE_URL } from '../../services/dataService';
import { fmtInt } from '../../utils/format';
import { dungBaoCaoBot, IPO_MAC_DINH, CHUA_BOT, type OBot, type CotBot } from './core/baoCaoBot';

// ============================================================================
// BÁO CÁO BOT — giá trị đơn hàng còn lại theo dự án, giống sheet BÁO CÁO BOT của MASTER_PROJECT_COORDINATION.xlsx.
// Số liệu do tool trên máy PC đẩy lên ngay khi file công trình (05_PRODUCTION STATUS) được lưu, không theo bộ lọc
// của trang. Không tự tải lại theo chu kỳ (để DB được ngủ) — bấm "Tải lại" để lấy số mới nhất.
// ============================================================================

interface DuLieu { coBang: boolean; capNhat: string | null; soFile: number; fileLoi: { nguon: string; loi: string }[]; ipos: string[]; o: OBot[] }
interface DongChiTiet { maCt: string; hex: string; ipo: string; ngay: string; tt: number | null; nguon: string }
interface ChonO { ten: string; cot: CotBot | null }

const NHAN_CHUA = 'CHƯA BOT';
const fmtO = (v: number | undefined) => (v === undefined ? '' : fmtInt(v));
const fmtLuc = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

export const BaoCaoBot = ({ onHexClick }: { onHexClick?: (hex: string) => void }) => {
  const [du, setDu] = useState<DuLieu | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [ipo, setIpo] = useState<Set<string>>(() => new Set([IPO_MAC_DINH]));
  const [namMo, setNamMo] = useState<Set<string>>(() => new Set());
  const [tim, setTim] = useState('');
  const [chiCt, setChiCt] = useState(true);
  const [chon, setChon] = useState<ChonO | null>(null);

  const tai = useCallback(() => {
    setDangTai(true);
    setLoi(null);
    fetch(`${API_BASE_URL}/bot-tong-hop`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: DuLieu) => setDu(d))
      .catch(e => setLoi(e instanceof Error ? e.message : String(e)))
      .finally(() => setDangTai(false));
  }, []);
  useEffect(() => { tai(); }, [tai]);

  const bc = useMemo(() => (du ? dungBaoCaoBot(du.o, ipo.size ? ipo : null, namMo, chiCt) : null), [du, ipo, namMo, chiCt]);
  const dong = useMemo(() => {
    if (!bc) return [];
    const t = tim.trim().toUpperCase();
    return t ? bc.dong.filter(d => d.ten.toUpperCase().includes(t)) : bc.dong;
  }, [bc, tim]);
  const tongLoc = useMemo(() => {
    if (!bc || !tim.trim()) return null;
    const m: Record<string, number> = {};
    let tong = 0;
    for (const d of dong) { for (const [k, v] of Object.entries(d.o)) m[k] = (m[k] ?? 0) + v; tong += d.tong; }
    return { o: m, tong };
  }, [bc, dong, tim]);

  const doiIpo = (x: string) => setIpo(s => { const n = new Set(s); if (n.has(x)) n.delete(x); else n.add(x); return n; });
  const doiNam = (nam: string) => setNamMo(s => { const n = new Set(s); if (n.has(nam)) n.delete(nam); else n.add(nam); return n; });

  if (loi && !du) {
    return <div className="py-10 text-center text-sm text-slate-600">Không tải được BÁO CÁO BOT ({loi}). <button type="button" onClick={tai} className="font-semibold text-blue-700 underline">Thử lại</button></div>;
  }
  if (!du || !bc) return <p className="py-10 text-center text-sm font-semibold text-slate-500">Đang tải BÁO CÁO BOT…</p>;
  if (!du.coBang) {
    return <p className="py-10 text-center text-sm text-slate-600">Chưa có dữ liệu BÁO CÁO BOT: cần chạy SQL tạo bảng (backend/sql/2026-11-09_bot_tong_hop.sql) và bật tool canh file công trình trên máy PC.</p>;
  }

  const tongHien = tongLoc ?? { o: bc.tongCot, tong: bc.tong };
  const oSo = (ten: string, cot: CotBot | null, v: number | undefined, dam = false) => (
    <td className={`whitespace-nowrap border-b border-slate-100 px-2 py-1 text-right tabular-nums ${dam ? 'font-bold text-slate-900' : 'text-slate-800'}`}>
      {v === undefined ? '' : (
        <button type="button" onClick={() => setChon({ ten, cot })} title="Bấm để xem các HEX" className="hover:text-blue-700 hover:underline">{fmtO(v)}</button>
      )}
    </td>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <span>Theo file công trình của PC (như sheet BÁO CÁO BOT của MASTER_PROJECT_COORDINATION) — không theo bộ lọc trang.</span>
        <span>Cập nhật: <b className="text-slate-800">{fmtLuc(du.capNhat)}</b> · {fmtInt(du.soFile)} file</span>
        {du.fileLoi.length > 0 && (
          <span className="text-amber-700" title={du.fileLoi.map(f => `${f.nguon}: ${f.loi}`).join('\n')}>{du.fileLoi.length} file đọc lỗi</span>
        )}
        <button type="button" onClick={tai} disabled={dangTai} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${dangTai ? 'animate-spin' : ''}`} aria-hidden /> Tải lại
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">TÌNH TRẠNG IPO FINAL:</span>
        {du.ipos.map(x => (
          <button key={x || '(trống)'} type="button" aria-pressed={ipo.has(x)} onClick={() => doiIpo(x)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ipo.has(x) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
            {x || '(trống)'}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600"
          title="Như lọc MÃ CÔNG TRÌNH của pivot trong file: chỉ mã CTxx-xxx, bỏ OEM / hàng lẻ / xuất khẩu (DM, EM, NB, SP, XK…)">
          <input type="checkbox" checked={chiCt} onChange={e => setChiCt(e.target.checked)} /> Chỉ mã CT (như file)
        </label>
        <label className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-sm">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm công trình / mã CT" className="w-48 outline-none" />
          {tim && <button type="button" onClick={() => setTim('')} aria-label="Xoá tìm"><X className="h-4 w-4 text-slate-400" /></button>}
        </label>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-lime-500 text-slate-900">
              <th className="sticky left-0 z-20 border-b border-lime-600 bg-lime-500 px-2 py-1.5 text-left font-bold">TÊN CÔNG TRÌNH</th>
              {bc.cot.map(c => (
                <th key={c.khoa} className={`whitespace-nowrap border-b border-l border-lime-600 px-2 py-1.5 text-right font-bold ${c.loai === 'thang' ? 'bg-lime-300 font-semibold' : ''}`}>
                  {c.loai === 'nam' ? (
                    <button type="button" onClick={() => doiNam(c.nam!)} aria-expanded={!!c.dangMo} title={c.dangMo ? 'Gộp lại theo năm' : 'Bung theo tháng'}
                      className="inline-flex items-center gap-0.5 hover:underline">
                      {c.dangMo ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}{c.nhan}
                    </button>
                  ) : c.nhan}
                </th>
              ))}
              <th className="border-b border-l border-lime-600 px-2 py-1.5 text-right font-bold">TỔNG</th>
            </tr>
          </thead>
          <tbody>
            {dong.map(d => (
              <tr key={d.ten} className="hover:bg-blue-50/50">
                <td className="sticky left-0 whitespace-nowrap border-b border-slate-100 bg-white px-2 py-1 text-slate-800">{d.ten || '(trống)'}</td>
                {bc.cot.map(c => <React.Fragment key={c.khoa}>{oSo(d.ten, c, d.o[c.khoa], c.loai === 'nam' && !!c.dangMo)}</React.Fragment>)}
                {oSo(d.ten, null, d.tong, true)}
              </tr>
            ))}
            {dong.length === 0 && (
              <tr><td colSpan={bc.cot.length + 2} className="py-8 text-center text-slate-500">Không có công trình nào{tim ? ' khớp ô tìm' : ' theo lọc IPO đang chọn'}.</td></tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="bg-slate-100 font-bold text-slate-900">
              <td className="sticky left-0 border-t border-slate-300 bg-slate-100 px-2 py-1.5">TỔNG{tim ? ' (đang tìm)' : ''} · {fmtInt(dong.length)} công trình</td>
              {bc.cot.map(c => <td key={c.khoa} className="whitespace-nowrap border-t border-slate-300 px-2 py-1.5 text-right tabular-nums">{fmtO(tongHien.o[c.khoa])}</td>)}
              <td className="whitespace-nowrap border-t border-slate-300 px-2 py-1.5 text-right tabular-nums">{fmtInt(tongHien.tong)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {chon && <ChiTietO chon={chon} ipo={[...ipo]} chiCt={chiCt} onClose={() => setChon(null)} onHexClick={onHexClick} />}
    </div>
  );
};

const ChiTietO = ({ chon, ipo, chiCt, onClose, onHexClick }: { chon: ChonO; ipo: string[]; chiCt: boolean; onClose: () => void; onHexClick?: (hex: string) => void }) => {
  const [dong, setDong] = useState<DongChiTiet[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const thang = chon.cot ? chon.cot.khoa : '';
  const ipoKhoa = ipo.join('|');
  useEffect(() => {
    const q = new URLSearchParams({ ten: chon.ten, ipo: ipoKhoa, thang, ct: chiCt ? '1' : '0' });
    fetch(`${API_BASE_URL}/bot-tong-hop/chi-tiet?${q}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { dong: DongChiTiet[] }) => setDong(d.dong))
      .catch(e => setLoi(e instanceof Error ? e.message : String(e)));
  }, [chon.ten, ipoKhoa, thang, chiCt]);
  const tieuDeCot = !chon.cot ? 'tất cả' : chon.cot.khoa === CHUA_BOT ? NHAN_CHUA : chon.cot.loai === 'thang' ? `tháng ${chon.cot.khoa.slice(5)}/${chon.cot.khoa.slice(0, 4)}` : `năm ${chon.cot.khoa}`;
  const tong = (dong ?? []).reduce((a, x) => a + (x.tt ?? 0), 0);
  return (
    <ModalShell open onClose={onClose} labelledBy="bcbot-ct" closeOnEsc closeOnBackdrop
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      panelClassName="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <p className="text-xs text-slate-500">BÁO CÁO BOT · {tieuDeCot} · {ipo.length ? ipo.join(', ') : 'mọi tình trạng IPO'}</p>
          <h3 id="bcbot-ct" className="text-base font-bold text-slate-900">{chon.ten || '(trống)'}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <div className="overflow-auto px-5 py-3">
        {loi ? <p className="text-sm text-red-700">Không tải được ({loi}).</p>
          : !dong ? <p className="text-sm text-slate-500">Đang tải…</p>
            : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1 pr-3">HEX</th><th className="py-1 pr-3">Mã CT</th><th className="py-1 pr-3">Tình trạng IPO</th>
                    <th className="py-1 pr-3">Ngày cần giao PC đề xuất</th><th className="py-1 text-right">TT ĐH còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {dong.map((x, i) => (
                    <tr key={`${x.hex}-${i}`} className="border-t border-slate-100">
                      <td className="py-1 pr-3">{x.hex && onHexClick ? <button type="button" onClick={() => onHexClick(x.hex)} className="font-semibold text-blue-700 hover:underline">{x.hex}</button> : x.hex}</td>
                      <td className="py-1 pr-3">{x.maCt}</td>
                      <td className="py-1 pr-3">{x.ipo}</td>
                      <td className="py-1 pr-3">{x.ngay || NHAN_CHUA}</td>
                      <td className="py-1 text-right tabular-nums">{x.tt === null ? '' : fmtInt(x.tt)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 font-bold"><td className="py-1" colSpan={4}>{fmtInt(dong.length)} dòng</td><td className="py-1 text-right tabular-nums">{fmtInt(tong)}</td></tr>
                </tfoot>
              </table>
            )}
      </div>
    </ModalShell>
  );
};
