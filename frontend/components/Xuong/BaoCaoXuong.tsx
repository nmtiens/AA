import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Download, Search } from 'lucide-react';
import {
  xuongSetupApi, type BaoCaoXuong as BaoCao, type BaoCaoTo, type BaoCaoToNgay, type BaoCaoHangMuc, type BaoCaoNguoi,
  type SoSanhTram, type SoKhopTramNgay, type SoKhopTramTo,
} from '../../services/xuongSetupApi';
import { gioVN, tenCo, hienSl, hhmm, TEN_CA, LY_DO_TAM_NGUNG, type LoaiCa } from '../../services/xuongModel';
import { daNhapDu } from '../../utils/productionMetrics';
import { BTN, KHUNG, BANG, TH_BC as TH, TD_BC as TD } from './xuongDesktopUi';
import * as bang from '../shared/bangBaoCao';
import The from './TheSo';
import { tyLeCoViec, tyLe, so, oSo, tienXuong, cong, duLyDoCho, congSoSanh } from './chiSoXuong';
import { fmtPt } from '../../utils/format';
import KeHoachTuan from './KeHoachTuan';
import { BieuDoNgay, BieuDoTo } from './BieuDoXuong';

// ============================================================================
// BÁO CÁO XƯỞNG / TỔ (docs/designs/xuong-checkin.md). Đầu màn: 5 số sản xuất của kỳ; 4 tab:
//   Theo ngày   — bảng ngày × tổ: công nhân, giờ có mặt / giờ công / giờ chờ, % có việc, nhận / chạy / xong; mở dòng
//                 xem giờ công từng hạng mục, hạng mục nhận / xong, giờ chờ theo lý do
//   Theo tổ     — tổ × ngày tô màu % có việc (xu hướng) + tổng kỳ
//   Theo hạng mục — giờ công qua các công đoạn / tổ, số lượng xong, giờ công trên 1 đơn vị
//   Chất lượng dữ liệu — chỉ số dùng app, cờ cần xem, đối chiếu điểm danh
//   So khớp trạm — chỉ khi có tổ chạy song song có số trạm: giờ công bấm tay (chính thức) so với sổ trạm
// Giờ công = phân bổ theo quân số (không nhân thời gian × số người). Server tính dần ngày còn thiếu (conThieu).
// ============================================================================

const ngayVN = (offset = 0) => gioVN(Date.now() + offset * 86_400_000).ngay;
/** Số nhỏ (giờ công / đơn vị) giữ 2 chữ số lẻ */
const soNho = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 2 : 1 });
const ddmm = (ngay: string) => ngay.split('-').reverse().slice(0, 2).join('/');
const dv = (d: string | null | undefined) => d?.trim() || 'cái';
/** Thời gian chạy: dưới 1 giờ thì ghi phút */
const thoiGian = (h: number) => (h < 1 ? `${Math.round(h * 60)} phút` : `${so(h)} giờ`);

const TEN_LY_DO_CHO: Record<string, string> = {
  nguoi_ranh: 'Người rảnh (khai ít hơn quân số)',
  het_nguoi: 'Không còn ai ở hàng',
  khong_viec: 'Không có hạng mục chạy',
  khac: 'Chưa rõ lý do',
  ...Object.fromEntries(LY_DO_TAM_NGUNG.map(l => [l.ma, `Tạm ngưng: ${l.ten.toLowerCase()}`])),
};
const tenLyDoCho = (k: string) => TEN_LY_DO_CHO[k] ?? k;
const TEN_TRANG_THAI: Record<string, string> = {
  chua_toi: 'Chưa tới',
  cho_nhan: 'Chờ nhận', da_nhan: 'Đã nhận', dang_lam: 'Đang chạy', tam_ngung: 'Tạm ngưng', cho_giao: 'Chờ giao', xong: 'Xong',
};
const MAU_TRANG_THAI: Record<string, string> = {
  dang_lam: 'text-emerald-700', tam_ngung: 'text-amber-700', xong: 'text-slate-500',
};

