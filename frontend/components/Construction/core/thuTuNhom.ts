// Thứ tự + luồng (đỏ / vàng) của công trình trong 1 nhóm (Luồng đỏ, Căn mẫu) — người dùng setup ở
// Setup dữ liệu → Nhóm công trình. STT người dùng tự gõ: cho trùng (2 công trình cùng số 1), cho bỏ số
// (không có số 5); chưa gõ thì mặc định = STT dòng trên + 1 (danh sách mới: 1, 2, 3... liền, không thiếu số).
// Lưu ở view_project_mapping dòng '<viewId>:thu-tu' (xem backend/src/server/viewMapping.ts).

import { projectMatchKey } from '../../../utils/productionMetrics';

export type Luong = 'do' | 'vang';

/** 1 dòng lưu ở '<viewId>:thu-tu' */
export interface ThuTuCongTrinh {
  ten: string;
  stt: number;
  luong: Luong;
}

/** Kết quả tra 1 công trình: STT, luồng và vị trí trong danh sách (0 = đầu) để xếp ổn định khi trùng STT */
export interface ThuTuTra {
  stt: number;
  luong: Luong;
  viTri: number;
}

export const laSttHopLe = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 9999;

/** Đọc mảng thô (GET) thành ThuTuCongTrinh[]; bỏ phần tử sai dạng. */
export function docThuTu(raw: unknown): ThuTuCongTrinh[] {
  if (!Array.isArray(raw)) return [];
  const out: ThuTuCongTrinh[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const { ten, stt, luong } = x as Record<string, unknown>;
    if (typeof ten !== 'string' || !ten.trim() || !laSttHopLe(stt)) continue;
    out.push({ ten, stt, luong: luong === 'vang' ? 'vang' : 'do' });
  }
  return out;
}

/** Mã công trình CTxx-xxx / POxx-xxx trong tên (lấy mã cuối, vd "ST.REGIS_..._CT26-061" => "CT26-061"); không có => ''. */
export const maTrongTen = (ten: unknown): string => {
  const ds = [...String(ten ?? '').toUpperCase().matchAll(/(CT|PO)\s?(\d{2})-(\d{3})/g)];
  const m = ds[ds.length - 1];
  return m ? `${m[1]}${m[2]}-${m[3]}` : '';
};

/** Hàm tra công trình trong danh sách: tên có mã CTxx-xxx thì khớp theo mã trước; khớp tên chuẩn (projectMatchKey,
 *  gồm bảng tên phụ của server) chỉ nhận khi 2 bên không mang 2 mã khác nhau — bảng tên phụ tự dựng qua HEX có lúc
 *  gộp nhầm 2 mã (vd. 1 dòng nhập kho của CT26-143 mang HEX của CT26-061). Tên không có mã vẫn khớp theo tên chuẩn. */
function taoTra<T>(ds: readonly T[], layTen: (x: T) => string): (ten: unknown) => T | undefined {
  const theoMa = new Map<string, T>();
  const theoKhoa = new Map<string, { x: T; ma: string }>();
  for (const x of ds) {
    const ma = maTrongTen(layTen(x));
    if (ma && !theoMa.has(ma)) theoMa.set(ma, x);
    const k = projectMatchKey(layTen(x));
    if (!theoKhoa.has(k)) theoKhoa.set(k, { x, ma });
  }
  return (ten: unknown) => {
    const ma = maTrongTen(ten);
    const theoM = ma ? theoMa.get(ma) : undefined;
    if (theoM !== undefined) return theoM;
    const t = theoKhoa.get(projectMatchKey(ten));
    return t && (!ma || !t.ma || t.ma === ma) ? t.x : undefined;
  };
}

/** Ghép danh sách công trình (thứ tự = vị trí) với thứ tự đã lưu: mỗi công trình 1 dòng, khớp theo mã / tên chuẩn
 *  (taoTra); công trình chưa có dòng lưu thì STT = dòng trên + 1 (dòng đầu = 1), luồng đỏ. */
