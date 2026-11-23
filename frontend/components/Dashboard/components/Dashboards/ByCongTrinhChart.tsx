import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, X } from 'lucide-react';
import {
  ComposedChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine,
} from 'recharts';
import { useTrendFilter } from './TrendFilterContext';
import DetailDataModal from './DetailDataModal';
import { useMocBang } from '../../../../hooks/useMocBang';
import { formatTy, trieuToTy } from '../../../../utils/money';
import { topVaKhac } from './xuongKy';
type TrendSource = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';
export type DisplayMetric = 'COUNT' | 'SUM';

interface ApiCongTrinhPoint {
  congTrinhCode: string;
  congTrinhName: string;
  total: number;
  totalCount: number;
  distinctTotalCount?: number;
}
interface ChartPoint { congTrinh: string; congTrinhCode: string; total: number; }

const formatDecimal = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const formatShort = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

// Nhãn công trình dễ đọc (người dùng 19/11/2026): dòng 1 = mã CT đậm, dòng 2 = tên (1 dòng, dài quá cắt "…");
// tên không có mã (vd "Các công trình khác") hiện 1 dòng. Rê chuột hiện đủ tên.
const MA_CT = /^(.*?)[\s_\-–]*((?:CT|PO)\d{2}-\d{3})\s*$/i;
export const tachMaCt = (ten: string): { ma: string | null; ten: string } => {
  const m = MA_CT.exec(String(ten ?? '').trim());
  return m ? { ma: m[2].toUpperCase(), ten: m[1].replace(/[\s_\-–]+$/, '').trim() } : { ma: null, ten: String(ten ?? '').trim() };
};
/** Ngắt tên thành các dòng ≤ n ký tự theo từ — KHÔNG cắt "…" (người dùng: không mất chữ) */
export const ngatDong = (t: string, n: number): string[] => {
  const dong: string[] = [];
  let hien = '';
  for (const tu of t.split(/\s+/).filter(Boolean)) {
    const thu = hien ? `${hien} ${tu}` : tu;
    if (thu.length > n && hien) { dong.push(hien); hien = tu; } else hien = thu;
  }
  if (hien) dong.push(hien);
  return dong.length ? dong : [''];
};

function WrappedYAxisTick(props: any) {
  const { x, y, payload, maxCharsPerLine, fontSize } = props;
  const full = String(payload.value ?? '');
  const { ma, ten } = tachMaCt(full);
  if (!ma) {
    return (
      <text x={x} y={y} textAnchor="end" dominantBaseline="central" fill="#0f172a" fontSize={fontSize} fontWeight={600}>
        <title>{full}</title>
        {ten}
      </text>
    );
  }
  return (
    <text x={x} y={y} textAnchor="end" fontSize={fontSize}>
      <title>{full}</title>
      {(() => {
        // Mã + các dòng tên, căn giữa theo cột
        const dong = ngatDong(ten, maxCharsPerLine + 2);
        const cao = fontSize + 3 + dong.length * (fontSize + 2);
        return (<>
          <tspan x={x} dy={-cao / 2 + fontSize} fill="#0f172a" fontWeight={700}>{ma}</tspan>
          {dong.map((d, i) => (
            <tspan key={i} x={x} dy={i === 0 ? fontSize + 3 : fontSize + 2} fill="#334155" fontSize={fontSize - 1} fontWeight={500}>{d}</tspan>
          ))}
        </>);
      })()}
    </text>
  );
}

const THEME: Record<TrendSource, { bar: string; barDark: string; label: string; unitValue: string }> = {
  order:     { bar: '#ec4899', barDark: '#be185d', label: 'Đơn hàng', unitValue: 'Giá trị (tỷ)' },
  tkbv:      { bar: '#3b82f6', barDark: '#1d4ed8', label: 'Triển khai BV', unitValue: 'Giá trị (tỷ)' },
  pthsp:     { bar: '#a855f7', barDark: '#7e22ce', label: 'Tính phiếu', unitValue: 'Giá trị (tỷ)' },
  inventory: { bar: '#14b8a6', barDark: '#0f766e', label: 'Nhập kho', unitValue: 'Giá trị (tỷ)' },
  export:    { bar: '#f59e0b', barDark: '#b45309', label: 'Xuất kho', unitValue: 'Giá trị (tỷ)' },
  stock:     { bar: '#64748b', barDark: '#334155', label: 'Tồn kho', unitValue: 'Giá trị (tỷ)' },
};

