import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';
import { loadUserAccess } from '../server/permissions.js';
import { notCancelledHexCond } from '../server/data.js';
import { createCache, cachedByVersions, hashKey } from '../server/cache.js';
import { expandWorkshops, workshopGroupSql, workshopGroupsVersion } from '../server/workshopGroups.js';
import { canonicalProjectName, expandProjectNames, normNameSql } from '../server/projectAlias.js';
import { DANH_MUC, bangTheoId, sqlCot, type Bang, type Cot } from '../server/hoiDapDanhMuc.js';
import { aiBat, hoiAI, taoLoiDan, LoiAI } from '../server/hoiDapAi.js';

// ============================================================================
// HỎI SỐ LIỆU — TỰ TRA (không AI). Giao diện gửi truy vấn có cấu trúc (bảng · phép tính · nhóm theo · lọc · kỳ);
// máy chủ kiểm từng tên bảng / cột với danh mục (server/hoiDapDanhMuc.ts) và quyền người hỏi rồi mới ghép SQL
// CHỈ ĐỌC. Giá trị lọc luôn đi bằng tham số $n.
//   GET  /api/hoi-dap/danh-muc            bảng + cột người dùng được hỏi
//   GET  /api/hoi-dap/gia-tri?bang&cot&q  giá trị hay gặp của 1 cột chữ (gợi ý lọc)
//   POST /api/hoi-dap/truy-van            chạy truy vấn
// ============================================================================

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `hoi-dap:${req.user?.id ?? 'anon'}`,
  message: { success: false, message: 'Hỏi quá nhanh, chờ vài giây rồi hỏi tiếp' },
});

// ---- Quyền -----------------------------------------------------------------
type Co = (quyen: string) => boolean;
async function quyenCua(req: Request): Promise<Co | null> {
  if (!req.user) return null;
  const a = await loadUserAccess(req.user.id);
  if (!a.active) return null;
  return (q: string) => a.role === 'ADMIN' || a.perms.has(q);
}
const xemBang = (b: Bang, co: Co) => b.quyen.some(co);
const xemCot = (c: Cot, co: Co) => !c.quyen || co(c.quyen);
const cotNgay = (b: Bang) => b.cot.find(x => x.id === b.ngay)!;

// ---- So chữ không dấu, không phân biệt hoa thường (cả hai phía) ------------------------------------------
// 'ð' (Ð Iceland): dữ liệu SAP có chỗ gõ "ÐANG GIAO HÀNG" bằng ký tự này thay cho Đ
const CO_DAU = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđð';
const goc = (ch: string) => (ch === 'đ' || ch === 'ð' ? 'd' : ch.normalize('NFD').replace(/[̀-ͯ]/g, ''));
// lower() của Postgres theo locale DB có thể chỉ đổi chữ ASCII => đưa cả chữ hoa có dấu vào bảng dịch
const TU = CO_DAU + CO_DAU.toUpperCase();
const SANG = [...CO_DAU].map(goc).join('').repeat(2);
const khongDau = (e: string) => `translate(lower(COALESCE((${e})::text, '')), '${TU}', '${SANG}')`;
export const boDau = (s: string) =>
  [...String(s).toLowerCase()].map(ch => (TU.includes(ch) ? SANG[TU.indexOf(ch)] : ch)).join('').replace(/\s+/g, ' ').trim();
const thich = (s: string) => `%${boDau(s).replace(/[\\%_]/g, m => `\\${m}`)}%`;
const gonTen = (e: string) => `NULLIF(TRIM(REGEXP_REPLACE(COALESCE((${e})::text, ''), '\\s+', ' ', 'g')), '')`;

// ---- Kiểu truy vấn ---------------------------------------------------------
const NGAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GiaTri = z.union([z.string().max(300), z.number()]);
const LocSchema = z.object({
  cot: z.string().max(64),
  op: z.enum(['bang', 'khac', 'chua', 'khong_chua', 'lon_hon', 'lon_hon_bang', 'nho_hon', 'nho_hon_bang', 'trong_khoang', 'rong', 'co']),
  gt: z.union([GiaTri, z.array(GiaTri).max(200)]).optional(),
});
const DoSchema = z.object({
  ham: z.enum(['tong', 'dem', 'dem_khac', 'tb', 'max', 'min']),
  cot: z.string().max(64).optional(),
});
const TruyVanSchema = z.object({
  bang: z.string().max(64),
  kieu: z.enum(['tong', 'dong']).default('tong'),
  do: z.array(DoSchema).max(4).default([]),
  /** id cột, hoặc "cotNgay@thang" (ngay | tuan | thang | quy | nam) để nhóm theo mốc thời gian */
  nhom: z.array(z.string().max(80)).max(2).default([]),
  loc: z.array(LocSchema).max(12).default([]),
  tu: z.string().regex(NGAY_RE).optional(),
  den: z.string().regex(NGAY_RE).optional(),
  /** Sắp theo cột kết quả thứ `cot` (0 = cột đầu) */
  sap: z.object({ cot: z.number().int().min(0).max(10), giam: z.boolean() }).optional(),
  gioiHan: z.number().int().min(1).max(500).optional(),
  /** Tính cả hạng mục HỦY (mặc định bỏ — cùng quy tắc với Tổng quan) */
  gomHuy: z.boolean().optional(),
  cotXem: z.array(z.string().max(64)).max(12).optional(),
});
type TruyVan = z.infer<typeof TruyVanSchema>;
type Loc = z.infer<typeof LocSchema>;