export function ghepThuTu(danhSach: string[], daLuu: ThuTuCongTrinh[]): ThuTuCongTrinh[] {
  const tra = taoTra(daLuu, t => t.ten);
  let truoc = 0;
  return danhSach.map(ten => {
    const t = tra(ten);
    truoc = t && laSttHopLe(t.stt) ? t.stt : truoc + 1;
    return { ten, stt: truoc, luong: t?.luong === 'vang' ? 'vang' : 'do' };
  });
}

/** Đánh lại STT 1..n theo vị trí, giữ luồng. */
export const danhLaiStt = (ds: ThuTuCongTrinh[]): ThuTuCongTrinh[] => ds.map((t, i) => ({ ...t, stt: i + 1 }));

/** Tạo hàm tra thuTuNhom(tenCongTrinh) → { stt, luong, viTri } | null (null = ngoài danh sách nhóm).
 *  Khớp theo mã CTxx-xxx khi có, rồi theo tên chuẩn (projectMatchKey) như bộ lọc nhóm ở trang Công trình (taoTra). */
export function taoThuTuNhom(danhSach: string[], daLuu: ThuTuCongTrinh[]): (tenCongTrinh: unknown) => ThuTuTra | null {
  const ds = ghepThuTu(danhSach, daLuu).map((t, viTri) => ({ ten: t.ten, tra: { stt: t.stt, luong: t.luong, viTri } }));
  const tra = taoTra(ds, x => x.ten);
  return (tenCongTrinh: unknown) => tra(tenCongTrinh)?.tra ?? null;
}

/** Xếp: công trình trong danh sách lên trước theo STT, trùng STT thì theo vị trí trong danh sách;
 *  công trình ngoài danh sách giữ thứ tự cũ, nằm sau. Không đổi mảng gốc. */
export function sapXepTheoThuTu<T>(
  items: readonly T[],
  layTen: (item: T) => unknown,
  thuTuNhom: (tenCongTrinh: unknown) => ThuTuTra | null,
): T[] {
  const kem = items.map((item, i) => ({ item, i, t: thuTuNhom(layTen(item)) }));
  kem.sort((a, b) => {
    if (a.t && b.t) return a.t.stt - b.t.stt || a.t.viTri - b.t.viTri || a.i - b.i;
    if (a.t) return -1;
    if (b.t) return 1;
    return a.i - b.i;
  });
  return kem.map(x => x.item);
}

/** So 2 công trình theo thứ tự nhóm (dùng trong hàm sắp xếp có sẵn): trong danh sách lên trước theo STT rồi vị trí;
 *  cả 2 ngoài danh sách => 0 để hàm sắp xếp cũ quyết định. */
export function soSanhThuTu(a: ThuTuTra | null, b: ThuTuTra | null): number {
  if (a && b) return a.stt - b.stt || a.viTri - b.viTri;
  if (a) return -1;
  if (b) return 1;
  return 0;
}

/** STT hiện ở bảng (danh sách đã xếp): công trình trong luồng = STT người dùng (cho trùng, cho thiếu số);
 *  ngoài luồng đánh tiếp sau STT lớn nhất đã gặp. Không có công trình nào trong luồng => 1..n như cũ. */
export function sttHienThi(ds: readonly (ThuTuTra | null)[]): number[] {
  let lonNhat = 0;
  return ds.map(t => {
    if (t) { lonNhat = Math.max(lonNhat, t.stt); return t.stt; }
    lonNhat += 1;
    return lonNhat;
  });
}

/** Màu theo luồng (Tailwind): nền dòng nhạt, nền khi rê chuột đậm hơn 1 bậc, ô STT nhấn đậm. Ngoài luồng => null (giữ màu cũ). */
export const MAU_LUONG: Record<Luong, { nen: string; hover: string; stt: string; nhan: string }> = {
  do: { nen: 'bg-red-100', hover: 'hover:bg-red-200', stt: 'bg-red-200 font-bold text-red-800', nhan: 'Luồng đỏ' },
  vang: { nen: 'bg-yellow-100', hover: 'hover:bg-yellow-200', stt: 'bg-yellow-200 font-bold text-yellow-900', nhan: 'Luồng vàng' },
};
export const mauLuong = (t: ThuTuTra | null | undefined) => (t ? MAU_LUONG[t.luong] : null);
