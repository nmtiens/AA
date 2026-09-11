import { useEffect, useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine,
} from 'recharts';
import { useTrendFilter } from './TrendFilterContext';

type TrendSource = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';
export type DisplayMetric = 'COUNT' | 'SUM';

interface ApiCongTrinhPoint {
  congTrinhCode: string;
  congTrinhName: string;
  total: number;
  totalCount: number;
}
interface ChartPoint { congTrinh: string; total: number; }

const formatDecimal = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatShort = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 0 });

// Tách tên công trình thành nhiều dòng theo giới hạn số ký tự/dòng,
// thay vì cắt bằng "..." như trước — hiển thị ĐẦY ĐỦ tên, không mất chữ.
function wrapLabel(name: string, maxCharsPerLine: number, maxLines = 3): string[] {
  const words = name.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

// Custom tick cho trục Y — vẽ tên công trình trên nhiều dòng <tspan>
function WrappedYAxisTick(props: any) {
  const { x, y, payload, maxCharsPerLine, fontSize } = props;
  const lines = wrapLabel(payload.value as string, maxCharsPerLine);
  const lineHeight = fontSize + 2;
  const totalHeight = lines.length * lineHeight;
  const startY = -(totalHeight / 2) + lineHeight / 2;

  return (
    <text x={x} y={y} textAnchor="end" fill="#64748b" fontSize={fontSize}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startY : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

const THEME: Record<TrendSource, { bar: string; barDark: string; label: string; unitValue: string }> = {
  order:     { bar: '#ec4899', barDark: '#be185d', label: 'Đơn hàng mới', unitValue: 'Tổng trị giá (Triệu đồng)' },
  tkbv:      { bar: '#3b82f6', barDark: '#1d4ed8', label: 'Triển khai BV', unitValue: 'Tổng trị giá (Triệu đồng)' },
  pthsp:     { bar: '#a855f7', barDark: '#7e22ce', label: 'Tính phiếu', unitValue: 'Tổng trị giá (Triệu đồng)' },
  inventory: { bar: '#14b8a6', barDark: '#0f766e', label: 'Nhập kho', unitValue: 'Tổng trị giá (Triệu đồng)' },
  export:    { bar: '#f59e0b', barDark: '#b45309', label: 'Xuất kho', unitValue: 'Tổng trị giá (Triệu đồng)' },
  stock:     { bar: '#64748b', barDark: '#334155', label: 'Tồn kho', unitValue: 'Tổng trị giá (Triệu đồng)' },
};

interface ByCongTrinhChartProps {
  source: TrendSource;
  embedded?: boolean;
  displayMode: DisplayMetric;
  /** Giới hạn số công trình hiển thị (top N theo giá trị), mặc định 15 */
  topN?: number;
}

export default function ByCongTrinhChart({ source, embedded = false, displayMode, topN = 15 }: ByCongTrinhChartProps) {
  const { dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai } = useTrendFilter();

  const [raw, setRaw] = useState<ApiCongTrinhPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const theme = THEME[source];
  const unit = displayMode === 'COUNT' ? 'Số lượng HEX' : theme.unitValue;
  const isStock = source === 'stock';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ source });
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (!isStock && xuong) params.set('xuong', xuong);
    if (congTrinh) params.set('congTrinh', congTrinh);
    if (dvt) params.set('dvt', dvt);
    if (phanLoai) params.set('phanLoai', phanLoai);

    fetch(`/api/trend-by-congtrinh?${params.toString()}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setRaw(d); })
      .catch(err => console.error(`Lỗi fetch /api/trend-by-congtrinh (${source}):`, err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, isStock, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const pickValue = (p: ApiCongTrinhPoint) => (displayMode === 'COUNT' ? p.totalCount : p.total);
    return raw
      .map(p => ({ congTrinh: p.congTrinhName || p.congTrinhCode, total: pickValue(p) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, topN)
      .reverse();
  }, [raw, displayMode, topN]);

  const avgAll = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((s, p) => s + p.total, 0);
    return Number((sum / chartData.length).toFixed(2));
  }, [chartData]);

  // Số ký tự tối đa/dòng cho tên công trình — nhỏ hơn ở chế độ embedded vì khung hẹp hơn
  const maxCharsPerLine = embedded ? 18 : 24;
  const yAxisFontSize = embedded ? 9 : 10;
  // Width trục Y đủ rộng để chứa số ký tự/dòng đã chọn ở trên (ước lượng ~6px/ký tự)
  const yAxisWidth = maxCharsPerLine * (yAxisFontSize * 0.62) + 16;

  // Mỗi công trình có thể chiếm nhiều dòng — ước lượng số dòng tối đa cần thiết
  // để tính chiều cao mỗi hàng, tránh các dòng chữ đè lên nhau.
  const maxLinesNeeded = useMemo(() => {
    if (chartData.length === 0) return 1;
    return Math.max(...chartData.map(p => wrapLabel(p.congTrinh, maxCharsPerLine).length));
  }, [chartData, maxCharsPerLine]);

  const rowHeight = Math.max(embedded ? 28 : 34, maxLinesNeeded * (yAxisFontSize + 2) + 14);
  const chartHeight = Math.max(embedded ? 320 : 420, chartData.length * rowHeight + 60);

  return (
    <div className={embedded ? 'mb-8' : 'p-6 space-y-4 h-full overflow-auto'}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
      <h4 className="text-xl font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
          <BarChart2 className="w-4 h-4" style={{ color: theme.bar }} />
        Xu hướng {theme.label} theo công trình {topN ? `(Top ${topN})` : ''}
        </h4>
      </div>

      {isStock && (
        <div className={`${embedded ? 'mb-3' : 'bg-white rounded-xl border border-slate-100 p-3 shadow-sm mb-4'} text-xs text-slate-400`}>
          Dữ liệu tồn kho không có thông tin theo xưởng, chỉ lọc theo công trình.
        </div>
      )}

      <div
        className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col p-4"
        style={{ height: chartHeight }}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: embedded ? 70 : 90, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis
                type="number"
                tickFormatter={formatDecimal}
                tick={{ fontSize: 10, fill: '#64748b' }}
              />
              <YAxis
                type="category"
                dataKey="congTrinh"
                width={yAxisWidth}
                interval={0}
                tick={<WrappedYAxisTick maxCharsPerLine={maxCharsPerLine} fontSize={yAxisFontSize} />}
              />
              <RechartsTooltip
                formatter={(v: number, name: string) => [formatDecimal(v), name]}
                labelFormatter={(l) => `Công trình: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend verticalAlign="top" height={embedded ? 28 : 36} wrapperStyle={{ fontSize: embedded ? 11 : 13 }} />
              <Bar dataKey="total" name={unit} fill={theme.bar} radius={[0, 4, 4, 0]} barSize={embedded ? 16 : 20}>
                <LabelList dataKey="total" position="right" formatter={(v: number) => v > 0 ? formatDecimal(v) : ''} fontSize={embedded ? 9 : 10} fill={theme.barDark} />
              </Bar>
              {chartData.length > 0 && (
                <ReferenceLine
                  x={avgAll}
                  stroke="#16a34a"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  label={(props: any) => {
                    const { viewBox } = props;
                    const text = `TB: ${formatShort(avgAll)}`;
                    return (
                      <text
                        x={viewBox.x}
                        y={viewBox.y - 6}
                        textAnchor="middle"
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
