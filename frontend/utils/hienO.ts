// Hiện ô của bảng dữ liệu thô (DataGrid): ngày dd/mm/yyyy, cột số lượng / tiền có phân cách hàng nghìn
const la2 = (n: number) => String(n).padStart(2, '0');
/** Cột giá trị / số lượng / tiền: hiện phân cách hàng nghìn. Cột mã dạng số (HEX, số PR / PO, mã SAP, năm…) giữ nguyên chữ số */
export const laCotSoLuongTien = (key: string, label = ''): boolean =>
  /(^|_)(so_luong|sl|thanh_tien|gia_tri|tri_gia|don_gia|gia_von|ton_kho)(_|$)/.test(key.toLowerCase()) ||
  /SỐ LƯỢNG|THÀNH TIỀN|GIÁ TRỊ|TRỊ GIÁ|ĐƠN GIÁ|^SL /.test(label.toLocaleUpperCase('vi'));
/** Ngày từ DB ('YYYY-MM-DD' / ISO có giờ) => dd/mm/yyyy (kèm giờ:phút khi có giờ khác 00:00); không phải ngày => null */
export const hienNgay = (v: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(v.trim());
  if (!m) return null;
  if (m[6]) { // có múi giờ: đổi sang giờ máy (VN)
    const d = new Date(v.trim());
    if (Number.isNaN(d.getTime())) return null;
    const ngay = `${la2(d.getDate())}/${la2(d.getMonth() + 1)}/${d.getFullYear()}`;
    return d.getHours() || d.getMinutes() ? `${ngay} ${la2(d.getHours())}:${la2(d.getMinutes())}` : ngay;
  }
  const ngay = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] && (m[4] !== '00' || m[5] !== '00') ? `${ngay} ${m[4]}:${m[5]}` : ngay;
};
/** Số (cả số lưu dạng chữ "2927.0") */
export const SO_CHU = /^-?\d+(\.\d+)?$/;
