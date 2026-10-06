import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { fetchVuongMacPhotoUrl } from '../../services/vuongMacService';

// ============================================================================
// Ảnh đính kèm vướng mắc — dùng chung cho app điện thoại và web.
// API ảnh cần token nên không gắn thẳng URL vào <img>: tải bằng fetch -> objectURL
// (fetchVuongMacPhotoUrl có cache theo id ảnh).
// ============================================================================

export function AuthImg({ id, className, onClick, alt = '' }: {
  id: number;
  className?: string;
  onClick?: () => void;
  alt?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(null); setFailed(false);
    fetchVuongMacPhotoUrl(id).then(u => alive && setUrl(u)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [id]);

  if (failed) {
    return <div className={`flex items-center justify-center bg-slate-100 text-sm text-slate-400 ${className ?? ''}`}>Lỗi ảnh</div>;
  }
  if (!url) return <div className={`animate-pulse bg-slate-200 ${className ?? ''}`} />;
  return <img src={url} alt={alt} onClick={onClick} className={className} />;
}

/** Hàng ảnh thu nhỏ: hiện tối đa `max` ảnh, ảnh cuối phủ "+N" nếu còn nhiều hơn. */
export function PhotoThumbs({ ids, onOpen, max = 4, size = 'h-16 w-16' }: {
  ids: number[];
  onOpen: (index: number) => void;
  max?: number;
  size?: string;
}) {
  if (ids.length === 0) return null;
  const shown = ids.slice(0, max);
  const more = ids.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((pid, i) => {
        const overlay = more > 0 && i === shown.length - 1;
        return (
          <button
            key={pid}
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(i); }}
            title="Bấm để xem ảnh"
            className={`relative ${size} shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10 transition-opacity hover:opacity-90`}
          >
            <AuthImg id={pid} className="h-full w-full object-cover" alt={`Ảnh ${i + 1}`} />
            {overlay && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">
                +{more + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Xem ảnh lớn trên web: ‹ › hoặc phím ←/→ để chuyển, Esc để đóng, mở ảnh gốc ở tab mới. */
export function PhotoViewer({ ids, start, onClose }: { ids: number[]; start: number; onClose: () => void }) {
  const [idx, setIdx] = useState(Math.min(Math.max(start, 0), ids.length - 1));
  const go = (d: number) => setIdx(i => (i + d + ids.length) % ids.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
      else if (e.key === 'ArrowLeft' && ids.length > 1) { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight' && ids.length > 1) { e.preventDefault(); go(1); }
    };
    // capture: Esc chỉ đóng trình xem ảnh, không đóng luôn các popup phía sau
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.length, onClose]);

  const openOriginal = async () => {
    try { window.open(await fetchVuongMacPhotoUrl(ids[idx]), '_blank', 'noopener'); } catch { /* ảnh lỗi: bỏ qua */ }
  };

  if (ids.length === 0) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10010] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between px-5 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm text-white/80">Ảnh {idx + 1}/{ids.length}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openOriginal}
            title="Mở ảnh gốc ở tab mới"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <ExternalLink size={15} /> Mở ảnh gốc
          </button>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-6">
        <div onClick={(e) => e.stopPropagation()} className="flex h-full w-full items-center justify-center">
          <AuthImg key={ids[idx]} id={ids[idx]} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
        {ids.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label="Ảnh trước"
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label="Ảnh sau"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
