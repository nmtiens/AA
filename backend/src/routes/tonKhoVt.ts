import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';
import { createCache, cachedByVersions, hashKey } from '../server/cache.js';
import { userHasPermission, MATERIAL_PRICE_PERMISSION } from '../server/permissions.js';

// ============================================================================
// TỒN KHO VẬT TƯ (bảng ton_kho_vt) — trang báo cáo biểu đồ vật tư theo ngày / tháng
//   GET /api/ton-kho-vt/tong-hop                          giá trị / số mã theo (lần chốt, nhóm vật tư)
//   POST /api/ton-kho-vt/tong-hop { nhom, ten[] }         như trên nhưng CHỈ 1 nhóm và các tên vật tư đã chọn (bộ lọc
//                                                         riêng của từng biểu đồ trên trang)
//   GET /api/ton-kho-vt/ten-vat-tu?nhom=…                 danh sách tên vật tư của 1 nhóm (cho bộ lọc của biểu đồ đó)
//   GET /api/ton-kho-vt/chi-tiet?ngay=YYYY-MM-DD&nhom=…&truoc=YYYY-MM-DD
//                                                         từng mã tại 1 lần chốt, so với lần chốt `truoc` (giao diện
//                                                         gửi điểm liền trước trên biểu đồ: theo tháng = cuối tháng
//                                                         trước); bỏ trống `truoc` = lần chốt liền trước
//   POST /api/ton-kho-vt/chi-tiet { ngay, nhom, truoc?, ten? }  như trên + lọc theo tên vật tư (thân JSON: danh sách
//                                                         tên có thể dài, không để trên URL)
//
// - Bảng do ETL nạp hằng tuần: mỗi lần chốt (cột `date`, thứ Năm) là 1 ẢNH CHỤP tồn kho, gần như 1 dòng / mã.
//   KHÔNG BAO GIỜ cộng nhiều lần chốt với nhau (cùng quy tắc [SNAPSHOT FIX] của ton_kho ở server/data.ts) — xem
//   theo tháng = lấy lần chốt CUỐI CÙNG trong tháng (giao diện tự chọn từ danh sách ngày).
// - gia_tri là TRIỆU ĐỒNG (dù cột dvtt ghi 'VND'). so_luong mỗi mã một đơn vị (PCS, M, M2, KG…) => chỉ cộng số
//   lượng trong CÙNG 1 mã (dòng trùng), không cộng giữa các mã.
// - Nhóm vật tư chuẩn hoá: gộp khoảng trắng + bỏ khoảng trắng 2 đầu (file nguồn từng có ' KVT Vải Da Mouss'),
//   trống => 'Chưa phân nhóm' (sqlNhom / chuanHoaNhom bên dưới). Tập khoảng trắng ghi tường minh (KHOANG_TRANG, gồm cả
//   dấu cách không ngắt NBSP chép từ Word / web), GIỐNG HỆT chuanHoaNhom ở giao diện (components/Charts/tonKhoVatTu/
//   xuLy.ts) — không dùng '\s' của Postgres vì tập đó đổi theo locale. Chậm luân chuyển = cờ 'X' / 'x'.
// - Ngày luôn trả dạng chuỗi 'YYYY-MM-DD' bằng SQL (to_char): Date của JS lúc nửa đêm giờ +7 qua toISOString()
//   lùi 1 ngày.
// - Quyền: 'chart_stock_vt' (ADMIN có mọi quyền); giá trị từng mã ở chi tiết chỉ trả cho người có quyền xem giá
//   vật tư (MATERIAL_PRICE_PERMISSION).
// - Cache theo phiên bản RIÊNG của bảng (table_versions 'ton_kho_vt'), không thêm vào TABLE_TO_VERSION_KEY /
//   TABLES của server/data.ts: map đó cho phép tải nguyên bảng qua /api/all-data và kích làm nóng Tổng quan.
// ============================================================================

