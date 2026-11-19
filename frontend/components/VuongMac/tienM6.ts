import type { ChiTietTien, LoaiTien, TraGiaHex } from '../../services/vuongMacService';
import { fmtInt } from '../../utils/format';

// ============================================================================
// M6 TIỀN — hàm thuần dùng chung cho form báo, chi tiết, màn quản lý (có test: tienM6.test.ts)
// Mọi số tiền ở đây là VNĐ (API tra-gia / goi-y-vat-tu trả VNĐ; chi phí GCVT người dùng nhập VNĐ).
// ============================================================================

export const LOAI_TIEN_META: Record<LoaiTien, { icon: string; label: string; short: string; hint: string }> = {
  nhieu_gia: {
    icon: '🔀', label: 'Một sản phẩm nhiều mã HEX, giá khác nhau', short: 'Nhiều giá',
    hint: 'Nhìn hàng thật thấy vài mã HEX là cùng 1 sản phẩm mà đơn giá khác nhau',
  },
  gia_thap_gcvt: {
    icon: '🏭', label: 'Giá thấp so với sản phẩm', short: 'Giá thấp',
    hint: 'GCVT báo giá vượt giá sản phẩm, hoặc giá thấp so với quy mô sản phẩm',
  },
  vat_tu_vuot_gia: {
    icon: '🪵', label: 'Tiền vật tư cao hơn giá sản phẩm', short: 'Vật tư > giá',
    hint: 'Tổng tiền vật tư của hạng mục lớn hơn trị giá sản phẩm',
  },
};

/** 2 nguyên nhân của loại "Giá thấp" (người dùng 18/11/2026); bản cũ không có nguyenNhan = GCVT */
export const NGUYEN_NHAN_GIA_THAP: Record<'gcvt' | 'quy_mo', { label: string; short: string; hint: string; goiY: string }> = {
  gcvt: {
    label: 'GCVT báo giá vượt giá sản phẩm', short: 'GCVT', hint: 'Không gia công vệ tinh được vì chi phí GCVT cao hơn giá',
    goiY: 'Vì sao không gia công vệ tinh được: kích thước, khối lượng, đơn vị GCVT báo giá…',
  },
  quy_mo: {
    label: 'Giá thấp so với quy mô sản phẩm', short: 'quy mô', hint: 'Sản phẩm lớn / nhiều công nhưng đơn giá thấp',
    goiY: 'Vì sao giá thấp so với quy mô: kích thước, khối lượng, số công, vật liệu…',
  },
};
export const nguyenNhanGiaThap = (ct: Pick<ChiTietTien, 'nguyenNhan'> | null | undefined): 'gcvt' | 'quy_mo' => ct?.nguyenNhan ?? 'gcvt';
/** Tên ngắn của vấn đề tiền (danh sách / thẻ): "Giá thấp · GCVT" / "Giá thấp · quy mô" */
export const tenNganTien = (ct: ChiTietTien): string =>
  ct.loai === 'gia_thap_gcvt' ? `${LOAI_TIEN_META[ct.loai].short} · ${NGUYEN_NHAN_GIA_THAP[nguyenNhanGiaThap(ct)].short}` : LOAI_TIEN_META[ct.loai].short;
/** Tên đầy đủ: "Giá thấp so với sản phẩm: GCVT báo giá vượt giá sản phẩm" */
export const tenDayDuTien = (ct: ChiTietTien): string =>
  ct.loai === 'gia_thap_gcvt' ? `${LOAI_TIEN_META[ct.loai].label}: ${NGUYEN_NHAN_GIA_THAP[nguyenNhanGiaThap(ct)].label}` : LOAI_TIEN_META[ct.loai].label;

/** HEX hợp lệ: đúng 9 chữ số */
export const HEX_RE = /^\d{9}$/;

/** Mã nhà máy 13 số (tem / máy quét trả về) -> HEX 9 số: bỏ 4 số đầu — như chuanHoaHex ở máy chủ */
export const maVeHex = (t: string): string => (/^\d{13}$/.test(t) ? t.slice(4) : t);

/**
 * Tách nhiều mã HEX từ chuỗi gõ / dán (cách nhau dấu phẩy, chấm phẩy, khoảng trắng, xuống dòng).
 * - hop: mã 9 số (mã nhà máy 13 số tự bỏ 4 số đầu), không trùng, giữ thứ tự, bỏ mã nằm trong `boQua` (HEX chính, mã đã có)
 * - loi: phần không phải mã 9 số (để báo người dùng)
 */
