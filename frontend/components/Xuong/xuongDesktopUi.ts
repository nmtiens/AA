// Kiểu dáng dùng chung cho các màn Xưởng trên máy tính — theo các thẻ Setup sẵn có (WorkshopGroupSetup).
export const INPUT = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-slate-500 focus:outline-none disabled:bg-slate-50';
export const BTN = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const BTN_CHINH = 'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';
// overflow-x-auto (không phải hidden): bảng rộng hơn màn điện thoại (app Xưởng → Quản lý) vuốt ngang được thay vì bị cắt
export const KHUNG = 'overflow-x-auto rounded-2xl border border-slate-200 bg-white';
export const TH = 'px-3 py-2 text-left text-xs font-medium text-slate-500';
export const TD = 'px-3 py-2 align-top text-sm text-slate-700';

/**
 * Khổ điện thoại (app MRA → Báo cáo / Quản lý / Tra cứu dùng lại màn máy tính): bọc ngoài để mọi nút / ô chọn / ô nhập
 * cao ≥ 44px và chữ nhỏ lên một cỡ (12 → 14, 14 → 16px) — sửa một chỗ thay vì từng màn. Chỉ dùng khi đang ở điện thoại.
 */
export const KHO_DIEN_THOAI = [
  '[&_button]:min-h-11', '[&_select]:min-h-11', '[&_summary]:min-h-11', '[&_summary]:flex', '[&_summary]:items-center',
  '[&_input[type=date]]:min-h-11', '[&_input[type=month]]:min-h-11', '[&_input[type=text]]:min-h-11', '[&_input[type=search]]:min-h-11',
  '[&_input:not([type])]:min-h-11', '[&_input[type=number]]:min-h-11',
  '[&_label:has(input[type=checkbox])]:min-h-11', '[&_label:has(input[type=checkbox])]:inline-flex', '[&_label:has(input[type=checkbox])]:items-center',
  '[&_.text-xs]:text-sm', '[&_.text-sm]:text-base',
].join(' ');
