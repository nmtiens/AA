// Lưu bảng vào IndexedDB theo CỘT: mỗi cột 1 danh sách giá trị khác nhau + mảng chỉ số. Mảng dòng (54 nghìn object × 33 cột)
// đọc lại phải dựng từng object trong structured clone, khoá màn hình 0,6–1 giây (đo 25/11/2026); mảng chỉ số là khối nhớ
// phẳng nên gần như tức thì, dựng dòng bằng vòng lặp thường nhanh hơn nhiều. Chuỗi trùng nhau dùng chung 1 bản.
import type { DataRow } from '../types';

export interface BangCot {
  kieu: 'cot1';
  n: number;
  ten: string[];
  gt: unknown[][];
  cs: (Uint16Array | Uint32Array)[];
}

/** Mảng dòng -> dạng cột; null = không nén được (dòng khác bộ cột / thứ tự cột, ô là object): lưu nguyên như cũ */
export const nenBang = (rows: readonly DataRow[]): BangCot | null => {
  const n = rows.length;
  if (n === 0) return null;
  const ten = Object.keys(rows[0]);
  const m = ten.length;
  if (m === 0) return null;
  for (let i = 1; i < n; i++) {
    let k = 0;
    for (const c in rows[i]) { if (c !== ten[k]) return null; k++; }
    if (k !== m) return null;
  }
  const gt: unknown[][] = [];
  const cs: (Uint16Array | Uint32Array)[] = [];
  for (const c of ten) {
    const tra = new Map<unknown, number>();
    const ds: unknown[] = [];
    const so = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const v: unknown = rows[i][c];
      if (v !== null && typeof v === 'object') return null;
      let j = tra.get(v);
      if (j === undefined) { j = ds.length; ds.push(v); tra.set(v, j); }
      so[i] = j;
    }
    gt.push(ds);
    cs.push(ds.length <= 65536 ? Uint16Array.from(so) : so);
  }
  return { kieu: 'cot1', n, ten, gt, cs };
};

export const laBangCot = (x: unknown): x is BangCot => !!x && (x as { kieu?: unknown }).kieu === 'cot1';

// Chép object mẫu đủ cột rồi điền từng cột: vòng trong luôn cùng 1 tên cột, cùng hình dạng object => máy ảo chạy nhanh
const dienKhuc = (b: BangCot, mau: Record<string, unknown>, ra: DataRow[], tu: number, den: number): void => {
  for (let i = tu; i < den; i++) ra[i] = { ...mau } as DataRow;
  for (let k = 0; k < b.ten.length; k++) {
    const c = b.ten[k], gt = b.gt[k], cs = b.cs[k];
    for (let i = tu; i < den; i++) (ra[i] as Record<string, unknown>)[c] = gt[cs[i]];
  }
};
const mauDong = (b: BangCot): Record<string, unknown> => {
  const o: Record<string, unknown> = {};
  b.ten.forEach((c, k) => { o[c] = b.gt[k][b.cs[k][0]]; });
  return o;
};
const nhuong = () => new Promise<void>(xong => { const k = new MessageChannel(); k.port1.onmessage = () => { k.port1.close(); xong(); }; k.port2.postMessage(0); });

/** Dạng cột -> mảng dòng y như lúc lưu; làm từng khúc, nhường luồng chính giữa các khúc để màn hình không đứng */
export const giaiBangCot = async (b: BangCot, khuc = 2000): Promise<DataRow[]> => {
  const ra = new Array<DataRow>(b.n);
  const mau = mauDong(b);
  let luc = performance.now();
  for (let i = 0; i < b.n; i += khuc) {
    dienKhuc(b, mau, ra, i, Math.min(b.n, i + khuc));
    if (performance.now() - luc > 12) { await nhuong(); luc = performance.now(); }
  }
  return ra;
};
