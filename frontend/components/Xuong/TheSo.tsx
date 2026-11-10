import type { ReactNode } from 'react';

/** Thẻ số Báo cáo, Kế hoạch, Phân tích. Điện thoại ẩn dòng phụ để bảng lên sớm hơn */
export default function TheSo({ ten, giaTri, phu, mau, rong }: { ten: string; giaTri: string; phu?: ReactNode; mau?: string; rong?: boolean }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm rsm:p-4 ${rong ? 'col-span-2 rmd:col-span-1' : ''}`}>
      <p className="text-sm font-semibold text-slate-600">{ten}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums rsm:text-2xl ${mau ?? 'text-slate-900'}`}>{giaTri}</p>
      {phu && <p className="mt-0.5 hidden text-[0.8125rem] text-slate-500 rsm:block">{phu}</p>}
    </div>
  );
}
