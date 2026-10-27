import React, { useState } from 'react';
import { DataRow, ColumnDefinition } from '../../types';
import TrendChart from '../Dashboard/components/Dashboards/TrendChart';
import ByXuongChart from '../Dashboard/components/Dashboards/ByXuongChart';
import ByCongTrinhChart from '../Dashboard/components/Dashboards/ByCongTrinhChart';
import { TrendFilterProvider } from '../Dashboard/components/Dashboards/TrendFilterContext';
import SharedDateFilterBar from '../Dashboard/components/Dashboards/SharedDateFilterBar';
import TrendByCategoryChart from '../Dashboard/components/Dashboards/TrendByCategoryChart';

export type ChartSource = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';
type DisplayMetric = 'COUNT' | 'SUM';

interface ChartOverviewProps {
  source: ChartSource;
  title: string;
  // Không còn dùng: nút xem chi tiết của biểu đồ nay mở bảng dữ liệu nguồn (giữ để nơi gọi không phải sửa)
  productionData?: DataRow[];
  productionColumns?: ColumnDefinition[];
  currentUser?: string;
}

// Màu nhận diện từng nguồn — trùng màu cột trong các biểu đồ (THEME của TrendChart / ByXuongChart …)
const MAU: Record<ChartSource, string> = {
  order: '#ec4899', tkbv: '#3b82f6', pthsp: '#a855f7', inventory: '#14b8a6', export: '#f59e0b', stock: '#64748b',
};

const ChartOverview: React.FC<ChartOverviewProps> = ({ source, title }) => {
  const [displayMode, setDisplayMode] = useState<DisplayMetric>('COUNT');

  return (
    <TrendFilterProvider>
      <div className="h-full overflow-y-auto custom-scrollbar bg-[#f5f6f8]">
  <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
    <div className="flex items-center gap-2.5">
      <span className="h-3 w-3 rounded-sm" style={{ background: MAU[source] }} aria-hidden />
      <h1 className="page-title">{title}</h1>
    </div>
    <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Chế độ hiển thị">
      {([['COUNT', 'Số lượng'], ['SUM', 'Giá trị']] as const).map(([k, l]) => (
        <button key={k} onClick={() => setDisplayMode(k)} aria-pressed={displayMode === k}
          className={`rounded-md px-3 py-1 text-sm transition ${displayMode === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          {l}
        </button>
      ))}
    </div>
  </div>

  {/* Bọc thêm 1 div sticky ngay dưới header để ghim luôn thanh filter */}
  <div className="sticky top-[69px] z-10 bg-[#f5f6f8]">
    <SharedDateFilterBar showProductFilters />
  </div>

  <div className="p-6 space-y-6">
    <TrendChart source={source} embedded displayMode={displayMode} />
    <div className="-m-6">{/* bản lớn có sẵn lề p-6 riêng => bù lề cho thẳng hàng các khung khác */}<ByXuongChart source={source} displayMode={displayMode} /></div>
    <div className="-m-6"><ByCongTrinhChart source={source} displayMode={displayMode} /></div>
    <TrendByCategoryChart kind="phanloai" source={source} displayMode={displayMode} embedded />
    <TrendByCategoryChart kind="dvt" source={source} displayMode={displayMode} embedded />
  </div>
</div>
    </TrendFilterProvider>
  );
};

export default ChartOverview;
