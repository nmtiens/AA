import { fmtQty } from '../../utils/format';

/** Ô bảng trả lời: cột số thì 0 để trống, tỷ lệ 0% hiện đỏ; cột chữ giữ nguyên */
export const oBang = (v: string | number, so: boolean): { chu: string; do: boolean } => {
  if (!so) return { chu: String(v), do: false };
  const s = typeof v === 'number' ? fmtQty(v) : v.trim();
  if (/^0+(\.0+)?\s*%$/.test(s)) return { chu: '0%', do: true };
  return { chu: /^0+(\.0+)?$/.test(s) ? '' : s, do: false };
};
