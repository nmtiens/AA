import { MetricType } from '../types';

export const parseNumber = (valStr: string | number | null | undefined): number => {
  if (valStr === null || valStr === undefined) return 0;
  if (typeof valStr === 'number') return Number.isNaN(valStr) ? 0 : valStr;

  let s = String(valStr).trim();
  if (!s) return 0;

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
    // Nếu có nhiều dấu chấm (1.000.000) hoặc dấu chấm duy nhất cách đuôi 3 số (123.456) -> Phân cách hàng ngàn chuẩn VN
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/\./g, '');
    }
    // Ngược lại giữ nguyên làm dấu thập phân (VD: 12.5 hoặc 12.50)
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

export function formatNumber(value: number, metric?: MetricType): string {
  if (metric === 'COUNT_HEX') return value.toLocaleString('en-US');
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' Tỷ';
  if (value >= 1_000_000) return (value / 1).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '';
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}