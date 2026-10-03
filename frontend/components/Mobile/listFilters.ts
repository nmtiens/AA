import type { FiveMCategory, VuongMacQuery } from '../../services/vuongMacService';
import { dayKey, CAT_CODE } from './mobileUi';

// ============================================================================
// Bộ lọc danh sách vướng mắc trên mobile — đặt ở màn cha để màn Tổng quan
// có thể mở danh sách với bộ lọc sẵn (vd. bấm "Quá hạn BOT").
// ============================================================================

export type DateMode = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';
export const DATE_LABELS: Record<DateMode, string> = {
  today: 'Hôm nay', yesterday: 'Hôm qua', '7d': '7 ngày', '30d': '30 ngày', all: 'Mọi ngày', custom: 'Chọn ngày',
};

export interface ListFilters {
  status: 'open' | 'resolved' | 'all';
  cat: FiveMCategory | '';
  q: string;
  mine: boolean;
  due: '' | 'overdue' | 'soon';
  sort: '' | 'bot';
  dateMode: DateMode;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_FILTERS: ListFilters = {
  status: 'open', cat: '', q: '', mine: false, due: '', sort: '',
  // Giữ như trước: mặc định chỉ hiện vướng mắc tạo trong ngày
  dateMode: 'today', dateFrom: '', dateTo: '',
};

/** Ngày tạo từ/đến (YYYY-MM-DD) theo chế độ */
export const dateRange = (mode: DateMode, from: string, to: string): [string, string] => {
  const n = new Date();
  const back = (k: number) => dayKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() - k));
  switch (mode) {
    case 'today': return [back(0), back(0)];
    case 'yesterday': return [back(1), back(1)];
    case '7d': return [back(6), back(0)];
    case '30d': return [back(29), back(0)];
    case 'custom': return [from, to];
    default: return ['', ''];
  }
};

/** Bộ lọc -> tham số API (/api/vuong-mac/all) */
export const toQuery = (f: ListFilters, page: number): VuongMacQuery => {
  const [from, to] = dateRange(f.dateMode, f.dateFrom, f.dateTo);
  return {
    status: f.status, category: f.cat, q: f.q.trim(), page,
    mine: f.mine ? '1' : '', due: f.due, sort: f.sort, from, to,
  };
};

/** Các bộ lọc "phụ" đang bật (hiện thành chip có thể bỏ) */
export const activeChips = (f: ListFilters): { key: string; label: string; clear: Partial<ListFilters> }[] => {
  const out: { key: string; label: string; clear: Partial<ListFilters> }[] = [];
  if (f.mine) out.push({ key: 'mine', label: '👤 Của tôi', clear: { mine: false } });
  if (f.due) out.push({ key: 'due', label: f.due === 'overdue' ? '⏰ Quá hạn BOT' : '⌛ Sắp đến hạn', clear: { due: '' } });
  if (f.cat) out.push({ key: 'cat', label: `🏷️ ${CAT_CODE[f.cat] ?? f.cat}`, clear: { cat: '' } });
  if (f.dateMode !== 'all') {
    const label = f.dateMode === 'custom'
      ? `📅 ${f.dateFrom || '…'} → ${f.dateTo || '…'}`
      : `📅 ${DATE_LABELS[f.dateMode]}`;
    out.push({ key: 'date', label, clear: { dateMode: 'all', dateFrom: '', dateTo: '' } });
  }
  if (f.sort === 'bot') out.push({ key: 'sort', label: '↕ Hạn BOT gần nhất', clear: { sort: '' } });
  return out;
};
