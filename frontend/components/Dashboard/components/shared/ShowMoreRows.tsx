import { useState } from 'react';

/** Số dòng vẽ ban đầu / mỗi lần bấm "Xem thêm" của các bảng dài trên Tổng quan */
export const ROW_STEP = 50;

/** Giới hạn số dòng đang vẽ — chỉ cắt phần HIỂN THỊ, tổng cộng vẫn tính trên toàn bộ dòng */
export function useRowLimit(step = ROW_STEP) {
  const [limit, setLimit] = useState(step);
  return {
    limit,
    showMore: () => setLimit(l => l + step),
    showAll: () => setLimit(Infinity),
  };
}

interface ShowMoreRowsProps {
  shown: number;
  total: number;
  onMore: () => void;
  onAll: () => void;
  step?: number;
}

/** Dòng nút "Xem thêm 50" / "Xem tất cả (N)" dưới bảng; đã hiện đủ thì không vẽ gì */
export const ShowMoreRows = ({ shown, total, onMore, onAll, step = ROW_STEP }: ShowMoreRowsProps) => {
  if (shown >= total) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span>Đang hiện {shown} / {total} dòng</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onMore}
          className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
        >
          Xem thêm {Math.min(step, total - shown)}
        </button>
        <button
          onClick={onAll}
          className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
        >
          Xem tất cả ({total})
        </button>
      </div>
    </div>
  );
};
