import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { xuongSetupApi, type BaoCaoXuong as BaoCao, type BaoCaoTo, type BaoCaoToNgay } from '../../services/xuongSetupApi';
import { gioVN, tenCo, hienSl, TEN_CA, type LoaiCa } from '../../services/xuongModel';
import { BTN, KHUNG, TH, TD } from './xuongDesktopUi';

// ============================================================================
// BÁO CÁO XƯỞNG / TỔ (đợt 2 — docs/designs/xuong-checkin.md): giờ công so với quân số, giờ chờ, hạng mục đang chạy,
// hàng chờ nhận theo tổ + 4 chỉ số đo thành công. Giờ công = phân bổ theo quân số (không nhân thời gian × số người).
// Server tính dần các ngày còn thiếu (conThieu) — màn này tự gọi lại tới khi đủ.
// ============================================================================

const ngayVN = (offset = 0) => gioVN(Date.now() + offset * 86_400_000).ngay;
const so = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const phanTram = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const ddmm = (ngay: string) => ngay.split('-').reverse().slice(0, 2).join('/');

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

function ChiTietTo({ t }: { t: BaoCaoTo }) {
  return (
    <div className="bg-slate-50 p-3 md:p-4">
      <div className={KHUNG}>
        <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Giờ công theo hạng mục (cộng cả kỳ)</p>
        {/* Điện thoại: thẻ từng hạng mục (bảng 4 cột bị cắt cột tăng ca) */}
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto md:hidden">
          {t.theoHangMuc.map(h => (
            <li key={`${h.hex}|${h.congDoanId}`} className="px-3 py-2 text-sm">
              <p><span className="font-medium tabular-nums text-slate-800">{h.hex}</span> {h.tenHangMuc ?? ''}</p>
              <p className="text-xs text-slate-500">{h.tenCongDoan}{h.tenCongTrinh ? ` · ${h.tenCongTrinh}` : ''}</p>
              <p className="mt-1 flex flex-wrap gap-x-3 tabular-nums text-slate-700">
                <span>Chạy {so(h.gioChay)} giờ</span><span>Giờ công {so(h.gioCongThuong)}</span>
                {h.gioCongTangCa > 0 && <span>Tăng ca {so(h.gioCongTangCa)}</span>}
              </p>
            </li>
          ))}
          {!t.theoHangMuc.length && <li className="px-3 py-2 text-sm text-slate-500">Không có hạng mục chạy trong kỳ.</li>}
        </ul>
        <div className="hidden max-h-96 overflow-y-auto md:block">
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
    </div>
  );
}

/** Quân số chốt: ca chính trước, tăng ca sau — "7 người · tăng ca Ca 1: 5" */
function moTaQuanSo(q: Record<string, number>) {
  const chinh = q.chinh;
  const tc = Object.entries(q).filter(([k]) => k !== 'chinh').map(([k, n]) => `${TEN_CA[k as LoaiCa] ?? k}: ${n}`);
  return { chinh: typeof chinh === 'number' ? chinh : null, tangCa: tc.join(' · ') };
}

function ChiTietNgay({ n }: { n: BaoCaoToNgay }) {
  return (
    <div className="grid gap-3 bg-slate-50 p-3 md:p-4 xl:grid-cols-2">
      <div className={KHUNG}>
        <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Giờ công theo hạng mục trong ngày ({n.hangMuc.length})</p>
        <ul className="divide-y divide-slate-100">
          {n.hangMuc.map(h => (
            <li key={`${h.hex}|${h.congDoanId}`} className="flex items-start gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p>
                  <span className="font-medium tabular-nums text-slate-800">{h.hex}</span> {h.tenHangMuc ?? ''}
                  {h.dangChay && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Đang chạy</span>}
                </p>
                <p className="text-xs text-slate-500">{h.tenCongDoan} · chạy {so(h.gioChay)} giờ</p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="font-semibold text-slate-800">{so(h.gioCongThuong + h.gioCongTangCa)} giờ công</p>
                {h.gioCongTangCa > 0 && <p className="text-xs text-slate-500">tăng ca {so(h.gioCongTangCa)}</p>}
              </div>
            </li>
          ))}
          {!n.hangMuc.length && <li className="px-3 py-2 text-sm text-slate-500">Không có hạng mục chạy trong ngày.</li>}
        </ul>
      </div>
      <div className={KHUNG}>
        <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Hạng mục nhận trong ngày ({n.nhan.length})</p>
        <ul className="divide-y divide-slate-100">
          {n.nhan.map(h => (
            <li key={`${h.hex}|${h.congDoanId}`} className="flex items-start gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p><span className="font-medium tabular-nums text-slate-800">{h.hex}</span> {h.tenHangMuc ?? ''}</p>
                <p className="text-xs text-slate-500">{h.tenCongDoan}</p>
              </div>
              <p className="shrink-0 tabular-nums text-slate-800">{hienSl(h.soLuong)} {h.dvt?.trim() || 'cái'}</p>
            </li>
          ))}
          {!n.nhan.length && <li className="px-3 py-2 text-sm text-slate-500">Không nhận hạng mục nào.</li>}
        </ul>
        {n.co.length > 0 && <p className="border-t border-slate-100 px-3 py-2 text-xs text-amber-800">{n.co.map(tenCo).join(', ')}</p>}
      </div>
    </div>
  );
}

