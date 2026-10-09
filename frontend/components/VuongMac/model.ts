import type { VuongMacItem, VmStatus, VmPriority, FiveMCategory } from '../../services/vuongMacService';
import { parseBotEnd } from '../../services/vuongMacMobileApi';

// ============================================================================
// MÔ HÌNH HIỂN THỊ VƯỚNG MẮC — dùng chung cho app điện thoại (/m/) và màn quản lý trên web.
//
// Quy trình: open (Mới) -> doing (Đang xử lý) -> done (Đã xử lý, chờ xác nhận) -> closed (Đã đóng)
// Trạng thái hiển thị thêm "quá hạn" / "sắp đến hạn" theo BOT cho các mục chưa xong.
// ============================================================================

export const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "HH:mm dd/MM/yyyy" — cùng định dạng với BOT */
export const fmtShort = (s?: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '');
/** "dd/MM/yyyy" từ chuỗi ngày "YYYY-MM-DD" hoặc ISO */
export const fmtDay = (s?: string | null) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** Khoảng thời gian dạng ngắn: "5 phút", "3 giờ", "2 ngày" */
export const fmtSpan = (ms: number) => {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60000));
  if (m < 60) return `${m} phút`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} giờ`;
  return `${Math.round(h / 24)} ngày`;
};
/** "vừa xong", "5 phút trước", "2 ngày trước" */
export const fmtAgo = (s?: string | null) => {
  if (!s) return '';
  const ms = Date.now() - new Date(s).getTime();
  return ms < 60000 ? 'vừa xong' : `${fmtSpan(ms)} trước`;
};
export const fmtHours = (h: number | null | undefined) => {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.round(h * 60)} phút`;
  if (h < 48) return `${Math.round(h * 10) / 10} giờ`;
  return `${Math.round((h / 24) * 10) / 10} ngày`;
};

// ---------------- Loại vướng mắc (5M) ----------------
export const CAT_ICON: Record<string, string> = {
  man: '👷', machine: '⚙️', material: '🪵', method: '📋', measurement: '📏',
};
export const catIcon = (c: string) => CAT_ICON[c] ?? '🏷️';
export const CAT_CODE: Record<string, string> = { man: 'M1', machine: 'M2', material: 'M3', method: 'M4', measurement: 'M5' };
export const CAT_NAME: Record<string, string> = {
  man: 'Con người', machine: 'Máy móc', material: 'Vật tư', method: 'Phương pháp', measurement: 'Đo lường',
};
/** "M1 · Con người" */
export const catLabel = (c: string) => (CAT_CODE[c] ? `${CAT_CODE[c]} · ${CAT_NAME[c]}` : c);
/** Gợi ý ngắn khi chọn loại */
export const CAT_HINT: Record<FiveMCategory, string> = {
  man: 'Thiếu người, tay nghề, nghỉ việc, chưa được đào tạo…',
  machine: 'Máy hỏng, chờ sửa, thiếu công suất, dụng cụ…',
  material: 'Thiếu / sai / chậm vật tư, NVL lỗi…',
  method: 'Bản vẽ, quy trình, hướng dẫn chưa rõ, sai cách làm…',
  measurement: 'Sai kích thước, QC trả về, dụng cụ đo…',
};
/** Từ khoá phòng ban nên xử lý theo loại — để gợi ý người xử lý (so với users.department) */
export const CAT_DEPT_KEYWORDS: Record<FiveMCategory, string[]> = {
  man: ['nhân sự', 'hành chính', 'xưởng', 'sản xuất'],
  machine: ['cơ điện', 'bảo trì', 'kỹ thuật', 'thiết bị'],
  material: ['mua', 'vật tư', 'kho', 'kế hoạch', 'pc', 'kh'],
  method: ['kỹ thuật', 'công nghệ', 'thiết kế', 'r&d', 'bản vẽ'],
  measurement: ['qc', 'kcs', 'chất lượng', 'qa'],
};

