import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { tenGroup, soSanhGroup } from '../../utils/nhomSp';
import {
  ComposedChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine,
} from 'recharts';
import { useTrendFilter } from './TrendFilterContext';
import DetailDataModal from './DetailDataModal';
import { useMocBang } from '../../../../hooks/useMocBang';
import { formatTy, trieuToTy } from '../../../../utils/money';
type TrendSource = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';
export type DisplayMetric = 'COUNT' | 'SUM';

// Hai biểu đồ "theo đơn vị tính" và "theo phân loại nhóm sản phẩm" giống nhau hoàn toàn,
// chỉ khác endpoint, tên trường trả về và nhãn -> gom về 1 component, cấu hình theo `kind`.
export type CategoryKind = 'dvt' | 'phanloai';

interface ApiCategoryPoint {
  total: number;
  totalCount: number;
  distinctTotalCount?: number;
  [key: string]: any;
}
interface ChartPoint { name: string; code: string; total: number; }

const KIND_CONFIG: Record<CategoryKind, {
  endpoint: string;
  codeField: string;
  nameField: string;
  /** Tham số lọc của chính chiều này — khi xem chi tiết 1 cột thì chiều này đã cố định theo cột */
  ownFilter: 'dvt' | 'phanLoai';
  label: string;
  title: string;
  /** Đơn vị nhóm dùng để chia trung bình: "ĐVT" / "group" */
  donViChia: string;
  noDataNote: string;
  marginRight: [number, number]; // [embedded, đầy đủ] — chừa chỗ cho nhãn đường trung bình
}> = {
  dvt: {
    endpoint: '/api/trend-by-dvt',
    codeField: 'dvtCode',
    nameField: 'dvtName',
    ownFilter: 'dvt',
    label: 'ĐVT',
    title: 'theo đơn vị tính',
    donViChia: 'ĐVT',
    noDataNote: 'Dữ liệu nguồn này không có thông tin đơn vị tính.',
    marginRight: [130, 150],
  },
  phanloai: {
    endpoint: '/api/trend-by-phanloai',
    codeField: 'phanLoaiCode',
    nameField: 'phanLoaiName',
    ownFilter: 'phanLoai',
    label: 'Group',
    title: 'theo group',
    donViChia: 'group',
    noDataNote: 'Dữ liệu nguồn này không có thông tin phân loại nhóm sản phẩm.',
    marginRight: [90, 110],
  },
};

