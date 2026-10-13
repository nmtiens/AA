import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Download, Search } from 'lucide-react';
import {
  xuongSetupApi, type BaoCaoXuong as BaoCao, type BaoCaoTo, type BaoCaoToNgay, type BaoCaoHangMuc,
} from '../../services/xuongSetupApi';
import { gioVN, tenCo, hienSl, TEN_CA, LY_DO_TAM_NGUNG, type LoaiCa } from '../../services/xuongModel';
import { BTN, KHUNG, TH, TD } from './xuongDesktopUi';

// ============================================================================
// BÁO CÁO XƯỞNG / TỔ (docs/designs/xuong-checkin.md). Đầu màn: 5 số sản xuất của kỳ; 4 tab:
//   Theo ngày   — bảng ngày × tổ: công nhân, giờ người / giờ công / giờ chờ, % dùng người, nhận / chạy / xong; mở dòng
//                 xem giờ công từng hạng mục, hạng mục nhận / xong, giờ chờ theo lý do
//   Theo tổ     — tổ × ngày tô màu % dùng người (xu hướng) + tổng kỳ
//   Theo hạng mục — giờ công qua các công đoạn / tổ, số lượng xong, giờ công trên 1 đơn vị
//   Chất lượng dữ liệu — chỉ số dùng app, cờ cần xem, đối chiếu điểm danh
// Giờ công = phân bổ theo quân số (không nhân thời gian × số người). Server tính dần ngày còn thiếu (conThieu).
// ============================================================================

const ngayVN = (offset = 0) => gioVN(Date.now() + offset * 86_400_000).ngay;
const so = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
/** Số nhỏ (giờ công / đơn vị) giữ 2 chữ số lẻ */
const soNho = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: n < 1 ? 2 : 1 });
const phanTram = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const ddmm = (ngay: string) => ngay.split('-').reverse().slice(0, 2).join('/');
const dv = (d: string | null | undefined) => d?.trim() || 'cái';
/** Thời gian chạy: dưới 1 giờ thì ghi phút */
const thoiGian = (h: number) => (h < 1 ? `${Math.round(h * 60)} phút` : `${so(h)} giờ`);

const TEN_LY_DO_CHO: Record<string, string> = {
  nguoi_ranh: 'Người rảnh (khai ít hơn quân số)',
  khong_viec: 'Không có hạng mục chạy',
  ...Object.fromEntries(LY_DO_TAM_NGUNG.map(l => [l.ma, `Tạm ngưng: ${l.ten.toLowerCase()}`])),
};
const tenLyDoCho = (k: string) => TEN_LY_DO_CHO[k] ?? k;
const TEN_TRANG_THAI: Record<string, string> = {
  cho_nhan: 'Chờ nhận', da_nhan: 'Đã nhận', dang_lam: 'Đang chạy', tam_ngung: 'Tạm ngưng', cho_giao: 'Chờ giao', xong: 'Xong',
};
const MAU_TRANG_THAI: Record<string, string> = {
  dang_lam: 'text-emerald-700', tam_ngung: 'text-amber-700', xong: 'text-slate-500',
};

/** Màu ô % dùng người */
const mauDung = (p: number | null) => (p === null ? 'bg-slate-50 text-slate-400'
  : p >= 80 ? 'bg-emerald-100 text-emerald-900' : p >= 50 ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-900');

const congLyDo = (ds: Array<Record<string, number>>) => {
  const out: Record<string, number> = {};
  for (const m of ds) for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  return Object.entries(out).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]); // bỏ lý do < 3 phút
};

/** Số lượng theo đơn vị: "4 SET · 74,3 M2" */
const theoDonVi = (ds: Array<{ soLuong: number; dvt: string | null }>) => {
  const m = new Map<string, number>();
  for (const x of ds) m.set(dv(x.dvt), (m.get(dv(x.dvt)) ?? 0) + x.soLuong);
  return [...m.entries()].map(([d, n]) => `${hienSl(n)} ${d}`).join(' · ');
};

function moTaQuanSo(q: Record<string, number>) {
  const tc = Object.entries(q).filter(([k]) => k !== 'chinh').map(([k, n]) => `${TEN_CA[k as LoaiCa] ?? k}: ${n}`);
  return { chinh: typeof q.chinh === 'number' ? q.chinh : null, tangCa: tc.join(' · ') };
}

function The({ ten, giaTri, phu, mau }: { ten: string; giaTri: string; phu?: ReactNode; mau?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-600">{ten}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${mau ?? 'text-slate-900'}`}>{giaTri}</p>
      {phu && <p className="mt-0.5 text-xs text-slate-500">{phu}</p>}
    </div>
  );
}

function ChiSo({ ten, giaTri, phu, dat }: { ten: string; giaTri: string; phu: string; dat: boolean | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-600">{ten}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{giaTri}</p>
      <p className={`mt-0.5 text-xs ${dat === null ? 'text-slate-500' : dat ? 'text-emerald-700' : 'text-amber-700'}`}>
        {dat === null ? phu : dat ? `Đạt — ${phu}` : `Chưa đạt — ${phu}`}
      </p>
    </div>
  );
}

