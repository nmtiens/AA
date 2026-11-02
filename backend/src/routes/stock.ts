import { parseNameList, expandProjectNames, normNameSql, canonicalProjectName, projectAliasesVersion } from '../server/projectAlias.js';
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { requireWarmupSecret } from '../server/auth.js';
import { REPORT_COLUMNS, parseSafeDate, getRelevantVersions, trimCache, refreshAllDataCache, numericColQualified, sapKeySql } from '../server/data.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { laGioNghiDb } from '../server/gioNghi.js';
import { app, warmupLimiter } from '../server/app.js';
import { expandWorkshops, workshopGroupsVersion, workshopGroupSql } from '../server/workshopGroups.js';

// --- CACHE IN-MEMORY CHO /api/stock/dates (theo bộ lọc tổng) ---
// TRƯỚC: 1 biến module-level duy nhất (không phân biệt filter).
// SAU: Map key theo bộ lọc, giống overviewSummaryCache/khsxNhapKhoCache.
const stockDatesCache = new Map<string, { versions: Record<string, string>; payload: any }>();
// /api/stock/by-project, /api/stock/items, /api/stock/total-count (có lọc): cache theo phiên bản tồn kho +
// sản xuất (xem server/cache.ts). items trả tới 5.000 dòng => giữ ít entry hơn.
const stockQueryCache = createCache<unknown>(40);
const stockItemsCache = createCache<unknown>(10);
const STOCK_VERSION_KEYS = ['stock', 'production'];