const formatDecimal = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const formatShort = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

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
  kindLabel: string;
  x: number;
  y: number;
  containerWidth: number;
  label: string;
  value: number;
  unit: string;
  onViewDetail: () => void;
  onClose: () => void;
}
function PinnedPopover({ kindLabel, x, y, containerWidth, label, value, unit, money, onViewDetail, onClose }: PinnedPopoverProps) {
  const POPOVER_WIDTH = 220;
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
        <p className="text-slate-600">{kindLabel}: <span className="font-semibold text-slate-800">{label}</span></p>
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

interface TrendByCategoryChartProps {
  kind: CategoryKind;
  source: TrendSource;
  embedded?: boolean;
  /** Số thứ tự trên tiêu đề: "1. Xu hướng …" (người dùng 19/11/2026) */
  stt?: number;
  displayMode: DisplayMetric;
  /** false = nguồn dữ liệu không có chiều này */
  supported?: boolean;
}

export default function TrendByCategoryChart({
  kind,
  source,
  embedded = false,
  stt,
  displayMode,
  supported = true,
}: TrendByCategoryChartProps) {
  const cfg = KIND_CONFIG[kind];
  const {
    dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai,
    hasCtWhitelist, ctWhitelistCsv, selectedDatesCsv, // ✅ MỚI
  } = useTrendFilter();

  const [raw, setRaw] = useState<ApiCategoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  // Dữ liệu mới: gọi lại ngầm, số đang hiện giữ tới khi số mới về
  const moc = useMocBang([source, 'production']);
  const daTai = useRef('');   // bộ tham số của số đang hiện

  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);

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

  const hasValidRange = Boolean(dateFrom && dateTo);
  const canFetch = hasValidRange && supported;

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
    if (!canFetch) {
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
    if (xuong) params.set('xuong', xuong);
    if (congTrinh) params.set('congTrinh', congTrinh);
    if (phanLoai) params.set('phanLoai', phanLoai);
    if (dvt) params.set('dvt', dvt);
    if (hasCtWhitelist) params.set('ctWhitelist', ctWhitelistCsv);
    if (selectedDatesCsv) params.set('dates', selectedDatesCsv); // ✅ MỚI
    const khoa = `${cfg.endpoint}?${params.toString()}`;
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
        console.error(`Lỗi fetch ${cfg.endpoint} (${source}):`, err);
        if (!cancelled && !ngam) setRaw([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cfg, source, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai, canFetch,
      hasCtWhitelist, ctWhitelistCsv, selectedDatesCsv, moc]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!canFetch) return [];
    const pickValue = (p: ApiCategoryPoint) => (displayMode === 'COUNT' ? p.totalCount : isMoney ? trieuToTy(p.total) : p.total);
    return raw
      .map(p => ({ name: p[cfg.nameField] || p[cfg.codeField], code: p[cfg.codeField], total: pickValue(p) }))
      // Group sản phẩm: nhãn "G.08.Tường", sắp theo số group (người dùng 19/11/2026); ĐVT giữ sắp theo giá trị
      .sort((a, b) => (kind === 'phanloai' ? soSanhGroup(a.name, b.name) : b.total - a.total))
      .map(p => (kind === 'phanloai' ? { ...p, name: tenGroup(p.name) } : p));
  }, [raw, displayMode, canFetch, cfg, kind]);

  // Nhãn nghiêng 35°: chiều cao trục + lề trái theo nhãn dài nhất / nhãn đầu (font 12px ≈ 6.6px/ký tự) — không cắt chữ
  // dài như "G.05.Khung gương" (người dùng 19/11/2026)
  const nhanNghieng = chartData.length > 6;
  const caoTruc = Math.min(140, Math.round(Math.max(0, ...chartData.map(p => String(p.name).length)) * 6.6 * 0.58) + 22);
  const leTrai = Math.min(90, Math.max(0, Math.round(String(chartData[0]?.name ?? '').length * 6.6 * 0.82) - 40));

  const avgAll = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((s, p) => s + p.total, 0);
    return Number((sum / chartData.length).toFixed(2));
  }, [chartData]);

  // Số lượng: 1 mã có thể nằm ở nhiều nhóm (vd 1 mã tồn có 2 ĐVT) => cộng các cột bị đếm trùng; dùng số mã khác
  // nhau trên cả khoảng do máy chủ tính (distinctTotalCount). Giá trị (tiền) cộng các cột vẫn đúng.
  const totalAll = useMemo(() => {
    if (displayMode === 'COUNT') {
      const distinct = raw.find(p => p.distinctTotalCount != null)?.distinctTotalCount;
      if (distinct != null) return Number(distinct);
    }
    const sum = chartData.reduce((s, p) => s + p.total, 0);
    return Number(sum.toFixed(2));
  }, [raw, chartData, displayMode]);

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
        dimension: kind,
        value: pinned.point.code,
      });
      params.set('dateFrom', dateFrom);
      params.set('dateTo', dateTo);
      if (xuong) params.set('xuong', xuong);
      if (congTrinh) params.set('congTrinh', congTrinh);
      // Chiều còn lại vẫn lọc theo bộ lọc chung; chiều của chính biểu đồ đã cố định = cột được bấm
      if (cfg.ownFilter !== 'dvt' && dvt) params.set('dvt', dvt);
      if (cfg.ownFilter !== 'phanLoai' && phanLoai) params.set('phanLoai', phanLoai);
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
    if (!point?.code || !chartWrapRef.current) return;

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
          {stt ? `${stt}. ` : ''}{theme.label} {cfg.title}
        </h4>
      </div>

      <div
        ref={chartWrapRef}
        className={`relative bg-white rounded-2xl border border-slate-200 flex flex-col ${embedded ? 'p-3 h-[320px]' : 'p-4 h-[480px]'}`}
      >
        {!supported ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Không áp dụng
          </div>
        ) : !hasValidRange ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Chọn khoảng ngày
          </div>
        ) : loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: embedded ? 40 : 48, right: 16, left: nhanNghieng ? leTrai : 0, bottom: 0 }}
              onClick={handleChartClick}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} interval={0}
                     angle={nhanNghieng ? -35 : 0} textAnchor={nhanNghieng ? 'end' : 'middle'}
                     height={nhanNghieng ? caoTruc : 30} />
              <YAxis
                tickFormatter={fmt}
                tick={{ fontSize: 12, fill: '#475569' }}
                width={55}
                domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
              />
              <RechartsTooltip
                formatter={(v: number, name: string) => [fmt(v), name]}
                labelFormatter={(l) => `${cfg.label}: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend verticalAlign="top" height={embedded ? 28 : 36} wrapperStyle={{ fontSize: 13 }} />
              <Bar
                dataKey="total"
                name={unit}
                fill={theme.bar}
                radius={[4, 4, 0, 0]}
                barSize={embedded ? 22 : 30}
                cursor="pointer"
              >
                {chartData.map(entry => (
                  <Cell
                    key={entry.code}
                    fill={pinned?.point.code === entry.code ? theme.barDark : theme.bar}
                  />
                ))}
                <LabelList
                  dataKey="total"
                  position="top"
                  formatter={(v: number) => (v > 0 ? fmt(v) : '')}
                  fontSize={12}
                  fontWeight={700}
                  fill={theme.barDark}
                />
              </Bar>
              {chartData.length > 0 && (
                <ReferenceLine
                  y={avgAll}
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
            Tổng: {fmt(totalAll)}{isMoney ? ' tỷ' : ''} · {chartData.length} {cfg.donViChia} · TB: {fmtShort(avgAll)}{isMoney ? ' tỷ' : ''}/{cfg.donViChia}
          </div>
        )}
        {pinned && (
          <PinnedPopover
            money={isMoney}
            kindLabel={cfg.label}
            x={pinned.x}
            y={pinned.y}
            containerWidth={wrapWidth}
            label={pinned.point.name}
            value={chartData.find(p => p.code === pinned.point.code)?.total ?? pinned.point.total}
            unit={unit}
            onViewDetail={() => void openDetailForPinned()}
            onClose={() => setPinned(null)}
          />
        )}
      </div>

      <DetailDataModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`Chi tiết ${theme.label.charAt(0).toLocaleLowerCase('vi') + theme.label.slice(1)} — ${cfg.label}: ${pinned?.point.name ?? ''}`}
        accentColor={theme.bar}
        rows={detailRows}
        columns={detailColumns}
        loading={detailLoading}
        truncated={detailTruncated}
      />
    </div>
  );
}