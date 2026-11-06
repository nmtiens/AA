// Chi tiết sau mỗi con số của báo cáo Tồn kho thành phẩm v5 (GET /api/stock/health/chi-tiet). File này không đụng DB:
// docYeuCauChiTiet đọc tham số, canDocChiTiet nêu các dòng thật phải đọc thêm, chiTietTonKhoV5 dựng danh sách.
// Mọi phân loại lấy từ phanTichV5 (tonKhoV5.ts), không viết công thức lần hai: tổng danh sách luôn bằng số trên báo cáo.
//
// loai (tham số thêm) -> số trên báo cáo. Tham số cờ = 1; danh sách ngăn bằng dấu phẩy hoặc lặp tham số:
//   ton            (ct?, duAn?, tuoi? moi|cu|cu12|khong, nsp?)  tổng tồn, trên 6 tháng, gói đứng yên, bảng dự án (tồn, ≤6, >6, không rõ ngày, nhóm SP), tồn của 1 gói
//   phan_chia      (nhom, cu?)                         6 nhóm chia: chuaXuat, giaoDo, ganXong, theoNhip, huy, khongPsa
//   chua_xuat      (duAn?, nhomTuoi?, gồm t01,t23,t46,t6,thieuBo,khong)  KPI chưa xuất TÍNH, phần từ 4 tháng (nhomTuoi=t46,t6), cột/đoạn cột theo dự án
//   huy            (ct?, cu?)                          đơn huỷ, phần trên 6 tháng
//   khong_psa      (ct?, cu?)                          tồn không có đơn trong PSA
//   sap_vuot       (duAn?)                             sắp vượt 6 tháng tới mốc cuối, theo dự án (cột duAn của doiChieu.sapVuot)
//   moc6           (moc, seri?)                        1 mốc của loNhap.moc6, seri = khoá theoDuAn của mốc
//   lo_nhap        (thang, seri?, cu?)                 cột tháng nhập (thang: YYYY-MM|truoc|khong, được nhiều tháng), đoạn cột theo seri
//   goi_cu         (ct, huy?) hoặc (conLai=1)          phần cũ của 1 dòng bảng gói, dòng "n gói còn lại"
//   goi_ra         (ct?) hoặc (conLai=1)               cột ra 93 ngày của gói; không tham số = tổng ra cửa sổ (goiCu.ra)
//   goi_vao        (ct?)                               tổng vượt mốc cửa sổ (goiCu.vao)
//   kiem_ke        (muc: huy|da_xuat|roi_kho)          3 mục cần kiểm kê
//   moc            (d, cu?, phan? goi|con, duAn?)      tồn/hàng cũ tại 1 lần chốt; phan tách gói đứng yên / phần còn lại (cuoiThang.cuGoi); duAn: 2 cột mốc của So 2 mốc (duAnMoc)
//   vuot_moc       (d)                                 cuoiThang.vuotMoc của mốc d
//   ra             (d)                                 cuoiThang.ra của mốc d
//   so_moc         (tu, den, duAn?, f? v|cu)           chênh giữa 2 lần chốt, f=cu là hàng cũ
//   nhap           (ct?, duAn?, tu?, den?, denThang?)  nhập của gói/dự án/kỳ; denThang=YYYY-MM cho 1 điểm lũy kế; tu loại trừ, den gồm
//   xuat_tinh      (ct?, duAn?, tu?, den?, denThang?, xuat60?)  xuất TÍNH của gói/dự án/kỳ; xuat60=1 là 60 ngày
//   chua_doi_soat  (den)                               chưa đối soát của kỳ kết thúc ở den, theo mã
//   du             (ct?) hoặc (conLai=1) hoặc (lon=1, duAn?)  nhập chưa khớp theo mã; ct: từng HEX của mã; lon: các mã lớn của dòng "Nhập lớn" ở Vấn đề, duAn tách theo dự án
//   so_sach        (muc: cho_ve|lap_ct|roi_kho|chua_ro|phan_loai)  4 nhóm nhập chưa khớp; phan_loai = 3 nhóm đầu gộp (tong.duPhanLoai)
//   da_nhap        (duAn)                              đơn đã nhập từng HEX (tong = tiền nhập, phu = giá trị đơn: pctNhap)
//   don_chua_nhap  (duAn)                              đơn chưa nhập từng HEX
// Trả về ChiTietTonKho: tong đủ kể cả khi cắt dòng; cột kieu 'ty' có giá trị triệu đồng. du, so_sach không có khi đang lọc.
// tuoi: ton.tuoi=moi là ≤ 6 tháng. ct là mã công trình; duAn là tên dự án như payload.

import {
  ghepDongTon, laCu, laDaXuat, laDonCon, laHuy, laXuatTinh, lam, phanTichV5, tenNhomSp, tinhTuoi, tong,
  type DongLo, type DongNhap, type DongTon, type DongXuat, type InputTonKhoV5, type PhanTichV5,
} from './tonKhoV5.js';

export const LOAI_CHI_TIET = [
  'ton', 'phan_chia', 'chua_xuat', 'huy', 'khong_psa', 'sap_vuot', 'moc6', 'lo_nhap', 'goi_cu', 'goi_ra', 'goi_vao', 'kiem_ke',
  'moc', 'vuot_moc', 'ra', 'so_moc', 'nhap', 'xuat_tinh', 'chua_doi_soat', 'du', 'so_sach', 'da_nhap', 'don_chua_nhap',
] as const;
export type LoaiChiTiet = typeof LOAI_CHI_TIET[number];

