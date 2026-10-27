import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { taoBoCau } from './taoBoCau';
import { chamCau } from './chamDiem';
import { HOM_NAY, TEN_CT, MA_CT, KHACH_HANG, PM_DH, PM_SX, PC_SX, NGUOI_TK } from './giaTri';
import type { BangDM, TuDien } from '../truyVanApi';
import dmMau from '../danhMuc.mau.json';
import tdMau from '../tuDien.mau.json';

// Ghi câu ví dụ từ bộ câu (chỉ câu gốc bộ đọc câu đã đọc đúng) — chạy khi đặt GHI_VI_DU=1:
//   frontend/components/HoiDap/boCau/viDu.ts   câu gần giống để gợi ý khi chưa hiểu câu
//   backend/src/server/hoiDapViDu.ts            câu → truy vấn, đưa vào lời dặn AI làm ví dụ
// Bỏ câu có tên người / khách hàng / công trình: không đưa tên riêng cho AI, không gợi ý tên cho người không có quyền.
const dm = dmMau as unknown as BangDM[];
const td = tdMau as unknown as TuDien;
const TEN_RIENG = [...TEN_CT, ...MA_CT, ...KHACH_HANG, ...PM_DH, ...PM_SX, ...PC_SX, ...NGUOI_TK].map(x => String(x).toLowerCase());
const coTenRieng = (cau: string) => { const q = cau.toLowerCase(); return TEN_RIENG.some(t => t.length >= 3 && q.includes(t)); };
const MOI_MAU = 3;
const COT_TEN = new Set(['ten_pm', 'ten_pc', 'khach_hang', 'handler', 'created_by', 'nguoi_yeu_cau', 'nguoi_tao', 'nguoi_trien_khai', 'nha_cung_cap', 'ten_cong_trinh', 'ma_cong_trinh']);
const motDong = (a: unknown[]) => `[\n${a.map(x => ` ${JSON.stringify(x)}`).join(',\n')},\n]`;

describe.skipIf(!process.env.GHI_VI_DU)('ghi câu ví dụ', () => {
  it('ghi viDu.ts + hoiDapViDu.ts', () => {
    const goiY: string[] = [];
    const choAI: Array<{ cau: string; tv: unknown }> = [];
    const daLay = new Map<string, number>();
    taoBoCau().forEach(c => {
      if (c.bienThe !== 'goc' || c.truoc || coTenRieng(c.cau) || c.kv.loai === 'lenh') return; // lệnh "xuất báo cáo" không phải câu gợi ý số liệu
      const n = daLay.get(c.mau) ?? 0;
      if (n >= MOI_MAU) return;
      const kq = chamCau(c, dm, td);
      if (kq.ketQua !== 'dung') return;
      daLay.set(c.mau, n + 1);
      goiY.push(c.cau);
      // Câu tự tra: truy vấn đã đọc đúng => ví dụ cho AI (bỏ kỳ mặc định — câu không nói kỳ thì AI bỏ tu, den)
      if (c.kv.loai === 'tu_tra' && kq.tv && !kq.tv.loc.some(l => COT_TEN.has(l.cot.replace(/^sx:/, '')))) {
        const tv = { ...kq.tv };
        if (c.kv.ky === undefined || c.kv.ky === null) { delete tv.tu; delete tv.den; }
        choAI.push({ cau: c.cau, tv });
      }
    });
    const dau = '// TỰ SINH từ bộ câu (boCau/ghiViDu.test.ts, GHI_VI_DU=1) — đừng sửa tay.\n';
    fs.writeFileSync(path.join(__dirname, 'viDu.ts'),
      `${dau}export const CAU_VI_DU: string[] = ${motDong(goiY)};\n`);
    fs.writeFileSync(path.join(__dirname, '../../../../backend/src/server/hoiDapViDu.ts'),
      `${dau}// Ngày trong ví dụ tính với hôm nay = ${HOM_NAY.getFullYear()}-10-19 (thứ hai).\nexport const VI_DU_AI: Array<{ cau: string; tv: Record<string, unknown> }> = ${motDong(choAI)};\n`);
    console.log(`VÍ DỤ: ${goiY.length} câu gợi ý · ${choAI.length} câu cho AI`);
    expect(choAI.length).toBeGreaterThan(50);
  });
});
