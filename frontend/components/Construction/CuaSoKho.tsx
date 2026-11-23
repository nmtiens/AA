import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../../services/dataService';
import * as bang from '../shared/bangBaoCao';

// ============================================================================
// Cửa sổ chung NHẬP / XUẤT / TỒN của 1 công trình (người dùng 20/11/2026): 3 bảng kho cùng 1 bộ cột
//   STT · Ngày · HEX · Hạng mục · Công trình · Số lượng · Giá trị — chuyển qua lại bằng 3 nút trên đầu.
// Số từ GET /api/khnk-sheet/kho-dong-chuan (nhập / xuất lũy kế, tồn ngày mới nhất) — cùng cách cộng với cột Bảng KHNK.
// Dùng ở Bảng KHNK (Tổng quan công trình) và Hồ sơ công trình.
// ============================================================================

export type LoaiKho = 'nhap' | 'xuat' | 'ton';
type Dong = { ngay: string | null; hex: string | null; hang_muc: string | null; cong_trinh: string | null; so_luong: number | null; dvt: string | null; gia_tri: number | null };
type DuLieu = { rows: Dong[]; cat: boolean; ngayTon: string | null };
const TEN: Record<LoaiKho, { ten: string; ma: string; mau: string }> = {
  nhap: { ten: 'Nhập kho', ma: 'P022', mau: 'text-emerald-700' },
  xuat: { ten: 'Xuất kho', ma: 'P025', mau: 'text-amber-700' },
  ton: { ten: 'Tồn kho', ma: 'P023', mau: 'text-slate-800' },
};
const ngay = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const tr1 = (v: number) => (v || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ty = (trieu: number) => ((Math.round((trieu || 0) / 10) / 100) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thieuGia = (r: Dong) => (r.so_luong ?? 0) > 0 && !r.gia_tri;
const sl = (v: number | null) => (v == null ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 3 }));

