import type { FiveMCategory, VuongMacQuery, VmStatus, VmPriority } from '../../services/vuongMacService';
import { dayKey, CAT_CODE, STATUS_META } from '../VuongMac/model';

// ============================================================================
// Bộ lọc danh sách vướng mắc trên mobile — đặt ở màn cha để màn Tổng quan
// có thể mở danh sách với bộ lọc sẵn (vd. bấm "Quá hạn BOT").
// ============================================================================

export type DateMode = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';
export const DATE_LABELS: Record<DateMode, string> = {
  today: 'Hôm nay', yesterday: 'Hôm qua', '7d': '7 ngày', '30d': '30 ngày', all: 'Mọi ngày', custom: 'Chọn ngày',
};

/** Nhóm trạng thái ở thanh chọn nhanh; notClosed (chưa đóng = chưa xong + chờ xác nhận) không có nút riêng —
 *  chỉ mở từ ô "Việc tôi đã báo" (khớp phép đếm reported), hiện thành chip bỏ được */
export type StatusTab = 'active' | 'waiting' | 'closed' | 'all' | 'notClosed';
export const STATUS_TAB_LABELS: Record<StatusTab, string> = {
  active: 'Chưa xong', waiting: 'Chờ xác nhận', closed: 'Đã đóng', all: 'Tất cả', notClosed: 'Chưa đóng',
};
export const STATUS_TAB_ST: Record<StatusTab, VmStatus[]> = {
  active: ['open', 'doing'], waiting: ['done'], closed: ['closed'], all: [], notClosed: ['open', 'doing', 'done'],
};

export type MineMode = '' | '1' | 'assignee' | 'reporter' | 'confirm';
export const MINE_LABELS: Record<MineMode, string> = {
  '': 'Tất cả', '1': 'Liên quan tôi', assignee: 'Tôi xử lý', reporter: 'Tôi báo', confirm: 'Chờ tôi xác nhận',
};

export interface ListFilters {
  tab: StatusTab;
  /** Lọc riêng 1 trạng thái trong nhóm (vd. chỉ "Mới") — rỗng = cả nhóm */
  st: VmStatus | '';
  cat: FiveMCategory | '';
  q: string;
  mine: MineMode;
  due: '' | 'overdue' | 'soon';
  sort: '' | 'bot' | 'oldest' | 'priority';
  priority: VmPriority | '';
  xuong: string;
  /** Lọc theo tên công trình (tham số congTrinh của API, chỉ so tên công trình — không lẫn nội dung) */
  congTrinh: string;
  dateMode: DateMode;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_FILTERS: ListFilters = {
  tab: 'active', st: '', cat: '', q: '', mine: '', due: '', sort: '', priority: '', xuong: '', congTrinh: '',
  // Mặc định: mọi vướng mắc chưa xong (mọi ngày) — trước chỉ hiện mục tạo trong ngày nên dễ "mất" việc cũ
  dateMode: 'all', dateFrom: '', dateTo: '',
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
export const toQuery = (f: ListFilters, page: number, pageSize = 30): VuongMacQuery => {
  const [from, to] = dateRange(f.dateMode, f.dateFrom, f.dateTo);
  const st = f.st ? [f.st] : STATUS_TAB_ST[f.tab];
  return {
    status: f.tab === 'all' ? 'all' : undefined,
    st: st.length ? st : '',
    category: f.cat, q: f.q.trim(), page, pageSize,
    mine: f.mine, due: f.due, sort: f.sort, priority: f.priority, xuong: f.xuong, congTrinh: f.congTrinh.trim(), from, to,
  };
};

/** Các bộ lọc "phụ" đang bật (hiện thành chip có thể bỏ) */
export const activeChips = (f: ListFilters): { key: string; label: string; clear: Partial<ListFilters> }[] => {
  const out: { key: string; label: string; clear: Partial<ListFilters> }[] = [];
  if (f.tab === 'notClosed') out.push({ key: 'tab', label: `📂 ${STATUS_TAB_LABELS.notClosed}`, clear: { tab: 'all', st: '' } });
  if (f.mine) out.push({ key: 'mine', label: `👤 ${MINE_LABELS[f.mine]}`, clear: { mine: '' } });
  if (f.st) out.push({ key: 'st', label: `${STATUS_META[f.st].icon} ${STATUS_META[f.st].label}`, clear: { st: '' } });
  if (f.due) out.push({ key: 'due', label: f.due === 'overdue' ? '⏰ Quá hạn BOT' : '⌛ Sắp đến hạn', clear: { due: '' } });
  if (f.cat) out.push({ key: 'cat', label: `🏷️ ${CAT_CODE[f.cat] ?? f.cat}`, clear: { cat: '' } });
  if (f.priority) out.push({ key: 'priority', label: f.priority === 'urgent' ? '🔥 Khẩn' : '🔺 Ưu tiên cao', clear: { priority: '' } });
  if (f.xuong) out.push({ key: 'xuong', label: `🏭 ${f.xuong}`, clear: { xuong: '' } });
  // `__none__` = vướng mắc không xác định được công trình => hiện "Chưa rõ"
  if (f.congTrinh) out.push({ key: 'congTrinh', label: `🏗️ ${f.congTrinh === '__none__' ? 'Chưa rõ' : f.congTrinh}`, clear: { congTrinh: '' } });
  if (f.dateMode !== 'all') {
    const label = f.dateMode === 'custom'
      ? `📅 ${f.dateFrom || '…'} → ${f.dateTo || '…'}`
      : `📅 ${DATE_LABELS[f.dateMode]}`;
    out.push({ key: 'date', label, clear: { dateMode: 'all', dateFrom: '', dateTo: '' } });
  }
  if (f.sort) {
    const label = f.sort === 'bot' ? '↕ Hạn BOT gần nhất' : f.sort === 'oldest' ? '↕ Cũ nhất trước' : '↕ Ưu tiên trước';
    out.push({ key: 'sort', label, clear: { sort: '' } });
  }
  return out;
};
