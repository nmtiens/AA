// Đếm hạng mục dạng cây × cột (bảng tab BOT): dòng gốc theo 1 chiều, mở ra các chiều còn lại. Hàm thuần.
export interface NutDem { ten: string; duong: string[]; cells: Record<string, number>; total: number; con: NutDem[] }
export interface CayDem { goc: NutDem[]; cols: string[]; colTot: Record<string, number>; tong: number }

/** cap(x): giá trị từng bậc, vd [công trình, sản phẩm, xưởng]; cot(x): khoá cột; sapXep nhận bậc (0 = gốc) */
export function tinhCayDem<T>(ds: T[], cap: (x: T) => string[], cot: (x: T) => string, sapXep: (a: NutDem, b: NutDem, bac: number) => number, giaTri: (x: T) => number = () => 1): CayDem {
  const goc: NutDem[] = [];
  const nut = new Map<string, NutDem>();
  const colTot: Record<string, number> = {};
  let tong = 0;
  for (const x of ds) {
    const c = cot(x), duong = cap(x), v = giaTri(x);
    colTot[c] = (colTot[c] ?? 0) + v;
    tong += v;
    let cha: NutDem | null = null;
    for (let i = 0; i < duong.length; i++) {
      const k = duong.slice(0, i + 1).join('\u0000');
      let n = nut.get(k);
      if (!n) {
        n = { ten: duong[i], duong: duong.slice(0, i + 1), cells: {}, total: 0, con: [] };
        nut.set(k, n);
        (cha ? cha.con : goc).push(n);
      }
      n.cells[c] = (n.cells[c] ?? 0) + v; n.total += v;
      cha = n;
    }
  }
  const sap = (a: NutDem[], bac: number) => { a.sort((x, y) => sapXep(x, y, bac)); a.forEach(n => sap(n.con, bac + 1)); };
  sap(goc, 0);
  return { goc, cols: Object.keys(colTot).sort(), colTot, tong };
}