// ---------------- Trạng thái quy trình ----------------
export const STATUS_META: Record<VmStatus, { label: string; short: string; icon: string; pill: string; bar: string; dot: string; hint: string }> = {
  open:   { label: 'Mới báo', short: 'Mới', icon: '🆕', pill: 'bg-blue-100 text-blue-800', bar: 'bg-blue-500', dot: 'bg-blue-500',
            hint: 'Chưa ai nhận xử lý' },
  doing:  { label: 'Đang xử lý', short: 'Đang XL', icon: '🔧', pill: 'bg-indigo-100 text-indigo-800', bar: 'bg-indigo-500', dot: 'bg-indigo-500',
            hint: 'Người xử lý đã nhận và đang làm' },
  done:   { label: 'Chờ xác nhận', short: 'Chờ XN', icon: '🕓', pill: 'bg-teal-100 text-teal-800', bar: 'bg-teal-500', dot: 'bg-teal-500',
            hint: 'Người xử lý báo đã xong, chờ người báo kiểm tra và đóng' },
  closed: { label: 'Đã đóng', short: 'Đóng', icon: '✓', pill: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', dot: 'bg-emerald-500',
            hint: 'Người báo đã xác nhận xử lý xong' },
};

export const PRIORITY_META: Record<VmPriority, { label: string; icon: string; pill: string }> = {
  normal: { label: 'Bình thường', icon: '', pill: 'bg-slate-100 text-slate-600' },
  high:   { label: 'Cao', icon: '🔺', pill: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Khẩn', icon: '🔥', pill: 'bg-red-100 text-red-700' },
};

/** Trạng thái hiển thị trên thẻ: kết hợp quy trình + hạn BOT */
export type DisplayState = 'closed' | 'done' | 'overdue' | 'soon' | 'doing' | 'open';
export const DISPLAY_META: Record<DisplayState, { label: string; icon: string; pill: string; bar: string; dot: string }> = {
  overdue: { label: 'Quá hạn BOT', icon: '⏰', pill: 'bg-red-100 text-red-700', bar: 'bg-red-500', dot: 'bg-red-500' },
  soon:    { label: 'Sắp đến hạn', icon: '⌛', pill: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  open:    STATUS_META.open,
  doing:   STATUS_META.doing,
  done:    STATUS_META.done,
  closed:  STATUS_META.closed,
};

export const SOON_MS = 24 * 60 * 60 * 1000; // khớp backend: còn ≤ 24 giờ là "sắp đến hạn"
export const isActive = (v: Pick<VuongMacItem, 'status'>) => v.status === 'open' || v.status === 'doing';

// Ưu tiên: đã đóng > chờ xác nhận > quá hạn > sắp đến hạn > đang xử lý > mới
export const displayState = (v: Pick<VuongMacItem, 'status' | 'bot'>): DisplayState => {
  if (v.status === 'closed') return 'closed';
  if (v.status === 'done') return 'done';
  const end = parseBotEnd(v.bot);
  const left = end ? end.getTime() - Date.now() : null;
  if (left !== null && left < 0) return 'overdue';
  if (left !== null && left <= SOON_MS) return 'soon';
  return v.status === 'doing' ? 'doing' : 'open';
};

/** "Quá hạn 2 ngày" / "Còn 3 giờ" — null nếu đã xong hoặc không có BOT */
export const botCountdown = (v: Pick<VuongMacItem, 'status' | 'bot'>): { text: string; cls: string } | null => {
  if (!isActive(v)) return null;
  const end = parseBotEnd(v.bot);
  if (!end) return null;
  const left = end.getTime() - Date.now();
  if (left < 0) return { text: `Quá hạn ${fmtSpan(left)}`, cls: 'text-red-600' };
  return { text: `Còn ${fmtSpan(left)}`, cls: left <= SOON_MS ? 'text-amber-700' : 'text-slate-500' };
};

/** Tuổi vướng mắc (từ lúc báo) */
export const ageText = (v: Pick<VuongMacItem, 'createdAt'>) => fmtSpan(Date.now() - new Date(v.createdAt).getTime());

// ---------------- Hạn nhập kho của hạng mục vs BOT xử lý ----------------
export interface DeadlineInfo {
  /** Hạn nhập kho của hạng mục (KH tuần -> tháng) */
  date: Date | null;
  daysLeft: number | null;
  /** BOT xử lý vướng mắc kết thúc SAU hạn nhập kho của hạng mục => chắc chắn trễ */
  botAfterDeadline: boolean;
}
export const deadlineInfo = (v: { deadline?: string | null; bot?: string | null }): DeadlineInfo => {
  const m = String(v.deadline ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { date: null, daysLeft: null, botAfterDeadline: false };
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.floor((date.getTime() - today.getTime()) / 86_400_000);
  const end = parseBotEnd(v.bot);
  return { date, daysLeft, botAfterDeadline: !!end && end.getTime() > date.getTime() };
};

// ---------------- BOT: chọn nhanh ----------------
export const fmtBot = (d: Date) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
export const botRangeText = (start: Date, end: Date) => `${fmtBot(start)} - ${fmtBot(end)}`;

export interface BotPreset { key: string; label: string; end: (now: Date) => Date }
const at = (d: Date, h: number, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const BOT_PRESETS: BotPreset[] = [
  { key: '2h', label: '+2 giờ', end: now => new Date(now.getTime() + 2 * 3_600_000) },
  { key: '4h', label: '+4 giờ', end: now => new Date(now.getTime() + 4 * 3_600_000) },
  { key: 'eod', label: 'Cuối ngày (17:00)', end: now => (now.getHours() < 17 ? at(now, 17) : at(addDays(now, 1), 17)) },
  { key: 'tmr', label: 'Ngày mai 17:00', end: now => at(addDays(now, 1), 17) },
  { key: '3d', label: '+3 ngày', end: now => at(addDays(now, 3), 17) },
  { key: '1w', label: '+1 tuần', end: now => at(addDays(now, 7), 17) },
];

// Date -> giá trị cho <input type="datetime-local">
export const dateToLocalInput = (d: Date | null) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
// "HH:mm dd/MM/yyyy" (dạng lưu trong bot) -> giá trị cho <input type="datetime-local">
export const botTextToLocalInput = (s?: string | null) => {
  const m = (s ?? '').trim().match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[5]}-${pad(+m[4])}-${pad(+m[3])}T${pad(+m[1])}:${m[2]}` : '';
};
// "2026-09-30T16:21" (datetime-local) -> "16:21 30/09/2026"
export const localInputToBot = (v: string) => {
  const [d, t] = v.split('T');
  if (!d || !t) return '';
  const [y, mo, da] = d.split('-');
  return `${t.slice(0, 5)} ${da}/${mo}/${y}`;
};

/** Chữ cái đầu của tên (avatar) */
export const initials = (name?: string | null) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Công đoạn (BOP) rút gọn: "P013 - GIA CÔNG..." -> "P013" */
export const stageOf = (bop?: string | null) => String(bop ?? '').trim().toUpperCase().match(/^(P\d{3}|GCVT)/)?.[1] ?? null;

// ---------------- HEX dùng gần đây (để báo nhanh) ----------------
const RECENT_KEY = 'vm_recent_hex';
export interface RecentHex { hex: string; congTrinh?: string | null; hangMuc?: string | null; xuong?: string | null; at: number }
export const loadRecentHex = (): RecentHex[] => {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
export const pushRecentHex = (h: Omit<RecentHex, 'at'>) => {
  try {
    const list = loadRecentHex().filter(x => x.hex !== h.hex);
    list.unshift({ ...h, at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch { /* bỏ qua */ }
};
