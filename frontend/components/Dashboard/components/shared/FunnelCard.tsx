import React from 'react';
import { Eye } from 'lucide-react';

// ============================================================================
// Thẻ phễu "Tình trạng đơn hàng AATN" (trang Tổng quan) — phương án A (docs/designs/figma-thiet-ke-lai/9a):
// giữ dáng phễu (thanh căn giữa, rộng theo giá trị), bỏ khung tam giác nét đứt; công đoạn gom 3 nhóm có tiêu đề + tổng
// (Chưa sản xuất · Đang trên chuyền · Trong kho), màu theo nhóm.
// ============================================================================

export interface FunnelCardItem {
  id: string;
  name: string;
  value: number;
  /** Độ rộng thanh theo % (bước lớn nhất = 100) */
  percentage: number;
}

type Nhom = 'chua' | 'chuyen' | 'kho';
const NHOM: Array<{ key: Nhom; label: string; chu: string }> = [
  { key: 'chua', label: 'Chưa sản xuất', chu: 'text-slate-600' },
  { key: 'chuyen', label: 'Đang trên chuyền', chu: 'text-amber-700' },
  { key: 'kho', label: 'Trong kho', chu: 'text-emerald-700' },
];
const nhomCua = (id: string): Nhom =>
  id === 'P001' || id === 'P002' || id === 'P012' ? 'chua' : id.startsWith('P022') || id === 'P025' ? 'kho' : 'chuyen';
// Chưa sản xuất: xám đậm -> nhạt dần theo thứ tự; trên chuyền: cam; kho: xanh (nhập chưa đủ nhạt hơn)
const mauThanh = (id: string, thuTu: number) => {
  const n = nhomCua(id);
  if (n === 'chua') return ['#3f4654', '#5b6170', '#7a8394'][thuTu] ?? '#7a8394';
  if (n === 'chuyen') return '#f7941d';
  return id === 'P022' ? '#12805c' : '#7fb89e';
};
/** "P001. Chưa triển khai" → ["Chưa triển khai", "P001"]; "GCVT (sau P013)" → ["GCVT (sau P013)", ""] */
const tachTen = (name: string): [string, string] => {
  const m = name.match(/^(P\d{3}(?:\/P\d{3})?)\.\s*(.*)$/);
  return m ? [m[2], m[1]] : [name, ''];
};

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
}

export function FunnelCard<T extends FunnelCardItem>({
  title = 'Tình trạng đơn hàng AATN', subtitle, unit, items, barLabel, barTitle, onBarClick, onDetail, className = '',
}: FunnelCardProps<T>) {
  const cot = 'grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]';

  return (
    <div className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-5 lg:p-6 ${className}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {subtitle}{unit ? ` · đơn vị ${unit.toLowerCase()}` : ''} · bấm thanh để xem theo công trình
          </p>

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
          <svg className="block h-full min-h-0 w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="0,0 100,0 50,100" fill="#fef2f2" fillOpacity="0.45" stroke="#f87171" strokeOpacity="0.7"
              strokeWidth="1.25" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        {NHOM.map(g => {
          const ds = items.filter(i => nhomCua(i.id) === g.key);
          if (!ds.length) return null;
          const tongNhom = ds.reduce((s, i) => s + i.value, 0);
          return (
            // Nhóm giãn theo số dòng => các dòng chia đều chiều cao khung (cao bằng khung Nhóm đơn hàng bên cạnh)
            <div key={g.key} className="relative flex flex-col" style={{ flexGrow: ds.length + 1 }}>
              {/* Tiêu đề nhóm: vạch đứt ngang cột thanh + tên nhóm · tổng */}
              <div className="mb-1 mt-2 flex items-center gap-3 pl-[12rem] lg:pl-[15rem]">
                <span className="flex-1 border-t-2 border-dashed border-slate-200" aria-hidden />
                <span className={`whitespace-nowrap bg-white pl-1 text-xs font-semibold lg:text-sm ${g.chu}`}>
                  {g.label} · {barLabel({ ...ds[0], value: tongNhom })}
                </span>
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
                const thanhCls = 'flex h-8 items-center justify-center rounded-lg px-1 text-sm font-semibold tabular-nums text-white whitespace-nowrap transition-all duration-500';
                return (
                  <div key={item.id} className={`${cot} min-h-[2.5rem] flex-1 py-[3px]`}>
                    <div className="min-w-0 text-right leading-tight">
                      <span className="block truncate text-sm text-slate-800 lg:text-[0.9375rem]" title={item.name}>{ten}</span>
                      {ma && <span className="block text-xs text-slate-400">{ma}</span>}
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
