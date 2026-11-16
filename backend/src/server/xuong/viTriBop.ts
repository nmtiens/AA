import crypto from 'node:crypto';
import { coDbMra, poolMra } from '../../db.js';
import { vnDayKey } from '../common.js';
import { suKienConHieuLuc, tuyenTheoThanhPhan } from './state.js';
import type { SuKien } from './types.js';

// ============================================================================
// VỊ TRÍ BOP THEO MRA — hạng mục đã triển khai ở xưởng đang ở mã BOP nào (P012…P021) + mốc tính số ngày.
// Operations Hub phủ kết quả lên cột bop / so_ngay_cd_hien_tai của dòng sản xuất (frontend viTriMra.ts).
// Phía phủ quyết định dòng nào được phủ: hạng mục ĐÃ triển khai thì phủ cả khi PC còn P001/P002 (hàng đã vào
// xưởng, PC đang trễ); KHÔNG phủ P022/P025, GCVT, dòng HỦY. Ở đây chỉ dựng bản đồ hex -> vị trí.
// Phần thuần (chuanTen … dungBanDo) không chạm DB để test; phần đọc DB ở cuối file (poolMra).
// ============================================================================

export type MaBop = 'P012' | 'P013' | 'P014' | 'P016' | 'P018' | 'P020' | 'P021';
export type ViTriMra = {
  ma: MaBop;
  /** ISO, mốc tính số ngày */
  tu: string | null;
  /** tên CĐ chi tiết của (các) dòng được chọn */
  cd: string[];
  /** cho_nhan|da_nhan|dang_lam|tam_ngung|cho_giao, hoặc 'trien_khai' khi chưa có dòng */
  trangThai: string;
};
export type ThongKeViTri = { soHex: number; chuaNoi: string[]; giuPc: number };
export type BanDoMra = { ver: string; map: Record<string, ViTriMra> };
export type BanDoDayDu = BanDoMra & { tinhLuc: string | null; thongKe: ThongKeViTri };

/** Dòng xuong_trang_thai (+ danh mục công đoạn) đã chuẩn hoá */
export type DongViTri = {
  hex: string; congDoanId: string; xuong: string | null; trangThai: string; slNhan: number;
  suKienCuoi: string | null; dangChayTu: string | null;
};
/** Một công đoạn trong danh mục */
export type CongDoanViTri = {
  id: string; xuong: string | null; tenCd: string | null; cdChiTiet: string | null; thuTu: number | null;
  laBaoBi: boolean; maBop?: string | null;
};

// Thứ tự BOP (bản sao BOP_STAGE_ORDER ở frontend/utils/productionMetrics.ts)
const THU_TU_BOP = ['P001', 'P002', 'P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021', 'P022', 'P025'];
const MA_HOP_LE = new Set<string>(['P012', 'P013', 'P014', 'P016', 'P018', 'P020', 'P021']);
const hangBop = (ma: string) => THU_TU_BOP.indexOf(ma);

/** Viết hoa, bỏ dấu (đ→D), gộp khoảng trắng, bỏ tiền tố xưởng "4A-" / "8AB-" */
export function chuanTen(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toUpperCase().replace(/\s+/g, ' ').trim().replace(/^\d+[A-Z]*-\s*/, '');
}

