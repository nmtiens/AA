import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Inbox, Loader2, Pencil, Phone, RefreshCw, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  DS_TRANG_THAI_YEU_CAU, layYeuCauMua, LoiBanVatTu, suaYeuCauMua, type TrangThaiYeuCau, type YeuCauMua as YeuCau,
} from '../../services/banVatTuApi';
import { dinhDangSoLuong, linkGoi, nhanGio, NHAN_TRANG_THAI_YEU_CAU } from './xuLy';

// ============================================================================
// THẺ "YÊU CẦU MUA" của trang Bán vật tư: yêu cầu khách gửi từ trang khách (/#/cua-hang) để người phụ trách gọi lại.
// GET /api/ban-vat-tu/yeu-cau?trangThai=… (quyền 'ban_vat_tu'); đổi trạng thái / ghi chú nội bộ: PUT /yeu-cau/:id (quyền
// 'ban_vat_tu_sua'). Không tự tải lại theo giờ (DB gói free phải được ngủ) — bấm Tải lại.
// ============================================================================

const MAU_TT: Record<TrangThaiYeuCau, string> = {
  moi: 'border-sky-300 bg-sky-50 text-sky-800',
  dang_xu_ly: 'border-amber-300 bg-amber-50 text-amber-800',
  da_xong: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  huy: 'border-slate-200 bg-slate-100 text-slate-500',
};

type TaiYeuCau = { loai: 'dang_tai' } | { loai: 'loi'; thongBao: string } | { loai: 'xong'; ds: YeuCau[]; canhBao: string | null };

