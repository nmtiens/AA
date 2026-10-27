import { CAU_VI_DU } from './viDu';

// Câu ví dụ gần câu hỏi nhất (bộ câu mẫu đã chấm, viDu.ts tự sinh) — gợi ý "hỏi thử" khi bộ đọc câu chưa hiểu hết câu.
// Gần = nhiều chữ chung nhất (bỏ dấu), chia căn số chữ của ví dụ để câu dài không lấn; bỏ câu trùng với câu đã hỏi.

const boDau = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const tuCua = (s: string) => new Set(boDau(s).split(/[^a-z0-9]+/).filter(w => w.length >= 2));
const TU_VI_DU = CAU_VI_DU.map(cau => ({ cau, tu: tuCua(cau) }));

export function cauGanGiong(cau: string, soCau = 3, ds = TU_VI_DU): string[] {
  const q = tuCua(cau);
  const goc = boDau(cau).trim();
  return ds.map(x => {
    let chung = 0;
    x.tu.forEach(w => { if (q.has(w)) chung++; });
    return { cau: x.cau, diem: chung / Math.sqrt(x.tu.size || 1), chung };
  }).filter(x => x.chung >= 2 && boDau(x.cau) !== goc).sort((a, z) => z.diem - a.diem).slice(0, soCau).map(x => x.cau);
}
