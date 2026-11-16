import { DS_THUOC_TINH_KHACH, LOAI_DAN_BE_MAT, NHAN_THUOC_TINH_KHACH, type BodyYeuCau, type HangKhach, type ThongSoKhach } from '../../services/cuaHangApi';
import { boDau as boDauGoc, thuTuLoai } from '../BanVatTu/xuLy';

// ============================================================================
// HÀM THUẦN CỦA TRANG KHÁCH (/#/cua-hang): tìm / lọc / sắp xếp, giỏ "Yêu cầu báo giá" (lưu localStorage), đọc số
// lượng khách gõ, chuẩn số điện thoại + kiểm tra form trước khi gửi. Không đụng React / DOM => test vitest.
// Máy chủ kiểm tra lại mọi thứ (không tin client) — ở đây chỉ để báo lỗi sớm, dễ hiểu.
// ============================================================================

/** Bỏ dấu cho tìm kiếm khách: như BanVatTu, thêm 'Ð' / 'ð' (U+00D0 / U+00F0 — tên SAP cũ gõ nhầm thay 'Đ') => d */
export const boDau = (s: string): string => boDauGoc(s.replace(/[Ðð]/g, 'd'));

// ---------------------------------------------------------------------------
// Tìm / lọc / sắp xếp
// ---------------------------------------------------------------------------
export const chuoiTimHang = (h: HangKhach): string =>
  boDau([h.ma, h.ten, h.loai, h.nhomVatTu ?? '', ...Object.values(h.thuocTinh), ...(h.thuocTinhDayDu ?? []).map(t => t.giaTri), h.moTa ?? ''].join(' '));

export type CachXepKhach = 'moi' | 'ten' | 'giaTang' | 'giaGiam';
export const NHAN_XEP_KHACH: Record<CachXepKhach, string> = {
  moi: 'Mới đăng', ten: 'Tên A → Z', giaTang: 'Giá thấp → cao', giaGiam: 'Giá cao → thấp',
};
/** Cách xếp khách chọn được: chưa mã nào có giá (mọi mã "Liên hệ") => ẩn 2 cách xếp theo giá (bấm vào không có tác dụng) */
export const cachXepCo = (coGia: boolean): CachXepKhach[] =>
  (Object.keys(NHAN_XEP_KHACH) as CachXepKhach[]).filter(k => coGia || (k !== 'giaTang' && k !== 'giaGiam'));

export interface HangHien extends HangKhach {
  /** Thứ tự máy chủ trả (mới đăng trước) */
  stt: number;
  tim: string;
  /** Khoá chủng loại ('' = không có) — bộ lọc Chủng loại */
  khoaCL: string;
  /** Id nhóm màu (NHOM_MAU) hoặc null = chưa rõ màu — bộ lọc Màu */
  nhomMau: string | null;
}

export const chuanBiHang = (items: HangKhach[]): HangHien[] =>
  items.map((h, stt) => ({ ...h, stt, tim: chuoiTimHang(h), khoaCL: khoaChungLoai(h.thuocTinh.chungLoai ?? ''), nhomMau: nhomMauHang(h) }));

/** Lọc theo ô tìm (mọi từ đều phải có, không dấu) + loại ('' = tất cả) */
export const locHang = (ds: HangHien[], tim: string, loai: string): HangHien[] => {
  const tu = boDau(tim).split(' ').filter(Boolean);
  return ds.filter(h => (!loai || h.loai === loai) && tu.every(t => h.tim.includes(t)));
};

/** Sắp xếp; 'moi': mã có ảnh đứng trước, còn lại giữ thứ tự máy chủ; giá: mã "Liên hệ" luôn xếp cuối */
export const xepHang = (ds: HangHien[], cach: CachXepKhach): HangHien[] => {
  const kq = [...ds];
  if (cach === 'moi') return kq.sort((a, b) => Number(coAnh(b)) - Number(coAnh(a)) || a.stt - b.stt);
  if (cach === 'ten') return kq.sort((a, b) => a.ten.localeCompare(b.ten, 'vi') || a.stt - b.stt);
  const huong = cach === 'giaTang' ? 1 : -1;
  return kq.sort((a, b) => {
    if (a.giaBanVnd === null && b.giaBanVnd === null) return a.stt - b.stt;
    if (a.giaBanVnd === null) return 1;
    if (b.giaBanVnd === null) return -1;
    return (a.giaBanVnd - b.giaBanVnd) * huong || a.stt - b.stt;
  });
};

/** Thứ tự loại trang khách: 10 loại chính, "Vật liệu dán bề mặt" (tách từ Vải / Tấm-Ván) ngay sau Tấm-Ván */
const thuTuLoaiKhach = (loai: string): number =>
  (loai === LOAI_DAN_BE_MAT ? thuTuLoai('KVT Tấm-Ván') + 0.5 : thuTuLoai(loai));

/** Chip loại: đếm theo ô tìm hiện tại, đúng thứ tự 10 loại chính (loại lạ xếp cuối), bỏ loại 0 mã */
export const demTheoLoai = (ds: HangHien[]): Array<{ loai: string; dem: number }> => {
  const m = new Map<string, number>();
  for (const h of ds) m.set(h.loai, (m.get(h.loai) ?? 0) + 1);
  return [...m.entries()]
    .map(([loai, dem]) => ({ loai, dem }))
    .sort((a, b) => thuTuLoaiKhach(a.loai) - thuTuLoaiKhach(b.loai) || a.loai.localeCompare(b.loai, 'vi'));
};

/** Khoá loại trên địa chỉ trang (#/cua-hang?loai=da): tên gọn không dấu, gạch nối ('Vải, da & mút' => 'vai-da-mut') */
export const khoaLoai = (loai: string): string =>
  boDau(tenLoaiGon(loai)).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Đọc loại (khoá) + chủng loại (khoá) + nhóm màu (id) + trang từ hash '#/cua-hang?loai=da&cl=dda&mau=xam&trang=2'
 * (sai / thiếu => '' / 1). Khoá lạ không kiểm ở đây — trang tự bỏ khi không khớp danh sách.
 */
