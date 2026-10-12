import { useEffect, useState } from 'react';
import { Play, Pause, Circle, Inbox, PackageCheck, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { xuongSetupApi, taiAnhXuong, type ChiTietHex, type CongDoanHex, type ThoiGianXuong } from '../../services/xuongSetupApi';
import { hhmm, gioVN, moTaSuKien } from '../../services/xuongModel';

// ============================================================================
// CHI TIẾT MỤC XƯỞNG CỦA MỘT HẠNG MỤC (quyết định 6A — docs/designs/xuong-checkin.md):
// từ xl (1280px) là bảng Công đoạn · Nhận · Hoàn thành · Giao · Giờ chạy · Giờ công theo thứ tự tuyến;
// hẹp hơn thì mỗi công đoạn một dòng 2 tầng, nhãn đầy đủ, không viết tắt, không cuộn ngang.
// Dùng trong HexDetailModal (máy tính) và Tra cứu HEX (/m/).
// ============================================================================

const TT: Record<string, { ten: string; icon: typeof Play; mau: string }> = {
  dang_lam: { ten: 'Đang chạy', icon: Play, mau: 'text-emerald-700' },
  tam_ngung: { ten: 'Tạm ngưng', icon: Pause, mau: 'text-amber-700' },
  da_nhan: { ten: 'Chưa bắt đầu', icon: Circle, mau: 'text-slate-600' },
  cho_nhan: { ten: 'Chờ nhận', icon: Inbox, mau: 'text-slate-600' },
  cho_giao: { ten: 'Chờ giao', icon: PackageCheck, mau: 'text-slate-600' },
  xong: { ten: 'Xong', icon: Check, mau: 'text-slate-600' },
};

/** "2 ngày 4 giờ" / "3 giờ 10 phút" */
export function khoangThoiGian(ms: number): string {
  const phut = Math.max(0, Math.round(ms / 60_000));
  const ngay = Math.floor(phut / 1440);
  const gio = Math.floor((phut % 1440) / 60);
  const p = phut % 60;
  if (ngay) return gio ? `${ngay} ngày ${gio} giờ` : `${ngay} ngày`;
  if (gio) return p ? `${gio} giờ ${p} phút` : `${gio} giờ`;
  return `${p} phút`;
}
const so = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const ngayGio = (ms: number) => `${hhmm(ms)} ${gioVN(ms).ngay.split('-').reverse().join('/')}`;

function TrangThai({ t }: { t: string }) {
  const m = TT[t] ?? TT.da_nhan;
  const I = m.icon;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap font-medium ${m.mau}`}><I size="1em" aria-hidden /> {m.ten}</span>;
}

function ThoiGianTrongXuong({ t }: { t: ThoiGianXuong }) {
  const moc = t.loaiMoc === 'trien_khai' ? `số triển khai ${so(t.moc)}` : t.loaiMoc === 'don_hang' ? `số đơn hàng ${so(t.moc)}` : 'chưa có mốc';
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-sm font-semibold text-slate-800">Thời gian trong xưởng {t.xuong}</p>
      <p className="text-sm text-slate-700">
        {t.thoiGian === null ? 'Chưa nhận vào xưởng' : khoangThoiGian(t.thoiGian)}
        {t.tamTinh && t.thoiGian !== null ? ` — tạm tính, đã ra ${so(t.tongDaRa)} (${Math.round(t.phanTram)}% ${moc})` : t.thoiGian !== null ? ` — xong theo ${moc}` : ''}
      </p>
      {t.lo.length > 1 && (
        <p className="text-xs text-slate-600">{t.lo.length} lô: {t.lo.map(l => `${so(l.soLuong)} cái ${khoangThoiGian(l.thoiGian)}${l.raHetLuc ? '' : ' (chưa ra hết)'}`).join(' · ')}</p>
      )}
    </div>
  );
}

/** Một ảnh tiến độ: tải bằng token (API cần đăng nhập), bấm để mở cỡ lớn */
function AnhXuong({ id, nhan }: { id: string; nhan: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loi, setLoi] = useState(false);
  useEffect(() => {
    let huy = false;
    let u: string | null = null;
    taiAnhXuong(id).then(x => { u = x; if (huy) URL.revokeObjectURL(x); else setUrl(x); }).catch(() => setLoi(true));
    return () => { huy = true; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" className="block w-28" title="Mở ảnh lớn">
      {url
        ? <img src={url} alt={`Ảnh tiến độ ${nhan}`} className="h-28 w-28 rounded-lg border border-slate-200 object-cover" />
        : <span className="flex h-28 w-28 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">{loi ? 'Lỗi tải ảnh' : 'Đang tải…'}</span>}
      <span className="block truncate text-xs text-slate-600">{nhan}</span>
    </a>
  );
}

export default function XuongHexChiTiet({ hex, ten }: { hex: string; ten?: (cdId: string) => string | null }) {
  const [d, setD] = useState<ChiTietHex | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(true);
  const tai = () => {
    setDang(true); setLoi('');
    xuongSetupApi.hex(hex).then(r => {
      if (r.ok) setD(r.data); else setLoi(r.message);
      setDang(false);
    });
  };
  useEffect(tai, [hex]);

  if (dang && !d) return <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><RefreshCw size={14} className="animate-spin" aria-hidden /> Đang tải dữ liệu xưởng…</div>;
  if (loi) return <p className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>;
  if (!d) return null;
  if (!d.congDoan.length && !d.suKien.length) {
    return <p className="p-4 text-sm text-slate-600">Hạng mục {hex} chưa có dữ liệu ở mục Xưởng (chưa triển khai / chưa tổ nào ghi nhận).</p>;
  }
  const tenCd = (id: string | null) => (id ? (d.congDoan.find(c => c.congDoanId === id)?.ten ?? ten?.(id) ?? id) : '');
  const ds = [...d.congDoan].sort((a, b) => (a.xuong ?? '').localeCompare(b.xuong ?? '') || (a.thuTu ?? 0) - (b.thuTu ?? 0) || (a.ten ?? '').localeCompare(b.ten ?? ''));
  const co = (c: CongDoanHex) => c.co.length > 0 && (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700"><AlertTriangle size="1em" aria-hidden /> {c.co.join(', ')}</span>
  );
  const coMra = ds.some(c => c.nguon === 'mra');
  const nhanMra = (c: CongDoanHex) => c.nguon === 'mra' && (
    <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">Lịch sử MRA</span>
  );
  const gioCongO = (c: CongDoanHex) => (c.nguon === 'mra'
    ? (c.nhanCongMra !== null ? `${so(c.nhanCongMra)} người*` : '—') : so(c.gioCong));
  const nguoi = (c: CongDoanHex) => (c.trangThai === 'dang_lam' && c.dangChayTu
    ? ` · ${c.soNguoi ?? 0} người · từ ${ngayGio(Date.parse(c.dangChayTu))}` : '');

  return (
    <div className="space-y-3 text-sm">
      {d.thoiGianMra.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-sm font-semibold text-slate-800">Lịch sử MRA (đến 2/2026)</p>
          {d.thoiGianMra.map(m => (
            <p key={m.xuong} className="text-sm text-slate-700">
              Xưởng {m.xuong}: {ngayGio(Date.parse(m.tu)).split(' ')[1]} → {m.den
                ? `${ngayGio(Date.parse(m.den)).split(' ')[1]} (${khoangThoiGian(Date.parse(m.den) - Date.parse(m.tu))})`
                : 'chưa hoàn thành khi MRA dừng'}
            </p>
          ))}
        </div>
      )}
      {d.thoiGianXuong.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">{d.thoiGianXuong.map(t => <ThoiGianTrongXuong key={t.xuong} t={t} />)}</div>
      )}

      {/* ≥ xl: bảng */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white xl:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Công đoạn</th>
              <th className="px-3 py-2 text-left font-semibold">Trạng thái</th>
              <th className="px-3 py-2 text-right font-semibold">Giao tới</th>
              <th className="px-3 py-2 text-right font-semibold">Nhận</th>
              <th className="px-3 py-2 text-right font-semibold">Hoàn thành</th>
              <th className="px-3 py-2 text-right font-semibold">Giao</th>
              <th className="px-3 py-2 text-right font-semibold">Giờ chạy</th>
              <th className="px-3 py-2 text-right font-semibold">Giờ công</th>
            </tr>
          </thead>
          <tbody>
            {ds.map(c => (
              <tr key={c.congDoanId} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 text-slate-800"><span className="font-medium">{c.ten ?? c.congDoanId}</span> <span className="text-slate-500">· {c.xuong}</span></td>
                <td className="px-3 py-2"><TrangThai t={c.trangThai} />{nhanMra(c)}<span className="text-slate-600">{nguoi(c)}</span><div>{co(c)}</div></td>
                <td className="px-3 py-2 text-right tabular-nums">{so(c.slGiaoDen)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{so(c.slNhan)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{so(c.slHoanThanh)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{so(c.slGiao)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{so(c.gioChay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{gioCongO(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* < xl: dòng 2 tầng */}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white xl:hidden">
        {ds.map(c => (
          <li key={c.congDoanId} className="space-y-1 px-3 py-2.5">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium text-slate-900">{c.ten ?? c.congDoanId} <span className="font-normal text-slate-500">· xưởng {c.xuong}</span></span>
              <span><TrangThai t={c.trangThai} />{nhanMra(c)}<span className="text-slate-600">{nguoi(c)}</span></span>
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums text-slate-700">
              {c.slGiaoDen > 0 && <span>Giao tới {so(c.slGiaoDen)}</span>}
              <span>Nhận {so(c.slNhan)}</span><span>Hoàn thành {so(c.slHoanThanh)}</span><span>Giao {so(c.slGiao)}</span>
              <span>Giờ chạy {so(c.gioChay)}</span><span>{c.nguon === 'mra' ? `Nhân công MRA ${gioCongO(c)}` : `Giờ công ${so(c.gioCong)}`}</span>
            </p>
            {co(c)}
          </li>
        ))}
      </ul>
      {coMra && (
        <p className="text-xs text-slate-600">* Lịch sử MRA (đến 2/2026): chỉ có thời gian chạy và số nhân công gốc MRA — số MRA gốc, có thể đếm trùng; không phân bổ giờ công (MRA không có quân số).</p>
      )}
      {d.gioCongTamTinh && <p className="text-xs text-slate-600">Giờ công cộng 20 ngày làm gần nhất — hạng mục chạy lâu hơn thì xem báo cáo giờ công của tổ.</p>}

      {(() => {
        const coAnh = d.suKien.filter(e => e.conHieuLuc && e.anh?.length);
        if (!coAnh.length) return null;
        return (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="mb-2 text-sm font-semibold text-slate-800">Ảnh tiến độ ({coAnh.reduce((a, e) => a + (e.anh?.length ?? 0), 0)})</p>
            <div className="flex flex-wrap gap-2">
              {[...coAnh].reverse().flatMap(e => (e.anh ?? []).map(id => (
                <AnhXuong key={id} id={id} nhan={`${ngayGio(Date.parse(e.luc))} · ${tenCd(e.congDoanId)}`} />
              )))}
            </div>
          </div>
        );
      })()}

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700">Nhật ký thao tác ({d.suKien.filter(e => e.loai !== 'huy').length})</summary>
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {[...d.suKien].reverse().filter(e => e.loai !== 'huy').map(e => (
            <li key={e.id} className={`px-3 py-1.5 ${e.conHieuLuc ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
              <span className="tabular-nums">{ngayGio(Date.parse(e.luc))}</span> · {tenCd(e.congDoanId)}{e.congDoanId ? ' · ' : ''}
              {e.nguon === 'mra' && e.loai === 'chia_nguoi'
                ? `Nhân công ${e.soNguoi ?? '—'} người (số MRA gốc)`
                : e.nguon === 'mra' && e.loai === 'tang_ca'
                  ? `Tăng ca ${String(e.duLieu?.batDauGio ?? '')}–${String(e.duLieu?.ketThucGio ?? '')}`
                  : moTaSuKien({ loai: e.loai, soLuong: e.soLuong, soNguoi: e.soNguoi, lyDo: e.lyDo, tenCongDoanDen: e.congDoanDenId ? tenCd(e.congDoanDenId) : null })}
              {e.loai === 'tam_ngung' && e.ghiChu ? ` (${e.ghiChu})` : ''}
              {e.nguon === 'mra' ? ` · MRA${e.nguoiGoc ? ` · ${e.nguoiGoc}` : ''}` : ''}{!e.conHieuLuc ? ' · đã huỷ' : ''}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

