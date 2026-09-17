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

interface ApiXuongPoint {
  xuongCode: string;
  xuongName: string;
  total: number;
  totalCount: number;
}
// periodKey ở đây mang giá trị mã xưởng (xuongCode) — đặt tên thống nhất với
// TrendChart (theo kỳ) để dùng chung quy ước "khoá định danh cột đang ghim".
interface ChartPoint { xuong: string; periodKey: string; total: number; }

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

// ================== Chi tiết dữ liệu (/api/detail) ==================
interface DetailResponse { rows: Record<string, any>[]; columns: string[]; truncated: boolean; }

const formatColumnLabel = (col: string) => col.toUpperCase().replace(/_/g, ' ');
const formatCellValue = (v: any) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return String(v);
};

// ================== Popover ghim ==================
// <div absolute> tự vẽ, KHÔNG dùng <Tooltip> của Recharts (nó lắng nghe mousemove
// liên tục nên dù ép coordinate cố định vẫn "chạy" theo chuột). Overlay này độc lập
// hoàn toàn nên đứng yên tuyệt đối tại điểm đã click.
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
        <p className="text-slate-600">Xưởng: <span className="font-semibold text-slate-800">{label}</span></p>
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

interface TrendByXuongChartProps {
  source: TrendSource;
  embedded?: boolean;
  displayMode: DisplayMetric;
}

export default function TrendByXuongChart({ source, embedded = false, displayMode }: TrendByXuongChartProps) {
  const { dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai } = useTrendFilter();

  const [raw, setRaw] = useState<ApiXuongPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Container ref để tính tọa độ popover tương đối với khung chứa biểu đồ
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);

  // Xưởng đang được "ghim" (đã click) + tọa độ hiển thị popover
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
    const params = new URLSearchParams({ source });
    params.set('dateFrom', dateFrom);
    params.set('dateTo', dateTo);
    if (xuong) params.set('xuong', xuong);
    if (congTrinh) params.set('congTrinh', congTrinh);
    if (dvt) params.set('dvt', dvt);
    if (phanLoai) params.set('phanLoai', phanLoai);

    fetch(`/api/trend-by-xuong?${params.toString()}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { if (!cancelled) setRaw(Array.isArray(d) ? d : []); })
      .catch(err => {
        console.error(`Lỗi fetch /api/trend-by-xuong (${source}):`, err);
        if (!cancelled) setRaw([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai, hasValidRange]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!hasValidRange) return [];
    const pickValue = (p: ApiXuongPoint) => (displayMode === 'COUNT' ? p.totalCount : p.total);
    return raw
      .map(p => ({ xuong: p.xuongName || p.xuongCode, periodKey: p.xuongCode, total: pickValue(p) }))
      .sort((a, b) => b.total - a.total);
  }, [raw, displayMode, hasValidRange]);

  const avgAll = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((s, p) => s + p.total, 0);
    return Number((sum / chartData.length).toFixed(2));
  }, [chartData]);

  // Gọi /api/detail cho xưởng đang ghim — chỉ lấy dữ liệu khớp đúng xưởng + bộ lọc + khoảng ngày hiện tại
  const openDetailForPinned = async () => {
    if (!pinned) return;
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({
        source,
        dimension: 'xuong',
        value: pinned.point.periodKey,
      });
      params.set('dateFrom', dateFrom);
      params.set('dateTo', dateTo);
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
  // trả về đúng điểm dữ liệu của xưởng gần con trỏ nhất theo trục X, bất kể bấm vào
  // vùng trống phía trên cột hay đúng vào cột màu -> luôn ăn click, kể cả với các
  // cột giá trị 0, không còn phụ thuộc diện tích SVG thật của từng cột.
  const handleChartClick = (state: any, event: React.MouseEvent) => {
    if (!state || !state.activePayload || state.activePayload.length === 0) return;
    const point: ChartPoint = state.activePayload[0].payload;
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
          Xu hướng {theme.label} theo xưởng chính
        </h4>
      </div>

      {isStock && (
        <div className={`${embedded ? 'mb-3' : 'bg-white rounded-xl border border-slate-100 p-3 shadow-sm mb-4'} text-xs text-slate-400`}>
          Dữ liệu tồn kho không có thông tin theo xưởng.
        </div>
      )}

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
              <XAxis dataKey="xuong" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
              <YAxis
                tickFormatter={formatDecimal}
                tick={{ fontSize: 10, fill: '#64748b' }}
                width={55}
                domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
              />
              <RechartsTooltip
                formatter={(v: number, name: string) => [formatDecimal(v), name]}
                labelFormatter={(l) => `Xưởng: ${l}`}
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
                  formatter={(v: number) => (v > 0 ? formatDecimal(v) : '')}
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
                    const text = `TB theo xưởng: ${formatShort(avgAll)}`;
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
            label={pinned.point.xuong}
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
  title={`Chi tiết ${theme.label} — Xưởng: ${pinned?.point.xuong ?? ''}`}
  accentColor={theme.bar}
  rows={detailRows}
  columns={detailColumns}
  loading={detailLoading}
  truncated={detailTruncated}
/>
    </div>
  );
}
