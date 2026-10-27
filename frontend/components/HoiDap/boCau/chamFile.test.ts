import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { chamCau } from './chamDiem';
import type { CauMau } from './taoBoCau';
import type { BangDM, TuDien } from '../truyVanApi';
import dmMau from '../danhMuc.mau.json';
import tdMau from '../tuDien.mau.json';

// ============================================================================
// CHẤM CÂU HỎI NGOÀI BỘ — câu do "người dùng giả" viết (rà soát), không sinh từ mẫu.
//   File JSON = mảng { id, nhom, cau, truoc?, chuoi?, kv } (cùng dạng CauMau, bienThe mặc định 'goc').
//   Mặc định chấm mọi file trong boCau/raSoat/ (bộ hồi quy cố định); CHAM_FILE=<file .json | thư mục> để chấm chỗ khác.
//   Ghi <file>.ketqua.md cạnh file vào: từng câu sai / khác kèm lý do + truy vấn đọc được.
// ============================================================================
const dm = dmMau as unknown as BangDM[];
const td = tdMau as unknown as TuDien;
const RA_SOAT = path.join(__dirname, 'raSoat');

type CauFile = Omit<CauMau, 'bienThe' | 'mau'> & { mau?: string; bienThe?: CauMau['bienThe'] };

const danhSachFile = (nguon: string): string[] => {
  if (!fs.existsSync(nguon)) return [];
  if (!fs.statSync(nguon).isDirectory()) return [nguon];
  return fs.readdirSync(nguon).filter(f => f.endsWith('.json')).sort().map(f => path.join(nguon, f));
};

describe('chấm câu hỏi ngoài bộ (raSoat)', () => {
  const files = danhSachFile(process.env.CHAM_FILE ?? RA_SOAT);
  it.skipIf(!files.length)('mọi file đọc được và được chấm', () => {
    let tong = 0, dung = 0, hoiLai = 0;
    const tomTat: string[] = [];
    for (const f of files) {
      const ds = JSON.parse(fs.readFileSync(f, 'utf8')) as CauFile[];
      const kq = ds.map(c => ({ c, r: chamCau({ bienThe: 'goc', mau: c.id, ...c } as CauMau, dm, td) }));
      const sai = kq.filter(x => x.r.ketQua !== 'dung');
      const nHoiLai = kq.filter(x => x.r.ketQua === 'hoi_lai').length;
      tong += ds.length; dung += ds.length - sai.length; hoiLai += nHoiLai;
      const md = [
        `# ${path.basename(f)} — ${ds.length} câu · đúng ${ds.length - sai.length} · hỏi lại ${nHoiLai} · sai/nhờ AI ${sai.length - nHoiLai}`, '',
        ...sai.map(x => `- [${x.c.id}] ${x.c.chuoi?.length || x.c.truoc ? `[sau "${(x.c.chuoi ?? [x.c.truoc]).join(' ⟶ ')}"] ` : ''}"${x.c.cau}" → ${x.r.ketQua}: ${x.r.lyDo} (đường: ${x.r.duong})${x.r.tv ? `\n  đọc được: ${JSON.stringify(x.r.tv)}` : ''}\n  mong đợi: ${JSON.stringify(x.c.kv)}`),
      ];
      fs.writeFileSync(f.replace(/\.json$/, '.ketqua.md'), md.join('\n'));
      tomTat.push(`${path.basename(f)}: ${ds.length} câu · đúng ${ds.length - sai.length} · hỏi lại ${nHoiLai} · sai/nhờ AI ${sai.length - nHoiLai}`);
    }
    tomTat.forEach(t => console.log(`CHẤM ${t}`));
    console.log(`CHẤM TỔNG: ${tong} câu · đúng ${dung} (${tong ? Math.round((dung / tong) * 1000) / 10 : 0}%) · hỏi lại ${hoiLai}`);
    expect(tong).toBeGreaterThan(0);
    // Ngưỡng (nếu đặt): CHAM_NGUONG=97 => tổng phải ≥ 97%
    if (process.env.CHAM_NGUONG) expect((dung / tong) * 100).toBeGreaterThanOrEqual(Number(process.env.CHAM_NGUONG));
  });
});
