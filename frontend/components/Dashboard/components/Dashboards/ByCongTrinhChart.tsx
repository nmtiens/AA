import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, Eye, X } from 'lucide-react';
import {
  ComposedChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine,
} from 'recharts';
import { useTrendFilter } from './TrendFilterContext';
import DetailDataModal from './DetailDataModal';
type TrendSource = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';
export type DisplayMetric = 'COUNT' | 'SUM';

interface ApiCongTrinhPoint {
  congTrinhCode: string;
  congTrinhName: string;
  total: number;
  totalCount: number;
}
// MỚI: giữ lại congTrinhCode gốc (dùng để gọi /api/detail khớp chính xác với DB,
// vì backend so khớp bằng "=" chứ không uppercase/trim lại như các dimension khác)
interface ChartPoint { congTrinh: string; congTrinhCode: string; total: number; }

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

// ================== Chi tiết dữ liệu (/api/detail) ==================
interface DetailResponse { rows: Record<string, any>[]; columns: string[]; truncated: boolean; }

const formatColumnLabel = (col: string) => col.toUpperCase().replace(/_/g, ' ');
const formatCellValue = (v: any) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return String(v);
};

// ================== Popover ghim ==================
// <div> tự vẽ (absolute), KHÔNG dùng <Tooltip> của Recharts — Tooltip của Recharts
// luôn tự lắng nghe mousemove để tính lại vị trí nên dù ép coordinate cố định vẫn
// "chạy" theo chuột. Overlay tự vẽ này độc lập hoàn toàn nên đứng yên tuyệt đối.
interface PinnedPopoverProps {
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
  label: string;
  value: number;
  unit: string;
  onViewDetail: () => void;
  onClose: () => void;
}
function PinnedPopover({ x, y, containerWidth, containerHeight, label, value, unit, onViewDetail, onClose }: PinnedPopoverProps) {
  const POPOVER_WIDTH = 240;
  const POPOVER_HEIGHT_EST = 110;
  // Tránh popover bị tràn ra ngoài mép của khung biểu đồ (cả 4 phía) —
  // với biểu đồ ngang (theo công trình), điểm bấm có thể ở gần rìa trên/dưới.
  const clampedLeft = Math.min(Math.max(x, POPOVER_WIDTH / 2 + 8), containerWidth - POPOVER_WIDTH / 2 - 8);
  const clampedTop = Math.min(Math.max(y, POPOVER_HEIGHT_EST + 8), containerHeight - 8);

  return (
    <div
      className="absolute z-50"
      style={{
        left: clampedLeft,
        top: clampedTop,
        transform: 'translate(-50%, -100%)',
        marginTop: -12,
        width: POPOVER_WIDTH,
      }}
    >
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 px-4 py-3 text-sm">
        <p className="text-slate-600">Công trình: <span className="font-semibold text-slate-800">{label}</span></p>
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

interface ByCongTrinhChartProps {
  source: TrendSource;
  embedded?: boolean;
  displayMode: DisplayMetric;
  /** Giới hạn số công trình hiển thị (top N theo giá trị), mặc định 15 */
  topN?: number;
}

export default function ByCongTrinhChart({ source, embedded = false, displayMode, topN = 15 }: ByCongTrinhChartProps) {
const { dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai, hasCtWhitelist, ctWhitelistCsv } = useTrendFilter();

  const [raw, setRaw] = useState<ApiCongTrinhPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Container ref để tính tọa độ popover tương đối với khung chứa biểu đồ
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);
  const [wrapHeight, setWrapHeight] = useState(0);

  // Công trình đang được "ghim" (đã click) + tọa độ hiển thị popover
  const [pinned, setPinned] = useState<{ point: ChartPoint; x: number; y: number } | null>(null);

  // Modal chi tiết dữ liệu
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState<Record<string, any>[]>([]);
  const [detailColumns, setDetailColumns] = useState<string[]>([]);
  const [detailTruncated, setDetailTruncated] = useState(false);

  const theme = THEME[source];
  const unit = displayMode === 'COUNT' ? 'Số lượng HEX' : theme.unitValue;
  const isStock = source === 'stock';

  // Thiếu 1 trong 2 mốc ngày -> không hợp lệ, không fetch, không vẽ
  const hasValidRange = Boolean(dateFrom && dateTo);

  // Theo dõi kích thước khung chart để clamp popover không tràn mép
  useEffect(() => {
    if (!chartWrapRef.current) return;
    const el = chartWrapRef.current;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWrapWidth(entry.contentRect.width);
        setWrapHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setWrapWidth(rect.width);
    setWrapHeight(rect.height);
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
    const params = new URLSearchParams({ source });
    params.set('dateFrom', dateFrom);
    params.set('dateTo', dateTo);
    if (!isStock && xuong) params.set('xuong', xuong);
    if (congTrinh) params.set('congTrinh', congTrinh);
    if (dvt) params.set('dvt', dvt);
    if (phanLoai) params.set('phanLoai', phanLoai);
    if (hasCtWhitelist) params.set('ctWhitelist', ctWhitelistCsv);
    fetch(`/api/trend-by-congtrinh?${params.toString()}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { if (!cancelled) setRaw(Array.isArray(d) ? d : []); })
      .catch(err => {
        console.error(`Lỗi fetch /api/trend-by-congtrinh (${source}):`, err);
        if (!cancelled) setRaw([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, isStock, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai, hasValidRange, hasCtWhitelist,ctWhitelistCsv]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!hasValidRange) return [];
    const pickValue = (p: ApiCongTrinhPoint) => (displayMode === 'COUNT' ? p.totalCount : p.total);
    return raw
      .map(p => ({
        congTrinh: p.congTrinhName || p.congTrinhCode,
        congTrinhCode: p.congTrinhCode, // MỚI: giữ giá trị gốc để truy vấn /api/detail chính xác
        total: pickValue(p),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, topN)
      .reverse();
  }, [raw, displayMode, topN, hasValidRange]);

  const avgAll = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((s, p) => s + p.total, 0);
    return Number((sum / chartData.length).toFixed(2));
  }, [chartData]);

  const totalAll = useMemo(() => {
  if (!hasValidRange) return 0;
  const sum = raw.reduce((s, p) => s + (displayMode === 'COUNT' ? p.totalCount : p.total), 0);
  return Number(sum.toFixed(2));
}, [raw, displayMode, hasValidRange]);

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

  // Gọi /api/detail cho công trình đang ghim — dimension "congtrinh", chỉ lấy dữ liệu
  // khớp đúng công trình đó + bộ lọc hiện tại (xưởng, ĐVT, phân loại, khoảng ngày)
  const openDetailForPinned = async () => {
    if (!pinned) return;
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({
        source,
        dimension: 'congtrinh',
        value: pinned.point.congTrinhCode,
      });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (!isStock && xuong) params.set('xuong', xuong);
      if (dvt) params.set('dvt', dvt);
      if (phanLoai) params.set('phanLoai', phanLoai);
      if (hasCtWhitelist) params.set('ctWhitelist', ctWhitelistCsv);
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

  // Bắt click ở CẤP CẢ BIỂU ĐỒ (không phải ở từng <Bar>). Vì layout="vertical"
  // (biểu đồ ngang), activePayload vẫn trả đúng theo trục category (Y) gần con trỏ
  // nhất -> bấm vào bất kỳ đâu trên cả chiều ngang của hàng đó đều ăn, kể cả vùng
  // trống bên phải cột giá trị nhỏ.
  const handleChartClick = (state: any, event: React.MouseEvent) => {
    if (!state || !state.activePayload || state.activePayload.length === 0) return;
    const point: ChartPoint = state.activePayload[0].payload;
    if (!point?.congTrinhCode || !chartWrapRef.current) return;

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
          Xu hướng {theme.label} theo công trình {topN ? `(Top ${topN})` : ''}
        </h4>
      </div>

      {isStock && (
        <div className={`${embedded ? 'mb-3' : 'bg-white rounded-xl border border-slate-100 p-3 shadow-sm mb-4'} text-xs text-slate-400`}>
          Dữ liệu tồn kho không có thông tin theo xưởng, chỉ lọc theo công trình.
        </div>
      )}

      {/* relative wrapper để đặt popover absolute bên trên biểu đồ */}
      <div
        ref={chartWrapRef}
        className="relative bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col p-4"
        style={{ height: hasValidRange ? chartHeight : (embedded ? 320 : 420) }}
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
              layout="vertical"
              margin={{ top: 10, right: embedded ? 70 : 90, left: 10, bottom: 10 }}
              onClick={handleChartClick}
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
              <Bar
                dataKey="total"
                name={unit}
                fill={theme.bar}
                radius={[0, 4, 4, 0]}
                barSize={embedded ? 16 : 20}
                cursor="pointer"
              >
                {/* Tô đậm hàng đang được ghim để người dùng biết đang xem công trình nào */}
                {chartData.map(entry => (
                  <Cell
                    key={entry.congTrinhCode}
                    fill={pinned?.point.congTrinhCode === entry.congTrinhCode ? theme.barDark : theme.bar}
                  />
                ))}
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
                    const text = `TB theo CT: ${formatShort(avgAll)}`;
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
        {chartData.length > 0 && !loading && (
  <div
    className="absolute top-3 right-4 z-10 rounded-full border px-3 py-1 text-xs font-semibold"
    style={{
      color: theme.barDark,
      borderColor: theme.bar,
      backgroundColor: `${theme.bar}1A`,
    }}
  >
    Tổng: {formatDecimal(totalAll)}
  </div>
)}
        {/* Popover ghim, đứng yên tại tọa độ đã click cho tới khi bấm "✕" */}
        {pinned && (
          <PinnedPopover
            x={pinned.x}
            y={pinned.y}
            containerWidth={wrapWidth}
            containerHeight={wrapHeight}
            label={pinned.point.congTrinh}
            value={pinned.point.total}
            unit={unit}
            onViewDetail={openDetailForPinned}
            onClose={() => setPinned(null)}
          />
        )}
      </div>

      {/* Modal chi tiết dữ liệu */}
      <DetailDataModal
  open={detailOpen}
  onClose={() => setDetailOpen(false)}
  title={`Chi tiết ${theme.label} — Công trình: ${pinned?.point.congTrinh ?? ''}`}
  accentColor={theme.bar}
  rows={detailRows}
  columns={detailColumns}
  loading={detailLoading}
  truncated={detailTruncated}
/>
    </div>
  );
}