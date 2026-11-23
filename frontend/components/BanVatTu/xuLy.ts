import type { AnhNoiBo, ItemBanVatTu, TrangThaiAnh } from '../../services/banVatTuApi';

// ============================================================================
// HÀM THUẦN CỦA TRANG "DANH MỤC VẬT TƯ" (tra tồn kho nội bộ): chuẩn bị dòng, lọc, sắp xếp, tuổi tồn, tên đơn vị tính, tên kho,
// định dạng tiền / số. Không đụng React / DOM => test bằng vitest (xuLy.test.ts).
// ============================================================================

/** Ngày nhập kho này là ngày chuyển dữ liệu sang SAP: hàng nhập thật từ trước đó, không biết ngày đúng */
export const NGAY_CHUYEN_SAP = '2024-09-30';

// ---------------------------------------------------------------------------
// Chuỗi / chữ
// ---------------------------------------------------------------------------
/** Bỏ dấu tiếng Việt + chữ thường + gộp dấu cách (dùng cho ô tìm) */
export const boDau = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();

/** Đơn vị tính SAP => chữ dễ đọc (mã lạ giữ nguyên) */
const TEN_DVT: Record<string, string> = {
  PCS: 'cái', EA: 'cái', M: 'm', TAM: 'tấm', SET: 'bộ', KG: 'kg', G: 'g', M2: 'm²', M3: 'm³', CD3: 'dm³', L: 'lít',
  FT2: 'ft²', YRD: 'yard', YD: 'yard', CUO: 'cuộn', ROL: 'cuộn', VI: 'vỉ', THA: 'thanh', HOP: 'hộp', CAP: 'cặp',
  BIN: 'bình', CHA: 'chai', BIC: 'bịch', XAP: 'xấp', CAY: 'cây', SOI: 'sợi', TUY: 'tuýp', GOI: 'gói', TEP: 'tép',
  THU: 'thùng', BO: 'bộ', CAI: 'cái', CHI: 'chiếc', DOI: 'đôi', LON: 'lon', BAO: 'bao', KIT: 'bộ',
};
export const tenDvt = (dvt: string | null | undefined): string => {
  const s = String(dvt ?? '').trim();
  if (!s) return '';
  return TEN_DVT[s.toUpperCase()] ?? s.toLowerCase();
};

/**
 * 10 LOẠI CHÍNH (= 10 kho vật tư) đúng tên + thứ tự người dùng dùng ở file Excel (14/11/2026). Bộ lọc "Loại" của
 * trang chỉ dùng danh sách này. Khoá = tên kho SAP (Sloc name) bỏ "KVT" / "Kho VT" ở đầu, bỏ dấu, gộp dấu phẩy.
 */
