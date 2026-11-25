// Dựng chuỗi URL các API số tổng hợp của trang Tổng quan — hàm thuần, MỘT chỗ cho cả nơi gọi (dataService,
// TongQuanDauTrang, các hook Dashboard) lẫn nơi gửi trước lúc mở app (index.tsx). Bản lưu (services/nhoApi.ts) lấy
// chính chuỗi này làm khoá, nên thứ tự tham số ở đây phải giữ nguyên: lệch 1 ký tự là không nhận lại được bản lưu
// và request gửi trước thành thừa.
import { expandProjectNames } from '../utils/productionMetrics';
import { toISODateLocal } from '../components/Dashboard/utils/dateHelpers';

const API = '/api';

/** Bộ lọc chung của trang (như OverviewFilterOpts của dataService, không kèm signal) */
export interface LocTongQuan {
  congTrinh?: string[];
  xuong?: string[];
  tinhTrang?: string[];
  tinhTrangIpo?: string[];
}

/** Gắn bộ lọc chung vào tham số — thứ tự congTrinh, xuong, tinhTrang, tinhTrangIpo */
export const themLoc = (params: URLSearchParams, loc?: LocTongQuan): void => {
  // Mở rộng thành mọi cách viết của cùng công trình (các bảng nhập/xuất/tồn kho có thể ghi tên khác)
  // Ngăn bằng "|" vì tên công trình có thể chứa dấu phẩy (server đọc được cả 2 kiểu)
  if (loc?.congTrinh?.length) params.set('congTrinh', expandProjectNames(loc.congTrinh).join('|') + '|');
  if (loc?.xuong?.length) params.set('xuong', loc.xuong.join(','));
  if (loc?.tinhTrang?.length) params.set('tinhTrang', loc.tinhTrang.join(','));
  if (loc?.tinhTrangIpo?.length) params.set('tinhTrangIpo', loc.tinhTrangIpo.join(','));
};

// Danh sách công trình gửi NGUYÊN (không mở rộng tên) cho trend / plan-actual / ke-hoach-ngay — như TongQuanDauTrang
const thamSoCt = (ct: string[]) => `${ct.join('|')}|`;
const iso = (d: Date | string) => (typeof d === 'string' ? d : toISODateLocal(d));
const themNgay = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** /api/overview/summary — ngày dạng YYYY-MM-DD; không tham số nào = toàn bộ thời gian */
export const urlOverviewSummary = (from?: string, to?: string, dates?: string[], loc?: LocTongQuan): string => {
  const params = new URLSearchParams();
  if (from) params.set('dateFrom', from);
  if (to) params.set('dateTo', to);
  if (dates?.length) params.set('dates', dates.join(','));
  themLoc(params, loc);
  const qs = params.toString();
  return qs ? `${API}/overview/summary?${qs}` : `${API}/overview/summary`;
};

/** /api/trend nhập kho theo ngày của các xưởng / công trình (rỗng = không lọc) */
export const urlNkNgay = (tu: Date | string, den: Date | string, xuong: string[], ct: string[]): string => {
  const q = new URLSearchParams({ source: 'inventory', granularity: 'day', dateFrom: iso(tu), dateTo: iso(den) });
  if (ct.length) q.set('ctWhitelist', thamSoCt(ct));
  if (xuong.length) q.set('xuong', xuong.join(','));
  return `${API}/trend?${q.toString()}`;
};

/** /api/khsx-nam/plan-actual của 1 năm */
export const urlPlanActual = (nam: string | number, ct: string[]): string => {
  const q = new URLSearchParams({ year: String(nam) });
  if (ct.length) q.set('congTrinh', thamSoCt(ct));
  return `${API}/khsx-nam/plan-actual?${q.toString()}`;
};

/** /api/khsx/ke-hoach-ngay — kế hoạch nhập kho từng ngày trong khoảng */
export const urlKhNgay = (tu: Date | string, den: Date | string, xuong: string[], ct: string[]): string => {
  const q = new URLSearchParams({ tu: iso(tu), den: iso(den) });
  if (xuong.length) q.set('xuong', xuong.join(','));
  if (ct.length) q.set('congTrinh', thamSoCt(ct));
  return `${API}/khsx/ke-hoach-ngay?${q.toString()}`;
};

/** /api/stock/dates */
export const urlStockDates = (loc?: LocTongQuan): string => {
  const params = new URLSearchParams();
  themLoc(params, loc);
  const qs = params.toString();
  return qs ? `${API}/stock/dates?${qs}` : `${API}/stock/dates`;
};

