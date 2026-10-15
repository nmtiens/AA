// ============================================================================
// MÀN TỔ TRƯỞNG MỤC XƯỞNG — phần tính toán thuần (không React, có test: xuongModel.test.ts)
// Thiết kế: docs/designs/xuong-checkin.md — mục Design Review (Pass 1–3) và quy tắc đo.
// Mọi giờ tính theo Asia/Ho_Chi_Minh (UTC+7, không đổi giờ mùa) — khớp backend/src/server/xuong/allocation.ts.
// ============================================================================

export type LoaiCa = 'chinh' | 'ca1' | 'ca2' | 'ca3' | 'ca4' | 'chu_nhat';
export const LOAI_CA_TANG_CA: LoaiCa[] = ['ca1', 'ca2', 'ca3', 'ca4', 'chu_nhat'];
export const TEN_CA: Record<LoaiCa, string> = {
  chinh: 'Ca chính', ca1: 'Ca 1', ca2: 'Ca 2', ca3: 'Ca 3', ca4: 'Ca 4', chu_nhat: 'Chủ nhật',
};

/** Mã lý do tạm ngưng — đúng CHECK của xuong_su_kien.ly_do_tam_ngung */
export const LY_DO_TAM_NGUNG = [
  { ma: 'thieu_vat_tu', ten: 'Thiếu vật tư' },
  { ma: 'cho_ban_ve_duyet', ten: 'Chờ bản vẽ duyệt' },
  { ma: 'loi_chat_luong', ten: 'Lỗi chất lượng' },
  { ma: 'chuyen_viec_gap', ten: 'Chuyển việc gấp' },
  { ma: 'lenh_cap_tren', ten: 'Lệnh cấp trên' },
  { ma: 'khac', ten: 'Khác' },
] as const;
export type MaLyDo = typeof LY_DO_TAM_NGUNG[number]['ma'];
export const tenLyDo = (ma: string | null | undefined) => LY_DO_TAM_NGUNG.find(x => x.ma === ma)?.ten ?? 'Khác';

export interface LichCa { loaiCa: LoaiCa; gioBatDau: string; gioKetThuc: string; nghi?: Array<[string, string]> | null }

export type TrangThai = 'cho_nhan' | 'da_nhan' | 'dang_lam' | 'tam_ngung' | 'cho_giao' | 'xong';

/** Một dòng (hạng mục, công đoạn) — đúng hình dạng GET /api/xuong/cong-viec */
export interface DongViec {
  hex: string;
  congDoanId: string;
  trangThai: TrangThai;
  slGiaoDen: number;
  slNhan: number;
  slHoanThanh: number;
  slGiao: number;
  soNguoi: number | null;
  dangChayTu: string | null;
  suKienCuoi: string | null;
  /** Tạm ngưng: lý do + lúc ngưng (API cong-viec) */
  ngung?: { lyDo: string | null; tu: string } | null;
  co: string[];
  tenHangMuc: string | null;
  maCongTrinh: string | null;
  tenCongTrinh: string | null;
  dvt: string | null;
  goiYKe: string[];
  /** Công đoạn cuối tuyến: Xong là hết (không giao tiếp, không vào Chờ giao) */
  cuoiTuyen?: boolean;
  /** Mã NV người đang làm (khai theo tên — chấm công theo người); null = khai theo số */
  nguoi?: string[] | null;
  /** Chờ nhận: số còn nhận được (đã triển khai / đơn hàng − đã nhận); null = không giới hạn */
  toiDaNhan?: number | null;
}

/** Công nhân trong danh sách tổ (toKhac = tên tổ gốc khi là người mượn hôm nay) */
export interface CongNhanTo { mnv: string; hoTen: string; toKhac: string | null }
/** Một lần có mặt trong ca (ms); ra = null: vẫn đang có mặt */
export interface CoMatNguoi { mnv: string; vao: number; ra: number | null }

