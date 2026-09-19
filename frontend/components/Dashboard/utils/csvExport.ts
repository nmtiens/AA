import { DataRow, ColumnDefinition} from '../../../types';
import { parseNumber } from './numberParsers';

export const rowsToCsvString = (rows: Record<string, any>[]): string => {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const headerLine = headers.map(escapeCell).join(',');
  const dataLines = rows.map(row => headers.map(h => escapeCell(row[h])).join(','));
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
};

// Map DataRow[] (dùng key nội bộ) -> đổi thành label cột hiển thị, đủ tất cả các cột
export const mapRowsToLabeledCsvRows = (data: DataRow[], columns: ColumnDefinition[]): Record<string, any>[] => {
  return data.map(row => {
    const newRow: Record<string, any> = {};
    columns.forEach(col => {
      newRow[col.label || col.key] = row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : '';
    });
    return newRow;
  });
};

export const computeSourceStats = (data: DataRow[], valueKey: string | undefined): { count: number; value: number } => {
  if (!data || data.length === 0) return { count: 0, value: 0 };
  const value = valueKey ? data.reduce((sum, row) => sum + parseNumber(row[valueKey]), 0) : 0;
  return { count: data.length, value };
};

/** Tải 1 chuỗi CSV (đã có BOM) về máy */
export const downloadCsvFile = (fileName: string, csv: string) => {
  const safeName = fileName.replace(/[\\/:*?"<>|\s]+/g, '_');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName.toLowerCase().endsWith('.csv') ? safeName : `${safeName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Xuất đúng các dòng/cột đang có trong popup chi tiết (/api/detail).
 * Dùng `columns` để giữ đúng thứ tự cột, vì rowsToCsvString lấy header từ Object.keys(rows[0]).
 * Header đặt giống popup: IN HOA, "_" -> khoảng trắng.
 */
export const exportDetailRowsToCsv = (
  fileName: string,
  columns: string[],
  rows: Record<string, any>[],
) => {
  if (!rows || rows.length === 0 || columns.length === 0) return;
  const labeledRows = rows.map(row => {
    const out: Record<string, any> = {};
    columns.forEach(col => {
      out[col.toUpperCase().replace(/_/g, ' ')] = row[col] ?? '';
    });
    return out;
  });
  downloadCsvFile(fileName, rowsToCsvString(labeledRows));
};