interface StockFilterParams {
  congTrinh: string[];
  xuong: string[];
  tinhTrang: string[];
  tinhTrangIpo: string[];
}
const parseStockFilters = (req: Request): StockFilterParams => ({
  // Mọi cách viết của công trình được chọn (xem server/projectAlias.ts)
  congTrinh: expandProjectNames(parseNameList(req.query.congTrinh)),
  // Xưởng đã gộp -> mọi mã gốc (setup gộp xưởng)
  xuong: expandWorkshops(String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)),
  tinhTrang: String(req.query.tinhTrang || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
  tinhTrangIpo: String(req.query.tinhTrangIpo || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
});

// [ĐO TIMING] Endpoint từng bị "pending" 25.39s trên production — điểm nóng số 2.
const refreshStockDatesCache = async (filters: StockFilterParams) => {
  const needsJoin = hasProductionFilter(filters);
  // pa: phiên bản bảng tên công trình — kết quả tính lúc instance mới chưa nạp xong bảng tên không bị giữ lại
  const cacheKey = JSON.stringify({ ...filters, wg: workshopGroupsVersion(), pa: projectAliasesVersion() });
  const versions = await getRelevantVersions(needsJoin ? ['stock', 'production'] : ['stock']);

  const cached = stockDatesCache.get(cacheKey);
  if (cached && JSON.stringify(cached.versions) === JSON.stringify(versions)) {
    return { payload: cached.payload, fromCache: true };
  }

  const conds: string[] = ['s.date_parsed IS NOT NULL'];
  const params: any[] = [];
  if (filters.congTrinh.length) {
    params.push(filters.congTrinh);
    conds.push(`${normNameSql('s.ten_cong_trinh')} = ANY($${params.length}::text[])`);
  }

  // SỬA: thay LEFT JOIN trực tiếp trên toàn bộ lịch sử ton_kho (rất nặng, gây
  // statement timeout) bằng CTE lọc TRƯỚC tập ma_id_sap thỏa điều kiện xưởng/
  // tình trạng/IPO từ production_status_app (bảng snapshot hiện tại, nhỏ hơn
  // nhiều và không có nhiều dòng lặp theo ngày như ton_kho), sau đó chỉ INNER
  // JOIN ton_kho với tập ma_id_sap đã lọc sẵn này — giảm chi phí đáng kể.
  let cteClause = '';
  let joinClause = '';
  if (needsJoin) {
    cteClause = `WITH matched_ids AS (${matchedIdsSql(productionConds(filters, params))})`;
    joinClause = `INNER JOIN matched_ids m ON m.ma_id_sap::text = s.ma_id_sap::text`;
  }

  const q = `
    ${cteClause}
    SELECT s.date_parsed AS d,
          COUNT(DISTINCT s.ma_id_sap) AS count,
           COALESCE(SUM(${numericColQualified('ton_kho', 's', 'gia_tri')}), 0) AS value
    FROM ton_kho s
    ${joinClause}
    WHERE ${conds.join(' AND ')}
    GROUP BY 1
    ORDER BY 1 DESC
  `;
  const r = await timedQuery(q, params);
  const payload = r.rows.map(row => ({ date: row.d, count: Number(row.count), value: Number(row.value) }));

  stockDatesCache.set(cacheKey, { versions, payload });
  trimCache(stockDatesCache);
  return { payload, fromCache: false };
};

// Tập ma_id_sap thoả bộ lọc xưởng / tình trạng / IPO — xét DÒNG SẢN XUẤT MỚI NHẤT của mỗi mã
// (giống biểu đồ tồn theo xưởng: buildMatchedProductionCTE). Trước đây xét mọi dòng nên 1 mã có
// dòng ở nhiều xưởng bị tính vào mọi xưởng đó => tổng các xưởng khi lọc lớn hơn tổng thật.
// Điều kiện gộp thành 1 cột boolean `ok` rồi lọc `WHERE ok`: lọc thẳng 2 điều kiện trở lên (vd. tình trạng +
// IPO) Postgres ước ~1 mã rồi chọn nested loop so từng dòng tồn với từng mã => 9–15s, vượt statement timeout.
// Cột boolean không có thống kê => ước 50% số mã => hash join (~0,1–0,2s).
// Mã SAP phía sản xuất chuẩn hoá về 12 số (sapKeySql) — cột ra ma_id_sap là text đã chuẩn hoá.
const PSA_SAP_KEY = sapKeySql('ma_id_sap');
const matchedIdsSql = (pConds: string[]) => `
  SELECT ma_id_sap FROM (
    SELECT DISTINCT ON (${PSA_SAP_KEY}) ${PSA_SAP_KEY} AS ma_id_sap${pConds.length ? `, (${pConds.join(' AND ')}) AS ok` : ''}
    FROM production_status_app
    WHERE ma_id_sap IS NOT NULL
    ORDER BY ${PSA_SAP_KEY}, updated_at DESC NULLS LAST, id DESC
  ) lp${pConds.length ? ' WHERE ok' : ''}
`;

// Điều kiện xưởng / tình trạng / IPO (theo dòng sản xuất mới nhất của mã) — đẩy tham số vào params
const productionConds = (filters: StockFilterParams, params: any[]): string[] => {
  const pConds: string[] = [];
  if (filters.xuong.length) { params.push(filters.xuong); pConds.push(`UPPER(TRIM(xuong_chinh)) = ANY($${params.length}::text[])`); }
  if (filters.tinhTrang.length) { params.push(filters.tinhTrang); pConds.push(`UPPER(TRIM(tinh_trang)) = ANY($${params.length}::text[])`); }
  if (filters.tinhTrangIpo.length) { params.push(filters.tinhTrangIpo); pConds.push(`UPPER(TRIM(tinh_trang_ipo)) = ANY($${params.length}::text[])`); }
  return pConds;
};
const hasProductionFilter = (filters: StockFilterParams) =>
  filters.xuong.length > 0 || filters.tinhTrang.length > 0 || filters.tinhTrangIpo.length > 0;

// Điều kiện phạm vi công trình / xưởng / tình trạng / IPO trên bảng ton_kho (alias tuỳ chọn) — dùng cho
// CSV / đếm dòng / chi tiết từng mã; cùng tập mã với /api/stock/by-project (matchedIdsSql)
const stockScopeConds = (filters: StockFilterParams, params: any[], alias = '', withProject = true): string[] => {
  const a = alias ? `${alias}.` : '';
  const conds: string[] = [];
  if (withProject && filters.congTrinh.length) {
    params.push(filters.congTrinh);
    conds.push(`${normNameSql(`${a}ten_cong_trinh`)} = ANY($${params.length}::text[])`);
  }
  if (hasProductionFilter(filters)) {
    conds.push(`${a}ma_id_sap::text IN (SELECT mi.ma_id_sap::text FROM (${matchedIdsSql(productionConds(filters, params))}) mi)`);
  }
  return conds;
};

app.get('/api/stock/dates', async (req: Request, res: Response) => {
  try {
    const { payload } = await refreshStockDatesCache(parseStockFilters(req));
    res.json(payload);
  } catch (error) {
    console.error('Lỗi stock/dates:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================================
// WARM-UP ENDPOINT — nay yêu cầu header x-warmup-key + rate limit riêng
// (trước đây public hoàn toàn, có thể bị gọi dồn dập để ép tính lại cache nặng)
// ============================================================================
app.get('/api/warmup', warmupLimiter, requireWarmupSecret, async (_req: Request, res: Response) => {
  if (laGioNghiDb()) return res.json({ ok: true, boQua: 'gio-nghi-db' });
  const startedAt = Date.now();
  const warmed: string[] = [];
  try {
    const { fromCache: allDataFromCache } = await refreshAllDataCache();
    warmed.push(allDataFromCache ? 'all-data (cached)' : 'all-data (refreshed)');

    // MỚI: chỉ warm-up cache cho trường hợp KHÔNG lọc (mặc định), vì không thể
    // warm trước mọi tổ hợp filter có thể có.
    const { fromCache: stockFromCache } = await refreshStockDatesCache({
      congTrinh: [], xuong: [], tinhTrang: [], tinhTrangIpo: [],
    });
    warmed.push(stockFromCache ? 'stock-dates (cached)' : 'stock-dates (refreshed)');

    res.json({ ok: true, warmed, ms: Date.now() - startedAt });
  } catch (error) {
    console.error('Lỗi warmup:', error);
    res.status(500).json({ ok: false, error: 'Warmup failed' });
  }
});

// Trả về: tồn kho theo công trình, tại 1 ngày cụ thể
app.get('/api/stock/by-project', async (req: Request, res: Response) => {
  try {
    const { date } = req.query as { date: string };
    if (!date) return res.status(400).json({ error: 'Missing date' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parseSafeDate(date)) return res.status(400).json({ error: 'Invalid date' });

    const filters = parseStockFilters(req);
    const needsJoin = hasProductionFilter(filters);

    const rows = await cachedByVersions(stockQueryCache, `by-project|${date}|${JSON.stringify(filters)}`, STOCK_VERSION_KEYS, async () => {
    const conds: string[] = ['s.date_parsed = $1'];
    const params: any[] = [date];
    if (filters.congTrinh.length) {
      params.push(filters.congTrinh);
      conds.push(`${normNameSql('s.ten_cong_trinh')} = ANY($${params.length}::text[])`);
    }

    let cteClause = '';
    let joinClause = '';
    if (needsJoin) {
      cteClause = `WITH matched_ids AS (${matchedIdsSql(productionConds(filters, params))})`;
      joinClause = `INNER JOIN matched_ids m ON m.ma_id_sap::text = s.ma_id_sap::text`;
    }

    const q = `
      ${cteClause}
      SELECT COALESCE(NULLIF(MIN(TRIM(REGEXP_REPLACE(s.ten_cong_trinh, '\\s+', ' ', 'g'))), ''), 'Chưa xác định') AS name,
            COUNT(DISTINCT s.ma_id_sap) AS count,
             COALESCE(SUM(${numericColQualified('ton_kho', 's', 'gia_tri')}), 0) AS value
      FROM ton_kho s
      ${joinClause}
      WHERE ${conds.join(' AND ')}
      GROUP BY ${normNameSql('s.ten_cong_trinh')} -- tên chuẩn hoá như khi lọc / xem chi tiết
      ORDER BY value DESC
    `;
    const r = await timedQuery(q, params);
    // Gộp các cách viết của cùng 1 công trình về tên chuẩn — khớp biểu đồ nhập / xuất kho theo công trình
    const merged = new Map<string, { count: number; value: number }>();
    for (const row of r.rows) {
      const name = row.name === 'Chưa xác định' ? row.name : canonicalProjectName(row.name);
      const e = merged.get(name) ?? { count: 0, value: 0 };
      e.count += Number(row.count);
      e.value += Number(row.value);
      merged.set(name, e);
    }
    return [...merged.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);
    }, workshopGroupsVersion());
    res.json(rows);
  } catch (error) {
    console.error('Lỗi stock/by-project:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// "Sức khoẻ" tồn kho tại 1 ngày chốt (cửa sổ Tồn kho, tab Tổng quan). Cùng phạm vi lọc với /api/stock/by-project.
// Giá trị: triệu đồng. Tuổi = (ngày chốt − ngày nhập kho) / 30,4 làm tròn tháng, tính lại cho MỌI lần chốt — cột
// so_thang_ton_kho gốc bị hỏng ở vài lần chốt (28/02, 01/10, 15/10…). "Hàng cũ" = tuổi > 6 (từ 7 tháng).
// Nhóm trạng thái: mỗi dòng tồn vào nhóm ĐẦU TIÊN khớp (thứ tự trong NHOM_SQL), theo trạng thái HEX trong PSA (dòng
// mới nhất) + lịch sử xuất kho theo mã công trình và theo HEX — phân loại để giao việc, không phải nguyên nhân đã xác nhận.
const TUOI_SQL = (a: string) => `(CASE WHEN ${a}.ngay_nhap_kho IS NULL THEN NULL ELSE ROUND((${a}.date_parsed - ${a}.ngay_nhap_kho) / 30.4) END)`;
const PSA_DONG_BO = (a: string) => `(${a}.tinh_trang LIKE '01.1%' OR ${a}.tinh_trang LIKE '00.%')`;
const PSA_HUY = (a: string) => `(${a}.tinh_trang = 'HỦY' OR COALESCE(${a}.tam_ngung_huy_don_hang_tong, '') ILIKE 'H%Y')`;
const NHOM_SQL = `CASE
    WHEN p.hex IS NOT NULL AND ${PSA_HUY('p')} THEN 'huy'
    WHEN UPPER(TRIM(s.tinh_trang_ke_hoach_giao_hang)) = 'ĐÃ XUẤT' THEN 'daXuat'
    WHEN s.hex IS NULL OR p.hex IS NULL THEN 'khongPsa'
    WHEN xc.xcuoi IS NULL OR xc.xcuoi < $1::date - 60 THEN 'khongXuat'
    WHEN NOT ${PSA_DONG_BO('p')} THEN 'chuaDongBo'
    WHEN xh.xcuoi IS NULL THEN 'chuaXuat'
    ELSE 'motPhan' END`;
app.get('/api/stock/health', async (req: Request, res: Response) => {
  try {
    const { date } = req.query as { date: string };
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !parseSafeDate(date)) return res.status(400).json({ error: 'Invalid date' });
    const filters = parseStockFilters(req);

    const payload = await cachedByVersions(stockQueryCache, `health2|${date}|${JSON.stringify(filters)}`, STOCK_VERSION_KEYS, async () => {
      const n = (x: unknown) => Number(x) || 0;
      const v = numericColQualified('ton_kho', 's', 'gia_tri');
      const params: any[] = [date];
      const scope = stockScopeConds(filters, params, 's');
      const w = ['s.date_parsed = $1', ...scope].join(' AND ');

      // Lần chốt ngày xem: dòng tồn + PSA mới nhất theo HEX + ngày xuất cuối theo mã công trình / theo HEX
      const snapSql = `WITH s AS MATERIALIZED (SELECT s.*, ${v} AS v, ${TUOI_SQL('s')} AS tuoi, s.hex::bigint AS h FROM ton_kho s WHERE ${w}),
        p AS MATERIALIZED (SELECT DISTINCT ON (hex) hex, tinh_trang, tam_ngung_huy_don_hang_tong, khach_hang, khu_vuc_du_an
          FROM production_status_app WHERE hex IN (SELECT h FROM s WHERE h IS NOT NULL) ORDER BY hex, updated_at DESC NULLS LAST, id DESC),
        xc AS MATERIALIZED (SELECT ma_cong_trinh, MAX(date_parsed) AS xcuoi FROM xuat_kho
          WHERE ma_cong_trinh IN (SELECT ma_cong_trinh FROM s) AND date_parsed <= $1::date GROUP BY 1),
        xh AS MATERIALIZED (SELECT hex::bigint AS hex, MAX(date_parsed) AS xcuoi FROM xuat_kho
          WHERE hex::bigint IN (SELECT h FROM s WHERE h IS NOT NULL) AND date_parsed <= $1::date GROUP BY 1),
        j AS MATERIALIZED (SELECT s.*, p.hex AS phex, p.tinh_trang AS ptt, p.khu_vuc_du_an AS kv, xc.xcuoi AS ct_xcuoi,
            CASE WHEN p.hex IS NULL THEN 'kpsa' WHEN p.khach_hang ILIKE '%SUN%' THEN 'sun' ELSE 'khac' END AS kh,
            CASE WHEN p.hex IS NOT NULL AND NOT ${PSA_HUY('p')} AND NOT ${PSA_DONG_BO('p')} THEN 1 ELSE 0 END AS chua_db,
            ${NHOM_SQL} AS nhom
          FROM s LEFT JOIN p ON p.hex = s.h LEFT JOIN xc ON xc.ma_cong_trinh = s.ma_cong_trinh LEFT JOIN xh ON xh.hex = s.h)`;
      const [snap, chuoiR] = await Promise.all([
        timedQuery(`${snapSql}
          SELECT (SELECT json_build_object('v', COALESCE(SUM(v),0), 'ma', COUNT(DISTINCT ma_id_sap) FILTER (WHERE v > 0),
                    'ct', COUNT(DISTINCT ${normNameSql('ten_cong_trinh')}), 'tren6', COALESCE(SUM(v) FILTER (WHERE tuoi > 6),0),
                    'chuaDongBo', COALESCE(SUM(v) FILTER (WHERE chua_db = 1),0)) FROM j) AS tong,
            (SELECT COALESCE(json_agg(x), '[]') FROM (SELECT nhom AS k, SUM(v) AS v, COALESCE(SUM(v) FILTER (WHERE tuoi > 6),0) AS tren6,
                COUNT(DISTINCT ma_id_sap) FILTER (WHERE v > 0) AS ma FROM j GROUP BY 1) x) AS nhom,
            (SELECT COALESCE(json_agg(x), '[]') FROM (SELECT CASE WHEN tuoi IS NULL THEN NULL WHEN tuoi > 24 THEN 25 WHEN tuoi > 18 THEN 19
                WHEN tuoi > 12 THEN 13 ELSE GREATEST(tuoi, 0) END AS b, kh, SUM(v) AS v FROM j GROUP BY 1, 2) x) AS hist,
            (SELECT COALESCE(json_agg(x), '[]') FROM (SELECT kh AS k, SUM(v) AS v, COALESCE(SUM(v) FILTER (WHERE tuoi > 6),0) AS tren6,
                COALESCE(SUM(v) FILTER (WHERE tuoi BETWEEN 4 AND 6),0) AS t46 FROM j GROUP BY 1) x) AS khach,
            (SELECT COALESCE(json_agg(x), '[]') FROM (SELECT COALESCE(NULLIF(UPPER(TRIM(kv)),''), CASE WHEN h IS NULL THEN '(LẺ)' ELSE '(TRỐNG)' END) AS k,
                SUM(v) AS v, COALESCE(SUM(v) FILTER (WHERE tuoi > 6),0) AS tren6, COALESCE(SUM(v) FILTER (WHERE kh = 'sun'),0) AS sun FROM j GROUP BY 1) x) AS kv,
            (SELECT COALESCE(json_agg(x), '[]') FROM (SELECT MIN(TRIM(REGEXP_REPLACE(ten_cong_trinh, '\\s+', ' ', 'g'))) AS name,
                array_agg(DISTINCT NULLIF(TRIM(ma_cong_trinh), '')) FILTER (WHERE NULLIF(TRIM(ma_cong_trinh), '') IS NOT NULL) AS mct,
                SUM(v) AS v, COUNT(DISTINCT ma_id_sap) FILTER (WHERE v > 0) AS ma, COALESCE(SUM(v) FILTER (WHERE tuoi > 6),0) AS tren6,
                MAX(ct_xcuoi)::text AS xcuoi FROM j GROUP BY ${normNameSql('ten_cong_trinh')}) x) AS ct`, params, { workMemMb: 32 }),
        // Mọi lần chốt từ cuối năm trước tới ngày xem: tổng, hàng cũ, tuổi bình quân theo giá trị
        (() => {
          const p2: any[] = [date];
          const sc = stockScopeConds(filters, p2, 's');
          return timedQuery(`SELECT s.date_parsed::text AS d, COALESCE(SUM(${v}),0) AS v,
              COALESCE(SUM(${v}) FILTER (WHERE ${TUOI_SQL('s')} > 6),0) AS tren6,
              SUM(${v} * ${TUOI_SQL('s')}) / NULLIF(SUM(${v}) FILTER (WHERE s.ngay_nhap_kho IS NOT NULL), 0) AS tuoi_bq
            FROM ton_kho s WHERE s.date_parsed <= $1 AND s.date_parsed >= (date_trunc('year', $1::date) - INTERVAL '1 day')
              ${sc.length ? 'AND ' + sc.join(' AND ') : ''}
            GROUP BY 1 ORDER BY 1`, p2);
        })(),
      ]);

      const r0 = snap.rows[0] ?? {};
      const chuoi = chuoiR.rows.map(r => ({ d: String(r.d), v: n(r.v), tren6: n(r.tren6), tuoiBq: r.tuoi_bq === null ? null : n(r.tuoi_bq) }));
      // Cuối mỗi tháng = lần chốt cuối cùng trong tháng (tháng của ngày xem lấy chính ngày xem)
      const cuoiThang: string[] = [];
      for (const c of chuoi) {
        if (cuoiThang.length && cuoiThang[cuoiThang.length - 1].slice(0, 7) === c.d.slice(0, 7)) cuoiThang[cuoiThang.length - 1] = c.d;
        else cuoiThang.push(c.d);
      }
      const thangXem = date.slice(0, 7);
      const mocTruoc = cuoiThang.filter(d => d.slice(0, 7) < thangXem).slice(-2)[0] ?? null; // cuối tháng cách 2 tháng

      // Công trình: gộp tên chuẩn
      const ctMap = new Map<string, { name: string; mct: Set<string>; v: number; ma: number; tren6: number; xuatCuoi: string | null }>();
      for (const r of (r0.ct ?? []) as Record<string, any>[]) {
        const name = r.name ? canonicalProjectName(String(r.name)) : 'Chưa xác định';
        const e = ctMap.get(name) ?? { name, mct: new Set<string>(), v: 0, ma: 0, tren6: 0, xuatCuoi: null };
        for (const m of (r.mct ?? []) as string[]) e.mct.add(m);
        e.v += n(r.v); e.ma += n(r.ma); e.tren6 += n(r.tren6);
        if (r.xcuoi && (!e.xuatCuoi || r.xcuoi > e.xuatCuoi)) e.xuatCuoi = String(r.xcuoi);
        ctMap.set(name, e);
      }
      const ctList = [...ctMap.values()].sort((a, b) => b.v - a.v);
      const top = ctList.slice(0, 15);
      const topMct = [...new Set(top.flatMap(c => [...c.mct]))];

      // Vòng 2: dòng hàng cũ giữa các lần chốt cuối tháng, bản đồ nhiệt, cột thêm cho công trình lớn, tỷ trọng Sun trong đơn
      const ngayNhiet = [...new Set([...cuoiThang.slice(-6), ...(mocTruoc ? [mocTruoc] : [])])];
      const theoPhamVi = (own: any[]) => { const ps = [...own]; const sc = stockScopeConds(filters, ps, 's'); return { ps, and: sc.length ? 'AND ' + sc.join(' AND ') : '' }; };
      const qDong = theoPhamVi([cuoiThang]);
      const qNhiet = theoPhamVi([ngayNhiet, topMct]);
      const congTrinhLoc = filters.congTrinh.length > 0 || hasProductionFilter(filters);
      const [dong, heat, xuat, conSx, sunDon] = await Promise.all([
        cuoiThang.length >= 2 ? timedQuery(`WITH k AS (SELECT s.date_parsed AS d, s.ma_id_sap, COALESCE(s.ma_cong_trinh, '') AS mct, SUM(${v}) AS v,
              COALESCE(SUM(${v}) FILTER (WHERE ${TUOI_SQL('s')} > 6), 0) AS o
            FROM ton_kho s WHERE s.date_parsed = ANY($1::date[]) ${qDong.and} GROUP BY 1, 2, 3),
          d AS (SELECT d0, LEAD(d0) OVER (ORDER BY d0) AS d1 FROM unnest($1::date[]) AS d0)
          SELECT d.d0::text AS d0, d.d1::text AS d1, SUM(a.o) AS o0, SUM(GREATEST(a.o - COALESCE(b.v, 0), 0)) AS ra
          FROM d JOIN k a ON a.d = d.d0 LEFT JOIN k b ON b.d = d.d1 AND b.ma_id_sap = a.ma_id_sap AND b.mct = a.mct
          WHERE d.d1 IS NOT NULL GROUP BY 1, 2 ORDER BY 1`, qDong.ps, { workMemMb: 32 }) : Promise.resolve({ rows: [] as any[] }),
        timedQuery(`SELECT s.ma_cong_trinh AS mct, s.date_parsed::text AS d, SUM(${v}) AS v, COALESCE(SUM(${v}) FILTER (WHERE ${TUOI_SQL('s')} > 6), 0) AS tren6
          FROM ton_kho s WHERE s.date_parsed = ANY($1::date[]) AND s.ma_cong_trinh = ANY($2::text[]) ${qNhiet.and} GROUP BY 1, 2`, qNhiet.ps),
        timedQuery(`SELECT ma_cong_trinh AS mct, SUM(COALESCE(thanh_tien_xuat_kho, 0)) FILTER (WHERE date_parsed > $2::date - 60) AS x60
          FROM xuat_kho WHERE ma_cong_trinh = ANY($1::text[]) AND date_parsed <= $2::date GROUP BY 1`, [topMct, date]),
        timedQuery(`SELECT ma_cong_trinh AS mct, SUM(gia_tri_con_lai) AS v FROM production_status_app p
          WHERE ma_cong_trinh = ANY($1::text[]) AND gia_tri_con_lai > 0 AND NOT ${PSA_HUY('p')} AND NOT ${PSA_DONG_BO('p')} GROUP BY 1`, [topMct]),
        timedQuery(`SELECT SUM(gia_tri_con_lai) FILTER (WHERE khach_hang ILIKE '%SUN%') AS sun, SUM(gia_tri_con_lai) AS tong
          FROM production_status_app p WHERE gia_tri_con_lai > 0 AND NOT ${PSA_HUY('p')} AND NOT ${PSA_DONG_BO('p')}
            ${congTrinhLoc ? `AND ma_cong_trinh IN (SELECT DISTINCT s.ma_cong_trinh FROM ton_kho s WHERE ${w})` : ''}`, congTrinhLoc ? params : []),
      ]);

      const tren6Ngay = new Map(chuoi.map(c => [c.d, c.tren6]));
      const theoMct = <T>(rows: Record<string, any>[], f: (r: Record<string, any>) => T) => new Map(rows.map(r => [String(r.mct), f(r)]));
      const x60 = theoMct(xuat.rows, r => n(r.x60));
      const csx = theoMct(conSx.rows, r => n(r.v));
      const heatMap = new Map<string, Map<string, { v: number; tren6: number }>>(); // mct -> ngày -> số
      for (const r of heat.rows) {
        const m = heatMap.get(r.mct) ?? new Map(); m.set(String(r.d), { v: n(r.v), tren6: n(r.tren6) }); heatMap.set(r.mct, m);
      }
      const cong = (c: typeof top[number], d: string) => {
        let vv = 0, t6 = 0, co = false;
        for (const m of c.mct) { const x = heatMap.get(m)?.get(d); if (x) { vv += x.v; t6 += x.tren6; co = true; } }
        return co ? { v: vv, tren6: t6 } : null;
      };
      const tong = r0.tong ?? {};
      return {
        date,
        tong: { v: n(tong.v), ma: n(tong.ma), congTrinh: n(tong.ct), tren6: n(tong.tren6), chuaDongBo: n(tong.chuaDongBo) },
        chuoi,
        cuoiThang,
        mocTruoc,
        dongCu: dong.rows.map(r => {
          const o1 = tren6Ngay.get(String(r.d1)) ?? 0, o0 = n(r.o0), ra = n(r.ra);
          return { d0: String(r.d0), d1: String(r.d1), o0, o1, ra, vao: o1 - (o0 - ra) };
        }),
        nhom: ((r0.nhom ?? []) as Record<string, any>[]).map(r => ({ k: String(r.k), v: n(r.v), tren6: n(r.tren6), ma: n(r.ma) })),
        hist: ((r0.hist ?? []) as Record<string, any>[]).map(r => ({ b: r.b === null ? null : n(r.b), kh: String(r.kh), v: n(r.v) })),
        khach: ((r0.khach ?? []) as Record<string, any>[]).map(r => ({ k: String(r.k), v: n(r.v), tren6: n(r.tren6), t46: n(r.t46) })),
        sunDon: n(sunDon.rows[0]?.tong) > 0 ? n(sunDon.rows[0].sun) / n(sunDon.rows[0].tong) : null,
        khuVuc: ((r0.kv ?? []) as Record<string, any>[]).map(r => ({ k: String(r.k), v: n(r.v), tren6: n(r.tren6), sun: n(r.sun) })).sort((a, b) => b.v - a.v),
        congTrinh: ctList.map((c, i) => {
          const them = i < top.length;
          const sum = (m: Map<string, number>) => [...c.mct].reduce((s, k) => s + (m.get(k) ?? 0), 0);
          return {
            name: c.name, mct: [...c.mct], v: c.v, ma: c.ma, tren6: c.tren6, xuatCuoi: c.xuatCuoi,
            vTruoc: them && mocTruoc ? (cong(c, mocTruoc)?.v ?? 0) : null,
            xuat60: them ? sum(x60) : null,
            conSx: them ? sum(csx) : null,
            thang: them && i < 10 ? cuoiThang.slice(-6).map(d => ({ d, ...(cong(c, d) ?? { v: 0, tren6: 0 }), co: !!cong(c, d) })) : null,
          };
        }),
      };
    }, workshopGroupsVersion());
    res.json(payload);
  } catch (error) {
    console.error('Lỗi stock/health:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Chi tiết TỪNG MÃ tồn kho tại 1 ngày (bấm số "P022. TỒN KHO" ở phễu).
// project = 1 công trình (bỏ trống = mọi công trình trong phạm vi lọc congTrinh / xuong).
// Kèm hạng mục / xưởng / nhóm SP lấy từ production_status_app theo mã ID SAP.
const STOCK_ITEMS_LIMIT = 5000;
app.get('/api/stock/items', async (req: Request, res: Response) => {
  try {
    const { date } = req.query as { date: string };
    if (!date) return res.status(400).json({ error: 'Missing date' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parseSafeDate(date)) return res.status(400).json({ error: 'Invalid date' });
    const project = String(req.query.project || '').trim().toUpperCase();
    const filters = parseStockFilters(req);

    const payload = await cachedByVersions(stockItemsCache, `items|${date}|${project}|${JSON.stringify(filters)}`, STOCK_VERSION_KEYS, async () => {
    const conds: string[] = ['s.date_parsed = $1'];
    const params: any[] = [date];
    if (project === 'CHƯA XÁC ĐỊNH') {
      conds.push(`TRIM(COALESCE(s.ten_cong_trinh, '')) = ''`);
    } else if (project) {
      // Tên chuẩn (dòng ở biểu đồ theo công trình) -> mọi cách viết của cùng công trình
      params.push(expandProjectNames([project]));
      conds.push(`${normNameSql('s.ten_cong_trinh')} = ANY($${params.length}::text[])`);
    }
    // Công trình (khi không chọn 1 công trình cụ thể) + xưởng / tình trạng / IPO — cùng tập mã với
    // /api/stock/by-project (trước bỏ qua tinhTrang / tinhTrangIpo => tổng chi tiết lớn hơn biểu đồ)
    conds.push(...stockScopeConds(filters, params, 's', !project));
    params.push(STOCK_ITEMS_LIMIT + 1);

    const r = await timedQuery(
      // Dòng sản xuất mới nhất của mỗi mã: tính 1 lần rồi nối (trước dùng LATERAL tra lại cho TỪNG mã
      // tồn => ~4k lần quét bảng sản xuất, vượt statement timeout khi không lọc công trình)
      `WITH p AS (
         SELECT DISTINCT ON (${PSA_SAP_KEY}) ${PSA_SAP_KEY} AS sap_id, ten_hang_muc, xuong_chinh, phan_loai_nhom_san_pham
         FROM production_status_app
         WHERE ma_id_sap IS NOT NULL
         ORDER BY ${PSA_SAP_KEY}, updated_at DESC NULLS LAST, id DESC
       ),
       -- Hạng mục của CHÍNH HEX tồn kho (công trình -> hạng mục -> ...): nhiều HEX dùng chung 1 mã SAP nên tra theo mã
       -- có thể ra tên / xưởng của HEX khác; chỉ dòng tồn không có HEX mới lấy theo mã SAP
       h AS (
         SELECT DISTINCT ON (hex::text) hex::text AS hex, ten_hang_muc, xuong_chinh, phan_loai_nhom_san_pham
         FROM production_status_app
         WHERE hex IS NOT NULL AND hex::text IN (SELECT DISTINCT hex::bigint::text FROM ton_kho WHERE date_parsed = $1 AND hex IS NOT NULL)
         ORDER BY hex::text, updated_at DESC NULLS LAST, id DESC
       )
       -- Nối xong rồi mới sắp + LIMIT (OFFSET 0 chặn đẩy LIMIT vào trong: không có nó Postgres chọn
       -- nested loop so từng dòng tồn với ~30k mã => ~2–8s khi không lọc)
       SELECT * FROM (
         SELECT s.hex::bigint::text AS hex, s.ma_id_sap::text AS ma_id_sap, s.ten_cong_trinh,
                COALESCE(h.ten_hang_muc, p.ten_hang_muc) AS ten_hang_muc,
                ${workshopGroupSql('COALESCE(h.xuong_chinh, p.xuong_chinh)')} AS xuong_chinh,
                COALESCE(h.phan_loai_nhom_san_pham, p.phan_loai_nhom_san_pham) AS phan_loai_nhom_san_pham,
                ${numericColQualified('ton_kho', 's', 'gia_tri')} AS gia_tri
         FROM ton_kho s
         LEFT JOIN h ON h.hex = s.hex::bigint::text
         LEFT JOIN p ON p.sap_id = s.ma_id_sap::text
         WHERE ${conds.join(' AND ')}
         OFFSET 0
       ) x
       ORDER BY gia_tri DESC NULLS LAST
       LIMIT $${params.length}`,
      params,
      { workMemMb: 32 }
    );
    const truncated = r.rows.length > STOCK_ITEMS_LIMIT;
    return { rows: r.rows.slice(0, STOCK_ITEMS_LIMIT).map(row => ({ ...row, gia_tri: Number(row.gia_tri) || 0 })), truncated };
    }, workshopGroupsVersion());
    res.json(payload);
  } catch (error) {
    console.error('Lỗi stock/items:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


const STOCK_EXPORT_LABELS: Record<string, string> = {
  id: 'ID',
  date: 'NGÀY',
  gia_tri: 'GIÁ TRỊ TỒN KHO',
  ma_id_sap: 'MÃ ID SAP',
  hex: 'HEX',
  ten_cong_trinh: 'TÊN CÔNG TRÌNH',
  updated_at: 'CẬP NHẬT LÚC',
};

// Ô bắt đầu bằng = + - @ (hoặc tab / CR) bị Excel / LibreOffice hiểu là công thức (CSV injection): thêm dấu '
// phía trước và luôn bọc trong dấu nháy kép. Số thuần (kể cả số âm) giữ nguyên để Excel vẫn đọc là số.
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;
const csvEscape = (value: any): string => {
  if (value === null || value === undefined) return '';
  let str = String(value);
  const formulaLike = CSV_FORMULA_PREFIX.test(str) && !/^-?\d+(\.\d+)?$/.test(str);
  if (formulaLike) str = `'${str}`;
  return formulaLike || /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};
const stockExportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Xuất tồn kho quá nhiều lần, vui lòng thử lại sau' },
});

app.get('/api/stock/export/csv', stockExportLimiter, async (req: Request, res: Response) => {
  try {
    const datesParam = String(req.query.dates || '').trim();
    const allCols = REPORT_COLUMNS.ton_kho;
    const requestedCols = String(req.query.cols || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const cols = requestedCols.length > 0
      ? requestedCols.filter(c => allCols.includes(c))
      : allCols;
    if (cols.length === 0) return res.status(400).json({ error: 'Không có cột hợp lệ' });

    const selectClause = cols.map(c => `"${c}"`).join(', ');
    const params: any[] = [];
    let whereClause = '';
    let fileSuffix = 'Toan_Bo';

    if (datesParam) {
      // MỚI: validate từng ngày bằng parseSafeDate (nhất quán với các route khác),
      // và chuẩn hóa về YYYY-MM-DD trước khi dùng làm tham số SQL lẫn tên file —
      // tránh lỗi cast Postgres mơ hồ và tránh giá trị lạ lọt vào header response.
      const dates = datesParam
        .split(',')
        .map(s => parseSafeDate(s.trim()))
        .filter((d): d is Date => d !== null)
        .map(d => d.toISOString().slice(0, 10));

      if (dates.length === 0) {
        return res.status(400).json({ error: 'Danh sách ngày không hợp lệ' });
      }

      params.push(dates);
      whereClause = `WHERE date_parsed = ANY($1::date[])`;
      fileSuffix = dates.length === 1 ? `Moc_${dates[0]}` : `${dates.length}_Moc_Thoi_Gian`;
    }
    // Phạm vi trang (công trình theo view / xưởng) — trước file luôn là toàn nhà máy
    const scopeConds = stockScopeConds(parseStockFilters(req), params);
    if (scopeConds.length) whereClause = `${whereClause ? `${whereClause} AND` : 'WHERE'} ${scopeConds.join(' AND ')}`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Ton_Kho_${fileSuffix}_${new Date().toISOString().slice(0, 10)}.csv"`
    );

    res.write('\uFEFF');
    res.write(cols.map(c => csvEscape(STOCK_EXPORT_LABELS[c] || c.toUpperCase())).join(',') + '\r\n');

    const BATCH_SIZE = 5000;
    let offset = 0;
    while (true) {
      const query = `
        SELECT ${selectClause} FROM ton_kho
        ${whereClause}
        ORDER BY id
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `;
      const result = await timedQuery(query, params);
      if (result.rows.length === 0) break;

      const chunk = result.rows
        .map(row => cols.map(c => csvEscape(row[c])).join(','))
        .join('\r\n') + '\r\n';
      res.write(chunk);

      offset += BATCH_SIZE;
      if (result.rows.length < BATCH_SIZE) break;
    }

    res.end();
  } catch (error) {
    console.error('Lỗi stock/export/csv:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
    else res.end();
  }
});

// --- CACHE IN-MEMORY CHO /api/stock/total-count ---
let cachedStockTotalCount: number | null = null;
let cachedStockTotalCountVersion: string | null = null;

app.get('/api/stock/total-count', async (req: Request, res: Response) => {
  try {
    // Có lọc công trình / xưởng / tình trạng / IPO: đếm đúng phạm vi (không cache) — trước luôn trả COUNT(*) cả bảng
    const filters = parseStockFilters(req);
    if (filters.congTrinh.length || hasProductionFilter(filters)) {
      const total = await cachedByVersions(stockQueryCache, `total-count|${JSON.stringify(filters)}`, STOCK_VERSION_KEYS, async () => {
        const params: any[] = [];
        const conds = stockScopeConds(filters, params);
        const rr = await timedQuery(`SELECT COUNT(*) AS total FROM ton_kho WHERE ${conds.join(' AND ')}`, params);
        return Number(rr.rows[0].total);
      }, workshopGroupsVersion());
      return res.json({ total });
    }
    const verResult = await timedQuery(
      `SELECT last_updated FROM table_versions WHERE table_name = 'ton_kho'`
    );
    const currentVersion = verResult.rows[0]?.last_updated
      ? String(verResult.rows[0].last_updated)
      : null;

    if (cachedStockTotalCount !== null && currentVersion && currentVersion === cachedStockTotalCountVersion) {
      return res.json({ total: cachedStockTotalCount });
    }

    // COUNT(*) thật — khớp đúng số dòng mà /api/stock/export/csv (scope ALL) sẽ trả về
    const r = await timedQuery(`SELECT COUNT(*) AS total FROM ton_kho`);
    const total = Number(r.rows[0].total);

    cachedStockTotalCount = total;
    cachedStockTotalCountVersion = currentVersion;
    res.json({ total });
  } catch (error) {
    console.error('Lỗi stock/total-count:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
