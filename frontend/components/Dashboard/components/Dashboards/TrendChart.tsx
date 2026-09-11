import { useEffect, useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine,
} from 'recharts';
import { useTrendFilter, Granularity } from './TrendFilterContext';

type TrendSource = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';
export type DisplayMetric = 'COUNT' | 'SUM';

interface ApiPoint { period: string; total: number; totalCount: number; }
interface TrendPoint { period: string; total: number; }

const formatDecimal = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatShort = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 0 });

const formatLabel = (period: string, granularity: Granularity) => {
  const d = new Date(period);
  if (granularity === 'month') return `Th${d.getMonth() + 1}/${d.getFullYear()}`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

function formatChartData(points: ApiPoint[], granularity: Granularity, metric: DisplayMetric): TrendPoint[] {
  const pickValue = (p: ApiPoint) => (metric === 'COUNT' ? p.totalCount : p.total);
  return points.map((p) => ({
    period: formatLabel(p.period, granularity),
    total: pickValue(p),
  }));
}

const THEME: Record<TrendSource, { bar: string; barDark: string; label: string; unitValue: string }> = {
  order:     { bar: '#ec4899', barDark: '#be185d', label: 'Đơn hàng mới',    unitValue: 'Tổng trị giá (Triệu đồng)' },
  tkbv:      { bar: '#3b82f6', barDark: '#1d4ed8', label: 'Triển khai BV',    unitValue: 'Tổng trị giá (Triệu đồng)' },
  pthsp:     { bar: '#a855f7', barDark: '#7e22ce', label: 'Tính phiếu',       unitValue: 'Tổng trị giá (Triệu đồng)' },
  inventory: { bar: '#14b8a6', barDark: '#0f766e', label: 'Nhập kho',         unitValue: 'Tổng trị giá (Triệu đồng)' },
  export:    { bar: '#f59e0b', barDark: '#b45309', label: 'Xuất kho',         unitValue: 'Tổng trị giá (Triệu đồng)' },
  stock:     { bar: '#64748b', barDark: '#334155', label: 'Tồn kho',          unitValue: 'Tổng trị giá (Triệu đồng)' },
};

interface TrendChartProps {
  source: TrendSource;
  embedded?: boolean;
  displayMode: DisplayMetric;
}

export default function TrendChart({ source, embedded = false, displayMode }: TrendChartProps) {
  // Toàn bộ filter (ngày, granularity, xưởng, công trình, ĐVT, phân loại) đến từ SharedDateFilterBar / context
  const { granularity, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai } = useTrendFilter();

  const [raw, setRaw] = useState<ApiPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const theme = THEME[source];
  const unit = displayMode === 'COUNT' ? 'Số lượng HEX' : theme.unitValue;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ source, granularity });
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (xuong) params.set('xuong', xuong);
    if (congTrinh) params.set('congTrinh', congTrinh);
    if (dvt) params.set('dvt', dvt);
    if (phanLoai) params.set('phanLoai', phanLoai);

    fetch(`/api/trend?${params.toString()}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setRaw(d); })
      .catch(err => console.error(`Lỗi fetch /api/trend (${source}):`, err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, granularity, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai]);

  const chartData = useMemo(() => {
    return formatChartData(raw, granularity, displayMode);
  }, [raw, granularity, displayMode]);

  const avgAll = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((s, p) => s + p.total, 0);
    return Number((sum / chartData.length).toFixed(2));
  }, [chartData]);

  return (
    <div className={embedded ? 'mb-8' : 'p-6 space-y-4 h-full overflow-auto'}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
     <h4 className="text-xl font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
          <BarChart2 className="w-4 h-4" style={{ color: theme.bar }} />
          Xu hướng {theme.label} theo thời gian
        </h4>
      </div>

      <div className={`bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col ${embedded ? 'p-3 h-[320px]' : 'p-4 h-[480px]'}`}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
         <ComposedChart data={chartData} margin={{ top: embedded ? 40 : 48, right: embedded ? 90 : 110, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
          <YAxis
  tickFormatter={formatDecimal}
  tick={{ fontSize: 10, fill: '#64748b' }}
  width={55}
  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
/>
              <RechartsTooltip
                formatter={(v: number, name: string) => [formatDecimal(v), name]}
                labelFormatter={(l) => `Kỳ: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend verticalAlign="top" height={embedded ? 28 : 36} wrapperStyle={{ fontSize: embedded ? 11 : 13 }} />
            <Bar dataKey="total" name={unit} fill={theme.bar} radius={[4, 4, 0, 0]} barSize={embedded ? 22 : 30}>
  <LabelList
    dataKey="total"
    position="top"
    offset={10}
    formatter={(v: number) => v > 0 ? formatDecimal(v) : ''}
    fontSize={embedded ? 9 : 10}
    fill={theme.barDark}
  />
</Bar>
              {chartData.length > 0 && (
              <ReferenceLine
  y={avgAll}
  stroke="#16a34a"
  strokeWidth={2}
  strokeDasharray="6 4"
  label={(props: any) => {
    const { viewBox } = props;
    const text = `TB: ${formatShort(avgAll)}`;
    return (
      <text
        x={viewBox.x + viewBox.width + 8}
        y={viewBox.y}
        dy={4}
        textAnchor="start"
        fontSize={embedded ? 10 : 11}
        fontWeight={600}
        fill="#16a34a"
      >
        {text}
      </text>
    );
  }}
/>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Không có dữ liệu</div>
        )}
      </div>
    </div>
  );
}