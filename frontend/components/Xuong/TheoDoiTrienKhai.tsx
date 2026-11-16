import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Play, Pause, Inbox, PackageCheck, Check, Clock, Undo2, ChevronDown, ChevronRight } from 'lucide-react';
import { xuongSetupApi, type TheoDoiHangMuc, type TheoDoiCongDoan, type DotTrienKhai } from '../../services/xuongSetupApi';
import { INPUT, BTN, KHUNG } from './xuongDesktopUi';
import { tyLe } from './chiSoXuong';
import { hienSl, gioVN } from '../../services/xuongModel';
import XuongHexChiTiet from './XuongHexChiTiet';

// ============================================================================
// THEO DÕI TRIỂN KHAI — hạng mục xưởng đã triển khai (hoặc được giao thành phần): từng thành phần đi tuyến công đoạn
// nào, đang ở đâu, tổ nào phụ trách, đang làm / tạm ngưng / chờ nhận / chờ giao, số nhận – xong – giao.
// ============================================================================

type Loc = 'can_xu_ly' | 'dang_lam' | 'cho_khai' | 'xong' | 'dang_chay' | 'chua_tk' | 'ngoai_kh';
const TEN_LOC: Record<Loc, string> = {
  can_xu_ly: 'Cần xử lý', dang_lam: 'Đang làm', cho_khai: 'Chờ xưởng phụ khai', xong: 'Đã xong',
  dang_chay: 'Tất cả chưa xong', chua_tk: 'Chưa triển khai trên app', ngoai_kh: 'Không có trong KHSX',
};
/** 4 nút chính; còn lại vào menu Lọc thêm */
const LOC_CHINH: Loc[] = ['can_xu_ly', 'dang_lam', 'cho_khai', 'xong'];
const LOC_THEM: Loc[] = ['dang_chay', 'chua_tk', 'ngoai_kh'];
const ddmm = (iso: string) => iso.slice(0, 10).split('-').slice(1).reverse().join('/');
const NGAY_MS = 86_400_000;
/** Đang làm / có hàng chờ nhận mà không thao tác gì quá 48 giờ => coi là kẹt */
const KET_MS = 48 * 3_600_000;

/** Tình hình một hạng mục để sắp và lọc: số ngày trễ KHNK (null = không trễ), kẹt, hạng sắp xếp */
function tinhHinh(h: TheoDoiHangMuc, homNay: string, now: number) {
  const khnk = h.keHoach?.ngayKhnk?.slice(0, 10) ?? null;
  const conNgay = khnk ? Math.round((Date.parse(khnk) - Date.parse(homNay)) / NGAY_MS) : null;
  const tre = !h.xong && conNgay !== null && conNgay < 0 ? -conNgay : null;
  const ket = !h.xong && (h.dangLam > 0 || h.choNhan > 0) && !!h.capNhatCuoi && now - Date.parse(h.capNhatCuoi) > KET_MS;
  // Thứ tự: 0 trễ KHNK · 1 tạm ngưng / kẹt · 2 còn ≤ 3 ngày tới KHNK · 3 còn lại
  const hang = tre !== null ? 0 : !h.xong && (h.tamNgung > 0 || ket) ? 1 : !h.xong && conNgay !== null && conNgay <= 3 ? 2 : 3;
  return { tre, ket, hang, canXuLy: !h.xong && (tre !== null || h.tamNgung > 0 || h.choNhan > 0 || ket) };
}
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
  // Tương phản ≥ 4,5:1 (trước slate-400 / slate-500 + mờ 80% ≈ 2,6:1 — khó đọc ngoài xưởng)
  if (c.trangThai === 'xong') return { ten: 'Xong', mau: 'border-slate-200 bg-slate-50 text-slate-600', Icon: Check };
  return { ten: 'Chưa tới', mau: 'border-dashed border-slate-300 bg-white text-slate-600', Icon: null };
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
      <p className="truncate text-xs">{c.to.join(', ') || 'chưa gán tổ'}{c.xuong ? ` · ${c.xuong}` : ''}</p>
      <p className="mt-0.5 font-medium">
        {o.ten}{c.trangThai === 'dang_lam' && c.soNguoi ? ` · ${c.soNguoi} người` : ''}{c.dangChayTu ? ` · từ ${lucNgan(c.dangChayTu)}` : ''}
      </p>
      {coSo && <p className="tabular-nums">nhận {hienSl(c.slNhan)} · xong {hienSl(c.slHoanThanh)} · giao {hienSl(c.slGiao)}</p>}
    </div>
  );
}