export interface CongViec {
  ngay: string;
  serverNow: number;
  to: { id: number; xuong: string | null; ten: string | null };
  congDoan: Array<{ id: string; ten: string; xuong: string }>;
  choNhan: DongViec[];
  dangLam: DongViec[];
  choGiao: DongViec[];
  quanSo: Partial<Record<LoaiCa, number>>;
  tangCa: LoaiCa[];
  quanSoTruoc: Partial<Record<LoaiCa, number>>;
  soNguoiTangCaTruoc: number | null;
  /** Máy chủ đã bật chấm công theo người (backend/sql/2026-10-13_xuong_cham_cong.sql) */
  chamCong?: boolean;
  congNhan?: CongNhanTo[];
  /** Điểm danh hôm nay theo loại ca */
  coMat?: Partial<Record<LoaiCa, CoMatNguoi[]>>;
  daXacNhanHomNay: boolean;
  lichCa: LichCa[];
  /** Máy chủ đã cấu hình kho ảnh (R2) */
  anhBat?: boolean;
}

export const khoa = (hex: string, congDoanId: string) => `${hex}|${congDoanId}`;
export const khoaDong = (d: Pick<DongViec, 'hex' | 'congDoanId'>) => khoa(d.hex, d.congDoanId);

// ---------------------------------------------------------------------------
// Giờ Việt Nam
// ---------------------------------------------------------------------------
const VN_MS = 7 * 3_600_000;

/** Ngày 'YYYY-MM-DD', phút trong ngày và thứ (0 = Chủ nhật) theo giờ Việt Nam */
export function gioVN(now: number): { ngay: string; phut: number; thu: number } {
  const d = new Date(now + VN_MS);
  return {
    ngay: d.toISOString().slice(0, 10),
    phut: d.getUTCHours() * 60 + d.getUTCMinutes(),
    thu: d.getUTCDay(),
  };
}

const phutCua = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** 'HH:MM' giờ Việt Nam của một mốc ms */
export const hhmm = (ms: number) => {
  const p = gioVN(ms).phut;
  return `${String(Math.floor(p / 60)).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`;
};

/** Mốc ms của 'HH:MM' trong ngày 'YYYY-MM-DD' (giờ Việt Nam) */
export const mocTrongNgay = (ngay: string, gio: string) => Date.parse(`${ngay}T${gio.slice(0, 5)}:00+07:00`);

/**
 * Ca cần chốt quân số lúc này (3A): ngày thường, trước khi hết ca chính → ca chính;
 * sau đó (hoặc Chủ nhật) → ca tăng ca tổ đã khai mà giờ hiện tại nằm trong / trước ca đó.
 * null = không có ca nào cần chốt (đã chốt hết, hoặc ngoài giờ làm).
 */
export function caCanChot(cv: Pick<CongViec, 'quanSo' | 'tangCa' | 'lichCa'>, now: number): LoaiCa | null {
  const { phut, thu } = gioVN(now);
  const ca = (l: LoaiCa) => cv.lichCa.find(x => x.loaiCa === l);
  const chua = (l: LoaiCa) => typeof cv.quanSo[l] !== 'number';
  const chinh = ca('chinh');
  if (thu !== 0 && chinh && phut < phutCua(chinh.gioKetThuc)) return chua('chinh') ? 'chinh' : null;
  for (const l of LOAI_CA_TANG_CA) {
    if (!cv.tangCa.includes(l)) continue;
    const c = ca(l);
    if (!c) continue;
    const bd = phutCua(c.gioBatDau);
    let kt = phutCua(c.gioKetThuc);
    if (kt <= bd) kt += 24 * 60;
    if (phut < kt && chua(l)) return l;
  }
  return null;
}

/** Ca đang tính quân số lúc này: ca cần chốt, nếu không thì ca gần nhất đã chốt trong ngày */
export function caHienTai(cv: Pick<CongViec, 'quanSo' | 'tangCa' | 'lichCa'>, now: number): LoaiCa | null {
  const can = caCanChot(cv, now);
  if (can) return can;
  const { phut, thu } = gioVN(now);
  const ds: LoaiCa[] = thu === 0 ? [] : ['chinh'];
  ds.push(...LOAI_CA_TANG_CA.filter(l => cv.tangCa.includes(l)));
  let chon: LoaiCa | null = null;
  for (const l of ds) {
    const c = cv.lichCa.find(x => x.loaiCa === l);
    if (c && phutCua(c.gioBatDau) <= phut) chon = l;
  }
  return chon ?? (ds[0] ?? null);
}