// Cụm đặc biệt xét trước bảng luật (tên thật: "MÁY TINH GỖ 1" là máy tinh, "ÉP NGUỘI" là ép ván)
const CUM_DAC_BIET: Array<[string, MaBop]> = [['MAY TINH', 'P014'], ['EP NGUOI', 'P013']];
// Tên công đoạn chi tiết không có từ khoá chung: gán theo ĐÚNG cả tên (chờ quản lý xưởng duyệt / sau này cột ma_bop).
// "ĐÁ" phải so cả tên, không so từ, để "CẮT DA VẢI" không thành đá
const TEN_DUNG: Record<string, MaBop> = {
  'DAN CANH': 'P014', TUBI: 'P014', KINH: 'P014', DA: 'P014', 'DONG NHOM': 'P016', RESIN: 'P018',
};
// Luật theo thứ tự; GIU_TRUOC = lấy mã công đoạn đứng trước (giao nhận)
const LUAT: Array<[string[], MaBop | 'GIU_TRUOC']> = [
  [['BAO BI'], 'P021'],
  [['GIAO NHAN'], 'GIU_TRUOC'],
  [['FITTING', 'DAM VA', 'DAN MOUSSE'], 'P020'],
  [['VECNI', 'SON', 'UV', 'PVD'], 'P018'],
  [['MOC', 'LAP RAP', 'HAN', 'NGUOI', 'MAY', 'BOC NEM'], 'P016'],
  [['TINH', 'CNC', 'CHA NHAM', 'CTS'], 'P014'],
  [['CAT', 'LAMINATE', 'EP', 'PHOI', 'VAN LANG'], 'P013'],
];
const reTu = new Map<string, RegExp>();
const coTu = (s: string, kw: string) => {
  let re = reTu.get(kw);
  if (!re) { re = new RegExp(`(^|[^A-Z])${kw}([^A-Z]|$)`); reTu.set(kw, re); }
  return re.test(s);
};

function theoLuat(s: string, laTenCd: boolean): MaBop | 'GIU_TRUOC' | null {
  if (!s) return null;
  if (!laTenCd && TEN_DUNG[s]) return TEN_DUNG[s];
  for (const [kw, ma] of CUM_DAC_BIET) if (coTu(s, kw)) return ma;
  for (const [ds, ma] of LUAT) {
    // ten_cd "4A-MÁY" là tổ máy móc, không phải may (sofa) => bỏ từ MAY khi xét ten_cd
    if (ds.some(kw => !(laTenCd && kw === 'MAY') && coTu(s, kw))) return ma;
  }
  return null;
}

/** Gợi ý mã BOP của một công đoạn: ma_bop ghi đè > la_bao_bi > cd_chi_tiet > ten_cd */
export function goiYMaBop(cdChiTiet: unknown, tenCd: unknown, laBaoBi: boolean, maBopGhiDe?: string | null): MaBop | 'GIU_TRUOC' | null {
  const ghiDe = String(maBopGhiDe ?? '').trim().toUpperCase();
  if (/^P0\d\d$/.test(ghiDe) && MA_HOP_LE.has(ghiDe)) return ghiDe as MaBop;
  if (laBaoBi) return 'P021';
  return theoLuat(chuanTen(cdChiTiet), false) ?? theoLuat(chuanTen(tenCd), true);
}

const goiYCua = (cd: CongDoanViTri | undefined) => (cd ? goiYMaBop(cd.cdChiTiet, cd.tenCd, cd.laBaoBi, cd.maBop) : null);

/**
 * Mã BOP của một công đoạn; giao nhận lấy mã công đoạn đứng trước: trước hết theo tuyến của hạng mục (nếu có),
 * không có thì công đoạn cùng xưởng có thu_tu lớn nhất mà nhỏ hơn; không có gì thì P013.
 */
export function maCongDoan(cd: CongDoanViTri, dsCdCungXuong: CongDoanViTri[], tuyen: string[][] = [], cdTheoId?: Map<string, CongDoanViTri>): MaBop | null {
  const g = goiYCua(cd);
  if (g !== 'GIU_TRUOC') return g;
  for (const t of tuyen) {
    const i = t.indexOf(cd.id);
    for (let j = i - 1; j >= 0; j--) {
      const m = goiYCua(cdTheoId?.get(t[j]) ?? dsCdCungXuong.find(x => x.id === t[j]));
      if (m && m !== 'GIU_TRUOC') return m;
    }
  }
  const tt = cd.thuTu ?? 0;
  const truoc = dsCdCungXuong
    .filter(x => x.id !== cd.id && x.xuong === cd.xuong && (x.thuTu ?? 0) < tt)
    .map(x => ({ x, m: goiYCua(x) }))
    .filter((v): v is { x: CongDoanViTri; m: MaBop } => !!v.m && v.m !== 'GIU_TRUOC')
    .sort((a, b) => (b.x.thuTu ?? 0) - (a.x.thuTu ?? 0));
  return truoc[0]?.m ?? 'P013';
}

