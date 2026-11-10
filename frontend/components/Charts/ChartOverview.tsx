import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DataRow, ColumnDefinition } from '../../types';
import TrendChart from '../Dashboard/components/Dashboards/TrendChart';
import ByXuongChart from '../Dashboard/components/Dashboards/ByXuongChart';
import ByCongTrinhChart from '../Dashboard/components/Dashboards/ByCongTrinhChart';
import BangXuongKy from '../Dashboard/components/Dashboards/BangXuongKy';
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

/** Khối gập: chỉ gọi API khi mở lần đầu */
const KhoiGap: React.FC<{ ten: string; children: React.ReactNode }> = ({ ten, children }) => {
  const [mo, setMo] = useState(false);
  const [daMo, setDaMo] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={mo}
        onClick={() => { setMo(v => !v); setDaMo(true); }}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-base font-semibold text-slate-900 hover:bg-slate-50"
      >
        {mo ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {ten}
      </button>
      {daMo && <div className={mo ? 'mt-3' : 'hidden'}>{children}</div>}
    </div>
  );
};

const ChartOverview: React.FC<ChartOverviewProps> = ({ source, title }) => {
  const [displayMode, setDisplayMode] = useState<DisplayMetric>('SUM');

  return (
    <TrendFilterProvider>
      <div className="h-full overflow-y-auto custom-scrollbar bg-[#f5f6f8]">
  {/* 1 lớp ghim duy nhất cho tiêu đề và thanh lọc */}
  <div className="sticky top-0 z-20 bg-[#f5f6f8]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
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
    <SharedDateFilterBar showProductFilters />
  </div>

  <div className="p-6 space-y-6">
    {source !== 'stock' && <BangXuongKy source={source} displayMode={displayMode} accentColor={MAU[source]} title={title} />}
    <TrendChart source={source} embedded displayMode={displayMode} />
    <ByXuongChart source={source} embedded displayMode={displayMode} />
    <KhoiGap ten="Theo công trình"><ByCongTrinhChart source={source} embedded displayMode={displayMode} /></KhoiGap>
    <KhoiGap ten="Theo phân loại"><TrendByCategoryChart kind="phanloai" source={source} displayMode={displayMode} embedded /></KhoiGap>
    <KhoiGap ten="Theo ĐVT"><TrendByCategoryChart kind="dvt" source={source} displayMode={displayMode} embedded /></KhoiGap>
  </div>
</div>
    </TrendFilterProvider>
  );
};

export default ChartOverview;