/** Giờ chờ theo lý do — thanh ngang */
function LyDoCho({ ds, tong }: { ds: Array<[string, number]>; tong: number }) {
  if (!ds.length) return <p className="px-3 py-2 text-sm text-slate-500">Không có giờ chờ.</p>;
  return (
    <ul className="space-y-1.5 px-3 py-2">
      {ds.map(([k, v]) => (
        <li key={k} className="text-sm">
          <div className="flex justify-between gap-3"><span className="text-slate-700">{tenLyDoCho(k)}</span><span className="tabular-nums text-slate-800">{so(v)} giờ</span></div>
          <div className="mt-0.5 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-amber-400" style={{ width: `${tong > 0 ? Math.min(100, (v / tong) * 100) : 0}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

const TieuDe = ({ children }: { children: ReactNode }) => (
  <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{children}</p>
);

function DsSoLuong({ ds, rong }: { ds: BaoCaoToNgay['nhan']; rong: string }) {
  return (
    <ul className="divide-y divide-slate-100">
      {ds.map(h => (
        <li key={`${h.hex}|${h.congDoanId}`} className="flex items-start gap-3 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p><span className="font-medium tabular-nums text-slate-800">{h.hex}</span> {h.tenHangMuc ?? ''}</p>
            <p className="text-xs text-slate-500">{h.tenCongDoan}</p>
          </div>
          <p className="shrink-0 tabular-nums text-slate-800">{hienSl(h.soLuong)} {dv(h.dvt)}</p>
        </li>
      ))}
      {!ds.length && <li className="px-3 py-2 text-sm text-slate-500">{rong}</li>}
    </ul>
  );
}

function ChiTietNgay({ n }: { n: BaoCaoToNgay }) {
  const lyDo = congLyDo([n.gioChoLyDo]);
  return (
    <div className="grid gap-3 bg-slate-50 p-3 rmd:grid-cols-2 rmd:p-4 r2xl:grid-cols-4">
      <div className={KHUNG}>
        <TieuDe>Giờ công theo hạng mục ({n.hangMuc.length})</TieuDe>
        <ul className="divide-y divide-slate-100">
          {n.hangMuc.map(h => (
            <li key={`${h.hex}|${h.congDoanId}`} className="flex items-start gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p>
                  <span className="font-medium tabular-nums text-slate-800">{h.hex}</span> {h.tenHangMuc ?? ''}
                  {h.dangChay && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Đang chạy</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {h.tenCongDoan} · {h.gioChay > 0 && h.gioNguoiKhai > 0 ? `${moTaNguoi(h.gioNguoiKhai / h.gioChay, h.soNguoiMax)} người × ` : 'chạy '}{thoiGian(h.gioChay)}
                </p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="font-semibold text-slate-800">{so(h.gioCongThuong + h.gioCongTangCa)} giờ</p>
                {h.gioCongTangCa > 0 && <p className="text-xs text-slate-500">tăng ca {so(h.gioCongTangCa)}</p>}
              </div>
            </li>
          ))}
          {!n.hangMuc.length && <li className="px-3 py-2 text-sm text-slate-500">Không có hạng mục chạy.</li>}
        </ul>
      </div>
      <div className={KHUNG}><TieuDe>Nhận ({n.nhan.length})</TieuDe><DsSoLuong ds={n.nhan} rong="Không nhận hạng mục nào." /></div>
      <div className={KHUNG}><TieuDe>Xong ({n.xong.length})</TieuDe><DsSoLuong ds={n.xong} rong="Chưa xong hạng mục nào." /></div>
      <div className={KHUNG}>
        <TieuDe>Giờ chờ {so(n.gioCho)} giờ — vì sao</TieuDe>
        <LyDoCho ds={lyDo} tong={n.gioCho} />
        {n.co.length > 0 && <p className="border-t border-slate-100 px-3 py-2 text-xs text-amber-800">{n.co.map(tenCo).join(', ')}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Theo ngày
// ---------------------------------------------------------------------------
type DongNgay = { t: BaoCaoTo; n: BaoCaoToNgay };

function TabTheoNgay({ ds }: { ds: BaoCaoTo[] }) {
  const [mo, setMo] = useState<Set<string>>(new Set());
  const bat = (k: string) => setMo(s => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  const theoNgay = new Map<string, DongNgay[]>();
  for (const t of ds) for (const n of t.theoNgay) {
    if (!theoNgay.has(n.ngay)) theoNgay.set(n.ngay, []);
    theoNgay.get(n.ngay)!.push({ t, n });
  }
  const ngays = [...theoNgay.keys()].sort().reverse();
  if (!ngays.length) return <div className={`${KHUNG} p-4 text-sm text-slate-500`}>Chưa có số liệu trong kỳ.</div>;
  const COT = 10;
  return (
    <div className={KHUNG}>
      {/* Điện thoại: thẻ từng tổ theo ngày */}
      <div className="rmd:hidden">
        {ngays.map(ngay => (
          <div key={ngay}>
            <p className="border-y border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">{ddmm(ngay)}/{ngay.slice(0, 4)}</p>
            <ul className="divide-y divide-slate-100">
              {theoNgay.get(ngay)!.sort((a, b) => a.t.ten.localeCompare(b.t.ten)).map(({ t, n }) => {
                const k = `${ngay}|${t.toId}`;
                const m = mo.has(k);
                const qs = moTaQuanSo(n.quanSo);
                const pt = phanTram(n.gioCong, n.gioNguoi);
                return (
                  <li key={k}>
                    <button type="button" className="w-full px-4 py-3 text-left active:bg-slate-50" aria-expanded={m} onClick={() => bat(k)}>
                      <p className="flex items-center gap-1 font-semibold text-slate-800">{m ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{t.ten}
                        {n.co.length > 0 && <AlertTriangle size={14} className="ml-1 text-amber-600" aria-label={n.co.map(tenCo).join(', ')} />}</p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center tabular-nums">
                        <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-xs text-slate-500">Công nhân</p><p className="font-semibold text-slate-800">{qs.chinh ?? '—'}</p></div>
                        <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-xs text-slate-500">Giờ công</p><p className="font-semibold text-slate-800">{so(n.gioCong)}</p></div>
                        <div className={`rounded-lg py-1.5 ${mauDung(pt)}`}><p className="text-xs opacity-75">Dùng người</p><p className="font-semibold">{pt === null ? '—' : `${pt}%`}</p></div>
                      </div>
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-600">
                        {qs.tangCa && <span>Tăng ca {qs.tangCa}</span>}
                        <span>Chờ {so(n.gioCho)} giờ</span><span>Nhận {n.nhan.length}</span><span>Chạy {n.hangMuc.length}</span>
                        {n.xong.length > 0 && <span>Xong {theoDonVi(n.xong)}</span>}
                      </p>
                    </button>
                    {m && <ChiTietNgay n={n} />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <table className="hidden w-full min-w-[980px] rmd:table">
        <thead className="sticky top-0 bg-slate-50"><tr>
          <th className={TH}>Ngày · tổ</th>
          <th className={`${TH} text-right`}>Công nhân</th>
          <th className={`${TH} text-right`}>Giờ người</th>
          <th className={`${TH} text-right`}>Giờ công</th>
          <th className={`${TH} text-right`}>Giờ chờ</th>
          <th className={`${TH} text-right`}>Dùng người</th>
          <th className={`${TH} text-right`}>Nhận</th>
          <th className={`${TH} text-right`}>Chạy</th>
          <th className={TH}>Xong</th>
          <th className={TH} />
        </tr></thead>
        <tbody>
          {ngays.map(ngay => {
            const dong = theoNgay.get(ngay)!.sort((a, b) => a.t.ten.localeCompare(b.t.ten));
            const s = dong.reduce((a, { n }) => ({
              cn: a.cn + (n.quanSo.chinh ?? 0), gn: a.gn + n.gioNguoi, gc: a.gc + n.gioCong, ch: a.ch + n.gioCho,
              nh: a.nh + n.nhan.length, ch2: a.ch2 + n.hangMuc.length, xo: [...a.xo, ...n.xong],
            }), { cn: 0, gn: 0, gc: 0, ch: 0, nh: 0, ch2: 0, xo: [] as BaoCaoToNgay['xong'] });
            const p = phanTram(s.gc, s.gn);
            return (
              <Fragment key={ngay}>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className={TD}>{ddmm(ngay)}/{ngay.slice(0, 4)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{s.cn || '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(s.gn)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(s.gc)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(s.ch)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{p === null ? '—' : `${p}%`}</td>
                  <td className={`${TD} text-right tabular-nums`}>{s.nh || '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{s.ch2 || '—'}</td>
                  <td className={`${TD} tabular-nums`}>{s.xo.length ? theoDonVi(s.xo) : '—'}</td>
                  <td className={TD} />
                </tr>
                {dong.map(({ t, n }) => {
                  const k = `${ngay}|${t.toId}`;
                  const m = mo.has(k);
                  const qs = moTaQuanSo(n.quanSo);
                  const pt = phanTram(n.gioCong, n.gioNguoi);
                  const dangChay = n.hangMuc.filter(h => h.dangChay).length;
                  return (
                    <Fragment key={k}>
                      <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => bat(k)} aria-expanded={m}>
                        <td className={`${TD} pl-6 font-medium text-slate-800`}>
                          <span className="inline-flex items-center gap-1">{m ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{t.ten}</span>
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {qs.chinh !== null ? qs.chinh : <span className="text-amber-700">chưa chốt</span>}
                          {qs.tangCa && <div className="text-xs text-slate-500">tăng ca {qs.tangCa}</div>}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{so(n.gioNguoi)}</td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {so(n.gioCong)}
                          {n.gioCongTangCa > 0 && <div className="text-xs text-slate-500">tăng ca {so(n.gioCongTangCa)}</div>}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{so(n.gioCho)}</td>
                        <td className={`${TD} text-right`}>
                          <span className={`inline-block min-w-12 rounded px-1.5 py-0.5 text-center tabular-nums ${mauDung(pt)}`}>{pt === null ? '—' : `${pt}%`}</span>
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{n.nhan.length || '—'}</td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {n.hangMuc.length || '—'}
                          {dangChay > 0 && <div className="text-xs text-emerald-700">{dangChay} đang chạy</div>}
                        </td>
                        <td className={`${TD} tabular-nums`}>{n.xong.length ? theoDonVi(n.xong) : '—'}</td>
                        <td className={TD}>{n.co.length > 0 && <AlertTriangle size={14} className="text-amber-600" aria-label={n.co.map(tenCo).join(', ')} />}</td>
                      </tr>
                      {m && <tr><td colSpan={COT} className="p-0"><ChiTietNgay n={n} /></td></tr>}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Công nhân = quân số tổ chốt ca chính. Giờ người = quân số × giờ ca (trừ nghỉ). Giờ công = giờ người chia cho hạng mục đang chạy theo số người khai;
        phần còn lại là giờ chờ. Dùng người = giờ công / giờ người (xanh ≥ 80%, vàng 50–79%, đỏ &lt; 50%). Bấm một tổ để xem chi tiết.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Theo tổ — tổ × ngày (% dùng người) + tổng kỳ
// ---------------------------------------------------------------------------
function TabTheoTo({ ds, d }: { ds: BaoCaoTo[]; d: BaoCao }) {
  const [mo, setMo] = useState<Set<number>>(new Set());
  const ngays = [...new Set(ds.flatMap(t => t.theoNgay.map(n => n.ngay)))].sort();
  const tong = ds.reduce((a, t) => ({
    gn: a.gn + t.gioNguoi.thuong + t.gioNguoi.tangCa, gc: a.gc + t.gioCong.thuong + t.gioCong.tangCa,
    gch: a.gch + t.gioCho.thuong + t.gioCho.tangCa, tc: a.tc + t.gioCong.tangCa,
    dc: a.dc + t.dangChay, tn: a.tn + t.tamNgung, cn: a.cn + t.choNhan,
  }), { gn: 0, gc: 0, gch: 0, tc: 0, dc: 0, tn: 0, cn: 0 });
  const cot = 9 + ngays.length;
  return (
    <div className={KHUNG}>
      <table className="w-full" style={{ minWidth: 820 + ngays.length * 64 }}>
        <thead className="bg-slate-50"><tr>
          <th className={`${TH} sticky left-0 bg-slate-50`}>Tổ</th>
          {ngays.map(n => <th key={n} className={`${TH} text-center`}>{ddmm(n)}</th>)}
          <th className={`${TH} border-l border-slate-200 text-right`}>Giờ người</th>
          <th className={`${TH} text-right`}>Giờ công</th>
          <th className={`${TH} text-right`}>Giờ chờ</th>
          <th className={`${TH} text-right`}>Dùng người</th>
          <th className={`${TH} text-right`}>Chốt quân số</th>
          <th className={`${TH} text-right`}>Đang chạy</th>
          <th className={`${TH} text-right`}>Tạm ngưng</th>
          <th className={`${TH} text-right`}>Chờ nhận</th>
        </tr></thead>
        <tbody>
          {ds.map(t => {
            const gn = t.gioNguoi.thuong + t.gioNguoi.tangCa;
            const gc = t.gioCong.thuong + t.gioCong.tangCa;
            const p = phanTram(gc, gn);
            const m = mo.has(t.toId);
            const theoNgay = new Map(t.theoNgay.map(n => [n.ngay, n]));
            return (
              <Fragment key={t.toId}>
                <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" aria-expanded={m}
                  onClick={() => setMo(s => { const x = new Set(s); if (x.has(t.toId)) x.delete(t.toId); else x.add(t.toId); return x; })}>
                  <td className={`${TD} sticky left-0 bg-white font-medium text-slate-800`}>
                    <span className="inline-flex items-center gap-1">{m ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{t.ten}</span>
                    {t.khaiVuot > 0 && <span className="ml-2 text-xs text-amber-700">khai vượt {t.khaiVuot} ngày</span>}
                  </td>
                  {ngays.map(ng => {
                    const n = theoNgay.get(ng);
                    const pn = n ? phanTram(n.gioCong, n.gioNguoi) : null;
                    return (
                      <td key={ng} className="px-1 py-1.5 text-center" title={n ? `Giờ công ${so(n.gioCong)} / giờ người ${so(n.gioNguoi)}` : 'Không có số liệu'}>
                        <span className={`block rounded px-1 py-1 text-xs font-medium tabular-nums ${mauDung(n ? pn : null)}`}>
                          {n ? (pn === null ? so(n.gioCong) : `${pn}%`) : '·'}
                        </span>
                      </td>
                    );
                  })}
                  <td className={`${TD} border-l border-slate-200 text-right tabular-nums`}>{so(gn)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(gc)}{t.gioCong.tangCa > 0 && <div className="text-xs text-slate-500">tăng ca {so(t.gioCong.tangCa)}</div>}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(t.gioCho.thuong + t.gioCho.tangCa)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{p === null ? '—' : `${p}%`}</td>
                  <td className={`${TD} text-right tabular-nums`}>{t.ngayCoChay ? `${t.ngayChot}/${t.ngayCoChay}` : '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{t.dangChay || '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{t.tamNgung || '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{t.choNhan || '—'}</td>
                </tr>
                {m && <tr><td colSpan={cot} className="p-0"><ChiTietTo t={t} /></td></tr>}
              </Fragment>
            );
          })}
          {!ds.length && <tr><td colSpan={cot} className={`${TD} text-slate-500`}>Chưa có số liệu trong kỳ {ddmm(d.tu)} – {ddmm(d.den)}.</td></tr>}
        </tbody>
        {ds.length > 1 && (
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr>
            <td className={`${TD} sticky left-0 bg-slate-50`}>Cả xưởng {d.xuong}</td>
            {ngays.map(ng => {
              const ns = ds.flatMap(t => t.theoNgay.filter(n => n.ngay === ng));
              const pn = phanTram(ns.reduce((a, n) => a + n.gioCong, 0), ns.reduce((a, n) => a + n.gioNguoi, 0));
              return <td key={ng} className="px-1 py-1.5 text-center"><span className={`block rounded px-1 py-1 text-xs tabular-nums ${mauDung(pn)}`}>{pn === null ? '—' : `${pn}%`}</span></td>;
            })}
            <td className={`${TD} border-l border-slate-200 text-right tabular-nums`}>{so(tong.gn)}</td>
            <td className={`${TD} text-right tabular-nums`}>{so(tong.gc)}</td>
            <td className={`${TD} text-right tabular-nums`}>{so(tong.gch)}</td>
            <td className={`${TD} text-right tabular-nums`}>{tong.gn ? `${Math.round((tong.gc / tong.gn) * 100)}%` : '—'}</td>
            <td className={TD} />
            <td className={`${TD} text-right tabular-nums`}>{tong.dc}</td>
            <td className={`${TD} text-right tabular-nums`}>{tong.tn}</td>
            <td className={`${TD} text-right tabular-nums`}>{tong.cn}</td>
          </tr></tfoot>
        )}
      </table>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Mỗi ô ngày = % dùng người của tổ trong ngày (ca chưa chốt quân số thì hiện giờ công). Bấm một tổ để xem giờ công cả kỳ theo hạng mục và giờ chờ theo lý do.
      </p>
    </div>
  );
}

function ChiTietTo({ t }: { t: BaoCaoTo }) {
  const tongCho = t.gioCho.thuong + t.gioCho.tangCa;
  return (
    <div className="grid gap-3 bg-slate-50 p-3 rmd:p-4 rxl:grid-cols-[2fr_1fr]">
      <div className={KHUNG}>
        <TieuDe>Giờ công theo hạng mục (cộng cả kỳ)</TieuDe>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50"><tr>
              <th className={TH}>Hạng mục · công đoạn</th><th className={`${TH} text-right`}>Giờ chạy</th>
              <th className={`${TH} text-right`}>Giờ công thường</th><th className={`${TH} text-right`}>Giờ công tăng ca</th>
            </tr></thead>
            <tbody>
              {t.theoHangMuc.map(h => (
                <tr key={`${h.hex}|${h.congDoanId}`} className="border-t border-slate-100">
                  <td className={TD}>
                    <span className="font-medium tabular-nums text-slate-800">{h.hex}</span> {h.tenHangMuc ?? ''}
                    <br /><span className="text-xs text-slate-500">{h.tenCongDoan}{h.tenCongTrinh ? ` · ${h.tenCongTrinh}` : ''}</span>
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{so(h.gioChay)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(h.gioCongThuong)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(h.gioCongTangCa)}</td>
                </tr>
              ))}
              {!t.theoHangMuc.length && <tr><td colSpan={4} className={`${TD} text-slate-500`}>Không có hạng mục chạy trong kỳ.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className={KHUNG}>
        <TieuDe>Giờ chờ {so(tongCho)} giờ — vì sao</TieuDe>
        <LyDoCho ds={congLyDo([t.gioChoLyDo ?? {}])} tong={tongCho} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Theo hạng mục — mỗi hạng mục: từng công đoạn (tổ, số công nhân, giờ chạy = giờ mỗi người, giờ công / người,
// tổng giờ công, số xong, giờ công / đơn vị); mở ra xem theo từng ngày
// ---------------------------------------------------------------------------
/** Giờ công trên 1 đơn vị của hạng mục = cộng (giờ công / SL xong) các công đoạn; null khi có công đoạn chưa xong cái nào */
function gioTrenDv(h: BaoCaoHangMuc): number | null {
  const cds = h.congDoan.filter(c => c.gioCong > 0);
  if (!cds.length || cds.some(c => c.slXong <= 0)) return null;
  return cds.reduce((a, c) => a + c.gioCong / c.slXong, 0);
}
/** Số công nhân bình quân: "4" hoặc "3,5 (tối đa 5)" */
const moTaNguoi = (tb0: number, max: number) => {
  const tb = max > 0 ? Math.min(tb0, max) : tb0; // giờ chạy vài phút làm tròn lệch => không vượt số tối đa
  return tb <= 0 ? '—' : Math.abs(tb - max) < 0.05 ? so(max) : `${so(tb)} (tối đa ${max})`;
};
const gioMoiNguoi = (gioCong: number, tb: number) => (tb > 0 ? gioCong / tb : null);

type NgayHm = { ngay: string; to: string; tenCongDoan: string; soNguoiTb: number; soNguoiMax: number; gioChay: number; gioCong: number; gioCongTangCa: number };

function TabTheoHangMuc({ ds, theoTo }: { ds: BaoCaoHangMuc[]; theoTo: BaoCaoTo[] }) {
  const [q, setQ] = useState('');
  const [mo, setMo] = useState<Set<string>>(new Set());
  const loc = q.trim().toLowerCase();
  const hien = loc ? ds.filter(h => `${h.hex} ${h.tenHangMuc ?? ''} ${h.tenCongTrinh ?? ''}`.toLowerCase().includes(loc)) : ds;
  // Chi tiết theo ngày của từng hạng mục (từ số liệu ngày × tổ)
  const theoNgayHm = useMemo(() => {
    const m = new Map<string, NgayHm[]>();
    for (const t of theoTo) for (const n of t.theoNgay) for (const h of n.hangMuc) {
      if (!m.has(h.hex)) m.set(h.hex, []);
      m.get(h.hex)!.push({
        ngay: n.ngay, to: t.ten, tenCongDoan: h.tenCongDoan, soNguoiTb: h.gioChay > 0 ? Math.min(h.soNguoiMax || Infinity, h.gioNguoiKhai / h.gioChay) : 0,
        soNguoiMax: h.soNguoiMax, gioChay: h.gioChay, gioCong: h.gioCongThuong + h.gioCongTangCa, gioCongTangCa: h.gioCongTangCa,
      });
    }
    for (const v of m.values()) v.sort((a, b) => b.ngay.localeCompare(a.ngay) || a.tenCongDoan.localeCompare(b.tenCongDoan));
    return m;
  }, [theoTo]);
  const bat = (hex: string) => setMo(s => { const x = new Set(s); if (x.has(hex)) x.delete(hex); else x.add(hex); return x; });

  return (
    <div className={KHUNG}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5">
        <label className="flex min-w-64 flex-1 items-center gap-2 rounded-md border border-slate-300 px-2 py-1">
          <Search size={14} className="text-slate-400" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã hạng mục, tên, công trình" className="w-full text-sm outline-none" aria-label="Tìm hạng mục" />
        </label>
        <span className="text-sm text-slate-600">{hien.length} hạng mục · {so(hien.reduce((a, h) => a + h.gioCong, 0))} giờ công</span>
      </div>

      <ul className="divide-y divide-slate-200">
        {hien.map(h => {
          const m = mo.has(h.hex);
          const g = gioTrenDv(h);
          const ngay = theoNgayHm.get(h.hex) ?? [];
          return (
            <li key={h.hex} className="px-4 py-3">
              {/* Đầu hạng mục: mã, tên, công trình · tổng giờ công · xong · giờ công / đơn vị */}
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
                <div className="min-w-0">
                  <p className="text-sm"><span className="font-semibold tabular-nums text-slate-900">{h.hex}</span> <span className="text-slate-800">{h.tenHangMuc ?? ''}</span></p>
                  <p className="text-xs text-slate-500">
                    {h.tenCongTrinh ?? ''}{h.soLuongDonHang ? `${h.tenCongTrinh ? ' · ' : ''}đơn hàng ${hienSl(h.soLuongDonHang)} ${dv(h.dvt)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-sm tabular-nums text-slate-700">
                  <span><span className="text-slate-500">Tổng giờ công </span><b className="text-slate-900">{so(h.gioCong)}</b></span>
                  <span><span className="text-slate-500">Xong </span>{h.slXong ? `${hienSl(h.slXong)} ${dv(h.dvt)}` : '—'}</span>
                  <span><span className="text-slate-500">Giờ công / {dv(h.dvt)} </span>{g === null ? <span className="text-slate-400">chưa đủ</span> : soNho(g)}</span>
                </div>
              </div>

              {/* Từng công đoạn */}
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50"><tr>
                    <th className={TH}>Công đoạn · tổ</th>
                    <th className={`${TH} text-right`}>Công nhân</th>
                    <th className={`${TH} text-right`}>Giờ chạy</th>
                    <th className={`${TH} text-right`}>Giờ công / người</th>
                    <th className={`${TH} text-right`}>Tổng giờ công</th>
                    <th className={`${TH} text-right`}>SL xong</th>
                    <th className={`${TH} text-right`}>Giờ công / {dv(h.dvt)}</th>
                    <th className={TH}>Hiện tại (xong / nhận)</th>
                  </tr></thead>
                  <tbody>
                    {h.congDoan.map(c => {
                      const gn = gioMoiNguoi(c.gioCong, c.soNguoiTb);
                      return (
                        <tr key={c.congDoanId} className="border-t border-slate-100">
                          <td className={TD}>{c.tenCongDoan}<div className="text-xs text-slate-500">{c.to.join(', ')}</div></td>
                          <td className={`${TD} text-right tabular-nums`}>{moTaNguoi(c.soNguoiTb, c.soNguoiMax)}</td>
                          <td className={`${TD} text-right tabular-nums`}>{c.gioChay ? thoiGian(c.gioChay) : '—'}</td>
                          <td className={`${TD} text-right tabular-nums`}>{gn === null ? '—' : soNho(gn)}</td>
                          <td className={`${TD} text-right font-semibold tabular-nums`}>
                            {so(c.gioCong)}{c.gioCongTangCa > 0 && <div className="text-xs font-normal text-slate-500">tăng ca {so(c.gioCongTangCa)}</div>}
                          </td>
                          <td className={`${TD} text-right tabular-nums`}>{c.slXong ? hienSl(c.slXong) : '—'}</td>
                          <td className={`${TD} text-right tabular-nums`}>{c.slXong > 0 && c.gioCong > 0 ? soNho(c.gioCong / c.slXong) : '—'}</td>
                          <td className={`${TD} ${MAU_TRANG_THAI[c.trangThai ?? ''] ?? ''}`}>
                            {c.trangThai ? TEN_TRANG_THAI[c.trangThai] ?? c.trangThai : '—'}
                            <span className="ml-1 tabular-nums text-slate-500">({hienSl(c.slHoanThanh)} / {hienSl(c.slNhan)})</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Theo ngày */}
              {ngay.length > 0 && (
                <button type="button" onClick={() => bat(h.hex)} aria-expanded={m}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
                  {m ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Theo ngày ({ngay.length})
                </button>
              )}
              {m && (
                <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-slate-50"><tr>
                      <th className={TH}>Ngày</th><th className={TH}>Tổ · công đoạn</th>
                      <th className={`${TH} text-right`}>Công nhân</th><th className={`${TH} text-right`}>Giờ chạy</th>
                      <th className={`${TH} text-right`}>Giờ công / người</th><th className={`${TH} text-right`}>Giờ công</th>
                    </tr></thead>
                    <tbody>
                      {ngay.map((x, i) => {
                        const gn = gioMoiNguoi(x.gioCong, x.soNguoiTb);
                        return (
                          <tr key={`${x.ngay}|${x.to}|${x.tenCongDoan}|${i}`} className="border-t border-slate-100">
                            <td className={`${TD} tabular-nums`}>{ddmm(x.ngay)}</td>
                            <td className={TD}>{x.to}<span className="text-xs text-slate-500"> · {x.tenCongDoan}</span></td>
                            <td className={`${TD} text-right tabular-nums`}>{moTaNguoi(x.soNguoiTb, x.soNguoiMax)}</td>
                            <td className={`${TD} text-right tabular-nums`}>{thoiGian(x.gioChay)}</td>
                            <td className={`${TD} text-right tabular-nums`}>{gn === null ? '—' : soNho(gn)}</td>
                            <td className={`${TD} text-right tabular-nums`}>{so(x.gioCong)}{x.gioCongTangCa > 0 && <span className="text-xs text-slate-500"> (tăng ca {so(x.gioCongTangCa)})</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          );
        })}
        {!hien.length && <li className="px-4 py-3 text-sm text-slate-500">{ds.length ? 'Không có hạng mục khớp tìm kiếm.' : 'Chưa có hạng mục chạy hoặc xong trong kỳ.'}</li>}
      </ul>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Công nhân = số người tổ khai làm hạng mục lúc chạy (bình quân theo thời gian). Giờ chạy = thời gian hạng mục chạy (mỗi người làm chừng đó giờ).
        Tổng giờ công = công nhân × giờ chạy (co lại nếu khai vượt quân số). Giờ công / đơn vị = giờ công chia số lượng xong trong kỳ;
        "chưa đủ" khi có công đoạn đã tốn giờ nhưng chưa xong cái nào.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Chất lượng dữ liệu
// ---------------------------------------------------------------------------
function DoiChieuChamCong({ d }: { d: BaoCao }) {
  const cc = d.chamCong;
  if (!cc) return null;
  const ds = cc.theoNgay.filter(n => n.congNhan > 0 || n.gioThuongApp + n.gioTangCaApp > 0);
  const caHai = ds.filter(n => n.gioHc + n.gioTc > 0 && n.gioThuongApp + n.gioTangCaApp > 0);
  const coDiemDanh = ds.some(n => n.congNhan > 0);
  const tongCc = caHai.reduce((a, n) => a + n.gioHc + n.gioTc, 0);
  const tongApp = caHai.reduce((a, n) => a + n.gioThuongApp + n.gioTangCaApp, 0);
  const lech = tongCc > 0 ? Math.round((Math.abs(tongApp - tongCc) / tongCc) * 100) : null;
  return (
    <div className={KHUNG}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">Đối chiếu chấm công (Dữ liệu Điểm danh, cả xưởng)</p>
        {lech !== null
          ? <p className={`text-sm ${lech <= 10 ? 'text-emerald-700' : 'text-amber-700'}`}>
              Giờ người app lệch {lech}% so với giờ công điểm danh ({caHai.length} ngày có cả hai) — {lech <= 10 ? 'đạt' : 'chưa đạt'} mục tiêu ≤ 10%
            </p>
          : <p className="text-sm text-slate-600">
              Chưa có ngày nào có cả số điểm danh và số app trong kỳ{cc.moiNhat ? ` — điểm danh mới nhất ${ddmm(cc.moiNhat)}/${cc.moiNhat.slice(0, 4)}` : ' — bảng điểm danh chưa có số của xưởng này'}.
            </p>}
      </div>
      {coDiemDanh && (
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[860px]">
            <thead className="sticky top-0 bg-slate-50"><tr>
              <th className={TH}>Ngày</th>
              <th className={`${TH} text-right`}>Công nhân (điểm danh)</th><th className={`${TH} text-right`}>Quân số chốt (app)</th>
              <th className={`${TH} text-right`}>Giờ hành chính (điểm danh)</th><th className={`${TH} text-right`}>Giờ thường (app)</th>
              <th className={`${TH} text-right`}>Giờ tăng ca (điểm danh)</th><th className={`${TH} text-right`}>Giờ tăng ca (app)</th>
            </tr></thead>
            <tbody>
              {ds.map(n => (
                <tr key={n.ngay} className="border-t border-slate-100">
                  <td className={`${TD} tabular-nums`}>{ddmm(n.ngay)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n.congNhan ? so(n.congNhan) : '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n.quanSoApp ? so(n.quanSoApp) : '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n.gioHc ? so(n.gioHc) : '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n.gioThuongApp ? so(n.gioThuongApp) : '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n.gioTc ? so(n.gioTc) : '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n.gioTangCaApp ? so(n.gioTangCaApp) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Điểm danh tính cả xưởng; app chỉ gồm các tổ đã dùng mục Xưởng — khi chưa đưa hết tổ lên app, số app thấp hơn là bình thường.
      </p>
    </div>
  );
}

function TabChatLuong({ d, ds }: { d: BaoCao; ds: BaoCaoTo[] }) {
  const cs = d.chiSo;
  const pNk = phanTram(cs.nhatKy.du, cs.nhatKy.tong);
  const pChot = phanTram(cs.chotQuanSo.ngayChot, cs.chotQuanSo.ngayCoChay);
  const pGui = phanTram(cs.guiTrong1Gio.nhanh, cs.guiTrong1Gio.tong);
  const demCo = new Map<string, Array<{ ngay: string; to: string }>>();
  for (const t of ds) for (const n of t.theoNgay) for (const c of n.co) {
    if (!demCo.has(c)) demCo.set(c, []);
    demCo.get(c)!.push({ ngay: n.ngay, to: t.ten });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rxl:grid-cols-4">
        <ChiSo ten="Nhật ký đủ Bắt đầu và Hoàn thành" giaTri={pNk === null ? '—' : `${pNk}%`}
          phu={`${cs.nhatKy.du}/${cs.nhatKy.tong} cặp hạng mục × công đoạn, mục tiêu ≥ 90% (MRA 85%)`} dat={pNk === null ? null : pNk >= 90} />
        <ChiSo ten="Ngày-tổ có chốt quân số" giaTri={pChot === null ? '—' : `${pChot}%`}
          phu={`${cs.chotQuanSo.ngayChot}/${cs.chotQuanSo.ngayCoChay} ngày có hạng mục chạy, mục tiêu ≥ 90%`} dat={pChot === null ? null : pChot >= 90} />
        <ChiSo ten="Thao tác tới máy chủ trong 1 giờ" giaTri={pGui === null ? '—' : `${pGui}%`}
          phu={`${cs.guiTrong1Gio.nhanh}/${cs.guiTrong1Gio.tong} thao tác, mục tiêu ≥ 95%`} dat={pGui === null ? null : pGui >= 95} />
        <ChiSo ten="Ngày-tổ khai vượt quân số" giaTri={String(cs.khaiVuotQuanSo)} phu="Theo dõi, không đặt mục tiêu" dat={null} />
      </div>
      <div className={KHUNG}>
        <TieuDe>Cờ cần xem trong kỳ</TieuDe>
        <ul className="divide-y divide-slate-100">
          {[...demCo.entries()].sort((a, b) => b[1].length - a[1].length).map(([c, ds2]) => (
            <li key={c} className="px-3 py-2 text-sm">
              <p className="font-medium text-amber-800">{tenCo(c)} — {ds2.length} ngày-tổ</p>
              <p className="text-xs text-slate-500">{ds2.slice(0, 12).map(x => `${x.to} ${ddmm(x.ngay)}`).join(' · ')}{ds2.length > 12 ? ' …' : ''}</p>
            </li>
          ))}
          {!demCo.size && <li className="px-3 py-2 text-sm text-slate-500">Không có cờ nào.</li>}
        </ul>
      </div>
      <DoiChieuChamCong d={d} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Xuất Excel
// ---------------------------------------------------------------------------
async function xuatExcel(d: BaoCao, ds: BaoCaoTo[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const them = (ten: string, rows: Array<Record<string, unknown>>) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Không có dữ liệu': '' }]), ten);
  const dong: DongNgay[] = ds.flatMap(t => t.theoNgay.map(n => ({ t, n }))).sort((a, b) => a.n.ngay.localeCompare(b.n.ngay) || a.t.ten.localeCompare(b.t.ten));
  them('Theo ngay', dong.map(({ t, n }) => ({
    'Ngày': n.ngay, 'Tổ': t.ten, 'Công nhân (ca chính)': n.quanSo.chinh ?? null, 'Tăng ca': moTaQuanSo(n.quanSo).tangCa,
    'Giờ người': n.gioNguoi, 'Giờ công': n.gioCong, 'Giờ công tăng ca': n.gioCongTangCa, 'Giờ chờ': n.gioCho,
    'Dùng người %': phanTram(n.gioCong, n.gioNguoi), 'Số hạng mục nhận': n.nhan.length, 'Số hạng mục chạy': n.hangMuc.length,
    'Xong': theoDonVi(n.xong), 'Cờ': n.co.map(tenCo).join(', '),
  })));
  them('Hang muc theo ngay', dong.flatMap(({ t, n }) => n.hangMuc.map(h => ({
    'Ngày': n.ngay, 'Tổ': t.ten, 'Mã hạng mục': h.hex, 'Tên hạng mục': h.tenHangMuc, 'Công đoạn': h.tenCongDoan,
    'Công nhân (bình quân)': h.gioChay > 0 ? Math.round(Math.min(h.soNguoiMax || Infinity, h.gioNguoiKhai / h.gioChay) * 10) / 10 : null, 'Công nhân tối đa': h.soNguoiMax,
    'Giờ chạy': h.gioChay, 'Giờ công thường': h.gioCongThuong, 'Giờ công tăng ca': h.gioCongTangCa, 'Đang chạy': h.dangChay ? 'x' : '',
  }))));
  them('Nhan - Xong', dong.flatMap(({ t, n }) => [
    ...n.nhan.map(h => ({ 'Ngày': n.ngay, 'Tổ': t.ten, 'Loại': 'Nhận', 'Mã hạng mục': h.hex, 'Tên hạng mục': h.tenHangMuc, 'Công đoạn': h.tenCongDoan, 'Số lượng': h.soLuong, 'Đơn vị': dv(h.dvt) })),
    ...n.xong.map(h => ({ 'Ngày': n.ngay, 'Tổ': t.ten, 'Loại': 'Xong', 'Mã hạng mục': h.hex, 'Tên hạng mục': h.tenHangMuc, 'Công đoạn': h.tenCongDoan, 'Số lượng': h.soLuong, 'Đơn vị': dv(h.dvt) })),
  ]));
  them('Gio cho', dong.flatMap(({ t, n }) => Object.entries(n.gioChoLyDo).map(([k, v]) => ({ 'Ngày': n.ngay, 'Tổ': t.ten, 'Lý do': tenLyDoCho(k), 'Giờ chờ': v }))));
  them('Theo to', ds.map(t => {
    const gn = t.gioNguoi.thuong + t.gioNguoi.tangCa; const gc = t.gioCong.thuong + t.gioCong.tangCa;
    return {
      'Tổ': t.ten, 'Giờ người': gn, 'Giờ công': gc, 'Giờ công tăng ca': t.gioCong.tangCa, 'Giờ chờ': t.gioCho.thuong + t.gioCho.tangCa,
      'Dùng người %': phanTram(gc, gn), 'Ngày chốt quân số': `${t.ngayChot}/${t.ngayCoChay}`, 'Đang chạy': t.dangChay, 'Tạm ngưng': t.tamNgung, 'Chờ nhận': t.choNhan,
    };
  }));
  them('Theo hang muc', d.hangMuc.flatMap(h => h.congDoan.map(c => ({
    'Mã hạng mục': h.hex, 'Tên hạng mục': h.tenHangMuc, 'Công trình': h.tenCongTrinh, 'Đơn vị': dv(h.dvt), 'SL đơn hàng': h.soLuongDonHang,
    'Công đoạn': c.tenCongDoan, 'Tổ': c.to.join(', '), 'Công nhân (bình quân)': c.soNguoiTb, 'Công nhân tối đa': c.soNguoiMax,
    'Giờ chạy': c.gioChay, 'Giờ công / người': c.soNguoiTb > 0 ? Math.round((c.gioCong / c.soNguoiTb) * 100) / 100 : null,
    'Giờ công': c.gioCong, 'Giờ công tăng ca': c.gioCongTangCa,
    'SL xong trong kỳ': c.slXong, 'Giờ công / đơn vị': c.slXong > 0 && c.gioCong > 0 ? Math.round((c.gioCong / c.slXong) * 100) / 100 : null,
    'Trạng thái': c.trangThai ? TEN_TRANG_THAI[c.trangThai] ?? c.trangThai : '', 'Đã xong / đã nhận': `${c.slHoanThanh} / ${c.slNhan}`,
  }))));
  XLSX.writeFile(wb, `bao_cao_xuong_${d.xuong}_${d.tu}_${d.den}.xlsx`);
}

// ---------------------------------------------------------------------------
type Tab = 'ngay' | 'to' | 'hangMuc' | 'chatLuong';
const TABS: Array<{ id: Tab; ten: string }> = [
  { id: 'ngay', ten: 'Theo ngày' }, { id: 'to', ten: 'Theo tổ' }, { id: 'hangMuc', ten: 'Theo hạng mục' }, { id: 'chatLuong', ten: 'Chất lượng dữ liệu' },
];
const KHOA_TAB = 'xuong_bao_cao_tab';

export default function BaoCaoXuong({ xuong }: { xuong: string }) {
  const [tu, setTu] = useState(() => ngayVN(-6));
  const [den, setDen] = useState(() => ngayVN());
  const [d, setD] = useState<BaoCao | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const [dangXuat, setDangXuat] = useState(false);
  const [anTrong, setAnTrong] = useState(true);
  const [tab, setTab] = useState<Tab>(() => {
    try { const v = localStorage.getItem(KHOA_TAB) as Tab | null; return v && TABS.some(x => x.id === v) ? v : 'ngay'; } catch { return 'ngay'; }
  });
  const chonTab = (t: Tab) => { setTab(t); try { localStorage.setItem(KHOA_TAB, t); } catch { /* bỏ qua */ } };
  const lan = useRef(0);

  const tai = useCallback(async () => {
    const id = ++lan.current;
    setDang(true); setLoi('');
    // Server tính dần các ngày còn thiếu: gọi lại tới khi đủ (tối đa 20 lượt)
    for (let i = 0; i < 20; i++) {
      const r = await xuongSetupApi.baoCao(xuong, tu, den);
      if (id !== lan.current) return;
      if (!r.ok) { setLoi(r.message); break; }
      setD(r.data);
      if (!r.data.conThieu) break;
    }
    if (id === lan.current) setDang(false);
  }, [xuong, tu, den]);
  useEffect(() => { tai(); }, [tai]);

  const chon = (a: string, b: string) => { setTu(a); setDen(b); };
  const homNay = ngayVN();
  const dauThang = `${homNay.slice(0, 8)}01`;
  const ds = useMemo(() => (d?.theoTo ?? []).filter(t => !anTrong || t.theoNgay.length || t.dangChay || t.choNhan || t.tamNgung)
    .sort((a, b) => a.ten.localeCompare(b.ten)), [d, anTrong]);

  // 5 số sản xuất của kỳ
  const tom = useMemo(() => {
    const ns = ds.flatMap(t => t.theoNgay);
    const soNgay = new Set(ns.map(n => n.ngay)).size;
    const cn = ns.reduce((a, n) => a + (n.quanSo.chinh ?? 0), 0);
    const gn = ns.reduce((a, n) => a + n.gioNguoi, 0);
    const gc = ns.reduce((a, n) => a + n.gioCong, 0);
    const tc = ns.reduce((a, n) => a + n.gioCongTangCa, 0);
    const ch = ns.reduce((a, n) => a + n.gioCho, 0);
    const lyDo = congLyDo(ns.map(n => n.gioChoLyDo ?? {}));
    const xong = ns.flatMap(n => n.xong);
    return { soNgay, cnTb: soNgay ? cn / soNgay : 0, gn, gc, tc, ch, lyDo, xong, soHmXong: new Set(xong.map(x => x.hex)).size };
  }, [ds]);
  const pDung = phanTram(tom.gc, tom.gn);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-700">Từ
          <input type="date" value={tu} max={den} onChange={e => e.target.value && setTu(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">đến
          <input type="date" value={den} min={tu} max={homNay} onChange={e => e.target.value && setDen(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <button type="button" className={BTN} onClick={() => chon(homNay, homNay)}>Hôm nay</button>
        <button type="button" className={BTN} onClick={() => chon(ngayVN(-6), homNay)}>7 ngày</button>
        <button type="button" className={BTN} onClick={() => chon(dauThang, homNay)}>Tháng này</button>
        <label className="ml-2 flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" checked={anTrong} onChange={e => setAnTrong(e.target.checked)} /> Ẩn tổ không có số liệu
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" className={BTN} disabled={!d || dangXuat || (d?.conThieu ?? 0) > 0}
            onClick={async () => { if (!d) return; setDangXuat(true); try { await xuatExcel(d, ds); } finally { setDangXuat(false); } }}>
            <Download size={13} /> {dangXuat ? 'Đang xuất…' : 'Xuất Excel'}
          </button>
          <button type="button" className={BTN} onClick={tai}><RefreshCw size={13} className={dang ? 'animate-spin' : ''} /> Tải lại</button>
        </div>
      </div>

      {loi && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
      {d && !d.banLuu && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={15} /> Chưa chạy file backend/sql/2026-10-12_xuong_bao_cao.sql — báo cáo tính lại mỗi lần xem (chậm hơn với khoảng ngày dài).
        </p>
      )}
      {d && d.conThieu > 0 && <p className="text-sm text-slate-600" aria-live="polite"><RefreshCw size={13} className="mr-1 inline animate-spin" /> Đang tính thêm {d.conThieu} ngày-tổ…</p>}

      {d && (
        <div className="grid grid-cols-2 gap-3 rmd:grid-cols-3 rxl:grid-cols-5">
          <The ten="Công nhân bình quân / ngày" giaTri={tom.soNgay ? so(tom.cnTb) : '—'} phu={`${tom.soNgay} ngày có số liệu · quân số chốt ca chính`} />
          <The ten="Giờ công" giaTri={so(tom.gc)} phu={`trên ${so(tom.gn)} giờ người${tom.tc > 0 ? ` · tăng ca ${so(tom.tc)}` : ''}`} />
          <The ten="Dùng người" giaTri={pDung === null ? '—' : `${pDung}%`} phu="giờ công / giờ người, mục tiêu ≥ 80%"
            mau={pDung === null ? undefined : pDung >= 80 ? 'text-emerald-700' : pDung >= 50 ? 'text-amber-700' : 'text-red-700'} />
          <The ten="Giờ chờ" giaTri={so(tom.ch)}
            phu={tom.lyDo.length ? `nhiều nhất: ${tenLyDoCho(tom.lyDo[0][0])} ${so(tom.lyDo[0][1])} giờ` : 'không có giờ chờ'} />
          <The ten="Xong trong kỳ" giaTri={`${tom.soHmXong} hạng mục`} phu={tom.xong.length ? theoDonVi(tom.xong) : 'chưa xong hạng mục nào'} />
        </div>
      )}

      {d && (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Kiểu xem báo cáo">
            {TABS.map(x => (
              <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => chonTab(x.id)}
                className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${tab === x.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {x.ten}{x.id === 'hangMuc' && d.hangMuc.length ? ` (${d.hangMuc.length})` : ''}
              </button>
            ))}
          </div>
          {tab === 'ngay' && <TabTheoNgay ds={ds} />}
          {tab === 'to' && <TabTheoTo ds={ds} d={d} />}
          {tab === 'hangMuc' && <TabTheoHangMuc ds={d.hangMuc ?? []} theoTo={ds} />}
          {tab === 'chatLuong' && <TabChatLuong d={d} ds={ds} />}
        </>
      )}
    </div>
  );
}