export const tachHex = (chuoi: string, boQua: Iterable<string> = []): { hop: string[]; loi: string[] } => {
  const bo = new Set([...boQua].map(h => h.trim()));
  const hop: string[] = [];
  const loi: string[] = [];
  for (const raw of chuoi.split(/[\s,;|]+/)) {
    const t = maVeHex(raw.trim().replace(/^HEX[:\s-]*/i, ''));
    if (!t) continue;
    if (!HEX_RE.test(t)) { if (!loi.includes(t)) loi.push(t); continue; }
    if (bo.has(t) || hop.includes(t)) continue;
    hop.push(t);
  }
  return { hop, loi };
};

// ---------------- Định dạng tiền (VNĐ) ----------------
const so = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "12,500,000 đ" (theo cách ghi số toàn app); null => "—" */
export const fmtDong = (v: number | null | undefined): string => {
  const n = so(v);
  return n === null ? '—' : `${fmtInt(n)} đ`;
};

/** Gọn cho dòng tóm tắt: "1.25 tỷ" / "12.5 tr" / "850,000 đ" */
export const fmtDongGon = (v: number | null | undefined): string => {
  const n = so(v);
  if (n === null) return '—';
  const a = Math.abs(n);
  const gon = (x: number) => String(Math.round(x * 100) / 100);
  if (a >= 1e9) return `${gon(n / 1e9)} tỷ`;
  if (a >= 1e6) return `${gon(n / 1e6)} tr`;
  return `${fmtInt(n)} đ`;
};

/** Ô nhập tiền: "12500000" / "12,500,000" -> 12500000; rỗng / sai -> null */
export const docSoTien = (s: string): number | null => {
  const d = s.replace(/[^\d]/g, '');
  if (!d) return null;
  const n = Number(d);
  return Number.isSafeInteger(n) ? n : null;
};
/** Hiện lại số trong ô nhập có dấu nghìn khi đang gõ */
export const nhapSoTien = (s: string): string => {
  const n = docSoTien(s);
  return n === null ? '' : fmtInt(n);
};

// ---------------- Tóm tắt mức giá (Một HEX nhiều giá) ----------------
export interface TomTatGia {
  soHex: number;
  /** Các mức đơn giá khác nhau, tăng dần */
  mucGia: number[];
  /** HEX chưa tra được giá (không có trong dữ liệu / chưa có đơn giá) */
  chuaCoGia: string[];
  chenh: number | null;
  /** Chênh so với mức thấp nhất, % */
  chenhPt: number | null;
  /** "3 HEX · 2 mức giá: 1.2 tr / 1.5 tr · chênh 300,000 đ (25%)" */
  text: string;
}

export const tomTatMucGia = (hexes: string[], ketQua: Record<string, Pick<TraGiaHex, 'donGia'> | undefined>): TomTatGia => {
  const ds = [...new Set(hexes)];
  const chuaCoGia: string[] = [];
  const gia: number[] = [];
  for (const h of ds) {
    const g = so(ketQua[h]?.donGia);
    if (g === null) chuaCoGia.push(h); else gia.push(g);
  }
  const mucGia = [...new Set(gia)].sort((a, b) => a - b);
  const chenh = mucGia.length >= 2 ? mucGia[mucGia.length - 1] - mucGia[0] : mucGia.length === 1 ? 0 : null;
  const chenhPt = chenh !== null && mucGia.length >= 2 && mucGia[0] > 0 ? Math.round((chenh / mucGia[0]) * 1000) / 10 : null;
  const parts = [`${ds.length} HEX`];
  if (mucGia.length === 0) parts.push('chưa có đơn giá');
  else {
    parts.push(`${mucGia.length} mức giá: ${mucGia.map(fmtDongGon).join(' / ')}`);
    if (mucGia.length >= 2) parts.push(`chênh ${fmtDong(chenh)}${chenhPt !== null ? ` (${chenhPt}%)` : ''}`);
    else if (gia.length >= 2) parts.push('cùng giá');
  }
  if (chuaCoGia.length) parts.push(`${chuaCoGia.length} mã chưa có giá`);
  return { soHex: ds.length, mucGia, chuaCoGia, chenh, chenhPt, text: parts.join(' · ') };
};

/** Hiệu a − b khi cả 2 có số */
export const hieu = (a: number | null | undefined, b: number | null | undefined): number | null => {
  const x = so(a); const y = so(b);
  return x === null || y === null ? null : x - y;
};

/** "Có" / "Không" / chữ máy chủ trả / "—" */
export const fmtGiaCongNgoai = (v: boolean | string | null | undefined): string => {
  if (v === true) return 'Có';
  if (v === false) return 'Không';
  const t = String(v ?? '').trim();
  return t || '—';
};

