import { DataRow, ColumnDefinition} from '../../../types';
import { parseNumber } from './numberParsers';
export const rowsToCsvString = (rows: Record<string, any>[]): string => {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const headerLine = headers.map(escapeCell).join(';');
  const dataLines = rows.map(row => headers.map(h => escapeCell(row[h])).join(';'));
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