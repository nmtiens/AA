import React, { useState } from 'react';
import TrendChart from '../Dashboard/components/Dashboards/TrendChart';
import ByXuongChart from '../Dashboard/components/Dashboards/ByXuongChart';
import ByCongTrinhChart from '../Dashboard/components/Dashboards/ByCongTrinhChart';
import { TrendFilterProvider } from '../Dashboard/components/Dashboards/TrendFilterContext';
import SharedDateFilterBar from '../Dashboard/components/Dashboards/SharedDateFilterBar';
import TrendByDvtChart from '../Dashboard/components/Dashboards/TrendByDvtChart';
import TrendByPhanLoaiChart from '../Dashboard/components/Dashboards/TrendByPhanLoaiChart';

export type ChartSource = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';
type DisplayMetric = 'COUNT' | 'SUM';

interface ChartOverviewProps {
  source: ChartSource;
  title: string;
}

const ChartOverview: React.FC<ChartOverviewProps> = ({ source, title }) => {
  const [displayMode, setDisplayMode] = useState<DisplayMetric>('COUNT');

  return (
    <TrendFilterProvider>
      <div className="h-full overflow-y-auto custom-scrollbar bg-wood-50">
  <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between sticky top-0 z-20">
    <h2 className="text-lg font-bold text-slate-800">{title}</h2>
    <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
      <button
        onClick={() => setDisplayMode('COUNT')}
        className={`px-3 py-1 text-xs font-bold rounded transition-all ${
          displayMode === 'COUNT' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Số lượng
      </button>
      <button
        onClick={() => setDisplayMode('SUM')}
        className={`px-3 py-1 text-xs font-bold rounded transition-all ${
          displayMode === 'SUM' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Giá trị
      </button>
    </div>
  </div>

  {/* Bọc thêm 1 div sticky ngay dưới header để ghim luôn thanh filter */}
  <div className="sticky top-[57px] z-10 bg-wood-50">
    <SharedDateFilterBar showProductFilters />
  </div>

  <div className="p-6 space-y-6">
    <TrendChart source={source} embedded displayMode={displayMode} />
    <ByXuongChart source={source} displayMode={displayMode} />
    <ByCongTrinhChart source={source} displayMode={displayMode} />
    <TrendByPhanLoaiChart source={source} displayMode={displayMode} embedded supportsPhanLoai />
    <TrendByDvtChart source={source} displayMode={displayMode} embedded supportsDvt />
  </div>
</div>
    </TrendFilterProvider>
  );
};

export default ChartOverview;