export const DS_LOAI_CHINH = [
  'KVT Vải Da Mouss', 'KVT Gỗ', 'KVT Tấm-Ván', 'KVT phụ kiện', 'KVT Đá', 'KVT Hóa chất', 'Kho G.Công Ngoài',
  'KVT Bao Bì', 'KVT Kim Loại', 'KVT CCDC',
] as const;
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
export const tenKhoGon = (kho: string | null | undefined): string => {
  const s = String(kho ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Chưa rõ kho';
  const bo = s.replace(/^(kho\s+vt|kvt|kho)\s+/i, '').trim() || s;
  return TEN_KHO_RIENG[boDau(bo).toLowerCase().replace(/\s*,\s*/g, ',')] ?? s;
};
/** Thứ tự hiển thị của loại (ngoài 10 loại chính xếp cuối) */
export const thuTuLoai = (ten: string): number => {
  const i = (DS_LOAI_CHINH as readonly string[]).indexOf(ten);
  return i < 0 ? DS_LOAI_CHINH.length : i;
};

/**
 * Hàng gán công trình: Tên CT khác trống và KHÔNG bắt đầu bằng "DÙNG CHUNG" (bỏ dấu, gộp dấu cách / xuống dòng).
 * Biến thể "DÙNG CHUNG + CÔNG TRÌNH", "DÙNG CHUNG PX5", "DUNG CHUNG (GỖ TRÒN XẺ SẤY)", "DÙNG CHUNG\nARHAUS" … đều là
 * dùng chung — cùng quy tắc thống kê của backend/scripts/nap_ban_vat_tu.py (la_dung_chung).
 */
export const laGanCongTrinh = (tenCongTrinh: string | null | undefined): boolean => {
  const s = boDau(String(tenCongTrinh ?? ''));
  return s !== '' && !/^dung chung(\b|$)/.test(s);
};

/** Chữ tắt cho ô ảnh trống: 2 chữ cái đầu của 2 từ đầu có chữ */
export const chuTat = (ten: string | null | undefined): string => {
  const tu = String(ten ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!tu.length) return '?';
  const t = tu.length === 1 ? tu[0].slice(0, 2) : tu[0][0] + tu[1][0];
  return t.toUpperCase();
};

/** Màu nền ổn định theo tên nhóm (ô ảnh trống) — bảng màu dịu, chữ trắng đọc được */
const BANG_MAU = ['#2a78d6', '#d55181', '#199e70', '#6250d6', '#eb6834', '#c98500', '#0e7490', '#be123c', '#4d7c0f', '#7c3aed', '#475569', '#0f766e'];
export const mauTheoNhom = (nhom: string): string => {
  let h = 0;
  for (let i = 0; i < nhom.length; i++) h = (h * 31 + nhom.charCodeAt(i)) >>> 0;
  return BANG_MAU[h % BANG_MAU.length];
};

// ---------------------------------------------------------------------------
// Ngày / tuổi tồn
// ---------------------------------------------------------------------------
/** Hôm nay theo giờ Việt Nam 'YYYY-MM-DD' */
export const homNayVn = (luc: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(luc);

/** 'YYYY-MM-DD' => 'dd/mm/yyyy' (sai dạng => '') */
export const nhanNgay = (ngay: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ngay ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** Ngày nhập hiển thị: ngày chuyển SAP (hoặc trước đó) => "Từ trước 10/2024" */
export const nhanNgayNhap = (ngay: string | null | undefined): string => {
  if (!ngay) return 'Không rõ';
  if (ngay <= NGAY_CHUYEN_SAP) return 'Từ trước 10/2024';
  return nhanNgay(ngay) || 'Không rõ';
};

/** Số tháng tròn từ ngày nhập tới hôm nay (chuỗi 'YYYY-MM-DD', không qua Date để khỏi lệch múi giờ); sai dạng => null */
export const soThangTuoi = (ngayNhap: string | null | undefined, homNay: string): number | null => {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ngayNhap ?? ''));
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(homNay);
  if (!a || !b) return null;
  let thang = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
  if (Number(b[3]) < Number(a[3])) thang -= 1;
  return Math.max(0, thang);
};

export type NhomTuoi = 'duoi6' | '6_12' | '12_24' | 'tren24' | 'khong_ro';
export const NHAN_TUOI: Record<NhomTuoi, string> = {
  duoi6: 'Dưới 6 tháng',
  '6_12': '6–12 tháng',
  '12_24': '12–24 tháng',
  tren24: 'Trên 24 tháng / trước 10/2024',
  khong_ro: 'Không rõ ngày nhập',
};
export const DS_NHOM_TUOI: NhomTuoi[] = ['duoi6', '6_12', '12_24', 'tren24', 'khong_ro'];

export const nhomTuoi = (ngayNhap: string | null | undefined, homNay: string): NhomTuoi => {
  if (ngayNhap && ngayNhap <= NGAY_CHUYEN_SAP) return 'tren24';
  const t = soThangTuoi(ngayNhap, homNay);
  if (t === null) return 'khong_ro';
  if (t < 6) return 'duoi6';
  if (t < 12) return '6_12';
  if (t < 24) return '12_24';
  return 'tren24';
};

/** Tuổi tồn đọc được: "3 tháng", "1 năm 2 tháng", "Từ trước 10/2024" */
export const nhanTuoi = (ngayNhap: string | null | undefined, homNay: string): string => {
  if (ngayNhap && ngayNhap <= NGAY_CHUYEN_SAP) return 'Từ trước 10/2024';
  const t = soThangTuoi(ngayNhap, homNay);
  if (t === null) return 'Không rõ';
  if (t < 1) return 'Dưới 1 tháng';
  if (t < 12) return `${t} tháng`;
  const nam = Math.floor(t / 12), thang = t % 12;
  return thang ? `${nam} năm ${thang} tháng` : `${nam} năm`;
};

// ---------------------------------------------------------------------------
// Số / tiền
// ---------------------------------------------------------------------------
const soVi = (n: number, toiDa = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: toiDa });