/** Từ 15h30 nhắc xác nhận cuối ngày (3C) */
export const denGioXacNhan = (now: number) => gioVN(now).phut >= 15 * 60 + 30;

// ---------------------------------------------------------------------------
// Danh sách & người
// ---------------------------------------------------------------------------
/** Tab Đang làm chia 3 nhóm (1B); đang chạy: chạy lâu nhất trước */
export function nhomDangLam(rows: DongViec[]) {
  const t = (s: string | null) => (s ? Date.parse(s) : Number.MAX_SAFE_INTEGER);
  return {
    dangChay: rows.filter(r => r.trangThai === 'dang_lam').sort((a, b) => t(a.dangChayTu) - t(b.dangChayTu)),
    tamNgung: rows.filter(r => r.trangThai === 'tam_ngung').sort((a, b) => t(a.suKienCuoi) - t(b.suKienCuoi)),
    chuaBatDau: rows.filter(r => r.trangThai === 'da_nhan').sort((a, b) => t(a.suKienCuoi) - t(b.suKienCuoi)),
  };
}

/** Số người chưa được giao hạng mục nào (3D). null = ca chưa chốt quân số */
export function soNguoiRanh(quanSo: number | undefined, dangChay: DongViec[]): number | null {
  if (typeof quanSo !== 'number') return null;
  return Math.max(0, quanSo - dangChay.reduce((a, r) => a + (r.soNguoi ?? 0), 0));
}

/** Chia đều `tong` người cho các khoá; phần dư cho các khoá đầu (chạy lâu nhất) */
export function chiaDeu(tong: number, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!keys.length) return out;
  const moi = Math.floor(tong / keys.length);
  let du = tong - moi * keys.length;
  for (const k of keys) { out[k] = moi + (du > 0 ? 1 : 0); if (du > 0) du--; }
  return out;
}

/** Trạng thái theo số lượng — cùng thứ ưu tiên với backend/src/server/xuong/state.ts */
export function trangThaiTheoSo(r: Omit<DongViec, 'trangThai'> & { trangThai?: TrangThai }): TrangThai {
  if (r.dangChayTu) return 'dang_lam';
  if (r.trangThai === 'tam_ngung') return 'tam_ngung';
  if (r.slHoanThanh > r.slGiao && !r.cuoiTuyen) return 'cho_giao';
  if (r.slNhan > r.slHoanThanh) return 'da_nhan';
  if (r.slGiaoDen > r.slNhan) return 'cho_nhan';
  return r.slNhan > 0 || r.slGiao > 0 ? 'xong' : 'cho_nhan';
}

/**
 * Đổi một dòng ngay trên máy sau khi bấm (màn đổi ngay, "Chờ gửi" tới khi server nhận — 2A),
 * rồi chia lại 3 tab. `doi` trả dòng mới (có thể đặt trangThai 'tam_ngung'); dòng chưa có thì tạo từ `moi`.
 */
export function apDung(cv: CongViec, key: string, doi: (r: DongViec) => DongViec, moi?: DongViec): CongViec {
  const theoKhoa = new Map<string, DongViec>();
  for (const r of [...cv.choNhan, ...cv.dangLam, ...cv.choGiao]) theoKhoa.set(khoaDong(r), r);
  const cu = theoKhoa.get(key) ?? moi;
  if (cu) {
    const r = doi(cu);
    theoKhoa.set(key, { ...r, trangThai: trangThaiTheoSo(r) });
  }
  const ds = [...theoKhoa.values()];
  return {
    ...cv,
    choNhan: ds.filter(r => r.slGiaoDen > r.slNhan),
    dangLam: ds.filter(r => ['dang_lam', 'tam_ngung', 'da_nhan'].includes(r.trangThai)),
    choGiao: ds.filter(r => r.slHoanThanh > r.slGiao && !r.cuoiTuyen),
  };
}

