// Mẫu bảng báo cáo chung (lấy từ bảng kế hoạch nhập kho tab BOT): tiêu đề xanh, viền xám, số căn giữa, ô 0 để trống,
// dòng TỔNG vàng chữ đỏ dính đáy.
export const table = 'w-full border-separate border-spacing-0 text-[0.9375rem] font-medium text-slate-900';
export const khung = 'overflow-auto border-l border-t border-slate-300 custom-scrollbar';
export const thead = 'sticky top-0 z-20 bg-emerald-300 text-slate-900';
export const thB = 'border-b border-r border-slate-300 px-2 py-1.5 font-bold';
export const tdB = 'border-b border-r border-slate-300 px-2 py-1.5';
export const thC = `${thB} text-center`;
export const tdSo = `${tdB} whitespace-nowrap text-center tabular-nums`;
export const tfoot = 'font-bold text-red-600 [&_td]:sticky [&_td]:bottom-0 [&_td]:z-[2] [&_td]:bg-yellow-300';
export const soO = 'whitespace-nowrap text-center tabular-nums';
export const soBam = 'underline decoration-slate-300 decoration-dotted underline-offset-2';

/** Ô số: 0 để trống */
export const trong0 = (v: number, f: (n: number) => string) => (v ? f(v) : '');
