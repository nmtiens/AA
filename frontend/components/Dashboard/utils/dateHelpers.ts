import { DataRow } from '../../../types';
export const parseVNDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (str.includes('T') || str.match(/^\d{4}-\d{2}-\d{2}/)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
  const parts = str.split(/[\/\-\.]/);
  if (parts.length >= 3) {
    let year = parseInt(parts[2], 10);
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      return new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    // Xử lý thông minh năm 2 số (vd: 26 sẽ tự cộng thành 2026)
    if (year < 100) year += 2000;
    return new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return null;
};

export const toISODateLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const formatDateToVN = (dateInput: any): string => {
  if (!dateInput) return '';
  const d = parseVNDate(String(dateInput));
  if (!d) return String(dateInput).trim();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const diffDays = (date1: Date, date2: Date): number => {
  const d1 = new Date(date1); d1.setHours(0, 0, 0, 0);
  const d2 = new Date(date2); d2.setHours(0, 0, 0, 0);
  const diffTime = d1.getTime() - d2.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const getDateRangeDisplay = (filters: string[], options: string[]) => {
  const datesToUse = filters.length > 0 ? filters : options;
  if (datesToUse.length === 0) return '';
  const validDates = datesToUse.map(d => parseVNDate(d)).filter((d): d is Date => d !== null);
  if (validDates.length === 0) return '';
  const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
  const fmt = (d: Date) => `0${d.getDate()}`.slice(-2) + '/' + `0${d.getMonth() + 1}`.slice(-2) + '/' + d.getFullYear();
  if (minDate.getTime() === maxDate.getTime()) return `(${fmt(minDate)})`;
  return `(${fmt(minDate)} - ${fmt(maxDate)})`;
};

export const getWeekNumber = (d: Date = new Date()): number => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
};

export const computeMtdRows = (
  data: DataRow[],
  dateKey: string | undefined,
  targetDate: Date | null
): DataRow[] => {
  if (!targetDate || !dateKey) return data;
  const tMonth = targetDate.getMonth();
  const tYear = targetDate.getFullYear();
  return data.filter(row => {
    const d = parseVNDate(String(row[dateKey] || ''));
    return d && d.getMonth() === tMonth && d.getFullYear() === tYear && d.getTime() <= targetDate.getTime();
  });
};

export const getYesterdayDateOption = (options: string[]): string | null => {
  if (options.length === 0) return null;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dd = String(yesterday.getDate()).padStart(2, '0');
  const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
  const yyyy = yesterday.getFullYear();
  const yesterdayStrSlash = `${dd}/${mm}/${yyyy}`;
  const yesterdayStrDash = `${dd}-${mm}-${yyyy}`;
  const targetDate = options.find(opt => opt === yesterdayStrSlash || opt === yesterdayStrDash);
  return targetDate || options[0];
};