const TEN_BANG = 'ton_kho_vt';
const QUYEN_XEM = 'chart_stock_vt';
const LOI_QUYEN = { error: 'Bạn chưa có quyền xem tồn kho vật tư' };
export const NHOM_TRONG = 'Chưa phân nhóm';
export const TEN_TRONG = '(Không có tên)';
const NHOM_TOI_DA = 100;
/** Bộ lọc tên của 1 biểu đồ: tối đa bấy nhiêu tên, mỗi tên tối đa bấy nhiêu ký tự (1 nhóm hiện có ≤ ~2.000 tên) */
const SO_TEN_TOI_DA = 20000;
const TEN_TOI_DA_KY_TU = 300;
// Truy vấn gộp cả bảng ~0,4 s (đo 27/10/2026); để rộng hơn trần mặc định 8 s phòng lúc DB bận
const TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// HÀM THUẦN (test: backend/test/tonKhoVt.test.ts)
// ---------------------------------------------------------------------------

/**
 * Chuỗi khoảng trắng khi chuẩn hoá tên nhóm: đúng tập \s của JS (ASCII + NBSP U+00A0, U+1680, U+2000–U+200A,
 * U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF). Ghi tường minh để Postgres (REGEXP_REPLACE, cú pháp ARE hiểu
 * \t \v \uXXXX trong ngoặc vuông) và JS (new RegExp) dùng NGUYÊN chuỗi này, ra cùng kết quả ở mọi locale.
 * PHẢI giống hệt KHOANG_TRANG_NHOM ở frontend/components/Charts/tonKhoVatTu/xuLy.ts: giao diện gửi lại tên nhóm làm
 * tham số `nhom`, lệch tập ký tự => cửa sổ chi tiết ra 0 mã.
 */
export const KHOANG_TRANG = String.raw`[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+`;
const RE_KHOANG_TRANG = new RegExp(KHOANG_TRANG, 'g');

/** Biểu thức SQL chuẩn hoá nhóm vật tư: gộp mọi chuỗi khoảng trắng (KHOANG_TRANG) thành 1 dấu cách, bỏ dấu cách 2
 *  đầu, trống => 'Chưa phân nhóm'. Gộp trước rồi mới cắt 2 đầu: tab / NBSP ở đầu cũng bị bỏ (BTRIM chỉ cắt dấu cách). */
export const sqlNhom = (cot = 'nhom_vat_tu'): string =>
  `COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(${cot}, '${KHOANG_TRANG}', ' ', 'g')), ''), '${NHOM_TRONG}')`;

// Cùng quy tắc với sqlNhom => chuanHoaNhom(x) ra đúng như chuẩn hoá SQL x (dùng làm khoá cache an toàn; tham số nhóm
// vẫn được chuẩn hoá lại trong SQL)
const gonKhoangTrang = (s: string): string => s.replace(RE_KHOANG_TRANG, ' ').replace(/^ | $/g, '');

/** Chuẩn hoá tên nhóm giống sqlNhom: ' KVT  Vải Da Mouss ' => 'KVT Vải Da Mouss'; trống => 'Chưa phân nhóm'. */
export const chuanHoaNhom = (s: string | null | undefined): string => gonKhoangTrang(String(s ?? '')) || NHOM_TRONG;

/**
 * Biểu thức SQL khoá TÊN vật tư cho bộ lọc: giữ NGUYÊN chuỗi như ô Excel (không gộp khoảng trắng — bộ lọc phải ra
 * đúng như AutoFilter của Excel, mà Excel coi "…1.4M" và "…1.4M<NBSP>" là 2 tên khác nhau); chỉ NULL / '' (ô trống
 * của Excel) => '(Không có tên)'.
 */
export const sqlTen = (cot = 'ten_vat_tu'): string => `COALESCE(NULLIF(${cot}, ''), '${TEN_TRONG}')`;

/** Khoá tên giống sqlTen: giữ nguyên chuỗi; trống => '(Không có tên)'. */
export const chuanHoaTen = (s: string | null | undefined): string => {
  const v = String(s ?? '');
  return v === '' ? TEN_TRONG : v;
};