/** Số lượng điền sẵn khi Xong (còn đang làm) và khi Giao (đã xong chưa giao) */
// ---------------------------------------------------------------------------
// Số lượng theo đơn vị của hạng mục: đơn vị đo (m², m³, mét dài, kg…) hoặc số lượng có phần lẻ => nhập số lẻ
// (tối đa 3 chữ số sau dấu phẩy); đơn vị đếm (cái, bộ, chiếc…) => số nguyên
// ---------------------------------------------------------------------------
const DVT_DEM = /^(cái|cai|bộ|bo|chiếc|chiec|cây|cay|tấm|tam|hộp|hop|thùng|thung|cuộn|cuon|kiện|kien|pcs|pc|set|ea|unit)$/i;
export const choSoLe = (dvt: string | null | undefined, ...soLuong: Array<number | null | undefined>): boolean =>
  soLuong.some(x => typeof x === 'number' && !Number.isInteger(lamTronSl(x))) || (!!dvt && !!dvt.trim() && !DVT_DEM.test(dvt.trim()));
/** Làm tròn 3 chữ số lẻ (khử sai số cộng trừ số thực) */
export const lamTronSl = (n: number): number => Math.round(n * 1000) / 1000;
/** Hiển thị số lượng kiểu Việt Nam: 74,255 */
export const hienSl = (n: number): string => lamTronSl(n).toLocaleString('vi-VN', { maximumFractionDigits: 3 });

export const slConLam = (r: DongViec) => Math.max(0, r.slNhan - r.slHoanThanh);
export const slChoGiao = (r: DongViec) => Math.max(0, r.slHoanThanh - r.slGiao);
export const slChoNhan = (r: DongViec) => Math.max(0, r.slGiaoDen - r.slNhan);

/** Lấy mã hạng mục 9 số từ nội dung QR (QR có thể là mã trần hoặc đường dẫn chứa mã) */
export function trichHex(text: string): string | null {
  const m = /(?:^|\D)(\d{9})(?!\d)/.exec(text.trim());
  return m ? m[1] : null;
}

/** "2 giờ 15 phút" / "40 phút" */
export function thoiLuong(ms: number): string {
  const p = Math.max(0, Math.floor(ms / 60_000));
  const g = Math.floor(p / 60);
  if (!g) return `${p} phút`;
  return p % 60 ? `${g} giờ ${p % 60} phút` : `${g} giờ`;
}

/** "Đang chạy từ lúc nào": cùng ngày (giờ VN) → thời lượng ("2 giờ 5 phút");
 *  từ hôm trước → "từ 13/10 08:00" (thời lượng đồng hồ tính cả đêm dễ hiểu nhầm là giờ làm) */
export function chayTu(iso: string, now: number): string {
  const vn = (t: number) => new Date(t + 7 * 3_600_000).toISOString();
  const tu = vn(Date.parse(iso));
  if (tu.slice(0, 10) === vn(now).slice(0, 10)) return thoiLuong(now - Date.parse(iso));
  return `từ ${tu.slice(8, 10)}/${tu.slice(5, 7)} ${tu.slice(11, 16)}`;
}

