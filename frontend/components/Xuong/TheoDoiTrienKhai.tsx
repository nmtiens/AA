import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Play, Pause, Inbox, PackageCheck, Check, Clock } from 'lucide-react';
import { xuongSetupApi, type TheoDoiHangMuc, type TheoDoiCongDoan } from '../../services/xuongSetupApi';
import { INPUT, BTN, KHUNG } from './xuongDesktopUi';
import { hienSl } from '../../services/xuongModel';

// ============================================================================
// THEO DÕI TRIỂN KHAI — hạng mục xưởng đã triển khai (hoặc được giao thành phần): từng thành phần đi tuyến công đoạn
// nào, đang ở đâu, tổ nào phụ trách, đang làm / tạm ngưng / chờ nhận / chờ giao, số nhận – xong – giao.
// ============================================================================

type Loc = 'dang_chay' | 'dang_lam' | 'tam_ngung' | 'cho_nhan' | 'cho_khai' | 'chua_tk' | 'ngoai_kh' | 'xong';
const TEN_LOC: Record<Loc, string> = {
  dang_chay: 'Chưa xong', dang_lam: 'Đang làm', tam_ngung: 'Tạm ngưng', cho_nhan: 'Có hàng chờ nhận', cho_khai: 'Chờ xưởng phụ khai',
  chua_tk: 'Chưa triển khai trên app', ngoai_kh: 'Không có trong KHSX', xong: 'Đã xong',
};
const ddmm = (iso: string) => iso.slice(0, 10).split('-').slice(1).reverse().join('/');
/** Nhãn kế hoạch KHSX gần nhất của hạng mục */
const nhanKeHoach = (k: TheoDoiHangMuc['keHoach']) => !k ? null
  : `${k.loai === 'tuan' ? `KH tuần ${k.tuan ?? '?'}` : `KH tháng ${k.thang ?? '?'}`}/${k.nam ?? ''}${k.ngayKhnk ? ` · KHNK ${ddmm(k.ngayKhnk)}` : ''}`;

/** Trạng thái hiển thị của một công đoạn trên tuyến */
function oCongDoan(c: TheoDoiCongDoan) {
  if (c.trangThai === 'dang_lam') return { ten: 'Đang làm', mau: 'border-emerald-400 bg-emerald-50 text-emerald-900', Icon: Play };
  if (c.trangThai === 'tam_ngung') return { ten: 'Tạm ngưng', mau: 'border-amber-400 bg-amber-50 text-amber-900', Icon: Pause };
  if (c.slGiaoDen > c.slNhan + 0.0005) return { ten: 'Chờ nhận', mau: 'border-sky-300 bg-sky-50 text-sky-900', Icon: Inbox };
  if (c.trangThai === 'cho_giao') return { ten: 'Chờ giao', mau: 'border-violet-300 bg-violet-50 text-violet-900', Icon: PackageCheck };
  if (c.trangThai === 'da_nhan') return { ten: 'Đã nhận, chưa làm', mau: 'border-sky-300 bg-white text-sky-900', Icon: Clock };
  if (c.trangThai === 'xong') return { ten: 'Xong', mau: 'border-slate-200 bg-slate-50 text-slate-500', Icon: Check };
  return { ten: 'Chưa tới', mau: 'border-dashed border-slate-300 bg-white text-slate-400', Icon: null };
}

/** "13/10 08:00" giờ VN */
const lucNgan = (iso: string) => {
  const v = new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString();
  return `${v.slice(8, 10)}/${v.slice(5, 7)} ${v.slice(11, 16)}`;
};

function OCd({ c, dv }: { c: TheoDoiCongDoan; dv: string }) {
  const o = oCongDoan(c);
  const coSo = c.slNhan > 0 || c.slGiaoDen > 0;
  return (
    <div className={`min-w-[9.5rem] max-w-[12rem] shrink-0 rounded-lg border px-2 py-1.5 text-xs ${o.mau}`}
      title={`${c.ten}${c.xuong ? ` (${c.xuong})` : ''} — ${o.ten}\nTổ: ${c.to.join(', ') || 'chưa gán tổ'}\nGiao đến ${hienSl(c.slGiaoDen)} · nhận ${hienSl(c.slNhan)} · xong ${hienSl(c.slHoanThanh)} · giao ${hienSl(c.slGiao)} ${dv}`}>
      <p className="flex items-center gap-1 truncate font-semibold">{o.Icon && <o.Icon size={11} aria-hidden />}{c.ten}</p>
      <p className="truncate text-[11px] opacity-80">{c.to.join(', ') || 'chưa gán tổ'}{c.xuong ? ` · ${c.xuong}` : ''}</p>
      <p className="mt-0.5 font-medium">
        {o.ten}{c.trangThai === 'dang_lam' && c.soNguoi ? ` · ${c.soNguoi} người` : ''}{c.dangChayTu ? ` · từ ${lucNgan(c.dangChayTu)}` : ''}
      </p>
      {coSo && <p className="tabular-nums opacity-80">nhận {hienSl(c.slNhan)} · xong {hienSl(c.slHoanThanh)} · giao {hienSl(c.slGiao)}</p>}
    </div>
  );
}