/** Các đợt triển khai của hạng mục + nút huỷ đợt (triển khai nhầm). Máy chủ chặn khi tổ đã nhận hàng của đợt. */
function DsDot({ hex, ds, dv, xong }: { hex: string; ds: DotTrienKhai[]; dv: string; xong: () => void }) {
  const [dang, setDang] = useState<string | null>(null);
  const [loi, setLoi] = useState('');
  const huy = async (d: DotTrienKhai) => {
    const lyDo = window.prompt(`Huỷ đợt triển khai ${hienSl(d.soLuong)} ${dv} của ${hex} (${lucNgan(d.luc)})?
`
      + 'Hàng chờ nhận của đợt này sẽ bị bỏ ở mọi công đoạn, cả xưởng phụ. Ghi lý do (không bắt buộc):', '');
    if (lyDo === null) return;
    setDang(d.id); setLoi('');
    const r = await xuongSetupApi.huyTrienKhai(d.id, lyDo || undefined);
    setDang(null);
    if (!r.ok) { setLoi(r.message); return; }
    xong();
  };
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-slate-600">Đợt triển khai ({ds.length})</summary>
      <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {ds.map(d => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
            <span className="tabular-nums text-slate-700">{lucNgan(d.luc)}</span>
            <span className="text-slate-600">{d.nguoi ?? 'không rõ người'}</span>
            <span className="font-medium tabular-nums text-slate-900">{hienSl(d.soLuong)} {dv}</span>
            <span className="min-w-0 flex-1 truncate text-slate-600">
              {d.thanhPhan.map(t => `${t.ten || 'Tuyến'}${t.xuong ? ` (${t.xuong})` : ''}`).join(', ')}
            </span>
            {d.huyDuoc && (
              <button type="button" className={`${BTN} px-2 py-1 text-xs`} disabled={dang !== null} onClick={() => huy(d)}>
                <Undo2 size={12} aria-hidden /> {dang === d.id ? 'Đang huỷ…' : 'Huỷ đợt này'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {loi && <p className="mt-1 rounded bg-red-50 p-2 text-red-700" role="alert">{loi}</p>}
    </details>
  );
}

export default function TheoDoiTrienKhai({ xuong }: { xuong: string }) {
  const [ds, setDs] = useState<TheoDoiHangMuc[] | null>(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [loc, setLoc] = useState<Loc>('can_xu_ly');
  const [q, setQ] = useState('');
  const [soNgay, setSoNgay] = useState(90);
  const [moChiTiet, setMoChiTiet] = useState<Set<string>>(new Set());
  const batChiTiet = (hex: string) => setMoChiTiet(s => { const x = new Set(s); if (x.has(hex)) x.delete(hex); else x.add(hex); return x; });

  const tai = useCallback(async () => {
    setDang(true);
    const r = await xuongSetupApi.theoDoiTrienKhai(xuong, soNgay);
    setDang(false);
    if (!r.ok) { setLoi(r.message); return; }
    setLoi(''); setDs(r.data.hangMuc);
  }, [xuong, soNgay]);
  useEffect(() => { tai(); }, [tai]);

  const homNay = gioVN(Date.now()).ngay;
  // Tình hình từng hạng mục (trễ / kẹt / hạng sắp xếp) — tính lại mỗi lần tải
  const th = useMemo(() => {
    const now = Date.now();
    return new Map((ds ?? []).map(h => [h.hex, tinhHinh(h, homNay, now)]));
  }, [ds, homNay]);
  const dem = useMemo(() => {
    const a = (ds ?? []).filter(h => !h.xong);
    const cx = a.filter(h => th.get(h.hex)?.canXuLy);
    return {
      can_xu_ly: cx.length, dang_lam: a.filter(h => h.dangLam > 0).length, cho_khai: a.filter(h => h.choKhai.length > 0).length,
      xong: (ds ?? []).filter(h => h.xong).length, dang_chay: a.length,
      chua_tk: a.filter(h => h.chuaTrienKhai).length, ngoai_kh: a.filter(h => !h.keHoach).length,
      // Tách số trong Cần xử lý (một hạng mục có thể vừa trễ vừa tạm ngưng)
      tre: cx.filter(h => th.get(h.hex)?.tre != null).length, tamNgung: cx.filter(h => h.tamNgung > 0).length, choNhan: cx.filter(h => h.choNhan > 0).length,
      ket: cx.filter(h => th.get(h.hex)?.ket).length,
    };
  }, [ds, th]);
  const hien = useMemo(() => {
    const t = q.trim().toLowerCase();
    // Đang tìm: tìm trong mọi hạng mục, không theo bộ lọc
    return (ds ?? []).filter(h => (t ? true
      : loc === 'can_xu_ly' ? !!th.get(h.hex)?.canXuLy : loc === 'dang_lam' ? !h.xong && h.dangLam > 0
        : loc === 'cho_khai' ? !h.xong && h.choKhai.length > 0 : loc === 'dang_chay' ? !h.xong
          : loc === 'chua_tk' ? h.chuaTrienKhai && !h.xong : loc === 'ngoai_kh' ? !h.keHoach && !h.xong : h.xong)
      && (!t || `${h.hex} ${h.ten ?? ''} ${h.tenCongTrinh ?? ''}`.toLowerCase().includes(t)))
      // Trễ / kẹt / sát hạn lên đầu, còn lại triển khai mới nhất trước
      .sort((a, b) => (th.get(a.hex)?.hang ?? 3) - (th.get(b.hex)?.hang ?? 3)
        || (b.trienKhaiCuoi ?? '').localeCompare(a.trienKhaiCuoi ?? ''));
  }, [ds, loc, q, th]);
  const nutLoc = (k: Loc) => (
    <button key={k} type="button" aria-pressed={loc === k} onClick={() => setLoc(k)}
      className={`rounded-full border px-3 py-1 text-sm tabular-nums ${loc === k ? 'border-slate-900 bg-slate-900 font-semibold text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
      {TEN_LOC[k]} {dem[k]}
      {k === 'can_xu_ly' && dem.can_xu_ly > 0 && (
        <span className={`ml-1 text-xs font-normal ${loc === k ? 'text-slate-200' : 'text-slate-500'}`}>
          ({[dem.tre ? `${dem.tre} trễ` : '', dem.tamNgung ? `${dem.tamNgung} tạm ngưng` : '', dem.choNhan ? `${dem.choNhan} chờ nhận` : '', dem.ket ? `${dem.ket} kẹt` : ''].filter(Boolean).join(' · ')})
        </span>
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className={`${KHUNG} flex flex-wrap items-center gap-2 px-4 py-3`}>
        {LOC_CHINH.map(nutLoc)}
        <select value={LOC_THEM.includes(loc) ? loc : ''} onChange={e => e.target.value && setLoc(e.target.value as Loc)} aria-label="Lọc thêm"
          className={`rounded-full border px-3 py-1 text-sm ${LOC_THEM.includes(loc) ? 'border-slate-900 bg-slate-900 font-semibold text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
          <option value="" disabled>Lọc thêm</option>
          {LOC_THEM.map(k => <option key={k} value={k}>{TEN_LOC[k]} ({dem[k]})</option>)}
        </select>
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
      {ds && q.trim() && <p className="text-sm text-slate-500">Đang tìm trong mọi hạng mục (kể cả đã xong), không theo bộ lọc.</p>}
      {ds && hien.length === 0 && <p className="text-sm text-slate-500">{q.trim() ? 'Không tìm thấy hạng mục nào.' : `Không có hạng mục nào (${TEN_LOC[loc].toLowerCase()}).`}</p>}
      <div className="space-y-3">
        {hien.map(h => {
          const dv = h.dvt || 'cái';
          const pct = Math.min(100, tyLe(h.slXong, h.slTrienKhai) ?? 0);
          const kh = nhanKeHoach(h.keHoach);
          const tt = th.get(h.hex);
          const moCt = moChiTiet.has(h.hex);
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
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {kh ? <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">{kh}</span>
                      : <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">Không có trong KHSX</span>}
                    {tt?.tre != null && <span className="rounded bg-red-600 px-1.5 py-0.5 font-semibold text-white">Trễ {tt.tre} ngày</span>}
                    {tt?.ket && h.capNhatCuoi && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">Không cập nhật từ {lucNgan(h.capNhatCuoi)}</span>}
                    {h.chuaTrienKhai && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">Chưa triển khai trên app (nhận thẳng)</span>}
                  </div>
                </div>
                {!h.chuaTrienKhai && (
                  <div className="w-48">
                    <div className="flex justify-between text-xs text-slate-600"><span>Xong công đoạn cuối</span><span className="tabular-nums">{hienSl(h.slXong)}/{hienSl(h.slTrienKhai)}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
                <button type="button" className={`${BTN} px-2 py-1 text-xs`} aria-expanded={moCt} onClick={() => batChiTiet(h.hex)}>
                  {moCt ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />} {moCt ? 'Đóng chi tiết' : 'Xem chi tiết'}
                </button>
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
              {!!h.dotTrienKhai?.length && <DsDot hex={h.hex} ds={h.dotTrienKhai} dv={dv} xong={tai} />}
              {moCt && <div className="mt-2 border-t border-slate-100 pt-2"><XuongHexChiTiet hex={h.hex} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
