import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, EyeOff, Globe, Loader2, RotateCcw, X } from 'lucide-react';
import { muonAnhNoiBo, type AnhNoiBo, type TrangThaiAnh } from '../../services/banVatTuApi';
import { anhCanDuyet, chuThichAnh } from './xuLy';

// ============================================================================
// ẢNH NỘI BỘ của trang Bán vật tư (ảnh mẫu duyệt ở sheet 03_MATERIALS công trình, API cần token):
// - AnhNoiBoImg: chỉ tải khi ô ảnh sắp vào màn hình (IntersectionObserver), mượn objectURL qua muonAnhNoiBo và trả
//   lại khi bỏ (bộ nhớ dùng chung tự thu hồi objectURL thừa). Lỗi / chưa tải => `duPhong`.
// - XemAnhNoiBo: xem ảnh lớn (‹ › / phím ←→), chú thích công trình + code vật liệu; người có quyền sửa có nút
//   "Đúng ảnh" / "Ẩn ảnh" / "Bỏ duyệt" và "Hiện cho khách" / "Ẩn khỏi trang khách" (ảnh công khai ở trang khách).
// ============================================================================

/** objectURL của ảnh nội bộ khi `bat` = true; null khi chưa tải xong; loi = true khi tải lỗi */
function useAnhNoiBo(id: number, bat: boolean): { url: string | null; loi: boolean } {
  const [kq, setKq] = useState<{ id: number; url: string | null; loi: boolean }>({ id, url: null, loi: false });
  useEffect(() => {
    if (!bat) return;
    let conSong = true;
    const m = muonAnhNoiBo(id);
    m.hua.then(url => { if (conSong) setKq({ id, url, loi: false }); })
      .catch((e: unknown) => {
        // Bị huỷ do bỏ ô ảnh => không báo lỗi
        if (conSong && (e as { name?: unknown } | null)?.name !== 'AbortError') setKq({ id, url: null, loi: true });
      });
    return () => { conSong = false; m.tra(); };
  }, [id, bat]);
  return kq.id === id ? { url: kq.url, loi: kq.loi } : { url: null, loi: false };
}

/** Đã (từng) vào gần màn hình chưa — tải lười. Trình duyệt không có IntersectionObserver => tải luôn */
function useDaThay<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [thay, setThay] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (thay) return;
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { setThay(true); ob.disconnect(); }
    }, { rootMargin: '300px 0px' });
    ob.observe(el);
    return () => ob.disconnect();
  }, [thay]);
  return [ref, thay];
}

export function AnhNoiBoImg({ anh, alt, className, duPhong, lazy = true, contain }: {
  anh: AnhNoiBo; alt: string; className: string;
  /** Hiện khi lỗi tải */
  duPhong: React.ReactNode;
  lazy?: boolean;
  contain?: boolean;
}) {
  const [ref, thay] = useDaThay<HTMLDivElement>();
  const { url, loi } = useAnhNoiBo(anh.id, !lazy || thay);
  if (loi) return <>{duPhong}</>;
  if (!url) return <div ref={ref} className={`${className} animate-pulse bg-slate-200`} aria-label="Đang tải ảnh" />;
  return <img src={url} alt={alt} decoding="async" className={`${className} ${contain ? 'object-contain' : 'bg-slate-100 object-cover'}`} />;
}

/** Nhãn nhỏ trên ảnh máy ghép từ dòng 03 nhiều mã, chưa duyệt */
export function NhanCanDuyet({ anh, nho }: { anh: AnhNoiBo; nho?: boolean }) {
  if (!anhCanDuyet(anh)) return null;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded bg-amber-500/90 font-medium text-white ${nho ? 'px-1 py-px text-[0.5625rem]' : 'px-1.5 py-0.5 text-[0.625rem]'}`}
      title="Ảnh lấy từ dòng sheet 03 có nhiều mã vật tư — có thể là ảnh của mã khác, cần người duyệt">
      ảnh mẫu CT — cần duyệt
    </span>
  );
}

/** Nhãn nhỏ "Khách thấy" trên ảnh đang công khai ở trang khách */
export function NhanAnhCongKhai({ anh, nho }: { anh: AnhNoiBo; nho?: boolean }) {
  if (!anh.congKhai) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded bg-sky-600/90 font-medium text-white ${nho ? 'px-1 py-px text-[0.5625rem]' : 'px-1.5 py-0.5 text-[0.625rem]'}`}
      title="Ảnh này hiện ở trang khách (khi mã đã đăng và đang bán)">
      <Globe size={nho ? 8 : 10} /> Khách thấy
    </span>
  );
}