export const docHashCuaHang = (hash: string): { loai: string; chungLoai: string; mau: string; trang: number } => {
  const i = hash.indexOf('?');
  const q = new URLSearchParams(i >= 0 ? hash.slice(i + 1) : '');
  const trang = Number(q.get('trang'));
  const khoa = (k: string) => (q.get(k) ?? '').trim().toLowerCase();
  return { loai: khoa('loai'), chungLoai: khoa('cl'), mau: khoa('mau'), trang: Number.isInteger(trang) && trang > 1 ? trang : 1 };
};

/** Hash cho loại + bộ lọc (khoá chủng loại, id nhóm màu) + trang đang xem (tất cả, trang 1 => '#/cua-hang') */
export const taoHashCuaHang = (loai: string, trang: number, loc: { chungLoai?: string; mau?: string } = {}): string => {
  const q = new URLSearchParams();
  if (loai) q.set('loai', khoaLoai(loai));
  if (loc.chungLoai) q.set('cl', loc.chungLoai);
  if (loc.mau) q.set('mau', loc.mau);
  if (trang > 1) q.set('trang', String(trang));
  const s = q.toString();
  return `#/cua-hang${s ? `?${s}` : ''}`;
};

// ---------------------------------------------------------------------------
// BỘ LỌC CHỦNG LOẠI + MÀU (16/11/2026, theo mẫu trang danh mục đá: thanh lọc ngang trên lưới)
// ---------------------------------------------------------------------------
/** Tên chủng loại cho khách: SAP CHỮ HOA => viết hoa đầu câu ('SOLID SURFACE' => 'Solid surface'), viết tắt giữ hoa (MDF) */
export const tenChungLoai = (s: string): string => {
  const t = String(s ?? '').replace(/Ð/g, 'Đ').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t !== t.toLocaleUpperCase('vi')) return t;
  return hoaDau(t.split(' ').map(w => (VIET_TAT_GIU_HOA.has(w) ? w : w.toLocaleLowerCase('vi'))).join(' '));
};
/**
 * Khoá chủng loại (địa chỉ trang, so trùng giữa các loại): không dấu, gạch nối ('GIẤY DÁN TƯỜNG' => 'giay-dan-tuong').
 * 'Đ' => 'dd' (kiểu gõ Telex) trước khi bỏ dấu: 'ĐÁ' (đá) => 'dda' khác 'DA' (da, loại Vải, da & mút) => 'da' —
 * bỏ dấu thường thì hai chủng loại gộp một khoá, ô chủng loại ở 'Tất cả' ra "Da (85)" lẫn đá với da.
 */