/**
 * Danh sách tên của bộ lọc (thân JSON `ten`): mảng chuỗi, ≤ SO_TEN_TOI_DA tên, mỗi tên ≤ TEN_TOI_DA_KY_TU ký tự.
 * Trả danh sách (giữ nguyên chuỗi, '' => '(Không có tên)'), bỏ trùng, xếp tăng (khoá cache không phụ thuộc thứ tự
 * gửi). Không gửi => [].
 */
export const docDanhSachTen = (v: unknown): { hopLe: true; ten: string[] } | { hopLe: false } => {
  if (v === undefined || v === null) return { hopLe: true, ten: [] };
  if (!Array.isArray(v) || v.length > SO_TEN_TOI_DA) return { hopLe: false };
  const ten = new Set<string>();
  for (const x of v) {
    if (typeof x !== 'string' || x.length > TEN_TOI_DA_KY_TU) return { hopLe: false };
    ten.add(chuanHoaTen(x));
  }
  return { hopLe: true, ten: [...ten].sort() };
};

/** Tham số nhóm: chuỗi ≤ NHOM_TOI_DA ký tự; trống / chỉ khoảng trắng => '' (mọi nhóm). Sai kiểu / quá dài => null. */
const docNhom = (v: unknown): string | null => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' || v.length > NHOM_TOI_DA) return null;
  return gonKhoangTrang(v) ? chuanHoaNhom(v) : '';
};

/** Chuỗi 'YYYY-MM-DD' VÀ là ngày có thật (2026-02-30 sai, 2028-02-29 đúng). */
export const laNgayHopLe = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [nam, thang, ngay] = s.split('-').map(Number);
  if (nam < 1 || thang < 1 || thang > 12 || ngay < 1) return false;
  const nhuan = (nam % 4 === 0 && nam % 100 !== 0) || nam % 400 === 0;
  const soNgay = [31, nhuan ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][thang - 1];
  return ngay <= soNgay;
};

/**
 * Tham số `truoc` của /chi-tiet (lần chốt để so, vd cuối tháng trước khi xem theo tháng). Bỏ trống => truoc null
 * (so với lần chốt liền trước `ngay`); có thì phải là ngày hợp lệ và TRƯỚC `ngay`, không thì hopLe = false (400).
 */
export const docNgayTruoc = (v: unknown, ngay: string): { hopLe: true; truoc: string | null } | { hopLe: false } => {
  if (v === undefined || v === '') return { hopLe: true, truoc: null };
  if (!laNgayHopLe(v) || v >= ngay) return { hopLe: false };
  return { hopLe: true, truoc: v };
};

export interface DiemTonKhoVt {
  ngay: string;
  nhom: string;
  giaTri: number;
  giaTriCham: number;
  soMa: number;
  soMaCham: number;
}

/** Thứ tự nhóm: theo giá trị ở lần chốt MỚI NHẤT giảm dần; nhóm không có ở lần chốt đó xếp cuối theo tên. */
export const xepNhom = (diem: DiemTonKhoVt[]): string[] => {
  let ngayMoiNhat = '';
  for (const d of diem) if (d.ngay > ngayMoiNhat) ngayMoiNhat = d.ngay;
  const giaTriMoiNhat = new Map<string, number>();
  const tatCa = new Set<string>();
  for (const d of diem) {
    tatCa.add(d.nhom);
    if (d.ngay === ngayMoiNhat) giaTriMoiNhat.set(d.nhom, (giaTriMoiNhat.get(d.nhom) ?? 0) + d.giaTri);
  }
  return [...tatCa].sort((a, b) => {
    const va = giaTriMoiNhat.get(a);
    const vb = giaTriMoiNhat.get(b);
    if (va !== undefined && vb !== undefined && va !== vb) return vb - va;
    if (va !== undefined && vb === undefined) return -1;
    if (va === undefined && vb !== undefined) return 1;
    return a.localeCompare(b, 'vi');
  });
};

