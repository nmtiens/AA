import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

// ============================================================================
// Xem ảnh / tệp từ LINK NGOÀI (Google Drive…) ngay trong app, không phải mở tab mới.
// Google Drive: thử tải thẳng ảnh (lh3.googleusercontent.com/d/<id> — chỉ được khi tệp chia sẻ công khai),
// không được thì nhúng trang xem trước của Drive (/file/d/<id>/preview — dùng đăng nhập Google của người xem).
// ============================================================================

const driveId = (url: string): string | null => {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/)
    || url.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : null;
};
const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);

/** Nguồn hiển thị cho 1 link: ảnh trực tiếp (nếu có) và trang nhúng dự phòng */
export const linkSources = (url: string): { img: string | null; frame: string | null } => {
  const id = driveId(url);
  if (id) return { img: `https://lh3.googleusercontent.com/d/${id}`, frame: `https://drive.google.com/file/d/${id}/preview` };
  if (isImageUrl(url)) return { img: url, frame: null };
  return { img: null, frame: url };
};

const Slide = ({ url }: { url: string }) => {
  const { img, frame } = linkSources(url);
  const [imgFailed, setImgFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => { setImgFailed(false); setZoom(false); }, [url]);
  if (img && !imgFailed) {
    return (
      <div className={`h-full w-full ${zoom ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden'}`}>
        <img
          src={img}
          alt=""
          onError={() => setImgFailed(true)}
          onClick={() => setZoom(z => !z)}
          title={zoom ? 'Bấm để thu nhỏ' : 'Bấm để phóng to'}
          className={zoom ? 'w-[220%] max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain'}
        />
      </div>
    );
  }
  if (frame) {
    return <iframe src={frame} title="Xem trước" allow="autoplay" className="h-full w-full rounded-lg border-0 bg-white" />;
  }
  return <p className="text-sm text-white/70">Không xem trước được link này.</p>;
};

export function LinkLightbox({ urls, start = 0, title, onClose }: {
  urls: string[]; start?: number; title?: string; onClose: () => void;
}) {
  const [idx, setIdx] = useState(Math.min(Math.max(start, 0), Math.max(urls.length - 1, 0)));
  const go = (d: number) => setIdx(i => (i + d + urls.length) % urls.length);

  // Bắt phím ở pha capture để Esc / mũi tên không rơi xuống cửa sổ bên dưới
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft') { e.stopPropagation(); go(-1); }
      else if (e.key === 'ArrowRight') { e.stopPropagation(); go(1); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.length]);

  if (urls.length === 0) return null;
  const url = urls[idx];
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-white" onClick={e => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title ?? 'Ảnh'}</p>
          <p className="text-xs text-white/60">{idx + 1} / {urls.length}{urls.length > 1 ? ' · phím ← → để chuyển' : ''} · Esc để đóng</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/15 hover:text-white"
            title="Mở link gốc ở tab mới"
          >
            <ExternalLink size={13} /> Mở link gốc
          </a>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-2 text-white/80 hover:bg-white/15 hover:text-white">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 px-14 pb-2" onClick={e => e.stopPropagation()}>
        <Slide url={url} />
        {urls.length > 1 && <>
          <button type="button" onClick={() => go(-1)} aria-label="Ảnh trước"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/30">
            <ChevronLeft size={22} />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Ảnh sau"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/30">
            <ChevronRight size={22} />
          </button>
        </>}
      </div>

      {urls.length > 1 && (
        <div className="flex justify-center gap-1.5 px-4 pb-3" onClick={e => e.stopPropagation()}>
          {urls.map((u, i) => (
            <button
              key={u + i}
              type="button"
              onClick={() => setIdx(i)}
              className={`h-7 min-w-7 rounded px-1.5 text-xs font-semibold ${i === idx ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/30'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