export default function TheoDoiTrienKhai({ xuong }: { xuong: string }) {
  const [ds, setDs] = useState<TheoDoiHangMuc[] | null>(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [loc, setLoc] = useState<Loc>('dang_chay');
  const [q, setQ] = useState('');
  const [soNgay, setSoNgay] = useState(90);

  const tai = useCallback(async () => {
    setDang(true);
    const r = await xuongSetupApi.theoDoiTrienKhai(xuong, soNgay);
    setDang(false);
    if (!r.ok) { setLoi(r.message); return; }
    setLoi(''); setDs(r.data.hangMuc);
  }, [xuong, soNgay]);
  useEffect(() => { tai(); }, [tai]);

  const dem = useMemo(() => {
    const a = ds ?? [];
    return {
      dang_chay: a.filter(h => !h.xong).length, dang_lam: a.filter(h => h.dangLam > 0).length, tam_ngung: a.filter(h => h.tamNgung > 0).length,
      cho_nhan: a.filter(h => h.choNhan > 0).length, cho_khai: a.filter(h => h.choKhai.length > 0).length,
      chua_tk: a.filter(h => h.chuaTrienKhai && !h.xong).length, ngoai_kh: a.filter(h => !h.keHoach && !h.xong).length, xong: a.filter(h => h.xong).length,
    } as Record<Loc, number>;
  }, [ds]);
  const hien = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (ds ?? []).filter(h => (
      loc === 'dang_chay' ? !h.xong : loc === 'dang_lam' ? h.dangLam > 0 : loc === 'tam_ngung' ? h.tamNgung > 0
        : loc === 'cho_nhan' ? h.choNhan > 0 : loc === 'cho_khai' ? h.choKhai.length > 0
          : loc === 'chua_tk' ? h.chuaTrienKhai && !h.xong : loc === 'ngoai_kh' ? !h.keHoach && !h.xong : h.xong)
      && (!t || `${h.hex} ${h.ten ?? ''} ${h.tenCongTrinh ?? ''}`.toLowerCase().includes(t)));
  }, [ds, loc, q]);

  return (
    <div className="space-y-4">
      <div className={`${KHUNG} flex flex-wrap items-center gap-2 px-4 py-3`}>
        {(Object.keys(TEN_LOC) as Loc[]).map(k => (
          <button key={k} type="button" aria-pressed={loc === k} onClick={() => setLoc(k)}
            className={`rounded-full border px-3 py-1 text-sm tabular-nums ${loc === k ? 'border-wood-600 bg-wood-600 font-semibold text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {TEN_LOC[k]} {dem[k]}
          </button>
        ))}
        <div className="relative ml-auto w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className={`${INPUT} pl-8`} value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm hex, hạng mục, công trình" aria-label="Tìm hạng mục" />
        </div>
        <select value={soNgay} onChange={e => setSoNgay(Number(e.target.value))} aria-label="Khoảng triển khai"
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {[30, 90, 180, 365].map(n => <option key={n} value={n}>Triển khai {n} ngày gần nhất</option>)}
        </select>
        <button type="button" className={BTN} onClick={tai}><RefreshCw size={13} className={dang ? 'animate-spin' : ''} /> Tải lại</button>
      </div>
      {loi && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
      {ds && hien.length === 0 && <p className="text-sm text-slate-500">Không có hạng mục nào ({TEN_LOC[loc].toLowerCase()}).</p>}
      <div className="space-y-3">
        {hien.map(h => {
          const dv = h.dvt || 'cái';
          const pct = h.slTrienKhai > 0 ? Math.min(100, Math.round((h.slXong / h.slTrienKhai) * 100)) : 0;
          const kh = nhanKeHoach(h.keHoach);
          return (
            <div key={h.hex} className={`${KHUNG} p-3`}>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><span className="font-semibold tabular-nums text-slate-900">{h.hex}</span> <span className="text-slate-800">{h.ten}</span></p>
                  <p className="text-xs text-slate-500">
                    {h.tenCongTrinh}
                    {h.chuaTrienKhai
                      ? ` · đơn hàng ${h.soLuongDonHang === null ? '—' : hienSl(h.soLuongDonHang)} ${dv}`
                      : ` · triển khai ${hienSl(h.slTrienKhai)} ${dv} · ${h.trienKhaiCuoi ? new Date(h.trienKhaiCuoi).toLocaleDateString('vi-VN') : ''}`}
                    {h.xuongChinh && h.xuongChinh !== xuong ? ` · xưởng chính ${h.xuongChinh}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    {kh ? <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">{kh}</span>
                      : <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">Không có trong KHSX</span>}
                    {h.chuaTrienKhai && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">Chưa triển khai trên app (nhận thẳng)</span>}
                  </div>
                </div>
                {!h.chuaTrienKhai && (
                  <div className="w-48">
                    <div className="flex justify-between text-xs text-slate-600"><span>Xong công đoạn cuối</span><span className="tabular-nums">{hienSl(h.slXong)}/{hienSl(h.slTrienKhai)}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-2">
                {h.thanhPhan.map(tp => (
                  <div key={tp.thanhPhan || '-'} className="flex items-start gap-2">
                    <p className="w-20 shrink-0 pt-1.5 text-xs font-semibold text-slate-700">{tp.thanhPhan || 'Tuyến'}</p>
                    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-1">
                      {tp.tuyen.map((c, i) => (
                        <div key={`${c.congDoanId}-${i}`} className="flex items-center gap-1">
                          {i > 0 && <span className="text-slate-300" aria-hidden>→</span>}
                          <OCd c={c} dv={dv} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {h.choKhai.map(c => (
                  <p key={c.thanhPhan} className="text-xs text-amber-800"><b>{c.thanhPhan}</b>: chờ xưởng {c.xuong} khai CĐ chi tiết</p>
                ))}
                {h.ngoaiTuyen.length > 0 && (
                  <div className="flex items-start gap-2">
                    <p className="w-20 shrink-0 pt-1.5 text-xs font-semibold text-slate-500">{h.chuaTrienKhai ? 'Công đoạn' : 'Ngoài tuyến'}</p>
                    <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1">{h.ngoaiTuyen.map(c => <OCd key={c.congDoanId} c={c} dv={dv} />)}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