class LoiHoi extends Error {}

const MOC: Record<string, (e: string) => string> = {
  ngay: e => `to_char(${e}, 'YYYY-MM-DD')`,
  tuan: e => `to_char(${e}, 'IYYY-"T"IW')`,
  thang: e => `to_char(${e}, 'YYYY-MM')`,
  quy: e => `to_char(${e}, 'YYYY-"Q"Q')`,
  nam: e => `to_char(${e}, 'YYYY')`,
};

export interface CotKetQua { ten: string; kieu: 'chu' | 'so' | 'ngay'; tien?: boolean; nhom?: boolean }
export interface KetQua {
  cot: CotKetQua[];
  dong: Array<Array<string | number | null>>;
  /** Dòng tổng (cùng thứ tự cột; ô cột nhóm = null) */
  tong: Array<number | null> | null;
  /** Tổng số nhóm / dòng thoả (trước khi cắt gioiHan) */
  soDong: number;
  ngayChot?: string;
  boHuy: boolean;
}

const SX = 'production_status_app';
/** Cột "sx:<id>" của bảng có HEX = cột bảng sản xuất qua LEFT JOIN p (1 HEX = 1 dòng sản xuất) */
const laSx = (id: string) => id.startsWith('sx:');
const NOI_SX = `LEFT JOIN ${SX} p ON p.hex::text = t.hex::text`;
const tuBang = (b: Bang, ids: string[]) => `${b.id} t${ids.some(laSx) ? ` ${NOI_SX}` : ''}`;

