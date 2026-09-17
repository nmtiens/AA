import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, Eye, X } from 'lucide-react';
import {
  ComposedChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine,
} from 'recharts';
import { useTrendFilter, Granularity } from './TrendFilterContext';
import DetailDataModal from './DetailDataModal';
type TrendSource = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';
export type DisplayMetric = 'COUNT' | 'SUM';

interface ApiPoint { period: string; total: number; totalCount: number; }
interface TrendPoint { period: string; periodKey: string; total: number; }

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

  return fullKeys.map(key => ({
    period: formatLabel(key, granularity),
    periodKey: key,
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

// ================== Chi tiết dữ liệu (/api/detail) ==================
interface DetailResponse { rows: Record<string, any>[]; columns: string[]; truncated: boolean; }

const formatColumnLabel = (col: string) => col.toUpperCase().replace(/_/g, ' ');
const formatCellValue = (v: any) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return String(v);
};

// ================== Popover ghim ==================
// Đây là 1 <div> tự vẽ (absolute), KHÔNG dùng <Tooltip> của Recharts, vì Tooltip của
// Recharts luôn tự lắng nghe mousemove để tính lại vị trí -> dù ép coordinate cố định
// nó vẫn "chạy" theo chuột. Overlay tự vẽ này độc lập hoàn toàn nên đứng yên tuyệt đối.
interface PinnedPopoverProps {
  x: number;
  y: number;
  containerWidth: number;
  label: string;
  value: number;
  unit: string;
  onViewDetail: () => void;
  onClose: () => void;
}
function PinnedPopover({ x, y, containerWidth, label, value, unit, onViewDetail, onClose }: PinnedPopoverProps) {
  const POPOVER_WIDTH = 220;
  // Tránh popover bị tràn ra ngoài mép phải/trái của khung biểu đồ
  const clampedLeft = Math.min(Math.max(x, POPOVER_WIDTH / 2 + 8), containerWidth - POPOVER_WIDTH / 2 - 8);

  return (
    <div
      className="absolute z-50"
      style={{
        left: clampedLeft,
        top: y,
        transform: 'translate(-50%, -100%)',
        marginTop: -12,
        width: POPOVER_WIDTH,
      }}
    >
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 px-4 py-3 text-sm">
        <p className="text-slate-600">Kỳ: <span className="font-semibold text-slate-800">{label}</span></p>
        <p className="text-pink-600 font-semibold mt-0.5">{unit} : {formatDecimal(value)}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2 bg-indigo-50 rounded-full pl-3 pr-1.5 py-1.5">
          <button
            onClick={onViewDetail}
            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-xs font-semibold"
          >
            <Eye size={13} /> Xem chi tiết
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-red-500 hover:bg-white transition-colors"
            title="Đóng"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

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

  // Container ref để tính tọa độ popover tương đối với khung chứa biểu đồ
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);

  // Kỳ đang được "ghim" (đã click) + tọa độ hiển thị popover
  const [pinned, setPinned] = useState<{ point: TrendPoint; x: number; y: number } | null>(null);

  // Modal chi tiết dữ liệu
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState<Record<string, any>[]>([]);
  const [detailColumns, setDetailColumns] = useState<string[]>([]);
  const [detailTruncated, setDetailTruncated] = useState(false);

  const theme = THEME[source];
  const unit = displayMode === 'COUNT' ? 'Số lượng HEX' : theme.unitValue;

  // Thiếu 1 trong 2 mốc ngày -> không hợp lệ, không fetch, không vẽ
  const hasValidRange = Boolean(dateFrom && dateTo);

  // Theo dõi bề rộng khung chart để clamp popover không tràn mép
  useEffect(() => {
    if (!chartWrapRef.current) return;
    const el = chartWrapRef.current;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setWrapWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWrapWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!hasValidRange) {
      setRaw([]);
      setLoading(false);
      setPinned(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPinned(null); // bỏ ghim khi đổi bộ lọc/khoảng ngày, tránh xem nhầm dữ liệu cũ
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

  // Gọi /api/detail cho kỳ đang ghim — chỉ lấy dữ liệu khớp đúng kỳ + bộ lọc hiện tại
  const openDetailForPinned = async () => {
    if (!pinned) return;
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({
        source,
        dimension: 'period',
        value: pinned.point.periodKey,
        granularity,
      });
      if (xuong) params.set('xuong', xuong);
      if (congTrinh) params.set('congTrinh', congTrinh);
      if (dvt) params.set('dvt', dvt);
      if (phanLoai) params.set('phanLoai', phanLoai);

      const r = await fetch(`/api/detail?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: DetailResponse = await r.json();
      setDetailRows(data.rows || []);
      setDetailColumns(data.columns || []);
      setDetailTruncated(!!data.truncated);
    } catch (err) {
      console.error('Lỗi fetch /api/detail:', err);
      setDetailRows([]);
      setDetailColumns([]);
      setDetailTruncated(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // Bắt click ở CẤP CẢ BIỂU ĐỒ (không phải ở từng <Bar>). state.activePayload luôn
  // trả về đúng điểm dữ liệu của kỳ gần con trỏ nhất theo trục X, bất kể bấm vào
  // vùng trống phía trên cột hay đúng vào cột màu -> luôn ăn click, kể cả với các
  // cột giá trị 0, 2, 3... không còn phụ thuộc diện tích SVG thật của từng cột.
  const handleChartClick = (state: any, event: React.MouseEvent) => {
    if (!state || !state.activePayload || state.activePayload.length === 0) return;
    const point: TrendPoint = state.activePayload[0].payload;
    if (!point?.periodKey || !chartWrapRef.current) return;

    const rect = chartWrapRef.current.getBoundingClientRect();
    setPinned({
      point,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  return (
    <div className={embedded ? 'mb-8' : 'p-6 space-y-4 h-full overflow-auto'}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h4 className="text-xl font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
          <BarChart2 className="w-4 h-4" style={{ color: theme.bar }} />
          Xu hướng {theme.label} theo thời gian
        </h4>
      </div>

      {/* relative wrapper để đặt popover absolute bên trên biểu đồ */}
      <div
        ref={chartWrapRef}
        className={`relative bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col ${embedded ? 'p-3 h-[320px]' : 'p-4 h-[480px]'}`}
      >
        {!hasValidRange ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Vui lòng chọn đầy đủ khoảng ngày (Từ - Đến)
          </div>
        ) : loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: embedded ? 40 : 48, right: embedded ? 130 : 150, left: 0, bottom: 0 }}
              onClick={handleChartClick}
            >
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
              <Bar
                dataKey="total"
                name={unit}
                fill={theme.bar}
                radius={[4, 4, 0, 0]}
                barSize={embedded ? 22 : 30}
                cursor="pointer"
              >
                {/* Tô đậm cột đang được ghim để người dùng biết đang xem cột nào */}
                {chartData.map(entry => (
                  <Cell
                    key={entry.periodKey}
                    fill={pinned?.point.periodKey === entry.periodKey ? theme.barDark : theme.bar}
                  />
                ))}
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

        {/* Popover ghim, đứng yên tại tọa độ đã click cho tới khi bấm "✕" */}
        {pinned && (
          <PinnedPopover
            x={pinned.x}
            y={pinned.y}
            containerWidth={wrapWidth}
            label={pinned.point.period}
            value={pinned.point.total}
            unit={unit}
            onViewDetail={openDetailForPinned}
            onClose={() => setPinned(null)}
          />
        )}
      </div>

      {/* Modal chi tiết dữ liệu */}
     {/* Modal chi tiết dữ liệu */}
<DetailDataModal
  open={detailOpen}
  onClose={() => setDetailOpen(false)}
  title={`Chi tiết ${theme.label} — Kỳ: ${pinned?.point.period ?? ''}`}
  accentColor={theme.bar}
  rows={detailRows}
  columns={detailColumns}
  loading={detailLoading}
  truncated={detailTruncated}
/>
    </div>
  );
}