/** Số lượng: tối đa 2 chữ số thập phân, kèm đơn vị dễ đọc */
export const dinhDangSoLuong = (n: number, dvt: string | null | undefined): string => {
  const d = tenDvt(dvt);
  return `${soVi(n, 2)}${d ? ` ${d}` : ''}`;
};

/** Đồng: "1.250.000 đ" */
export const dinhDangDong = (dong: number): string => `${soVi(Math.round(dong))} đ`;

/** Triệu đồng => chữ gọn: ≥ 1.000 triệu ghi tỷ, < 1 triệu ghi nghìn */
export const dinhDangTrieu = (trieu: number | null | undefined): string => {
  if (trieu === null || trieu === undefined || !Number.isFinite(trieu)) return '—';
  const a = Math.abs(trieu);
  if (a >= 1000) return `${soVi(trieu / 1000, 2)} tỷ`;
  if (a >= 1) return `${soVi(trieu, 1)} tr`;
  if (a === 0) return '0';
  return `${soVi(trieu * 1000, 0)} nghìn`;
};

// ---------------------------------------------------------------------------
// Thuộc tính hiển thị: master (ZMM60 / MD) nếu có, không thì suy từ tên (script nạp tách), thương hiệu thêm bước cuối
// "theo NCC" (NCC chính hãng của PR gần nhất). Giá trị suy luận luôn kèm nguồn để giao diện ghi rõ — không lẫn với
// dữ liệu master.
// ---------------------------------------------------------------------------
export type KhoaThuocTinh = 'chungLoai' | 'quyCach' | 'mau' | 'maMau' | 'thuongHieu' | 'chatLieu';
export const DS_THUOC_TINH: KhoaThuocTinh[] = ['chungLoai', 'quyCach', 'mau', 'maMau', 'thuongHieu', 'chatLieu'];
export const NHAN_THUOC_TINH: Record<KhoaThuocTinh, string> = {
  chungLoai: 'Chủng loại', quyCach: 'Quy cách', mau: 'Màu', maMau: 'Mã màu', thuongHieu: 'Thương hiệu', chatLieu: 'Chất liệu',
};
export type NguonThuocTinh = 'master' | 'ten' | 'ncc';
export interface GiaTriThuocTinh { giaTri: string; nguon: NguonThuocTinh }
export type ThuocTinhGop = Partial<Record<KhoaThuocTinh, GiaTriThuocTinh>>;

/** Chữ nhỏ cạnh giá trị suy luận + câu giải thích (title) */
export const NHAN_NGUON: Record<Exclude<NguonThuocTinh, 'master'>, { chu: string; giaiThich: string }> = {
  ten: {
    chu: 'suy từ tên',
    giaiThich: 'MASTER DATA chưa có thuộc tính này — máy tách từ tên vật tư, có thể chưa đúng, kiểm tra lại trước khi dùng',
  },
  ncc: {
    chu: 'theo NCC',
    giaiThich: 'MASTER DATA chưa có thương hiệu — lấy theo nhà cung cấp chính hãng của lần mua (PR) gần nhất',
  },
};

const sach = (v: string | null | undefined): string => String(v ?? '').trim();

/** Ô master coi là trống: rỗng hoặc chỉ ghi gạch / N/A — cùng quy tắc la_trong của script nạp (tach_thuoc_tinh.py) */
export const laTrong = (v: string | null | undefined): boolean => ['', '-', '--', 'N/A', 'NA'].includes(sach(v).toUpperCase());
const giaTriMaster = (v: string | null | undefined): string => (laTrong(v) ? '' : sach(v));

/** Mã màu master nằm ở thuộc tính MP16 ("MP16 MÃ MÀU") — script nạp chỉ suy mã màu khi ô này trống */
export const maMauMaster = (thuocTinh: Record<string, string> | null | undefined): string => {
  const k = Object.keys(thuocTinh ?? {}).find(x => /^MP16(\s|$)/i.test(x.trim()));
  return k ? giaTriMaster(thuocTinh?.[k]) : '';
};

