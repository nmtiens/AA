import type { Request, Response } from 'express';
import { createHash, randomInt } from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { timedQuery, withTransaction } from '../db.js';
import { app } from '../server/app.js';
import { JWT_SECRET_SAFE } from '../server/config.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { sendToUsers } from '../vuongMacPush.js';
import {
  chuanHoaSuyTuTen, chuanHoaThuocTinh, docIdAnh, laThuocTinhNcc, docMaVatTu, docPhienBan, laUrlAnhHopLe, mimeAnhAnToan, QUYEN_SUA, SO_ANH_TOI_DA, SQL_CONG_KHAI,
} from './banVatTu.js';

// ============================================================================
// TRANG NGƯỜI MUA (CÔNG KHAI, KHÔNG CẦN ĐĂNG NHẬP) — vật tư tồn kho admin đã duyệt đăng. Giao diện: /#/cua-hang.
//   GET  /api/cong-khai/vat-tu      danh sách mã đang chào bán (chỉ trường được phép ra ngoài)
//   GET  /api/cong-khai/anh/:id     bytes 1 ảnh đã bật "hiện cho khách"
//   POST /api/cong-khai/yeu-cau     khách gửi yêu cầu báo giá (tên, SĐT, các mã + số lượng)
//
// - Xác thực: middleware chung (server/app.ts) bắt đăng nhập MỌI /api/* trừ PUBLIC_API_PATHS / PUBLIC_API_PREFIXES.
//   Tiền tố '/api/cong-khai/' khai báo trong PUBLIC_API_PREFIXES ở server/app.ts (cùng chỗ: bỏ nạp bảng tên công trình /
//   setup gộp xưởng cho tiền tố này + parser JSON 20 KB riêng) — chỉ các route dưới đây dùng tiền tố đó; middleware so khớp chữ thường + routing phân biệt hoa thường => /API/CONG-KHAI/…
//   lọt qua đăng nhập nhưng không khớp route nào (404). Không route nào ở đây đọc req.user.
// - CHỈ mã: ban_vt_thong_tin.dang_cong_khai = true AND trang_thai = 'dang_ban' AND có trong lần chốt tồn mới nhất. Mã
//   chưa bật không lộ ra dưới bất kỳ hình thức nào (danh sách, ảnh 404 như "không có", gửi yêu cầu báo "không còn chào
//   bán" như mã không tồn tại, không có số đếm tổng).
// - TUYỆT ĐỐI KHÔNG trả: giá vốn / giá trị tồn / đơn giá vốn / giá bình quân, NCC (kể cả MP37 / MP18 / thương hiệu suy
//   từ NCC), lý lịch mua, công trình đang gán, tên kho cụ thể (chỉ "loại" = 10 loại chính, ngoài ra 'Khác'), ngày nhập /
//   tuổi tồn / chậm luân chuyển, ghi chú nội bộ, người cập nhật, liên hệ nội bộ, ảnh chưa bật, nguồn file, mã HEX. Item
//   dựng bằng danh sách trắng (dungItemCongKhai) — test liệt kê trường cấm. Tên vật tư SAP hay mang mã / tên công trình
//   ('... CT24-017', 'THẺ TREO_ARTICLE_A1'): khi admin chưa đặt tên hiển thị, tên + thuộc tính được che mẫu (CT|PO)NN-NNN
//   và tên / mã công trình đang gán (cheCongTrinh).
// - Rate limit theo IP (app có 'trust proxy' 1 => req.ip là IP khách thật sau proxy Vercel); gửi yêu cầu còn đếm trong
//   DB theo ip_hash (IPv6 gộp dải /56) trong 1 giao dịch giữ khoá theo IP (gửi dồn song song không lọt): ≤ 5 / giờ,
//   ≤ 50 / ngày mỗi IP. Thông báo cho admin có trần chung toàn hệ thống mỗi giờ (nhiều IP không làm ngập thông báo).
// - Chưa chạy SQL (backend/sql/2026-11-15_ban_vat_tu_cong_khai.sql) => danh sách rỗng, ảnh 404, gửi yêu cầu 503.
// ============================================================================

const TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// KIỂU DỮ LIỆU (đúng hợp đồng với frontend/services/cuaHangApi.ts)
// ---------------------------------------------------------------------------
export interface ThuocTinhCongKhai {
  chungLoai?: string;
  quyCach?: string;
  mau?: string;
  maMau?: string;
  thuongHieu?: string;
  chatLieu?: string;
  xuatXu?: string;
}

/** 1 dòng thuộc tính đầy đủ cho cửa sổ chi tiết: nhãn tiếng Việt dễ đọc + giá trị (đã che công trình) */
export interface DongThuocTinh {
  nhan: string;
  giaTri: string;
}

export interface ItemCongKhai {
  /** mã SAP — mã tham chiếu cho khách */
  ma: string;
  ten: string;
  /** 1 trong 10 loại chính (DS_LOAI_CHINH) hoặc 'Khác' — không lộ tên kho cụ thể */
  loai: string;
  thuocTinh: ThuocTinhCongKhai;
  /** mọi thuộc tính được công khai (trường gộp + MPxx trong danh sách trắng), không trùng ý, theo thứ tự MPxx */
  thuocTinhDayDu: DongThuocTinh[];
  /** tên nhóm vật tư SAP dễ đọc ('Đá', 'Vải') */
  nhomVatTu: string | null;
  soLuong: number;
  /** đơn vị tính dễ đọc ('cái', 'm²', 'ft²'…) */
  dvt: string | null;
  /** đồng / 1 đvt; null => "Liên hệ" */
  giaBanVnd: number | null;
  moTa: string | null;
  /** id ảnh nội bộ đã bật hiện cho khách => GET /api/cong-khai/anh/:id */
  anh: number[];
  /** link ảnh admin dán (chỉ http(s)) */
  anhNgoai: string[];
  /** ngày đăng gần nhất 'YYYY-MM-DD' (giờ VN) — sắp xếp "mới đăng" */
  dangLuc: string | null;
}

export interface DanhSachCongKhai {
  /** ngày chốt tồn kho 'YYYY-MM-DD' */
  capNhat: string | null;
  items: ItemCongKhai[];
}

/** Đúng các khoá được phép của 1 item (test so khớp tuyệt đối) */
export const KHOA_ITEM_CONG_KHAI = ['ma', 'ten', 'loai', 'thuocTinh', 'thuocTinhDayDu', 'nhomVatTu', 'soLuong', 'dvt', 'giaBanVnd', 'moTa', 'anh', 'anhNgoai', 'dangLuc'] as const;

