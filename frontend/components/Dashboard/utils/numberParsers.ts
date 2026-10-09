import { MetricType } from '../types';
import { formatTrieuAsTy } from '../../../utils/money';

export const parseNumber = (valStr: string | number | null | undefined): number => {
  if (valStr === null || valStr === undefined) return 0;
  if (typeof valStr === 'number') return Number.isNaN(valStr) ? 0 : valStr;

  let s = String(valStr).trim();
  if (!s) return 0;
  // Dạng khoa học (vd "8e-06" — số double rất nhỏ ghi thành chuỗi): đọc thẳng, nếu không phần lọc ký tự
  // bên dưới sẽ bỏ "e-" và hiểu nhầm thành 806
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(s)) return Number(s);

  // Lấy dấu âm/dương đầu tiên nếu có
  const isNegative = s.startsWith('-');
  
  // Loại bỏ tất cả ký tự ngoại trừ chữ số, dấu phẩy và dấu chấm
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  // 1. Trường hợp có cả dấu phẩy và dấu chấm (VD: 1,000.50 hoặc 1.000,50)
  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) {
      // Chuẩn EN: 1,000.50 -> Xóa phẩy
      s = s.replace(/,/g, '');
    } else {
      // Chuẩn VN/EU: 1.000,50 -> Xóa chấm, đổi phẩy thành chấm
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } 
  // 2. Chỉ có dấu phẩy (VD: 1,000,000 hoặc 12,5)
  else if (lastComma > -1) {
    const parts = s.split(',');
    // Nếu phần sau dấu phẩy có đúng 3 chữ số và có nhiều hơn 1 dấu phẩy -> Phân cách hàng ngàn
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  } 
  // 3. Chỉ có dấu chấm (VD: 1.000.000 chuẩn VN hoặc 12.5 chuẩn EN)
  else if (lastDot > -1) {
    const parts = s.split('.');
    // Nhiều dấu chấm (1.000.000) -> phân cách hàng ngàn chuẩn VN. MỘT dấu chấm luôn là thập phân (12.5,
    // 1.027): dữ liệu DB ghi số thập phân kiểu EN — trước coi "1.027" (3 số sau dấu chấm) là 1027 => cột
    // text như thanh_tien_ke_hoach bị nhân 1000
    if (parts.length > 2) {
      s = s.replace(/\./g, '');
    }
  }

  const result = Number.parseFloat(s);
  if (Number.isNaN(result)) return 0;

  return isNegative ? -result : result;
};

// Hàm Định dạng số thập phân (Lấy 1 chữ số thập phân)
export const formatDecimal = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
};

// Hàm Định dạng số nguyên
export const formatInteger = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value));
};

// Chỉ số tiền (SUM_GT_*) có giá trị gốc là triệu đồng -> hiển thị Tỷ, 2 chữ số thập phân.
// Không truyền metric / COUNT_HEX -> định dạng số đếm.
export function formatNumber(value: number, metric?: MetricType): string {
  if (metric === 'SUM_GT_CON_LAI' || metric === 'SUM_GT_DON_HANG') return formatTrieuAsTy(value);
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

// Hàm dành riêng cho 2 view "Luồng đỏ" và "Căn mẫu" — làm tròn 3 chữ số thập phân
export const formatDecimalFull = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
};

// Hiển thị đủ số thập phân để số khác 0 không bị làm tròn về "0",
// nhưng vẫn gọn cho số bình thường (không thêm số 0 thừa ở đuôi).
export const formatSmartDecimal = (value: number, maxDecimals = 6): string => {
  if (!Number.isFinite(value)) return '0';
  if (value === 0) return '0';

  for (let decimals = 1; decimals <= maxDecimals; decimals++) {
    const rounded = value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
    if (Number.parseFloat(rounded.replace(/,/g, '')) !== 0) {
      return rounded;
    }
  }
  // Giá trị cực nhỏ (< 1e-6): vẫn hiển thị full precision thay vì "0"
  return value.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
};