export const gopThuocTinh = (it: Pick<ItemBanVatTu, 'master'>): ThuocTinhGop => {
  const m = it.master;
  const kq: ThuocTinhGop = {};
  if (!m) return kq;
  const goc: Record<KhoaThuocTinh, string> = {
    chungLoai: giaTriMaster(m.chungLoai), quyCach: giaTriMaster(m.quyCach), mau: giaTriMaster(m.mau),
    maMau: maMauMaster(m.thuocTinh), thuongHieu: giaTriMaster(m.thuongHieu), chatLieu: giaTriMaster(m.chatLieu),
  };
  for (const k of DS_THUOC_TINH) {
    const suy = sach(m.suyTuTen?.[k]);
    if (goc[k]) kq[k] = { giaTri: goc[k], nguon: 'master' };
    else if (suy) kq[k] = { giaTri: suy, nguon: 'ten' };
  }
  const ncc = sach(m.thuongHieuNcc);
  if (!kq.thuongHieu && ncc) kq.thuongHieu = { giaTri: ncc, nguon: 'ncc' };
  return kq;
};

/** Cột "Nguồn thuộc tính" của Excel: chỉ kể trường suy luận ("Màu, Quy cách: suy từ tên; Thương hiệu: theo NCC") */
export const nguonThuocTinhExcel = (tt: ThuocTinhGop): string => {
  const theoNguon = (n: NguonThuocTinh) => DS_THUOC_TINH.filter(k => tt[k]?.nguon === n).map(k => NHAN_THUOC_TINH[k]);
  const ten = theoNguon('ten'), ncc = theoNguon('ncc');
  return [
    ten.length ? `${ten.join(', ')}: ${NHAN_NGUON.ten.chu}` : '',
    ncc.length ? `${ncc.join(', ')}: ${NHAN_NGUON.ncc.chu}` : '',
  ].filter(Boolean).join('; ');
};

// ---------------------------------------------------------------------------
// Ảnh: link người dùng đã dán trước đây (anhLink, chỉ đọc) trước, rồi ảnh nội bộ (ảnh mẫu duyệt ở sheet 03 công trình)
// ---------------------------------------------------------------------------
export type AnhHien = { loai: 'link'; url: string } | { loai: 'noi_bo'; anh: AnhNoiBo };

export const dsAnhHien = (d: Pick<ItemBanVatTu, 'anhLink' | 'anh'>): AnhHien[] => [
  ...(d.anhLink ?? []).map(url => ({ loai: 'link' as const, url })),
  ...(d.anh ?? []).map(anh => ({ loai: 'noi_bo' as const, anh })),
];

export const coAnh = (d: Pick<ItemBanVatTu, 'anhLink' | 'anh'>): boolean => (d.anhLink?.length ?? 0) > 0 || (d.anh?.length ?? 0) > 0;

/** Ảnh máy tự ghép từ dòng 03 có nhiều mã SAP, chưa ai duyệt => có thể là ảnh của mã khác */
export const anhCanDuyet = (a: AnhNoiBo): boolean => !a.chacChan && a.trangThai === 'tu_dong';

/** "Ảnh mẫu duyệt CT25-070 (ST-05)" */
export const chuThichAnh = (a: AnhNoiBo): string =>
  `Ảnh mẫu duyệt ${a.congTrinh ?? 'công trình'}${a.codeVatLieu ? ` (${a.codeVatLieu})` : ''}`;

/** Cột "Có ảnh" của Excel */
export const nhanCoAnh = (d: Pick<ItemBanVatTu, 'anhLink' | 'anh'>): string | null => {
  if (d.anhLink?.length) return 'Có (link)';
  const ds = d.anh ?? [];
  if (!ds.length) return null;
  return ds.some(a => !anhCanDuyet(a)) ? 'Có (ảnh mẫu CT)' : 'Có (ảnh mẫu CT — cần duyệt)';
};

/** Thứ tự ảnh nội bộ như máy chủ: đã duyệt, chắc chắn, rồi giữ thứ tự cũ (mới nhất) */
const hangAnh = (a: AnhNoiBo) => (a.trangThai === 'da_duyet' ? 0 : a.chacChan ? 1 : 2);

/**
 * Đổi trạng thái 1 ảnh nội bộ cho mọi dòng của mã (sau PUT): 'an' => bỏ ảnh khỏi danh sách.
 * anhGoc: ảnh vừa ẩn (Hoàn tác ẩn => PUT 'tu_dong' / 'da_duyet') — ảnh không còn trong danh sách thì thêm lại.
 * Dòng đã chuẩn bị (có chuoiTim) được tính lại chuỗi tìm: code vật liệu của ảnh đã ẩn không còn khớp ô tìm.
 */