// ---------------------------------------------------------------------------
// PHIÊN BẢN BẢNG (khoá cache) — table_versions.last_updated; không có dòng => MAX(updated_at) của bảng.
// Giữ 3 giây + dùng chung 1 truy vấn cho các lần gọi đồng thời (như getVersions ở server/data.ts).
// ---------------------------------------------------------------------------
interface PhienBan { khoa: string; capNhat: string | null }
const PHIEN_BAN_TTL_MS = 3000;
let phienBanNho: { luc: number; giaTri: PhienBan } | null = null;
let phienBanDangDoc: Promise<PhienBan> | null = null;

const laThieuBang = (e: unknown) => (e as { code?: string })?.code === '42P01';

const chuoiThoiDiem = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return String(v);
};

const docPhienBan = async (): Promise<PhienBan> => {
  if (phienBanNho && Date.now() - phienBanNho.luc < PHIEN_BAN_TTL_MS) return phienBanNho.giaTri;
  if (phienBanDangDoc) return phienBanDangDoc;
  phienBanDangDoc = (async () => {
    try {
      let giaTri: PhienBan;
      const r = await timedQuery(`SELECT last_updated FROM table_versions WHERE table_name = $1`, [TEN_BANG]);
      const lanCapNhat = chuoiThoiDiem(r.rows[0]?.last_updated);
      if (lanCapNhat) {
        giaTri = { khoa: `tv:${lanCapNhat}`, capNhat: lanCapNhat };
      } else {
        try {
          const r2 = await timedQuery(`SELECT MAX(updated_at) AS v FROM ton_kho_vt`);
          const v = chuoiThoiDiem(r2.rows[0]?.v);
          giaTri = { khoa: `ua:${v ?? 'rong'}`, capNhat: v };
        } catch (e) {
          if (!laThieuBang(e)) throw e;
          giaTri = { khoa: 'thieu-bang', capNhat: null };
        }
      }
      phienBanNho = { luc: Date.now(), giaTri };
      return giaTri;
    } finally {
      phienBanDangDoc = null;
    }
  })();
  return phienBanDangDoc;
};

// Không phụ thuộc bảng nào trong TABLE_TO_VERSION_KEY: versionKeys = [], phiên bản riêng đi qua extraVersion
const cacheTongHop = createCache<TongHopTonKhoVt>(2);
// Tổng hợp đã lọc: 1 khoá / (nhóm, bộ tên) — mỗi biểu đồ 1 bộ lọc
const cacheTongHopLoc = createCache<TongHopTonKhoVt>(24);
const cacheTenVatTu = createCache<DanhSachTenVatTu>(12);
// Chi tiết ~4.500 dòng / khoá (ngày × nhóm × có giá) => giữ ít khoá
const cacheChiTiet = createCache<ChiTietTonKhoVt>(16);

const NHOM_SQL = sqlNhom('t.nhom_vat_tu');
const CHAM_SQL = `UPPER(TRIM(t.cham_luan_chuyen_tren_3_thang)) = 'X'`;
const TEN_SQL = sqlTen('t.ten_vat_tu');

const so = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const soHoacNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// GET /api/ton-kho-vt/tong-hop
// ---------------------------------------------------------------------------
export interface TongHopTonKhoVt {
  capNhat: string | null;
  ngay: string[];
  nhom: string[];
  diem: DiemTonKhoVt[];
}

/**
 * `loc` (bộ lọc riêng của 1 biểu đồ): chỉ nhóm `loc.nhom` và các tên `loc.ten` (đã chuẩn hoá). `ngay` khi có lọc chỉ
 * gồm lần chốt có dòng thoả — giao diện ghép lại với danh sách ngày đầy đủ (lần chốt không có tên nào = 0).
 */