/** Theo ngày: mỗi ngày (mới trước) × mỗi tổ — công nhân, giờ công, giờ công từng hạng mục, hạng mục nhận / đang chạy */
function TheoNgay({ ds }: { ds: BaoCaoTo[] }) {
  const [mo, setMo] = useState<Set<string>>(new Set());
  const bat = (k: string) => setMo(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const theoNgay = new Map<string, Array<{ t: BaoCaoTo; n: BaoCaoToNgay }>>();
  for (const t of ds) for (const n of t.theoNgay) {
    if (!theoNgay.has(n.ngay)) theoNgay.set(n.ngay, []);
    theoNgay.get(n.ngay)!.push({ t, n });
  }
  const ngays = [...theoNgay.keys()].sort().reverse();
  if (!ngays.length) return null;
  return (
    <div className={KHUNG}>
      <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Theo ngày — từng tổ</p>
      {ngays.map(ngay => {
        const dong = theoNgay.get(ngay)!.sort((a, b) => a.t.ten.localeCompare(b.t.ten));
        const tongCn = dong.reduce((a, x) => a + (x.n.quanSo.chinh ?? 0), 0);
        const tongGc = dong.reduce((a, x) => a + x.n.gioCong, 0);
        return (
          <div key={ngay} className="border-b border-slate-100 last:border-b-0">
            <p className="flex flex-wrap gap-x-4 bg-slate-50 px-4 py-2 text-sm">
              <span className="font-semibold text-slate-800">{ddmm(ngay)}/{ngay.slice(0, 4)}</span>
              <span className="tabular-nums text-slate-600">{tongCn} công nhân · {so(tongGc)} giờ công</span>
            </p>
            <ul className="divide-y divide-slate-100">
              {dong.map(({ t, n }) => {
                const k = `${ngay}|${t.toId}`;
                const m = mo.has(k);
                const qs = moTaQuanSo(n.quanSo);
                const chay = n.hangMuc.filter(h => h.dangChay).length;
                return (
                  <li key={k}>
                    <button type="button" className="w-full px-4 py-2.5 text-left hover:bg-slate-50 active:bg-slate-50" aria-expanded={m} onClick={() => bat(k)}>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                        <span className="flex min-w-36 items-center gap-1 font-semibold text-slate-800">
                          {m ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{t.ten}
                        </span>
                        <span className="tabular-nums text-slate-700">
                          <span className="text-slate-500">Công nhân </span>
                          {qs.chinh !== null ? <b>{qs.chinh}</b> : <span className="text-amber-700">chưa chốt</span>}
                          {qs.tangCa && <span className="text-slate-500"> · tăng ca {qs.tangCa}</span>}
                        </span>
                        <span className="tabular-nums text-slate-700">
                          <span className="text-slate-500">Giờ công </span><b>{so(n.gioCong)}</b>
                          {n.gioCongTangCa > 0 && <span className="text-slate-500"> (tăng ca {so(n.gioCongTangCa)})</span>}
                        </span>
                        <span className="tabular-nums text-slate-700"><span className="text-slate-500">Giờ người </span>{so(n.gioNguoi)}</span>
                        <span className="tabular-nums text-slate-700"><span className="text-slate-500">Giờ chờ </span>{so(n.gioCho)}</span>
                        <span className="tabular-nums text-slate-700"><span className="text-slate-500">Nhận </span>{n.nhan.length} hạng mục</span>
                        <span className="tabular-nums text-slate-700">
                          <span className="text-slate-500">Chạy </span>{n.hangMuc.length} hạng mục
                          {chay > 0 && <span className="text-emerald-700"> · {chay} đang chạy</span>}
                        </span>
                        {n.co.length > 0 && <AlertTriangle size={14} className="text-amber-600" aria-label={n.co.map(tenCo).join(', ')} />}
                      </div>
                    </button>
                    {m && <ChiTietNgay n={n} />}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Công nhân = quân số tổ chốt trong ngày. Giờ công từng hạng mục = thời gian chạy × số người khai khi bắt đầu / chia người (co theo quân số).
        Bấm một tổ để xem giờ công từng hạng mục và các hạng mục nhận.
      </p>
    </div>
  );
}

function DoiChieuChamCong({ d }: { d: BaoCao }) {
  const cc = d.chamCong;
  if (!cc) return null;
  const ds = cc.theoNgay.filter(n => n.congNhan > 0 || n.gioThuongApp + n.gioTangCaApp > 0);
  const caHai = ds.filter(n => n.gioHc + n.gioTc > 0 && n.gioThuongApp + n.gioTangCaApp > 0);
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
      {ds.length > 0 && (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto md:hidden">
          {ds.map(n => (
            <li key={n.ngay} className="px-4 py-2.5 text-sm">
              <p className="font-semibold tabular-nums text-slate-800">{ddmm(n.ngay)}</p>
              <dl className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
                <dt className="text-slate-500" /><dd className="text-right text-xs text-slate-500">Điểm danh</dd><dd className="text-right text-xs text-slate-500">App</dd>
                <dt className="text-slate-600">Người</dt><dd className="text-right">{n.congNhan ? so(n.congNhan) : '—'}</dd><dd className="text-right">{n.quanSoApp ? so(n.quanSoApp) : '—'}</dd>
                <dt className="text-slate-600">Giờ thường</dt><dd className="text-right">{n.gioHc ? so(n.gioHc) : '—'}</dd><dd className="text-right">{n.gioThuongApp ? so(n.gioThuongApp) : '—'}</dd>
                <dt className="text-slate-600">Giờ tăng ca</dt><dd className="text-right">{n.gioTc ? so(n.gioTc) : '—'}</dd><dd className="text-right">{n.gioTangCaApp ? so(n.gioTangCaApp) : '—'}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {ds.length > 0 && (
        <div className="hidden max-h-80 overflow-auto md:block">
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

export default function BaoCaoXuong({ xuong }: { xuong: string }) {
  const [tu, setTu] = useState(() => ngayVN(-6));
  const [den, setDen] = useState(() => ngayVN());
  const [d, setD] = useState<BaoCao | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const [mo, setMo] = useState<Set<number>>(new Set());
  const [anTrong, setAnTrong] = useState(true);
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
  const ds = (d?.theoTo ?? []).filter(t => !anTrong || t.theoNgay.length || t.dangChay || t.choNhan || t.tamNgung)
    .sort((a, b) => (b.gioNguoi.thuong + b.gioNguoi.tangCa) - (a.gioNguoi.thuong + a.gioNguoi.tangCa) || a.ten.localeCompare(b.ten));
  const tong = ds.reduce((a, t) => ({
    gn: a.gn + t.gioNguoi.thuong + t.gioNguoi.tangCa, gc: a.gc + t.gioCong.thuong + t.gioCong.tangCa,
    gch: a.gch + t.gioCho.thuong + t.gioCho.tangCa, tc: a.tc + t.gioCong.tangCa,
    dc: a.dc + t.dangChay, tn: a.tn + t.tamNgung, cn: a.cn + t.choNhan,
  }), { gn: 0, gc: 0, gch: 0, tc: 0, dc: 0, tn: 0, cn: 0 });
  const cs = d?.chiSo;
  const pNk = cs ? phanTram(cs.nhatKy.du, cs.nhatKy.tong) : null;
  const pChot = cs ? phanTram(cs.chotQuanSo.ngayChot, cs.chotQuanSo.ngayCoChay) : null;
  const pGui = cs ? phanTram(cs.guiTrong1Gio.nhanh, cs.guiTrong1Gio.tong) : null;

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
        <button type="button" className={`${BTN} ml-auto`} onClick={tai}><RefreshCw size={13} className={dang ? 'animate-spin' : ''} /> Tải lại</button>
      </div>

      {loi && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
      {d && !d.banLuu && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={15} /> Chưa chạy file backend/sql/2026-10-12_xuong_bao_cao.sql — báo cáo tính lại mỗi lần xem (chậm hơn với khoảng ngày dài).
        </p>
      )}
      {d && d.conThieu > 0 && <p className="text-sm text-slate-600" aria-live="polite"><RefreshCw size={13} className="mr-1 inline animate-spin" /> Đang tính thêm {d.conThieu} ngày-tổ…</p>}

      {cs && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ChiSo ten="Nhật ký đủ Bắt đầu và Hoàn thành" giaTri={pNk === null ? '—' : `${pNk}%`}
            phu={`${cs.nhatKy.du}/${cs.nhatKy.tong} cặp hạng mục × công đoạn, mục tiêu ≥ 90% (MRA 85%)`} dat={pNk === null ? null : pNk >= 90} />
          <ChiSo ten="Ngày-tổ có chốt quân số" giaTri={pChot === null ? '—' : `${pChot}%`}
            phu={`${cs.chotQuanSo.ngayChot}/${cs.chotQuanSo.ngayCoChay} ngày có hạng mục chạy, mục tiêu ≥ 90%`} dat={pChot === null ? null : pChot >= 90} />
          <ChiSo ten="Thao tác tới máy chủ trong 1 giờ" giaTri={pGui === null ? '—' : `${pGui}%`}
            phu={`${cs.guiTrong1Gio.nhanh}/${cs.guiTrong1Gio.tong} thao tác, mục tiêu ≥ 95%`} dat={pGui === null ? null : pGui >= 95} />
          <ChiSo ten="Ngày-tổ khai vượt quân số" giaTri={String(cs.khaiVuotQuanSo)} phu="Theo dõi, không đặt mục tiêu" dat={null} />
        </div>
      )}

      {d && <TheoNgay ds={ds} />}

      {d && <DoiChieuChamCong d={d} />}

      {d && (
        <div className={KHUNG}>
          {/* Điện thoại: mỗi tổ 1 thẻ (bảng 10 cột chỉ thấy 3 cột, phải vuốt ngang) */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {ds.map(t => {
              const gn = t.gioNguoi.thuong + t.gioNguoi.tangCa;
              const gc = t.gioCong.thuong + t.gioCong.tangCa;
              const p = phanTram(gc, gn);
              const m = mo.has(t.toId);
              return (
                <li key={t.toId}>
                  <button type="button" className="w-full px-4 py-3 text-left active:bg-slate-50" aria-expanded={m}
                    onClick={() => setMo(s => { const n = new Set(s); if (n.has(t.toId)) n.delete(t.toId); else n.add(t.toId); return n; })}>
                    <p className="flex items-center gap-1 font-semibold text-slate-800">
                      {m ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{t.ten}
                      {t.khaiVuot > 0 && <span className="ml-1 text-xs font-normal text-amber-700">khai vượt {t.khaiVuot} ngày</span>}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center tabular-nums">
                      <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-xs text-slate-500">Giờ người</p><p className="font-semibold text-slate-800">{so(gn)}</p></div>
                      <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-xs text-slate-500">Giờ công</p><p className="font-semibold text-slate-800">{so(gc)}</p></div>
                      <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-xs text-slate-500">Giờ chờ</p><p className="font-semibold text-slate-800">{so(t.gioCho.thuong + t.gioCho.tangCa)}</p></div>
                    </div>
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-600">
                      <span>Dùng người {p === null ? '—' : `${p}%`}</span>
                      {t.gioCong.tangCa > 0 && <span>Tăng ca {so(t.gioCong.tangCa)} giờ</span>}
                      <span>Chốt quân số {t.ngayCoChay ? `${t.ngayChot}/${t.ngayCoChay} ngày` : '—'}</span>
                      {t.dangChay > 0 && <span className="text-emerald-700">{t.dangChay} đang chạy</span>}
                      {t.tamNgung > 0 && <span className="text-amber-700">{t.tamNgung} tạm ngưng</span>}
                      {t.choNhan > 0 && <span>{t.choNhan} chờ nhận</span>}
                    </p>
                  </button>
                  {m && <ChiTietTo t={t} />}
                </li>
              );
            })}
            {!ds.length && <li className="px-4 py-3 text-sm text-slate-500">Chưa có số liệu trong kỳ {ddmm(d.tu)} – {ddmm(d.den)}.</li>}
            {ds.length > 1 && (
              <li className="bg-slate-50 px-4 py-3 text-sm">
                <p className="font-semibold text-slate-800">Cả xưởng {d.xuong}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums text-slate-700">
                  <span>Giờ người {so(tong.gn)}</span><span>Giờ công {so(tong.gc)}</span><span>Giờ chờ {so(tong.gch)}</span>
                  <span>Dùng người {tong.gn ? `${Math.round((tong.gc / tong.gn) * 100)}%` : '—'}</span>
                </p>
              </li>
            )}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px]">
              <thead className="bg-slate-50"><tr>
                <th className={TH}>Tổ</th>
                <th className={`${TH} text-right`}>Giờ người (quân số)</th>
                <th className={`${TH} text-right`}>Giờ công</th>
                <th className={`${TH} text-right`}>trong đó tăng ca</th>
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
                  return (
                    <Fragment key={t.toId}>
                      <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                        onClick={() => setMo(s => { const n = new Set(s); if (n.has(t.toId)) n.delete(t.toId); else n.add(t.toId); return n; })}>
                        <td className={`${TD} font-medium text-slate-800`}>
                          <span className="inline-flex items-center gap-1">{m ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{t.ten}</span>
                          {t.khaiVuot > 0 && <span className="ml-2 text-xs text-amber-700">khai vượt {t.khaiVuot} ngày</span>}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{so(gn)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{so(gc)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{so(t.gioCong.tangCa)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{so(t.gioCho.thuong + t.gioCho.tangCa)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{p === null ? '—' : `${p}%`}</td>
                        <td className={`${TD} text-right tabular-nums`}>{t.ngayCoChay ? `${t.ngayChot}/${t.ngayCoChay} ngày` : '—'}</td>
                        <td className={`${TD} text-right tabular-nums`}>{t.dangChay || '—'}</td>
                        <td className={`${TD} text-right tabular-nums`}>{t.tamNgung || '—'}</td>
                        <td className={`${TD} text-right tabular-nums`}>{t.choNhan || '—'}</td>
                      </tr>
                      {m && <tr><td colSpan={10} className="p-0"><ChiTietTo t={t} /></td></tr>}
                    </Fragment>
                  );
                })}
                {!ds.length && <tr><td colSpan={10} className={`${TD} text-slate-500`}>Chưa có số liệu trong kỳ {ddmm(d.tu)} – {ddmm(d.den)}.</td></tr>}
              </tbody>
              {ds.length > 1 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr>
                  <td className={TD}>Cả xưởng {d.xuong}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(tong.gn)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(tong.gc)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(tong.tc)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(tong.gch)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{tong.gn ? `${Math.round((tong.gc / tong.gn) * 100)}%` : '—'}</td>
                  <td className={TD} />
                  <td className={`${TD} text-right tabular-nums`}>{tong.dc}</td>
                  <td className={`${TD} text-right tabular-nums`}>{tong.tn}</td>
                  <td className={`${TD} text-right tabular-nums`}>{tong.cn}</td>
                </tr></tfoot>
              )}
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Giờ người = quân số đã chốt × giờ ca (trừ giờ nghỉ). Giờ công = giờ người chia cho hạng mục đang chạy theo số người khai; phần không gán là giờ chờ.
            Ca chưa chốt quân số chỉ tính theo số người khai (không có giờ chờ). Bấm một tổ để xem giờ công cả kỳ theo hạng mục.
          </p>
        </div>
      )}
    </div>
  );
}