export const ganTrangThaiAnh = <T extends Pick<ItemBanVatTu, 'ma' | 'anh'>>(
  ds: T[], ma: string, id: number, tt: TrangThaiAnh, anhGoc?: AnhNoiBo,
): T[] =>
  ds.map(d => {
    if (d.ma !== ma) return d;
    const cu = d.anh ?? [];
    const coAnhNay = cu.some(a => a.id === id);
    if (!coAnhNay && (tt === 'an' || !anhGoc || anhGoc.id !== id)) return d;
    const moi = tt === 'an'
      ? cu.filter(a => a.id !== id)
      : (coAnhNay ? cu.map(a => (a.id === id ? { ...a, trangThai: tt } : a)) : [...cu, { ...anhGoc!, trangThai: tt }])
        .map((a, i) => ({ a, i })).sort((x, y) => hangAnh(x.a) - hangAnh(y.a) || x.i - y.i).map(x => x.a);
    const dMoi = { ...d, anh: moi };
    if ('chuoiTim' in d && 'tt' in d) {
      const dong = dMoi as unknown as DongBan;
      return { ...dMoi, chuoiTim: chuoiTimCua(dong, dong.tt) };
    }
    return dMoi;
  });

// ---------------------------------------------------------------------------
// Dòng đã chuẩn bị (tính sẵn 1 lần để lọc / xếp ≈5.100 dòng không phải tính lại)
// ---------------------------------------------------------------------------
export interface DongBan extends ItemBanVatTu {
  /** Khoá hiển thị duy nhất: ma + kho (+ số thứ tự khi trùng) */
  khoa: string;
  tenHien: string;
  khoTen: string;
  nhom: string;
  chungLoaiHien: string;
  /** Thuộc tính hiển thị đã gộp master → suy từ tên → theo NCC (kèm nguồn) */
  tt: ThuocTinhGop;
  tuoiThang: number | null;
  nhomTuoi: NhomTuoi;
  ganCT: boolean;
  chuoiTim: string;
}

export const tenNhom = (it: ItemBanVatTu): string =>
  it.master?.tenNhomSap?.trim() || it.master?.nhomSap?.trim() || 'Chưa phân nhóm';

/** Chuỗi tìm: tên, mã, thuộc tính đã gộp (cả giá trị suy luận), công trình, kho, code vật liệu của ảnh sheet 03 */
export const chuoiTimCua = (it: ItemBanVatTu, tt: ThuocTinhGop = gopThuocTinh(it)): string => boDau([
  it.ma, it.ten, it.master?.ten, ...DS_THUOC_TINH.map(k => tt[k]?.giaTri),
  it.master?.tenNhomSap, it.tenCongTrinh, it.maCongTrinh, it.kho,
  ...(it.anh ?? []).map(a => a.codeVatLieu),
].filter(Boolean).join(' | '));

export const chuanBiDong = (items: ItemBanVatTu[], homNay: string): DongBan[] => {
  const daCo = new Map<string, number>();
  return items.map(it => {
    const tt = gopThuocTinh(it);
    const goc = `${it.ma}|${it.kho ?? ''}`;
    const lan = daCo.get(goc) ?? 0;
    daCo.set(goc, lan + 1);
    return {
      ...it,
      khoa: lan ? `${goc}|${lan}` : goc,
      tenHien: it.ten || it.master?.ten || it.ma,
      khoTen: tenKhoGon(it.kho),
      nhom: tenNhom(it),
      chungLoaiHien: tt.chungLoai?.giaTri ?? '',
      tt,
      tuoiThang: it.ngayNhap && it.ngayNhap <= NGAY_CHUYEN_SAP ? null : soThangTuoi(it.ngayNhap, homNay),
      nhomTuoi: nhomTuoi(it.ngayNhap, homNay),
      ganCT: laGanCongTrinh(it.tenCongTrinh),
      chuoiTim: chuoiTimCua(it, tt),
    };
  });
};

