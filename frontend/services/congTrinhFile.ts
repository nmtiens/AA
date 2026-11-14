// Trang Tổng quan công trình theo FILE CÔNG TRÌNH: tải GET /api/cong-trinh/hang-muc (có nhớ trong phiên).
// Phần ghép thuần ở components/Construction/core/ghepFileCongTrinh.ts (máy chủ dùng chung để dựng sẵn bản ghi gọn).
import { API_BASE_URL } from './dataService';
import type { DuLieuFileCongTrinh } from '../components/Construction/core/ghepFileCongTrinh';

export { ghepDongFile, coSoFile, type DuLieuFileCongTrinh, type DoiFile } from '../components/Construction/core/ghepFileCongTrinh';

// Dùng chung cả phiên: mở lại trang không tải lại (số cũ hơn 1 phút thì lấy lại phía sau). Gộp các lần gọi trùng lúc.
let boNho: { du: DuLieuFileCongTrinh; luc: number } | null = null;
let dangGoi: Promise<DuLieuFileCongTrinh> | null = null;
export const fileCongTrinhDaCo = () => boNho?.du ?? null;
export const fileCongTrinhCu = () => !boNho || Date.now() - boNho.luc > 60_000;
export const taiFileCongTrinh = (): Promise<DuLieuFileCongTrinh> => {
  if (!dangGoi) {
    dangGoi = fetch(`${API_BASE_URL}/cong-trinh/hang-muc`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: DuLieuFileCongTrinh) => { boNho = { du: d, luc: Date.now() }; return d; })
      .finally(() => { dangGoi = null; });
  }
  return dangGoi;
};
