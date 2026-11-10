/** Dòng thống kê vướng mắc theo nhóm */
export interface DongNhom {
  name: string; open: number; doing: number; waiting: number; overdue: number; soon: number;
  created: number; done: number; closed: number; avgDoneHours: number | null;
}

/** Cắt n dòng đầu, phần còn lại cộng vào 1 dòng Khác để tổng bảng vẫn khớp */
export const gopKhac = (ds: DongNhom[], n: number): DongNhom[] => {
  if (ds.length <= n) return ds;
  const khac: DongNhom = { name: 'Khác', open: 0, doing: 0, waiting: 0, overdue: 0, soon: 0, created: 0, done: 0, closed: 0, avgDoneHours: null };
  for (const d of ds.slice(n)) {
    khac.open += d.open; khac.doing += d.doing; khac.waiting += d.waiting; khac.overdue += d.overdue; khac.soon += d.soon;
    khac.created += d.created; khac.done += d.done; khac.closed += d.closed;
  }
  return [...ds.slice(0, n), khac];
};