export interface YeuCauChiTiet {
  loai: LoaiChiTiet;
  ct?: string; duAn?: string[]; tuoi?: 'moi' | 'cu' | 'cu12' | 'khong'; nsp?: string; nhom?: string; nhomTuoi?: string[];
  thang?: string[]; seri?: string; moc?: string; d?: string; tu?: string; den?: string; denThang?: string;
  f?: 'v' | 'cu'; phan?: 'goi' | 'con'; muc?: string;
  cu?: boolean; huy?: boolean; conLai?: boolean; lon?: boolean; xuat60?: boolean;
}
export interface CotChiTiet { k: string; nhan: string; kieu: 'chu' | 'ty' | 'ngay' | 'so' }
export interface ChiTietTonKho {
  tieuDe: string;
  /** Triệu đồng, tổng đầy đủ kể cả khi cắt dòng */
  tong: number;
  soDong: number;
  cot: CotChiTiet[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  /** Số phụ trợ để đọc %, vd. giá trị đơn của % đã nhập; triệu đồng */
  phu?: { nhan: string; gt: number }[];
}

/** Tham số sai hoặc không có số tương ứng: route trả 400 */
export class LoiChiTiet extends Error {}

// ---- Dòng thật đọc thêm khi bấm ----
export interface DongNhapCt extends DongNhap { ctu: string | null; hm: string | null }
export interface DongXuatCt extends DongXuat { ctu: string | null; hm: string | null }
export interface DongDon { hex: string | null; ct: string | null; ten: string | null; hm: string | null; pm: string | null; ipo: string | null; ttda: string | null; tn: string | null; gtd: number; nhapCap: number; con: number }
export interface MoTaHang { hm: string | null; xg: string | null; nsp: string | null }
export interface BangMoTa { hex: Map<string, MoTaHang>; sap: Map<string, MoTaHang> }
export interface DocThem { tonNgay?: Record<string, DongTon[]>; nhap?: DongNhapCt[]; xuat?: DongXuatCt[]; don?: DongDon[]; moTa?: BangMoTa }
export interface CanDoc {
  tonNgay: string[];
  nhap: { cts: string[] | null; tu: string | null; den: string | null } | null;
  xuat: { cts: string[] | null; tu: string | null; den: string | null } | null;
  don: string[] | null;
}

/** Dòng DB của các câu đọc thêm -> DocThem */
export const ghepDocThem = (ngay: string[], tonNgay: Record<string, any>[] | null, nhap: Record<string, any>[] | null, xuat: Record<string, any>[] | null, don: Record<string, any>[] | null): DocThem => {
  const so = (x: unknown) => Number(x) || 0;
  const them: DocThem = {};
  if (tonNgay) {
    const m: Record<string, DongTon[]> = Object.fromEntries(ngay.map(d => [d, []]));
    for (const r of tonNgay) m[r.d]?.push(ghepDongTon(r));
    them.tonNgay = m;
  }
  if (nhap) them.nhap = nhap.map(r => ({ d: r.d, hex: r.hex, ct: r.ct, ten: r.ten, sl: r.sl === null ? null : so(r.sl), tt: so(r.tt), gc: r.gc, ctu: r.ctu, hm: r.hm }));
  if (xuat) them.xuat = xuat.map(r => ({ d: r.d, hex: r.hex, ct: r.ct, ten: r.ten, tn: r.tn, ipo: r.ipo, co: r.co, sl: so(r.sl), tt: so(r.tt), gc: r.gc, ctu: r.ctu, hm: r.hm }));
  if (don) them.don = don.map(r => ({ hex: r.hex, ct: r.ct, ten: r.ten, hm: r.hm, pm: r.pm, ipo: r.ipo, ttda: r.ttda, tn: r.tn, gtd: so(r.gtd), nhapCap: so(r.nhap_cap), con: so(r.con) }));
  return them;
};

export const SO_DONG_TOI_DA = 5000;
const MA_CT_DAI = 64, TEN_DAI = 200, DS_DAI = 40;

// ---- Đọc tham số ----
/** Ngày thật: 2026-02-31 qua được Date.parse nhưng không phải ngày */
export const laNgay = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const mot = (q: Record<string, unknown>, k: string, dai = TEN_DAI): string | undefined => {
  const v = q[k];
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string') throw new LoiChiTiet(`Tham số ${k} không hợp lệ`);
  if (v.length > dai) throw new LoiChiTiet(`Tham số ${k} quá dài`);
  return v;
};
const ds = (q: Record<string, unknown>, k: string): string[] | undefined => {
  const v = q[k];
  if (v === undefined || v === '') return undefined;
  const a = (Array.isArray(v) ? v : [v]).flatMap(x => {
    if (typeof x !== 'string') throw new LoiChiTiet(`Tham số ${k} không hợp lệ`);
    return x.split(',');
  }).map(x => x.trim()).filter(Boolean);
  if (a.length > DS_DAI || a.some(x => x.length > TEN_DAI)) throw new LoiChiTiet(`Tham số ${k} quá dài`);
  return a.length ? a : undefined;
};
const ngay = (q: Record<string, unknown>, k: string) => {
  const v = mot(q, k, 10);
  if (v !== undefined && !laNgay(v)) throw new LoiChiTiet(`Tham số ${k} không phải ngày`);
  return v;
};
const trongDs = <T extends string>(q: Record<string, unknown>, k: string, cho: readonly T[]): T | undefined => {
  const v = mot(q, k);
  if (v !== undefined && !cho.includes(v as T)) throw new LoiChiTiet(`Tham số ${k} không hợp lệ`);
  return v as T | undefined;
};
const co = (q: Record<string, unknown>, k: string) => (mot(q, k, 1) === '1' ? true : undefined);

const NHOM_CHIA = ['chuaXuat', 'giaoDo', 'ganXong', 'theoNhip', 'huy', 'khongPsa'] as const;
const NHOM_TUOI = ['t01', 't23', 't46', 't6', 'thieuBo', 'khong'];
const THANG_LO = /^(\d{4}-\d{2}|truoc|khong)$/;
const TEN_TUOI: Record<string, string> = { t01: '0–1 tháng', t23: '2–3 tháng', t46: '4–6 tháng', t6: 'trên 6 tháng', thieuBo: 'giao thiếu bộ', khong: 'không rõ ngày' };
const thangVn = (t: string) => `${t.slice(5, 7)}/${t.slice(0, 4)}`;

export const docYeuCauChiTiet = (q: Record<string, unknown>): YeuCauChiTiet => {
  const loai = trongDs(q, 'loai', LOAI_CHI_TIET);
  if (!loai) throw new LoiChiTiet('Thiếu loai');
  const yc: YeuCauChiTiet = {
    loai, ct: mot(q, 'ct', MA_CT_DAI), duAn: ds(q, 'duAn'), tuoi: trongDs(q, 'tuoi', ['moi', 'cu', 'cu12', 'khong']), nsp: mot(q, 'nsp'),
    nhom: trongDs(q, 'nhom', NHOM_CHIA), nhomTuoi: ds(q, 'nhomTuoi'), thang: ds(q, 'thang'), seri: mot(q, 'seri'),
    moc: ngay(q, 'moc'), d: ngay(q, 'd'), tu: ngay(q, 'tu'), den: ngay(q, 'den'), denThang: mot(q, 'denThang', 7),
    f: trongDs(q, 'f', ['v', 'cu']), phan: trongDs(q, 'phan', ['goi', 'con']), muc: mot(q, 'muc', 16),
    cu: co(q, 'cu'), huy: co(q, 'huy'), conLai: co(q, 'conLai'), lon: co(q, 'lon'), xuat60: co(q, 'xuat60'),
  };
  if (yc.nhomTuoi?.some(k => !NHOM_TUOI.includes(k))) throw new LoiChiTiet('Tham số nhomTuoi không hợp lệ');
  if (yc.thang?.some(t => !THANG_LO.test(t))) throw new LoiChiTiet('Tham số thang không hợp lệ');
  if (yc.denThang !== undefined && !/^\d{4}-\d{2}$/.test(yc.denThang)) throw new LoiChiTiet('Tham số denThang không hợp lệ');
  const can = (dk: unknown, ten: string) => { if (!dk) throw new LoiChiTiet(`Thiếu ${ten}`); };
  switch (loai) {
    case 'phan_chia': can(yc.nhom, 'nhom'); break;
    case 'moc6': can(yc.moc, 'moc'); break;
    case 'lo_nhap': can(yc.thang, 'thang'); break;
    case 'goi_cu': can(yc.ct || yc.conLai, 'ct'); break;
    case 'kiem_ke': can(['huy', 'da_xuat', 'roi_kho'].includes(yc.muc ?? ''), 'muc'); break;
    case 'so_sach': can(['cho_ve', 'lap_ct', 'roi_kho', 'chua_ro', 'phan_loai'].includes(yc.muc ?? ''), 'muc'); break;
    case 'moc': case 'vuot_moc': case 'ra': can(yc.d, 'd'); break;
    case 'so_moc': can(yc.tu && yc.den && yc.tu <= yc.den, 'tu, den'); break;
    case 'nhap': case 'xuat_tinh': can(yc.ct || yc.duAn || (yc.tu && yc.den), 'ct, duAn hoặc tu + den'); break;
    case 'chua_doi_soat': can(yc.den, 'den'); break;
    case 'da_nhap': case 'don_chua_nhap': can(yc.duAn, 'duAn'); break;
    default: break;
  }
  return yc;
};

const coChot = (input: InputTonKhoV5, d: string, ten: string) => {
  if (d > input.date || !input.ngayChot.includes(d)) throw new LoiChiTiet(`${ten} không phải ngày chốt`);
};
/** Kỳ kết thúc ở mốc cuối tháng den: mốc đầu kỳ */
const dauKy = (a: PhanTichV5, den: string) => {
  const i = a.S.indexOf(den);
  if (i < 1) throw new LoiChiTiet('Không có kỳ tại mốc này');
  return a.S[i - 1];
};

/** Kiểm tham số theo dữ liệu đã đọc, nêu các dòng thật cần đọc thêm */
export const canDocChiTiet = (input: InputTonKhoV5, yc: YeuCauChiTiet): CanDoc => {
  const a = phanTichV5(input);
  const can: CanDoc = { tonNgay: [], nhap: null, xuat: null, don: null };
  const maDuAn = (ds: { ct: string | null; ten: string | null }[], chua: string[]) =>
    [...new Set(ds.filter(r => r.ct && chua.includes(a.daOf(r.ct, r.ten))).map(r => r.ct!))];
  switch (yc.loai) {
    case 'moc': coChot(input, yc.d!, 'd'); can.tonNgay = [yc.d!]; break;
    case 'vuot_moc': can.tonNgay = [yc.d!]; dauKy(a, yc.d!); break;
    case 'ra': can.tonNgay = [dauKy(a, yc.d!), yc.d!]; break;
    case 'so_moc': coChot(input, yc.tu!, 'tu'); coChot(input, yc.den!, 'den'); can.tonNgay = [yc.tu!, yc.den!]; break;
    case 'goi_ra': case 'goi_vao': can.tonNgay = a.S.slice(a.iRa - 1); break;
    case 'chua_doi_soat': dauKy(a, yc.den!); break;
    case 'moc6': if (!a.moc6Dong.some(m => m.moc === yc.moc)) throw new LoiChiTiet('moc không có trong báo cáo'); break;
    case 'nhap':
      can.nhap = { cts: yc.ct ? [yc.ct] : yc.duAn ? maDuAn(a.nhap, yc.duAn) : null, tu: yc.tu ?? null, den: yc.den ?? null };
      break;
    case 'xuat_tinh':
      can.xuat = { cts: yc.ct ? [yc.ct] : yc.duAn ? maDuAn(a.xuat, yc.duAn) : null, tu: yc.tu ?? null, den: yc.den ?? null };
      break;
    case 'du':
      if (yc.ct && a.S.length >= 2) {
        const tu = a.S[0], den = a.S[a.S.length - 1];
        can.tonNgay = [tu, den];
        can.nhap = can.xuat = { cts: [yc.ct], tu, den };
      }
      break;
    case 'da_nhap': case 'don_chua_nhap':
      can.don = [...new Set(input.psaNhom.filter(p => yc.duAn!.includes(a.daOf(p.ct, p.ten))).map(p => p.ct ?? ''))];
      break;
    default: break;
  }
  can.tonNgay = [...new Set(can.tonNgay)].filter(d => d !== input.date); // ngày xem đã có trong input
  return can;
};

// ---- Dựng kết quả ----
const CT: CotChiTiet = { k: 'ct', nhan: 'Công trình', kieu: 'chu' };
const TEN: CotChiTiet = { k: 'ten', nhan: 'Tên công trình', kieu: 'chu' };
const HEX: CotChiTiet = { k: 'hex', nhan: 'HEX', kieu: 'chu' };
const SAP: CotChiTiet = { k: 'sap', nhan: 'Mã SAP', kieu: 'chu' };
const HM: CotChiTiet = { k: 'hm', nhan: 'Hạng mục', kieu: 'chu' };
const NSP: CotChiTiet = { k: 'nsp', nhan: 'Nhóm SP', kieu: 'chu' };
const XG: CotChiTiet = { k: 'xuong', nhan: 'Xưởng', kieu: 'chu' };
const NK: CotChiTiet = { k: 'nk', nhan: 'Ngày nhập', kieu: 'ngay' };
const TUOI: CotChiTiet = { k: 'tuoi', nhan: 'Tuổi (tháng)', kieu: 'so' };
const GT: CotChiTiet = { k: 'v', nhan: 'Giá trị', kieu: 'ty' };
const COT_TON = [CT, TEN, HEX, SAP, HM, NSP, XG, NK, TUOI, GT];
const COT_LO = [{ k: 'd', nhan: 'Mốc', kieu: 'ngay' } as CotChiTiet, CT, TEN, HEX, SAP, HM, NK];
const COT_MA = (nhanDu: string): CotChiTiet[] => [CT, TEN,
  { k: 'dau', nhan: 'Đầu kỳ', kieu: 'ty' }, { k: 'nhap', nhan: 'Nhập', kieu: 'ty' }, { k: 'xuat', nhan: 'Xuất TÍNH', kieu: 'ty' }, { k: 'cuoi', nhan: 'Cuối kỳ', kieu: 'ty' }, { k: 'du', nhan: nhanDu, kieu: 'ty' }];
const COT_DON: CotChiTiet[] = [CT, TEN, HEX, HM, { k: 'ipo', nhan: 'Tình trạng IPO', kieu: 'chu' }, { k: 'gtd', nhan: 'Giá trị đơn', kieu: 'ty' }, { k: 'nhapCap', nhan: 'Đã nhập', kieu: 'ty' }, { k: 'con', nhan: 'Chưa nhập', kieu: 'ty' }];

/** gt: giá trị mỗi dòng; sắp giảm dần, cắt 5000 dòng, tong luôn đủ */
const dung = <T>(tieuDe: string, cot: CotChiTiet[], dong: T[], gt: (x: T) => number, raDong: (x: T) => Record<string, unknown>, phu?: ChiTietTonKho['phu']): ChiTietTonKho => {
  const sap = [...dong].sort((a, b) => gt(b) - gt(a));
  return {
    tieuDe, tong: lam(tong(dong, gt)), soDong: dong.length, cot,
    rows: sap.slice(0, SO_DONG_TOI_DA).map(raDong), truncated: dong.length > SO_DONG_TOI_DA,
    ...(phu ? { phu } : {}),
  };
};
const ngayNgan = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const gon = (s: string | null | undefined) => (s ?? '').trim();

export const chiTietTonKhoV5 = (input: InputTonKhoV5, yc: YeuCauChiTiet, them: DocThem = {}): ChiTietTonKho => {
  const a = phanTichV5(input);
  canDocChiTiet(input, yc); // kiểm tham số theo dữ liệu, kể cả khi gọi thẳng
  const { date } = input;
  const { O, S, kq } = a;
  const moTa = (hex: string | null, sap: string | null): MoTaHang | null => {
    const m = (hex ? them.moTa?.hex.get(hex) : undefined) ?? (sap ? them.moTa?.sap.get(sap) : undefined);
    if (m) return m;
    const p = hex ? a.P.get(hex) : undefined;
    return p ? { hm: null, xg: null, nsp: p.nsp } : null;
  };
  const dongTon = (d: string) => (t: DongTon) => {
    const m = moTa(t.hex, t.sap);
    return { ct: t.ct ?? '', ten: gon(t.ten), hex: t.hex, sap: t.sap, hm: m?.hm ?? null, nsp: m?.nsp ? tenNhomSp(m.nsp) : null, xuong: m?.xg ?? null, nk: t.nk, tuoi: tinhTuoi(d, t.nk), v: lam(t.v) };
  };
  const banTon = (tieuDe: string, ds: DongTon[], d = date) => dung(tieuDe, COT_TON, ds, t => t.v, dongTon(d));
  /** Tồn từng dòng tại 1 lần chốt; gọi hàm thuần không kèm dòng thật thì lấy bản gom */
  const tonTai = (d: string): DongTon[] => {
    if (d === date) return O;
    const r = them.tonNgay?.[d];
    if (r) return r.filter(t => t.v);
    return input.tonMoc.filter(t => t.d === d).map(t => ({ sap: t.sap, hex: null, ct: t.ct, ten: t.ten, nk: t.nk, sl: t.sl, v: t.v, tkh: null, gc: null }));
  };
  const coDuAn = yc.duAn ? new Set(yc.duAn) : null;
  const tieuDeNhom = yc.duAn?.length ? ` · ${yc.duAn.join(', ')}` : '';
  /** Dự án của 1 mã tại 1 lần chốt: cùng tên với duAnMoc */
  const duAnTai = (d: string, ct: string) => a.daOf(ct, a.theoNgay.get(d)?.ct.get(ct)?.ten ?? null);

  switch (yc.loai) {
    case 'ton': {
      const ds = O.filter(t => {
        if (yc.ct !== undefined && (t.ct ?? '') !== yc.ct) return false;
        if (coDuAn && !coDuAn.has(a.daTon(t))) return false;
        if (yc.nsp !== undefined) { const p = t.hex ? a.P.get(t.hex) : undefined; if (!p || tenNhomSp(p.nsp) !== yc.nsp) return false; }
        const tuoi = tinhTuoi(date, t.nk);
        if (yc.tuoi === 'moi') return tuoi !== null && tuoi <= 6;
        if (yc.tuoi === 'cu') return tuoi !== null && tuoi > 6;
        if (yc.tuoi === 'cu12') return tuoi !== null && tuoi > 12;
        if (yc.tuoi === 'khong') return tuoi === null;
        return true;
      });
      const nhan = { moi: '≤ 6 tháng', cu: 'trên 6 tháng', cu12: 'trên 12 tháng', khong: 'không rõ ngày' }[yc.tuoi ?? 'cu'];
      return banTon(`Tồn${yc.tuoi ? ` ${nhan}` : ''}${yc.ct ? ` · ${yc.ct}` : ''}${tieuDeNhom}${yc.nsp ? ` · ${yc.nsp}` : ''}`, ds);
    }
    case 'phan_chia': {
      const ds = O.filter(t => a.nhomTon.get(t)?.nhom === yc.nhom && (!yc.cu || laCu(date, t.nk)));
      return banTon(`${kq.phanChia.find(p => p.k === yc.nhom)?.nhom ?? ''}${yc.cu ? ' · trên 6 tháng' : ''}`, ds);
    }
    case 'chua_xuat': {
      const ds = O.filter(t => {
        const cx = a.nhomTon.get(t)?.cx;
        return !!cx && (!coDuAn || coDuAn.has(cx.duAn)) && (!yc.nhomTuoi || yc.nhomTuoi.includes(cx.k));
      });
      const tuoi = yc.nhomTuoi?.length === 2 && yc.nhomTuoi.includes('t46') && yc.nhomTuoi.includes('t6') ? ' · từ 4 tháng'
        : yc.nhomTuoi ? ` · ${yc.nhomTuoi.map(k => TEN_TUOI[k]).join(', ')}` : '';
      return banTon(`Chưa xuất TÍNH${tuoi}${tieuDeNhom}`, ds);
    }
    case 'huy':
      return banTon(`Đơn huỷ còn trong tồn${yc.cu ? ' · trên 6 tháng' : ''}`, O.filter(t => a.dongHuy.has(t) && (yc.ct === undefined || (t.ct ?? '') === yc.ct) && (!yc.cu || laCu(date, t.nk))));
    case 'khong_psa':
      return banTon(`Tồn không có đơn trong PSA${yc.cu ? ' · trên 6 tháng' : ''}`, a.khongPsa.filter(t => (yc.ct === undefined || (t.ct ?? '') === yc.ct) && (!yc.cu || laCu(date, t.nk))));
    case 'sap_vuot': {
      const ds = a.moc6Dong.flatMap(m => m.dong).filter(t => !coDuAn || coDuAn.has(a.daTon(t)));
      return banTon(`Sắp vượt 6 tháng tới ${ngayNgan(kq.doiChieu.sapVuot.den)}${tieuDeNhom}`, ds);
    }
    case 'moc6': {
      const m = a.moc6Dong.find(x => x.moc === yc.moc)!;
      return banTon(`Sắp vượt 6 tháng tại ${ngayNgan(m.moc)}${yc.seri ? ` · ${yc.seri}` : ''}`, m.dong.filter(t => yc.seri === undefined || a.daSeri(t) === yc.seri));
    }
    case 'lo_nhap': {
      const ds = O.filter(t => yc.thang!.includes(a.thangLo(t)) && (yc.seri === undefined || a.daSeri(t) === yc.seri) && (!yc.cu || laCu(date, t.nk)));
      const nhan = yc.thang!.map(t => (t === 'truoc' ? 'trước cửa sổ' : t === 'khong' ? 'không rõ ngày' : thangVn(t))).join(', ');
      return banTon(`Tồn nhập ${nhan}${yc.seri ? ` · ${yc.seri}` : ''}${yc.cu ? ' · trên 6 tháng' : ''}`, ds);
    }
    case 'goi_cu': {
      const chon = yc.conLai ? a.goiSau.map(g => `${g.ct}|${!!g.huy}`) : [`${yc.ct}|${!!yc.huy}`];
      const khoa = new Set(chon);
      const ds = O.filter(t => laCu(date, t.nk) && khoa.has(`${t.ct ?? ''}|${a.dongHuy.has(t)}`));
      return banTon(yc.conLai ? `Hàng cũ · ${a.goiSau.length} gói còn lại` : `Hàng cũ · ${yc.ct}${yc.huy ? ' đơn huỷ' : ''}`, ds);
    }
    case 'goi_ra': case 'goi_vao': case 'vuot_moc': case 'ra': {
      const nguon = yc.loai === 'goi_vao' || yc.loai === 'vuot_moc' ? a.loVao : a.loRa;
      const dau = yc.loai === 'goi_ra' || yc.loai === 'goi_vao';
      let lo = dau ? nguon.filter(l => l.i >= a.iRa) : nguon.filter(l => l.d === yc.d);
      if (dau && yc.ct !== undefined) lo = lo.filter(l => l.ct === yc.ct);
      if (yc.conLai) { const giu = new Set(a.goiDau.filter(g => !g.huy).map(g => g.ct)); lo = lo.filter(l => !giu.has(l.ct)); }
      return banLo(a, yc, lo, tonTai, moTa);
    }
    case 'kiem_ke':
      if (yc.muc === 'huy') return banTon('Đơn huỷ còn trong sổ tồn', O.filter(t => a.dongHuy.has(t)));
      if (yc.muc === 'da_xuat') return banTon('Trạng thái ĐÃ XUẤT, vẫn trong sổ tồn', O.filter(t => laDaXuat(t.tkh)));
      return banRoiKho(a, moTa);
    case 'moc': {
      const ds = tonTai(yc.d!).filter(t => {
        if (yc.cu && !laCu(yc.d!, t.nk)) return false;
        if (coDuAn && !coDuAn.has(duAnTai(yc.d!, t.ct ?? ''))) return false;
        if (yc.phan === 'goi') return (t.ct ?? '') === a.goiCt;
        if (yc.phan === 'con') return (t.ct ?? '') !== a.goiCt;
        return true;
      });
      const nhan = yc.phan === 'goi' ? ` · ${a.goiCt ?? 'gói đứng yên'}` : yc.phan === 'con' ? ' · phần còn lại' : '';
      return banTon(`${yc.cu ? 'Hàng cũ' : 'Tồn'} tại ${ngayNgan(yc.d!)}${nhan}${tieuDeNhom}`, ds, yc.d!);
    }
    case 'so_moc': {
      const f = yc.f ?? 'v';
      const m = new Map<string, { ct: string; ten: string | null; hex: string | null; sap: string | null; dau: number; cuoi: number }>();
      const them1 = (d: string, truong: 'dau' | 'cuoi') => {
        for (const t of tonTai(d)) {
          const ct = t.ct ?? '';
          if (coDuAn && !coDuAn.has(duAnTai(d, ct))) continue;
          const v = f === 'cu' && !laCu(d, t.nk) ? 0 : t.v;
          const k = `${ct}|${t.sap}|${t.hex}`;
          const e = m.get(k) ?? { ct, ten: t.ten, hex: t.hex, sap: t.sap, dau: 0, cuoi: 0 };
          e[truong] += v;
          m.set(k, e);
        }
      };
      them1(yc.tu!, 'dau'); them1(yc.den!, 'cuoi');
      const ds = [...m.values()].filter(e => Math.abs(e.cuoi - e.dau) > 1e-9);
      return dung(`Thay đổi ${f === 'cu' ? 'hàng cũ' : 'tồn'} ${ngayNgan(yc.tu!)} đến ${ngayNgan(yc.den!)}${tieuDeNhom}`,
        [CT, TEN, HEX, SAP, HM, { k: 'dau', nhan: ngayNgan(yc.tu!), kieu: 'ty' }, { k: 'cuoi', nhan: ngayNgan(yc.den!), kieu: 'ty' }, { k: 'chenh', nhan: 'Chênh', kieu: 'ty' }],
        ds, e => e.cuoi - e.dau,
        e => ({ ct: e.ct, ten: gon(e.ten), hex: e.hex, sap: e.sap, hm: moTa(e.hex, e.sap)?.hm ?? null, dau: lam(e.dau), cuoi: lam(e.cuoi), chenh: lam(e.cuoi - e.dau) }));
    }
    case 'nhap': case 'xuat_tinh': {
      const hop = (r: { d: string; ct: string | null; ten: string | null }) =>
        (yc.ct === undefined || (r.ct ?? '') === yc.ct)
        && (!coDuAn || (!!r.ct && coDuAn.has(a.daOf(r.ct, r.ten))))
        && (yc.tu === undefined || r.d > yc.tu) && (yc.den === undefined || r.d <= yc.den)
        && (yc.denThang === undefined || r.d.slice(0, 7) <= yc.denThang);
      const cot = (nhan: string): CotChiTiet[] => [{ k: 'd', nhan: 'Ngày', kieu: 'ngay' }, { k: 'ctu', nhan: 'Chứng từ', kieu: 'chu' }, CT, HEX, HM, { k: 'sl', nhan: 'Số lượng', kieu: 'so' }, { k: 'tt', nhan, kieu: 'ty' }, { k: 'gc', nhan: 'Ghi chú', kieu: 'chu' }];
      const dongLuong = (r: { d: string; ct: string | null; hex: string | null; sl: number | null; tt: number; gc: string | null; ctu?: string | null; hm?: string | null }) =>
        ({ d: r.d, ctu: r.ctu ?? null, ct: r.ct, hex: r.hex, hm: r.hm ?? moTa(r.hex, null)?.hm ?? null, sl: r.sl, tt: lam(r.tt), gc: r.gc });
      const nhanPham = `${yc.ct ? ` · ${yc.ct}` : ''}${tieuDeNhom}${yc.tu && yc.den ? ` · ${ngayNgan(yc.tu)} đến ${ngayNgan(yc.den)}` : ''}${yc.denThang ? ` · lũy kế tới ${thangVn(yc.denThang)}` : ''}`;
      if (yc.loai === 'nhap') {
        const ds = (them.nhap ?? a.nhap).filter(r => r.d <= date && hop(r));
        return dung(`Nhập${nhanPham}`, cot('Thành tiền'), ds, r => r.tt, dongLuong);
      }
      const ds = (them.xuat ?? a.xuat).filter(r => r.d <= date && laXuatTinh(r) && hop(r) && (!yc.xuat60 || r.d >= a.d60));
      const phu = coDuAn ? [{ nhan: 'Đã nhập', gt: lam(tong(a.nhap.filter(r => r.ct && coDuAn.has(a.daOf(r.ct, r.ten))), r => r.tt)) }] : undefined;
      return dung(`Xuất TÍNH${yc.xuat60 ? ' 60 ngày' : ''}${nhanPham}`, cot('Thành tiền'), ds, r => r.tt, dongLuong, phu);
    }
    case 'chua_doi_soat': {
      const tu = dauKy(a, yc.den!);
      return banMa(a, `Chưa đối soát ${ngayNgan(tu)} đến ${ngayNgan(yc.den!)}`, 'Chưa đối soát', a.duGiua(tu, yc.den!));
    }
    case 'du': {
      if (S.length < 2) return banMa(a, 'Nhập chưa khớp', 'Dư', []);
      const tu = S[0], den = S[S.length - 1];
      if (yc.ct) return banDuHex(a, yc.ct, tu, den, tonTai, them, moTa);
      let ds = a.duGiua(tu, den);
      if (yc.conLai) ds = ds.filter(e => !a.maDu.includes(e.ct));
      else if (yc.lon) ds = ds.filter(e => a.maDu.includes(e.ct) && lam(e.du) > 0);
      if (coDuAn) ds = ds.filter(e => coDuAn.has(a.daOf(e.ct, a.tenMa(e.ct))));
      return banMa(a, `Nhập chưa khớp${yc.conLai ? ' · các mã còn lại' : yc.lon ? ' · mã lớn' : ''}${tieuDeNhom}`, 'Dư', ds);
    }
    case 'so_sach': {
      if (yc.muc === 'roi_kho') return banRoiKho(a, moTa);
      if (yc.muc === 'phan_loai') {
        const ds = [
          ...a.chuaVaoSo.map(h => ({ h, nhom: h.lap ? 'Lắp tại công trình' : 'Chờ về kho' })),
          ...a.roiKho.map(h => ({ h, nhom: 'Đã rời kho (ước)' })),
        ];
        return dung('Nhập chưa khớp · đã phân loại', [{ k: 'nhom', nhan: 'Nhóm', kieu: 'chu' }, CT, TEN, HEX, HM, { k: 'ton', nhan: 'Tồn', kieu: 'ty' }, { k: 'du', nhan: 'Dư', kieu: 'ty' }],
          ds, x => x.h.gt,
          ({ h, nhom }) => ({ nhom, ct: h.ct, ten: gon(h.ten), hex: h.hex, hm: moTa(h.hex, null)?.hm ?? null, ton: lam(h.ton), du: lam(h.gt) }));
      }
      if (yc.muc === 'chua_ro') {
        const pl = new Map<string, number>();
        for (const h of [...a.chuaVaoSo, ...a.roiKho]) pl.set(h.ct ?? '', (pl.get(h.ct ?? '') ?? 0) + h.gt);
        const ds = S.length >= 2 ? a.duGiua(S[0], S[S.length - 1]) : [];
        const dong = new Map(ds.map(e => [e.ct, { ...e, pl: 0 }]));
        for (const [ct, gt] of pl) {
          const e = dong.get(ct) ?? { ct, dau: 0, nhap: 0, xuat: 0, cuoi: 0, du: 0, pl: 0 };
          e.pl = gt; dong.set(ct, e);
        }
        return dung('Nhập chưa khớp · chưa rõ', [...COT_MA('Dư').slice(0, -1), { k: 'du', nhan: 'Dư', kieu: 'ty' }, { k: 'pl', nhan: 'Đã phân loại', kieu: 'ty' }, { k: 'chuaRo', nhan: 'Chưa rõ', kieu: 'ty' }],
          [...dong.values()].filter(e => Math.abs(e.du - e.pl) > 1e-9), e => e.du - e.pl,
          e => ({ ...dongMa(a, e), pl: lam(e.pl), chuaRo: lam(e.du - e.pl) }));
      }
      const lap = yc.muc === 'lap_ct';
      const ds = a.chuaVaoSo.filter(h => h.lap === lap);
      return dung(lap ? 'Lắp tại công trình' : 'Chờ về kho',
        [CT, TEN, HEX, HM, { k: 'nhap', nhan: 'Nhập', kieu: 'ty' }, { k: 'sl', nhan: 'SL nhập', kieu: 'so' }, { k: 'ton', nhan: 'Tồn', kieu: 'ty' }, { k: 'du', nhan: 'Dư', kieu: 'ty' }, { k: 'gc', nhan: 'Ghi chú', kieu: 'chu' }],
        ds, h => h.gt,
        h => ({ ct: h.ct, ten: gon(h.ten), hex: h.hex, hm: moTa(h.hex, null)?.hm ?? null, nhap: lam(h.nhap), sl: h.sl, ton: lam(h.ton), du: lam(h.gt), gc: h.gc }));
    }
    case 'da_nhap': case 'don_chua_nhap': {
      const nguon: DongDon[] = them.don ?? input.psaNhom.map(p => ({ hex: null, hm: null, ...p }));
      const conLaiDon = yc.loai === 'don_chua_nhap';
      const ds = nguon.filter(p => !laHuy(p.tn, p.ipo) && coDuAn!.has(a.daOf(p.ct, p.ten)) && (!conLaiDon || laDonCon(p)));
      const raDong = (p: DongDon) => ({ ct: p.ct, ten: gon(p.ten), hex: p.hex, hm: p.hm, ipo: p.ipo, gtd: lam(p.gtd), nhapCap: lam(p.nhapCap), con: lam(p.con) });
      return conLaiDon
        ? dung(`Đơn chưa nhập${tieuDeNhom}`, COT_DON, ds.filter(p => p.con), p => p.con, raDong)
        : dung(`Đơn đã nhập${tieuDeNhom}`, COT_DON, ds, p => p.nhapCap, raDong, [{ nhan: 'Giá trị đơn', gt: lam(tong(ds, p => p.gtd)) }]);
    }
    default:
      throw new LoiChiTiet('loai không hợp lệ');
  }
};

const dongMa = (a: PhanTichV5, e: { ct: string; dau: number; nhap: number; xuat: number; cuoi: number; du: number }) => ({
  ct: e.ct || null, ten: e.ct ? gon(a.tenMa(e.ct)) : 'Không gán được mã', dau: lam(e.dau), nhap: lam(e.nhap), xuat: lam(e.xuat), cuoi: lam(e.cuoi), du: lam(e.du),
});
const banMa = (a: PhanTichV5, tieuDe: string, nhanDu: string, ds: ReturnType<PhanTichV5['duGiua']>) =>
  dung(tieuDe, COT_MA(nhanDu), ds.filter(e => Math.abs(e.du) > 1e-9), e => e.du, e => dongMa(a, e));

const banRoiKho = (a: PhanTichV5, moTa: (hex: string | null, sap: string | null) => MoTaHang | null) =>
  dung('Đã rời kho (ước)',
    [CT, TEN, HEX, HM, { k: 'sl', nhan: 'SL tồn', kieu: 'so' }, { k: 'giao', nhan: 'SL giao ghi chú', kieu: 'so' }, { k: 'xuatSl', nhan: 'SL xuất TÍNH', kieu: 'so' }, { k: 'ton', nhan: 'Tồn', kieu: 'ty' }, { k: 'du', nhan: 'Đã rời kho', kieu: 'ty' }],
    a.roiKho, h => h.gt,
    h => ({ ct: h.ct, ten: gon(h.ten), hex: h.hex, hm: moTa(h.hex, null)?.hm ?? null, sl: h.sl, giao: h.giao, xuatSl: h.xuatSl, ton: lam(h.ton), du: lam(h.gt) }));

/** Lô vượt mốc / ra: HEX và hạng mục lấy từ dòng lớn nhất của lô tại mốc đo */
const banLo = (a: PhanTichV5, yc: YeuCauChiTiet, lo: DongLo[], tonTai: (d: string) => DongTon[], moTa: (hex: string | null, sap: string | null) => MoTaHang | null) => {
  const vao = yc.loai === 'vuot_moc' || yc.loai === 'goi_vao';
  const nhom = new Map<string, Map<string, DongTon>>();
  const dongLo = (d: string) => {
    let m = nhom.get(d);
    if (!m) {
      m = new Map();
      for (const t of tonTai(d)) {
        const k = `${t.sap}|${t.ct ?? ''}|${t.nk}`, c = m.get(k);
        if (!c || t.v > c.v) m.set(k, t);
      }
      nhom.set(d, m);
    }
    return m;
  };
  const tieuDe = yc.loai === 'vuot_moc' ? `Vượt mốc 6 tháng tại ${ngayNgan(yc.d!)}` : yc.loai === 'ra' ? `Hàng cũ ra tại ${ngayNgan(yc.d!)}`
    : `${vao ? 'Hàng cũ vào' : 'Hàng cũ ra'} ${a.kq.goiCu.ngay} ngày${yc.ct ? ` · ${yc.ct}` : ''}${yc.conLai ? ' · gói còn lại' : ''}`;
  const cot: CotChiTiet[] = vao ? [...COT_LO, GT]
    : [...COT_LO, { k: 'dau', nhan: 'Mốc đầu', kieu: 'ty' }, { k: 'cuoi', nhan: 'Mốc cuối', kieu: 'ty' }, { k: 'ra', nhan: 'Ra', kieu: 'ty' }];
  return dung(tieuDe, cot, lo, l => l.gt, l => {
    const t = dongLo(vao ? l.d : l.A).get(`${l.sap}|${l.ct}|${l.nk}`);
    const hex = t?.hex ?? null;
    const goc = { d: l.d, ct: l.ct, ten: gon(l.ten), hex, sap: l.sap, hm: moTa(hex, l.sap)?.hm ?? null, nk: l.nk };
    return vao ? { ...goc, v: lam(l.gt) } : { ...goc, dau: lam(l.dau), cuoi: lam(l.cuoi), ra: lam(l.gt) };
  });
};

/** Dư của 1 mã trên khoảng tu..den, tách theo HEX: tồn đọc 2 mốc, nhập/xuất đọc dòng thật */
const banDuHex = (a: PhanTichV5, ct: string, tu: string, den: string, tonTai: (d: string) => DongTon[], them: DocThem, moTa: (hex: string | null, sap: string | null) => MoTaHang | null) => {
  const m = new Map<string, { hex: string | null; sap: string | null; dau: number; nhap: number; xuat: number; cuoi: number }>();
  const lay = (hex: string | null, sap: string | null) => {
    const k = hex ?? `sap:${sap}`;
    let e = m.get(k);
    if (!e) { e = { hex, sap, dau: 0, nhap: 0, xuat: 0, cuoi: 0 }; m.set(k, e); }
    return e;
  };
  for (const t of tonTai(tu)) if ((t.ct ?? '') === ct) lay(t.hex, t.sap).dau += t.v;
  for (const t of tonTai(den)) if ((t.ct ?? '') === ct) lay(t.hex, t.sap).cuoi += t.v;
  const hop = (r: { d: string; ct: string | null }) => r.ct === ct && r.d > tu && r.d <= den;
  for (const r of them.nhap ?? a.nhap) if (hop(r)) lay(r.hex, null).nhap += r.tt;
  for (const r of them.xuat ?? a.xuat) if (hop(r) && laXuatTinh(r)) lay(r.hex, null).xuat += r.tt;
  const du = (e: { dau: number; nhap: number; xuat: number; cuoi: number }) => e.dau + e.nhap - e.cuoi - e.xuat;
  return dung(`Nhập chưa khớp · ${ct}`,
    [HEX, SAP, HM, { k: 'dau', nhan: 'Tồn đầu', kieu: 'ty' }, { k: 'nhap', nhan: 'Nhập', kieu: 'ty' }, { k: 'xuat', nhan: 'Xuất TÍNH', kieu: 'ty' }, { k: 'cuoi', nhan: 'Tồn cuối', kieu: 'ty' }, { k: 'du', nhan: 'Dư', kieu: 'ty' }],
    [...m.values()].filter(e => Math.abs(du(e)) > 1e-9), du,
    e => ({ hex: e.hex, sap: e.sap, hm: moTa(e.hex, e.sap)?.hm ?? null, dau: lam(e.dau), nhap: lam(e.nhap), xuat: lam(e.xuat), cuoi: lam(e.cuoi), du: lam(du(e)) }));
};
