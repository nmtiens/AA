import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { taoBoCau } from './taoBoCau';
import { chamBoCau } from './chamDiem';
import type { BangDM, TuDien } from '../truyVanApi';
import dmMau from '../danhMuc.mau.json';
import tdMau from '../tuDien.mau.json';

// Chấm điểm bộ đọc câu trên ~10.000 câu mẫu. Ghi báo cáo chi tiết khi đặt BAO_CAO_BO_CAU=<đường dẫn file .md>.
const dm = dmMau as unknown as BangDM[];
const td = tdMau as unknown as TuDien;
const pt = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

describe('bộ câu hỏi mẫu', () => {
  const bo = taoBoCau();
  it('đủ ~10.000 câu, không trùng', () => {
    expect(bo.length).toBeGreaterThanOrEqual(9000);
    expect(new Set(bo.map(c => `${c.truoc ?? ''}|${c.cau}`)).size).toBe(bo.length);
  });
  it('chấm điểm', () => {
    const bc = chamBoCau(bo, dm, td);
    const dong = (k: string, v: { tong: number; dung: number; nhoAi: number }) =>
      `| ${k} | ${v.tong} | ${pt(v.dung, v.tong)}% | ${pt(v.nhoAi, v.tong)}% | ${pt(v.tong - v.dung - v.nhoAi, v.tong)}% |`;
    const md = [
      `# Chấm điểm bộ đọc câu — ${bc.tong} câu`,
      `Đúng **${pt(bc.dung, bc.tong)}%** · nhờ AI ${pt(bc.nhoAi, bc.tong)}% · hỏi lại ${pt(bc.hoiLai, bc.tong)}% (thừa ${bc.hoiThua} câu) · sai ${pt(bc.sai, bc.tong)}%`,
      '', '| Nhóm | Số câu | Đúng | Nhờ AI | Sai |', '|---|---|---|---|---|',
      ...Object.entries(bc.theoNhom).sort((a, b) => a[1].dung / a[1].tong - b[1].dung / b[1].tong).map(([k, v]) => dong(k, v)),
      '', '| Cách gõ | Số câu | Đúng | Nhờ AI | Sai |', '|---|---|---|---|---|',
      ...Object.entries(bc.theoBienThe).map(([k, v]) => dong(k, v)),
      '', '## Mẫu câu yếu nhất', '',
      ...Object.entries(bc.theoMau).filter(([, v]) => v.dung < v.tong).sort((a, b) => a[1].dung / a[1].tong - b[1].dung / b[1].tong)
        .flatMap(([k, v]) => [`### ${k} — đúng ${pt(v.dung, v.tong)}% (${v.tong} câu)`, ...v.viDuSai.map(x => `- ${x.truoc ? `[sau "${x.truoc}"] ` : ''}"${x.cau}" → ${x.lyDo}`), '']),
    ].join('\n');
    if (process.env.BAO_CAO_BO_CAU) fs.writeFileSync(process.env.BAO_CAO_BO_CAU, md);
    console.log(`BỘ CÂU: ${bc.tong} câu · đúng ${pt(bc.dung, bc.tong)}% · nhờ AI ${pt(bc.nhoAi, bc.tong)}% · hỏi lại ${pt(bc.hoiLai, bc.tong)}% (thừa ${bc.hoiThua}) · sai ${pt(bc.sai, bc.tong)}%`);
    expect(bc.tong).toBe(bo.length);
  });
});