// ---------------- Kiểm tra trước khi gửi ----------------
/** Lý do chưa gửi được (chữ báo dưới nút Gửi); null = đủ. Khớp kiểm tra của máy chủ */
/** Các HEX trùng thật sự gửi lên: bỏ trùng, bỏ HEX chính (máy chủ cũng bỏ HEX chính) */
export const hexTrungThat = (hexTrung: string[] | undefined, hexChinh?: string): string[] =>
  [...new Set(hexTrung ?? [])].filter(h => h !== hexChinh);

export const thieuTruongTien = (ct: Partial<ChiTietTien> | null | undefined, hexChinh?: string): string | null => {
  if (!ct?.loai) return null; // M6 chưa chọn loại vẫn lưu được (tương thích bản cũ) — form tự bắt chọn khi báo mới
  if (ct.loai === 'nhieu_gia' && !hexTrungThat(ct.hexTrung, hexChinh).length) return 'Thêm ít nhất 1 mã HEX khác cùng sản phẩm';
  if (ct.loai === 'gia_thap_gcvt' && !ct.giaiTrinh?.trim()) return 'Nhập giải trình';
  return null;
};

/** Gói chi tiết gửi lên: bỏ trường rỗng / không thuộc loại */
export const chuanHoaChiTiet = (ct: Partial<ChiTietTien>, hexChinh?: string): ChiTietTien | null => {
  if (!ct.loai) return null;
  const out: ChiTietTien = { loai: ct.loai };
  const trung = ct.loai === 'nhieu_gia' ? hexTrungThat(ct.hexTrung, hexChinh) : [];
  if (trung.length) out.hexTrung = trung;
  // Ảnh sản phẩm chung của nhóm mã
  if (ct.loai === 'nhieu_gia' && ct.anhSp) out.anhSp = ct.anhSp;
  if (ct.loai === 'gia_thap_gcvt') {
    const nn = nguyenNhanGiaThap(ct);
    if (nn === 'quy_mo') out.nguyenNhan = nn; // không có trường = GCVT (như máy chủ)
    if (nn === 'gcvt' && typeof ct.chiPhiGcvt === 'number' && Number.isFinite(ct.chiPhiGcvt)) out.chiPhiGcvt = ct.chiPhiGcvt;
    if (ct.giaiTrinh?.trim()) out.giaiTrinh = ct.giaiTrinh.trim();
  }
  if (ct.ghiChu?.trim()) out.ghiChu = ct.ghiChu.trim();
  return out;
};

/** Nội dung tự soạn khi người báo để trống ô nội dung (M6 đã chọn loại) */
export const noiDungTuDong = (hex: string, ct: ChiTietTien, kq: Record<string, TraGiaHex | undefined> = {}): string => {
  const meta = LOAI_TIEN_META[ct.loai];
  const g = kq[hex];
  if (ct.loai === 'nhieu_gia') {
    const tt = tomTatMucGia([hex, ...(ct.hexTrung ?? [])], kq);
    return `${meta.label}: HEX ${[hex, ...(ct.hexTrung ?? [])].join(', ')} · ${tt.text}`;
  }
  if (ct.loai === 'gia_thap_gcvt') {
    const phan = [g ? `đơn giá ${fmtDong(g.donGia)}` : `HEX ${hex}`];
    if (nguyenNhanGiaThap(ct) === 'gcvt' && ct.chiPhiGcvt != null) phan.push(`chi phí GCVT báo giá ${fmtDong(ct.chiPhiGcvt)}`);
    return `${tenDayDuTien(ct)}: ${phan.join(', ')}. ${ct.giaiTrinh ?? ''}`.trim();
  }
  // Vật tư > giá: chỉ ghi "chênh" khi có đủ 2 số; không có quyền xem / chưa có số thì không khẳng định
  if (!g) return `${meta.label}: HEX ${hex}`;
  if (g.tongVatTu == null) {
    const lyDo = g.coGiaVatTu === false ? 'không có quyền xem, admin kiểm' : 'chưa có trong dữ liệu vật tư';
    return `${meta.label}: trị giá sản phẩm ${fmtDong(g.triGia)}; tổng tiền vật tư ${lyDo}`;
  }
  const chenh = hieu(g.tongVatTu, g.triGia);
  return `${meta.label}: tổng vật tư ${fmtDong(g.tongVatTu)}, trị giá sản phẩm ${fmtDong(g.triGia)}${chenh !== null ? `, chênh ${chenh > 0 ? '+' : ''}${fmtDong(chenh)}` : ''}`;
};