/** Cờ tổ trưởng tự sửa được (2B) — câu cụ thể; cờ khác chỉ quản lý thấy */
export function cauCo(co: string, r: DongViec): string | null {
  switch (co) {
    case 'nhan_chua_thay_giao': return `Chưa thấy tổ trước giao ${hienSl(Math.max(0, r.slNhan - r.slGiaoDen))} ${r.dvt?.trim() || 'cái'}`;
    case 'bat_dau_hai_lan': return 'Bấm bắt đầu 2 lần — kiểm tra lại';
    case 'chua_xac_nhan': return 'Hôm qua chưa xác nhận cuối ngày';
    case 'khai_vuot_quan_so': return 'Số người khai nhiều hơn quân số tổ';
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Mô tả một sự kiện bằng chữ (Lịch sử hôm nay, nhật ký hạng mục)
// ---------------------------------------------------------------------------
const TEN_LOAI: Record<string, string> = {
  nhan: 'Nhận', bat_dau: 'Bắt đầu', tam_ngung: 'Tạm ngưng', tiep_tuc: 'Tiếp tục', hoan_thanh: 'Xong', giao: 'Giao',
  tang_ca: 'Khai tăng ca', chia_nguoi: 'Chia người', quan_so: 'Chốt quân số', xac_nhan_cuoi_ngay: 'Xác nhận cuối ngày',
  tien_do: 'Tiến độ', trien_khai: 'Triển khai', khai_bao_cd: 'Khai báo công đoạn',
  vao_ca: 'Điểm danh', ra_ca: 'Ra ca', huy: 'Huỷ thao tác',
};

export function moTaSuKien(x: { loai: string; soLuong?: number | null; soNguoi?: number | null; lyDo?: string | null; tenCongDoanDen?: string | null; duLieu?: Record<string, unknown> | null; dvt?: string | null }) {
  const p: string[] = [TEN_LOAI[x.loai] ?? x.loai];
  if (x.soLuong) p.push(`${hienSl(Number(x.soLuong))} ${x.dvt?.trim() || 'cái'}`);
  if (x.tenCongDoanDen) p.push(`sang ${x.tenCongDoanDen}`);
  if (x.loai === 'tam_ngung') p.push(`— ${tenLyDo(x.lyDo)}`);
  // Điểm danh: "Điểm danh ca chính · 8 người vào" / "Ra ca chính · 2 người (về sớm)" (trước hiện mã thô vao_ca)
  if (x.loai === 'vao_ca' || x.loai === 'ra_ca') {
    const ca = x.duLieu?.loaiCa as LoaiCa | undefined;
    if (ca && TEN_CA[ca]) p.push(TEN_CA[ca].toLowerCase());
    const ds = Array.isArray(x.duLieu?.nguoi) ? (x.duLieu!.nguoi as Array<{ lyDo?: string }>) : [];
    if (ds.length) p.push(`· ${ds.length} người ${x.loai === 'vao_ca' ? 'vào' : 'ra'}`);
    const ly = x.loai === 'ra_ca' ? [...new Set(ds.map(d => d?.lyDo).filter(Boolean))] : [];
    const TEN_RA: Record<string, string> = { ve_som: 'về sớm', nghi_giua_ca: 'nghỉ giữa ca', chuyen_to: 'sang tổ khác', vang: 'vắng' };
    if (ly.length) p.push(`(${ly.map(l => TEN_RA[l as string] ?? l).join(', ')})`);
    return p.join(' ');
  }
  if (x.loai === 'quan_so' || x.loai === 'tang_ca') {
    const ca = x.duLieu?.loaiCa as LoaiCa | undefined;
    if (ca && TEN_CA[ca]) p.push(TEN_CA[ca].toLowerCase());
    const n = (x.duLieu?.soNguoi as number | undefined) ?? x.soNguoi;
    if (typeof n === 'number') p.push(`${n} người`);
  } else if (x.soNguoi) p.push(`${x.soNguoi} người`);
  if (x.loai === 'tien_do' && typeof x.duLieu?.tienDo === 'number') p.push(`${x.duLieu.tienDo}%`);
  return p.join(' ');
}

/** Tên các cờ cần xem (backend: state.ts, clock.ts, routes/xuong.ts) — dùng ở màn quản lý */
export const TEN_CO: Record<string, string> = {
  chua_do_lech: 'Máy chưa đo lệch giờ',
  lech_dong_ho_lon: 'Đồng hồ máy lệch hơn 5 phút',
  doi_gio_may: 'Máy bị đổi giờ giữa chừng',
  gio_tuong_lai: 'Giờ bấm ở tương lai',
  gui_ho: 'Gửi hộ người khác trên cùng máy',
  tac_gia_khong_xac_minh: 'Không xác minh được người bấm',
  nhan_chua_thay_giao: 'Nhận khi chưa thấy tổ trước giao',
  nhan_vuot_trien_khai: 'Nhận vượt số lượng triển khai',
  thieu_so_nguoi: 'Bắt đầu chưa khai số người',
  bat_dau_hai_lan: 'Bắt đầu 2 lần',
  tam_ngung_khi_khong_chay: 'Tạm ngưng khi không chạy',
  tiep_tuc_khi_chua_tam_ngung: 'Tiếp tục khi chưa tạm ngưng',
  hoan_thanh_chua_bat_dau: 'Xong khi chưa bắt đầu',
  giao_vuot_hoan_thanh: 'Giao nhiều hơn số đã xong',
  hoan_thanh_vuot_nhan: 'Xong nhiều hơn số đã nhận',
  chua_xac_nhan: 'Chưa xác nhận cuối ngày',
  khai_vuot_quan_so: 'Khai nhiều người hơn quân số',
  quan_ly_ghi_ho: 'Quản lý ghi hộ tổ',
  chua_chot_quan_so: 'Chưa chốt quân số',
  khai_bu: 'Khai bù ngày trước (chọn ngày thực hiện)',
};
export const tenCo = (c: string) => TEN_CO[c] ?? c;

// ---------------------------------------------------------------------------
// Chấm công theo người (docs/designs/xuong-cham-cong.md)
// ---------------------------------------------------------------------------
/** Mã NV đang có mặt trong ca lúc `now` (điểm danh sớm trước giờ vào ca — giờ vào ở tương lai — vẫn tính có mặt) */
export function coMatLuc(cv: Pick<CongViec, 'coMat'>, ca: LoaiCa | null, now: number): string[] {
  if (!ca) return [];
  const ds = cv.coMat?.[ca] ?? [];
  return [...new Set(ds.filter(x => x.ra === null || x.ra > now).map(x => x.mnv))];
}

/** Ca này đã điểm danh theo tên chưa */
export const daDiemDanh = (cv: Pick<CongViec, 'coMat'>, ca: LoaiCa | null) => !!ca && (cv.coMat?.[ca]?.length ?? 0) > 0;

/** Người đang gắn vào các hạng mục chạy khác (mnv → hex) */
export function nguoiDangBan(dangChay: DongViec[], boQua?: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of dangChay) {
    if (boQua && khoaDong(r) === boQua) continue;
    for (const m of r.nguoi ?? []) out.set(m, r.hex);
  }
  return out;
}

/** Tên gọn để hiện trên chip / dòng: "Nguyễn Văn An" → "An", trùng tên thì thêm đuôi mã */
export function tenGon(mnv: string, ds: CongNhanTo[]): string {
  const c = ds.find(x => x.mnv === mnv);
  if (!c || !c.hoTen || c.hoTen === mnv) return mnv;
  const ten = c.hoTen.trim().split(/\s+/).pop()!;
  const trung = ds.filter(x => x.hoTen.trim().split(/\s+/).pop() === ten).length > 1;
  return trung ? `${ten} ${mnv.slice(-3)}` : ten;
}

/** Áp kết quả điểm danh vào bản ghi máy (cập nhật ngay, chưa chờ máy chủ) */
export function apDungDiemDanh(cv: CongViec, ca: LoaiCa, vao: Array<{ mnv: string; luc: number }>, ra: Array<{ mnv: string; luc: number }>): CongViec {
  const ds = [...(cv.coMat?.[ca] ?? [])].map(x => ({ ...x }));
  for (const v of vao) if (!ds.some(x => x.mnv === v.mnv && x.ra === null)) ds.push({ mnv: v.mnv, vao: v.luc, ra: null });
  for (const x of ra) {
    const d = ds.find(y => y.mnv === x.mnv && y.ra === null);
    if (d) d.ra = Math.max(d.vao, x.luc);
  }
  const conLai = ds.filter(x => x.ra === null || x.ra > x.vao);
  const coMat = { ...(cv.coMat ?? {}), [ca]: conLai };
  return { ...cv, coMat, quanSo: { ...cv.quanSo, [ca]: new Set(conLai.filter(x => x.ra === null).map(x => x.mnv)).size } };
}