// ---------------------------------------------------------------------------
// Lọc
// ---------------------------------------------------------------------------
export interface LocBan {
  tim: string;
  nhom: string;
  chungLoai: string;
  kho: string;
  ganCT: '' | 'dung_chung' | 'gan_ct';
  cham: '' | 'cham' | 'khong';
  tuoi: '' | NhomTuoi;
  anh: '' | 'co' | 'chua';
  /** Khoảng giá trị tồn (triệu đồng) — chỉ dùng khi có quyền giá vốn; null = không chặn */
  giaTriTu: number | null;
  giaTriDen: number | null;
}

export const LOC_TRONG: LocBan = {
  tim: '', nhom: '', chungLoai: '', kho: '', ganCT: '', cham: '', tuoi: '', anh: '', giaTriTu: null, giaTriDen: null,
};

export const soLocDangBat = (l: LocBan): number =>
  (l.tim.trim() ? 1 : 0) + (l.nhom ? 1 : 0) + (l.chungLoai ? 1 : 0) + (l.kho ? 1 : 0)
  + (l.ganCT ? 1 : 0) + (l.cham ? 1 : 0) + (l.tuoi ? 1 : 0) + (l.anh ? 1 : 0)
  + (l.giaTriTu !== null || l.giaTriDen !== null ? 1 : 0);

/** Lọc dòng. `boQua` = bỏ qua 1 điều kiện (đếm số dòng cho từng lựa chọn của chính bộ lọc đó) */
export const locDong = (ds: DongBan[], l: LocBan, coGiaVon: boolean, boQua?: keyof LocBan): DongBan[] => {
  const tu = l.tim.trim() ? boDau(l.tim).split(' ').filter(Boolean) : [];
  const gt = coGiaVon && boQua !== 'giaTriTu' && (l.giaTriTu !== null || l.giaTriDen !== null);
  return ds.filter(d => {
    if (tu.length && boQua !== 'tim' && !tu.every(t => d.chuoiTim.includes(t))) return false;
    if (l.nhom && boQua !== 'nhom' && d.nhom !== l.nhom) return false;
    if (l.chungLoai && boQua !== 'chungLoai' && d.chungLoaiHien !== l.chungLoai) return false;
    if (l.kho && boQua !== 'kho' && d.khoTen !== l.kho) return false;
    if (l.ganCT && boQua !== 'ganCT' && (l.ganCT === 'gan_ct') !== d.ganCT) return false;
    if (l.cham && boQua !== 'cham' && (l.cham === 'cham') !== d.chamLuanChuyen) return false;
    if (l.tuoi && boQua !== 'tuoi' && d.nhomTuoi !== l.tuoi) return false;
    if (l.anh && boQua !== 'anh' && (l.anh === 'co') !== coAnh(d)) return false;
    if (gt) {
      const v = d.giaTri ?? 0;
      if (l.giaTriTu !== null && v < l.giaTriTu) return false;
      if (l.giaTriDen !== null && v > l.giaTriDen) return false;
    }
    return true;
  });
};

/** Lựa chọn của 1 bộ lọc dạng danh sách: giá trị + số dòng, nhiều dòng trước (cùng số thì theo chữ) */
export const dsLuaChon = (ds: DongBan[], lay: (d: DongBan) => string): Array<{ giaTri: string; dem: number }> => {
  const dem = new Map<string, number>();
  for (const d of ds) {
    const k = lay(d);
    if (!k) continue;
    dem.set(k, (dem.get(k) ?? 0) + 1);
  }
  return [...dem.entries()].map(([giaTri, n]) => ({ giaTri, dem: n }))
    .sort((a, b) => b.dem - a.dem || a.giaTri.localeCompare(b.giaTri, 'vi'));
};

// ---------------------------------------------------------------------------
// Sắp xếp
// ---------------------------------------------------------------------------
export type CachXep = 'giaTri' | 'soLuong' | 'tuoi' | 'ten';
export interface Xep { cot: CachXep; giam: boolean }
export const NHAN_XEP: Record<CachXep, string> = {
  giaTri: 'Giá trị tồn', soLuong: 'Số lượng', tuoi: 'Tuổi tồn', ten: 'Tên',
};

/** Tuổi để xếp: hàng trước 10/2024 coi là cũ nhất; không rõ ngày => -1 (cuối khi xếp giảm) */
const tuoiXep = (d: DongBan): number => (d.nhomTuoi === 'tren24' && d.tuoiThang === null ? 9999 : d.tuoiThang ?? -1);

