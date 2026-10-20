import React from 'react';
import { Eye } from 'lucide-react';

// ============================================================================
// Thẻ phễu "Tình trạng đơn hàng AATN" dùng chung (Tổng quan, Luồng đỏ, Căn mẫu).
// - Tiêu đề căn giữa.
// - Thẻ cao bằng cột bên cạnh (thẻ "Cơ cấu đơn hàng"); các hàng (nhãn 1 dòng + thanh) chia ĐỀU
//   toàn bộ chiều cao => thanh tự dày lên lấp đầy khung, không còn khoảng trống. Đứng một mình
//   (màn hẹp) thì mỗi hàng tối thiểu 36px.
// ============================================================================

export interface FunnelCardItem {
  id: string;
  name: string;
  value: number;
  /** Độ rộng thanh theo % (bước đầu = 100) */
  percentage: number;
}

const BAR_COLOR: Record<string, string> = { P001: '#1f2a44', P002: '#64748b', P022: '#16a34a' };
const BAR_DEFAULT_COLOR = '#2563eb';
const LABEL_COL = 'w-52 md:w-[19rem] lg:w-[21.5rem]';                 // cột nhãn công đoạn (đủ rộng để nhãn nằm 1 dòng)
const LABEL_OFFSET = 'left-[14rem] md:left-[20rem] lg:left-[22.5rem]';    // = cột nhãn + khoảng cách (để vẽ khung tam giác đúng chỗ thanh)

interface FunnelCardProps<T extends FunnelCardItem> {
  title?: string;
  subtitle: React.ReactNode;
  /** Đơn vị của con số trên thanh, hiện ở góc trên bên trái (vd. "Tỷ đồng", "Hạng mục") */
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
  return (
  <div className={`bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col ${className}`}>
    {/* Tiêu đề căn giữa; góc trái: đơn vị, góc phải: nút "Chi tiết" */}
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 pt-2 mb-6 xl:pt-4 xl:mb-10">
      {unit ? (
        <span className="justify-self-start self-start inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Đơn vị: {unit}
        </span>
      ) : <span aria-hidden />}
      <div className="text-center">
        <h3 className="text-2xl md:text-3xl xl:text-[2.125rem] font-bold uppercase tracking-wide text-slate-800 leading-tight">{title}</h3>
        <p className="text-base md:text-lg text-slate-500 mt-2">{subtitle}</p>
      </div>
      <button
        onClick={onDetail}
        className="justify-self-end flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-600 rounded-lg hover:bg-slate-50 font-medium text-xs border border-slate-200 transition-colors shrink-0"
        title="Xem bảng chi tiết"
      >
        <Eye size={14} /> Chi tiết
      </button>
    </div>

    {/* Thân phễu: chiếm hết phần còn lại của thẻ, các hàng chia đều chiều cao */}
    <div className="relative flex-1 flex flex-col w-full max-w-6xl mx-auto min-h-0">
      {/* Khung tam giác nét đứt phủ trên cột thanh */}
      <div className={`absolute top-0 bottom-0 right-0 ${LABEL_OFFSET} pointer-events-none z-30`}>
        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" className="overflow-visible">
          <polygon
            points="0,0 100,0 50,100"
            fill="none"
            stroke="#fca5a5"
            strokeWidth="1.5px"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {items.map(item => {
        const label = barLabel(item);
        const widthPercent = Math.min(100, item.value === 0 ? 6 : item.percentage);
        const barStyle: React.CSSProperties = {
          width: `${widthPercent}%`,
          // đủ chỗ cho con số trên thanh (chữ text-sm đậm ~0.62em mỗi ký tự)
          minWidth: `${label.length * 0.62 + 1.4}em`,
          backgroundColor: BAR_COLOR[item.id] ?? BAR_DEFAULT_COLOR,
        };
        const barCls = 'flex items-center justify-center rounded-md text-white font-semibold text-sm lg:text-base tabular-nums whitespace-nowrap px-1 transition-all duration-500';
        return (
          <div key={item.id} className="flex flex-1 min-h-9 items-stretch gap-4 py-[3px] lg:py-1">
            <div className={`${LABEL_COL} shrink-0 flex items-center justify-end text-right text-sm lg:text-[0.9375rem] font-medium text-slate-700 min-w-0`}>
              <span className="truncate whitespace-nowrap" title={item.name}>{item.name}</span>
            </div>
            {/* Thanh chỉ cao ~2/3 hàng (màn rộng) => thanh mảnh, khoảng cách giữa các thanh rõ hơn */}
            <div className="flex-1 min-w-0 flex items-stretch xl:items-center justify-center relative z-20 [&>*]:xl:h-[66%]">
              {onBarClick ? (
                <button
                  type="button"
                  onClick={() => onBarClick(item)}
                  className={`${barCls} cursor-pointer hover:brightness-95 hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-500`}
                  style={barStyle}
                  title={`${barTitle(item)} (bấm để xem chi tiết theo công trình)`}
                  aria-label={`${barTitle(item)}. Xem chi tiết theo công trình`}
                >
                  {label}
                </button>
              ) : (
                <div className={barCls} style={barStyle} title={barTitle(item)}>{label}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
}