const iso = (v: unknown) => { const t = v ? new Date(v as string).getTime() : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const msCua = (s: string | null) => (s ? new Date(s).getTime() : Infinity);

export type TuyChonViTri = { p012KhiChuaNhan?: boolean };

/**
 * Vị trí của MỘT hạng mục. null = giữ PC (chưa triển khai / huỷ hết, đã xong mọi công đoạn, không nối được mã).
 * chuaNoi: tên công đoạn không ra mã được đẩy vào đây; giuPc() gọi khi mọi dòng đã xong.
 */
export function chonViTri(
  vao: { dong: DongViTri[]; suKien: SuKien[]; cdTheoId: Map<string, CongDoanViTri>; dsCongDoan?: CongDoanViTri[] },
  opt: TuyChonViTri & { chuaNoi?: Set<string>; giuPc?: () => void } = {},
): ViTriMra | null {
  const conHl = suKienConHieuLuc(vao.suKien);
  const tk = conHl.filter(e => e.loai === 'trien_khai');
  if (tk.reduce((a, e) => a + (Number(e.soLuong) || 0), 0) <= 0) return null;
  // Đã triển khai, chưa công đoạn nào có dòng
  if (!vao.dong.length) {
    const ms = Math.max(...tk.map(e => e.serverTs).filter(Number.isFinite));
    return { ma: 'P012', tu: Number.isFinite(ms) ? new Date(ms).toISOString() : null, cd: [], trangThai: 'trien_khai' };
  }
  const chuaXong = vao.dong.filter(d => d.trangThai !== 'xong');
  if (!chuaXong.length) { opt.giuPc?.(); return null; }
  const tenCua = (d: DongViTri) => vao.cdTheoId.get(d.congDoanId)?.cdChiTiet ?? d.congDoanId;
  // Chưa tổ nào nhận (mọi dòng chờ nhận, sl_nhan = 0) => P012
  if ((opt.p012KhiChuaNhan ?? true) && chuaXong.length === vao.dong.length
    && chuaXong.every(d => d.trangThai === 'cho_nhan' && !(d.slNhan > 0))) {
    const cu = [...chuaXong].sort((a, b) => msCua(a.suKienCuoi) - msCua(b.suKienCuoi))[0];
    return { ma: 'P012', tu: cu.suKienCuoi, cd: [...new Set(chuaXong.map(tenCua))], trangThai: 'cho_nhan' };
  }
  const tuyen = tuyenTheoThanhPhan(vao.suKien).map(t => t.tuyen);
  const ds = vao.dsCongDoan ?? [...vao.cdTheoId.values()];
  const ung: Array<{ d: DongViTri; ma: MaBop; tu: string | null }> = [];
  for (const d of chuaXong) {
    const cd = vao.cdTheoId.get(d.congDoanId);
    const ma = cd ? maCongDoan(cd, ds, tuyen, vao.cdTheoId) : null;
    if (!ma) { opt.chuaNoi?.add(tenCua(d)); continue; }
    // Đang làm: từ lúc bắt đầu chạy; trạng thái khác: lúc thao tác cuối (giống hex-tom-tat)
    const tu = d.trangThai === 'dang_lam' ? d.dangChayTu ?? d.suKienCuoi : d.suKienCuoi ?? d.dangChayTu;
    ung.push({ d, ma, tu });
  }
  if (!ung.length) return null;
  const hang = Math.min(...ung.map(u => hangBop(u.ma)));
  const chon = ung.filter(u => hangBop(u.ma) === hang).sort((a, b) => msCua(a.tu) - msCua(b.tu));
  return { ma: chon[0].ma, tu: chon[0].tu, cd: [...new Set(chon.map(u => tenCua(u.d)))], trangThai: chon[0].d.trangThai };
}

/** Bản đồ hex -> vị trí cho mọi hạng mục có dòng trạng thái hoặc sự kiện triển khai */
export function dungBanDo(dong: DongViTri[], suKien: SuKien[], cd: CongDoanViTri[], opt: TuyChonViTri = {}): { map: Record<string, ViTriMra>; thongKe: ThongKeViTri } {
  const cdTheoId = new Map(cd.map(x => [x.id, x]));
  const dongTheoHex = new Map<string, DongViTri[]>();
  for (const d of dong) { if (!dongTheoHex.has(d.hex)) dongTheoHex.set(d.hex, []); dongTheoHex.get(d.hex)!.push(d); }
  const evTheoHex = new Map<string, SuKien[]>();
  for (const e of suKien) {
    if (!e.hex) continue;
    if (!evTheoHex.has(e.hex)) evTheoHex.set(e.hex, []);
    evTheoHex.get(e.hex)!.push(e);
  }
  const map: Record<string, ViTriMra> = {};
  const chuaNoi = new Set<string>();
  let giuPc = 0;
  for (const hex of new Set([...dongTheoHex.keys(), ...evTheoHex.keys()])) {
    const v = chonViTri({ dong: dongTheoHex.get(hex) ?? [], suKien: evTheoHex.get(hex) ?? [], cdTheoId, dsCongDoan: cd },
      { ...opt, chuaNoi, giuPc: () => { giuPc++; } });
    if (v) map[hex] = v;
  }
  return { map, thongKe: { soHex: Object.keys(map).length, chuaNoi: [...chuaNoi].sort((a, b) => a.localeCompare(b, 'vi')), giuPc } };
}

/**
 * ver = sha1 của phần bản đồ ẢNH HƯỞNG kết quả phủ: [hex, mã, tên CĐ, NGÀY (giờ VN) của mốc tu].
 * Không băm trangThai và mốc tu tới mili giây: tu của dòng không 'dang_lam' là su_kien_cuoi, đổi mỗi lần tổ quét /
 * nhận hàng, băm vào thì ver đổi liên tục => trình duyệt và cache Tổng quan tính lại cả bảng dù mã / số ngày không đổi.
 * Phủ chỉ hiện ngày của tu (mra_tu, HexDetailModal) nên giữ bản cũ khi chỉ giờ trong ngày đổi là đủ.
 */
export function verBanDo(map: Record<string, ViTriMra>): string {
  const ngay = (tu: string | null) => { const t = tu ? new Date(tu) : null; return t && Number.isFinite(t.getTime()) ? vnDayKey(t) : ''; };
  const sap = Object.keys(map).sort().map(k => [k, map[k].ma, map[k].cd, ngay(map[k].tu)]);
  return crypto.createHash('sha1').update(JSON.stringify(sap)).digest('hex').slice(0, 16);
}

export const BAN_DO_TAT: BanDoDayDu = Object.freeze({ ver: 'off', map: {}, tinhLuc: null, thongKe: { soHex: 0, chuaNoi: [], giuPc: 0 } }) as BanDoDayDu;

// ---------------------------------------------------------------------------
// Chuyển dòng DB -> kiểu thuần
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
export const thanhDong = (x: Row): DongViTri => ({
  hex: String(x.hex), congDoanId: String(x.cong_doan_id), xuong: x.xuong ?? null, trangThai: String(x.trang_thai),
  slNhan: Number(x.sl_nhan ?? 0) || 0, suKienCuoi: iso(x.su_kien_cuoi), dangChayTu: iso(x.dang_chay_tu),
});
export const thanhCongDoan = (x: Row): CongDoanViTri => ({
  id: String(x.id), xuong: x.xuong ?? null, tenCd: x.ten_cd ?? null, cdChiTiet: x.cd_chi_tiet ?? null,
  thuTu: x.thu_tu === null || x.thu_tu === undefined ? null : Number(x.thu_tu), laBaoBi: !!x.la_bao_bi, maBop: x.ma_bop ?? null,
});
/** Giống toSuKien ở routes/xuong.ts (không import routes vào server) */
export const thanhSuKien = (r: Row): SuKien => ({
  id: String(r.id), loai: r.loai, hex: r.hex ?? null, congDoanId: r.cong_doan_id ?? null,
  toId: r.to_id === null || r.to_id === undefined ? null : Number(r.to_id),
  soLuong: r.so_luong === null || r.so_luong === undefined || r.so_luong === '' ? null : Number(r.so_luong),
  congDoanDenId: r.cong_doan_den_id ?? null, congDoanNguonId: r.cong_doan_nguon_id ?? null, xuongNguon: r.xuong_nguon ?? null,
  soNguoi: r.so_nguoi === null || r.so_nguoi === undefined ? null : Number(r.so_nguoi), lyDoTamNgung: r.ly_do_tam_ngung ?? null,
  duLieu: r.du_lieu ?? null, ts: new Date(r.device_ts_hieu_chinh).getTime(), serverTs: new Date(r.server_ts).getTime(),
  suaCho: r.sua_cho ? String(r.sua_cho) : null,
});

// ---------------------------------------------------------------------------
// ĐỌC DB MRA
// ---------------------------------------------------------------------------
type Truyvan = (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
const truyVanMra: Truyvan = (sql, params) => poolMra.query(sql, params);

const COT_DONG = `t.hex, t.xuong, t.cong_doan_id, t.trang_thai, t.sl_hoan_thanh::float AS h, t.sl_nhan::float AS sl_nhan,
  t.su_kien_cuoi, t.dang_chay_tu, c.cd_chi_tiet, c.thu_tu, c.ten_cd, c.la_bao_bi`;
// Đủ cột cho toSuKien / thanhSuKien
const COT_SK = `e.id, e.loai, e.hex, e.cong_doan_id, e.to_id, e.xuong, e.so_luong, e.cong_doan_den_id, e.cong_doan_nguon_id,
  e.xuong_nguon, e.so_nguoi, e.ly_do_tam_ngung, e.tien_do, e.ghi_chu, e.du_lieu, e.device_ts, e.lech_ms, e.device_ts_hieu_chinh,
  e.server_ts, e.user_id, e.user_id_khai, e.sent_by, e.device_id, e.sua_cho, e.nguon, e.nguoi_thao_tac_goc, e.co`;
const LOC_SK = `e.nguon = 'app' AND e.loai IN ('trien_khai', 'khai_bao_cd', 'huy')`;

/**
 * Dòng trạng thái (+ tên công đoạn) và sự kiện quyết định tuyến / số triển khai (+ huỷ).
 * 'tat-ca': hạng mục còn ít nhất một dòng chưa xong (lấy đủ mọi dòng) + hạng mục đã triển khai mà chưa có dòng.
 */
export async function docTrangThaiMra(hexes: string[] | 'tat-ca', q: Truyvan = truyVanMra): Promise<{ dong: Row[]; suKien: Row[] }> {
  if (hexes !== 'tat-ca') {
    if (!hexes.length) return { dong: [], suKien: [] };
    const [r, ev] = await Promise.all([
      q(`SELECT ${COT_DONG} FROM xuong_trang_thai t LEFT JOIN xuong_cong_doan c ON c.id = t.cong_doan_id
         WHERE t.hex = ANY($1::text[])`, [hexes]),
      q(`SELECT ${COT_SK} FROM xuong_su_kien e WHERE e.hex = ANY($1::text[]) AND ${LOC_SK}`, [hexes]),
    ]);
    return { dong: r.rows, suKien: ev.rows };
  }
  const conDo = `SELECT DISTINCT hex FROM xuong_trang_thai WHERE trang_thai <> 'xong'`;
  const [r, ev] = await Promise.all([
    q(`SELECT ${COT_DONG} FROM xuong_trang_thai t LEFT JOIN xuong_cong_doan c ON c.id = t.cong_doan_id
       WHERE t.hex IN (${conDo})`),
    q(`SELECT ${COT_SK} FROM xuong_su_kien e WHERE ${LOC_SK}
         AND (e.hex IN (${conDo})
           OR (NOT EXISTS (SELECT 1 FROM xuong_trang_thai t WHERE t.hex = e.hex)
               AND EXISTS (SELECT 1 FROM xuong_su_kien k WHERE k.hex = e.hex AND k.loai = 'trien_khai' AND k.nguon = 'app')))`),
  ]);
  return { dong: r.rows, suKien: ev.rows };
}

/** Bảng xuong_cong_doan đã có cột ma_bop chưa (đọc một lần) */
let coMaBop: boolean | null = null;
export async function coCotMaBop(q: Truyvan = truyVanMra): Promise<boolean> {
  if (coMaBop !== null) return coMaBop;
  const r = await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'xuong_cong_doan' AND column_name = 'ma_bop' LIMIT 1`);
  coMaBop = r.rows.length > 0;
  return coMaBop;
}

const DO_MS = 30_000;          // dò phiên bản tối đa 30 giây một lần (lỗi cũng chờ chừng ấy mới thử lại)
const DUNG_LAI_MS = 600_000;   // không đổi vẫn dựng lại sau 10 phút
const CHO_TOI_DA_MS = 3_000;   // đã có bản cũ: chờ dò / dựng lại tối đa chừng này rồi trả bản cũ (Tổng quan không chờ Supabase)

/**
 * Chuỗi dò phiên bản (1 lệnh): count(*) + max(cap_nhat) của xuong_trang_thai (upsert luôn đặt cap_nhat = now())
 * + max(server_ts) của sự kiện triển khai / huỷ / khai CĐ (nguon='app'): hạng mục triển khai mà CHƯA có dòng
 * trạng thái (P012 không kèm dòng) hoặc huỷ đợt kiểu đó không đổi xuong_trang_thai. Sự kiện chỉ ghi thêm (sửa = sự
 * kiện mới) nên max(server_ts) là đủ; index riêng phần: sql/supabase/2026-11-11_xuong_su_kien_vi_tri.sql.
 */
const SQL_DO = `SELECT (SELECT count(*)::int FROM xuong_trang_thai) AS n, (SELECT max(cap_nhat) FROM xuong_trang_thai) AS m,
  (SELECT max(server_ts) FROM xuong_su_kien WHERE nguon = 'app' AND loai IN ('trien_khai', 'khai_bao_cd', 'huy')) AS e`;
/**
 * Số hạng mục có dòng trạng thái mà mọi dòng đã xong (giữ PC). docTrangThaiMra('tat-ca') không nạp các hạng mục
 * này nên dungBanDo không tự đếm được.
 */
const SQL_GIU_PC = `SELECT count(1)::int AS so_giu FROM (SELECT hex FROM xuong_trang_thai GROUP BY hex
  HAVING bool_and(trang_thai = 'xong')) x`;

/**
 * Nguồn bản đồ có nhớ: giữ 1 bản, gộp lời gọi đang chạy, dò phiên bản (SQL_DO) tối đa DO_MS một lần.
 * Lỗi (Supabase chập chờn / quá statement_timeout): đã có bản thì trả bản cũ, chưa có thì ném lỗi (chạy theo PC);
 * cả hai trường hợp đều chờ DO_MS mới thử lại, không để mỗi request chạy lại truy vấn nặng.
 * Không dùng cache chung / all_data_snapshot.
 */
export function taoNguonBanDo(deps: { tat: () => boolean; q: Truyvan; bayGio?: () => number; opt?: TuyChonViTri }) {
  const bayGio = deps.bayGio ?? Date.now;
  let ban: BanDoDayDu | null = null;
  let dau = '';
  let lucDo = 0;
  let lucDung = 0;
  let dangChay: Promise<BanDoDayDu> | null = null;
  let daBaoTat = false;
  let loi: { luc: number; e: unknown } | null = null;

  async function chay(): Promise<BanDoDayDu> {
    const r = await deps.q(SQL_DO);
    const dauMoi = `${r.rows[0]?.n ?? 0}|${iso(r.rows[0]?.m) ?? ''}|${iso(r.rows[0]?.e) ?? ''}`;
    const now = bayGio();
    lucDo = now;
    if (ban && dauMoi === dau && now - lucDung < DUNG_LAI_MS) return ban;
    const [doc, coCot, giu] = await Promise.all([docTrangThaiMra('tat-ca', deps.q), coCotMaBop(deps.q), deps.q(SQL_GIU_PC)]);
    const dm = await deps.q(`SELECT id, xuong, ten_cd, cd_chi_tiet, thu_tu, la_bao_bi${coCot ? ', ma_bop' : ''} FROM xuong_cong_doan`);
    const dung = dungBanDo(doc.dong.map(thanhDong), doc.suKien.map(thanhSuKien), dm.rows.map(thanhCongDoan), deps.opt);
    const { map } = dung;
    const thongKe = { ...dung.thongKe, giuPc: dung.thongKe.giuPc + (Number(giu.rows[0]?.so_giu) || 0) };
    const ver = verBanDo(map);
    ban = ban && ban.ver === ver ? { ...ban, thongKe } : { ver, map, tinhLuc: new Date(now).toISOString(), thongKe };
    dau = dauMoi;
    lucDung = now;
    return ban;
  }

  return async function layBanDo(): Promise<BanDoDayDu> {
    if (deps.tat()) {
      if (!daBaoTat) { daBaoTat = true; console.warn('[vi-tri-bop] tắt phủ vị trí MRA (chưa có DB MRA riêng hoặc PHU_VI_TRI_MRA=0)'); }
      return BAN_DO_TAT;
    }
    if (ban && bayGio() - lucDo < DO_MS) return ban;
    // Chưa có bản nào và vừa lỗi: báo lỗi luôn, chưa thử lại
    if (!ban && loi && bayGio() - loi.luc < DO_MS) throw loi.e;
    if (!dangChay) {
      dangChay = chay()
        .then(b => { loi = null; return b; })
        .catch((e: unknown) => {
          lucDo = bayGio();
          loi = { luc: lucDo, e };
          if (ban) { console.warn('[vi-tri-bop] dò / dựng bản đồ MRA lỗi, dùng bản cũ', ban.ver, e); return ban; }
          throw e;
        })
        .finally(() => { dangChay = null; });
    }
    const p = dangChay;
    if (!ban) return p;
    // Đã có bản cũ: Supabase chậm thì trả bản cũ sau CHO_TOI_DA_MS, lượt dò vẫn chạy tiếp và cập nhật cho lần sau
    const cu = ban;
    let hen: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([p, new Promise<BanDoDayDu>(r => { hen = setTimeout(() => r(cu), CHO_TOI_DA_MS); })])
      .finally(() => clearTimeout(hen));
  };
}

/** Bản đồ vị trí MRA dùng chung (route vi-tri-bop, Tổng quan, route hex) */
export const layBanDoViTri = taoNguonBanDo({
  tat: () => !coDbMra || process.env.PHU_VI_TRI_MRA === '0',
  q: truyVanMra,
});
