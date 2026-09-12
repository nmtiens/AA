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

/** 'yyyy-mm-dd' không phụ thuộc giờ/timezone */
const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Ngày thứ Hai của tuần chứa d (dùng làm key chuẩn hóa cho granularity 'week') */
function startOfWeekMonday(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 = CN, 1 = T2, ...
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date;
}

/** Ngày 1 đầu tháng chứa d (dùng làm key chuẩn hóa cho granularity 'month') */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Chuẩn hóa 1 period trả về từ API thành key so sánh được (yyyy-mm-dd) theo đúng granularity */
function periodKey(period: string, granularity: Granularity): string {
  const d = new Date(period);
  if (granularity === 'week') return toISO(startOfWeekMonday(d));
  if (granularity === 'month') return toISO(startOfMonth(d));
  return toISO(d);
}

/** Tự sinh đủ danh sách kỳ liên tục từ dateFrom -> dateTo theo granularity, không phụ thuộc dữ liệu API trả về */
function buildFullPeriodKeys(dateFrom: string, dateTo: string, granularity: Granularity): string[] {
  if (!dateFrom || !dateTo) return [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const keys: string[] = [];

  if (granularity === 'day') {
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur <= last) {
      keys.push(toISO(cur));
      cur.setDate(cur.getDate() + 1);
    }
  } else if (granularity === 'week') {
    let cur = startOfWeekMonday(start);
    const last = startOfWeekMonday(end);
    while (cur <= last) {
      keys.push(toISO(cur));
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    let cur = startOfMonth(start);
    const last = startOfMonth(end);
    while (cur <= last) {
      keys.push(toISO(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }
  return keys;
}

function formatChartData(
  points: ApiPoint[],
  granularity: Granularity,
  metric: DisplayMetric,
  dateFrom: string,
  dateTo: string,
): TrendPoint[] {
  const pickValue = (p: ApiPoint) => (metric === 'COUNT' ? p.totalCount : p.total);

  // Gom dữ liệu API trả về theo key đã chuẩn hóa, để tra cứu nhanh
  const dataMap = new Map<string, number>();
  points.forEach(p => {
    dataMap.set(periodKey(p.period, granularity), pickValue(p));
  });

  const fullKeys = buildFullPeriodKeys(dateFrom, dateTo, granularity);
  // Nếu thiếu dateFrom/dateTo thì KHÔNG fallback về dữ liệu thô nữa (tránh render vô hạn điểm)
  const keysToRender = fullKeys;

  return keysToRender.map(key => ({
    period: formatLabel(key, granularity),
    total: dataMap.get(key) ?? 0, // Không có dữ liệu -> 0, thay vì bỏ qua kỳ đó
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

  // Thiếu 1 trong 2 mốc ngày -> không hợp lệ, không fetch, không vẽ
  const hasValidRange = Boolean(dateFrom && dateTo);

  useEffect(() => {
    if (!hasValidRange) {
      setRaw([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ source, granularity });
    params.set('dateFrom', dateFrom);
    params.set('dateTo', dateTo);
    if (xuong) params.set('xuong', xuong);
    if (congTrinh) params.set('congTrinh', congTrinh);
    if (dvt) params.set('dvt', dvt);
    if (phanLoai) params.set('phanLoai', phanLoai);

    fetch(`/api/trend?${params.toString()}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { if (!cancelled) setRaw(Array.isArray(d) ? d : []); })
      .catch(err => {
        console.error(`Lỗi fetch /api/trend (${source}):`, err);
        if (!cancelled) setRaw([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, granularity, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai, hasValidRange]);

  const chartData = useMemo(() => {
    if (!hasValidRange) return [];
    return formatChartData(raw, granularity, displayMode, dateFrom, dateTo);
  }, [raw, granularity, displayMode, dateFrom, dateTo, hasValidRange]);

  const avgAll = useMemo(() => {
    // Riêng tồn kho ('stock'): chỉ tính trung bình trên các ngày CÓ dữ liệu
    // (bỏ qua các ngày = 0 do không có snapshot tồn kho vào ngày đó),
    // để không bị kéo trung bình xuống thấp một cách sai lệch.
    const pointsForAvg = source === 'stock'
      ? chartData.filter(p => p.total > 0)
      : chartData;

    if (pointsForAvg.length === 0) return 0;
    const sum = pointsForAvg.reduce((s, p) => s + p.total, 0);
    return Number((sum / pointsForAvg.length).toFixed(2));
  }, [chartData, source]);

  return (
    <div className={embedded ? 'mb-8' : 'p-6 space-y-4 h-full overflow-auto'}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h4 className="text-xl font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
          <BarChart2 className="w-4 h-4" style={{ color: theme.bar }} />
          Xu hướng {theme.label} theo thời gian
        </h4>
      </div>

      <div className={`bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col ${embedded ? 'p-3 h-[320px]' : 'p-4 h-[480px]'}`}>
        {!hasValidRange ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Vui lòng chọn đầy đủ khoảng ngày (Từ - Đến)
          </div>
        ) : loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
 <ComposedChart data={chartData} margin={{ top: embedded ? 40 : 48, right: embedded ? 130 : 150, left: 0, bottom: 0 }}>
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
                  formatter={(v: number) => formatDecimal(v)}
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
                    const text = `TB theo ngày: ${formatShort(avgAll)}`;
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