export const xepDong = (ds: DongBan[], x: Xep): DongBan[] => {
  const dau = x.giam ? -1 : 1;
  const lay: (d: DongBan) => number = x.cot === 'giaTri' ? d => d.giaTri ?? -1
    : x.cot === 'soLuong' ? d => d.soLuong
      : x.cot === 'tuoi' ? tuoiXep
        : () => 0;
  return ds.slice().sort((a, b) => {
    if (x.cot === 'ten') return dau * a.tenHien.localeCompare(b.tenHien, 'vi') || a.ma.localeCompare(b.ma);
    return dau * (lay(a) - lay(b)) || a.tenHien.localeCompare(b.tenHien, 'vi') || a.ma.localeCompare(b.ma);
  });
};

// ---------------------------------------------------------------------------
// Tóm tắt + xuất Excel
// ---------------------------------------------------------------------------
export interface TomTat {
  soMa: number; soDong: number; tongGiaTri: number; ganCT: number; coAnh: number;
  /** Số mã có ít nhất 1 dòng chậm luân chuyển */
  cham: number;
}
export const tomTat = (ds: DongBan[]): TomTat => {
  const ma = new Set<string>(), maAnh = new Set<string>(), maCham = new Set<string>();
  let tong = 0, gan = 0;
  for (const d of ds) {
    ma.add(d.ma);
    if (coAnh(d)) maAnh.add(d.ma);
    if (d.chamLuanChuyen) maCham.add(d.ma);
    if (d.ganCT) gan++;
    tong += d.giaTri ?? 0;
  }
  return { soMa: ma.size, soDong: ds.length, tongGiaTri: tong, ganCT: gan, coAnh: maAnh.size, cham: maCham.size };
};

/** Bảng (mảng 2 chiều) để ghi Excel: số để dạng số, giá vốn chỉ có khi có quyền */
export const bangExcel = (ds: DongBan[], coGiaVon: boolean, homNay: string): Array<Array<string | number | null>> => {
  const dau = ['Mã vật tư', 'Tên vật tư', 'Nhóm', 'Chủng loại', 'Quy cách', 'Màu', 'Mã màu', 'Thương hiệu', 'Chất liệu',
    'Nguồn thuộc tính', 'Xuất xứ',
    'Số lượng', 'ĐVT', 'Kho', 'Ngày nhập gần nhất', 'Tuổi tồn', 'Chậm luân chuyển', 'Công trình', 'Mã CT',
    ...(coGiaVon ? ['Giá trị tồn (triệu)', 'Đơn giá vốn (đ)'] : []),
    'Có ảnh', 'Link ảnh'];
  const dong = ds.map(d => [
    d.ma, d.tenHien, d.nhom, d.tt.chungLoai?.giaTri ?? null, d.tt.quyCach?.giaTri ?? null, d.tt.mau?.giaTri ?? null,
    d.tt.maMau?.giaTri ?? null, d.tt.thuongHieu?.giaTri ?? null, d.tt.chatLieu?.giaTri ?? null, nguonThuocTinhExcel(d.tt) || null,
    d.master?.xuatXu ?? null,
    d.soLuong, tenDvt(d.dvt) || null, d.khoTen, nhanNgayNhap(d.ngayNhap), nhanTuoi(d.ngayNhap, homNay), d.chamLuanChuyen ? 'Có' : null,
    d.tenCongTrinh, d.maCongTrinh,
    ...(coGiaVon ? [d.giaTri, d.donGiaVon !== null ? Math.round(d.donGiaVon) : null] : []),
    nhanCoAnh(d), d.anhLink.join('\n') || null,
  ]);
  return [dau, ...dong];
};

// ---------------------------------------------------------------------------
// Ô nhập số của bộ lọc
// ---------------------------------------------------------------------------
/**
 * Số triệu đồng gõ ở ô lọc "Giá trị (triệu)" theo kiểu vi-VN: dấu phẩy là thập phân, dấu chấm phân cách hàng nghìn
 * ('1.000' = 1000, '1.000,5' = 1000,5, '2,5' = 2,5). Chỉ có dấu chấm và không theo nhóm 3 chữ số ('1.5') thì coi dấu
 * chấm là thập phân. Trống => null; sai / âm => null (bỏ điều kiện lọc).
 */
export const docSoTrieu = (s: string): number | null => {
  let t = s.replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