export const tinhTongHop = async (capNhat: string | null, loc?: { nhom: string; ten: string[] }): Promise<TongHopTonKhoVt> => {
  let rows: Array<Record<string, unknown>>;
  try {
    const dieuKienLoc = loc ? `AND ${NHOM_SQL} = ${sqlNhom('$1::text')} AND ${TEN_SQL} = ANY($2::text[])` : '';
    // Mỗi (lần chốt, nhóm) 1 dòng — số mã đếm DISTINCT (vài lần chốt tháng 2–3 có mã trùng 2 dòng)
    const r = await timedQuery(
      `SELECT to_char(t."date", 'YYYY-MM-DD') AS ngay,
              ${NHOM_SQL} AS nhom,
              COALESCE(SUM(t.gia_tri), 0) AS gia_tri,
              COALESCE(SUM(t.gia_tri) FILTER (WHERE ${CHAM_SQL}), 0) AS gia_tri_cham,
              COUNT(DISTINCT t.ma_vat_tu) AS so_ma,
              COUNT(DISTINCT t.ma_vat_tu) FILTER (WHERE ${CHAM_SQL}) AS so_ma_cham
       FROM ton_kho_vt t
       WHERE t."date" IS NOT NULL ${dieuKienLoc}
       GROUP BY t."date", 2
       ORDER BY t."date", 2`,
      loc ? [loc.nhom, loc.ten] : [],
      { timeoutMs: TIMEOUT_MS, workMemMb: 32 }
    );
    rows = r.rows;
  } catch (e) {
    if (!laThieuBang(e)) throw e;
    rows = [];
  }
  const diem: DiemTonKhoVt[] = rows.map(row => ({
    ngay: String(row.ngay),
    nhom: String(row.nhom),
    giaTri: so(row.gia_tri),
    giaTriCham: so(row.gia_tri_cham),
    soMa: so(row.so_ma),
    soMaCham: so(row.so_ma_cham),
  }));
  const ngay = [...new Set(diem.map(d => d.ngay))].sort();
  return { capNhat, ngay, nhom: xepNhom(diem), diem };
};

