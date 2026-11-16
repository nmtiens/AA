import { z } from 'zod';

// ============================================================================
// VƯỚNG MẮC M6 TIỀN (category = 'money') — HÀM THUẦN (không đụng DB, test ở test/vuongMacTien.test.ts)
//
// Cột vuong_mac.chi_tiet (jsonb, SQL backend/sql/2026-11-16_vuong_mac_chi_tiet.sql) lưu chi tiết riêng của M6:
//   { loai: 'nhieu_gia' | 'gia_thap_gcvt' | 'vat_tu_vuot_gia', hexTrung?: string[], chiPhiGcvt?: number,
//     giaiTrinh?: string, ghiChu?: string }
//   nhieu_gia        Một HEX nhiều giá: xưởng nhìn hàng thật thấy vài mã HEX là cùng 1 sản phẩm mà giá khác nhau
//                    -> hexTrung (mã 9 số, không gồm HEX chính, không trùng) — BẮT BUỘC >= 1 mã
//   gia_thap_gcvt    Giá quá thấp so với quy mô, gia công vệ tinh vượt cost -> chiPhiGcvt (VNĐ, tuỳ chọn)
//                    + giaiTrinh (BẮT BUỘC)
//   vat_tu_vuot_gia  Tổng tiền vật tư của HEX > trị giá sản phẩm -> ghiChu tuỳ chọn
// Chỉ category = 'money' mới có chi tiết; loại khác luôn lưu NULL.
//
// ĐƠN VỊ TIỀN (đã đọc DB thật 16/11/2026):
//   production_status_app.don_gia_co_oh        = VNĐ          (vd 20.434.990)
//   production_status_app.tri_gia_don_hang_tong = TRIỆU ĐỒNG   (vd 449,56978 = 22 × 20.434.990 / 1e6)
//   vat_tu.thanh_tien                            = VNĐ          (vd 13.650.000 = 70 × 195.000)
// => API M6 trả MỌI số tiền bằng VNĐ: trị giá đơn hàng nhân TRIEU (trieuSangVnd).
// ============================================================================

export const LOAI_TIEN = ['nhieu_gia', 'gia_thap_gcvt', 'vat_tu_vuot_gia'] as const;
export type LoaiTien = typeof LOAI_TIEN[number];

export interface ChiTietTien {
  loai: LoaiTien;
  hexTrung?: string[];
  /** Chi phí GCVT báo giá — VNĐ */
  chiPhiGcvt?: number;
  giaiTrinh?: string;
  ghiChu?: string;
}

export const TRIEU = 1_000_000;
/** tri_gia_don_hang_tong (triệu đồng) -> VNĐ, làm tròn đồng. null / không phải số -> null */
export const trieuSangVnd = (v: unknown): number | null => {
  const n = soHuuHan(v);
  return n === null ? null : Math.round(n * TRIEU);
};
/** Số hữu hạn hoặc null (pg trả double precision là number, numeric là chuỗi) */
export const soHuuHan = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Số tiền VNĐ làm tròn đồng (null giữ null) */
export const lamTronVnd = (v: unknown): number | null => {
  const n = soHuuHan(v);
  return n === null ? null : Math.round(n);
};

// Zod cho body (POST / PUT vướng mắc). Kiểm sâu (theo loại, theo category) ở kiemChiTietTien.
export const chiTietTienSchema = z.object({
  loai: z.enum(LOAI_TIEN).optional().nullable(),
  hexTrung: z.array(z.string().max(40)).max(100).optional().nullable(),
  chiPhiGcvt: z.number().nonnegative().max(1e13).optional().nullable(),
  giaiTrinh: z.string().max(2000).optional().nullable(),
  ghiChu: z.string().max(2000).optional().nullable(),
});
export type ChiTietTienVao = z.infer<typeof chiTietTienSchema>;

