// Trang Tổng quan công trình theo FILE CÔNG TRÌNH: tải GET /api/cong-trinh/hang-muc (có nhớ trong phiên).
// Phần ghép thuần ở components/Construction/core/ghepFileCongTrinh.ts (máy chủ dùng chung để dựng sẵn bản ghi gọn).
import { API_BASE_URL } from './dataService';
import { theoDoiMocBang } from './mocDuLieu';
import type { DuLieuFileCongTrinh } from '../components/Construction/core/ghepFileCongTrinh';

export { ghepDongFile, coSoFile, type DuLieuFileCongTrinh, type DoiFile } from '../components/Construction/core/ghepFileCongTrinh';

// Dùng chung cả phiên: mở lại trang không tải lại (số cũ hơn 1 phút thì lấy lại phía sau). Gộp các lần gọi trùng lúc.
let boNho: { du: DuLieuFileCongTrinh; luc: number } | null = null;
let dangGoi: Promise<DuLieuFileCongTrinh> | null = null;
let luot = 0; // tăng khi có dữ liệu mới: lượt lấy bản đúng bắt đầu trước đó bỏ kết quả
const nghe = new Set<(d: DuLieuFileCongTrinh) => void>();
/** Báo khi bản đúng về sau bản của lần nạp trước */
export const ngheFileCongTrinh = (f: (d: DuLieuFileCongTrinh) => void) => { nghe.add(f); return () => { nghe.delete(f); }; };
// Có dữ liệu mới: số đã nhớ coi như cũ, lượt đang gọi (đọc trước khi đổi) không dùng chung nữa
theoDoiMocBang(doi => { if (doi.has('bot') || doi.has('production')) { if (boNho) boNho.luc = 0; dangGoi = null; luot++; } });
export const fileCongTrinhDaCo = () => boNho?.du ?? null;
export const fileCongTrinhCu = () => !boNho || Date.now() - boNho.luc > 60_000;
const goi = (qs: string): Promise<DuLieuFileCongTrinh> => fetch(`${API_BASE_URL}/cong-trinh/hang-muc${qs}`)
  .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))));
// Đang hiện số lần nạp trước: lấy bản đúng ở nền (máy chủ tính 5–9 giây), về thì báo trang
const layBanDung = async (cu: DuLieuFileCongTrinh) => {
  const cua = luot;
  let d: DuLieuFileCongTrinh;
  try { d = await goi(''); } catch { d = { ...cu, dangCapNhat: false, capNhatLoi: true }; }
  if (cua !== luot || boNho?.du !== cu) return; // đã có lượt mới hơn
  boNho = { du: d, luc: d.capNhatLoi ? 0 : Date.now() };
  nghe.forEach(f => f(d));
};
export const taiFileCongTrinh = (): Promise<DuLieuFileCongTrinh> => {
  if (!dangGoi) {
    // Chưa có số nào: nhận ngay số lần nạp trước. Đã có số đang hiện: giữ nó tới khi bản đúng về như trước
    const p: Promise<DuLieuFileCongTrinh> = goi(boNho ? '' : '?cu=1')
      .then(d => {
        if (dangGoi === p) { boNho = { du: d, luc: Date.now() }; if (d.dangCapNhat) void layBanDung(d); }
        return d;
      })
      .finally(() => { if (dangGoi === p) dangGoi = null; });
    dangGoi = p;
  }
  return dangGoi;
};