interface DetailResponse { rows: Record<string, any>[]; columns: string[]; truncated: boolean; }

interface PinnedPopoverProps {
  money: boolean;
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
function PinnedPopover({ x, y, containerWidth, containerHeight, label, value, unit, money, onViewDetail, onClose }: PinnedPopoverProps) {
  const POPOVER_WIDTH = 240;
  const POPOVER_HEIGHT_EST = 110;
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
        <p className="text-pink-600 font-semibold mt-0.5">{unit}: {money ? formatTy(value) : formatDecimal(value)}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2 bg-indigo-50 rounded-full pl-3 pr-1.5 py-1.5">
          <button
            onClick={onViewDetail}
            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-sm font-semibold"
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
  /** Số thứ tự trên tiêu đề: "1. Xu hướng …" (người dùng 19/11/2026) */
  stt?: number;
  displayMode: DisplayMetric;
  topN?: number;
}

export default function ByCongTrinhChart({ source, embedded = false, stt, displayMode, topN = 10 }: ByCongTrinhChartProps) {
  const {
    dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai,
    hasCtWhitelist, ctWhitelistCsv, selectedDatesCsv, // ✅ MỚI
  } = useTrendFilter();

  const [raw, setRaw] = useState<ApiCongTrinhPoint[]>([]);
  const [loading, setLoading] = useState(true);
  // Dữ liệu mới: gọi lại ngầm, số đang hiện giữ tới khi số mới về
  const moc = useMocBang([source, 'production']);
  const daTai = useRef('');   // bộ tham số của số đang hiện

  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);
  const [wrapHeight, setWrapHeight] = useState(0);

  const [pinned, setPinned] = useState<{ point: ChartPoint; x: number; y: number } | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  // Nút xem chi tiết: bảng dữ liệu NGUỒN của biểu đồ (vd. từng dòng nhập kho), không phải danh sách hạng mục
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState<Record<string, any>[]>([]);
  const [detailColumns, setDetailColumns] = useState<string[]>([]);
  const [detailTruncated, setDetailTruncated] = useState(false);

  const theme = THEME[source];
  // Tồn kho đếm theo mã SAP (ma_id_sap), không theo HEX
  const unit = displayMode === 'COUNT' ? (source === 'stock' ? 'Số mã SAP' : 'Số hạng mục') : theme.unitValue;
  // Giá trị: API trả triệu đồng -> đổi sang Tỷ, hiển thị 2 số lẻ.
  const isMoney = displayMode !== 'COUNT';
  const fmt = (v: number) => (isMoney ? formatTy(v) : formatDecimal(v));
  const fmtShort = (v: number) => (isMoney ? formatTy(v) : formatShort(v));
  const isStock = source === 'stock';

