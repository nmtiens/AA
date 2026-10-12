import type { DataRow } from '../../../types';
import { materialLineState, materialDueDate } from '../../../utils/productionMetrics';

// Màu dòng trong "Chi tiết dữ liệu vật tư" — theo cùng trạng thái dòng PR với tab BOM
// (materialLineState): hủy / CCLD / PR đóng / đã nhận đủ / kho báo về / trễ hẹn / chưa mua / gia công ngoài / tạm dừng / đang mua.
export const materialRowClass = (row: DataRow): string => {
  const st = materialLineState(row);
  switch (st) {
    case 'cancelled': return 'bg-gray-100 text-gray-500 italic';
    case 'done': return 'bg-green-100 text-green-800';
    case 'ccld':
    case 'closedShort': return 'bg-slate-50 text-slate-600';
    case 'arrived': return 'bg-sky-50 text-sky-800';
    case 'late': return 'bg-red-100 text-red-700 font-semibold';
    case 'deferred': return 'bg-amber-50 text-amber-800';
    case 'notOrdered': return 'bg-rose-50 text-rose-700';
    case 'outsourced': return 'bg-fuchsia-50 text-fuchsia-800';
    case 'onHold': return 'bg-stone-100 text-stone-500';
    case 'onTrack': {
      // Đang mua: sắp tới ngày dự kiến giao thì tô đậm dần
      const due = materialDueDate(row);
      if (due) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
        if (diff === 0) return 'bg-orange-200 text-orange-800 font-bold';
        if (diff <= 5) return 'bg-yellow-50 text-slate-700';
      }
      return 'bg-yellow-100 text-slate-700';
    }
    default: return 'bg-white hover:bg-slate-50';
  }
};