/** /api/revenue/<năm>; không truyền năm = /api/revenue (máy chủ tự chọn năm) */
export const urlRevenue = (nam?: string | number): string => (nam ? `${API}/revenue/${nam}` : `${API}/revenue`);

/** /api/overview/tuy-chon-thoi-gian (không tham số) */
export const urlTuyChonThoiGian = (): string => `${API}/overview/tuy-chon-thoi-gian`;

/** /api/vuong-mac/by-project (không tham số) */
export const urlVuongMacTheoCongTrinh = (): string => `${API}/vuong-mac/by-project`;

/**
 * Các URL màn đầu trang Tổng quan khi bộ lọc còn mặc định (kỳ "hôm qua", không lọc xưởng / công trình), tính từ giờ
 * máy — gửi trước lúc mở app, component gắn sau nhận lại đúng các request này.
 * Thứ tự = thứ tự vào hàng đợi: 3 cái đầu đi cùng lượt với /api/auth/me.
 */
export const urlManDau = (now: Date): string[] => {
  // Mốc các kỳ = HÔM QUA (như ngayMoi của TongQuanDauTrang)
  const hq = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const hk = themNgay(hq, -1);
  const tu7 = themNgay(hq, -6);
  return [
    urlOverviewSummary(iso(hq), iso(hq)),
    urlNkNgay(tu7, hq, [], []),
    urlPlanActual(hq.getFullYear(), []),
    urlTuyChonThoiGian(),
    urlOverviewSummary(iso(hk), iso(hk)),
    urlKhNgay(tu7, hq, [], []),
    // Đoán "Ngày báo cáo" mặc định = hôm qua; hôm qua không có số thì request này thừa, số cuối không đổi
    urlOverviewSummary(iso(hq), iso(hq), [iso(hq)]),
  ];
};

/**
 * URL gửi trước lúc mở app (index.tsx) theo trang đang mở; [] = không gửi gì.
 * Chỉ gửi cho bản máy tính (đường dẫn /m…, /xuong… là app điện thoại / trạm quét, không có trang Tổng quan) và khi
 * tài khoản lưu trên máy có quyền xem trang đó (như hasPermission của AuthContext): không thì các request này là thừa.
 */
export const urlGuiTruoc = (
  pathname: string, hash: string, u: { role?: unknown; permissions?: unknown } | null | undefined, now: Date,
): string[] => {
  if (pathname.startsWith('/m') || /^\/xuong(\/|$)/.test(pathname)) return [];
  const coQuyen = (viewId: string) =>
    !!u && (u.role === 'ADMIN' || (Array.isArray(u.permissions) && u.permissions.includes(viewId)));
  if (hash === '' || hash === '#/') return coQuyen('dashboard') ? urlManDau(now) : [];
  if (hash === '#/cong-trinh/tong-quan') return coQuyen('construction_overview') ? [urlVuongMacTheoCongTrinh()] : [];
  return [];
};

/** Trang -> quyền cần có + URL đầu tiên trang đó gọi (cố định, không phụ thuộc bộ lọc) */
const TRANG_GUI_TRUOC: Record<string, { quyen: string; url: string }> = {
  '/cong-trinh/ho-so': { quyen: 'construction_overview', url: `${API}/ho-so-cong-trinh/danh-sach` },
  '/users': { quyen: 'users', url: `${API}/users?page=1&pageSize=100` },
};

/**
 * Request gửi trước cho bản máy tính (services/authFetch.guiTruocTrang): phiên đăng nhập, phiên bản dữ liệu, và URL đầu
 * tiên của trang đang mở nếu tài khoản lưu trên máy có quyền.
 */
export const urlGuiTruocTrang = (
  pathname: string, hash: string, u: { role?: unknown; permissions?: unknown } | null | undefined,
): string[] => {
  if (pathname.startsWith('/m') || /^\/xuong(\/|$)/.test(pathname) || !u) return [];
  const [trang, qs = ''] = hash.replace(/^#/, '').split('?');
  if (trang === '/login') return [];
  const ra = [`${API}/auth/me`, `${API}/check-versions`];
  const t = Object.prototype.hasOwnProperty.call(TRANG_GUI_TRUOC, trang) ? TRANG_GUI_TRUOC[trang] : undefined;
  if (!t || !(u.role === 'ADMIN' || (Array.isArray(u.permissions) && u.permissions.includes(t.quyen)))) return ra;
  ra.push(t.url);
  if (trang === '/cong-trinh/ho-so') {
    const ma = new URLSearchParams(qs).get('ma') ?? '';
    if (/^[A-Z]{2,3}\d{2}-[0-9A-Z]{1,12}$/.test(ma)) ra.push(`${API}/ho-so-cong-trinh/${ma}`);
  }
  return ra;
};