export const khoaChungLoai = (s: string): string =>
  boDau(String(s ?? '').replace(/[ĐÐ]/g, 'DD').replace(/[đð]/g, 'dd')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export interface NhomMau { id: string; ten: string; /** màu chấm minh hoạ */ mau: string }
/** Nhóm màu tiếng Việt, đúng thứ tự hiện trong ô chọn (sáng => tối => màu) */
export const NHOM_MAU: readonly NhomMau[] = [
  { id: 'trang', ten: 'Trắng', mau: '#FFFFFF' },
  { id: 'kem', ten: 'Kem & be', mau: '#E6D5B8' },
  { id: 'xam', ten: 'Xám', mau: '#9A9A96' },
  { id: 'den', ten: 'Đen', mau: '#1C1917' },
  { id: 'nau', ten: 'Nâu', mau: '#7A4F2E' },
  { id: 'vang', ten: 'Vàng & cam', mau: '#D4A12A' },
  { id: 'do', ten: 'Đỏ & hồng', mau: '#B83A4B' },
  { id: 'xanh-la', ten: 'Xanh lá', mau: '#4F7A52' },
  { id: 'xanh-duong', ten: 'Xanh dương', mau: '#2F5E96' },
  { id: 'tim', ten: 'Tím', mau: '#6D4C8F' },
];

/**
 * Từ khoá (không dấu, thường) => nhóm màu. Cụm 2 chữ đứng trước để 'xanh la' không bị bắt thành 'xanh'.
 * 'xanh' đơn lẻ không gán (xanh lá hay xanh dương?). Tên màu Ý / Pháp hay gặp trong mẫu đá / vải (nero, noir, ghiaccio…).
 * Nhóm AI nhìn ảnh ghi vào MP15 (tra_thuoc_tinh.py --mau-tu-anh): 'KEM / BE' => kem, 'CAM' => Vàng & cam, 'HỒNG' => Đỏ &
 * hồng, 'TÍM' => tím; mô tả ghép ('NÂU ĐẤT', 'XÁM VÂN TRẮNG') lấy từ màu ĐẦU. 'MARBLE' / 'VÂN' không phải màu.
 */
const TU_MAU: ReadonlyArray<[string, string]> = [
  ['xanh la', 'xanh-la'], ['xanh reu', 'xanh-la'], ['xanh duong', 'xanh-duong'], ['xanh bien', 'xanh-duong'],
  ['xanh ngoc', 'xanh-duong'], ['xanh navy', 'xanh-duong'], ['xanh luc', 'xanh-la'], ['xanh da troi', 'xanh-duong'],
  ['mau sua', 'kem'], ['trang sua', 'kem'], ['testa moro', 'nau'],
  ['white', 'trang'], ['trang', 'trang'], ['snow', 'trang'], ['ghiaccio', 'trang'], ['bianco', 'trang'], ['blanc', 'trang'],
  ['beige', 'kem'], ['be', 'kem'], ['kem', 'kem'], ['cream', 'kem'], ['creme', 'kem'], ['ivory', 'kem'], ['sua', 'kem'],
  ['sesame', 'kem'], ['natural', 'kem'], ['marfil', 'kem'], ['sand', 'kem'], ['linen', 'kem'], ['taupe', 'kem'],
  ['wheat', 'kem'], ['avorio', 'kem'],
  ['grey', 'xam'], ['gray', 'xam'], ['xam', 'xam'], ['ghi', 'xam'], ['silver', 'xam'], ['bac', 'xam'], ['grigio', 'xam'], ['charcoal', 'xam'],
  ['black', 'den'], ['den', 'den'], ['noir', 'den'], ['nero', 'den'],
  ['brown', 'nau'], ['nau', 'nau'], ['chocolate', 'nau'], ['coffee', 'nau'], ['cafe', 'nau'], ['moca', 'nau'], ['mocha', 'nau'],
  ['walnut', 'nau'], ['rust', 'nau'], ['malt', 'nau'], ['corteccia', 'nau'], ['tan', 'nau'], ['camel', 'nau'], ['cognac', 'nau'], ['bronze', 'nau'],
  ['moro', 'nau'], ['fango', 'nau'], ['saddle', 'nau'], ['espresso', 'nau'], ['chestnut', 'nau'],
  ['gold', 'vang'], ['vang', 'vang'], ['yellow', 'vang'], ['mustard', 'vang'], ['orange', 'vang'], ['cam', 'vang'], ['oro', 'vang'],
  ['red', 'do'], ['do', 'do'], ['pink', 'do'], ['hong', 'do'], ['burgundy', 'do'], ['bordeaux', 'do'], ['wine', 'do'],
  ['maroon', 'do'], ['rosso', 'do'], ['rose', 'do'], ['pompadour', 'do'], ['ruby', 'do'], ['tabasco', 'do'], ['cherry', 'do'],
  ['crimson', 'do'], ['scarlet', 'do'],
  ['green', 'xanh-la'], ['mint', 'xanh-la'], ['seagrass', 'xanh-la'], ['olive', 'xanh-la'], ['verde', 'xanh-la'], ['sage', 'xanh-la'],
  ['muschio', 'xanh-la'], ['moss', 'xanh-la'], ['pine', 'xanh-la'], ['emerald', 'xanh-la'],
  ['blue', 'xanh-duong'], ['navy', 'xanh-duong'], ['teal', 'xanh-duong'], ['turquoise', 'xanh-duong'], ['blu', 'xanh-duong'],
  ['ocean', 'xanh-duong'], ['azzurro', 'xanh-duong'], ['azure', 'xanh-duong'], ['cobalt', 'xanh-duong'], ['indigo', 'xanh-duong'],
  ['denim', 'xanh-duong'],
  ['purple', 'tim'], ['violet', 'tim'], ['tim', 'tim'], ['lavender', 'tim'], ['plum', 'tim'], ['lilac', 'tim'], ['mauve', 'tim'],
];

/** Nhóm màu của 1 giá trị màu SAP (WHITE / TRẮNG / GREY LIGHT / CREAM MOCA…): từ khoá màu đứng đầu tiên thắng; không rõ => null */
export const nhomMauCua = (giaTri: string | null | undefined): string | null => {
  const tu = boDau(String(giaTri ?? '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  for (let i = 0; i < tu.length; i++) {
    for (const [k, id] of TU_MAU) {
      const ks = k.split(' ');
      if (ks.every((w, j) => tu[i + j] === w)) return id;
    }
  }
  return null;
};

/** Giá trị màu của 1 mã: thuộc tính 'mau', không có thì dòng 'Màu sắc' / 'Màu' trong bảng thông số (không lấy 'Mã màu') */
export const giaTriMau = (h: Pick<HangKhach, 'thuocTinh' | 'thuocTinhDayDu'>): string => {
  if (h.thuocTinh.mau) return h.thuocTinh.mau;
  const dong = (h.thuocTinhDayDu ?? []).find(t => /^mau( sac)?$/.test(boDau(t.nhan).trim()));
  return dong?.giaTri ?? '';
};

export const nhomMauHang = (h: Pick<HangKhach, 'thuocTinh' | 'thuocTinhDayDu'>): string | null => nhomMauCua(giaTriMau(h));
export const timNhomMau = (id: string): NhomMau | undefined => NHOM_MAU.find(n => n.id === id);

/** Chủng loại có trong danh sách (khoá + tên + đếm), nhiều mã trước, cùng số => theo tên; bỏ mã không có chủng loại */
export const demChungLoai = (ds: Array<Pick<HangHien, 'khoaCL' | 'thuocTinh'>>): Array<{ khoa: string; ten: string; dem: number }> => {
  const m = new Map<string, { khoa: string; ten: string; dem: number }>();
  for (const h of ds) {
    if (!h.khoaCL) continue;
    const c = m.get(h.khoaCL);
    if (c) c.dem++;
    else m.set(h.khoaCL, { khoa: h.khoaCL, ten: tenChungLoai(h.thuocTinh.chungLoai ?? ''), dem: 1 });
  }
  return [...m.values()].sort((a, b) => b.dem - a.dem || a.ten.localeCompare(b.ten, 'vi'));
};

/** Nhóm màu có trong danh sách (đúng thứ tự NHOM_MAU, bỏ nhóm 0 mã) + số mã chưa rõ màu */
export const demNhomMau = (ds: Array<Pick<HangHien, 'nhomMau'>>): { nhom: Array<NhomMau & { dem: number }>; chuaRo: number } => {
  const m = new Map<string, number>();
  let chuaRo = 0;
  for (const h of ds) {
    if (h.nhomMau) m.set(h.nhomMau, (m.get(h.nhomMau) ?? 0) + 1);
    else chuaRo++;
  }
  return { nhom: NHOM_MAU.filter(n => m.has(n.id)).map(n => ({ ...n, dem: m.get(n.id) ?? 0 })), chuaRo };
};

/** Lọc thêm theo chủng loại (khoá) + nhóm màu (id); '' = không lọc. Mã không rõ màu không lọt vào nhóm màu nào */
export const locThem = <T extends Pick<HangHien, 'khoaCL' | 'nhomMau'>>(ds: T[], chungLoai: string, mau: string): T[] =>
  (!chungLoai && !mau ? ds : ds.filter(h => (!chungLoai || h.khoaCL === chungLoai) && (!mau || h.nhomMau === mau)));

/** Ô "Đến trang": số nguyên trong 1..tongTrang (ngoài khoảng => chặn về mép); không phải số => null */
export const docSoTrang = (s: string, tongTrang: number): number | null => {
  const t = String(s ?? '').trim();
  if (!/^\d+$/.test(t)) return null;
  return Math.min(Math.max(1, Number(t)), Math.max(1, tongTrang));
};

/** Tên loại riêng (không suy được từ tên kho) */
const TEN_LOAI_RIENG: Record<string, string> = {
  'Kho G.Công Ngoài': 'Gia công ngoài', 'KVT CCDC': 'Công cụ dụng cụ', 'KVT Vải Da Mouss': 'Vải, da & mút',
};
/**
 * Tên loại gọn cho khách, viết hoa đầu câu thống nhất: bỏ "KVT" / "Kho" đầu, gạch nối => dấu cách, chữ sau viết thường
 * (KVT Tấm-Ván => Tấm ván; KVT Kim Loại => Kim loại; Kho G.Công Ngoài => Gia công ngoài). Viết tắt giữ hoa.
 */
export const tenLoaiGon = (loai: string): string => {
  if (TEN_LOAI_RIENG[loai]) return TEN_LOAI_RIENG[loai];
  const s = loai.replace(/^(KVT|Kho)\s+/i, '').replace(/\s*[-–/]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return loai;
  return hoaDau(s.split(' ').map(t => (VIET_TAT_GIU_HOA.has(t) ? t : t.toLocaleLowerCase('vi'))).join(' '));
};

// ---------------------------------------------------------------------------
// Cửa sổ chi tiết: dòng nhãn, bảng thông số chia nhóm, vật tư cùng loại
// ---------------------------------------------------------------------------
/** Các từ (không dấu, thường) của 1 chuỗi — so trùng nghĩa giữa nhãn / tên */
const tuCua = (s: string): string[] => boDau(s).toLowerCase().replace(/×/g, 'x')
  // 'Φ18MM' = '18 mm': bỏ ký hiệu đường kính, tách số khỏi đơn vị dính liền
  .replace(/[φΦ∅ø]/gu, ' ').replace(/(\d)(mm|cm|m|kg)(?![\p{L}])/gu, '$1 $2')
  .split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Dòng nhãn: Loại · Nhóm · Chủng loại (đã qua tenHienThi). Bỏ rỗng, bỏ mục mà mọi từ đã có trong mục trước
 * ('Da' sau 'Vải da mouss', 'ĐÁ' sau 'Đá'; 'Tấm-Ván' = 'Tấm/ Ván').
 */
export const dongNhanHang = (h: Pick<HangKhach, 'loai' | 'nhomVatTu' | 'thuocTinh'>): string[] => {
  const kq: string[] = [];
  const daCo = new Set<string>();
  for (const s of [tenLoaiGon(h.loai), h.nhomVatTu ?? '', h.thuocTinh.chungLoai ?? '']) {
    const t = tenHienThi(s.trim());
    const tu = tuCua(t);
    if (!t || !tu.length || tu.every(x => daCo.has(x))) continue;
    tu.forEach(x => daCo.add(x));
    kq.push(t);
  }
  return kq;
};

/** Bỏ các mục mô tả mà mọi từ đã có trong tên ('Nero' dưới 'Da 622 Nero') — dòng phụ chỉ giữ thông tin mới */
export const boTrungTen = (ds: string[], ten: string): string[] => {
  const coTrongTen = new Set(tuCua(ten));
  return ds.filter(s => { const tu = tuCua(s); return tu.length > 0 && !tu.every(x => coTrongTen.has(x)); });
};

/**
 * Quy cách chỉ có số (SAP ghi mm, không ghi đơn vị): 'Rộng 3200' => 'Rộng 3200 mm', 'Rộng 1220 × Dài 2440' => '… 2440 mm'.
 * Đã có đơn vị / dạng khác => giữ nguyên.
 */
const QUY_CACH_SO = /^(?:rộng|khổ|dài|dày|cao)\s+\d+(?:[.,]\d+)?(?:\s*[×x]\s*(?:rộng|khổ|dài|dày|cao)\s+\d+(?:[.,]\d+)?)*$/iu;
export const donViQuyCach = (s: string): string => (QUY_CACH_SO.test(s.trim()) ? `${s.trim()}\u00A0mm` : s);

/** Thông số hiện cho khách: bảng đầy đủ nếu máy chủ có, không thì 7 thuộc tính cũ */
export const thongSoHang = (h: Pick<HangKhach, 'thuocTinh' | 'thuocTinhDayDu'>): ThongSoKhach[] => {
  if (h.thuocTinhDayDu && h.thuocTinhDayDu.length) return h.thuocTinhDayDu;
  return DS_THUOC_TINH_KHACH.filter(k => h.thuocTinh[k]).map(k => ({ nhan: NHAN_THUOC_TINH_KHACH[k], giaTri: h.thuocTinh[k] as string }));
};

export type TenNhomThongSo = 'Thông tin chung' | 'Quy cách' | 'Màu & hoàn thiện';
const LA_QUY_CACH = /quy cach|kich thuoc|kich co|\bday\b|do day|\bdai\b|chieu|\brong\b|\bcao\b|duong kinh|trong luong|khoi luong|\bkho\b|size|tiet dien|don vi|\bdvt\b|dung tich|the tich/;
// 'vân' / 'phủ' không xét: bỏ dấu trùng 'Tên tấm / ván', 'Tên phụ kiện' (van / phu)
const LA_MAU = /mau|hoan thien|be mat|\bson\b|do bong|finish|texture/;

/**
 * Chia thông số thành nhóm (ít hơn 6 dòng => 1 nhóm không tiêu đề). Giữ thứ tự gốc trong từng nhóm, bỏ nhóm rỗng.
 * Có nhóm chỉ 1 dòng (hoặc chỉ ra 1 nhóm) => không chia: trả 1 nhóm không tiêu đề (tiêu đề cho 1 dòng chỉ làm rối).
 */
export const nhomThongSo = (ds: ThongSoKhach[]): Array<{ ten: TenNhomThongSo | null; dong: ThongSoKhach[] }> => {
  if (ds.length < 6) return ds.length ? [{ ten: null, dong: ds }] : [];
  const nhom: Record<TenNhomThongSo, ThongSoKhach[]> = { 'Thông tin chung': [], 'Quy cách': [], 'Màu & hoàn thiện': [] };
  for (const t of ds) {
    const n = boDau(t.nhan);
    if (LA_MAU.test(n)) nhom['Màu & hoàn thiện'].push(t);
    else if (LA_QUY_CACH.test(n)) nhom['Quy cách'].push(t);
    else nhom['Thông tin chung'].push(t);
  }
  const coDong = (Object.keys(nhom) as TenNhomThongSo[]).filter(k => nhom[k].length);
  if (coDong.length < 2 || coDong.some(k => nhom[k].length < 2)) return [{ ten: null, dong: ds }];
  return coDong.map(k => ({ ten: k, dong: nhom[k] }));
};

/** Mức phóng tối đa của ô xem ảnh lớn (ảnh to / không rõ kích thước) */
export const PHONG_TOI_DA = 5;
/**
 * Mức phóng tối đa cho ảnh gốc (nw × nh) hiện object-contain trong khung (rw × rh): tới khi 1 điểm ảnh gốc ≈ 2 điểm
 * màn hình, trong khoảng 1,5–5 (ảnh công khai thường nhỏ — phóng 5 lần chỉ thấy vỡ hạt). Thiếu kích thước => 5.
 */
export const mucPhongToiDa = (nw: number, nh: number, rw: number, rh: number): number => {
  if (!(nw > 0 && nh > 0 && rw > 0 && rh > 0)) return PHONG_TOI_DA;
  const tiLe = Math.min(rw / nw, rh / nh);
  return Math.max(1.5, Math.min(PHONG_TOI_DA, 2 / tiLe));
};

/**
 * Vật tư cùng loại (tối đa n): cùng loại, ưu tiên cùng chủng loại rồi cùng nhóm, rồi có ảnh; bỏ chính nó và mã hết hàng.
 * Giữ thứ tự danh sách (mới đăng trước) khi điểm bằng nhau.
 */
export const hangCungLoai = (ds: HangKhach[], h: HangKhach, n = 6): HangKhach[] => {
  const cl = boDau(h.thuocTinh.chungLoai ?? '');
  const nhom = boDau(h.nhomVatTu ?? '');
  return ds
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.ma !== h.ma && x.loai === h.loai && x.soLuong > 0)
    .map(({ x, i }) => ({
      x, i,
      diem: (cl && boDau(x.thuocTinh.chungLoai ?? '') === cl ? 4 : 0)
        + (nhom && boDau(x.nhomVatTu ?? '') === nhom ? 2 : 0)
        + (x.anh.length || x.anhNgoai.length ? 1 : 0),
    }))
    .sort((a, b) => b.diem - a.diem || a.i - b.i)
    .slice(0, n)
    .map(d => d.x);
};

// ---------------------------------------------------------------------------
// Số lượng khách gõ: "12", "12,5", "1.000", "1.000,5", "12.5" (1 dấu chấm + 1–2 số lẻ = thập phân)
// ---------------------------------------------------------------------------
export const docSoLuong = (s: string): number | null => {
  let t = String(s ?? '').replace(/\s+/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Làm tròn 3 số lẻ (tránh 0.1 + 0.2) */
const tron = (n: number) => Math.round(n * 1000) / 1000;
/**
 * Làm tròn TRƯỚC rồi mới chặn theo tồn (ton > 0): tồn có hơn 3 số lẻ (máy chủ giữ tới 6) thì làm tròn sau có thể vượt
 * tồn (12,3456 => 12,346) và giỏ báo sai "Đã giảm theo số lượng còn".
 */
const chanTon = (n: number, ton: number) => (ton > 0 ? Math.min(tron(n), ton) : tron(n));
/** Dung sai so giỏ với tồn: nửa đơn vị làm tròn (giỏ cũ lưu số đã làm tròn lên không bị coi là vượt) */
const DUNG_SAI_TON = 5e-4;

// ---------------------------------------------------------------------------
// Giỏ yêu cầu báo giá: [{ ma, soLuong }] — tên / giá / tồn luôn lấy từ danh sách hiện tại
// ---------------------------------------------------------------------------
export interface DongGio { ma: string; soLuong: number }
export const KHOA_GIO = 'cuaHang_gioYeuCau_v1';
export const TOI_DA_DONG_GIO = 30;

/** Đọc giỏ từ chuỗi JSON đã lưu (hỏng / sai kiểu => giỏ trống; bỏ dòng sai, gộp mã trùng, tối đa 30 dòng) */
export const docGio = (json: string | null | undefined): DongGio[] => {
  if (!json) return [];
  let v: unknown;
  try { v = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(v)) return [];
  const kq: DongGio[] = [];
  for (const d of v) {
    if (!d || typeof d !== 'object') continue;
    const ma = typeof (d as DongGio).ma === 'string' ? (d as DongGio).ma.trim() : '';
    const sl = Number((d as DongGio).soLuong);
    if (!ma || ma.length > 40 || !Number.isFinite(sl) || sl <= 0) continue;
    const cu = kq.find(x => x.ma === ma);
    if (cu) cu.soLuong = tron(cu.soLuong + sl);
    else if (kq.length < TOI_DA_DONG_GIO) kq.push({ ma, soLuong: tron(sl) });
  }
  return kq;
};

/** Thêm mã (đã có => cộng dồn), không vượt tồn; giỏ đầy 30 dòng => giữ nguyên (trả cờ day) */
export const themVaoGio = (gio: DongGio[], ma: string, soLuong: number, ton: number): { gio: DongGio[]; day: boolean } => {
  if (!Number.isFinite(soLuong) || soLuong <= 0) return { gio, day: false };
  const cu = gio.find(d => d.ma === ma);
  if (cu) {
    const sl = chanTon(cu.soLuong + soLuong, ton);
    return { gio: gio.map(d => (d.ma === ma ? { ma, soLuong: sl } : d)), day: false };
  }
  if (gio.length >= TOI_DA_DONG_GIO) return { gio, day: true };
  return { gio: [...gio, { ma, soLuong: chanTon(soLuong, ton) }], day: false };
};

/** Đặt số lượng 1 dòng (≤ 0 / không phải số => xoá dòng; quá tồn => bằng tồn) */
export const datSoLuong = (gio: DongGio[], ma: string, soLuong: number, ton: number): DongGio[] => {
  if (!Number.isFinite(soLuong) || soLuong <= 0) return gio.filter(d => d.ma !== ma);
  const sl = chanTon(soLuong, ton);
  return gio.map(d => (d.ma === ma ? { ma, soLuong: sl } : d));
};

export const xoaKhoiGio = (gio: DongGio[], ma: string): DongGio[] => gio.filter(d => d.ma !== ma);

export interface DongGioHien extends DongGio {
  hang: HangKhach | null;
  /** Mã không còn trên trang (đã bán / gỡ đăng) — không gửi */
  hetHang: boolean;
  /** Số lượng trong giỏ đã vượt tồn mới => đã hạ bằng tồn */
  daHa: boolean;
}

/** Ghép giỏ với danh sách hiện tại: mã đã gỡ => hetHang; số lượng vượt tồn => hạ bằng tồn */
export const gioHien = (gio: DongGio[], theoMa: Map<string, HangKhach>): DongGioHien[] =>
  gio.map(d => {
    const hang = theoMa.get(d.ma) ?? null;
    if (!hang || hang.soLuong <= 0) return { ...d, hang, hetHang: true, daHa: false };
    // Vượt tồn (kể cả trong dung sai làm tròn) => gửi đúng số tồn; chỉ báo "đã giảm" khi vượt thật
    const vuot = d.soLuong > hang.soLuong;
    return { ma: d.ma, soLuong: vuot ? hang.soLuong : d.soLuong, hang, hetHang: false, daHa: d.soLuong > hang.soLuong + DUNG_SAI_TON };
  });

// ---------------------------------------------------------------------------
// Form gửi yêu cầu
// ---------------------------------------------------------------------------
/** SĐT Việt Nam: bỏ khoảng trắng / chấm / gạch / ngoặc, +84 hoặc 84 đầu (11–12 số) => 0; hợp lệ = 9–12 chữ số. Sai => null */
export const chuanSdt = (s: string): string | null => {
  let t = String(s ?? '').replace(/[\s.\-()]/g, '');
  if (t.startsWith('+84')) t = '0' + t.slice(3);
  else if (t.startsWith('0084')) t = '0' + t.slice(4);
  else if (/^84\d{9,10}$/.test(t)) t = '0' + t.slice(2);
  return /^\d{9,12}$/.test(t) ? t : null;
};

export const laEmail = (s: string): boolean => {
  const t = s.trim();
  return t.length <= 200 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(t);
};

export interface FormKhach { ten: string; sdt: string; email: string; congTy: string; ghiChu: string; web: string }
export const FORM_TRONG: FormKhach = { ten: '', sdt: '', email: '', congTy: '', ghiChu: '', web: '' };

export type LoiForm = Partial<Record<'ten' | 'sdt' | 'email' | 'congTy' | 'ghiChu' | 'gio', string>>;

/** Kiểm tra form + giỏ => lỗi theo ô (rỗng = hợp lệ) */
export const kiemTraYeuCau = (f: FormKhach, gio: DongGioHien[]): LoiForm => {
  const loi: LoiForm = {};
  const ten = f.ten.trim();
  if (ten.length < 2) loi.ten = 'Vui lòng nhập họ tên (ít nhất 2 ký tự)';
  else if (ten.length > 100) loi.ten = 'Họ tên tối đa 100 ký tự';
  if (!f.sdt.trim()) loi.sdt = 'Vui lòng nhập số điện thoại';
  else if (!chuanSdt(f.sdt)) loi.sdt = 'Số điện thoại chưa đúng (9–12 chữ số, ví dụ 0912 345 678)';
  if (f.email.trim() && !laEmail(f.email)) loi.email = 'Email chưa đúng định dạng';
  if (f.congTy.trim().length > 200) loi.congTy = 'Tên công ty tối đa 200 ký tự';
  if (f.ghiChu.trim().length > 1000) loi.ghiChu = 'Ghi chú tối đa 1.000 ký tự';
  const conHang = gio.filter(d => !d.hetHang && d.soLuong > 0);
  if (!conHang.length) loi.gio = 'Chưa có vật tư nào trong yêu cầu';
  else if (conHang.length > TOI_DA_DONG_GIO) loi.gio = `Mỗi yêu cầu tối đa ${TOI_DA_DONG_GIO} mã`;
  return loi;
};

/** Thân gửi máy chủ: chỉ mã còn hàng, chữ đã cắt khoảng trắng, ô trống không gửi */
export const dungBodyYeuCau = (f: FormKhach, gio: DongGioHien[]): BodyYeuCau => {
  const body: BodyYeuCau = {
    items: gio.filter(d => !d.hetHang && d.soLuong > 0).slice(0, TOI_DA_DONG_GIO).map(d => ({ ma: d.ma, soLuong: d.soLuong })),
    ten: f.ten.trim().replace(/\s+/g, ' '),
    sdt: chuanSdt(f.sdt) ?? f.sdt.trim(),
    web: f.web,
  };
  if (f.email.trim()) body.email = f.email.trim();
  if (f.congTy.trim()) body.congTy = f.congTy.trim();
  if (f.ghiChu.trim()) body.ghiChu = f.ghiChu.trim();
  return body;
};

// ---------------------------------------------------------------------------
// PHÂN TRANG (người dùng 15/11/2026: lưới trang khách dùng phân trang thay vì cuộn hiện thêm)
// ---------------------------------------------------------------------------
export const MA_MOI_TRANG = 30; // chia hết cho 2, 3, 5, 6 cột: hàng cuối luôn đầy (15/11/2026: lưới 5–6 cột)

export const soTrang = (tong: number, moiTrang = MA_MOI_TRANG): number => Math.max(1, Math.ceil(tong / moiTrang));

/**
 * Nút số trang: luôn có trang đầu, trang cuối, trang hiện tại ± 1; khoảng trống thay bằng '…'.
 * Ví dụ (trang 7 / 14) => [1, '…', 6, 7, 8, '…', 14]; ≤ 7 trang thì hiện đủ.
 */
export const dsNutTrang = (trang: number, tongTrang: number): Array<number | '…'> => {
  if (tongTrang <= 7) return Array.from({ length: tongTrang }, (_, i) => i + 1);
  const giu = new Set([1, tongTrang, trang - 1, trang, trang + 1]);
  if (trang <= 3) [2, 3, 4].forEach(n => giu.add(n));
  if (trang >= tongTrang - 2) [tongTrang - 3, tongTrang - 2, tongTrang - 1].forEach(n => giu.add(n));
  const so = [...giu].filter(n => n >= 1 && n <= tongTrang).sort((a, b) => a - b);
  const kq: Array<number | '…'> = [];
  so.forEach((n, i) => {
    if (i > 0 && n - so[i - 1] > 1) kq.push(n - so[i - 1] === 2 ? n - 1 : '…');
    kq.push(n);
  });
  return kq;
};

// ---------------------------------------------------------------------------
// ẢNH
// ---------------------------------------------------------------------------
/** Có ảnh (ước lượng: ảnh nội bộ đã bật công khai hoặc link ảnh ngoài — link không phải ảnh trực tiếp vẫn tính) */
export const coAnh = (h: Pick<HangKhach, 'anh' | 'anhNgoai'>): boolean => h.anh.length > 0 || h.anhNgoai.length > 0;

/** Cạnh dài tối thiểu (px) để ảnh làm ảnh bìa */
export const CANH_ANH_TOI_THIEU = 120;
/**
 * Ảnh không hợp làm ảnh bìa: quá dẹt / quá dài (cạnh dài / cạnh ngắn > 3, vd 443×46 — ảnh chụp dải nhãn) hoặc quá nhỏ.
 * Chưa biết kích thước => coi là hợp lệ.
 */
export const laAnhDet = (w: number, h: number): boolean => {
  if (!(w > 0 && h > 0)) return false;
  return Math.max(w, h) / Math.min(w, h) > 3 || Math.max(w, h) < CANH_ANH_TOI_THIEU;
};

/** Xếp ảnh: ảnh dẹt / quá nhỏ (đã biết kích thước) xuống cuối, còn lại giữ thứ tự gốc */
export const xepAnhHopLe = (ds: string[], kichThuoc: ReadonlyMap<string, { w: number; h: number }>): string[] => {
  const det = (u: string) => { const k = kichThuoc.get(u); return k ? laAnhDet(k.w, k.h) : false; };
  return [...ds.filter(u => !det(u)), ...ds.filter(det)];
};

/** 3 bước mua (cửa sổ chi tiết "Cách mua" + chân trang máy tính) */
export const BUOC_MUA = [
  'Bấm nút + trên vật tư (hoặc "Thêm vào yêu cầu" trong trang chi tiết) — chọn được nhiều mã.',
  'Mở giỏ "Yêu cầu báo giá", điền tên và số điện thoại rồi gửi.',
  'Nhân viên AA gọi lại xác nhận số lượng, giá và cách giao hàng.',
] as const;
/** 3 bước mua rút gọn (chân trang: 1 hàng chữ nhỏ) */
export const BUOC_MUA_GON = ['Chọn vật tư cần mua', 'Gửi yêu cầu báo giá', 'AA gọi lại xác nhận'] as const;

// ---------------------------------------------------------------------------
// TÊN HIỂN THỊ: tên SAP CHỮ HOA => Chữ Hoa Đầu Từ, giữ mã / số / viết tắt. Chỉ để hiển thị — tìm kiếm, alt, giỏ, gửi
// vẫn dùng tên gốc.
// ---------------------------------------------------------------------------
/** Viết tắt luôn giữ chữ hoa (sửa được) */
export const VIET_TAT_GIU_HOA: ReadonlySet<string> = new Set([
  'AA', 'MDF', 'HDF', 'MFC', 'HPL', 'PVC', 'PU', 'PE', 'PP', 'ABS', 'CNC', 'LED', 'UV', 'SPC', 'WPC', 'CDF', 'SDC', 'PS', 'PET',
  'ACP', 'INOX', 'SUS', 'MM', 'CM', 'M', 'KG', 'RAL', 'NCS',
]);
const TU_NOI = new Set(['và', 'của', 'cho', 'có', 'với', 'dùng', 'loại']);

const hoaDau = (s: string) => s.charAt(0).toLocaleUpperCase('vi') + s.slice(1);

/** 1 đoạn chữ cái liền (không số): viết tắt / toàn phụ âm 2–4 ký tự => giữ hoa; còn lại => Hoa đầu */
const doiDoanChu = (s: string): string => {
  if (VIET_TAT_GIU_HOA.has(s) || /^(II|III|IV)$/.test(s)) return s; // số La Mã (Carola II) giữ hoa
  if (s.length >= 2 && s.length <= 4 && !/[aeiouy]/i.test(boDau(s))) return s;
  return hoaDau(s.toLocaleLowerCase('vi'));
};

/** Số + đơn vị dính liền (6MM, 1.4M, 20KG) => '6 mm' như dòng thuộc tính */
const SO_DON_VI = /^([ΦØ∅]?)(\d+(?:[.,]\d+)?)(MM|CM|M|KG)$/; // Φ18MM => Φ18 mm

/** 1 mảnh giữa các dấu '-' / '/': số + đơn vị => tách; có chữ số => mã, giữ nguyên (1200X2400 => 1200×2400); còn lại đổi từng đoạn chữ */
const doiManh = (m: string): string => {
  const dv = SO_DON_VI.exec(m);
  if (dv) return `${dv[1]}${dv[2]} ${dv[3].toLowerCase()}`;
  if (/\d/.test(m)) return m.replace(/(\d)X(?=\d)/g, '$1×');
  return m.replace(/\p{L}+/gu, doiDoanChu);
};

/** Bỏ chữ loại ở đầu tên (thẻ đã có nhãn loại): 'ĐÁ CALACATTA' + loại Đá => 'CALACATTA'. Không bỏ nếu chỉ còn số / rỗng */
const boLoaiDau = (ten: string, loai: string): string => {
  const khoa = (s: string) => boDau(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tuLoai = khoa(tenLoaiGon(loai)).split(' ').filter(Boolean);
  const tu = ten.split(/\s+/).filter(Boolean);
  if (!tuLoai.length || tu.length <= tuLoai.length) return ten;
  if (tuLoai.some((t, i) => khoa(tu[i]) !== t)) return ten;
  const con = tu.slice(tuLoai.length);
  return con.some(t => /\p{L}{2,}/u.test(t)) ? con.join(' ') : ten;
};

/**
 * Tên hiển thị: '_' => dấu cách. Chuỗi gốc đã có chữ thường => giữ nguyên; toàn chữ hoa => từng từ (tách tiếp theo '-' / '/'):
 * số + đơn vị => '6 mm', có chữ số giữ nguyên (mã, 1200X2400 => 1200×2400), viết tắt / toàn phụ âm 2–4 ký tự giữ hoa,
 * từ nối viết thường (trừ đầu tên), còn lại Hoa Đầu Từ ('DA_419' => 'Da 419'; '217-PEATMOOS' => '217-Peatmoos').
 * loai: bỏ chữ loại trùng ở đầu tên (dùng cho mọi chỗ hiện tên cho khách => thẻ / chi tiết / giỏ / thông báo cùng 1 tên).
 */
export const tenHienThi = (ten: string, loai?: string): string => {
  const goc = String(ten ?? '').replace(/Ð/g, 'Đ').replace(/ð/g, 'đ').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  const s = loai ? boLoaiDau(goc, loai) : goc;
  if (!s) return s;
  if (s !== s.toLocaleUpperCase('vi')) return s === goc ? s : hoaDau(s);
  return s.split(' ').map((tu, i) => {
    const thuong = tu.toLocaleLowerCase('vi');
    if (i > 0 && TU_NOI.has(thuong)) return thuong;
    return tu.split(/([-/])/).map(m => (m === '-' || m === '/' ? m : doiManh(m))).join('');
  }).join(' ');
};

/** Đuôi đơn vị SAP ở cuối tên: "(M2)", "(M)", "(KG)", "(Cái)"… — đơn vị đã có ở dòng "Còn …" */
const DUOI_DON_VI = /(\s*\((?:m|m2|m3|md|kg|g|cái|cai|tấm|tam|bộ|bo|cuộn|cuon|hộp|hop|thanh|lít|lit|tờ|to|sợi|soi|đôi|doi|pcs|set)\))+$/iu;

/** Đoạn khổ vải nối bằng ' -', '-', '_' ('SESAME -KHỔ 3.2M', '26-KHỔ 1.4M', '_KHỔ 1.35M') => ' · KHỔ' (giữ hoa / thường gốc) */
const NOI_KHO = /\s*[-_]+\s*(kh[oổ])(?=\s*\d)/giu;
/** Số + đơn vị (sau tenHienThi: '3.2 m', '1.4 M', '18 mm') => khoảng trắng không ngắt — đơn vị không rơi xuống dòng riêng */
const SO_CACH_DON_VI = /(\d)\s+(mm|cm|m|kg)(?![\p{L}\p{N}])/giu;

/**
 * Tên cho khách: tenHienThi (giữ chữ loại ở đầu — "Đá nung kết…" mới đủ nghĩa) + bỏ đuôi đơn vị SAP. Bỏ xong rỗng => giữ.
 * Khổ vải tách bằng ' · ' và 'Khổ 3.2 m' không ngắt dòng giữa chừng.
 */
export const tenHienThiKhach = (ten: string): string => {
  const goc = String(ten ?? '').trim();
  const bo = goc.replace(DUOI_DON_VI, '').trim() || goc;
  return tenHienThi(bo.replace(NOI_KHO, ' · $1'))
    .replace(SO_CACH_DON_VI, '$1\u00A0$2')
    .replace(/(kh[oổ])\s+(?=\d)/giu, '$1\u00A0');
};

/**
 * Nhãn thông số cho khách: tên trường SAP gộp nhiều loại ("Tên đá / kính", "Tên vải / da / mây", "Tên tấm / ván")
 * => "Tên mẫu". Nhãn khác giữ nguyên.
 */
export const nhanThongSoKhach = (nhan: string): string => (/^tên\s.*\//iu.test(nhan.trim()) ? 'Tên mẫu' : nhan);

/**
 * Bảng thông số hiện ở cửa sổ chi tiết: đổi nhãn SAP khó hiểu, bỏ dòng "Chủng loại" trùng loại đã hiện ở đầu cửa sổ
 * ("Chủng loại: Đá" trong loại Đá), bỏ nhãn trùng sau khi đổi.
 */
export const thongSoHien = (h: Pick<HangKhach, 'loai' | 'thuocTinh' | 'thuocTinhDayDu'>): ThongSoKhach[] => {
  const daCo = new Set<string>();
  const kq: ThongSoKhach[] = [];
  for (const t of thongSoHang(h)) {
    const nhan = nhanThongSoKhach(t.nhan);
    // "Chủng loại" giữ lại kể cả trùng loại (15/11/2026: bảng thông số không được thiếu dòng)
    const khoa = nhan.toLowerCase();
    if (daCo.has(khoa)) continue;
    daCo.add(khoa);
    kq.push({ nhan, giaTri: donViQuyCach(t.giaTri) });
  }
  return kq;
};

/**
 * Cách đặt ảnh vào khung (thẻ, ô nhỏ): 'cat' = phủ kín (object-cover, neo đáy + phóng nhẹ cắt phiếu nhãn),
 * 'tron' = hiện trọn ảnh trên nền trung tính (object-contain) khi phủ kín phải kéo ảnh quá `toiDaKeo` lần
 * (ảnh 443×46 cắt vuông bị phóng hàng chục lần) hoặc ảnh quá dẹt / quá dài (tỉ lệ ngoài 1:3…3:1).
 */
export const cachDatAnh = (nw: number, nh: number, kw: number, kh: number, toiDaKeo = 2.5): 'cat' | 'tron' => {
  if (!(nw > 0 && nh > 0 && kw > 0 && kh > 0)) return 'cat';
  const tiLe = nw / nh;
  if (tiLe > 3 || tiLe < 1 / 3) return 'tron';
  return Math.max(kw / nw, kh / nh) > toiDaKeo ? 'tron' : 'cat';
};
