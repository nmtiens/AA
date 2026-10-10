import React, { useCallback, useEffect, useRef, useState } from 'react';

interface LazyRenderProps {
  children: React.ReactNode;
  /** Chiều cao tối thiểu của khung giữ chỗ (px) — gần với chiều cao thật để thanh cuộn ít nhảy */
  minHeight?: number;
  /** Vẽ thật khi khung giữ chỗ còn cách vùng nhìn bao nhiêu px */
  rootMarginPx?: number;
  /** true = vẽ ngay không chờ cuộn tới (vd. vừa bấm nút cuộn tới section này) */
  force?: boolean;
  /** Ref đặt trên khung bọc ngoài (có cả lúc đang là khung giữ chỗ) — dùng cho scrollIntoView */
  anchorRef?: React.Ref<HTMLDivElement>;
  className?: string;
  id?: string;
}

// Phần tử cha gần nhất tự cuộn (overflow auto/scroll) — làm root cho IntersectionObserver,
// vì rootMargin chỉ nới rộng root: để root = viewport thì khung cuộn của trang vẫn cắt mất phần nới.
const findScrollParent = (el: HTMLElement): Element | null => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
  }
  return null;
};

const hasIO = () => typeof window !== 'undefined' && 'IntersectionObserver' in window;

/**
 * Chỉ vẽ nội dung khi khung giữ chỗ đã gần vùng nhìn (IntersectionObserver). Đã vẽ thì giữ nguyên,
 * không bỏ vẽ khi cuộn ra. Trình duyệt không có IntersectionObserver -> vẽ ngay.
 */
export const LazyRender: React.FC<LazyRenderProps> = ({
  children,
  minHeight = 400,
  rootMarginPx = 600,
  force = false,
  anchorRef,
  className = '',
  id,
}) => {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(() => !hasIO());
  // Đã bị ép vẽ 1 lần thì giữ luôn (force tắt sau đó cũng không bỏ vẽ)
  if (force && !visible) setVisible(true);
  const shown = visible || force;

  // Gắn cả ref nội bộ (để quan sát) lẫn ref bên ngoài (để cuộn tới)
  const setNode = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    if (typeof anchorRef === 'function') anchorRef(node);
    else if (anchorRef) (anchorRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [anchorRef]);

  useEffect(() => {
    if (shown) return;
    const node = nodeRef.current;
    if (!node) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { root: findScrollParent(node), rootMargin: `${rootMarginPx}px 0px` });
    io.observe(node);
    return () => io.disconnect();
  }, [shown, rootMarginPx]);

  return (
    // empty:hidden: section tự trả null (không có dữ liệu) thì khung bọc không chiếm khoảng trống
    <div ref={setNode} id={id} className={`empty:hidden ${className}`}>
      {shown ? children : (
        <div
          className="w-full flex items-center justify-center rounded-xl border border-slate-100 bg-white/60 text-xs text-slate-400"
          style={{ minHeight }}
        >
          Đang tải…
        </div>
      )}
    </div>
  );
};