  const hasValidRange = Boolean(dateFrom && dateTo);

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
      daTai.current = '';
      setRaw([]);
      setLoading(false);
      setPinned(null);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ source });
    params.set('dateFrom', dateFrom);
    params.set('dateTo', dateTo);
    if (!isStock && xuong) params.set('xuong', xuong);
    if (congTrinh) params.set('congTrinh', congTrinh);
    if (dvt) params.set('dvt', dvt);
    if (phanLoai) params.set('phanLoai', phanLoai);
    if (hasCtWhitelist) params.set('ctWhitelist', ctWhitelistCsv);
    if (selectedDatesCsv) params.set('dates', selectedDatesCsv); // ✅ MỚI
    const khoa = `/api/trend-by-congtrinh?${params.toString()}`;
    const ngam = daTai.current === khoa;
    if (!ngam) {
      daTai.current = '';
      setLoading(true);
      setPinned(null);
    }
    fetch(khoa)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (cancelled) return;
        daTai.current = khoa;
        setRaw(Array.isArray(d) ? d : []);
      })
      .catch(err => {
        console.error(`Lỗi fetch /api/trend-by-congtrinh (${source}):`, err);
        if (!cancelled && !ngam) setRaw([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, isStock, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai, hasValidRange,
      hasCtWhitelist, ctWhitelistCsv, selectedDatesCsv, moc]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!hasValidRange) return [];
    const pickValue = (p: ApiCongTrinhPoint) => (displayMode === 'COUNT' ? p.totalCount : isMoney ? trieuToTy(p.total) : p.total);
    const rows = raw.map(p => ({
      congTrinh: p.congTrinhName || p.congTrinhCode,
      congTrinhCode: p.congTrinhCode,
      total: pickValue(p),
    }));
    // Số đếm không trùng HEX nên cộng các cột không ra Tổng: dòng Khác chỉ có ở chế độ Giá trị
    return topVaKhac(rows, topN, displayMode !== 'COUNT');
  }, [raw, displayMode, topN, hasValidRange, isMoney]);

  // TB trên toàn bộ công trình, cùng phạm vi với Tổng
  const avgAll = useMemo(() => {
    if (raw.length === 0) return 0;
    const sum = raw.reduce((s, p) => s + (displayMode === 'COUNT' ? p.totalCount : isMoney ? trieuToTy(p.total) : p.total), 0);
    return Number((sum / raw.length).toFixed(2));
  }, [raw, displayMode, isMoney]);

  const totalAll = useMemo(() => {
    if (!hasValidRange) return 0;
    // Số lượng: số mã khác nhau trên cả khoảng (máy chủ tính) — tránh đếm trùng mã nằm ở nhiều công trình
    if (displayMode === 'COUNT') {
      const distinct = raw.find(p => p.distinctTotalCount != null)?.distinctTotalCount;
      if (distinct != null) return Number(distinct);
    }
    const sum = raw.reduce((s, p) => s + (displayMode === 'COUNT' ? p.totalCount : isMoney ? trieuToTy(p.total) : p.total), 0);
    return Number(sum.toFixed(2));
  }, [raw, displayMode, hasValidRange]);

  // Nhãn trục: mã CT (14px đậm) + tên 1 dòng (12px) — xem WrappedYAxisTick
  const maxCharsPerLine = embedded ? 30 : 36;
  const yAxisFontSize = 14;
  const yAxisWidth = (maxCharsPerLine + 2) * ((yAxisFontSize - 1) * 0.6) + 16;
  // Cao mỗi hàng theo số dòng tên dài nhất (mã 1 dòng + tên n dòng)
  const soDongTen = Math.max(1, ...chartData.map(p => ngatDong(tachMaCt(p.congTrinh).ten, maxCharsPerLine + 2).length));
  const rowHeight = Math.max(embedded ? 50 : 54, 22 + soDongTen * (yAxisFontSize + 1) + 12);
  const chartHeight = Math.max(embedded ? 320 : 420, chartData.length * rowHeight + 60);

  const lanChiTiet = useRef(0);
  const openDetailForPinned = async (ngam = false) => {
    if (!pinned) return;
    const lan = ++lanChiTiet.current;
    if (!ngam) {
      setDetailOpen(true);
      setDetailLoading(true);
    }
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
      if (selectedDatesCsv) params.set('dates', selectedDatesCsv); // ✅ MỚI
      const r = await fetch(`/api/detail?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: DetailResponse = await r.json();
      if (lan !== lanChiTiet.current) return;
      setDetailRows(data.rows || []);
      setDetailColumns(data.columns || []);
      setDetailTruncated(!!data.truncated);
    } catch (err) {
      console.error('Lỗi fetch /api/detail:', err);
      if (ngam || lan !== lanChiTiet.current) return;
      setDetailRows([]);
      setDetailColumns([]);
      setDetailTruncated(false);
    } finally {
      if (lan === lanChiTiet.current) setDetailLoading(false);
    }
  };
  // Cửa sổ chi tiết đang mở cũng lấy số mới (đang tải dở thì tải lại)
  useEffect(() => {
    if (moc && detailOpen) void openDetailForPinned(!detailLoading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moc]);

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
        <h4 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          {stt ? `${stt}. ` : ''}{theme.label} theo công trình {topN ? `(top ${topN})` : ''}
        </h4>
      </div>

      <div
        ref={chartWrapRef}
        className="relative bg-white rounded-2xl border border-slate-200 flex flex-col p-4"
        style={{ height: hasValidRange ? chartHeight : (embedded ? 320 : 420) }}
      >
        {!hasValidRange ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Chọn khoảng ngày
          </div>
        ) : loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: 70, left: 10, bottom: 10 }}
              onClick={handleChartClick}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis
                type="number"
                tickFormatter={fmt}
                tick={{ fontSize: 12, fill: '#475569' }}
              />
              <YAxis
                type="category"
                dataKey="congTrinh"
                width={yAxisWidth}
                interval={0}
                tick={<WrappedYAxisTick maxCharsPerLine={maxCharsPerLine} fontSize={yAxisFontSize} />}
              />
              <RechartsTooltip
                formatter={(v: number, name: string) => [fmt(v), name]}
                labelFormatter={(l) => `Công trình: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend verticalAlign="top" height={embedded ? 28 : 36} wrapperStyle={{ fontSize: 13 }} />
              <Bar
                dataKey="total"
                name={unit}
                fill={theme.bar}
                radius={[0, 4, 4, 0]}
                barSize={embedded ? 16 : 20}
                cursor="pointer"
              >
                {chartData.map(entry => (
                  <Cell
                    key={entry.congTrinhCode}
                    fill={pinned?.point.congTrinhCode === entry.congTrinhCode ? theme.barDark : theme.bar}
                  />
                ))}
                <LabelList dataKey="total" position="right" formatter={(v: number) => v > 0 ? fmt(v) : ''} fontSize={12} fontWeight={700} fill={theme.barDark} />
              </Bar>
              {chartData.length > 0 && (
                <ReferenceLine
                  x={avgAll}
                  stroke="#7c3aed"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Không có dữ liệu</div>
        )}
        {chartData.length > 0 && !loading && (
          <div
            className="absolute top-3 right-4 z-10 rounded-full px-4 py-1.5 text-base font-bold text-white shadow-md tabular-nums"
            // Nổi bật (người dùng 19/11/2026): nền màu đậm của biểu đồ, chữ trắng
            style={{ backgroundColor: theme.barDark }}
          >
            {/* TB chia cho MỌI công trình có số (gồm cả phần gộp "Các công trình khác"), không chỉ top hiện trên biểu đồ */}
            Tổng: {fmt(totalAll)}{isMoney ? ' tỷ' : ''} · {raw.length.toLocaleString('en-US')} công trình · TB: {fmtShort(avgAll)}{isMoney ? ' tỷ' : ''}/công trình
          </div>
        )}
        {pinned && (
          <PinnedPopover
            money={isMoney}
            x={pinned.x}
            y={pinned.y}
            containerWidth={wrapWidth}
            containerHeight={wrapHeight}
            label={pinned.point.congTrinh}
            value={chartData.find(p => p.congTrinhCode === pinned.point.congTrinhCode)?.total ?? pinned.point.total}
            unit={unit}
            onViewDetail={() => void openDetailForPinned()}
            onClose={() => setPinned(null)}
          />
        )}
      </div>

      <DetailDataModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`Chi tiết ${theme.label.charAt(0).toLocaleLowerCase('vi') + theme.label.slice(1)} — Công trình: ${pinned?.point.congTrinh ?? ''}`}
        accentColor={theme.bar}
        rows={detailRows}
        columns={detailColumns}
        loading={detailLoading}
        truncated={detailTruncated}
      />
    </div>
  );
}