app.get('/api/ton-kho-vt/tong-hop', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_XEM))) return res.status(403).json(LOI_QUYEN);
    const pb = await docPhienBan();
    const payload = await cachedByVersions(cacheTongHop, 'tong-hop', [], () => tinhTongHop(pb.capNhat), pb.khoa);
    res.json(payload);
  } catch (error) {
    console.error('Lỗi ton-kho-vt/tong-hop:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/ton-kho-vt/tong-hop { nhom, ten[] } — bộ lọc tên của 1 biểu đồ (thân JSON vì danh sách tên có thể dài)
app.post('/api/ton-kho-vt/tong-hop', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_XEM))) return res.status(403).json(LOI_QUYEN);
    const body = (req.body ?? {}) as { nhom?: unknown; ten?: unknown };
    const nhom = docNhom(body.nhom);
    if (!nhom) return res.status(400).json({ error: 'Thiếu hoặc sai tên nhóm vật tư' });
    const ds = docDanhSachTen(body.ten);
    if (!ds.hopLe || ds.ten.length === 0) return res.status(400).json({ error: 'Danh sách tên vật tư không hợp lệ' });
    const pb = await docPhienBan();
    const loc = { nhom, ten: ds.ten };
    const payload = await cachedByVersions(cacheTongHopLoc, `tong-hop-loc|${nhom}|${hashKey(ds.ten)}`, [],
      () => tinhTongHop(pb.capNhat, loc), pb.khoa);
    res.json(payload);
  } catch (error) {
    console.error('Lỗi ton-kho-vt/tong-hop (lọc):', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ton-kho-vt/ten-vat-tu?nhom=… — tên vật tư (nguyên chuỗi như ô Excel) từng có trong nhóm, mọi lần chốt
// ---------------------------------------------------------------------------
export interface TenVatTu {
  ten: string;
  /** Số mã vật tư mang tên này (mọi lần chốt) */
  soMa: number;
  /** Còn ở lần chốt mới nhất */
  conTon: boolean;
}
export interface DanhSachTenVatTu { nhom: string; ten: TenVatTu[] }

export const tinhTenVatTu = async (nhom: string): Promise<DanhSachTenVatTu> => {
  let rows: Array<Record<string, unknown>>;
  try {
    const r = await timedQuery(
      `SELECT ${TEN_SQL} AS ten,
              COUNT(DISTINCT t.ma_vat_tu) AS so_ma,
              BOOL_OR(t."date" = (SELECT MAX(x."date") FROM ton_kho_vt x)) AS con_ton
       FROM ton_kho_vt t
       WHERE ${NHOM_SQL} = ${sqlNhom('$1::text')}
       GROUP BY 1`,
      [nhom],
      { timeoutMs: TIMEOUT_MS, workMemMb: 16 }
    );
    rows = r.rows;
  } catch (e) {
    if (!laThieuBang(e)) throw e;
    rows = [];
  }
  const ten = rows.map(row => ({ ten: String(row.ten), soMa: so(row.so_ma), conTon: row.con_ton === true }))
    .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  return { nhom, ten };
};

app.get('/api/ton-kho-vt/ten-vat-tu', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_XEM))) return res.status(403).json(LOI_QUYEN);
    const nhom = docNhom(req.query.nhom);
    if (!nhom) return res.status(400).json({ error: 'Thiếu hoặc sai tên nhóm vật tư' });
    const pb = await docPhienBan();
    const payload = await cachedByVersions(cacheTenVatTu, `ten-vat-tu|${nhom}`, [], () => tinhTenVatTu(nhom), pb.khoa);
    res.json(payload);
  } catch (error) {
    console.error('Lỗi ton-kho-vt/ten-vat-tu:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ton-kho-vt/chi-tiet?ngay=YYYY-MM-DD&nhom=<tên nhóm đã chuẩn hoá, trống = mọi nhóm>
//                             &truoc=<YYYY-MM-DD lần chốt để so, trước ngay; trống = lần chốt liền trước>
// ---------------------------------------------------------------------------
export interface DongTonKhoVt {
  ma: string;
  ten: string | null;
  nhom: string;
  dvt: string | null;
  /** Tại `ngay`; null = mã có ở lần trước nhưng đã HẾT ở lần này */
  soLuong: number | null;
  /** Tại `ngayTruoc`; null = mã MỚI xuất hiện */
  soLuongTruoc: number | null;
  /** Triệu đồng; null hết khi không có quyền xem giá */
  giaTri: number | null;
  giaTriTruoc: number | null;
  soThang: number | null;
  cham: boolean;
  congTrinh: string | null;
  ghiChu: string | null;
}
export interface ChiTietTonKhoVt {
  ngay: string;
  ngayTruoc: string | null;
  coGia: boolean;
  dong: DongTonKhoVt[];
}

// Gộp theo mã tại 1 lần chốt ($2 = nhóm đã chuẩn hoá, '' = mọi nhóm). Dòng trùng mã: cộng số lượng / giá trị (cùng
// mã = cùng đơn vị); tên / ĐVT / nhóm lấy MAX; công trình gộp các chuỗi khác nhau bằng xuống dòng (như nguồn).
// Lọc nhóm theo từng lần chốt: mã đổi nhóm giữa 2 lần hiện là "hết" ở nhóm cũ và "mới" ở nhóm mới.
const gopTheoMa = (dieuKienNgay: string) => `
  SELECT COALESCE(t.ma_vat_tu, '') AS ma,
         MAX(t.ten_vat_tu) AS ten,
         MAX(${NHOM_SQL}) AS nhom,
         MAX(t.dvt) AS dvt,
         COALESCE(SUM(t.so_luong), 0) AS so_luong,
         COALESCE(SUM(t.gia_tri), 0) AS gia_tri,
         MAX(t.so_thang_nhap_kho) AS so_thang,
         COALESCE(BOOL_OR(${CHAM_SQL}), FALSE) AS cham,
         STRING_AGG(DISTINCT t.ten_cong_trinh, chr(10)) AS cong_trinh,
         MAX(t.ghi_chu) AS ghi_chu
  FROM ton_kho_vt t
  WHERE ${dieuKienNgay}
    AND ($2::text = '' OR ${NHOM_SQL} = ${sqlNhom('$2::text')})
    AND (cardinality($4::text[]) = 0 OR ${TEN_SQL} = ANY($4::text[]))
  GROUP BY COALESCE(t.ma_vat_tu, '')`;

// moc: lần chốt để so + `ngay` có phải lần chốt không (ngày không có dữ liệu => không so, trả rỗng thay vì coi mọi
// mã là "đã hết"). Lần chốt để so = lần chốt MUỘN NHẤT trước `ngay` và không sau $3 (`truoc`, vd cuối tháng trước
// khi xem theo tháng; $3 NULL => lần chốt liền trước; `truoc` không phải ngày chốt => lấy lần chốt gần nhất trước đó).
// LEFT JOIN dong ON TRUE: luôn có ít nhất 1 dòng mang ngay_truoc (ma NULL = không có mã nào).
const SQL_CHI_TIET = `
  WITH moc AS (
    SELECT (SELECT MAX(t."date") FROM ton_kho_vt t
            WHERE t."date" < $1::date AND t."date" <= COALESCE($3::date, $1::date)) AS d_truoc,
           EXISTS (SELECT 1 FROM ton_kho_vt t WHERE t."date" = $1::date) AS co_ngay
  ),
  hien AS (${gopTheoMa(`t."date" = $1::date`)}),
  cu AS (${gopTheoMa(`t."date" = (SELECT d_truoc FROM moc) AND (SELECT co_ngay FROM moc)`)}),
  dong AS (
    SELECT COALESCE(h.ma, c.ma) AS ma,
           COALESCE(h.ten, c.ten) AS ten,
           COALESCE(h.nhom, c.nhom) AS nhom,
           COALESCE(h.dvt, c.dvt) AS dvt,
           h.so_luong AS so_luong,
           c.so_luong AS so_luong_truoc,
           h.gia_tri AS gia_tri,
           c.gia_tri AS gia_tri_truoc,
           CASE WHEN h.ma IS NOT NULL THEN h.so_thang ELSE c.so_thang END AS so_thang,
           CASE WHEN h.ma IS NOT NULL THEN h.cham ELSE c.cham END AS cham,
           CASE WHEN h.ma IS NOT NULL THEN h.cong_trinh ELSE c.cong_trinh END AS cong_trinh,
           CASE WHEN h.ma IS NOT NULL THEN h.ghi_chu ELSE c.ghi_chu END AS ghi_chu
    FROM hien h
    FULL JOIN cu c ON c.ma = h.ma
  )
  SELECT to_char(m.d_truoc, 'YYYY-MM-DD') AS ngay_truoc, x.*
  FROM moc m
  LEFT JOIN dong x ON TRUE`;

export const tinhChiTiet = async (
  ngay: string, nhom: string, coGia: boolean, truoc: string | null = null, ten: string[] = [],
): Promise<ChiTietTonKhoVt> => {
  let rows: Array<Record<string, unknown>>;
  try {
    const r = await timedQuery(SQL_CHI_TIET, [ngay, nhom, truoc, ten], { timeoutMs: TIMEOUT_MS, workMemMb: 16 });
    rows = r.rows;
  } catch (e) {
    if (!laThieuBang(e)) throw e;
    rows = [];
  }
  const ngayTruoc = rows[0]?.ngay_truoc ? String(rows[0].ngay_truoc) : null;
  const dong: DongTonKhoVt[] = [];
  for (const row of rows) {
    if (row.ma === null || row.ma === undefined) continue; // dòng giữ chỗ khi không có mã nào
    dong.push({
      ma: String(row.ma),
      ten: row.ten === null || row.ten === undefined ? null : String(row.ten),
      nhom: String(row.nhom ?? NHOM_TRONG),
      dvt: row.dvt === null || row.dvt === undefined ? null : String(row.dvt),
      soLuong: soHoacNull(row.so_luong),
      soLuongTruoc: soHoacNull(row.so_luong_truoc),
      // Không có quyền xem giá: bỏ ở máy chủ, không gửi xuống
      giaTri: coGia ? soHoacNull(row.gia_tri) : null,
      giaTriTruoc: coGia ? soHoacNull(row.gia_tri_truoc) : null,
      soThang: soHoacNull(row.so_thang),
      cham: row.cham === true,
      congTrinh: row.cong_trinh === null || row.cong_trinh === undefined ? null : String(row.cong_trinh),
      ghiChu: row.ghi_chu === null || row.ghi_chu === undefined ? null : String(row.ghi_chu),
    });
  }
  // Có giá: giá trị giảm dần (mã đã hết xếp theo giá trị lần trước); không có giá: theo mã — thứ tự không lộ giá trị
  dong.sort(coGia
    ? (a, b) => (b.giaTri ?? 0) - (a.giaTri ?? 0) || (b.giaTriTruoc ?? 0) - (a.giaTriTruoc ?? 0) || (a.ma < b.ma ? -1 : a.ma > b.ma ? 1 : 0)
    : (a, b) => (a.ma < b.ma ? -1 : a.ma > b.ma ? 1 : 0));
  return { ngay, ngayTruoc, coGia, dong };
};

// GET (tham số trên URL) và POST (thân JSON, thêm `ten` = bộ lọc tên của biểu đồ) dùng chung 1 cách xử lý
const xuLyChiTiet = async (req: Request, res: Response, src: Record<string, unknown>) => {
  try {
    if (!(await userHasPermission(req, QUYEN_XEM))) return res.status(403).json(LOI_QUYEN);
    const ngay = src.ngay;
    if (!laNgayHopLe(ngay)) return res.status(400).json({ error: 'Ngày không hợp lệ (cần dạng YYYY-MM-DD)' });
    // Trống (hoặc chỉ khoảng trắng) = mọi nhóm; muốn xem nhóm trống thì gửi đúng 'Chưa phân nhóm'
    const nhom = docNhom(src.nhom);
    if (nhom === null) return res.status(400).json({ error: 'Nhóm vật tư không hợp lệ' });
    const thamSoTruoc = docNgayTruoc(src.truoc ?? undefined, ngay);
    if (!thamSoTruoc.hopLe) return res.status(400).json({ error: 'Ngày so sánh không hợp lệ (cần dạng YYYY-MM-DD, trước ngày chốt)' });
    const { truoc } = thamSoTruoc;
    const ds = docDanhSachTen(src.ten);
    if (!ds.hopLe) return res.status(400).json({ error: 'Danh sách tên vật tư không hợp lệ' });
    const coGia = await userHasPermission(req, MATERIAL_PRICE_PERMISSION);
    const pb = await docPhienBan();
    const payload = await cachedByVersions(
      cacheChiTiet,
      `chi-tiet|${ngay}|${truoc ?? ''}|${nhom}|${coGia ? 1 : 0}|${ds.ten.length ? hashKey(ds.ten) : ''}`,
      [],
      () => tinhChiTiet(ngay, nhom, coGia, truoc, ds.ten),
      pb.khoa
    );
    res.json(payload);
  } catch (error) {
    console.error('Lỗi ton-kho-vt/chi-tiet:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

app.get('/api/ton-kho-vt/chi-tiet', (req: Request, res: Response) => {
  // Danh sách tên chỉ nhận qua POST (dài); trên URL bỏ qua `ten`
  const { ngay, nhom, truoc } = req.query;
  return xuLyChiTiet(req, res, { ngay, nhom, truoc });
});
app.post('/api/ton-kho-vt/chi-tiet', (req: Request, res: Response) => xuLyChiTiet(req, res, (req.body ?? {}) as Record<string, unknown>));
