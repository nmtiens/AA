import { parseNameList, expandProjectNames, normNameSql, canonicalProjectName, projectAliasesVersion } from '../server/projectAlias.js';
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { requireWarmupSecret } from '../server/auth.js';
import { REPORT_COLUMNS, parseSafeDate, getRelevantVersions, trimCache, refreshAllDataCache, numericColQualified, sapKeySql } from '../server/data.js';
import { createCache, cachedByVersions } from '../server/cache.js';
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
      SELECT COALESCE(NULLIF(TRIM(s.ten_cong_trinh), ''), 'Chưa xác định') AS name,
            COUNT(DISTINCT s.ma_id_sap) AS count,
             COALESCE(SUM(${numericColQualified('ton_kho', 's', 'gia_tri')}), 0) AS value
      FROM ton_kho s
      ${joinClause}
      WHERE ${conds.join(' AND ')}
      GROUP BY 1
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
       )
       -- Nối xong rồi mới sắp + LIMIT (OFFSET 0 chặn đẩy LIMIT vào trong: không có nó Postgres chọn
       -- nested loop so từng dòng tồn với ~30k mã => ~2–8s khi không lọc)
       SELECT * FROM (
         SELECT s.hex::text AS hex, s.ma_id_sap::text AS ma_id_sap, s.ten_cong_trinh,
                p.ten_hang_muc, ${workshopGroupSql('p.xuong_chinh')} AS xuong_chinh, p.phan_loai_nhom_san_pham,
                ${numericColQualified('ton_kho', 's', 'gia_tri')} AS gia_tri
         FROM ton_kho s
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
