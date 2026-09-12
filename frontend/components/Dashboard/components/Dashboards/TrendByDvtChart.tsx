import { useEffect, useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine,
} from 'recharts';
import { useTrendFilter } from './TrendFilterContext';

type TrendSource = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';
export type DisplayMetric = 'COUNT' | 'SUM';

interface ApiDvtPoint {
  dvtCode: string;
  dvtName: string;
  total: number;
  totalCount: number;
}
interface ChartPoint { dvt: string; total: number; }

const formatDecimal = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatShort = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 0 });

const THEME: Record<TrendSource, { bar: string; barDark: string; label: string; unitValue: string }> = {
  order:     { bar: '#ec4899', barDark: '#be185d', label: 'Đơn hàng mới', unitValue: 'Tổng trị giá (Triệu đồng)' },
  tkbv:      { bar: '#3b82f6', barDark: '#1d4ed8', label: 'Triển khai BV', unitValue: 'Tổng trị giá (Triệu đồng)' },
  pthsp:     { bar: '#a855f7', barDark: '#7e22ce', label: 'Tính phiếu', unitValue: 'Tổng trị giá (Triệu đồng)' },
  inventory: { bar: '#14b8a6', barDark: '#0f766e', label: 'Nhập kho', unitValue: 'Tổng trị giá (Triệu đồng)' },
  export:    { bar: '#f59e0b', barDark: '#b45309', label: 'Xuất kho', unitValue: 'Tổng trị giá (Triệu đồng)' },
  stock:     { bar: '#64748b', barDark: '#334155', label: 'Tồn kho', unitValue: 'Tổng trị giá (Triệu đồng)' },
};

interface TrendByDvtChartProps {
  source: TrendSource;
  embedded?: boolean;
  displayMode: DisplayMetric;
  /** Nguồn không có dữ liệu theo ĐVT (vd: stock) — hiển thị cảnh báo thay vì gọi API */
  supportsDvt?: boolean;
}

export default function TrendByDvtChart({
  source,
  embedded = false,
  displayMode,
  supportsDvt = true,
}: TrendByDvtChartProps) {
  const { dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai } = useTrendFilter();

  const [raw, setRaw] = useState<ApiDvtPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const theme = THEME[source];
  const unit = displayMode === 'COUNT' ? 'Số lượng HEX' : theme.unitValue;

  // Thiếu 1 trong 2 mốc ngày, hoặc nguồn không hỗ trợ ĐVT -> không fetch
  const hasValidRange = Boolean(dateFrom && dateTo);
  const canFetch = hasValidRange && supportsDvt;

  useEffect(() => {
    if (!canFetch) {
      setRaw([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ source });
    params.set('dateFrom', dateFrom);
    params.set('dateTo', dateTo);
    if (xuong) params.set('xuong', xuong);
    if (congTrinh) params.set('congTrinh', congTrinh);
    if (phanLoai) params.set('phanLoai', phanLoai);
    // Không set 'dvt' vào params vì đây chính là chiều đang nhóm dữ liệu theo,
    // nhưng vẫn gửi lên nếu người dùng đã chọn ở bộ lọc chung để API tôn trọng đúng phạm vi.
    if (dvt) params.set('dvt', dvt);

    fetch(`/api/trend-by-dvt?${params.toString()}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { if (!cancelled) setRaw(Array.isArray(d) ? d : []); })
      .catch(err => {
        console.error(`Lỗi fetch /api/trend-by-dvt (${source}):`, err);
        if (!cancelled) setRaw([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai, canFetch]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!canFetch) return [];
    const pickValue = (p: ApiDvtPoint) => (displayMode === 'COUNT' ? p.totalCount : p.total);
    return raw
      .map(p => ({ dvt: p.dvtName || p.dvtCode, total: pickValue(p) }))
      .sort((a, b) => b.total - a.total);
  }, [raw, displayMode, canFetch]);

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
          Xu hướng {theme.label} theo đơn vị tính
        </h4>
      </div>

      {!supportsDvt && (
        <div className={`${embedded ? 'mb-3' : 'bg-white rounded-xl border border-slate-100 p-3 shadow-sm mb-4'} text-xs text-slate-400`}>
          Dữ liệu nguồn này không có thông tin đơn vị tính.
        </div>
      )}

      <div className={`bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col ${embedded ? 'p-3 h-[320px]' : 'p-4 h-[480px]'}`}>
        {!supportsDvt ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Không áp dụng cho nguồn dữ liệu này
          </div>
        ) : !hasValidRange ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Vui lòng chọn đầy đủ khoảng ngày (Từ - Đến)
          </div>
        ) : loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: embedded ? 24 : 30, right: embedded ? 90 : 110, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="dvt" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
              <YAxis tickFormatter={formatDecimal} tick={{ fontSize: 10, fill: '#64748b' }} width={55} />
              <RechartsTooltip
                formatter={(v: number, name: string) => [formatDecimal(v), name]}
                labelFormatter={(l) => `ĐVT: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend verticalAlign="top" height={embedded ? 28 : 36} wrapperStyle={{ fontSize: embedded ? 11 : 13 }} />
              <Bar dataKey="total" name={unit} fill={theme.bar} radius={[4, 4, 0, 0]} barSize={embedded ? 22 : 30}>
                <LabelList dataKey="total" position="top" formatter={(v: number) => v > 0 ? formatDecimal(v) : ''} fontSize={embedded ? 9 : 10} fill={theme.barDark} />
              </Bar>
              {chartData.length > 0 && (
                <ReferenceLine
                  y={avgAll}
                  stroke="#16a34a"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  label={(props: any) => {
                    const { viewBox } = props;
                    const text = `TB theo đvt: ${formatShort(avgAll)}`;
                    return (
                      <text
                        x={viewBox.x + viewBox.width + 4}
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