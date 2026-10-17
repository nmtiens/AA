import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BottomSheet } from '../mobileUi';
import { authXuong } from '../../../services/xuongClock';
import { tramQuanLyApi, type SuaNgayData, type DoanNguoiSua } from '../../../services/xuongTramApi';
import type { SuKienNhap } from '../../../services/xuongQueue';
import { hhmm, mocTrongNgay, type DongViec } from '../../../services/xuongModel';
import { ngayCa } from '../../../utils/xuongTheNv';
import { NUT_CHINH, NUT_PHU, MAU } from './xuongUi';

// ============================================================================
// SỬA NGÀY (tổ trưởng / quản lý — docs/designs/xuong-tram-quet.md): dòng thời gian từng người do trạm ghi
// (vào ca → các đoạn ở hàng → ra ca) kèm cờ: khoảng trống > 30 phút, một đoạn > 4 giờ, vào ca không vào hàng, tự đóng
// cuối ca, ngoài ca. Sửa = sự kiện đính chính: huỷ lượt quét sai (tổ trưởng: sự kiện trạm của tổ trong 7 ngày) và ghi
// hộ người vào / ra hàng (gắn cờ "tổ trưởng ghi hộ").
// ============================================================================

const TEN_CO: Record<string, string> = {
  tu_dong: 'Quên ra — tự đóng cuối ca', ngoai_ca: 'Quét ngoài giờ ca', khoang_trong: 'Trống > 30 phút',
  doan_dai: 'Một hàng > 4 giờ', khong_vao_hang: 'Vào ca, không vào hàng nào',
};
const TEN_KET_THUC: Record<string, string> = {
  ra: 'ra', doi_hang: 'đổi hàng', xong: 'Xong hết', tu_dong: 'tự đóng cuối ca', ngoai_ca: 'ngoài ca',
};

const doiNgay = (ngay: string, d: number) => new Date(Date.parse(`${ngay}T12:00:00+07:00`) + d * 86_400_000).toISOString().slice(0, 10);