/** Ô ghi chú nội bộ: bấm bút để sửa, Lưu / Huỷ */
function GhiChuNoiBo({ yc, coQuyenSua, onLuu }: {
  yc: YeuCau; coQuyenSua: boolean; onLuu: (yc: YeuCau, ghiChu: string | null) => Promise<boolean>;
}) {
  const [sua, setSua] = useState(false);
  const [chu, setChu] = useState(yc.ghiChuNoiBo ?? '');
  const [dangLuu, setDangLuu] = useState(false);
  if (!sua) {
    return (
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 whitespace-pre-line break-words text-xs text-slate-700">{yc.ghiChuNoiBo ?? <span className="text-slate-400">—</span>}</span>
        {coQuyenSua && (
          <button type="button" onClick={() => { setChu(yc.ghiChuNoiBo ?? ''); setSua(true); }} aria-label="Sửa ghi chú nội bộ"
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={12} /></button>
        )}
      </div>
    );
  }
  const luu = async () => {
    setDangLuu(true);
    const ok = await onLuu(yc, chu.trim() || null);
    setDangLuu(false);
    if (ok) setSua(false);
  };
  return (
    <div className="space-y-1">
      <textarea value={chu} onChange={e => setChu(e.target.value)} rows={2} maxLength={2000} autoFocus
        placeholder="Đã gọi, hẹn xem hàng…"
        className="w-full min-w-[12rem] rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
      <div className="flex justify-end gap-1">
        <button type="button" onClick={() => setSua(false)} disabled={dangLuu} aria-label="Huỷ"
          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={13} /></button>
        <button type="button" onClick={luu} disabled={dangLuu}
          className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          {dangLuu ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Lưu
        </button>
      </div>
    </div>
  );
}

export function YeuCauMua({ coQuyenSua, onSoMoi, onMoMa }: {
  coQuyenSua: boolean;
  /** Báo số yêu cầu 'moi' (huy hiệu trên thẻ) */
  onSoMoi: React.Dispatch<React.SetStateAction<number>>;
  /** Bấm mã vật tư trong yêu cầu => mở chi tiết mã ở thẻ Hàng tồn */
  onMoMa: (ma: string) => void;
}) {
  const { showToast } = useToast();
  const [loc, setLoc] = useState<TrangThaiYeuCau | ''>('');
  const [lanTai, setLanTai] = useState(0);
  const [tai, setTai] = useState<TaiYeuCau>({ loai: 'dang_tai' });
  const [dangDoi, setDangDoi] = useState<number | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setTai({ loai: 'dang_tai' });
    layYeuCauMua(loc, ac.signal)
      .then(kq => { setTai({ loai: 'xong', ds: kq.items, canhBao: kq.canhBao }); onSoMoi(kq.soMoi); })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setTai({ loai: 'loi', thongBao: e instanceof LoiBanVatTu ? e.message : 'Không tải được yêu cầu mua, hãy thử lại' });
      });
    return () => ac.abort();
  }, [loc, lanTai, onSoMoi]);

  const thay = (moi: YeuCau) => setTai(t => (t.loai === 'xong' ? { ...t, ds: t.ds.map(x => (x.id === moi.id ? moi : x)) } : t));

  const doiTrangThai = async (yc: YeuCau, tt: TrangThaiYeuCau) => {
    if (tt === yc.trangThai) return;
    setDangDoi(yc.id);
    try {
      const kq = await suaYeuCauMua(yc.id, { trangThai: tt });
      thay(kq ?? { ...yc, trangThai: tt });
      // Huy hiệu: chỉ đổi khi chuyển vào / ra khỏi 'moi' (không tải lại cả danh sách)
      const lech = (tt === 'moi' ? 1 : 0) - (yc.trangThai === 'moi' ? 1 : 0);
      if (lech) onSoMoi(n => Math.max(0, n + lech));
      showToast(`Đã chuyển ${yc.maYeuCau} sang "${NHAN_TRANG_THAI_YEU_CAU[tt]}"`, 'success');
    } catch (e) {
      showToast(e instanceof LoiBanVatTu ? e.message : 'Không đổi được trạng thái, hãy thử lại', 'error');
    } finally {
      setDangDoi(null);
    }
  };

  const luuGhiChu = async (yc: YeuCau, ghiChuNoiBo: string | null): Promise<boolean> => {
    try {
      const kq = await suaYeuCauMua(yc.id, { ghiChuNoiBo });
      thay(kq ?? { ...yc, ghiChuNoiBo });
      showToast('Đã lưu ghi chú nội bộ', 'success');
      return true;
    } catch (e) {
      showToast(e instanceof LoiBanVatTu ? e.message : 'Không lưu được ghi chú, hãy thử lại', 'error');
      return false;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo trạng thái">
          {(['', ...DS_TRANG_THAI_YEU_CAU] as Array<TrangThaiYeuCau | ''>).map(t => (
            <button key={t || 'tat_ca'} type="button" onClick={() => setLoc(t)} aria-pressed={loc === t}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${loc === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {t ? NHAN_TRANG_THAI_YEU_CAU[t] : 'Tất cả'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setLanTai(n => n + 1)} disabled={tai.loai === 'dang_tai'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={13} className={tai.loai === 'dang_tai' ? 'animate-spin' : ''} /> Tải lại
        </button>
      </div>

      {tai.loai === 'dang_tai' && (
        <div aria-busy="true" aria-label="Đang tải yêu cầu mua" className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200/70" />)}
        </div>
      )}

      {tai.loai === 'loi' && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm text-slate-600">{tai.thongBao}</p>
          <button type="button" onClick={() => setLanTai(n => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCw size={14} /> Thử lại
          </button>
        </div>
      )}

      {/* Máy chủ chưa có bảng yêu cầu (chưa chạy SQL trang khách): danh sách rỗng KHÔNG có nghĩa là chưa ai gửi */}
      {tai.loai === 'xong' && tai.canhBao && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{tai.canhBao} — khách gửi yêu cầu lúc này sẽ bị báo lỗi.</span>
        </div>
      )}

      {tai.loai === 'xong' && !tai.canhBao && tai.ds.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-500">
          <Inbox className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
          {loc ? `Không có yêu cầu "${NHAN_TRANG_THAI_YEU_CAU[loc]}".` : 'Chưa có yêu cầu mua nào. Gửi link trang khách cho khách qua Zalo / email.'}
        </div>
      )}

      {tai.loai === 'xong' && tai.ds.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {['Yêu cầu', 'Khách', 'Vật tư cần mua', 'Ghi chú của khách', 'Trạng thái', 'Ghi chú nội bộ'].map(h => (
                  <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tai.ds.map(yc => (
                <tr key={yc.id} className={`border-b border-slate-100 align-top ${yc.trangThai === 'moi' ? 'bg-sky-50/40' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-2">
                    <p className="font-mono text-xs font-semibold text-slate-900">{yc.maYeuCau}</p>
                    <p className="text-xs text-slate-500">{nhanGio(yc.createdAt) || '—'}</p>
                  </td>
                  <td className="min-w-[11rem] px-3 py-2">
                    <p className="font-medium text-slate-900">{yc.tenKhach || '—'}</p>
                    {yc.sdt && (
                      <a href={linkGoi(yc.sdt)} className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline">
                        <Phone size={11} /> {yc.sdt}
                      </a>
                    )}
                    {yc.congTy && <p className="text-xs text-slate-600">{yc.congTy}</p>}
                    {yc.email && <a href={`mailto:${yc.email}`} className="block break-all text-xs text-slate-500 hover:underline">{yc.email}</a>}
                  </td>
                  <td className="min-w-[14rem] px-3 py-2">
                    <ul className="space-y-0.5">
                      {yc.items.map((x, i) => (
                        <li key={`${x.ma}|${i}`} className="text-xs">
                          <button type="button" onClick={() => onMoMa(x.ma)} title="Mở chi tiết mã ở thẻ Hàng tồn"
                            className="font-mono text-slate-500 hover:text-slate-900 hover:underline">{x.ma}</button>
                          <span className="text-slate-700"> {x.ten ?? ''}</span>
                          <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900"> × {dinhDangSoLuong(x.soLuong, x.dvt)}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="max-w-[16rem] px-3 py-2 text-xs text-slate-600">
                    <span className="whitespace-pre-line break-words">{yc.ghiChu ?? '—'}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex items-center gap-1">
                      <select value={yc.trangThai} disabled={!coQuyenSua || dangDoi === yc.id} aria-label={`Trạng thái ${yc.maYeuCau}`}
                        onChange={e => doiTrangThai(yc, e.target.value as TrangThaiYeuCau)}
                        className={`rounded-lg border py-1 pl-2 pr-7 text-xs font-medium outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-80 ${MAU_TT[yc.trangThai]}`}>
                        {DS_TRANG_THAI_YEU_CAU.map(t => <option key={t} value={t}>{NHAN_TRANG_THAI_YEU_CAU[t]}</option>)}
                      </select>
                      {dangDoi === yc.id && <Loader2 size={13} className="animate-spin text-slate-400" />}
                    </div>
                    {yc.xuLyBoi && (
                      <p className="mt-0.5 text-[0.6875rem] text-slate-400">{yc.xuLyBoi}{yc.xuLyLuc ? ` · ${nhanGio(yc.xuLyLuc)}` : ''}</p>
                    )}
                  </td>
                  <td className="min-w-[12rem] px-3 py-2">
                    <GhiChuNoiBo key={`${yc.id}|${yc.ghiChuNoiBo ?? ''}`} yc={yc} coQuyenSua={coQuyenSua} onLuu={luuGhiChu} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tai.ds.length >= 500 && <p className="px-3 py-2 text-xs text-slate-500">Đang hiện 500 yêu cầu mới nhất — lọc theo trạng thái để xem thêm.</p>}
        </div>
      )}
    </div>
  );
}

export default YeuCauMua;