export function XemAnhNoiBo({ ds, start, ten, coQuyenSua, dangDoi, onDoi, onDoiCongKhai, onDong }: {
  ds: AnhNoiBo[];
  start: number;
  ten: string;
  coQuyenSua: boolean;
  /** id ảnh đang gửi PUT */
  dangDoi: number | null;
  onDoi: (anh: AnhNoiBo, tt: TrangThaiAnh) => void;
  /** Bật / tắt "Hiện cho khách" (không truyền => không có nút) */
  onDoiCongKhai?: (anh: AnhNoiBo, bat: boolean) => void;
  onDong: () => void;
}) {
  // Nhớ ẢNH đang xem theo id (không theo số thứ tự): duyệt xong danh sách xếp lại (ảnh đã duyệt lên đầu) thì vẫn
  // đứng ở đúng ảnh đó; ảnh vừa bị ẩn (không còn trong ds) => ảnh ở vị trí cũ, kẹp trong khoảng
  const [dangXem, setDangXem] = useState(() => {
    const i0 = Math.min(Math.max(start, 0), Math.max(ds.length - 1, 0));
    return { id: ds[i0]?.id ?? null, viTri: i0 };
  });
  const n = ds.length;
  const timThay = dangXem.id === null ? -1 : ds.findIndex(x => x.id === dangXem.id);
  const i = timThay >= 0 ? timThay : Math.min(dangXem.viTri, Math.max(n - 1, 0));
  const a = ds[i];
  const den = useCallback((j: number) => {
    if (!n) return;
    const k = ((j % n) + n) % n;
    setDangXem({ id: ds[k]?.id ?? null, viTri: k });
  }, [ds, n]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (n < 2) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); den(i - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); den(i + 1); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [n, i, den]);

  useEffect(() => { if (n === 0) onDong(); }, [n, onDong]);
  if (!a) return null;
  const dang = dangDoi === a.id;

  return createPortal(
    <div className="fixed inset-0 z-[10010] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={`Ảnh ${ten}`}
      onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-3 text-white sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{chuThichAnh(a)}</p>
          <p className="text-xs text-white/60">
            Ảnh {i + 1}/{n}
            {a.trangThai === 'da_duyet' ? ' · đã xác nhận đúng ảnh' : anhCanDuyet(a) ? ' · dòng 03 nhiều mã — cần duyệt' : ' · dòng 03 chỉ có mã này'}
            {a.congKhai ? ' · khách thấy ảnh này' : ' · chỉ nội bộ'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {coQuyenSua && (
            <>
              {a.trangThai !== 'da_duyet' ? (
                <button type="button" disabled={dang} onClick={() => onDoi(a, 'da_duyet')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60">
                  {dang ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Đúng ảnh
                </button>
              ) : (
                <button type="button" disabled={dang} onClick={() => onDoi(a, 'tu_dong')} title="Bỏ xác nhận, trả về ảnh máy tự ghép"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60">
                  {dang ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Bỏ duyệt
                </button>
              )}
              <button type="button" disabled={dang} onClick={() => onDoi(a, 'an')} title="Ảnh không phải của mã này — ẩn khỏi trang"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60">
                <EyeOff size={14} /> Ẩn ảnh
              </button>
              {onDoiCongKhai && (
                <button type="button" disabled={dang} onClick={() => onDoiCongKhai(a, !a.congKhai)}
                  title={a.congKhai ? 'Thôi hiện ảnh này ở trang khách' : 'Hiện ảnh này ở trang khách — kiểm tra không có chữ viết tay / tên công trình'}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${a.congKhai ? 'text-white/80 hover:bg-white/10' : 'bg-sky-600 text-white hover:bg-sky-500'}`}>
                  {a.congKhai ? <EyeOff size={14} /> : <Globe size={14} />} {a.congKhai ? 'Ẩn khỏi trang khách' : 'Hiện cho khách'}
                </button>
              )}
            </>
          )}
          <button type="button" onClick={onDong} aria-label="Đóng" className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6">
        <AnhNoiBoImg key={a.id} anh={a} alt={chuThichAnh(a)} lazy={false} contain className="max-h-full max-w-full rounded-lg"
          duPhong={<p className="text-sm text-white/70">Không tải được ảnh.</p>} />
        {n > 1 && (
          <>
            <button type="button" onClick={() => den(i - 1)} aria-label="Ảnh trước"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25">
              <ChevronLeft size={24} />
            </button>
            <button type="button" onClick={() => den(i + 1)} aria-label="Ảnh sau"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25">
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