export function SuaNgaySheet({ toId, dong, onGhi, onHuy, onClose }: {
  toId: number;
  /** Hạng mục của tổ (để ghi hộ vào hàng) */
  dong: DongViec[];
  onGhi: (evs: SuKienNhap[], moTa: string) => Promise<boolean>;
  onHuy: (ids: string[], moTa: string) => Promise<void>;
  onClose: () => void;
}) {
  const [ngay, setNgay] = useState<string | null>(null);
  const [data, setData] = useState<SuaNgayData | null>(null);
  const [loi, setLoi] = useState('');
  const [ghiHo, setGhiHo] = useState<{ mnv: string; hoTen: string } | null>(null);

  const tai = useCallback(() => {
    setLoi('');
    void tramQuanLyApi(authXuong).suaNgay(toId, ngay ?? undefined).then(r => {
      if (r.ok) { setData(r.data); if (!ngay) setNgay(r.data.ngay); }
      else setLoi(r.status === 0 ? 'Đang mất sóng — Sửa ngày cần có sóng.' : r.message);
    });
  }, [toId, ngay]);
  useEffect(tai, [tai]);

  const huy = async (ids: string[], moTa: string) => { await onHuy(ids, moTa); setTimeout(tai, 1500); };
  // Xác nhận đoạn tự gán = ghi hộ người đó vào đúng hàng từ đúng lúc (đoạn đổi nguồn thành ghi hộ)
  const xacNhan = async (ds: DoanNguoiSua[], moTa: string) => {
    if (!ds.length) return;
    const ok = await onGhi(ds.map(d => ({ loai: 'nguoi_vao', toId, hex: d.hex, congDoanId: d.congDoanId, lucXayRa: d.start,
      duLieu: { mnv: d.mnv, tram: true } })), moTa);
    if (ok) setTimeout(tai, 1500);
  };
  const tuGan = (data?.nguoi ?? []).flatMap(n => n.doan.filter(d => d.nguon === 'tu_gan'));
  const now = data?.serverNow ?? Date.now();

  return (
    <BottomSheet title="Sửa ngày — lượt quét ở trạm" onClose={onClose}>
      <div className="flex items-center justify-between gap-2 pb-3">
        <button className={NUT_PHU} aria-label="Ngày trước" onClick={() => ngay && setNgay(doiNgay(ngay, -1))}><ChevronLeft size="1.25em" /></button>
        <p className="text-lg font-semibold tabular-nums text-slate-900">{ngay ?? '…'}</p>
        <button className={NUT_PHU} aria-label="Ngày sau" disabled={!ngay || ngay >= ngayCa(now)}
          onClick={() => ngay && setNgay(doiNgay(ngay, 1))}><ChevronRight size="1.25em" /></button>
      </div>
      {loi && <p className="text-base text-red-700" role="alert">{loi}</p>}
      {data && !data.nguoi.length && <p className="text-base text-slate-600">Ngày này trạm chưa ghi lượt quét nào.</p>}
      {data?.gioTheoNguon && data.nguoi.length > 0 && (
        <p className="pb-2 text-base text-slate-700">
          Giờ ở hàng: quét {data.gioTheoNguon.quet} · phân công {data.gioTheoNguon.phan_cong} · tự gán {data.gioTheoNguon.tu_gan} · ghi hộ {data.gioTheoNguon.ghi_ho}
        </p>
      )}
      {data?.suaDuoc && tuGan.length > 0 && (
        <button className={`${NUT_CHINH} mb-3`} onClick={() => void xacNhan(tuGan, `Xác nhận ${tuGan.length} đoạn tự gán`)}>
          Xác nhận cả tổ — {tuGan.length} đoạn tự gán đúng
        </button>
      )}
      <ul className="space-y-3 pb-4">
        {data?.nguoi.map(n => (
          <li key={n.mnv} className="rounded-2xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-semibold text-slate-900">{n.hoTen} <span className="text-base font-normal text-slate-600">{n.mnv}</span></p>
              {data.suaDuoc && <button className={NUT_PHU} onClick={() => setGhiHo({ mnv: n.mnv, hoTen: n.hoTen })}>Ghi hộ</button>}
            </div>
            {n.co.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {n.co.map(c => <span key={c} className={`rounded-full border px-3 py-1 text-base ${MAU.ngung.vien} ${MAU.ngung.nen} ${MAU.ngung.chu}`}>{TEN_CO[c] ?? c}</span>)}
              </div>
            )}
            <ul className="mt-2 space-y-1 text-base text-slate-800">
              {n.coMat.map((c, i) => <li key={`cm${i}`}>Có mặt {hhmm(c.start)} – {c.end === null ? 'đang trong ca' : hhmm(c.end)}</li>)}
              {n.doan.map(d => (
                <DongDoan key={d.suKienVao} d={d} suaDuoc={data.suaDuoc}
                  onHuy={() => void huy([d.suKienVao], `Huỷ lượt vào ${d.tenHangMuc ?? d.hex} của ${n.hoTen}`)}
                  onDung={() => void xacNhan([d], `Xác nhận ${n.hoTen} làm ${d.tenHangMuc ?? d.hex}`)}
                  onSai={() => void onGhi([{ loai: 'nguoi_ra', toId, hex: d.hex, congDoanId: d.congDoanId, lucXayRa: d.start, duLieu: { mnv: d.mnv, tram: true } }],
                    `${n.hoTen} không làm ${d.tenHangMuc ?? d.hex}`).then(ok => { if (ok) setTimeout(tai, 1500); })} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {ghiHo && data && ngay && (
        <GhiHo nguoi={ghiHo} ngay={ngay} dong={dong} onDong={() => setGhiHo(null)}
          onGhi={async (evs, moTa) => {
            const ok = await onGhi(evs.map(e => ({ ...e, toId, duLieu: { ...(e.duLieu ?? {}), mnv: ghiHo.mnv, tram: true } })), moTa);
            if (ok) { setGhiHo(null); setTimeout(tai, 1500); }
          }} />
      )}
    </BottomSheet>
  );
}

const TEN_NGUON: Record<string, string> = { quet: 'quét', phan_cong: 'phân công', tu_gan: 'tự gán', ghi_ho: 'ghi hộ' };

function DongDoan({ d, suaDuoc, onHuy, onDung, onSai }: {
  d: DoanNguoiSua; suaDuoc: boolean; onHuy: () => void; onDung: () => void; onSai: () => void;
}) {
  const tuGan = d.nguon === 'tu_gan';
  const lech = d.ketThuc === 'tu_dong' || d.ketThuc === 'ngoai_ca' || tuGan;
  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-1 ${lech ? MAU.ngung.nen : ''}`}>
      <span className="min-w-0">
        <b className="tabular-nums">{hhmm(d.start)}–{d.end === null ? 'nay' : hhmm(d.end)}</b> {d.tenHangMuc ?? d.hex}
        {d.ketThuc && <span className="text-slate-600"> · {TEN_KET_THUC[d.ketThuc] ?? d.ketThuc}</span>}
        {d.nguon && d.nguon !== 'quet' && <span className={tuGan ? `font-medium ${MAU.ngung.chu}` : 'text-slate-600'}> · {TEN_NGUON[d.nguon]}</span>}
      </span>
      {suaDuoc && (tuGan ? (
        // Tự gán: không có lượt quét để huỷ — xác nhận đúng, hoặc báo không làm hàng này
        <span className="flex shrink-0 gap-3">
          <button className="min-h-12 px-2 text-base font-medium text-emerald-800 underline underline-offset-4" onClick={onDung}>Đúng</button>
          <button className="min-h-12 px-2 text-base font-medium text-red-700 underline underline-offset-4" onClick={onSai}>Không làm</button>
        </span>
      ) : <button className="min-h-12 shrink-0 px-2 text-base font-medium text-red-700 underline underline-offset-4" onClick={onHuy}>Huỷ</button>)}
    </li>
  );
}

/** Ghi hộ một người: vào hàng / ra hàng / ra ca lúc HH:MM của ngày đang xem */
function GhiHo({ nguoi, ngay, dong, onGhi, onDong }: {
  nguoi: { mnv: string; hoTen: string }; ngay: string; dong: DongViec[];
  onGhi: (evs: SuKienNhap[], moTa: string) => Promise<void>; onDong: () => void;
}) {
  const [loai, setLoai] = useState<'nguoi_vao' | 'nguoi_ra' | 'ra_ca'>('nguoi_vao');
  const [hang, setHang] = useState('');
  const [gio, setGio] = useState(() => hhmm(Date.now()));
  const luc = /^\d{2}:\d{2}$/.test(gio) ? mocTrongNgay(ngay, gio) : NaN;
  const hopLe = Number.isFinite(luc) && luc <= Date.now() && (loai !== 'nguoi_vao' || !!hang);
  const ds = dong.filter(r => r.slNhan > r.slHoanThanh);
  const ghi = () => {
    if (!hopLe) return;
    const [hex, congDoanId] = hang.split('|');
    const ten = ds.find(r => `${r.hex}|${r.congDoanId}` === hang)?.tenHangMuc ?? hex;
    if (loai === 'nguoi_vao') void onGhi([{ loai, hex, congDoanId, lucXayRa: luc }], `Ghi hộ ${nguoi.hoTen} vào ${ten} lúc ${gio}`);
    else if (loai === 'nguoi_ra') void onGhi([{ loai, lucXayRa: luc }], `Ghi hộ ${nguoi.hoTen} ra khỏi hàng lúc ${gio}`);
    else void onGhi([{ loai: 'nguoi_ra', lucXayRa: luc }, { loai: 'ra_ca', lucXayRa: luc, duLieu: { loaiCa: 'chinh', nguoi: [{ mnv: nguoi.mnv }] } }],
      `Ghi hộ ${nguoi.hoTen} ra ca lúc ${gio}`);
  };
  return (
    <div className="mt-2 space-y-3 rounded-2xl border border-slate-300 p-3">
      <p className="text-lg font-semibold text-slate-900">Ghi hộ {nguoi.hoTen}</p>
      <div className="grid grid-cols-3 gap-2">
        {([['nguoi_vao', 'Vào hàng'], ['nguoi_ra', 'Ra hàng'], ['ra_ca', 'Ra ca']] as const).map(([k, t]) => (
          <button key={k} className={loai === k ? NUT_CHINH.replace('h-16', 'h-14') : NUT_PHU} onClick={() => setLoai(k)}>{t}</button>
        ))}
      </div>
      {loai === 'nguoi_vao' && (
        <select className="h-14 w-full rounded-2xl border border-slate-300 px-3 text-base" value={hang} onChange={e => setHang(e.target.value)} aria-label="Hạng mục">
          <option value="">— Chọn hạng mục —</option>
          {ds.map(r => <option key={`${r.hex}|${r.congDoanId}`} value={`${r.hex}|${r.congDoanId}`}>{r.hex} · {r.tenHangMuc ?? ''}</option>)}
        </select>
      )}
      <label className="flex items-center gap-3 text-base text-slate-800">Lúc
        <input type="time" className="h-14 rounded-2xl border border-slate-300 px-3 text-lg tabular-nums" value={gio} onChange={e => setGio(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <button className={NUT_PHU} onClick={onDong}>Huỷ</button>
        <button className={NUT_CHINH} disabled={!hopLe} onClick={ghi}>Ghi</button>
      </div>
    </div>
  );
}