function timCot(b: Bang, id: string, co: Co): Cot {
  if (laSx(id)) {
    const sx = bangTheoId.get(SX)!;
    if (!b.noiSx) throw new LoiHoi(`Bảng ${b.ten} không nối được sang bảng sản xuất`);
    if (!xemBang(sx, co)) throw new LoiHoi('Bạn chưa có quyền xem bảng sản xuất');
    const g = sx.cot.find(x => x.id === id.slice(3));
    if (!g || !xemCot(g, co)) throw new LoiHoi(`Bảng sản xuất không có cột "${id.slice(3)}"`);
    // Biểu thức của cột viết theo bí danh t => đổi sang p
    return { ...g, id, sql: sqlCot(g).replace(/(?<![\w."])t\./g, 'p.') };
  }
  const c = b.cot.find(x => x.id === id);
  if (!c) throw new LoiHoi(`Bảng ${b.ten} không có cột "${id}"`);
  if (!xemCot(c, co)) throw new LoiHoi(`Bạn chưa có quyền xem cột ${c.ten}`);
  return c;
}

const mangGt = (gt: Loc['gt']) => (gt === undefined ? [] : Array.isArray(gt) ? gt : [gt]).map(v => String(v).trim()).filter(Boolean);

function dieuKienLoc(b: Bang, l: Loc, co: Co, p: unknown[]): string {
  const c = timCot(b, l.cot, co);
  const e = sqlCot(c);
  const ds = mangGt(l.gt);
  const thamSo = (v: unknown) => { p.push(v); return `$${p.length}`; };
  if (l.op === 'rong') return c.kieu === 'so' || c.kieu === 'ngay' ? `${e} IS NULL` : `${gonTen(e)} IS NULL`;
  if (l.op === 'co') return c.kieu === 'so' || c.kieu === 'ngay' ? `${e} IS NOT NULL` : `${gonTen(e)} IS NOT NULL`;
  if (!ds.length) throw new LoiHoi(`Thiếu giá trị lọc cho ${c.ten}`);

  if (c.kieu === 'so' || c.kieu === 'ngay') {
    const doi = (v: string) => {
      if (c.kieu === 'ngay') {
        if (!NGAY_RE.test(v)) throw new LoiHoi(`${c.ten}: ngày phải dạng năm-tháng-ngày`);
        return v;
      }
      const n = Number(v.replace(/,/g, ''));
      if (!Number.isFinite(n)) throw new LoiHoi(`${c.ten}: "${v}" không phải số`);
      return n;
    };
    const ep = c.kieu === 'ngay' ? '::date' : '::numeric';
    const so1 = () => `${thamSo(doi(ds[0]))}${ep}`;
    switch (l.op) {
      case 'bang': return ds.length > 1 ? `${e} = ANY(${thamSo(ds.map(doi))}${ep}[])` : `${e} = ${so1()}`;
      case 'khac': return `(${e} IS NULL OR ${e} <> ${so1()})`;
      case 'lon_hon': return `${e} > ${so1()}`;
      case 'lon_hon_bang': return `${e} >= ${so1()}`;
      case 'nho_hon': return `${e} < ${so1()}`;
      case 'nho_hon_bang': return `${e} <= ${so1()}`;
      case 'trong_khoang': {
        if (ds.length < 2) throw new LoiHoi(`${c.ten}: "trong khoảng" cần 2 giá trị`);
        return `${e} BETWEEN ${thamSo(doi(ds[0]))}${ep} AND ${thamSo(doi(ds[1]))}${ep}`;
      }
      default: throw new LoiHoi(`${c.ten}: không lọc "${l.op}" với cột số / ngày`);
    }
  }

  const coMaCt = !laSx(c.id) && b.cot.some(x => x.id === 'ma_cong_trinh');
  const giongChu = (phu: boolean) => {
    const a = thamSo(ds.map(thich));
    const k = `${khongDau(e)} LIKE ANY(${a}::text[])`;
    // Công trình: gõ một phần tên hoặc mã đều khớp (tên có thể chỉ ghi mã ở cột mã)
    return phu && c.kieu === 'ct' && coMaCt ? `(${k} OR ${khongDau(sqlCot(timCot(b, 'ma_cong_trinh', co)))} LIKE ANY(${a}::text[]))` : k;
  };
  const bangChu = () => {
    if (c.kieu === 'xuong') return `UPPER(TRIM(COALESCE(${e}, ''))) = ANY(${thamSo(expandWorkshops(ds))}::text[])`;
    if (c.kieu === 'ct') return `${normNameSql(e)} = ANY(${thamSo(expandProjectNames(ds))}::text[])`;
    return `${khongDau(e)} = ANY(${thamSo(ds.map(boDau))}::text[])`;
  };
  switch (l.op) {
    case 'bang': return bangChu();
    case 'khac': return `NOT COALESCE(${bangChu()}, false)`;
    case 'chua': return giongChu(true);
    case 'khong_chua': return `NOT (${giongChu(true)})`;
    default: throw new LoiHoi(`${c.ten}: chỉ lọc bằng / khác / chứa với cột chữ`);
  }
}

/** Phần FROM + WHERE dùng chung cho truy vấn và gợi ý giá trị */
async function phanLoc(b: Bang, q: Pick<TruyVan, 'loc' | 'tu' | 'den' | 'gomHuy'>, co: Co, p: unknown[], coNhomNgay: boolean) {
  const dk: string[] = [];
  if (!q.gomHuy && b.huy === 'hex') dk.push(notCancelledHexCond('t.hex'));
  if (!q.gomHuy && b.huy === 'ipo') dk.push(`UPPER(COALESCE(t.tinh_trang_ipo, '')) NOT LIKE '%HỦY%'`);
  const eNgay = sqlCot(cotNgay(b));
  if (q.tu) { p.push(q.tu); dk.push(`${eNgay} >= $${p.length}::date`); }
  if (q.den) { p.push(q.den); dk.push(`${eNgay} <= $${p.length}::date`); }
  q.loc.forEach(l => dk.push(dieuKienLoc(b, l, co, p)));
  let ngayChot: string | undefined;
  // Tồn kho là ảnh chụp từng ngày: cộng nhiều ngày là sai => chỉ lấy ngày chốt mới nhất trong kỳ (trừ khi nhóm theo ngày)
  if (b.chot && !coNhomNgay && !q.loc.some(l => l.cot === b.ngay)) {
    const pp: unknown[] = [];
    const dd: string[] = [];
    if (q.tu) { pp.push(q.tu); dd.push(`${eNgay} >= $${pp.length}::date`); }
    if (q.den) { pp.push(q.den); dd.push(`${eNgay} <= $${pp.length}::date`); }
    const r = await timedQuery<{ d: string | null }>(
      `SELECT to_char(MAX(${eNgay}), 'YYYY-MM-DD') AS d FROM ${b.id} t${dd.length ? ` WHERE ${dd.join(' AND ')}` : ''}`, pp, { timeoutMs: 15000 });
    ngayChot = r.rows[0]?.d ?? undefined;
    if (ngayChot) { p.push(ngayChot); dk.push(`${eNgay} = $${p.length}::date`); }
  }
  return { where: dk.length ? `WHERE ${dk.join(' AND ')}` : '', ngayChot };
}

const soHoa = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

async function chay(b: Bang, q: TruyVan, co: Co): Promise<KetQua> {
  const p: unknown[] = [];
  const nhom = q.nhom.map(n => {
    const [id, moc] = n.split('@');
    const c = timCot(b, id, co);
    if (moc) {
      if (c.kieu !== 'ngay' || !Object.hasOwn(MOC, moc)) throw new LoiHoi(`Không nhóm ${c.ten} theo "${moc}"`);
      return { c, moc, sql: MOC[moc](sqlCot(c)) };
    }
    if (c.kieu === 'ngay') return { c, moc: 'ngay', sql: MOC.ngay(sqlCot(c)) };
    const sql = c.kieu === 'xuong' ? `NULLIF(${workshopGroupSql(sqlCot(c))}, '')` : c.kieu === 'so' ? sqlCot(c) : gonTen(sqlCot(c));
    return { c, moc: '', sql };
  });
  const coNhomNgay = nhom.some(n => n.c.kieu === 'ngay');
  const { where, ngayChot } = await phanLoc(b, q, co, p, coNhomNgay);
  const tu = tuBang(b, [...q.nhom.map(n => n.split('@')[0]), ...q.do.map(d => d.cot ?? ''), ...q.loc.map(l => l.cot), ...(q.kieu === 'dong' ? (q.cotXem ?? []) : [])]);
  const boHuy = !q.gomHuy && !!b.huy;

  // ---- Liệt kê dòng ----
  if (q.kieu === 'dong') {
    const ids = (q.cotXem?.length ? q.cotXem : b.hien).filter(id => { const c = b.cot.find(x => x.id === id); return c && xemCot(c, co); });
    const cots = ids.map(id => timCot(b, id, co));
    const chon = cots.map((c, i) => `${c.kieu === 'ngay' ? MOC.ngay(sqlCot(c)) : sqlCot(c)} AS c${i}`);
    const gioiHan = Math.min(q.gioiHan ?? 100, 200);
    const sapCot = q.sap && cots[q.sap.cot] ? `c${q.sap.cot} ${q.sap.giam ? 'DESC' : 'ASC'} NULLS LAST` : `${sqlCot(cotNgay(b))} DESC NULLS LAST`;
    const r = await timedQuery(
      `SELECT ${chon.join(', ')}, count(*) OVER () AS so_dong FROM ${tu} ${where} ORDER BY ${sapCot} LIMIT ${gioiHan}`,
      p, { timeoutMs: 20000, heavy: true });
    return {
      cot: cots.map(c => ({ ten: c.ten, kieu: c.kieu === 'so' ? 'so' : c.kieu === 'ngay' ? 'ngay' : 'chu', tien: c.tien })),
      dong: r.rows.map(row => cots.map((c, i) => {
        const v = row[`c${i}`];
        if (c.kieu === 'so') return soHoa(v);
        if (c.kieu === 'ct') return v ? canonicalProjectName(v) : null;
        return v === null || v === undefined ? null : String(v);
      })),
      tong: null,
      soDong: Number(r.rows[0]?.so_dong ?? 0),
      ngayChot,
      boHuy,
    };
  }

  // ---- Tổng hợp ----
  const doList = q.do.length ? q.do : b.mac.filter(m => !m.cot || b.cot.some(c => c.id === m.cot && xemCot(c, co)));
  const doDa = doList.map(d => {
    if (d.ham === 'dem') return { d, c: undefined as Cot | undefined, sql: ['COUNT(*)'] };
    if (!d.cot) throw new LoiHoi('Thiếu cột cần tính');
    const c = timCot(b, d.cot, co);
    const e = sqlCot(c);
    if (d.ham === 'dem_khac') return { d, c, sql: [`COUNT(DISTINCT ${c.kieu === 'ngay' || c.kieu === 'so' ? e : gonTen(e)})`] };
    if (d.ham === 'max' || d.ham === 'min') {
      if (c.kieu !== 'so' && c.kieu !== 'ngay') throw new LoiHoi(`${c.ten} không phải số / ngày`);
      const f = d.ham === 'max' ? 'MAX' : 'MIN';
      return { d, c, sql: [c.kieu === 'ngay' ? `to_char(${f}(${e}), 'YYYY-MM-DD')` : `${f}(${e})`] };
    }
    if (c.kieu !== 'so') throw new LoiHoi(`${c.ten} không phải cột số để ${d.ham === 'tong' ? 'cộng' : 'tính trung bình'}`);
    // Trung bình lấy tổng + đếm để gộp được các nhóm (tên công trình nhiều cách viết)
    return { d, c, sql: d.ham === 'tb' ? [`SUM(${e})`, `COUNT(${e})`] : [`SUM(${e})`] };
  });
  const chonDo: string[] = [];
  doDa.forEach((x, i) => x.sql.forEach((s, j) => chonDo.push(`${s} AS m${i}_${j}`)));
  const chonNhom = nhom.map((n, i) => `${n.sql} AS g${i}`);
  const TRAN = 20000;
  const sql = nhom.length
    ? `SELECT ${[...chonNhom, ...chonDo, `GROUPING(${nhom.map(n => n.sql).join(', ')}) AS la_tong`].join(', ')}
       FROM ${tu} ${where}
       GROUP BY GROUPING SETS ((${nhom.map(n => n.sql).join(', ')}), ())
       ORDER BY la_tong DESC LIMIT ${TRAN + 1}`
    : `SELECT ${chonDo.join(', ')} FROM ${tu} ${where}`;
  const r = await timedQuery(sql, p, { timeoutMs: 20000, heavy: true, workMemMb: 32 });

  type Tho = { g: Array<string | number | null>; m: Array<Array<number | string | null>> };
  const docDo = (row: Record<string, unknown>): Tho['m'] => doDa.map((x, i) => x.sql.map((_, j) => {
    const v = row[`m${i}_${j}`];
    return x.c?.kieu === 'ngay' && (x.d.ham === 'max' || x.d.ham === 'min') ? (v === null || v === undefined ? null : String(v)) : soHoa(v);
  }));
  const raVal = (m: Tho['m']): Array<number | string | null> => doDa.map((x, i) => {
    const a = m[i];
    if (x.d.ham === 'tb') return a[1] ? Number(a[0]) / Number(a[1]) : null;
    return a[0];
  });

  const rows = r.rows as Array<Record<string, unknown>>;
  const dongTong = nhom.length ? rows.find(x => Number(x.la_tong) !== 0) : rows[0];
  const tong = dongTong ? [...nhom.map(() => null), ...raVal(docDo(dongTong)).map(v => (typeof v === 'number' ? v : null))] : null;

  // Gộp nhóm: tên công trình nhiều cách viết của cùng 1 mã => 1 dòng (cộng tổng / đếm, lấy lớn nhất / nhỏ nhất)
  const gop = new Map<string, Tho>();
  rows.filter(x => !nhom.length || Number(x.la_tong) === 0).forEach(row => {
    const g = nhom.map((n, i) => {
      const v = row[`g${i}`];
      if (v === null || v === undefined) return null;
      if (n.c.kieu === 'ct') return canonicalProjectName(v);
      return n.c.kieu === 'so' ? soHoa(v) : String(v);
    });
    const k = JSON.stringify(g);
    const m = docDo(row);
    const cu = gop.get(k);
    if (!cu) { gop.set(k, { g, m }); return; }
    doDa.forEach((x, i) => x.sql.forEach((_, j) => {
      const a = cu.m[i][j], v = m[i][j];
      if (v === null) return;
      if (a === null) { cu.m[i][j] = v; return; }
      if (x.d.ham === 'max') cu.m[i][j] = v > a ? v : a;
      else if (x.d.ham === 'min') cu.m[i][j] = v < a ? v : a;
      else cu.m[i][j] = Number(a) + Number(v);
    }));
  });
  let dong = [...gop.values()].map(t => [...t.g, ...raVal(t.m)]);
  const nCot = nhom.length + doDa.length;
  const sapTheo = q.sap && q.sap.cot < nCot ? q.sap : coNhomNgay
    ? { cot: nhom.findIndex(n => n.c.kieu === 'ngay'), giam: false }
    : { cot: nhom.length, giam: true };
  const ss = (a: unknown, b2: unknown) => {
    if (a === null) return 1;
    if (b2 === null) return -1;
    return typeof a === 'number' && typeof b2 === 'number' ? a - b2 : String(a).localeCompare(String(b2), 'vi', { numeric: true });
  };
  dong.sort((a, b2) => {
    const k = ss(a[sapTheo.cot], b2[sapTheo.cot]);
    return a[sapTheo.cot] === null || b2[sapTheo.cot] === null ? k : sapTheo.giam ? -k : k;
  });
  const soDong = dong.length;
  dong = dong.slice(0, q.gioiHan ?? (nhom.length ? 50 : 1));

  const cot: CotKetQua[] = [
    ...nhom.map(n => ({ ten: n.moc && n.moc !== 'ngay' ? `${n.c.ten} (${({ tuan: 'tuần', thang: 'tháng', quy: 'quý', nam: 'năm' } as Record<string, string>)[n.moc]})` : n.c.ten, kieu: (n.c.kieu === 'so' ? 'so' : n.c.kieu === 'ngay' ? 'ngay' : 'chu') as CotKetQua['kieu'], nhom: true })),
    ...doDa.map(x => ({
      ten: tenDo(b, x.d.ham, x.c),
      kieu: (x.c?.kieu === 'ngay' && (x.d.ham === 'max' || x.d.ham === 'min') ? 'ngay' : 'so') as CotKetQua['kieu'],
      tien: x.d.ham !== 'dem' && x.d.ham !== 'dem_khac' && !!x.c?.tien,
    })),
  ];
  return { cot, dong, tong: nhom.length ? tong : null, soDong: nhom.length ? soDong : 1, ngayChot, boHuy };
}

/** "Tổng giá trị nhập kho", "Số HEX", "Ngày PR mới nhất"… */
const tenDo = (b: Bang, ham: string, c?: Cot) => {
  if (ham === 'dem' || !c) return `Số ${b.dong}`;
  // Chữ đầu viết thường khi nối sau "Tổng / Số…" — trừ chữ viết tắt (HEX, SL, PR…)
  const ten = /^\p{Lu}{2}/u.test(c.ten) ? c.ten : c.ten.charAt(0).toLowerCase() + c.ten.slice(1);
  if (c.kieu === 'ngay' && (ham === 'max' || ham === 'min')) return `${c.ten} ${ham === 'max' ? 'mới nhất' : 'sớm nhất'}`;
  if (ham === 'dem_khac' && /^Số /.test(c.ten)) return c.ten;
  return `${({ tong: 'Tổng', dem_khac: 'Số', tb: 'Trung bình', max: 'Lớn nhất', min: 'Nhỏ nhất' } as Record<string, string>)[ham]} ${ten}`;
};

const cacheKq = createCache<KetQua>(200);
const cacheGt = createCache<Array<{ v: string; n: number }>>(300);
const phienBanCua = (b: Bang) => [b.phienBan!, ...(b.huy ? ['production'] : [])];

// ---- Route -------------------------------------------------------------------
app.get('/api/hoi-dap/danh-muc', limiter, async (req: Request, res: Response) => {
  try {
    const co = await quyenCua(req);
    if (!co) return res.status(403).json({ success: false, message: 'Không có quyền' });
    const bang = DANH_MUC.filter(b => xemBang(b, co)).map(b => ({
      id: b.id, ten: b.ten, dn: b.dn, ngay: b.ngay, chot: !!b.chot, huy: !!b.huy, dong: b.dong, soChinh: b.soChinh,
      noiSx: !!b.noiSx && xemBang(bangTheoId.get(SX)!, co),
      mac: b.mac.filter(m => !m.cot || b.cot.some(c => c.id === m.cot && xemCot(c, co))),
      cot: b.cot.filter(c => xemCot(c, co)).map(c => ({ id: c.id, ten: c.ten, dn: c.dn ?? [], kieu: c.kieu, tien: !!c.tien, ...(c.gt ? { gt: c.gt } : {}) })),
    }));
    res.json({ success: true, bang, ai: aiBat() });
  } catch (e) {
    console.error('hoi-dap/danh-muc', e);
    res.status(500).json({ success: false, message: 'Lỗi đọc danh mục' });
  }
});

// Từ điển giá trị: cột đánh dấu tuDien (ít giá trị) + tên công trình — giao diện nhận ra câu chỉ nói giá trị
// ("ghế", "sun group", "chưa mua", "tây hồ view"). Mỗi cột tối đa 80 giá trị hay gặp; cache theo phiên bản bảng.
const cacheTd = createCache<Record<string, string[]>>(40);
async function layTuDien(co: Co, coTenCt = true): Promise<{ gt: Record<string, Record<string, string[]>>; ct: string[] }> {
    const gt: Record<string, Record<string, string[]>> = {};
    for (const b of DANH_MUC.filter(x => xemBang(x, co))) {
      const cots = b.cot.filter(c => c.tuDien && xemCot(c, co));
      if (!cots.length) continue;
      const tinh = async () => {
        const out: Record<string, string[]> = {};
        for (const c of cots) {
          const e = gonTen(sqlCot(c));
          const r = await timedQuery<{ v: string }>(
            `SELECT ${e} AS v FROM ${b.id} t WHERE ${e} IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 80`, [], { timeoutMs: 15000, heavy: true });
          out[c.id] = r.rows.map(x => x.v);
        }
        return out;
      };
      gt[b.id] = b.phienBan ? await cachedByVersions(cacheTd, `${b.id}|${cots.map(c => c.id).join(',')}`, [b.phienBan], tinh) : await tinh();
    }
    // Tên công trình chuẩn (gộp cách viết) từ bảng sản xuất — người có quyền xem bất kỳ bảng nào có cột công trình
    let ct: string[] = [];
    if (coTenCt && DANH_MUC.some(b => xemBang(b, co) && b.cot.some(c => c.kieu === 'ct'))) {
      const r = await cachedByVersions(cacheTd, 'ct', ['production'], async () => {
        const x = await timedQuery<{ v: string }>(`SELECT DISTINCT ${gonTen('t.ten_cong_trinh')} AS v FROM ${SX} t`, [], { timeoutMs: 15000 });
        return { ct: [...new Set(x.rows.map(y => canonicalProjectName(y.v)).filter(Boolean))] };
      });
      ct = r.ct;
    }
    return { gt, ct };
}
app.get('/api/hoi-dap/tu-dien', limiter, async (req: Request, res: Response) => {
  try {
    const co = await quyenCua(req);
    if (!co) return res.status(403).json({ success: false, message: 'Không có quyền' });
    res.json({ success: true, ...(await layTuDien(co)) });
  } catch (e) {
    console.error('hoi-dap/tu-dien', e);
    res.status(500).json({ success: false, message: 'Lỗi đọc từ điển giá trị' });
  }
});

app.get('/api/hoi-dap/gia-tri', limiter, async (req: Request, res: Response) => {
  try {
    const co = await quyenCua(req);
    const b = bangTheoId.get(String(req.query.bang ?? ''));
    if (!co || !b || !xemBang(b, co)) return res.status(403).json({ success: false, message: 'Không có quyền xem bảng này' });
    const c = timCot(b, String(req.query.cot ?? ''), co);
    if (c.kieu === 'so' || c.kieu === 'ngay') return res.json({ success: true, gt: [] });
    const q = String(req.query.q ?? '').slice(0, 100).trim();
    const tinh = async () => {
      const p: unknown[] = [];
      const { where } = await phanLoc(b, { loc: [], gomHuy: false }, co, p, false);
      const e = c.kieu === 'xuong' ? `NULLIF(${workshopGroupSql(sqlCot(c))}, '')` : gonTen(sqlCot(c));
      const dk = [`${e} IS NOT NULL`];
      if (q) { p.push(thich(q)); dk.push(`${khongDau(sqlCot(c))} LIKE $${p.length}`); }
      const r = await timedQuery<{ v: string; n: string }>(
        `SELECT ${e} AS v, COUNT(*) AS n FROM ${tuBang(b, [c.id])} ${where ? `${where} AND` : 'WHERE'} ${dk.join(' AND ')} GROUP BY 1 ORDER BY 2 DESC LIMIT 60`,
        p, { timeoutMs: 15000, heavy: true });
      const m = new Map<string, number>();
      r.rows.forEach(x => { const v = c.kieu === 'ct' ? canonicalProjectName(x.v) : x.v; m.set(v, (m.get(v) ?? 0) + Number(x.n)); });
      return [...m.entries()].map(([v, n]) => ({ v, n })).sort((a, b2) => b2.n - a.n).slice(0, 30);
    };
    const gt = b.phienBan ? await cachedByVersions(cacheGt, `${b.id}|${c.id}|${boDau(q)}`, phienBanCua(b), tinh, workshopGroupsVersion()) : await tinh();
    res.json({ success: true, gt });
  } catch (e) {
    if (e instanceof LoiHoi) return res.status(400).json({ success: false, message: e.message });
    console.error('hoi-dap/gia-tri', e);
    res.status(500).json({ success: false, message: 'Lỗi lấy giá trị gợi ý' });
  }
});

app.post('/api/hoi-dap/truy-van', limiter, async (req: Request, res: Response) => {
  const kq = TruyVanSchema.safeParse(req.body);
  if (!kq.success) return res.status(400).json({ success: false, message: 'Truy vấn không hợp lệ' });
  const q = kq.data;
  try {
    const co = await quyenCua(req);
    const b = bangTheoId.get(q.bang);
    if (!co || !b || !xemBang(b, co)) return res.status(403).json({ success: false, message: 'Bạn chưa có quyền xem số liệu bảng này' });
    // Kiểm quyền cột TRƯỚC khi lấy cache (cache dùng chung mọi người)
    [...q.nhom.map(n => n.split('@')[0]), ...q.do.map(d => d.cot).filter((x): x is string => !!x), ...q.loc.map(l => l.cot), ...(q.cotXem ?? [])]
      .forEach(id => timCot(b, id, co));
    const tinh = () => chay(b, q, co);
    // Cột giá vật tư: kết quả khi lọc / hiện cột có quyền riêng => khoá cache gồm quyền đó
    const khoa = hashKey({ q, gia: co('materials_view_price') });
    const ketQua = b.phienBan ? await cachedByVersions(cacheKq, khoa, phienBanCua(b), tinh, workshopGroupsVersion()) : await tinh();
    res.json({ success: true, ...ketQua });
  } catch (e) {
    if (e instanceof LoiHoi) return res.status(400).json({ success: false, message: e.message });
    const code = (e as { code?: string })?.code;
    if (code === '57014') return res.status(504).json({ success: false, message: 'Truy vấn quá lâu — thu hẹp kỳ hoặc thêm điều kiện lọc' });
    console.error('hoi-dap/truy-van', e);
    res.status(500).json({ success: false, message: 'Lỗi chạy truy vấn' });
  }
});

// ---- Tầng AI: dịch câu khó thành truy vấn (server/hoiDapAi.ts). Kết quả kiểm như truy vấn tự tra. ----
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `hoi-dap-ai:${req.user?.id ?? 'anon'}`,
  message: { success: false, message: 'Hỏi AI quá nhanh, chờ ít giây' },
});
const TruyVanAISchema = TruyVanSchema.extend({
  soSanh: z.object({ tu: z.string().regex(NGAY_RE), den: z.string().regex(NGAY_RE) }).optional(),
  binhQuan: z.enum(['ngay', 'tuan', 'thang', 'quy', 'nam']).optional(),
});
app.post('/api/hoi-dap/ai', aiLimiter, async (req: Request, res: Response) => {
  const cau = String(req.body?.cau ?? '').trim().slice(0, 300);
  // Câu hỏi trước trong cuộc hỏi: để AI hiểu câu nối tiếp ("còn bao nhiêu hạng mục chưa nhập kho" sau câu về 1 công trình)
  const truoc = String(req.body?.truoc ?? '').trim().slice(0, 300);
  if (!cau) return res.status(400).json({ success: false, message: 'Thiếu câu hỏi' });
  if (!aiBat()) return res.status(503).json({ success: false, message: 'Chưa bật AI' });
  try {
    const co = await quyenCua(req);
    if (!co) return res.status(403).json({ success: false, message: 'Không có quyền' });
    const bangs = DANH_MUC.filter(b => xemBang(b, co)).map(b => ({ b, cot: b.cot.filter(c => xemCot(c, co)) }));
    if (!bangs.length) return res.status(403).json({ success: false, message: 'Không có bảng nào được xem' });
    const sxB = bangTheoId.get(SX)!;
    const sx = xemBang(sxB, co) ? sxB.cot.filter(c => xemCot(c, co) && c.kieu !== 'so' && c.kieu !== 'ct' && c.kieu !== 'xuong' && c.id !== 'hex') : [];
    const { gt } = await layTuDien(co, false);
    const homNay = new Date();
    const loiDan = taoLoiDan(bangs, sx, gt, homNay);
    // Cache theo câu + ngày + bộ bảng / cột được xem (người khác quyền => lời dặn khác)
    const noiDung = truoc ? `Câu hỏi trước (chỉ để hiểu câu nối tiếp, nếu câu bây giờ không nói đối tượng thì dùng đối tượng của câu trước): "${truoc}"\nCâu hỏi bây giờ: "${cau}"` : cau;
    const kq = await hoiAI(loiDan, noiDung, hashKey({ cau: cau.toLowerCase(), truoc: truoc.toLowerCase(), d: homNay.toDateString(), b: bangs.map(x => [x.b.id, x.cot.length]), sx: sx.length }));
    if (kq.loai !== 'truy_van') return res.json({ success: true, loai: kq.loai, giaiThich: kq.giai_thich ?? '' });
    const tv = TruyVanAISchema.safeParse(kq.tv);
    if (!tv.success) return res.json({ success: true, loai: 'khong_hieu', giaiThich: 'AI viết truy vấn sai dạng' });
    const b = bangTheoId.get(tv.data.bang);
    if (!b || !xemBang(b, co)) return res.json({ success: true, loai: 'khong_hieu', giaiThich: 'AI chọn bảng không có hoặc bạn chưa có quyền xem' });
    // Mọi cột AI dùng phải có thật và được xem
    try {
      [...tv.data.nhom.map(n => n.split('@')[0]), ...tv.data.do.map(d => d.cot).filter((x): x is string => !!x), ...tv.data.loc.map(l => l.cot), ...(tv.data.cotXem ?? [])]
        .forEach(id => timCot(b, id, co));
    } catch (e) {
      return res.json({ success: true, loai: 'khong_hieu', giaiThich: e instanceof LoiHoi ? `AI dùng cột không hợp lệ: ${e.message}` : 'AI dùng cột không hợp lệ' });
    }
    res.json({ success: true, loai: 'truy_van', tv: tv.data, giaiThich: kq.giai_thich ?? '' });
  } catch (e) {
    if (e instanceof LoiAI) return res.status(502).json({ success: false, message: e.message });
    console.error('hoi-dap/ai', e);
    res.status(500).json({ success: false, message: 'Lỗi hỏi AI' });
  }
});