/**
 * Chuẩn hoá 1 mã nhập / quét thành HEX 9 số: bỏ khoảng trắng; mã nhà máy 13 số -> bỏ 4 số đầu (như khớp vật tư).
 * Không phải 9 / 13 chữ số -> null.
 */
export const chuanHoaHex = (raw: unknown): string | null => {
  const s = String(raw ?? '').replace(/\s+/g, '');
  if (/^\d{9}$/.test(s)) return s;
  if (/^\d{13}$/.test(s)) return s.slice(4);
  return null;
};

const chuSach = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
};

export type KetQuaKiem = { ok: true; value: ChiTietTien | null } | { ok: false; message: string };

/**
 * Kiểm + chuẩn hoá chi tiết M6 trước khi lưu.
 * - category khác 'money' -> luôn null (bỏ qua chi tiết gửi kèm: đổi loại 6M thì xoá chi tiết tiền).
 * - money mà không có chiTiet / không có loai -> null (tương thích bản cũ chưa có chi tiết).
 * - nhieu_gia: hexTrung >= 1 mã hợp lệ (9 số; 13 số tự cắt), bỏ trùng, bỏ HEX chính.
 * - gia_thap_gcvt: giaiTrinh không rỗng.
 * Chỉ giữ trường thuộc loại đó (vd đổi loại thì hexTrung cũ không còn).
 */
export const kiemChiTietTien = (category: string, chiTiet: unknown, hexChinh: string): KetQuaKiem => {
  if (category !== 'money') return { ok: true, value: null };
  if (chiTiet === null || chiTiet === undefined) return { ok: true, value: null };
  const parsed = chiTietTienSchema.safeParse(chiTiet);
  if (!parsed.success) return { ok: false, message: 'Chi tiết M6 không hợp lệ' };
  const c = parsed.data;
  if (!c.loai) return { ok: true, value: null };

  const ghiChu = chuSach(c.ghiChu);
  if (c.loai === 'nhieu_gia') {
    const chinh = chuanHoaHex(hexChinh) ?? String(hexChinh ?? '').trim();
    const sai: string[] = [];
    const ds: string[] = [];
    for (const raw of c.hexTrung ?? []) {
      if (!String(raw ?? '').trim()) continue;
      const h = chuanHoaHex(raw);
      if (!h) { sai.push(String(raw).trim()); continue; }
      if (h !== chinh && !ds.includes(h)) ds.push(h);
    }
    if (sai.length) return { ok: false, message: `Mã HEX không hợp lệ (cần 9 số): ${sai.slice(0, 5).join(', ')}` };
    if (ds.length === 0) return { ok: false, message: 'Một HEX nhiều giá: nhập ít nhất 1 mã HEX khác cùng sản phẩm' };
    return { ok: true, value: { loai: 'nhieu_gia', hexTrung: ds, ...(ghiChu ? { ghiChu } : {}) } };
  }
  if (c.loai === 'gia_thap_gcvt') {
    const giaiTrinh = chuSach(c.giaiTrinh);
    if (!giaiTrinh) return { ok: false, message: 'Giá thấp, không GCVT được: vui lòng nhập giải trình' };
    const chiPhi = soHuuHan(c.chiPhiGcvt);
    return {
      ok: true,
      value: {
        loai: 'gia_thap_gcvt',
        ...(chiPhi !== null ? { chiPhiGcvt: Math.round(chiPhi) } : {}),
        giaiTrinh,
        ...(ghiChu ? { ghiChu } : {}),
      },
    };
  }
  return { ok: true, value: { loai: 'vat_tu_vuot_gia', ...(ghiChu ? { ghiChu } : {}) } };
};

/** Đọc cột chi_tiet từ DB (object hoặc chuỗi JSON) -> ChiTietTien | null. Chỉ category money. */
export const docChiTietTien = (category: unknown, raw: unknown): ChiTietTien | null => {
  if (category !== 'money' || raw === null || raw === undefined) return null;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!v || typeof v !== 'object' || !(LOAI_TIEN as readonly string[]).includes((v as ChiTietTien).loai)) return null;
    return v as ChiTietTien;
  } catch {
    return null;
  }
};

