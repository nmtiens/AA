import { MAU_CAU, BANG_DONG, type Dien, type KhoaDien, type KyVong } from './mauCau';
import { KY, CAP_KY, XUONG, TEN_CT, MA_CT, KHACH_HANG, PM_DH, PM_SX, PC_SX, NGUOI_TK, CONG_DOAN, NHOM_SP, NHOM_VT } from './giaTri';

// ============================================================================
// TẠO BỘ CÂU ~10.000 câu từ mẫu (mauCau.ts): điền giá trị thật + biến thể cách gõ (không dấu, viết hoa, thêm lời
// đệm, gõ sai 1 chữ). Ngẫu nhiên có hạt giống cố định => lần nào chạy cũng ra cùng 1 bộ (so điểm được giữa các lần).
// ============================================================================

export type BienThe = 'goc' | 'khong_dau' | 'hoa' | 'loi_dem' | 'go_sai';
export interface CauMau {
  id: string; mau: string; nhom: string; bienThe: BienThe; cau: string; kv: KyVong;
  /** Câu hỏi ngay trước (hiển thị); `chuoi` = mọi câu trước theo thứ tự khi hỏi nối tiếp nhiều lượt */
  truoc?: string; chuoi?: string[];
}

/** Ngẫu nhiên có hạt giống (mulberry32) */
const taoNgauNhien = (hat: number) => () => {
  hat |= 0; hat = (hat + 0x6d2b79f5) | 0;
  let t = Math.imul(hat ^ (hat >>> 15), 1 | hat);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const boDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const DEM_TRUOC = ['cho mình hỏi ', 'cho tui xem ', 'xem giúp ', 'ad ơi ', 'hỏi chút ', 'em muốn biết '];
const DEM_SAU = ['?', ' vậy', ' nhé', ' giúp mình', ' ạ', ''];

/** Gõ sai 1 chữ: bỏ 1 ký tự giữa của 1 từ dài ≥ 5 ký tự (không đụng mã / số) */
function goSai(cau: string, r: () => number): string | null {
  const tu = cau.split(' ');
  const chon = tu.map((w, i) => ({ w, i })).filter(x => x.w.length >= 5 && !/\d/.test(x.w));
  if (!chon.length) return null;
  const { w, i } = chon[Math.floor(r() * chon.length)];
  const k = 1 + Math.floor(r() * (w.length - 2));
  tu[i] = w.slice(0, k) + w.slice(k + 1);
  return tu.join(' ');
}

export function taoBoCau(soCauGoc = 3100, hat = 20261019): CauMau[] {
  const r = taoNgauNhien(hat);
  const chon = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const N = [1, 2, 3, 5, 6, 10];
  const dien = (): Dien => {
    const [ky, ky2] = r() < 0.5 ? chon(CAP_KY) : [chon(KY), chon(KY)];
    const x = chon(XUONG);
    const d = {
      ky, ky2, x, x2: chon(XUONG.filter(y => y !== x)), ct: chon(TEN_CT), ma: chon(MA_CT), kh: chon(KHACH_HANG), pm: chon(PM_DH),
      pmsx: chon(PM_SX), pcsx: chon(PC_SX), ntk: chon(NGUOI_TK), cd: chon(CONG_DOAN), nsp: chon(NHOM_SP), nvt: chon(NHOM_VT), n: chon(N), b: chon(BANG_DONG),
    };
    // Tên gọi của bảng chọn ngay sau bảng (giữ đúng thứ tự rút ngẫu nhiên cũ => bộ câu không đổi)
    return { ...d, bTen: chon(d.b.ten) };
  };
  const dienCau = (mau: string, d: Dien) => mau
    .replace(/\{(\w+)\}/g, (_, k: KhoaDien | string) => {
      switch (k) {
        case 'ky': return d.ky.noi; case 'ky2': return d.ky2.noi; case 'b': return d.bTen;
        case 'cd': return d.cd[0]; case 'nsp': return d.nsp[0]; case 'nvt': return d.nvt[0];
        default: return String((d as unknown as Record<string, unknown>)[k] ?? `{${k}}`);
      }
    })
    .replace(/\s+/g, ' ').trim();

  // Số câu gốc của mỗi mẫu: mẫu có chỗ điền chia đều phần lớn; mẫu cố định = số cách nói
  const coDien = MAU_CAU.filter(m => m.dung?.length);
  const moiMau = Math.max(4, Math.round((soCauGoc - MAU_CAU.filter(m => !m.dung?.length).reduce((a, m) => a + m.cau.length, 0)) / coDien.length));
  const goc: CauMau[] = [];
  const daCo = new Set<string>();
  MAU_CAU.forEach(m => {
    const lan = m.dung?.length ? moiMau : m.cau.length;
    for (let i = 0; i < lan * 3 && goc.filter(g => g.mau === m.id).length < lan; i++) {
      const d = dien();
      const mauChon = m.dung?.length ? chon(m.cau) : m.cau[i % m.cau.length];
      const cau = dienCau(mauChon, d);
      // Câu nối tiếp: các câu trước cùng giá trị (1 hoặc nhiều lượt)
      const chuoi = m.truoc ? (Array.isArray(m.truoc) ? m.truoc : [m.truoc]).map(t => dienCau(t, d)) : undefined;
      const truoc = chuoi?.join(' ⟶ ');
      const khoa = `${truoc ?? ''}|${cau}`;
      if (daCo.has(khoa)) continue;
      daCo.add(khoa);
      goc.push({ id: `${m.id}#${goc.length}`, mau: m.id, nhom: m.nhom, bienThe: 'goc', cau, truoc, ...(chuoi ? { chuoi } : {}), kv: m.kv(d, mauChon) });
    }
  });

  // Biến thể cách gõ
  const tatCa: CauMau[] = [...goc];
  goc.forEach(g => {
    const them = (bienThe: BienThe, cau: string | null) => {
      if (!cau || daCo.has(`${g.truoc ?? ''}|${cau}`)) return;
      daCo.add(`${g.truoc ?? ''}|${cau}`);
      tatCa.push({ ...g, id: `${g.id}~${bienThe}`, bienThe, cau });
    };
    them('khong_dau', boDau(g.cau).toLowerCase());
    them('hoa', g.cau.toUpperCase());
    them('loi_dem', `${chon(DEM_TRUOC)}${g.cau}${chon(DEM_SAU)}`);
    if (r() < 0.45) them('go_sai', goSai(g.cau, r));
  });
  return tatCa;
}
