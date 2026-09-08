import {ColumnDefinition} from '../../../types';
export const normalizeString = (str: string) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, ""); // Dành cho việc tìm key/cột trong DB
};

 export const findColumnKey = (cols: ColumnDefinition[], target: string) => {
    if (!cols || cols.length === 0) return '';
    const normalizedTarget = normalizeString(target);

    // 1. Ưu tiên tìm khớp chính xác (Exact match) để tránh lỗi substring
    let match = cols.find(c => {
      const k = normalizeString(c.key);
      const l = normalizeString(c.label);
      return k === normalizedTarget || l === normalizedTarget;
    });

    // 2. Nếu không khớp chính xác, mới dùng phương án tìm chuỗi con (Substring match)
    if (!match) {
      match = cols.find(c => {
        const k = normalizeString(c.key);
        const l = normalizeString(c.label);
        return k.includes(normalizedTarget) || normalizedTarget.includes(k);
      });
    }

    return match ? match.key : '';
  };