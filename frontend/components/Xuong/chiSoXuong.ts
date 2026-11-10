// Công thức chỉ số Xưởng dùng chung cho thẻ, bảng, biểu đồ, Excel, Hỏi đáp.
import type { SoSanhTram } from '../../services/xuongSetupApi';
import { fmtInt, fmtTy } from '../../utils/format';
import { trong0 } from '../shared/bangBaoCao';

interface NgayTo { gioNguoi: number; gioCong: number }

/** Giờ, số lẻ tối đa 1 chữ số: 1,234.5 */
export const so = (n: number, le = 1) => n.toLocaleString('en-US', { maximumFractionDigits: le });
/** Ô số trong bảng: 0 để trống */
export const oSo = (n: number, le = 1) => trong0(n, v => so(v, le));
/** Tiền gốc triệu đồng: từ 1 tỷ ghi tỷ, dưới 1 tỷ ghi triệu */
export const tienXuong = (trieu: number) => (Math.abs(trieu) >= 1000 ? `${fmtTy(trieu)} tỷ` : `${fmtInt(trieu)} tr`);

/** Tỷ lệ (%), 1 số lẻ, hiện bằng fmtPt; mẫu số 0 thì null */
export const tyLe = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** Tỷ lệ có việc (%): chỉ tính ngày-tổ có giờ công. Ngày MRA không điểm danh có giờ công SP mà không có giờ công nên bỏ */
export const tyLeCoViec = (ds: NgayTo[]): number | null => {
  const co = ds.filter(n => n.gioNguoi > 0);
  return tyLe(co.reduce((a, n) => a + n.gioCong, 0), co.reduce((a, n) => a + n.gioNguoi, 0));
};

export const cong = <T>(ds: T[], lay: (x: T) => number) => ds.reduce((a, x) => a + lay(x), 0);

/** Bảng chỉ hiện n dòng đầu: phần bị cắt cộng vào dòng Khác để TỔNG vẫn bằng số ở tiêu đề */
export const catKhac = <T>(ds: T[], n: number, lay: (x: T) => number) => ({
  hien: ds.slice(0, n), soKhac: Math.max(0, ds.length - n), khac: cong(ds.slice(n), lay), tong: cong(ds, lay),
});

/** Giờ chờ theo lý do: phần lẻ bị bỏ khỏi danh sách vào dòng khac để cộng lại đúng tổng */
export const duLyDoCho = (ds: Array<[string, number]>, tong: number): Array<[string, number]> => {
  const con = tong - cong(ds, x => x[1]);
  return con >= 0.05 ? [...ds, ['khac', con]] : ds;
};

const NGUONG_GIO = 0.5, NGUONG_PT = 10; // cùng ngưỡng backend/src/server/xuong/soKhopTram.ts
const lam = (n: number) => Math.round(n * 100) / 100;

/** Cộng dòng so khớp trạm, chênh lớn tính lại trên tổng */
export const congSoSanh = (ds: SoSanhTram[]): SoSanhTram => {
  const chinhThuc = cong(ds, x => x.chinhThuc), tram = cong(ds, x => x.tram);
  const chenh = tram - chinhThuc;
  const phanTram = chinhThuc > 0 ? Math.round((chenh / chinhThuc) * 100) : null;
  const lon = Math.abs(chenh) >= NGUONG_GIO && (phanTram === null || Math.abs(phanTram) >= NGUONG_PT);
  return { chinhThuc: lam(chinhThuc), tram: lam(tram), chenh: lam(chenh), phanTram, lon };
};
