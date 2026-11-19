import React, { useLayoutEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { extractStage, remainBucketOf } from '../../core/stages';

// ============================================================================
// Thẻ phễu "Tình trạng đơn hàng AATN" (trang Tổng quan) — phương án A (docs/designs/figma-thiet-ke-lai/9a):
// giữ dáng phễu (thanh căn giữa, rộng theo giá trị), bỏ khung tam giác nét đứt; công đoạn gom 3 nhóm có tiêu đề + tổng
// (Chưa sản xuất · Đang trên chuyền · Nhập kho chưa đủ · Trong kho), màu theo nhóm. Nhóm theo remainBucketOf, chỉ
// thanh P022 tồn kho thực tế (đơn vị mã SAP) đứng riêng, không cộng với hạng mục.
// ============================================================================

export interface FunnelCardItem {
  id: string;
  name: string;
  value: number;
  /** Độ rộng thanh theo % (bước lớn nhất = 100) */
  percentage: number;
}

type Nhom = 'chua' | 'chuyen' | 'thieu' | 'kho';
const NHOM: Array<{ key: Nhom; label: string; chu: string }> = [
  { key: 'chua', label: 'Chưa sản xuất', chu: 'text-slate-600' },
  { key: 'chuyen', label: 'Đang trên chuyền', chu: 'text-amber-700' },
  { key: 'thieu', label: 'Nhập kho chưa đủ', chu: 'text-violet-700' },
  { key: 'kho', label: 'Trong kho', chu: 'text-emerald-700' },
];
const nhomCua = (id: string): Nhom => {
  if (id === 'P022') return 'kho';
  const b = remainBucketOf('', extractStage(id));
  return b === 'onLine' ? 'chuyen' : b === 'shortfall' ? 'thieu' : 'chua';
};
// Chưa sản xuất: xám đậm -> nhạt dần theo thứ tự; trên chuyền: cam; kho: xanh (nhập chưa đủ nhạt hơn)
const mauThanh = (id: string, thuTu: number) => {
  const n = nhomCua(id);
  if (n === 'chua') return ['#3f4654', '#5b6170', '#7a8394'][thuTu] ?? '#7a8394';
  if (n === 'chuyen') return '#f7941d';
  return n === 'kho' ? '#12805c' : '#a78bfa';
};
/** "P001. Chưa triển khai" → ["Chưa triển khai", "P001"]; "GCVT (sau P013)" → ["GCVT (sau P013)", ""] */
const tachTen = (name: string): [string, string] => {
  const m = name.match(/^(P\d{3}(?:\/P\d{3})?)\.\s*(.*)$/);
  return m ? [m[2], m[1]] : [name, ''];
};

/** Chú thích nguồn vị trí công đoạn (phễu, Điểm nghẽn): n = số hạng mục đang lấy vị trí từ MRA; 0 => không hiện */
export const chuThichNguonBop = (n: number): string =>
  n > 0 ? `Vị trí P012–P021: MRA cho ${n.toLocaleString('vi-VN')} hạng mục đã triển khai, còn lại theo kiểm tay PC` : '';

interface FunnelCardProps<T extends FunnelCardItem> {
  title?: string;
  subtitle: React.ReactNode;
  /** Đơn vị của con số trên thanh (vd. "Tỷ đồng", "Hạng mục") */
  unit?: string;
  items: T[];
  /** Chữ trên thanh */
  barLabel: (item: T) => string;
  /** Chữ khi rê chuột */
  barTitle: (item: T) => string;
  /** Có giá trị => thanh bấm được */
  onBarClick?: (item: T) => void;
  onDetail: () => void;
  className?: string;
  /** Số hạng mục lấy vị trí từ MRA; không truyền => đọc soPhuMra của trang (App context) */
  soPhuMra?: number;
}

export function FunnelCard<T extends FunnelCardItem>({
  title = 'Tình trạng đơn hàng AATN', unit, items, barLabel, barTitle, onBarClick, onDetail, className = '', soPhuMra,
}: FunnelCardProps<T>) {
  // Các mục gọi FunnelCard chưa truyền soPhuMra: lấy từ context của trang (ngoài Outlet => null)
  const ctx = useOutletContext<{ soPhuMra?: number } | null | undefined>();
  const chuThich = chuThichNguonBop(soPhuMra ?? ctx?.soPhuMra ?? 0);
  // Nhóm có dòng ngay sau "chuyen" (để lấy vạch dưới của khối)
  const coNhom = NHOM.filter(g => items.some(i => nhomCua(i.id) === g.key)).map(g => g.key);
  const sauChuyen = coNhom[coNhom.indexOf('chuyen') + 1] ?? null;
  const cot = 'grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] items-center gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]';
  // Nhấn đường kẻ phễu ở đoạn "Đang trên chuyền" (người dùng 19/11/2026): đo vị trí nhóm so với khung SVG phễu
  // => y1..y2 (% chiều cao), vẽ đè hai cạnh đậm hơn ở đoạn đó; không tô nền, phần phễu còn lại giữ nguyên.
  const svgRef = useRef<SVGSVGElement>(null);
  const chuyenRef = useRef<HTMLDivElement>(null);   // vạch đứt đầu nhóm Đang trên chuyền
  const sauChuyenRef = useRef<HTMLDivElement>(null); // vạch đứt đầu nhóm ngay sau (không có => đáy nhóm)
  const nhomChuyenRef = useRef<HTMLDivElement>(null);
  const [doanChuyen, setDoanChuyen] = useState<{ y1: number; y2: number } | null>(null);
  useLayoutEffect(() => {
    const do_ = () => {
      const sv = svgRef.current?.getBoundingClientRect(), g = chuyenRef.current?.getBoundingClientRect();
      if (!sv || !g || sv.height <= 0) { setDoanChuyen(null); return; }
      const sau = sauChuyenRef.current?.getBoundingClientRect();
      const day = sau ? sau.top + sau.height / 2 : (nhomChuyenRef.current?.getBoundingClientRect().bottom ?? g.bottom);
      const pt = (v: number) => Math.max(0, Math.min(100, ((v - sv.top) / sv.height) * 100));
      const y1 = pt(g.top + g.height / 2), y2 = pt(day);
      setDoanChuyen(c => (c && Math.abs(c.y1 - y1) < 0.2 && Math.abs(c.y2 - y2) < 0.2 ? c : { y1, y2 }));
    };
    do_();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(do_) : null;
    if (ro && svgRef.current) ro.observe(svgRef.current);
    if (ro && nhomChuyenRef.current) ro.observe(nhomChuyenRef.current);
    return () => ro?.disconnect();
  });

  return (
    <div className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-5 lg:p-6 ${className}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold text-slate-900">
            {title}{unit ? <span className="ml-1.5 text-base font-medium text-slate-600">({unit.toLowerCase().replace('tỷ đồng', 'tỷ')})</span> : null}
          </h3>
          {chuThich && <p className="mt-0.5 text-xs text-slate-500">{chuThich}</p>}
        </div>
        <button onClick={onDetail} title="Xem bảng chi tiết"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Eye size={15} aria-hidden /> Chi tiết
        </button>
      </div>

      <div className="relative mx-auto mt-2 flex w-full max-w-6xl flex-1 flex-col">
        {/* Khung phễu nét đứt sau các thanh: đáy rộng bằng cột thanh, nhọn dần xuống giữa (nằm cùng lưới với các dòng) */}
        <div className={`${cot} pointer-events-none absolute inset-0 grid-rows-[minmax(0,1fr)] overflow-hidden pb-1 pt-3`} style={{ alignItems: 'stretch' }} aria-hidden>
          <span />
          <svg ref={svgRef} className="block h-full min-h-0 w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="0,0 100,0 50,100" fill="#fef2f2" fillOpacity="0.45" stroke="#f87171" strokeOpacity="0.7"
              strokeWidth="1.25" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            {/* Khối Đang trên chuyền: viền hình thang đậm — 2 cạnh xiên (trái x = y/2, phải x = 100 − y/2) + vạch trên / dưới */}
            {doanChuyen && (() => {
              const { y1, y2 } = doanChuyen;
              const net = { stroke: '#dc2626', strokeWidth: 3, strokeDasharray: '7 4', vectorEffect: 'non-scaling-stroke' as const };
              return (<>
                <line x1={y1 / 2} y1={y1} x2={y2 / 2} y2={y2} {...net} />
                <line x1={100 - y1 / 2} y1={y1} x2={100 - y2 / 2} y2={y2} {...net} />
                <line x1={y1 / 2} y1={y1} x2={100 - y1 / 2} y2={y1} {...net} />
                <line x1={y2 / 2} y1={y2} x2={100 - y2 / 2} y2={y2} {...net} />
              </>);
            })()}
          </svg>
        </div>
        {NHOM.map(g => {
          const ds = items.filter(i => nhomCua(i.id) === g.key);
          if (!ds.length) return null;
          const tongNhom = ds.reduce((s, i) => s + i.value, 0);
          return (
            // Nhóm giãn theo số dòng => các dòng chia đều chiều cao khung (cao bằng khung Nhóm đơn hàng bên cạnh).
            // Người dùng 19/11/2026: bỏ chữ nhãn nhóm "… · tổng", giữ vạch đứt ngăn nhóm; tổng nhóm còn khi rê chuột
            <div key={g.key} ref={g.key === 'chuyen' ? nhomChuyenRef : undefined} className="relative flex flex-col" style={{ flexGrow: ds.length + 1 }}
              title={`${g.label}: ${barLabel({ ...ds[0], value: tongNhom })}`}>
              <div ref={g.key === 'chuyen' ? chuyenRef : sauChuyen === g.key ? sauChuyenRef : undefined}
                className="mb-1 mt-3 flex items-center gap-3 pl-[13rem] lg:pl-[17rem]" aria-hidden>
                <span className="flex-1 border-t-2 border-dashed border-slate-200" />
              </div>
              {ds.map((item, thuTu) => {
                const [ten, ma] = tachTen(item.name);
                const label = barLabel(item);
                const w = Math.min(100, item.value === 0 ? 6 : item.percentage);
                const style: React.CSSProperties = {
                  width: `${w}%`,
                  minWidth: `${label.length * 0.62 + 1.6}em`, // đủ chỗ cho con số trên thanh
                  backgroundColor: mauThanh(item.id, thuTu),
                };
                const thanhCls = 'flex h-10 items-center justify-center rounded-lg px-2 text-base font-bold tabular-nums text-white whitespace-nowrap transition-all duration-500 lg:h-11 lg:text-lg';
                return (
                  <div key={item.id} className={`${cot} min-h-[3rem] flex-1 py-1`}>
                    <div className="min-w-0 text-right leading-tight">
                      <span className="block truncate text-base font-medium text-slate-900 lg:text-lg" title={item.name}>{ten}</span>
                      {ma && <span className="block text-sm text-slate-600">{ma}</span>}
                    </div>
                    <div className="flex min-w-0 justify-center">
                      {onBarClick ? (
                        <button type="button" onClick={() => onBarClick(item)} style={style}
                          className={`${thanhCls} cursor-pointer hover:brightness-95 hover:ring-2 hover:ring-slate-300 hover:ring-offset-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1`}
                          title={`${barTitle(item)} (bấm để xem chi tiết theo công trình)`}
                          aria-label={`${barTitle(item)}. Xem chi tiết theo công trình`}>
                          {label}
                        </button>
                      ) : (
                        <div className={thanhCls} style={style} title={barTitle(item)}>{label}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
