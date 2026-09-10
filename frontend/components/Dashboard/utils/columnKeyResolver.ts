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

  // 1. Ưu tiên khớp chính xác (Exact match)
  let match = cols.find(c => {
    const k = normalizeString(c.key);
    const l = normalizeString(c.label);
    return k === normalizedTarget || l === normalizedTarget;
  });

  // 2. Substring match — CHỈ cho phép cột chứa TOÀN BỘ target,
  // không cho phép chiều ngược lại (target chứa key), vì điều đó khiến
  // các cột có tên ngắn (vd "trang_thai") bị khớp nhầm với target dài hơn
  // (vd "trang_thai_sap").
  if (!match) {
    const candidates = cols.filter(c => {
      const k = normalizeString(c.key);
      const l = normalizeString(c.label);
      return k.includes(normalizedTarget) || l.includes(normalizedTarget);
    });

    if (candidates.length > 0) {
      // Nếu có nhiều khớp, ưu tiên cột có tên ngắn nhất (gần đúng nhất)
      candidates.sort((a, b) => normalizeString(a.key).length - normalizeString(b.key).length);
      match = candidates[0];
    }
  }

  return match ? match.key : '';
};