/** JSON với khoá object xếp theo tên (mảng giữ thứ tự) — không phụ thuộc thứ tự khoá */
const jsonKhoaSap = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(jsonKhoaSap).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter(k => o[k] !== undefined).sort()
      .map(k => `${JSON.stringify(k)}:${jsonKhoaSap(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
};

/**
 * So 2 chi tiết — để biết có cần ghi / ghi nhật ký không.
 * Không phụ thuộc thứ tự khoá: chi tiết cũ đọc từ cột jsonb (Postgres tự xếp lại khoá theo độ dài rồi theo byte,
 * vd {loai,ghiChu,giaiTrinh,chiPhiGcvt}) còn chi tiết mới dựng theo thứ tự của kiemChiTietTien.
 */
export const cungChiTiet = (a: ChiTietTien | null, b: ChiTietTien | null): boolean =>
  jsonKhoaSap(a ?? null) === jsonKhoaSap(b ?? null);

/** Số tiền VNĐ dạng 1.234.567 (không phụ thuộc ICU / locale của máy chủ) */
export const dinhDangVnd = (n: number): string => {
  const am = n < 0;
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return am ? `-${s}` : s;
};

const TEN_LOAI: Record<LoaiTien, string> = {
  nhieu_gia: 'Một HEX nhiều giá',
  gia_thap_gcvt: 'Giá thấp, không GCVT được',
  vat_tu_vuot_gia: 'Giá vật tư > giá sản phẩm',
};

/** 1 dòng mô tả chi tiết M6 cho nhật ký (vuong_mac_log.detail) */
export const moTaChiTietTien = (c: ChiTietTien | null): string => {
  if (!c) return 'không có';
  const phan: string[] = [TEN_LOAI[c.loai]];
  if (c.hexTrung?.length) phan.push(`HEX trùng: ${c.hexTrung.join(', ')}`);
  if (c.chiPhiGcvt !== undefined) phan.push(`chi phí GCVT ${dinhDangVnd(c.chiPhiGcvt)} đ`);
  if (c.giaiTrinh) phan.push(`giải trình: ${c.giaiTrinh}`);
  if (c.ghiChu) phan.push(`ghi chú: ${c.ghiChu}`);
  return phan.join(' · ');
};

export interface TomTatMucGia {
  soHex: number;
  /** Các mức đơn giá khác nhau (VNĐ), tăng dần */
  mucGia: number[];
  /** Mức cao nhất − thấp nhất (VNĐ); < 2 mức giá -> 0; không có giá nào -> null */
  chenh: number | null;
  /** HEX chưa có đơn giá trong dữ liệu */
  thieuGia: string[];
  /** "N HEX · K mức giá: a / b · chênh c" */
  text: string;
}

/** Tóm tắt mức giá của nhóm HEX cùng sản phẩm (HEX chính + hexTrung). Đơn giá VNĐ. */
export const tomTatMucGia = (ds: { hex: string; donGia: number | null }[]): TomTatMucGia => {
  const daGap = new Set<string>();
  const muc = new Set<number>();
  const thieuGia: string[] = [];
  for (const { hex, donGia } of ds) {
    if (daGap.has(hex)) continue;
    daGap.add(hex);
    const g = lamTronVnd(donGia);
    if (g === null) thieuGia.push(hex);
    else muc.add(g);
  }
  const mucGia = [...muc].sort((a, b) => a - b);
  const chenh = mucGia.length ? mucGia[mucGia.length - 1] - mucGia[0] : null;
  const phan = [`${daGap.size} HEX`, `${mucGia.length} mức giá${mucGia.length ? `: ${mucGia.map(dinhDangVnd).join(' / ')}` : ''}`];
  if (chenh !== null && mucGia.length > 1) phan.push(`chênh ${dinhDangVnd(chenh)}`);
  if (thieuGia.length) phan.push(`${thieuGia.length} HEX chưa có giá`);
  return { soHex: daGap.size, mucGia, chenh, thieuGia, text: phan.join(' · ') };
};

/** Chênh "chi phí GCVT báo giá − đơn giá sản phẩm" (VNĐ). Thiếu 1 trong 2 -> null. Dương = GCVT vượt giá. */
export const chenhGcvt = (chiPhiGcvt: number | null | undefined, donGia: number | null | undefined): number | null => {
  const a = soHuuHan(chiPhiGcvt), b = soHuuHan(donGia);
  return a === null || b === null ? null : Math.round(a - b);
};

/** Chênh "tổng vật tư − trị giá sản phẩm" (VNĐ). Thiếu 1 trong 2 -> null. Dương = vật tư vượt giá. */
export const chenhVatTu = (tongVatTu: number | null | undefined, triGia: number | null | undefined): number | null => {
  const a = soHuuHan(tongVatTu), b = soHuuHan(triGia);
  return a === null || b === null ? null : Math.round(a - b);
};

/** Tách ?hexes=a,b,c: bỏ khoảng trắng / rỗng / trùng (giữ thứ tự). Không đổi mã (khoá kết quả = mã gửi lên). */
export const tachDanhSachHex = (raw: unknown): string[] => {
  const parts = (Array.isArray(raw) ? raw.join(',') : String(raw ?? '')).split(/[,;\s]+/);
  const out: string[] = [];
  for (const p of parts) {
    const s = p.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
};

export interface DongSanPham {
  hex: string;
  ten_hang_muc: string | null;
  ten_cong_trinh: string | null;
  /** triệu đồng (đơn vị gốc DB) */
  tri_gia_don_hang_tong: unknown;
  tinh_trang: string | null;
}
export interface GoiYVatTu { hex: string; tenHangMuc: string | null; tenCongTrinh: string | null; triGia: number; tongVatTu: number; chenh: number }

export const laHuy = (tinhTrang: unknown) => String(tinhTrang ?? '').toUpperCase().includes('HỦY');

/**
 * Danh sách gợi ý "vật tư vượt giá": hạng mục không huỷ, có trị giá > 0, tổng vật tư (VNĐ) > trị giá (VNĐ).
 * Sắp chênh giảm dần, tối đa `toiDa` dòng. tongVatTuTheoHex: VNĐ; dòng sản phẩm: trị giá triệu đồng.
 */
export const locGoiYVatTu = (
  dongs: DongSanPham[],
  tongVatTuTheoHex: Record<string, number>,
  toiDa = 300,
  tenCt: (ten: string) => string = t => t,
): GoiYVatTu[] => {
  const out: GoiYVatTu[] = [];
  for (const d of dongs) {
    if (laHuy(d.tinh_trang)) continue;
    const triGia = trieuSangVnd(d.tri_gia_don_hang_tong);
    const tong = lamTronVnd(tongVatTuTheoHex[d.hex]);
    if (triGia === null || triGia <= 0 || tong === null || tong <= triGia) continue;
    out.push({
      hex: d.hex,
      tenHangMuc: d.ten_hang_muc ?? null,
      tenCongTrinh: d.ten_cong_trinh ? tenCt(d.ten_cong_trinh) : null,
      triGia,
      tongVatTu: tong,
      chenh: tong - triGia,
    });
  }
  out.sort((a, b) => b.chenh - a.chenh || a.hex.localeCompare(b.hex));
  return out.slice(0, toiDa);
};

/** co_gia_cong_ngoai ('Yes' / null) -> boolean */
export const coGiaCongNgoai = (v: unknown): boolean => /^(yes|y|có|co|x|true|1)$/i.test(String(v ?? '').trim());