// ---------------------------------------------------------------------------
// HÀM THUẦN (test: backend/test/banVatTuCongKhai.test.ts)
// ---------------------------------------------------------------------------
const chuoiGon = (v: unknown): string | null => {
  if (v === null || v === undefined || typeof v === 'object') return null;
  const s = String(v).trim();
  return s ? s : null;
};
const so = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const boDau = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();

/** 10 loại chính = 10 kho vật tư (cùng danh sách + quy tắc với frontend/components/BanVatTu/xuLy.ts tenKhoGon) */
export const DS_LOAI_CHINH = [
  'KVT Vải Da Mouss', 'KVT Gỗ', 'KVT Tấm-Ván', 'KVT phụ kiện', 'KVT Đá', 'KVT Hóa chất', 'Kho G.Công Ngoài',
  'KVT Bao Bì', 'KVT Kim Loại', 'KVT CCDC',
] as const;
export const LOAI_KHAC = 'Khác';
const TEN_KHO_RIENG: Record<string, string> = {
  'vai,da,sf': 'KVT Vải Da Mouss',
  'go': 'KVT Gỗ',
  'tam – van': 'KVT Tấm-Ván',
  'tam - van': 'KVT Tấm-Ván',
  'tam-van': 'KVT Tấm-Ván',
  'phu kien': 'KVT phụ kiện',
  'da': 'KVT Đá',
  'hoa chat': 'KVT Hóa chất',
  'gc ngoai': 'Kho G.Công Ngoài',
  'bao bi': 'KVT Bao Bì',
  'kim loai': 'KVT Kim Loại',
  'ccdc': 'KVT CCDC',
};
/** Tên kho SAP => 1 trong 10 loại chính; kho lạ / trống => 'Khác' (không lộ tên kho cụ thể) */
export const loaiTuKho = (kho: unknown): string => {
  const s = String(kho ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return LOAI_KHAC;
  if ((DS_LOAI_CHINH as readonly string[]).includes(s)) return s;
  const bo = s.replace(/^(kho\s+vt|kvt|kho)\s+/i, '').trim() || s;
  return TEN_KHO_RIENG[boDau(bo).replace(/\s*,\s*/g, ',')] ?? LOAI_KHAC;
};

/** Đơn vị tính SAP => chữ dễ đọc (cùng bảng với frontend xuLy.ts tenDvt; mã lạ => chữ thường) */
const TEN_DVT: Record<string, string> = {
  PCS: 'cái', EA: 'cái', M: 'm', TAM: 'tấm', SET: 'bộ', KG: 'kg', G: 'g', M2: 'm²', M3: 'm³', CD3: 'dm³', L: 'lít',
  FT2: 'ft²', YRD: 'yard', YD: 'yard', CUO: 'cuộn', ROL: 'cuộn', VI: 'vỉ', THA: 'thanh', HOP: 'hộp', CAP: 'cặp',
  BIN: 'bình', CHA: 'chai', BIC: 'bịch', XAP: 'xấp', CAY: 'cây', SOI: 'sợi', TUY: 'tuýp', GOI: 'gói', TEP: 'tép',
  THU: 'thùng', BO: 'bộ', CAI: 'cái', CHI: 'chiếc', DOI: 'đôi', LON: 'lon', BAO: 'bao', KIT: 'bộ',
};
export const tenDvt = (dvt: unknown): string | null => {
  const s = chuoiGon(dvt);
  if (!s) return null;
  return TEN_DVT[s.toUpperCase()] ?? s.toLowerCase();
};

/** Cột master => khoá thuộc tính công khai. Thiếu ở master thì lấy suy_tu_ten (không gắn chữ "suy từ tên"). */
const COT_THUOC_TINH: Array<[keyof ThuocTinhCongKhai, string | null]> = [
  ['chungLoai', 'm_chung_loai'], ['quyCach', 'm_quy_cach'], ['mau', 'm_mau'], ['maMau', null],
  ['thuongHieu', 'm_thuong_hieu'], ['chatLieu', 'm_chat_lieu'], ['xuatXu', 'm_xuat_xu'],
];
// Thương hiệu suy từ NCC (master.thuongHieuNcc ở trang admin) KHÔNG dùng ở đây: tên hãng lấy từ NCC là lộ NCC.

/**
 * Trường gộp (thuocTinh) => nhãn + vị trí MPxx tương ứng (để xếp chung thứ tự với MPxx) + các MPxx nó đã bao
 * (master: chung_loai = MP01, thuong_hieu = MP12, mau = MP15, ma_mau = MP16, quy_cach gộp MP20–MP24, xuat_xu = MP26,
 * chat_lieu = MP35 — scripts/nap_ban_vat_tu.py). Có trường gộp thì MPxx bao bởi nó không lặp lại.
 */
const TRUONG_GOP: Array<[keyof ThuocTinhCongKhai, string, number, number[]]> = [
  ['chungLoai', 'Chủng loại', 1, [1]],
  ['thuongHieu', 'Thương hiệu', 12, [12]],
  ['mau', 'Màu sắc', 15, [15]],
  ['maMau', 'Mã màu', 16, [16]],
  ['quyCach', 'Quy cách', 20, [20, 21, 22, 23, 24]],
  ['xuatXu', 'Xuất xứ', 26, [26]],
  ['chatLieu', 'Chất liệu', 35, [35]],
];

/**
 * DANH SÁCH TRẮNG thuộc tính MPxx được ra trang khách => nhãn tiếng Việt. Mã không có ở đây KHÔNG BAO GIỜ ra ngoài:
 * MP00 (nhóm — dùng riêng nhomVatTu), MP18 (mã SP NCC), MP36 (đvt — đã có dvt), MP37 (NCC), MP38 / MP39 (leadtime),
 * MP99 (chú thích nội bộ), mã mới chưa xét.
 */
export const NHAN_MP_CONG_KHAI: Record<string, string> = {
  MP01: 'Chủng loại', MP02: 'Tên gỗ', MP03: 'Tên tấm / ván', MP04: 'Loại 1 mặt / 2 mặt', MP05: 'Tên vải / da / mây',
  MP06: 'Tên đá / kính', MP07: 'Tên phụ kiện', MP08: 'Tên kim loại', MP09: 'Tên keo', MP10: 'Tên hóa chất',
  MP12: 'Thương hiệu', MP13: 'Bộ sưu tập', MP14: 'Vật liệu dán bề mặt', MP15: 'Màu sắc', MP16: 'Mã màu',
  MP17: 'Mã họa tiết', MP19: 'Tiêu chuẩn chất lượng', MP20: 'Quy cách phách', MP21: 'Quy cách dày', MP22: 'Quy cách rộng',
  MP23: 'Quy cách dài', MP24: 'Quy cách đường kính', MP25: 'Trọng lượng', MP26: 'Xuất xứ', MP27: 'Hình dạng',
  MP28: 'Xẻ gỗ', MP29: 'Độ ẩm / ướt', MP30: 'Chống cháy / chậm cháy', MP31: 'Đặc tính đặc thù', MP32: 'Biến tính',
  MP33: 'Ghép gỗ', MP34: 'Phương pháp gia công', MP35: 'Chất liệu',
};

/**
 * Quy cách master nhập lệch cột: tấm 1220 × 2440 ghi vào MP21 (DÀY) / MP22 (RỘNG) => quy_cach 'Dày 1220 × Rộng 2440'.
 * Chỉ sửa khi CHẮC: đúng 2 phần Dày × Rộng (không Dài / Phách / ĐK), dày ≥ 600 (mm — không tấm nào dày 60 cm) và
 * rộng ≥ dày => 'Rộng 1220 × Dài 2440'. Còn lại giữ nguyên. (Gốc nên sửa ở master / nap_ban_vat_tu.py.)
 */
export const suaQuyCachDayRong = (qc: string): string => {
  const m = /^\s*Dày\s+(\d+(?:[.,]\d+)?)\s*×\s*Rộng\s+(\d+(?:[.,]\d+)?)\s*$/u.exec(qc);
  if (!m) return qc;
  const day = Number(m[1].replace(',', '.'));
  const rong = Number(m[2].replace(',', '.'));
  return day >= 600 && rong >= day ? `Rộng ${m[1]} × Dài ${m[2]}` : qc;
};

/** Giá trị rác của MD (ô '-', 'N/A', '(blank)', '0') => bỏ */
const laGiaTriRac = (s: string): boolean => /^(?:[-–.\s]+|n\s*\/?\s*a|\(?blank\)?|none|null|0+(?:[.,]0+)?)$/i.test(s.trim());

/** So trùng ý: bỏ dấu, chữ thường, bỏ khoảng trắng / dấu nối */
const khoaSo = (s: string): string => boDau(s).replace(/[\s_\-–/.,]+/g, '');

/**
 * Thuộc tính đầy đủ cho cửa sổ chi tiết: trường gộp (thuocTinh, đã che) + MPxx trong NHAN_MP_CONG_KHAI, xếp theo số MP.
 * Bỏ: MPxx ngoài danh sách trắng / có dạng NCC (laThuocTinhNcc), MPxx đã bao bởi trường gộp có giá trị, giá trị rác,
 * giá trị trùng 1 dòng đã có (vd Tên vải = Mã màu), giá trị hết chữ sau khi che mã / tên công trình.
 */
export const dungThuocTinhDayDu = (
  thuocTinh: ThuocTinhCongKhai, thuocTinhMp: unknown, che: (v: string | null) => string | null,
): DongThuocTinh[] => {
  const dong: Array<{ viTri: number; nhan: string; giaTri: string }> = [];
  const daBao = new Set<number>();
  const daCo = new Set<string>();
  for (const [khoa, nhan, viTri, bao] of TRUONG_GOP) {
    const gt = thuocTinh[khoa];
    if (!gt || laGiaTriRac(gt)) continue;
    for (const so of bao) daBao.add(so);
    daCo.add(khoaSo(gt));
    dong.push({ viTri, nhan, giaTri: gt });
  }
  const mp = chuanHoaThuocTinh(thuocTinhMp);
  const cacMa = Object.keys(mp)
    .map(k => ({ k, so: /^\s*MP(\d{2})(?!\d)/i.exec(k)?.[1] }))
    .filter((x): x is { k: string; so: string } => x.so !== undefined)
    .sort((a, b) => Number(a.so) - Number(b.so) || a.k.localeCompare(b.k));
  for (const { k, so: soMp } of cacMa) {
    const nhan = NHAN_MP_CONG_KHAI[`MP${soMp}`];
    const viTri = Number(soMp);
    if (!nhan || laThuocTinhNcc(k) || daBao.has(viTri)) continue;
    const tho = mp[k];
    if (laGiaTriRac(tho)) continue;
    const gt = che(tho);
    if (!gt || laGiaTriRac(gt)) continue;
    const ks = khoaSo(gt);
    if (!ks || daCo.has(ks)) continue;
    daCo.add(ks);
    dong.push({ viTri, nhan, giaTri: gt });
  }
  // sort ổn định: trường gộp trước MPxx cùng vị trí
  return dong.sort((a, b) => a.viTri - b.viTri).map(({ nhan, giaTri }) => ({ nhan, giaTri }));
};

/** Tên nhóm SAP dễ đọc: ten_nhom_sap; thiếu thì từ MP00 '111 -Đá' => 'Đá'. Chỉ còn mã số => null. */
export const tenNhomVatTu = (tenNhomSap: unknown, thuocTinhMp: unknown): string | null => {
  const ten = chuoiGon(tenNhomSap);
  if (ten && !/^\d+$/.test(ten)) return ten;
  const mp = chuanHoaThuocTinh(thuocTinhMp);
  const k = Object.keys(mp).find(x => /^\s*MP00(?!\d)/i.test(x));
  const t = k ? mp[k].replace(/^\s*\d+\s*[-–:]?\s*/, '').trim() : '';
  return t && !laGiaTriRac(t) ? t : null;
};

// --- Che mã / tên công trình trong chữ ra trang khách -------------------------------------------------------------
/** Mã công trình / PO dạng CT24-017, PO26-001 (cả 'CT 24-017', 'ct24 - 0170') đứng riêng, không dính chữ / số khác */
const MAU_MA_CONG_TRINH = /(?<![\p{L}\p{N}])(?:CT|PO)\s*\d{2}\s*[-–]\s*\d{3,4}(?![\p{N}])/giu;
/** Ký tự đánh dấu chỗ đã che (vùng dùng riêng Unicode — không có trong tên thật) */
const DAU_CHE = '\uE000';
/** Chuỗi dấu nối quanh chỗ che: khoảng trắng, _, -, –, /, ',', ';', ':', '|' và dấu che */
const MAU_QUANH_CHE = /[\s_\-–/,;:|\uE000]*\uE000[\s_\-–/,;:|\uE000]*/gu;
const MAU_DAU_NOI_HAI_DAU = /^[\s_\-–/,;:|]+|[\s_\-–/,;:|]+$/gu;
const thoatRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tên / mã công trình đang gán => các cụm cần che. Bỏ 'DÙNG CHUNG' (không phải công trình) nhưng giữ phần sau nó
 * ('DÙNG CHUNG\nARHAUS' => 'ARHAUS'); phần trong ngoặc mô tả vật liệu ('DUNG CHUNG (GỖ TRÒN XẺ SẤY)') và cụm < 3 ký tự bỏ.
 * Cụm dài trước ('ARTICLE A1' che trước 'ARTICLE').
 */
export const cumCongTrinh = (ds: Iterable<unknown>): string[] => {
  const kq = new Set<string>();
  for (const v of ds) {
    const s = chuoiGon(v);
    if (!s) continue;
    for (const phan of s.split(/[\r\n+,;]+/)) {
      let p = phan.replace(/\s+/g, ' ').trim();
      if (/^dung chung(\s|$)/.test(boDau(p))) p = p.split(' ').slice(2).join(' ').trim();
      if (!p || p.startsWith('(') || p.length < 3) continue;
      kq.add(p);
    }
  }
  return [...kq].sort((a, b) => b.length - a.length);
};

/**
 * Che mã công trình (mẫu (CT|PO)NN-NNN) + các cụm tên / mã công trình (không phân biệt hoa thường, đứng riêng — không
 * cắt giữa từ) khỏi 1 chuỗi ra trang khách, rồi dọn dấu nối thừa:
 * 'THẺ TREO_ARTICLE_A1' (ARTICLE) => 'THẺ TREO_A1'; 'BAN 40X40 CT24-017' => 'BAN 40X40'. Hết chữ => ''.
 */
export const cheCongTrinh = (s: string, cum: readonly string[] = []): string => {
  let t = s.replace(MAU_MA_CONG_TRINH, DAU_CHE);
  for (const c of cum) {
    const mau = new RegExp(`(?<![\\p{L}\\p{N}])${thoatRegex(c).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
    t = t.replace(mau, DAU_CHE);
  }
  if (!t.includes(DAU_CHE)) return s.trim();
  t = t.replace(MAU_QUANH_CHE, (khop: string, viTri: number, toanBo: string) => {
    if (viTri === 0 || viTri + khop.length === toanBo.length) return '';
    if (/\s/.test(khop)) return ' ';
    return khop.replace(/\uE000/g, '')[0] ?? ' ';
  });
  return t.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/\s+/g, ' ').replace(MAU_DAU_NOI_HAI_DAU, '').trim();
};

/** Dữ liệu phụ theo mã (đọc bằng truy vấn riêng để bảng / cột chưa tạo không làm hỏng danh sách) */
export interface PhuCongKhai {
  suyTuTen?: unknown;
  /** id ảnh đã lọc: cong_khai, chưa ẩn, đúng thứ tự hiển thị */
  anh?: number[];
}

/**
 * Các dòng tồn (nhiều kho) của 1 mã => 1 item công khai, CHỈ trường trong danh sách trắng. Số lượng = tổng các kho;
 * loại theo kho có số lượng lớn nhất; tên: tên hiển thị admin đặt → tên tồn → tên master → chủng loại → 'Vật tư <mã>'.
 * Tên tồn / master và mọi thuộc tính đã che mã + tên công trình (cheCongTrinh): rows mang ten_cong_trinh /
 * ma_cong_trinh chỉ để che.
 * Tổng số lượng ≤ 0 => null (không chào bán).
 */
export const dungItemCongKhai = (rows: Array<Record<string, unknown>>, phu: PhuCongKhai = {}): ItemCongKhai | null => {
  if (!rows.length) return null;
  const r0 = rows[0];
  const ma = String(r0.ma ?? '');
  const soLuong = Math.round(rows.reduce((t, r) => t + so(r.so_luong), 0) * 1e6) / 1e6;
  if (!ma || !(soLuong > 0)) return null;
  const dongLon = rows.reduce((a, b) => (so(b.so_luong) > so(a.so_luong) ? b : a));
  const suy = chuanHoaSuyTuTen(phu.suyTuTen) as Record<string, string>;
  // Mã / tên công trình đang gán (mọi kho của mã) — CHỈ để che, không đưa vào item
  const cum = cumCongTrinh(rows.flatMap(r => [r.ten_cong_trinh, r.ma_cong_trinh]));
  const che = (v: string | null): string | null => (v ? cheCongTrinh(v, cum) || null : null);
  const thuocTinh: ThuocTinhCongKhai = {};
  for (const [khoa, cot] of COT_THUOC_TINH) {
    const gt = che((cot ? chuoiGon(r0[cot]) : null) ?? (khoa === 'xuatXu' ? null : chuoiGon(suy[khoa])));
    if (gt) thuocTinh[khoa] = khoa === 'quyCach' ? suaQuyCachDayRong(gt) : gt;
  }
  const thuocTinhDayDu = dungThuocTinhDayDu(thuocTinh, r0.m_thuoc_tinh, che);
  const gia = Number(r0.gia_ban_vnd);
  const anhNgoai: string[] = [];
  if (Array.isArray(r0.anh_urls)) {
    for (const u of r0.anh_urls) {
      const s = typeof u === 'string' ? u.trim() : '';
      if (laUrlAnhHopLe(s) && !anhNgoai.includes(s) && anhNgoai.length < SO_ANH_TOI_DA) anhNgoai.push(s);
    }
  }
  const dvt = rows.map(r => chuoiGon(r.dvt)).find(Boolean) ?? chuoiGon(r0.m_dvt);
  return {
    ma,
    // Tên admin đặt cho khách giữ nguyên; tên tồn / master che mã + tên công trình (hết chữ => chủng loại / 'Vật tư <mã>')
    ten: chuoiGon(r0.ten_hien_thi)
      ?? che(rows.map(r => chuoiGon(r.ten)).find(Boolean) ?? null) ?? che(chuoiGon(r0.m_ten)) ?? thuocTinh.chungLoai ?? `Vật tư ${ma}`,
    loai: loaiTuKho(dongLon.kho),
    thuocTinh,
    thuocTinhDayDu,
    nhomVatTu: che(tenNhomVatTu(r0.m_ten_nhom_sap, r0.m_thuoc_tinh)),
    soLuong,
    dvt: tenDvt(dvt),
    giaBanVnd: r0.gia_ban_vnd !== null && r0.gia_ban_vnd !== undefined && r0.gia_ban_vnd !== '' && Number.isFinite(gia) && gia > 0 ? gia : null,
    moTa: chuoiGon(r0.mo_ta_cong_khai),
    anh: (phu.anh ?? []).filter(id => Number.isSafeInteger(id) && id > 0),
    anhNgoai,
    dangLuc: /^\d{4}-\d{2}-\d{2}$/.test(String(r0.dang_luc ?? '')) ? String(r0.dang_luc) : null,
  };
};

/** Gom dòng tồn theo mã => item công khai; thứ tự: mới đăng trước, rồi tên, rồi mã. */
export const gopDanhSachCongKhai = (
  rows: Array<Record<string, unknown>>, suyTuTen: Map<string, unknown>, anh: Map<string, number[]>,
): ItemCongKhai[] => {
  const theoMa = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const ma = String(r.ma ?? '');
    if (!ma) continue;
    const ds = theoMa.get(ma);
    if (ds) ds.push(r); else theoMa.set(ma, [r]);
  }
  const items: ItemCongKhai[] = [];
  for (const [ma, ds] of theoMa) {
    const it = dungItemCongKhai(ds, { suyTuTen: suyTuTen.get(ma), anh: anh.get(ma) });
    if (it) items.push(it);
  }
  return items.sort((a, b) =>
    (b.dangLuc ?? '').localeCompare(a.dangLuc ?? '') || a.ten.localeCompare(b.ten, 'vi') || (a.ma < b.ma ? -1 : a.ma > b.ma ? 1 : 0));
};

// --- Yêu cầu báo giá ---------------------------------------------------------
export const SO_DONG_YEU_CAU_TOI_DA = 30;
export const THAN_YEU_CAU_TOI_DA_BYTE = 20 * 1024;
export const YEU_CAU_MOI_GIO_TOI_DA = 5;
export const YEU_CAU_MOI_NGAY_TOI_DA = 50;

/** SĐT Việt Nam: bỏ khoảng trắng / dấu chấm / gạch / ngoặc, '+84' đầu => '0'; còn lại phải 9–12 chữ số. Sai => null. */
export const chuanHoaSdt = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 40) return null;
  let s = v.replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  return /^\d{9,12}$/.test(s) ? s : null;
};

/**
 * Văn bản thuần: bỏ ký tự điều khiển (giữ xuống dòng khi nhieuDong), gộp dấu cách (1 dòng), cắt khoảng trắng 2 đầu.
 * GIỮ nguyên '<' '>' (khách hay ghi '<5mm', '>1m'): lưu như chữ — trang admin hiển thị bằng React (đã escape, không
 * dangerouslySetInnerHTML), thông báo push không chứa chữ của khách.
 */
export const vanBanThuan = (s: string, nhieuDong = false): string => {
  let t = nhieuDong
    // eslint-disable-next-line no-control-regex
    ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    // eslint-disable-next-line no-control-regex
    : s.replace(/[\u0000-\u001f\u007f]/g, ' ');
  t = nhieuDong ? t.split('\n').map(d => d.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ');
  return t.trim();
};

export const laEmailHopLe = (s: string): boolean => s.length <= 200 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(s);

export interface ThanYeuCau {
  items: Array<{ ma: string; soLuong: number }>;
  ten: string;
  sdt: string;
  email: string | null;
  congTy: string | null;
  ghiChu: string | null;
}

/**
 * Kiểm tra thân POST /api/cong-khai/yeu-cau. Honeypot `web` có chữ => { laBot: true } (route trả 201 giả cùng dạng, không lưu).
 * items: 1–30 dòng (cùng mã gộp cộng số lượng), soLuong số hữu hạn > 0; ten 2–100 ký tự; sdt VN; email? hợp lệ ≤ 200;
 * congTy? ≤ 200; ghiChu? ≤ 1000. Chuỗi lưu dạng văn bản thuần. Số lượng so với tồn ở ghepYeuCau (cần danh sách).
 */
export const kiemTraThanYeuCau = (body: unknown):
  { hopLe: true; laBot: true } | { hopLe: true; laBot: false; than: ThanYeuCau } | { hopLe: false; loi: string } => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { hopLe: false, loi: 'Dữ liệu gửi lên không hợp lệ' };
  const b = body as Record<string, unknown>;
  if (b.web !== undefined && b.web !== null && String(b.web).trim() !== '') return { hopLe: true, laBot: true };

  if (!Array.isArray(b.items) || b.items.length === 0) return { hopLe: false, loi: 'Chưa chọn vật tư nào' };
  if (b.items.length > SO_DONG_YEU_CAU_TOI_DA) return { hopLe: false, loi: `Tối đa ${SO_DONG_YEU_CAU_TOI_DA} mã mỗi yêu cầu` };
  const gop = new Map<string, number>();
  for (const x of b.items) {
    if (x === null || typeof x !== 'object') return { hopLe: false, loi: 'Danh sách vật tư không hợp lệ' };
    const d = x as Record<string, unknown>;
    const ma = docMaVatTu(d.ma);
    if (!ma) return { hopLe: false, loi: 'Có mã vật tư không hợp lệ' };
    if (typeof d.soLuong !== 'number' || !Number.isFinite(d.soLuong) || d.soLuong <= 0) {
      return { hopLe: false, loi: `Số lượng của mã ${ma} phải lớn hơn 0` };
    }
    gop.set(ma, (gop.get(ma) ?? 0) + d.soLuong);
  }

  if (typeof b.ten !== 'string') return { hopLe: false, loi: 'Vui lòng nhập họ tên' };
  const ten = vanBanThuan(b.ten);
  if (ten.length < 2 || ten.length > 100) return { hopLe: false, loi: 'Họ tên từ 2 đến 100 ký tự' };

  const sdt = chuanHoaSdt(b.sdt);
  if (!sdt) return { hopLe: false, loi: 'Số điện thoại không hợp lệ (9–12 chữ số)' };

  const tuyChon = (v: unknown, toiDa: number, nhieuDong = false): { ok: true; gt: string | null } | { ok: false } => {
    if (v === undefined || v === null) return { ok: true, gt: null };
    if (typeof v !== 'string' || v.length > toiDa * 2) return { ok: false };
    const s = vanBanThuan(v, nhieuDong);
    return s.length > toiDa ? { ok: false } : { ok: true, gt: s || null };
  };
  const email = tuyChon(b.email, 200);
  if (!email.ok || (email.gt !== null && !laEmailHopLe(email.gt))) return { hopLe: false, loi: 'Email không hợp lệ' };
  const congTy = tuyChon(b.congTy, 200);
  if (!congTy.ok) return { hopLe: false, loi: 'Tên công ty tối đa 200 ký tự' };
  const ghiChu = tuyChon(b.ghiChu, 1000, true);
  if (!ghiChu.ok) return { hopLe: false, loi: 'Ghi chú tối đa 1000 ký tự' };

  return {
    hopLe: true,
    laBot: false,
    than: {
      items: [...gop].map(([ma, soLuong]) => ({ ma, soLuong })),
      ten, sdt, email: email.gt, congTy: congTy.gt, ghiChu: ghiChu.gt,
    },
  };
};

/**
 * Ghép dòng yêu cầu với danh sách công khai (không tin tên / đvt của client): mã phải đang công khai (mã chưa đăng báo
 * như mã không có), số lượng ≤ còn. Kết quả = items lưu JSONB [{ma, ten, soLuong, dvt}].
 */
export const ghepYeuCau = (
  items: ThanYeuCau['items'], theoMa: Map<string, ItemCongKhai>,
): { hopLe: true; dong: Array<{ ma: string; ten: string; soLuong: number; dvt: string | null }> } | { hopLe: false; loi: string } => {
  const dong: Array<{ ma: string; ten: string; soLuong: number; dvt: string | null }> = [];
  for (const { ma, soLuong } of items) {
    const it = theoMa.get(ma);
    if (!it) return { hopLe: false, loi: `Mã ${ma} hiện không còn chào bán — vui lòng bỏ khỏi yêu cầu` };
    if (soLuong > it.soLuong + 1e-9) {
      return { hopLe: false, loi: `Mã ${ma} chỉ còn ${it.soLuong.toLocaleString('vi-VN')}${it.dvt ? ' ' + it.dvt : ''}` };
    }
    dong.push({ ma, ten: it.ten, soLuong, dvt: it.dvt });
  }
  return { hopLe: true, dong };
};

const KY_TU_MA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Mã yêu cầu cho khách: YC-YYYYMMDD-XXXX (ngày giờ VN, 4 ký tự dễ đọc — không 0/O/1/I). */
export const taoMaYeuCau = (luc: Date = new Date(), ngauNhien: (n: number) => number = randomInt): string => {
  const ngay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(luc).replace(/-/g, '');
  let duoi = '';
  for (let i = 0; i < 4; i++) duoi += KY_TU_MA[ngauNhien(KY_TU_MA.length)];
  return `YC-${ngay}-${duoi}`;
};

/** IP khách: req.ip (app 'trust proxy' 1 => IP thật sau proxy Vercel); thiếu thì phần tử đầu x-forwarded-for. */
export const ipKhach = (req: Pick<Request, 'ip' | 'headers'>): string =>
  req.ip || String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'khong-ro';

/** Khoá đếm theo IP: IPv4 giữ nguyên; IPv6 gộp dải /56 (1 khách thường giữ cả dải — đổi địa chỉ không lách được). */
export const khoaIp = (ip: string): string => {
  try { return ipKeyGenerator(ip, 56); } catch { return ip; }
};

/** sha256(khoá IP đã gộp dải + bí mật máy chủ): đếm số lần gửi theo IP mà không lưu IP thô. */
export const bamIp = (ip: string, biMat: string = JWT_SECRET_SAFE): string =>
  createHash('sha256').update(`${khoaIp(ip)}|${biMat}`).digest('hex');

// ---------------------------------------------------------------------------
// ĐỌC DỮ LIỆU (cache theo phiên bản 'ban_vt' — cùng khoá với trang admin: PUT / đăng hàng loạt / duyệt ảnh đổi khoá)
// ---------------------------------------------------------------------------
const laThieuBangHoacCot = (e: unknown) => ['42P01', '42703'].includes(String((e as { code?: string })?.code));

const SQL_CONG_KHAI_DANH_SACH = `
  WITH moc AS (
    SELECT t.ngay_chot FROM ban_vt_ton t
    ORDER BY t.ngay_chot DESC NULLS LAST, t.updated_at DESC NULLS LAST LIMIT 1
  )
  SELECT t.ma_vat_tu AS ma, t.ten_vat_tu AS ten, t.dvt, t.so_luong, t.kho,
         t.ten_cong_trinh, t.ma_cong_trinh, -- CHỈ để che khỏi tên / thuộc tính (dungItemCongKhai), không ra item
         to_char((SELECT ngay_chot FROM moc), 'YYYY-MM-DD') AS ngay_chot,
         b.ten_hien_thi, b.mo_ta_cong_khai, b.gia_ban_vnd, b.anh_urls,
         to_char(b.dang_cong_khai_luc AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS dang_luc,
         m.ten_master AS m_ten, m.dvt AS m_dvt, m.chung_loai AS m_chung_loai, m.chat_lieu AS m_chat_lieu,
         m.quy_cach AS m_quy_cach, m.mau AS m_mau, m.thuong_hieu AS m_thuong_hieu, m.xuat_xu AS m_xuat_xu,
         m.ten_nhom_sap AS m_ten_nhom_sap,
         m.thuoc_tinh AS m_thuoc_tinh -- CHỈ qua danh sách trắng NHAN_MP_CONG_KHAI (dungThuocTinhDayDu), không ra item thô
  FROM ban_vt_ton t
  JOIN ban_vt_thong_tin b ON b.ma_vat_tu = t.ma_vat_tu AND b.dang_cong_khai AND b.trang_thai = 'dang_ban'
  LEFT JOIN ban_vt_master m ON m.ma_vat_tu = t.ma_vat_tu
  WHERE t.ngay_chot IS NOT DISTINCT FROM (SELECT ngay_chot FROM moc)`;

/** Điều kiện "mã đang công khai" cho ảnh (alias a = ban_vt_anh) */
const SQL_MA_DANG_CONG_KHAI = `
  EXISTS (SELECT 1 FROM ban_vt_thong_tin b
          WHERE b.ma_vat_tu = a.ma_vat_tu AND b.dang_cong_khai AND b.trang_thai = 'dang_ban')
  AND EXISTS (SELECT 1 FROM ban_vt_ton t
              WHERE t.ma_vat_tu = a.ma_vat_tu
                AND t.ngay_chot IS NOT DISTINCT FROM (SELECT ngay_chot FROM ban_vt_ton
                                                      ORDER BY ngay_chot DESC NULLS LAST, updated_at DESC NULLS LAST LIMIT 1))`;

const docPhu = async (sql: string): Promise<Array<Record<string, unknown>>> => {
  try {
    return (await timedQuery(sql, [], { timeoutMs: TIMEOUT_MS, workMemMb: 16 })).rows;
  } catch (e) {
    if (!laThieuBangHoacCot(e)) throw e;
    return [];
  }
};

export const tinhDanhSachCongKhai = async (): Promise<DanhSachCongKhai> => {
  let rows: Array<Record<string, unknown>>;
  try {
    rows = (await timedQuery(SQL_CONG_KHAI_DANH_SACH, [], { timeoutMs: TIMEOUT_MS, workMemMb: 16 })).rows;
  } catch (e) {
    if (!laThieuBangHoacCot(e)) throw e;
    return { capNhat: null, items: [] };
  }
  if (!rows.length) return { capNhat: null, items: [] };
  const [suyRows, anhRows] = await Promise.all([
    docPhu(`SELECT m.ma_vat_tu, m.suy_tu_ten FROM ban_vt_master m
            WHERE m.suy_tu_ten IS NOT NULL AND m.suy_tu_ten <> '{}'::jsonb
              AND EXISTS (SELECT 1 FROM ban_vt_thong_tin b WHERE b.ma_vat_tu = m.ma_vat_tu AND b.dang_cong_khai AND b.trang_thai = 'dang_ban')`),
    // Đã duyệt trước, rồi chắc chắn, rồi mới nhất (như trang admin)
    docPhu(`SELECT a.id, a.ma_vat_tu FROM ban_vt_anh a
            WHERE a.cong_khai AND a.trang_thai <> 'an' AND ${SQL_MA_DANG_CONG_KHAI}
            ORDER BY a.ma_vat_tu, (a.trang_thai = 'da_duyet') DESC, a.chac_chan DESC, a.created_at DESC NULLS LAST, a.id`),
  ]);
  const suy = new Map(suyRows.map(r => [String(r.ma_vat_tu), r.suy_tu_ten]));
  const anh = new Map<string, number[]>();
  for (const r of anhRows) {
    const ma = String(r.ma_vat_tu);
    const id = Number(r.id);
    if (!Number.isSafeInteger(id)) continue;
    const ds = anh.get(ma) ?? [];
    if (ds.length < 12) ds.push(id);
    anh.set(ma, ds);
  }
  return { capNhat: chuoiGon(rows[0]?.ngay_chot), items: gopDanhSachCongKhai(rows, suy, anh) };
};

const cacheCongKhai = createCache<DanhSachCongKhai>(1);
const docDanhSachCongKhai = async (): Promise<DanhSachCongKhai> =>
  cachedByVersions(cacheCongKhai, 'cong-khai', [], tinhDanhSachCongKhai, await docPhienBan());

// ---------------------------------------------------------------------------
// GIỚI HẠN THEO IP (bộ nhớ từng instance — lớp chặn thô; gửi yêu cầu còn đếm trong DB)
// ---------------------------------------------------------------------------
const gioiHan = (windowMs: number, max: number, loi: string) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: loi },
});
const gioiHanDanhSach = gioiHan(60_000, 60, 'Truy cập quá nhiều, vui lòng thử lại sau ít phút');
// Lưới thẻ tải ảnh lười khi cuộn: rộng hơn danh sách
const gioiHanAnh = gioiHan(60_000, 600, 'Tải ảnh quá nhiều, vui lòng thử lại sau ít phút');
const gioiHanGui = gioiHan(15 * 60_000, 10, 'Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau');

// ---------------------------------------------------------------------------
// GET /api/cong-khai/vat-tu
// ---------------------------------------------------------------------------
app.get('/api/cong-khai/vat-tu', gioiHanDanhSach, async (_req: Request, res: Response) => {
  try {
    const ketQua = await docDanhSachCongKhai();
    // Ngắn: admin gỡ đăng thì bộ nhớ đệm ngoài (trình duyệt / proxy / xem trước link Zalo) hết giữ trong ~30 giây
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json(ketQua);
  } catch (error) {
    console.error('Lỗi cong-khai/vat-tu:', error);
    res.status(500).json({ error: 'Hệ thống đang bận, vui lòng thử lại sau' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/cong-khai/anh/:id — chỉ ảnh cong_khai, chưa ẩn, của mã đang công khai + đang bán + còn trong tồn mới nhất.
// Mọi trường hợp khác (id sai, không có, chưa bật, mã chưa đăng, chưa chạy SQL) => cùng 1 câu 404.
// ---------------------------------------------------------------------------
const KHONG_THAY_ANH = { error: 'Không tìm thấy ảnh' };
app.get('/api/cong-khai/anh/:id', gioiHanAnh, async (req: Request, res: Response) => {
  try {
    const id = docIdAnh(req.params.id);
    if (id === null) return res.status(404).json(KHONG_THAY_ANH);
    let dong: Record<string, unknown> | undefined;
    try {
      dong = (await timedQuery(
        `SELECT a.data, a.mime FROM ban_vt_anh a
         WHERE a.id = $1 AND a.cong_khai AND a.trang_thai <> 'an' AND ${SQL_MA_DANG_CONG_KHAI}`, [id])).rows[0] as
        Record<string, unknown> | undefined;
    } catch (e) {
      if (laThieuBangHoacCot(e)) return res.status(404).json(KHONG_THAY_ANH);
      throw e;
    }
    if (!dong || !Buffer.isBuffer(dong.data)) return res.status(404).json(KHONG_THAY_ANH);
    res.setHeader('Content-Type', mimeAnhAnToan(dong.mime));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 5 phút: admin gỡ đăng / tắt ảnh (vd thấy chữ viết tay, tên công trình) thì máy chủ chặn ngay, bộ nhớ đệm ngoài
    // (trình duyệt, proxy, xem trước link Zalo) hết giữ trong ~5 phút. Ảnh khách đã tải về máy thì không thu hồi được.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(dong.data);
  } catch (error) {
    console.error('Lỗi cong-khai/anh:', error);
    res.status(500).json({ error: 'Hệ thống đang bận, vui lòng thử lại sau' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/cong-khai/yeu-cau
// ---------------------------------------------------------------------------
const LOI_THIEU_BANG_YEU_CAU = { error: 'Chức năng gửi yêu cầu đang tạm dừng, vui lòng gọi điện cho chúng tôi' };

/** Trần thông báo CHUNG toàn hệ thống mỗi giờ (giới hạn theo IP không chặn được kẻ dùng nhiều IP) */
export const THONG_BAO_MOI_GIO_TOI_DA = 30;

/**
 * Báo hay không, theo số yêu cầu đã lưu trong 1 giờ qua trên toàn hệ thống (TRƯỚC yêu cầu này): dưới trần => báo từng
 * yêu cầu; đúng trần => 1 thông báo gộp "nhiều yêu cầu, tạm ngừng báo"; quá trần => không báo (yêu cầu vẫn lưu, admin
 * thấy ở thẻ Yêu cầu mua).
 */
export const kieuThongBao = (demTruocTrongGio: number): 'tung_cai' | 'gop' | 'khong' =>
  demTruocTrongGio < THONG_BAO_MOI_GIO_TOI_DA ? 'tung_cai' : demTruocTrongGio === THONG_BAO_MOI_GIO_TOI_DA ? 'gop' : 'khong';

/**
 * Báo người có quyền sửa bán vật tư (ADMIN cũng nhận): hộp thông báo + Web Push. Không bao giờ ném lỗi ra ngoài.
 * Nội dung KHÔNG chứa chữ khách gõ (tên khách tự do có thể dùng để gửi tin lừa tới điện thoại admin): chỉ mã yêu cầu + số mã.
 */
const baoYeuCauMoi = async (maYeuCau: string, soMa: number, kieu: 'tung_cai' | 'gop'): Promise<void> => {
  try {
    // users.permissions là text[] (users.ts ghi mảng JS)
    const r = await timedQuery(
      `SELECT id::text AS id FROM users WHERE is_active AND (role = 'ADMIN' OR $1::text = ANY(permissions))`, [QUYEN_SUA]);
    const ids = r.rows.map(x => String(x.id));
    if (!ids.length) return;
    const title = kieu === 'gop' ? 'Có nhiều yêu cầu mua vật tư mới' : 'Có yêu cầu mua vật tư mới';
    const body = kieu === 'gop'
      ? `Đã có ${THONG_BAO_MOI_GIO_TOI_DA + 1} yêu cầu trong 1 giờ qua — tạm ngừng báo từng yêu cầu, xem ở trang Bán vật tư`
      : `${maYeuCau} · ${soMa} mã`;
    try {
      await timedQuery(
        `INSERT INTO notifications (user_id, kind, title, body, vuong_mac_id, hex, actor)
         SELECT u, 'ban_vt_yeu_cau', $2, $3, NULL, NULL, NULL FROM unnest($1::text[]) u`, [ids, title, body]);
    } catch (e) {
      if (!laThieuBangHoacCot(e)) throw e;
    }
    await sendToUsers(ids, { title, body, tag: kieu === 'gop' ? 'ban-vt-nhieu-yeu-cau' : `ban-vt-${maYeuCau}`, target: { hex: '', category: 'ban_vat_tu', id: 0, url: '/#/ban-vat-tu' } });
  } catch (e) {
    console.error('[ban-vat-tu] lỗi gửi thông báo yêu cầu mua', e);
  }
};

app.post('/api/cong-khai/yeu-cau', gioiHanGui, async (req: Request, res: Response) => {
  try {
    // Thân đọc bằng parser riêng giới hạn 20kb (server/app.ts, đăng ký trước parser chung 2mb); chặn thêm ở đây phòng hờ
    const doDai = Number(req.headers['content-length'] ?? 0);
    if (doDai > THAN_YEU_CAU_TOI_DA_BYTE || Buffer.byteLength(JSON.stringify(req.body ?? null)) > THAN_YEU_CAU_TOI_DA_BYTE) {
      return res.status(413).json({ error: 'Yêu cầu quá dài' });
    }
    const kt = kiemTraThanYeuCau(req.body);
    if (!kt.hopLe) return res.status(400).json({ error: kt.loi });
    // Bẫy máy: trả y như thành công (cùng 201, cùng dạng thân) — bot không phân biệt được qua mã trạng thái; không lưu
    if (kt.laBot) return res.status(201).json({ maYeuCau: taoMaYeuCau() });

    const ds = await docDanhSachCongKhai();
    const ghep = ghepYeuCau(kt.than.items, new Map(ds.items.map(it => [it.ma, it])));
    if (!ghep.hopLe) return res.status(400).json({ error: ghep.loi });

    const ipHash = bamIp(ipKhach(req));
    const ua = String(req.headers['user-agent'] ?? '').slice(0, 300) || null;
    // Đếm + ghi trong 1 giao dịch, giữ khoá theo ip_hash (pg_advisory_xact_lock — nhả khi COMMIT / ROLLBACK): các yêu cầu
    // gửi dồn song song từ cùng IP (kể cả ở nhiều instance) xếp hàng, đứa sau đếm thấy dòng đứa trước => không lọt quá 5.
    let kq: { quaGioiHan: true } | { quaGioiHan: false; maYeuCau: string; demToanBo: number };
    try {
      kq = await withTransaction(async client => {
        await client.query(`SET LOCAL statement_timeout = ${TIMEOUT_MS}`);
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('ban_vt_yeu_cau|' || $1::text))`, [ipHash]);
        const r = await client.query(
          `SELECT COUNT(*) FILTER (WHERE ip_hash = $1 AND created_at > now() - interval '1 hour')::int AS gio,
                  COUNT(*) FILTER (WHERE ip_hash = $1)::int AS ngay,
                  COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS toan_bo
           FROM ban_vt_yeu_cau WHERE created_at > now() - interval '1 day'`, [ipHash]);
        const gio = Number(r.rows[0]?.gio ?? 0);
        const ngay = Number(r.rows[0]?.ngay ?? 0);
        if (gio >= YEU_CAU_MOI_GIO_TOI_DA || ngay >= YEU_CAU_MOI_NGAY_TOI_DA) return { quaGioiHan: true as const };
        // Trùng mã yêu cầu (rất hiếm) => ON CONFLICT bỏ qua, sinh mã khác (không làm hỏng giao dịch như bắt lỗi 23505)
        for (let lan = 0; lan < 5; lan++) {
          const ma = taoMaYeuCau();
          const ins = await client.query(
            `INSERT INTO ban_vt_yeu_cau (ma_yeu_cau, items, ten_khach, sdt, email, cong_ty, ghi_chu, ip_hash, user_agent)
             VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (ma_yeu_cau) DO NOTHING RETURNING id`,
            [ma, JSON.stringify(ghep.dong), kt.than.ten, kt.than.sdt, kt.than.email, kt.than.congTy, kt.than.ghiChu, ipHash, ua]);
          if (ins.rows.length) return { quaGioiHan: false as const, maYeuCau: ma, demToanBo: Number(r.rows[0]?.toan_bo ?? 0) };
        }
        throw new Error('Không sinh được mã yêu cầu không trùng sau 5 lần');
      });
    } catch (e) {
      if (laThieuBangHoacCot(e)) {
        console.error(`[cong-khai] chưa tạo bảng ban_vt_yeu_cau — chạy ${SQL_CONG_KHAI}`);
        return res.status(503).json(LOI_THIEU_BANG_YEU_CAU);
      }
      throw e;
    }
    if (kq.quaGioiHan) return res.status(429).json({ error: 'Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau' });

    const kieu = kieuThongBao(kq.demToanBo);
    if (kieu !== 'khong') await baoYeuCauMoi(kq.maYeuCau, ghep.dong.length, kieu);
    res.status(201).json({ maYeuCau: kq.maYeuCau });
  } catch (error) {
    console.error('Lỗi cong-khai/yeu-cau:', error);
    res.status(500).json({ error: 'Hệ thống đang bận, vui lòng thử lại sau' });
  }
});
