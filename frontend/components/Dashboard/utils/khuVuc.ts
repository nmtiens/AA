// Thứ tự khu vực sản xuất (xưởng) dùng chung cho bảng / biểu đồ "theo khu vực": 2A, 3A, 4A, 5A, 8AB, 8C …
// (so số tự nhiên), nhóm không rõ (KHÁC / Chưa có / trống) xếp cuối. Người dùng 19/11/2026.
const CUOI = /^(KHÁC|KHAC|\(?CHƯA CÓ\)?|CHƯA XÁC ĐỊNH|KHÔNG RÕ|N\/A|-)?$/i;

export const soSanhKhuVuc = (a: string, b: string): number => {
  const x = String(a ?? '').trim(), y = String(b ?? '').trim();
  const cx = CUOI.test(x), cy = CUOI.test(y);
  if (cx !== cy) return cx ? 1 : -1;
  return x.localeCompare(y, 'vi', { numeric: true, sensitivity: 'base' });
};