export function CuaSoKho({ ma, ten, loai: loaiDau, thang: thangDau, onClose }: { ma: string; ten?: string; loai: LoaiKho; thang?: string; onClose: () => void }) {
  const [loai, setLoai] = useState<LoaiKho>(loaiDau);
  // thang = 'YYYY-MM': chỉ xem dòng nhập / xuất của tháng đó (tồn kho không lọc tháng)
  const [thang, setThang] = useState<string | undefined>(thangDau);
  useEffect(() => { setThang(thangDau); }, [thangDau, ma]);
  const [du, setDu] = useState<Partial<Record<LoaiKho, DuLieu | { loi: string }>>>({});
  const [tim, setTim] = useState('');
  useEffect(() => { setLoai(loaiDau); }, [loaiDau, ma]);
  // Tải cả 3 bảng 1 lần để thẻ chuyển hiện sẵn tổng
  useEffect(() => {
    const ac = new AbortController();
    setDu({});
    (['nhap', 'xuat', 'ton'] as LoaiKho[]).forEach(l => {
      fetch(`${API_BASE_URL}/khnk-sheet/kho-dong-chuan?${new URLSearchParams({ loai: l, ma })}`, { signal: ac.signal })
        .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`); return j as DuLieu; })
        .then(d => setDu(x => ({ ...x, [l]: d })))
        .catch(e => { if (!ac.signal.aborted) setDu(x => ({ ...x, [l]: { loi: e instanceof Error ? e.message : String(e) } })); });
    });
    return () => ac.abort();
  }, [ma]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const cur = du[loai];
  const rows = useMemo(() => {
    if (!cur || 'loi' in cur) return [];
    const t = tim.trim().toUpperCase();
    const theoThang = thang && loai !== 'ton' ? cur.rows.filter(r => (r.ngay ?? '').startsWith(thang)) : cur.rows;
    return t ? theoThang.filter(r => `${r.hex ?? ''} ${r.hang_muc ?? ''} ${r.cong_trinh ?? ''}`.toUpperCase().includes(t)) : theoThang;
  }, [cur, tim, thang, loai]);
  const tongCua = (l: LoaiKho) => {
    const d = du[l]; if (!d || 'loi' in d) return null;
    return d.rows.filter(r => !thang || l === 'ton' || (r.ngay ?? '').startsWith(thang)).reduce((s, r) => s + (r.gia_tri || 0), 0);
  };
  const soHex = new Set(rows.map(r => r.hex)).size;
  // Dòng nhập có số lượng nhưng thành tiền 0 / trống (người dùng 21/11/2026 "mâu thuẫn": CT26-143 nhập 0.09 tỷ mà tồn 0.25 tỷ —
  // bảng nhập kho P022 có 2 HEX nhập 17/11 thành tiền 0, bảng tồn P023 lại định giá 159 tr). Không bù số, chỉ chỉ ra chỗ thiếu.
  const canhBaoNhap = useMemo(() => {
    const n = du.nhap, t = du.ton;
    if (!n || 'loi' in n) return null;
    const dong = n.rows.filter(r => thieuGia(r) && (!thang || (r.ngay ?? '').startsWith(thang)));
    if (!dong.length) return null;
    const hex = new Set(dong.map(r => r.hex).filter(Boolean));
    const giaTon = t && !('loi' in t) ? t.rows.filter(r => r.hex && hex.has(r.hex)).reduce((s, r) => s + (r.gia_tri || 0), 0) : 0;
    return { soDong: dong.length, soHex: hex.size, giaTon };
  }, [du, thang]);
  return (
    <div className={bang.cuaSoNen} onClick={onClose}>
      <div className={bang.cuaSoKhung} onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-slate-900">Nhập · Xuất · Tồn kho — {ma}</p>
            {ten && <p className="truncate text-sm text-slate-500">{ten}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['nhap', 'xuat', 'ton'] as LoaiKho[]).map(l => {
            const tg = tongCua(l), d = du[l];
            return (
              <button key={l} type="button" onClick={() => setLoai(l)} aria-pressed={loai === l}
                className={`rounded-xl border px-4 py-2 text-left transition ${loai === l ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
                <span className={`block text-xs font-bold uppercase ${loai === l ? 'text-slate-300' : 'text-slate-500'}`}>
                  {TEN[l].ten} ({TEN[l].ma}){l === 'ton' && d && !('loi' in d) && d.ngayTon ? ` · ${ngay(d.ngayTon)}` : l !== 'ton' ? (thang ? ` · tháng ${Number(thang.slice(5, 7))}/${thang.slice(0, 4)}` : ' · lũy kế') : ''}
                </span>
                <span className={`text-xl font-extrabold tabular-nums ${loai === l ? 'text-white' : TEN[l].mau}`}>{tg == null ? '…' : ty(tg)} <span className="text-sm font-semibold opacity-70">tỷ</span></span>
              </button>
            );
          })}
          {thang && <button type="button" onClick={() => setThang(undefined)} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100" title="Bỏ lọc tháng, xem lũy kế">
            Tháng {Number(thang.slice(5, 7))}/{thang.slice(0, 4)} ×</button>}
          <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm HEX / hạng mục / công trình"
            className="ml-auto h-9 w-64 rounded-lg border border-slate-300 px-3 text-sm outline-none" />
        </div>
        {canhBaoNhap && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ⚠ Bảng nhập kho (P022) có <b>{canhBaoNhap.soDong} dòng · {canhBaoNhap.soHex} HEX</b> có số lượng nhưng <b>thành tiền = 0</b>, nên tổng nhập thấp hơn thực tế
            {canhBaoNhap.giaTon > 0 ? <> — bảng tồn kho định giá các HEX này <b>{tr1(canhBaoNhap.giaTon)} triệu</b>, vì vậy tồn có thể lớn hơn nhập</> : ''}.
            {loai !== 'nhap' && <button type="button" onClick={() => setLoai('nhap')} className="ml-2 font-semibold underline">Xem dòng</button>}
          </p>
        )}
        {!cur ? <p className="text-sm text-slate-500">Đang tải…</p> : 'loi' in cur ? <p className="text-sm text-red-600">{cur.loi}</p> : (
          <div className={`${bang.khung} min-h-0 flex-1`}>
            <table className={`${bang.table} ${bang.cuaSoBang}`}>
              <thead className={bang.thead}><tr>
                {['STT', 'Ngày', 'HEX', 'Hạng mục', 'Công trình', 'Số lượng', 'Giá trị (triệu)'].map(h => <th key={h} className={`${bang.thC} whitespace-nowrap`}>{h}</th>)}
              </tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className={thieuGia(r) ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-slate-50'}>
                  <td className={bang.tdSo}>{i + 1}</td>
                  <td className={bang.tdSo}>{ngay(r.ngay)}</td>
                  <td className={bang.tdSo}>{r.hex ?? ''}</td>
                  <td className={`${bang.tdB} min-w-[16rem]`}>{r.hang_muc ?? ''}</td>
                  <td className={`${bang.tdB} min-w-[12rem] text-sm`}>{r.cong_trinh ?? ''}</td>
                  <td className={bang.tdSo}>{sl(r.so_luong)}{r.dvt ? <span className="ml-1 text-xs text-slate-500">{r.dvt}</span> : null}</td>
                  <td className={`${bang.tdSo} ${(r.gia_tri ?? 0) < 0 ? 'text-red-600' : ''}`}>{r.gia_tri ? tr1(r.gia_tri) : thieuGia(r) ? <span className="text-xs font-semibold text-amber-700">chưa có thành tiền</span> : ''}</td>
                </tr>))}
                {!rows.length && <tr><td colSpan={7} className={`${bang.tdB} py-6 text-center text-slate-500`}>Không có dòng nào.</td></tr>}
              </tbody>
              <tfoot className={bang.tfoot}><tr>
                <td colSpan={5} className={`${bang.tdB} text-center`}>TỔNG ({rows.length} dòng · {soHex} HEX){cur.cat ? ' · đã giới hạn 20.000 dòng' : ''}</td>
                <td className={bang.tdSo} />
                <td className={bang.tdSo}>{tr1(rows.reduce((s, r) => s + (r.gia_tri || 0), 0))}</td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