/** Màu ô % có việc */
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
function LyDoCho({ ds: goc, tong }: { ds: Array<[string, number]>; tong: number }) {
  const ds = duLyDoCho(goc, tong);
  if (!ds.length) return <p className="px-3 py-2 text-sm text-slate-500">Không có giờ chờ việc.</p>;
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
  if (!ds.length) return <p className="px-3 py-2 text-sm text-slate-500">{rong}</p>;
  return (
    <div className="max-h-96 overflow-auto">
      <table className={`${BANG} w-full`}>
        <thead className={bang.thead}><tr><th className={TH}>Hạng mục</th><th className={TH}>Công đoạn</th><th className={TH}>Số lượng</th></tr></thead>
        <tbody>
          {ds.map(h => (
            <tr key={`${h.hex}|${h.congDoanId}`}>
              <td className={TD}><span className="font-semibold tabular-nums">{h.hex}</span> {h.tenHangMuc ?? ''}</td>
              <td className={TD}>{h.tenCongDoan}</td>
              <td className={bang.tdSo}>{hienSl(h.soLuong)} {dv(h.dvt)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className={bang.tfoot}><tr><td className={TD} colSpan={2}>TỔNG</td><td className={bang.tdSo}>{theoDonVi(ds)}</td></tr></tfoot>
      </table>
    </div>
  );
}

function ChiTietNgay({ n }: { n: BaoCaoToNgay }) {
  const lyDo = congLyDo([n.gioChoLyDo]);
  // Khoảng dài (> 2 tháng): máy chủ không gửi chi tiết từng ngày
  if (n.soHangMuc !== undefined) {
    return <p className="bg-slate-50 p-4 text-sm text-slate-600">Chọn khoảng từ 2 tháng trở xuống để xem chi tiết ngày này.</p>;
  }
  return (
    <div className="grid gap-3 bg-slate-50 p-3 rmd:p-4 rxl:grid-cols-2">
      <div className={KHUNG}>
        <TieuDe>Giờ công sản phẩm theo hạng mục ({n.hangMuc.length})</TieuDe>
        {n.hangMuc.length ? (
          <div className="max-h-96 overflow-auto">
            <table className={`${BANG} w-full`}>
              <thead className={bang.thead}><tr>
                <th className={TH}>Hạng mục · công đoạn</th><th className={TH}>Người × giờ</th><th className={TH}>Giờ công SP</th><th className={TH}>Tăng ca</th>
              </tr></thead>
              <tbody>
                {n.hangMuc.map(h => (
                  <tr key={`${h.hex}|${h.congDoanId}`}>
                    <td className={TD}>
                      <span className="font-semibold tabular-nums">{h.hex}</span> {h.tenHangMuc ?? ''}
                      {h.dangChay && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Đang chạy</span>}
                      <div className="text-xs text-slate-500">{h.tenCongDoan}</div>
                    </td>
                    <td className={bang.tdSo}>{h.gioChay > 0 && h.gioNguoiKhai > 0 ? `${moTaNguoi(h.soNguoiMin, h.soNguoiMax)} × ` : ''}{thoiGian(h.gioChay)}</td>
                    <td className={bang.tdSo}>{oSo(h.gioCongThuong + h.gioCongTangCa)}</td>
                    <td className={bang.tdSo}>{oSo(h.gioCongTangCa)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className={bang.tfoot}><tr>
                <td className={TD} colSpan={2}>TỔNG</td>
                <td className={bang.tdSo}>{oSo(cong(n.hangMuc, h => h.gioCongThuong + h.gioCongTangCa))}</td>
                <td className={bang.tdSo}>{oSo(cong(n.hangMuc, h => h.gioCongTangCa))}</td>
              </tr></tfoot>
            </table>
          </div>
        ) : <p className="px-3 py-2 text-sm text-slate-500">Không có hạng mục chạy.</p>}
      </div>
      <div className={KHUNG}><TieuDe>Nhận ({n.nhan.length})</TieuDe><DsSoLuong ds={n.nhan} rong="Không nhận hạng mục nào." /></div>
      <div className={KHUNG}><TieuDe>Xong ({n.xong.length})</TieuDe><DsSoLuong ds={n.xong} rong="Chưa xong hạng mục nào." /></div>
      <div className={KHUNG}>
        <TieuDe>Giờ chờ việc {so(n.gioCho)} giờ</TieuDe>
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
  const tatCa = ds.flatMap(t => t.theoNgay);
  return (
    <div className={KHUNG}>
      {/* Điện thoại: thẻ từng tổ theo ngày */}
      <div className="rmd:hidden">
        {ngays.map(ngay => (
          <div key={ngay}>
            <p className="border-y border-slate-200 bg-slate-50 px-4 py-2 text-base font-semibold text-slate-900">{ddmm(ngay)}/{ngay.slice(0, 4)}</p>
            <ul className="divide-y divide-slate-100">
              {theoNgay.get(ngay)!.sort((a, b) => a.t.ten.localeCompare(b.t.ten)).map(({ t, n }) => {
                const k = `${ngay}|${t.toId}`;
                const m = mo.has(k);
                const qs = moTaQuanSo(n.quanSo);
                const pt = tyLe(n.gioCong, n.gioNguoi);
                return (
                  <li key={k}>
                    <button type="button" className="w-full px-4 py-3 text-left active:bg-slate-50" aria-expanded={m} onClick={() => bat(k)}>
                      <p className="flex items-center gap-1 font-semibold text-slate-800">{m ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{t.ten}
                        {n.co.length > 0 && <AlertTriangle size={14} className="ml-1 text-amber-600" aria-label={n.co.map(tenCo).join(', ')} />}</p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center tabular-nums">
                        <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-xs text-slate-500">Công nhân</p><p className="font-semibold text-slate-800">{qs.chinh ?? '—'}</p></div>
                        <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-xs text-slate-500">Giờ công SP</p><p className="font-semibold text-slate-800">{so(n.gioCong)}</p></div>
                        <div className={`rounded-lg py-1.5 ${mauDung(pt)}`}><p className="text-xs opacity-75">Tỷ lệ có việc</p><p className="font-semibold">{fmtPt(pt)}</p></div>
                      </div>
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-600">
                        {qs.tangCa && <span>Tăng ca {qs.tangCa}</span>}
                        <span>Chờ việc {so(n.gioCho)} giờ</span><span>Nhận {n.soNhan ?? n.nhan.length}</span><span>Chạy {n.soHangMuc ?? n.hangMuc.length}</span>
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
      <table className={`${BANG} hidden w-full min-w-[980px] rmd:table`}>
        <thead className={bang.thead}><tr>
          <th className={TH}>Ngày · tổ</th>
          <th className={`${TH}`}>Công nhân</th>
          <th className={`${TH}`}>Giờ công</th>
          <th className={`${TH}`}>Giờ công sản phẩm</th>
          <th className={`${TH}`}>Giờ chờ việc</th>
          <th className={`${TH}`}>Tỷ lệ có việc</th>
          <th className={`${TH}`}>Nhận</th>
          <th className={`${TH}`}>Chạy</th>
          <th className={TH}>Xong</th>
          <th className={TH} />
        </tr></thead>
        <tbody>
          {ngays.map(ngay => {
            const dong = theoNgay.get(ngay)!.sort((a, b) => a.t.ten.localeCompare(b.t.ten));
            const s = dong.reduce((a, { n }) => ({
              cn: a.cn + (n.quanSo.chinh ?? 0), gn: a.gn + n.gioNguoi, gc: a.gc + n.gioCong, ch: a.ch + n.gioCho,
              nh: a.nh + (n.soNhan ?? n.nhan.length), ch2: a.ch2 + (n.soHangMuc ?? n.hangMuc.length), xo: [...a.xo, ...n.xong],
            }), { cn: 0, gn: 0, gc: 0, ch: 0, nh: 0, ch2: 0, xo: [] as BaoCaoToNgay['xong'] });
            const p = tyLeCoViec(dong.map(x => x.n));
            return (
              <Fragment key={ngay}>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className={TD}>{ddmm(ngay)}/{ngay.slice(0, 4)}
                    {/* Hôm nay: số còn tăng tới hết ca — đừng so với ngày đã xong */}
                    {ngay === ngayVN() && <span className="ml-2 text-xs font-normal text-slate-500">hôm nay, tính đến {hhmm(Date.now())}</span>}</td>
                  <td className={`${TD} text-center tabular-nums`}>{s.cn || ''}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(s.gn)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(s.gc)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(s.ch)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{fmtPt(p)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{s.nh || ''}</td>
                  <td className={`${TD} text-center tabular-nums`}>{s.ch2 || ''}</td>
                  <td className={`${TD} text-center tabular-nums`}>{theoDonVi(s.xo)}</td>
                  <td className={TD} />
                </tr>
                {dong.map(({ t, n }) => {
                  const k = `${ngay}|${t.toId}`;
                  const m = mo.has(k);
                  const qs = moTaQuanSo(n.quanSo);
                  const pt = tyLe(n.gioCong, n.gioNguoi);
                  const dangChay = n.hangMuc.filter(h => h.dangChay).length;
                  return (
                    <Fragment key={k}>
                      <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => bat(k)} aria-expanded={m}>
                        <td className={`${TD} pl-6 font-medium text-slate-800`}>
                          <span className="inline-flex items-center gap-1">{m ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{t.ten}
                            {n.nguon === 'mra' && <span className="rounded border border-violet-200 bg-violet-50 px-1 text-xs font-semibold text-violet-700" title="Số liệu từ MRA cũ (ước tính)">MRA</span>}</span>
                        </td>
                        <td className={`${TD} text-center tabular-nums`}>
                          {qs.chinh !== null ? qs.chinh : n.nguon === 'mra' ? '—' : <span className="text-amber-700">chưa chốt</span>}
                          {qs.tangCa && <div className="text-xs text-slate-500">tăng ca {qs.tangCa}</div>}
                        </td>
                        <td className={`${TD} text-center tabular-nums`}>{oSo(n.gioNguoi)}</td>
                        <td className={`${TD} text-center tabular-nums`}>
                          {oSo(n.gioCong)}
                          {n.gioCongTangCa > 0 && <div className="text-xs text-slate-500">tăng ca {so(n.gioCongTangCa)}</div>}
                        </td>
                        <td className={`${TD} text-center tabular-nums`}>{oSo(n.gioCho)}</td>
                        <td className={`${TD} text-center`}>
                          <span className={`inline-block min-w-12 rounded px-1.5 py-0.5 text-center tabular-nums ${mauDung(pt)}`}>{fmtPt(pt)}</span>
                        </td>
                        <td className={`${TD} text-center tabular-nums`}>{(n.soNhan ?? n.nhan.length) || ''}</td>
                        <td className={`${TD} text-center tabular-nums`}>
                          {(n.soHangMuc ?? n.hangMuc.length) || ''}
                          {dangChay > 0 && <div className="text-xs text-emerald-700">{dangChay} đang chạy</div>}
                        </td>
                        <td className={`${TD} text-center tabular-nums`}>{theoDonVi(n.xong)}</td>
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
        <tfoot className={bang.tfoot}><tr>
          <td className={TD}>TỔNG</td>
          <td className={TD} />
          <td className={bang.tdSo}>{oSo(cong(tatCa, n => n.gioNguoi))}</td>
          <td className={bang.tdSo}>{oSo(cong(tatCa, n => n.gioCong))}</td>
          <td className={bang.tdSo}>{oSo(cong(tatCa, n => n.gioCho))}</td>
          <td className={bang.tdSo}>{fmtPt(tyLeCoViec(tatCa))}</td>
          <td className={bang.tdSo}>{cong(tatCa, n => n.soNhan ?? n.nhan.length) || ''}</td>
          <td className={bang.tdSo}>{cong(tatCa, n => n.soHangMuc ?? n.hangMuc.length) || ''}</td>
          <td className={bang.tdSo}>{theoDonVi(tatCa.flatMap(n => n.xong))}</td>
          <td className={TD} />
        </tr></tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Theo tổ — tổ × ngày (% có việc) + tổng kỳ
// ---------------------------------------------------------------------------
function TabTheoTo({ ds, d }: { ds: BaoCaoTo[]; d: BaoCao }) {
  const [mo, setMo] = useState<Set<number>>(new Set());
  const ngays = [...new Set(ds.flatMap(t => t.theoNgay.map(n => n.ngay)))].sort();
  const tong = ds.reduce((a, t) => ({
    gn: a.gn + t.gioNguoi.thuong + t.gioNguoi.tangCa, gc: a.gc + t.gioCong.thuong + t.gioCong.tangCa,
    gch: a.gch + t.gioCho.thuong + t.gioCho.tangCa, tc: a.tc + t.gioCong.tangCa,
  }), { gn: 0, gc: 0, gch: 0, tc: 0 });
  const pTong = tyLeCoViec(ds.flatMap(t => t.theoNgay));
  const cot = 9 + ngays.length;
  return (
    <div className={KHUNG}>
      <table className={`${BANG} w-full`} style={{ minWidth: 820 + ngays.length * 64 }}>
        <thead className={bang.thead}><tr>
          <th className={`${TH} sticky left-0 z-30 bg-emerald-300`}>Tổ</th>
          {ngays.map(n => <th key={n} className={TH}>{ddmm(n)}</th>)}
          <th className={TH}>Giờ công</th>
          <th className={`${TH}`}>Giờ công sản phẩm</th>
          <th className={`${TH}`}>Giờ chờ việc</th>
          <th className={`${TH}`}>Tỷ lệ có việc</th>
          <th className={`${TH}`}>Chốt quân số</th>
          <th className={`${TH}`}>Đang chạy</th>
          <th className={`${TH}`}>Tạm ngưng</th>
          <th className={`${TH}`}>Chờ nhận</th>
        </tr></thead>
        <tbody>
          {ds.map(t => {
            const gn = t.gioNguoi.thuong + t.gioNguoi.tangCa;
            const gc = t.gioCong.thuong + t.gioCong.tangCa;
            const p = tyLeCoViec(t.theoNgay);
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
                    const pn = n ? tyLe(n.gioCong, n.gioNguoi) : null;
                    return (
                      <td key={ng} className="border-b border-r border-slate-300 px-1 py-1 text-center" title={n ? `Giờ công sản phẩm ${so(n.gioCong)} / giờ công ${so(n.gioNguoi)}` : 'Không có số liệu'}>
                        <span className={`block rounded px-1 py-1 text-xs font-medium tabular-nums ${mauDung(n ? pn : null)}`}>
                          {n ? (fmtPt(pn)) : '·'}
                        </span>
                      </td>
                    );
                  })}
                  <td className={bang.tdSo}>{oSo(gn)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(gc)}{t.gioCong.tangCa > 0 && <div className="text-xs text-slate-500">tăng ca {so(t.gioCong.tangCa)}</div>}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(t.gioCho.thuong + t.gioCho.tangCa)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{fmtPt(p)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{t.ngayCoChay ? `${t.ngayChot}/${t.ngayCoChay}` : ''}</td>
                  <td className={`${TD} text-center tabular-nums`}>{t.dangChay || ''}</td>
                  <td className={`${TD} text-center tabular-nums`}>{t.tamNgung || ''}</td>
                  <td className={`${TD} text-center tabular-nums`}>{t.choNhan || ''}</td>
                </tr>
                {m && <tr><td colSpan={cot} className="p-0"><ChiTietTo t={t} /></td></tr>}
              </Fragment>
            );
          })}
          {!ds.length && <tr><td colSpan={cot} className={`${TD} text-slate-500`}>Chưa có số liệu trong kỳ {ddmm(d.tu)} – {ddmm(d.den)}.</td></tr>}
        </tbody>
        {ds.length > 0 && (
          <tfoot className={bang.tfoot}><tr>
            <td className={`${TD} !left-0 z-[3]`}>TỔNG</td>
            {ngays.map(ng => {
              const ns = ds.flatMap(t => t.theoNgay.filter(n => n.ngay === ng));
              const pn = tyLeCoViec(ns);
              return <td key={ng} className="border-b border-r border-slate-300 px-1 py-1 text-center"><span className={`block rounded px-1 py-1 text-xs tabular-nums ${mauDung(pn)}`}>{fmtPt(pn)}</span></td>;
            })}
            <td className={bang.tdSo}>{oSo(tong.gn)}</td>
            <td className={bang.tdSo}>{oSo(tong.gc)}</td>
            <td className={bang.tdSo}>{oSo(tong.gch)}</td>
            <td className={bang.tdSo}>{fmtPt(pTong)}</td>
            <td className={bang.tdSo}>{cong(ds, t => t.ngayCoChay) ? `${cong(ds, t => t.ngayChot)}/${cong(ds, t => t.ngayCoChay)}` : ''}</td>
            <td className={bang.tdSo}>{d.hienTaiTong.dangChay || ''}</td>
            <td className={bang.tdSo}>{d.hienTaiTong.tamNgung || ''}</td>
            <td className={bang.tdSo}>{d.hienTaiTong.choNhan || ''}</td>
          </tr></tfoot>
        )}
      </table>
    </div>
  );
}

function ChiTietTo({ t }: { t: BaoCaoTo }) {
  const tongCho = t.gioCho.thuong + t.gioCho.tangCa;
  return (
    <div className="grid gap-3 bg-slate-50 p-3 rmd:p-4 rxl:grid-cols-[2fr_1fr]">
      <div className={KHUNG}>
        <TieuDe>Giờ công sản phẩm theo hạng mục (cộng cả kỳ)</TieuDe>
        <div className="max-h-96 overflow-y-auto">
          <table className={`${BANG} w-full`}>
            <thead className={bang.thead}><tr>
              <th className={TH}>Hạng mục · công đoạn</th><th className={`${TH}`}>Giờ chạy</th>
              <th className={`${TH}`}>Giờ công SP thường</th><th className={`${TH}`}>Giờ công SP tăng ca</th>
            </tr></thead>
            <tbody>
              {t.theoHangMuc.map(h => (
                <tr key={`${h.hex}|${h.congDoanId}`} className="border-t border-slate-100">
                  <td className={TD}>
                    <span className="font-medium tabular-nums text-slate-800">{h.hex}</span> {h.tenHangMuc ?? ''}
                    <br /><span className="text-xs text-slate-500">{h.tenCongDoan}{h.tenCongTrinh ? ` · ${h.tenCongTrinh}` : ''}</span>
                  </td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(h.gioChay)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(h.gioCongThuong)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(h.gioCongTangCa)}</td>
                </tr>
              ))}
              {!t.theoHangMuc.length && <tr><td colSpan={4} className={`${TD} text-slate-500`}>Không có hạng mục chạy trong kỳ.</td></tr>}
            </tbody>
            {t.theoHangMuc.length > 0 && (
              <tfoot className={bang.tfoot}><tr>
                <td className={TD}>TỔNG</td>
                <td className={bang.tdSo}>{oSo(cong(t.theoHangMuc, h => h.gioChay))}</td>
                <td className={bang.tdSo}>{oSo(cong(t.theoHangMuc, h => h.gioCongThuong))}</td>
                <td className={bang.tdSo}>{oSo(cong(t.theoHangMuc, h => h.gioCongTangCa))}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>
      <div className={KHUNG}>
        <TieuDe>Giờ chờ việc {so(tongCho)} giờ</TieuDe>
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
/** Số công nhân khai (số nguyên): "7", đổi giữa chừng thì "5–7" */
const moTaNguoi = (min: number, max: number) => (max <= 0 ? '—' : min > 0 && min < max ? `${min}–${max}` : String(max));
/** Số người để chia giờ công: không đổi người thì đúng số đó (tránh lệch làm tròn), đổi giữa chừng thì bình quân */
const nguoiChia = (min: number, max: number, tb: number) => (max > 0 && (min === max || min === 0) ? max : tb);
const gioMoiNguoi = (gioCong: number, nguoi: number) => (nguoi > 0 ? gioCong / nguoi : null);

type NgayHm = { ngay: string; to: string; tenCongDoan: string; soNguoiTb: number; soNguoiMax: number; soNguoiMin: number; gioChay: number; gioCong: number; gioCongTangCa: number };

/** Hạng mục so với kế hoạch: KHSX (đúng / trễ ngày KHNK) và kế hoạch triển khai (đã triển khai, đúng tuyến công đoạn) */
function soKeHoach(h: BaoCaoHangMuc, homNay: string, xuong: string) {
  const kh = h.keHoach;
  let khsx: { chu: string; nhan: string; muc: number };
  if (!kh) khsx = { chu: 'Không có trong kế hoạch tuần (KHSX)', nhan: 'Chưa có KH tuần', muc: 2 };
  else {
    const xong = daNhapDu(kh.giaTriDon ?? 0, kh.nhapKhoLuyKe, false, !!kh.duSlDon);
    const conNgay = kh.ngayKhnk ? Math.round((Date.parse(kh.ngayKhnk) - Date.parse(homNay)) / 86_400_000) : null;
    khsx = {
      chu: `Kế hoạch tuần ${kh.tuan}/${kh.nam}${kh.ngayKhnk ? ` · KHNK ${ddmm(kh.ngayKhnk)}` : ''} · ${tienXuong(kh.kh)}`,
      ...(xong ? { nhan: 'Đã nhập kho đủ', muc: 0 }
        : conNgay === null ? { nhan: 'Chưa có ngày KHNK', muc: 1 }
          : conNgay < 0 ? { nhan: `Quá hạn KH ${-conNgay} ngày`, muc: 3 }
            : { nhan: conNgay === 0 ? 'Hạn KHNK hôm nay' : `Còn ${conNgay} ngày tới KHNK`, muc: conNgay <= 1 ? 2 : 1 }),
    };
  }
  const tk = h.trienKhai;
  const tuyen = tk?.tuyen ?? [];
  // Song song: đánh giá theo TỪNG thành phần (bản cũ: một tuyến không tên)
  const cacTp = tk?.thanhPhan?.length ? tk.thanhPhan : tuyen.length ? [{ ten: '', tuyen }] : [];
  const ngoaiTuyen = cacTp.length ? h.congDoan.filter(c => !cacTp.some(t => t.tuyen.some(x => x.congDoanId === c.congDoanId))) : [];
  // Bỏ qua công đoạn: trong một tuyến, công đoạn sau đã có hàng trong khi công đoạn trước chưa tới
  const coHang = (id: string) => h.congDoan.some(c => c.congDoanId === id && (c.slNhan > 0 || c.gioChay > 0 || c.slXong > 0));
  const boQua = cacTp.flatMap(tp => {
    const xaNhat = tp.tuyen.reduce((m, t, i) => (coHang(t.congDoanId) ? i : m), -1);
    return tp.tuyen.slice(0, Math.max(0, xaNhat)).filter(t => !h.congDoan.some(c => c.congDoanId === t.congDoanId));
  }).filter((t, i, a) => a.findIndex(y => y.congDoanId === t.congDoanId) === i);
  const moTaTuyen = cacTp.map(tp => `${tp.ten ? `${tp.ten}: ` : 'tuyến '}${tp.tuyen.map(t => t.ten).join(' → ')}`).join(' · ');
  const trienKhai = !tk
    ? { chu: 'Chưa triển khai (Quản lý → Triển khai hạng mục) — tổ tự nhận làm', nhan: 'Chưa triển khai', muc: 3 }
    : tk.mra
    ? { chu: `Làm theo MRA cũ · nhận ${hienSl(tk.sl)} ${dv(h.dvt)} (không có tuyến triển khai)`, nhan: 'MRA cũ', muc: 1 }
    : {
      chu: `${tk.xuongChinh && tk.xuongChinh !== xuong ? `Xưởng ${tk.xuongChinh} triển khai` : 'Triển khai'} ${hienSl(tk.sl)} ${dv(h.dvt)}${moTaTuyen ? ` · ${moTaTuyen}` : ''}`,
      ...(ngoaiTuyen.length || boQua.length
        ? { nhan: [ngoaiTuyen.length ? `Ngoài tuyến: ${ngoaiTuyen.map(c => c.tenCongDoan).join(', ')}` : '', boQua.length ? `Bỏ qua: ${boQua.map(t => t.ten).join(', ')}` : ''].filter(Boolean).join(' · '), muc: 2 }
        : { nhan: 'Đúng tuyến', muc: 0 }),
    };
  return { khsx, trienKhai, muc: Math.max(khsx.muc, trienKhai.muc), tuyen };
}
const MAU_MUC = ['bg-emerald-50 text-emerald-800 border-emerald-200', 'bg-sky-50 text-sky-800 border-sky-200',
  'bg-amber-50 text-amber-800 border-amber-200', 'bg-red-50 text-red-800 border-red-200'];

function TabTheoHangMuc({ ds, theoTo, xuong }: { ds: BaoCaoHangMuc[]; theoTo: BaoCaoTo[]; xuong: string }) {
  const [q, setQ] = useState('');
  const [chiLech, setChiLech] = useState(false);
  const homNay = ngayVN();
  const danhGia = useMemo(() => new Map(ds.map(h => [h.hex, soKeHoach(h, homNay, xuong)])), [ds, homNay, xuong]);
  const soLech = ds.filter(h => (danhGia.get(h.hex)?.muc ?? 0) >= 2).length;
  const [mo, setMo] = useState<Set<string>>(new Set());
  const loc = q.trim().toLowerCase();
  const hien = (loc ? ds.filter(h => `${h.hex} ${h.tenHangMuc ?? ''} ${h.tenCongTrinh ?? ''}`.toLowerCase().includes(loc)) : ds)
    .filter(h => !chiLech || (danhGia.get(h.hex)?.muc ?? 0) >= 2);
  // Chi tiết theo ngày của từng hạng mục (từ số liệu ngày × tổ)
  const theoNgayHm = useMemo(() => {
    const m = new Map<string, NgayHm[]>();
    for (const t of theoTo) for (const n of t.theoNgay) for (const h of n.hangMuc) {
      if (!m.has(h.hex)) m.set(h.hex, []);
      m.get(h.hex)!.push({
        ngay: n.ngay, to: t.ten, tenCongDoan: h.tenCongDoan, soNguoiTb: h.gioChay > 0 ? Math.min(h.soNguoiMax || Infinity, h.gioNguoiKhai / h.gioChay) : 0,
        soNguoiMax: h.soNguoiMax, soNguoiMin: h.soNguoiMin, gioChay: h.gioChay, gioCong: h.gioCongThuong + h.gioCongTangCa, gioCongTangCa: h.gioCongTangCa,
      });
    }
    for (const v of m.values()) v.sort((a, b) => b.ngay.localeCompare(a.ngay) || a.tenCongDoan.localeCompare(b.tenCongDoan));
    return m;
  }, [theoTo]);
  const bat = (hex: string) => setMo(s => { const x = new Set(s); if (x.has(hex)) x.delete(hex); else x.add(hex); return x; });
  const [moNgay, setMoNgay] = useState<Set<string>>(new Set());
  const batNgay = (hex: string) => setMoNgay(s => { const x = new Set(s); if (x.has(hex)) x.delete(hex); else x.add(hex); return x; });

  return (
    <div className={KHUNG}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5">
        <label className="flex min-w-64 flex-1 items-center gap-2 rounded-md border border-slate-300 px-2 py-1">
          <Search size={14} className="text-slate-400" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã hạng mục, tên, công trình" className="w-full text-sm outline-none" aria-label="Tìm hạng mục" />
        </label>
        <label className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${soLech ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 text-slate-600'}`}>
          <input type="checkbox" checked={chiLech} onChange={e => setChiLech(e.target.checked)} /> Chỉ hạng mục lệch kế hoạch ({soLech})
        </label>
        <span className="text-sm text-slate-600">{hien.length} hạng mục · {so(hien.reduce((a, h) => a + h.gioCong, 0))} giờ công sản phẩm</span>
      </div>

      <div className="overflow-x-auto">
        <table className={`${BANG} w-full min-w-[980px]`}>
          <thead className={bang.thead}><tr>
            <th className={TH}>Hạng mục</th><th className={TH}>Công trình</th><th className={TH}>Giờ công SP</th>
            <th className={TH}>SL xong</th><th className={TH}>Giờ SP / đơn vị</th><th className={TH}>Kế hoạch tuần</th><th className={TH}>Triển khai</th>
          </tr></thead>
          <tbody>
            {hien.map(h => {
              const m = mo.has(h.hex);
              const moN = moNgay.has(h.hex);
              const g = gioTrenDv(h);
              const ngay = theoNgayHm.get(h.hex) ?? [];
              const dg = danhGia.get(h.hex)!;
              return (
                <Fragment key={h.hex}>
                  <tr className="cursor-pointer hover:bg-slate-50" aria-expanded={m} onClick={() => bat(h.hex)}>
                    <td className={TD}>
                      <span className="inline-flex items-start gap-1">
                        {m ? <ChevronDown size={14} className="mt-1 shrink-0" /> : <ChevronRight size={14} className="mt-1 shrink-0" />}
                        <span><b className="tabular-nums">{h.hex}</b> {h.tenHangMuc ?? ''}</span>
                      </span>
                    </td>
                    <td className={TD}>{h.tenCongTrinh ?? ''}</td>
                    <td className={`${TD} text-center tabular-nums`}>{oSo(h.gioCong)}</td>
                    <td className={`${TD} text-center tabular-nums`}>{h.congDoan.some(c => c.slXong > 0)
                      ? h.congDoan.filter(c => c.slXong > 0).map(c => `${c.tenCongDoan} ${hienSl(c.slXong)}`).join(' · ') + ` ${dv(h.dvt)}`
                      : ''}</td>
                    <td className={`${TD} text-center tabular-nums`}>{g === null ? 'chưa đủ' : soNho(g)}</td>
                    {[dg.khsx, dg.trienKhai].map(x => (
                      <td key={x.chu} className={`${TD} text-center`} title={x.chu}>
                        <span className={`inline-block rounded border px-1.5 py-0.5 text-sm ${MAU_MUC[x.muc]}`}>{x.nhan}</span>
                      </td>
                    ))}
                  </tr>
                  {m && (
                    <tr><td colSpan={7} className={`${TD} bg-slate-50`}>
                      <p className="text-sm text-slate-700">{dg.khsx.chu} · {dg.trienKhai.chu}</p>
{/* Từng công đoạn */}
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
                <table className={`${BANG} w-full min-w-[760px]`}>
                  <thead className={bang.thead}><tr>
                    <th className={TH}>Công đoạn · tổ</th>
                    <th className={`${TH}`}>Công nhân</th>
                    <th className={`${TH}`}>Giờ chạy</th>
                    <th className={`${TH}`}>Giờ công SP / người</th>
                    <th className={`${TH}`}>Tổng giờ công SP</th>
                    <th className={`${TH}`}>SL xong</th>
                    <th className={`${TH}`}>Giờ công SP / {dv(h.dvt)}</th>
                    <th className={TH}>Hiện tại</th>
                  </tr></thead>
                  <tbody>
                    {(() => {
                      const tuyen = danhGia.get(h.hex)?.tuyen ?? [];
                      if (!tuyen.length) return h.congDoan;
                      const vt = (id: string) => { const i = tuyen.findIndex(t => t.congDoanId === id); return i < 0 ? 999 : i; };
                      const chuaToi = tuyen.filter(t => !h.congDoan.some(c => c.congDoanId === t.congDoanId)).map(t => ({
                        congDoanId: t.congDoanId, tenCongDoan: t.ten, to: [] as string[], gioChay: 0, gioCong: 0, gioCongTangCa: 0, slXong: 0,
                        soNguoiTb: 0, soNguoiMax: 0, soNguoiMin: 0, trangThai: 'chua_toi', slNhan: 0, slHoanThanh: 0, slGiaoDen: null, slGiao: null,
                      }));
                      return [...h.congDoan, ...chuaToi].sort((a, b) => vt(a.congDoanId) - vt(b.congDoanId));
                    })().map(c => {
                      const tuyen = danhGia.get(h.hex)?.tuyen ?? [];
                      const ngoaiTuyen = tuyen.length > 0 && !tuyen.some(t => t.congDoanId === c.congDoanId);
                      const gn = gioMoiNguoi(c.gioCong, nguoiChia(c.soNguoiMin, c.soNguoiMax, c.soNguoiTb));
                      return (
                        <tr key={c.congDoanId} className="border-t border-slate-100">
                          <td className={TD}>{c.tenCongDoan}
                            {ngoaiTuyen && <span className="ml-1.5 rounded border border-amber-200 bg-amber-50 px-1 text-xs font-medium text-amber-800">ngoài tuyến</span>}
                            {c.to.some(t => t !== c.tenCongDoan) && <div className="text-xs text-slate-500">tổ {c.to.join(', ')}</div>}</td>
                          <td className={`${TD} text-center tabular-nums`}>{moTaNguoi(c.soNguoiMin, c.soNguoiMax)}</td>
                          <td className={`${TD} text-center tabular-nums`}>{c.gioChay ? thoiGian(c.gioChay) : ''}</td>
                          <td className={`${TD} text-center tabular-nums`}>{gn === null ? '' : soNho(gn)}</td>
                          <td className={`${TD} text-center font-semibold tabular-nums`}>
                            {oSo(c.gioCong)}{c.gioCongTangCa > 0 && <div className="text-xs font-normal text-slate-500">tăng ca {so(c.gioCongTangCa)}</div>}
                          </td>
                          <td className={`${TD} text-center tabular-nums`}>{c.slXong ? hienSl(c.slXong) : ''}</td>
                          <td className={`${TD} text-center tabular-nums`}>{c.slXong > 0 && c.gioCong > 0 ? soNho(c.gioCong / c.slXong) : ''}</td>
                          <td className={`${TD} ${MAU_TRANG_THAI[c.trangThai ?? ''] ?? ''}`}>
                            {c.trangThai ? TEN_TRANG_THAI[c.trangThai] ?? c.trangThai : '—'}
                            {c.trangThai && c.trangThai !== 'chua_toi' && (
                              <div className="text-xs tabular-nums text-slate-500">
                                nhận {hienSl(c.slNhan)} · xong {hienSl(c.slHoanThanh)}
                                {c.slGiao != null && c.slGiao > 0 ? ` · giao ${hienSl(c.slGiao)}` : ''}
                                {c.slGiaoDen != null && c.slGiaoDen > c.slNhan + 0.0005 ? <span className="text-sky-700"> · còn {hienSl(c.slGiaoDen - c.slNhan)} chờ nhận</span> : null}
                                {/* "Xong" mà còn số chưa giao = công đoạn cuối tuyến (xong là hết, không giao tiếp) */}
                                {c.slGiao != null && c.slHoanThanh > c.slGiao + 0.0005
                                  ? c.trangThai === 'xong' ? ' · hết tuyến' : <span className="text-violet-700"> · còn {hienSl(c.slHoanThanh - c.slGiao)} chờ giao</span>
                                  : null}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className={bang.tfoot}><tr>
                    <td className={TD}>TỔNG</td>
                    <td className={TD} />
                    <td className={bang.tdSo}>{thoiGian(cong(h.congDoan, c => c.gioChay))}</td>
                    <td className={TD} />
                    <td className={bang.tdSo}>{oSo(h.gioCong)}</td>
                    <td className={TD} />
                    <td className={bang.tdSo}>{g === null ? '' : soNho(g)}</td>
                    <td className={TD} />
                  </tr></tfoot>
                </table>
              </div>
{/* Theo ngày */}
              {ngay.length > 0 && (
                <button type="button" onClick={() => batNgay(h.hex)} aria-expanded={moN}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
                  {moN ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Theo ngày ({ngay.length})
                </button>
              )}
              {moN && (
                <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-100">
                  <table className={`${BANG} w-full min-w-[640px]`}>
                    <thead className={bang.thead}><tr>
                      <th className={TH}>Ngày</th><th className={TH}>Tổ · công đoạn</th>
                      <th className={`${TH}`}>Công nhân</th><th className={`${TH}`}>Giờ chạy</th>
                      <th className={`${TH}`}>Giờ công SP / người</th><th className={`${TH}`}>Giờ công sản phẩm</th>
                    </tr></thead>
                    <tbody>
                      {ngay.map((x, i) => {
                        const gn = gioMoiNguoi(x.gioCong, nguoiChia(x.soNguoiMin, x.soNguoiMax, x.soNguoiTb));
                        return (
                          <tr key={`${x.ngay}|${x.to}|${x.tenCongDoan}|${i}`} className="border-t border-slate-100">
                            <td className={`${TD} text-center tabular-nums`}>{ddmm(x.ngay)}</td>
                            <td className={TD}>{x.to}<span className="text-xs text-slate-500"> · {x.tenCongDoan}</span></td>
                            <td className={`${TD} text-center tabular-nums`}>{moTaNguoi(x.soNguoiMin, x.soNguoiMax)}</td>
                            <td className={`${TD} text-center tabular-nums`}>{thoiGian(x.gioChay)}</td>
                            <td className={`${TD} text-center tabular-nums`}>{gn === null ? '' : soNho(gn)}</td>
                            <td className={`${TD} text-center tabular-nums`}>{oSo(x.gioCong)}{x.gioCongTangCa > 0 && <span className="text-xs text-slate-500"> (tăng ca {so(x.gioCongTangCa)})</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className={bang.tfoot}><tr>
                      <td className={TD}>TỔNG</td>
                      <td className={TD} />
                      <td className={TD} />
                      <td className={bang.tdSo}>{thoiGian(cong(ngay, x => x.gioChay))}</td>
                      <td className={TD} />
                      <td className={bang.tdSo}>{oSo(cong(ngay, x => x.gioCong))}</td>
                    </tr></tfoot>
                  </table>
                </div>
              )}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {!hien.length && <tr><td colSpan={7} className={`${TD} text-slate-500`}>{ds.length ? 'Không có hạng mục khớp tìm kiếm.' : 'Chưa có hạng mục chạy hoặc xong trong kỳ.'}</td></tr>}
          </tbody>
          {hien.length > 0 && (
            <tfoot className={bang.tfoot}><tr>
              <td className={TD} colSpan={2}>TỔNG</td>
              <td className={bang.tdSo}>{oSo(cong(hien, h => h.gioCong))}</td>
              <td className={TD} colSpan={4} />
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Theo người — chấm công theo người (docs/designs/xuong-cham-cong.md)
// ---------------------------------------------------------------------------
const gioPhut = (p: number) => (p > 0 ? (p >= 60 ? `${Math.floor(p / 60)}g${String(p % 60).padStart(2, '0')}` : `${p}′`) : '');

/** Các ngày 'YYYY-MM-DD' từ tu tới den */
function cacNgay(tu: string, den: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${tu}T00:00:00Z`); t <= Date.parse(`${den}T00:00:00Z`) && out.length < 70; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const thuCua = (ngay: string) => new Date(`${ngay}T12:00:00Z`).getUTCDay();

/** Một ô bảng công: gộp các dòng (người, ngày) — một người có thể ở 2 tổ trong ngày */
function oCong(ds: BaoCaoNguoi['ngay']) {
  const co = ds.filter(x => !x.vang);
  return {
    vang: ds.length > 0 && co.length === 0,
    thuong: co.reduce((a, x) => a + x.coMatThuong, 0), tangCa: co.reduce((a, x) => a + x.coMatTangCa, 0),
    treP: Math.max(0, ...co.map(x => x.treP)), veSomP: Math.max(0, ...co.map(x => x.veSomP)), co: co.length > 0,
  };
}

/** Bảng công kỳ: mỗi người một hàng, mỗi ngày một ô (giờ có mặt, +tăng ca, V = vắng, màu = trễ / về sớm) */
function BangCong({ ds, tu, den }: { ds: BaoCaoNguoi[]; tu: string; den: string }) {
  const ngays = cacNgay(tu, den);
  const oNgay = (ng: string) => cong(ds, n => { const o = oCong(n.ngay.filter(x => x.ngay === ng)); return o.thuong + o.tangCa; });
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className={BANG} style={{ minWidth: 260 + ngays.length * 52 + 300 }}>
        <thead className={bang.thead}><tr>
          <th className={`${TH} sticky left-0 z-30 min-w-[11rem] bg-emerald-300`}>Người</th>
          {ngays.map(n => (
            <th key={n} className={`border-b border-r border-slate-300 px-1 py-1.5 text-center text-xs font-bold ${thuCua(n) === 0 ? 'bg-emerald-200' : 'bg-emerald-300'}`}>
              {n.slice(8, 10)}<div className="font-normal">{THU[thuCua(n)]}</div>
            </th>
          ))}
          <th className={TH}>Ngày công</th>
          <th className={TH}>Giờ thường</th>
          <th className={TH}>Tăng ca</th>
          <th className={TH}>Vắng</th>
          <th className={TH}>Trễ</th>
        </tr></thead>
        <tbody>
          {ds.map(n => (
            <tr key={n.mnv}>
              <td className={`${TD} sticky left-0 z-10 bg-white`}>
                <div className="truncate font-medium text-slate-800">{n.hoTen ?? n.mnv}</div>
                <div className="text-xs tabular-nums text-slate-500">{n.mnv}{n.tenTo ? ` · ${n.tenTo}` : ''}</div>
              </td>
              {ngays.map(ng => {
                const o = oCong(n.ngay.filter(x => x.ngay === ng));
                const goiY = o.vang ? 'Vắng' : o.co ? `Có mặt ${so(o.thuong)} giờ${o.tangCa ? `, tăng ca ${so(o.tangCa)}` : ''}${o.treP ? `, trễ ${o.treP} phút` : ''}${o.veSomP ? `, về sớm ${o.veSomP} phút` : ''}` : '';
                return (
                  <td key={ng} title={goiY} className={`border-b border-r border-slate-300 px-1 py-1 text-center tabular-nums ${
                    o.vang ? 'bg-red-50 font-semibold text-red-700' : o.treP || o.veSomP ? 'bg-amber-50 text-amber-900' : thuCua(ng) === 0 ? 'bg-slate-50' : ''}`}>
                    {o.vang ? 'V' : o.co ? (<>
                      <div>{so(o.thuong)}</div>
                      {o.tangCa > 0 && <div className="text-[0.7rem] text-slate-500">+{so(o.tangCa)}</div>}
                    </>) : null}
                  </td>
                );
              })}
              <td className={bang.tdSo}>{n.soNgay || ''}</td>
              <td className={bang.tdSo}>{oSo(n.coMatThuong)}</td>
              <td className={bang.tdSo}>{oSo(n.coMatTangCa)}</td>
              <td className={`${bang.tdSo} ${n.soNgayVang ? 'text-red-700' : ''}`}>{n.soNgayVang || ''}</td>
              <td className={`${bang.tdSo} ${n.lanTre ? 'text-amber-700' : ''}`}>{n.lanTre || ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className={bang.tfoot}><tr>
          <td className={`${TD} !left-0 z-[3]`}>TỔNG</td>
          {ngays.map(ng => <td key={ng} className="border-b border-r border-slate-300 px-1 py-1 text-center tabular-nums">{oSo(oNgay(ng))}</td>)}
          <td className={bang.tdSo}>{cong(ds, n => n.soNgay) || ''}</td>
          <td className={bang.tdSo}>{oSo(cong(ds, n => n.coMatThuong))}</td>
          <td className={bang.tdSo}>{oSo(cong(ds, n => n.coMatTangCa))}</td>
          <td className={bang.tdSo}>{cong(ds, n => n.soNgayVang ?? 0) || ''}</td>
          <td className={bang.tdSo}>{cong(ds, n => n.lanTre) || ''}</td>
        </tr></tfoot>
      </table>
    </div>
  );
}

function TabTheoNguoi({ ds, tu, den }: { ds: BaoCaoNguoi[]; tu: string; den: string }) {
  const [kieu, setKieu] = useState<'ds' | 'bang'>('ds');
  const [q, setQ] = useState('');
  const [mo, setMo] = useState<Set<string>>(new Set());
  const tim = q.trim().toLowerCase();
  const hien = tim ? ds.filter(n => `${n.mnv} ${n.hoTen ?? ''} ${n.tenTo ?? ''}`.toLowerCase().includes(tim)) : ds;
  const bat = (m: string) => setMo(s => { const x = new Set(s); if (x.has(m)) x.delete(m); else x.add(m); return x; });
  if (!ds.length) {
    return (
      <div className={`${KHUNG} space-y-1 p-4 text-sm text-slate-600`}>
        <p className="font-medium text-slate-800">Chưa có số liệu chấm công theo người trong kỳ.</p>
        <p>Số liệu có khi tổ trưởng điểm danh tên đầu ca và chọn tên người khi bắt đầu hạng mục (app MRA). Danh sách công nhân ở Quản lý → Nhân sự.</p>
      </div>
    );
  }
  return (
    <div className={KHUNG}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5">
        <label className="flex min-w-64 flex-1 items-center gap-2 rounded-md border border-slate-300 px-2 py-1">
          <Search size={14} className="text-slate-400" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã NV, họ tên, tổ" className="w-full text-sm outline-none" aria-label="Tìm người" />
        </label>
        <span className="text-sm text-slate-600">{hien.length} người</span>
        <div className="flex overflow-hidden rounded-md border border-slate-300" role="tablist" aria-label="Kiểu xem chấm công">
          {([['ds', 'Danh sách'], ['bang', 'Bảng công']] as const).map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={kieu === k} onClick={() => setKieu(k)}
              className={`px-3 py-1 text-sm ${kieu === k ? 'bg-slate-900 font-semibold text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{t}</button>
          ))}
        </div>
      </div>
      {kieu === 'bang' ? <BangCong ds={hien} tu={tu} den={den} /> : (<>
      {/* Điện thoại: thẻ từng người */}
      <ul className="divide-y divide-slate-100 rmd:hidden">
        {hien.map(n => {
          const m = mo.has(n.mnv);
          const gc = n.congThuong + n.congTangCa;
          const p = tyLe(gc, n.coMatThuong + n.coMatTangCa);
          return (
            <li key={n.mnv}>
              <button type="button" className="w-full px-4 py-3 text-left active:bg-slate-50" aria-expanded={m} onClick={() => bat(n.mnv)}>
                <p className="flex items-center gap-1 font-semibold text-slate-800">{m ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{n.hoTen ?? n.mnv}</p>
                <p className="pl-5 text-xs tabular-nums text-slate-500">{n.mnv}{n.tenTo ? ` · ${n.tenTo}` : ''}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center tabular-nums">
                  <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-xs text-slate-500">Giờ công</p><p className="font-semibold text-slate-800">{so(n.coMatThuong + n.coMatTangCa)}</p></div>
                  <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-xs text-slate-500">Giờ công SP</p><p className="font-semibold text-slate-800">{so(gc)}</p></div>
                  <div className={`rounded-lg py-1.5 ${mauDung(p)}`}><p className="text-xs opacity-75">Tỷ lệ có việc</p><p className="font-semibold">{fmtPt(p)}</p></div>
                </div>
                <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-slate-600">
                  <span>{n.soNgay} ngày</span>
                  {!!n.soNgayVang && <span className="text-red-700">{n.soNgayVang} vắng</span>}
                  {n.lanTre > 0 && <span className="text-amber-700">{n.lanTre} lần trễ</span>}
                  {n.lanVeSom > 0 && <span className="text-amber-700">{n.lanVeSom} về sớm</span>}
                  <span>Chờ việc {so(n.cho)} giờ</span>
                </p>
              </button>
              {m && (
                <ul className="space-y-1 bg-slate-50 px-4 py-2 text-sm">
                  {n.ngay.map(x => (
                    <li key={`${x.ngay}|${x.toId}`} className="flex flex-wrap gap-x-2">
                      <span className="font-medium tabular-nums">{ddmm(x.ngay)}</span>
                      {x.vang ? <span className="text-red-700">Vắng</span> : (<>
                        <span className="tabular-nums">{x.vao ? hhmm(x.vao) : '—'}–{x.ra ? hhmm(x.ra) : 'hết ca'}</span>
                        {x.treP > 0 && <span className="text-amber-700">trễ {gioPhut(x.treP)}</span>}
                        {x.veSomP > 0 && <span className="text-amber-700">về sớm {gioPhut(x.veSomP)}</span>}
                        <span className="text-slate-600">· {so(x.congThuong + x.congTangCa)} giờ công sản phẩm</span>
                      </>)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <table className={`${BANG} hidden w-full min-w-[980px] rmd:table`}>
        <thead className={bang.thead}><tr>
          <th className={TH}>Người</th><th className={TH}>Tổ</th>
          <th className={`${TH}`}>Ngày có mặt</th>
          <th className={`${TH}`}>Giờ công</th>
          <th className={`${TH}`}>Trong đó tăng ca</th>
          <th className={`${TH}`}>Giờ công sản phẩm</th>
          <th className={`${TH}`}>Giờ chờ việc</th>
          <th className={`${TH}`}>Tỷ lệ có việc</th>
          <th className={`${TH}`}>Trễ / về sớm</th>
        </tr></thead>
        <tbody>
          {hien.map(n => {
            const m = mo.has(n.mnv);
            const coMat = n.coMatThuong + n.coMatTangCa;
            const gc = n.congThuong + n.congTangCa;
            const p = tyLe(gc, coMat);
            return (
              <Fragment key={n.mnv}>
                <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" aria-expanded={m} onClick={() => bat(n.mnv)}>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-800">{m ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{n.hoTen ?? n.mnv}</span>
                    <div className="pl-5 text-xs tabular-nums text-slate-500">{n.mnv}{n.chucVu ? ` · ${n.chucVu}` : ''}</div>
                  </td>
                  <td className={TD}>{n.tenTo ?? '—'}</td>
                  <td className={`${TD} text-center tabular-nums`}>{n.soNgay || ''}{n.soNgayVang ? <div className="text-xs text-red-700">{n.soNgayVang} vắng</div> : null}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(coMat)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.coMatTangCa)}</td>
                  <td className={`${TD} text-center font-semibold tabular-nums`}>{oSo(gc)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.cho)}</td>
                  <td className={`${TD} text-center`}><span className={`inline-block min-w-12 rounded px-1.5 py-0.5 text-center tabular-nums ${mauDung(p)}`}>{fmtPt(p)}</span></td>
                  <td className={`${TD} text-center tabular-nums ${n.lanTre || n.lanVeSom ? 'text-amber-700' : ''}`}>{n.lanTre || n.lanVeSom ? `${n.lanTre} / ${n.lanVeSom}` : ''}</td>
                </tr>
                {m && (
                  <tr><td colSpan={9} className="bg-slate-50 p-3">
                    <div className="overflow-x-auto rounded-lg bg-white">
                      <table className={`${BANG} w-full min-w-[860px]`}>
                        <thead className={bang.thead}><tr>
                          <th className={TH}>Ngày</th><th className={TH}>Tổ</th><th className={TH}>Vào – ra</th>
                          <th className={`${TH}`}>Trễ</th><th className={`${TH}`}>Về sớm</th>
                          <th className={`${TH}`}>Giờ công</th><th className={`${TH}`}>Giờ công SP</th><th className={`${TH}`}>Chờ</th>
                          <th className={TH}>Hạng mục</th>
                        </tr></thead>
                        <tbody>
                          {n.ngay.map(x => (
                            <tr key={`${x.ngay}|${x.toId}`} className="border-t border-slate-100">
                              <td className={`${TD} text-center tabular-nums`}>{ddmm(x.ngay)}</td>
                              <td className={TD}>{x.tenTo}</td>
                              <td className={`${TD} tabular-nums ${x.vang ? 'font-semibold text-red-700' : ''}`}>{x.vang ? 'Vắng' : `${x.vao ? hhmm(x.vao) : '—'} – ${x.ra ? hhmm(x.ra) : x.vao ? 'hết ca' : '—'}`}</td>
                              <td className={`${TD} text-center tabular-nums ${x.treP ? 'text-amber-700' : ''}`}>{gioPhut(x.treP)}</td>
                              <td className={`${TD} text-center tabular-nums ${x.veSomP ? 'text-amber-700' : ''}`}>{gioPhut(x.veSomP)}</td>
                              <td className={`${TD} text-center tabular-nums`}>{oSo(x.coMatThuong + x.coMatTangCa)}{x.coMatTangCa > 0 && <div className="text-xs text-slate-500">tăng ca {so(x.coMatTangCa)}</div>}</td>
                              <td className={`${TD} text-center tabular-nums`}>{oSo(x.congThuong + x.congTangCa)}</td>
                              <td className={`${TD} text-center tabular-nums`}>{oSo(x.cho)}</td>
                              <td className={`${TD} text-xs`}>
                                {x.hangMuc.length ? x.hangMuc.map(h => (
                                  <div key={`${h.hex}|${h.congDoanId}`}><span className="tabular-nums font-medium">{h.hex}</span> {h.tenHangMuc ?? ''} · {h.tenCongDoan} · <b className="tabular-nums">{so(h.gio)} giờ</b></div>
                                )) : <span className="text-slate-500">Không gắn hạng mục</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className={bang.tfoot}><tr>
                          <td className={TD} colSpan={3}>TỔNG</td>
                          <td className={bang.tdSo}>{gioPhut(cong(n.ngay, x => x.treP))}</td>
                          <td className={bang.tdSo}>{gioPhut(cong(n.ngay, x => x.veSomP))}</td>
                          <td className={bang.tdSo}>{oSo(coMat)}</td>
                          <td className={bang.tdSo}>{oSo(gc)}</td>
                          <td className={bang.tdSo}>{oSo(n.cho)}</td>
                          <td className={TD} />
                        </tr></tfoot>
                      </table>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot className={bang.tfoot}><tr>
          <td className={TD} colSpan={2}>TỔNG</td>
          <td className={bang.tdSo}>{cong(hien, n => n.soNgay) || ''}</td>
          <td className={bang.tdSo}>{oSo(cong(hien, n => n.coMatThuong + n.coMatTangCa))}</td>
          <td className={bang.tdSo}>{oSo(cong(hien, n => n.coMatTangCa))}</td>
          <td className={bang.tdSo}>{oSo(cong(hien, n => n.congThuong + n.congTangCa))}</td>
          <td className={bang.tdSo}>{oSo(cong(hien, n => n.cho))}</td>
          <td className={bang.tdSo}>{fmtPt(tyLe(cong(hien, n => n.congThuong + n.congTangCa), cong(hien, n => n.coMatThuong + n.coMatTangCa)))}</td>
          <td className={bang.tdSo}>{cong(hien, n => n.lanTre)} / {cong(hien, n => n.lanVeSom)}</td>
        </tr></tfoot>
      </table>
      </>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab So khớp trạm — tổ chạy song song: giờ công bấm tay (chính thức) so với sổ trạm, theo tổ / ngày / người
// ---------------------------------------------------------------------------
/** Chênh = trạm − bấm tay: "+1,5 (12%)"; đỏ khi máy chủ đánh dấu chênh lớn */
function OChenh({ s }: { s: SoSanhTram }) {
  const dau = s.chenh > 0 ? '+' : '';
  const nho = Math.abs(s.chenh) < 0.05;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 tabular-nums ${s.lon ? 'bg-red-100 font-medium text-red-900' : ''}`}>
      {nho ? '' : `${dau}${so(s.chenh)}`}{s.phanTram !== null && !nho ? ` (${dau}${fmtPt(s.phanTram)})` : ''}
    </span>
  );
}
const gioHai = (a: number | null, b: number | null) => `${a ? hhmm(a) : '—'} / ${b ? hhmm(b) : '—'}`;
const COT_SO_KHOP = (
  <>
    <th className={TH}>Giờ công bấm tay</th><th className={`${TH}`}>Theo trạm</th><th className={`${TH}`}>Chênh</th>
    <th className={TH}>Giờ công SP bấm tay</th><th className={`${TH}`}>Theo trạm</th><th className={`${TH}`}>Chênh</th>
  </>
);
const OSoKhop = ({ gc, sp }: { gc: SoSanhTram; sp: SoSanhTram }) => (
  <>
    <td className={bang.tdSo}>{oSo(gc.chinhThuc)}</td>
    <td className={`${TD} text-center tabular-nums`}>{oSo(gc.tram)}</td>
    <td className={`${TD} text-center`}><OChenh s={gc} /></td>
    <td className={bang.tdSo}>{oSo(sp.chinhThuc)}</td>
    <td className={`${TD} text-center tabular-nums`}>{oSo(sp.tram)}</td>
    <td className={`${TD} text-center`}><OChenh s={sp} /></td>
  </>
);

function SoKhopTheoNguoi({ n }: { n: SoKhopTramNgay }) {
  if (!n.theoNguoi.length) return <p className="bg-slate-50 px-4 py-2 text-sm text-slate-500">Không có số từng người (tổ không điểm danh / khai tên, hoặc khoảng xem dài hơn 2 tháng).</p>;
  return (
    <div className="bg-slate-50 p-3">
      <div className={KHUNG}>
        <table className={`${BANG} w-full min-w-[900px]`}>
          <thead className={bang.thead}><tr>
            <th className={TH}>Người</th><th className={TH}>Vào (bấm tay / trạm)</th><th className={TH}>Ra (bấm tay / trạm)</th>{COT_SO_KHOP}
          </tr></thead>
          <tbody>
            {n.theoNguoi.map(x => (
              <tr key={x.mnv} className="border-t border-slate-100">
                <td className={TD}><span className="font-medium text-slate-800">{x.hoTen ?? x.mnv}</span>{x.hoTen && <span className="ml-1 text-xs text-slate-500">{x.mnv}</span>}</td>
                <td className={bang.tdSo}>{gioHai(x.vao.chinhThuc, x.vao.tram)}</td>
                <td className={bang.tdSo}>{gioHai(x.ra.chinhThuc, x.ra.tram)}</td>
                <OSoKhop gc={x.gioCong} sp={x.gioCongSp} />
              </tr>
            ))}
          </tbody>
          <tfoot className={bang.tfoot}><tr>
            <td className={TD} colSpan={3}>TỔNG</td>
            <OSoKhop gc={congSoSanh(n.theoNguoi.map(x => x.gioCong))} sp={congSoSanh(n.theoNguoi.map(x => x.gioCongSp))} />
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

function TabSoKhopTram({ ds }: { ds: SoKhopTramTo[] }) {
  const [mo, setMo] = useState<Set<string>>(new Set());
  const bat = (k: string) => setMo(s => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">Đỏ: lệch từ 10% và từ 0.5 giờ.</p>
      {ds.map(t => (
        <div key={t.toId} className={KHUNG}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-3">
            <p className="text-base font-semibold text-slate-900">{t.ten}</p>
            <p className={`text-sm ${t.soNgayLon ? 'text-red-700' : 'text-emerald-700'}`}>
              {t.soNgay} ngày song song · {t.soNgayLon ? `${t.soNgayLon} ngày chênh lớn` : 'không ngày nào chênh lớn'}
            </p>
          </div>
          <table className={`${BANG} w-full min-w-[860px]`}>
            <thead className={bang.thead}><tr>
              <th className={TH}>Ngày</th><th className={`${TH}`}>Người (bấm tay / trạm)</th>{COT_SO_KHOP}
            </tr></thead>
            <tbody>
              {t.theoNgay.map(n => {
                const k = `${t.toId}|${n.ngay}`;
                const m = mo.has(k);
                return (
                  <Fragment key={k}>
                    <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" aria-expanded={m} onClick={() => bat(k)}>
                      <td className={`${TD} tabular-nums`}>
                        <span className="inline-flex items-center gap-1">{m ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{ddmm(n.ngay)} {THU[thuCua(n.ngay)]}</span>
                        {n.khongCoTram && <div className="text-xs text-amber-700">trạm không ghi được gì</div>}
                      </td>
                      <td className={`${TD} text-center tabular-nums`}>{n.soNguoi.chinhThuc || '—'} / {n.soNguoi.tram || '—'}</td>
                      <OSoKhop gc={n.gioCong} sp={n.gioCongSp} />
                    </tr>
                    {m && <tr><td colSpan={8} className="p-0"><SoKhopTheoNguoi n={n} /></td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
            {t.theoNgay.length > 0 && (
              <tfoot className={bang.tfoot}><tr>
                <td className={TD}>TỔNG</td><td className={TD} />
                <OSoKhop gc={t.gioCong} sp={t.gioCongSp} />
              </tr></tfoot>
            )}
          </table>
        </div>
      ))}
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
  const lech = tyLe(Math.abs(tongApp - tongCc), tongCc);
  return (
    <div className={KHUNG}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-3">
        <p className="text-base font-semibold text-slate-900">Đối chiếu chấm công (Dữ liệu Điểm danh, cả xưởng)</p>
        {lech !== null
          ? <p className={`text-sm ${lech <= 10 ? 'text-emerald-700' : 'text-amber-700'}`}>
              Giờ công (app) lệch {fmtPt(lech)} so với giờ công chấm công ({caHai.length} ngày có cả hai) — {lech <= 10 ? 'đạt' : 'chưa đạt'} mục tiêu ≤ 10%
            </p>
          : <p className="text-sm text-slate-600">
              Chưa có ngày nào có cả số điểm danh và số app trong kỳ{cc.moiNhat ? ` — điểm danh mới nhất ${ddmm(cc.moiNhat)}/${cc.moiNhat.slice(0, 4)}` : ' — bảng điểm danh chưa có số của xưởng này'}.
            </p>}
      </div>
      {coDiemDanh && (
        <div className="max-h-80 overflow-auto">
          <table className={`${BANG} w-full min-w-[860px]`}>
            <thead className={bang.thead}><tr>
              <th className={TH}>Ngày</th>
              <th className={`${TH}`}>Công nhân (điểm danh)</th><th className={`${TH}`}>Quân số chốt (app)</th>
              <th className={`${TH}`}>Giờ hành chính (điểm danh)</th><th className={`${TH}`}>Giờ thường (app)</th>
              <th className={`${TH}`}>Giờ tăng ca (điểm danh)</th><th className={`${TH}`}>Giờ tăng ca (app)</th>
            </tr></thead>
            <tbody>
              {ds.map(n => (
                <tr key={n.ngay} className="border-t border-slate-100">
                  <td className={`${TD} text-center tabular-nums`}>{ddmm(n.ngay)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.congNhan)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.quanSoApp)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.gioHc)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.gioThuongApp)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.gioTc)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.gioTangCaApp)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className={bang.tfoot}><tr>
              <td className={TD}>TỔNG</td>
              <td className={TD} />
              <td className={TD} />
              <td className={bang.tdSo}>{oSo(cong(ds, n => n.gioHc))}</td>
              <td className={bang.tdSo}>{oSo(cong(ds, n => n.gioThuongApp))}</td>
              <td className={bang.tdSo}>{oSo(cong(ds, n => n.gioTc))}</td>
              <td className={bang.tdSo}>{oSo(cong(ds, n => n.gioTangCaApp))}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function TabChatLuong({ d, ds }: { d: BaoCao; ds: BaoCaoTo[] }) {
  const cs = d.chiSo;
  const pNk = tyLe(cs.nhatKy.du, cs.nhatKy.tong);
  const pChot = tyLe(cs.chotQuanSo.ngayChot, cs.chotQuanSo.ngayCoChay);
  const pGui = tyLe(cs.guiTrong1Gio.nhanh, cs.guiTrong1Gio.tong);
  const demCo = new Map<string, Array<{ ngay: string; to: string }>>();
  for (const t of ds) for (const n of t.theoNgay) for (const c of n.co) {
    if (!demCo.has(c)) demCo.set(c, []);
    demCo.get(c)!.push({ ngay: n.ngay, to: t.ten });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rxl:grid-cols-4">
        <ChiSo ten="Nhật ký đủ Bắt đầu và Hoàn thành" giaTri={fmtPt(pNk)}
          phu={`${cs.nhatKy.du}/${cs.nhatKy.tong} công đoạn xong có ghi lúc bắt đầu (tổ trạm: quét vào hàng), mục tiêu ≥ 90% (MRA 85%)`} dat={pNk === null ? null : pNk >= 90} />
        <ChiSo ten="Ngày-tổ có chốt quân số" giaTri={fmtPt(pChot)}
          phu={`${cs.chotQuanSo.ngayChot}/${cs.chotQuanSo.ngayCoChay} ngày có hạng mục chạy, mục tiêu ≥ 90%`} dat={pChot === null ? null : pChot >= 90} />
        <ChiSo ten="Thao tác tới máy chủ trong 1 giờ" giaTri={fmtPt(pGui)}
          phu={`${cs.guiTrong1Gio.nhanh}/${cs.guiTrong1Gio.tong} thao tác, mục tiêu ≥ 95%`} dat={pGui === null ? null : pGui >= 95} />
        <ChiSo ten="Ngày-tổ khai vượt quân số" giaTri={String(cs.khaiVuotQuanSo)} phu="Theo dõi, không đặt mục tiêu" dat={null} />
      </div>
      <div className={KHUNG}>
        <TieuDe>Cờ theo ngày-tổ</TieuDe>
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
    'Giờ công': n.gioNguoi, 'Giờ công sản phẩm': n.gioCong, 'Giờ công SP tăng ca': n.gioCongTangCa, 'Giờ chờ việc': n.gioCho,
    'Tỷ lệ có việc %': tyLe(n.gioCong, n.gioNguoi), 'Số hạng mục nhận': n.soNhan ?? n.nhan.length, 'Số hạng mục chạy': n.soHangMuc ?? n.hangMuc.length,
    'Xong': theoDonVi(n.xong), 'Cờ': n.co.map(tenCo).join(', '),
  })));
  them('Hang muc theo ngay', dong.flatMap(({ t, n }) => n.hangMuc.map(h => ({
    'Ngày': n.ngay, 'Tổ': t.ten, 'Mã hạng mục': h.hex, 'Tên hạng mục': h.tenHangMuc, 'Công đoạn': h.tenCongDoan,
    'Công nhân': moTaNguoi(h.soNguoiMin, h.soNguoiMax),
    'Giờ chạy': h.gioChay, 'Giờ công SP thường': h.gioCongThuong, 'Giờ công SP tăng ca': h.gioCongTangCa, 'Đang chạy': h.dangChay ? 'x' : '',
  }))));
  them('Nhan - Xong', dong.flatMap(({ t, n }) => [
    ...n.nhan.map(h => ({ 'Ngày': n.ngay, 'Tổ': t.ten, 'Loại': 'Nhận', 'Mã hạng mục': h.hex, 'Tên hạng mục': h.tenHangMuc, 'Công đoạn': h.tenCongDoan, 'Số lượng': h.soLuong, 'Đơn vị': dv(h.dvt) })),
    ...n.xong.map(h => ({ 'Ngày': n.ngay, 'Tổ': t.ten, 'Loại': 'Xong', 'Mã hạng mục': h.hex, 'Tên hạng mục': h.tenHangMuc, 'Công đoạn': h.tenCongDoan, 'Số lượng': h.soLuong, 'Đơn vị': dv(h.dvt) })),
  ]));
  them('Gio cho', dong.flatMap(({ t, n }) => Object.entries(n.gioChoLyDo).map(([k, v]) => ({ 'Ngày': n.ngay, 'Tổ': t.ten, 'Lý do': tenLyDoCho(k), 'Giờ chờ việc': v }))));
  them('Theo to', ds.map(t => {
    const gn = t.gioNguoi.thuong + t.gioNguoi.tangCa; const gc = t.gioCong.thuong + t.gioCong.tangCa;
    return {
      'Tổ': t.ten, 'Giờ công': gn, 'Giờ công sản phẩm': gc, 'Giờ công SP tăng ca': t.gioCong.tangCa, 'Giờ chờ việc': t.gioCho.thuong + t.gioCho.tangCa,
      'Tỷ lệ có việc %': tyLeCoViec(t.theoNgay), 'Ngày chốt quân số': `${t.ngayChot}/${t.ngayCoChay}`, 'Đang chạy': t.dangChay, 'Tạm ngưng': t.tamNgung, 'Chờ nhận': t.choNhan,
    };
  }));
  them('Theo hang muc', d.hangMuc.flatMap(h => h.congDoan.map(c => ({
    'Mã hạng mục': h.hex, 'Tên hạng mục': h.tenHangMuc, 'Công trình': h.tenCongTrinh, 'Đơn vị': dv(h.dvt), 'SL đơn hàng': h.soLuongDonHang,
    'Công đoạn': c.tenCongDoan, 'Tổ': c.to.join(', '), 'Công nhân': moTaNguoi(c.soNguoiMin, c.soNguoiMax),
    'Giờ chạy': c.gioChay, 'Giờ công SP / người': (() => { const g = gioMoiNguoi(c.gioCong, nguoiChia(c.soNguoiMin, c.soNguoiMax, c.soNguoiTb)); return g === null ? null : Math.round(g * 100) / 100; })(),
    'Giờ công sản phẩm': c.gioCong, 'Giờ công SP tăng ca': c.gioCongTangCa,
    'SL xong trong kỳ': c.slXong, 'Giờ công SP / đơn vị': c.slXong > 0 && c.gioCong > 0 ? Math.round((c.gioCong / c.slXong) * 100) / 100 : null,
    'Trạng thái': c.trangThai ? TEN_TRANG_THAI[c.trangThai] ?? c.trangThai : '', 'Đã xong / đã nhận': `${c.slHoanThanh} / ${c.slNhan}`,
  }))));
  const nguoi = d.theoNguoi ?? [];
  if (nguoi.length) {
    them('Cham cong theo ngay', nguoi.flatMap(n => [...n.ngay].reverse().map(x => ({
      'Ngày': x.ngay, 'Mã NV': n.mnv, 'Họ tên': n.hoTen, 'Tổ': x.tenTo,
      'Giờ vào': x.vang ? 'Vắng' : x.vao ? hhmm(x.vao) : '', 'Giờ ra': x.ra ? hhmm(x.ra) : x.vao ? 'hết ca' : '',
      'Trễ (phút)': x.treP || null, 'Về sớm (phút)': x.veSomP || null,
      'Giờ công': x.coMatThuong + x.coMatTangCa, 'Trong đó tăng ca': x.coMatTangCa, 'Giờ công sản phẩm': Math.round((x.congThuong + x.congTangCa) * 100) / 100,
      'Giờ chờ việc': x.cho, 'Hạng mục': x.hangMuc.map(h => `${h.hex} (${h.tenCongDoan}) ${h.gio}g`).join('; '),
    }))));
    const ngays = cacNgay(d.tu, d.den);
    them('Bang cong', nguoi.map(n => {
      const dong: Record<string, unknown> = { 'Mã NV': n.mnv, 'Họ tên': n.hoTen, 'Tổ': n.tenTo };
      for (const ng of ngays) {
        const o = oCong(n.ngay.filter(x => x.ngay === ng));
        dong[`${ddmm(ng)} ${THU[thuCua(ng)]}`] = o.vang ? 'V' : o.co ? Math.round((o.thuong + o.tangCa) * 100) / 100 : '';
      }
      return { ...dong, 'Ngày công': n.soNgay, 'Giờ thường': n.coMatThuong, 'Giờ tăng ca': n.coMatTangCa, 'Ngày vắng': n.soNgayVang ?? 0, 'Lần trễ': n.lanTre, 'Lần về sớm': n.lanVeSom };
    }));
    them('Tong hop nguoi', nguoi.map(n => ({
      'Mã NV': n.mnv, 'Họ tên': n.hoTen, 'Tổ': n.tenTo, 'Chức vụ': n.chucVu, 'Ngày có mặt': n.soNgay, 'Ngày vắng': n.soNgayVang ?? 0,
      'Giờ công (thường)': n.coMatThuong, 'Giờ tăng ca': n.coMatTangCa, 'Giờ công sản phẩm': Math.round((n.congThuong + n.congTangCa) * 100) / 100,
      'Giờ chờ việc': n.cho, 'Số lần trễ': n.lanTre, 'Số lần về sớm': n.lanVeSom,
    })));
  }
  // So khớp trạm (tổ chạy song song): số chính thức = bấm tay, theo trạm chỉ để so
  const soKhop = d.soKhopTram ?? [];
  if (soKhop.length) {
    const cot = (ten: string, s: SoSanhTram) => ({ [`${ten} bấm tay`]: s.chinhThuc, [`${ten} theo trạm`]: s.tram, [`${ten} chênh`]: s.chenh, [`${ten} chênh %`]: s.phanTram });
    them('So khop tram', soKhop.flatMap(t => [...t.theoNgay].reverse().map(n => ({
      'Ngày': n.ngay, 'Tổ': t.ten, 'Người bấm tay': n.soNguoi.chinhThuc, 'Người theo trạm': n.soNguoi.tram,
      ...cot('Giờ công', n.gioCong), ...cot('Giờ công SP', n.gioCongSp),
      'Chênh lớn': n.gioCong.lon || n.gioCongSp.lon ? 'x' : '', 'Ghi chú': n.khongCoTram ? 'Trạm không ghi được gì' : '',
    }))));
    them('So khop tram theo nguoi', soKhop.flatMap(t => [...t.theoNgay].reverse().flatMap(n => n.theoNguoi.map(x => ({
      'Ngày': n.ngay, 'Tổ': t.ten, 'Mã NV': x.mnv, 'Họ tên': x.hoTen,
      'Vào bấm tay': x.vao.chinhThuc ? hhmm(x.vao.chinhThuc) : '', 'Vào theo trạm': x.vao.tram ? hhmm(x.vao.tram) : '',
      'Ra bấm tay': x.ra.chinhThuc ? hhmm(x.ra.chinhThuc) : '', 'Ra theo trạm': x.ra.tram ? hhmm(x.ra.tram) : '',
      ...cot('Giờ công', x.gioCong), ...cot('Giờ công SP', x.gioCongSp),
      'Chênh lớn': x.gioCong.lon || x.gioCongSp.lon ? 'x' : '',
    })))));
  }
  XLSX.writeFile(wb, `bao_cao_xuong_${d.xuong}_${d.tu}_${d.den}.xlsx`);
}

// ---------------------------------------------------------------------------
type Tab = 'keHoach' | 'ngay' | 'to' | 'hangMuc' | 'nguoi' | 'chatLuong' | 'soKhop';
const TABS: Array<{ id: Tab; ten: string }> = [
  { id: 'keHoach', ten: 'Kế hoạch & phân tích' }, { id: 'ngay', ten: 'Theo ngày' }, { id: 'to', ten: 'Theo tổ' }, { id: 'hangMuc', ten: 'Theo hạng mục' }, { id: 'nguoi', ten: 'Theo người' },
  { id: 'chatLuong', ten: 'Chất lượng dữ liệu' },
  // Chỉ hiện khi kỳ đang xem có tổ chạy song song có số trạm
  { id: 'soKhop', ten: 'So khớp trạm' },
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
    // Khoảng quá dài / ngược: báo ngay, không giữ số của khoảng trước (trước vẫn hiện số cũ nên tưởng "không đổi")
    const soNgayChon = (Date.parse(den) - Date.parse(tu)) / 86_400_000;
    if (!(soNgayChon >= 0 && soNgayChon <= 185)) {
      setLoi(soNgayChon < 0 ? '"Từ" phải trước "đến".' : `Khoảng đang chọn ${Math.round(soNgayChon) + 1} ngày — tối đa 186 ngày (khoảng 6 tháng). Chọn lại "Từ" / "đến".`);
      setD(null); setDang(false); return;
    }
    // Server tính dần các ngày còn thiếu: gọi lại tới khi đủ (tối đa 20 lượt)
    for (let i = 0; i < 20; i++) {
      const r = await xuongSetupApi.baoCao(xuong, tu, den);
      if (id !== lan.current) return;
      if (!r.ok) { setLoi(r.message); setD(null); break; }
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
    // Công nhân / ngày: chỉ ngày có số công nhân (ngày MRA không có điểm danh thì không có)
    // Hôm nay chưa điểm danh xong thì không cộng vào trung bình, trừ khi kỳ chỉ có hôm nay
    const coSo = ns.filter(n => (n.quanSo.chinh ?? 0) > 0);
    const daXong = coSo.filter(n => n.ngay < homNay);
    const tinhCn = daXong.length ? daXong : coSo;
    const boHomNay = tinhCn.length < coSo.length;
    const soNgay = new Set(tinhCn.map(n => n.ngay)).size;
    const cn = tinhCn.reduce((a, n) => a + (n.quanSo.chinh ?? 0), 0);
    const coMra = ns.some(n => n.nguon === 'mra');
    const gn = ns.reduce((a, n) => a + n.gioNguoi, 0);
    const gc = ns.reduce((a, n) => a + n.gioCong, 0);
    const tc = ns.reduce((a, n) => a + n.gioCongTangCa, 0);
    const ch = ns.reduce((a, n) => a + n.gioCho, 0);
    const lyDo = congLyDo(ns.map(n => n.gioChoLyDo ?? {}));
    const xong = ns.flatMap(n => n.xong);
    return { soNgay, boHomNay, cnTb: soNgay ? cn / soNgay : 0, gn, gc, coMra, tc, ch, lyDo, xong, soHmXong: new Set(xong.map(x => x.hex)).size };
  }, [ds, homNay]);
  const pDung = tyLeCoViec(ds.flatMap(t => t.theoNgay));
  const soKhop = d?.soKhopTram ?? [];
  const tabs = TABS.filter(x => x.id !== 'soKhop' || soKhop.length);
  // Tab đã nhớ là So khớp mà kỳ này không có tổ song song: về Theo ngày
  const tabHien = tabs.some(x => x.id === tab) ? tab : 'ngay';

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
        {/* Chọn nhanh một tháng (vd các tháng thuộc giai đoạn MRA cũ 04/2025 – 02/2026) */}
        <label className="flex items-center gap-1.5 text-sm text-slate-700">Tháng
          <input type="month" aria-label="Chọn tháng" max={homNay.slice(0, 7)}
            onChange={e => {
              const v = e.target.value; if (!v) return;
              const [y, m] = v.split('-').map(Number);
              const cuoi = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
              chon(`${v}-01`, cuoi < homNay ? cuoi : homNay);
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
        </label>
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

      {/* Tab Kế hoạch & phân tích có số riêng theo tuần — ẩn 5 thẻ của khoảng ngày để khỏi lẫn */}
      {d && tab !== 'keHoach' && (
        <div className="grid grid-cols-2 gap-3 rmd:grid-cols-3 rxl:grid-cols-5">
          <The ten="Công nhân / ngày" giaTri={tom.soNgay ? so(tom.cnTb) : '—'} phu={`${tom.soNgay} ngày có số liệu${tom.boHomNay ? ', chưa tính hôm nay' : ''} · quân số chốt ca chính`} />
          <The ten="Giờ công sản phẩm" giaTri={so(tom.gc)} phu={`trên ${so(tom.gn)} giờ công${tom.tc > 0 ? ` · tăng ca ${so(tom.tc)}` : ''}${den === homNay ? ` · hôm nay tính đến ${hhmm(Date.now())}` : ''}`} />
          <The ten="Tỷ lệ có việc" giaTri={fmtPt(pDung)} phu="giờ công sản phẩm ÷ giờ công, mục tiêu ≥ 80%"
            mau={pDung === null ? undefined : pDung >= 80 ? 'text-emerald-700' : pDung >= 50 ? 'text-amber-700' : 'text-red-700'} />
          <The ten="Giờ chờ việc" giaTri={so(tom.ch)}
            phu={tom.lyDo.length
              ? `${tom.gn ? `${fmtPt(tyLe(tom.ch, tom.gn))} giờ công · ` : ''}nhiều nhất: ${tenLyDoCho(tom.lyDo[0][0])} ${so(tom.lyDo[0][1])} giờ`
              : tom.ch > 0 ? (tom.coMra ? 'MRA cũ không ghi lý do chờ' : 'chưa rõ lý do') : 'không có giờ chờ việc'} />
          <The rong ten="Hạng mục có công đoạn xong" giaTri={`${tom.soHmXong} hạng mục`}
            phu={tom.xong.length ? `${tom.xong.length} lượt công đoạn xong · ${theoDonVi(tom.xong)} (cộng các công đoạn)` : 'chưa công đoạn nào xong'} />
        </div>
      )}

      {d && tab !== 'keHoach' && (
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-800">Cách đọc các số</summary>
          <dl className="mt-2 grid gap-x-6 gap-y-2 pb-2 sm:grid-cols-2">
            <div><dt className="font-semibold">Giờ công</dt><dd>Số người có mặt × giờ ca, trừ nghỉ trưa.</dd></div>
            <div><dt className="font-semibold">Giờ công sản phẩm</dt><dd>Phần giờ công gắn vào hạng mục đang chạy.</dd></div>
            <div><dt className="font-semibold">Giờ chờ việc</dt><dd>Giờ công − giờ công sản phẩm.</dd></div>
            <div><dt className="font-semibold">Tỷ lệ có việc</dt><dd>Giờ công sản phẩm ÷ giờ công. Xanh ≥ 80%, vàng 50–79%, đỏ dưới 50%.</dd></div>
          </dl>
        </details>
      )}

      {d && (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Kiểu xem báo cáo">
            {tabs.map(x => (
              <button key={x.id} type="button" role="tab" aria-selected={tabHien === x.id} onClick={() => chonTab(x.id)}
                className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${tabHien === x.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                {x.ten}{x.id === 'hangMuc' && d.hangMuc.length ? ` (${d.hangMuc.length})` : ''}{x.id === 'nguoi' && d.theoNguoi?.length ? ` (${d.theoNguoi.length})` : ''}
                {x.id === 'soKhop' && soKhop.some(t => t.soNgayLon) && <span className="ml-1 text-red-700">●</span>}
              </button>
            ))}
          </div>
          {tabHien === 'keHoach' && <KeHoachTuan xuong={xuong} />}
          {tabHien === 'ngay' && <><BieuDoNgay ds={ds} /><TabTheoNgay ds={ds} /></>}
          {tabHien === 'to' && <><BieuDoTo ds={ds} /><TabTheoTo ds={ds} d={d} /></>}
          {tabHien === 'hangMuc' && <TabTheoHangMuc ds={d.hangMuc ?? []} theoTo={ds} xuong={xuong} />}
          {tabHien === 'nguoi' && <TabTheoNguoi ds={d.theoNguoi ?? []} tu={d.tu} den={d.den} />}
          {tabHien === 'chatLuong' && <TabChatLuong d={d} ds={ds} />}
          {tabHien === 'soKhop' && <TabSoKhopTram ds={soKhop} />}
        </>
      )}
    </div>
  );
}
