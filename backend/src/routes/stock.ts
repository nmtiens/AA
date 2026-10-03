import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { requireWarmupSecret } from '../server/auth.js';
import { REPORT_COLUMNS, parseSafeDate, getRelevantVersions, trimCache, refreshAllDataCache, numericColQualified } from '../server/data.js';
import { app, warmupLimiter } from '../server/app.js';

// --- CACHE IN-MEMORY CHO /api/stock/dates (theo bộ lọc tổng) ---
// TRƯỚC: 1 biến module-level duy nhất (không phân biệt filter).
// SAU: Map key theo bộ lọc, giống overviewSummaryCache/khsxNhapKhoCache.
const stockDatesCache = new Map<string, { versions: Record<string, string>; payload: any }>();

interface StockFilterParams {
  congTrinh: string[];
  xuong: string[];
  tinhTrang: string[];
  tinhTrangIpo: string[];
}
const parseStockFilters = (req: Request): StockFilterParams => ({
  congTrinh: String(req.query.congTrinh || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
  xuong: String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
  tinhTrang: String(req.query.tinhTrang || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
  tinhTrangIpo: String(req.query.tinhTrangIpo || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
});

// [ĐO TIMING] Endpoint từng bị "pending" 25.39s trên production — điểm nóng số 2.
const refreshStockDatesCache = async (filters: StockFilterParams) => {
  const needsJoin = filters.xuong.length > 0 || filters.tinhTrang.length > 0 || filters.tinhTrangIpo.length > 0;
  const cacheKey = JSON.stringify(filters);
  const versions = await getRelevantVersions(needsJoin ? ['stock', 'production'] : ['stock']);

  const cached = stockDatesCache.get(cacheKey);
  if (cached && JSON.stringify(cached.versions) === JSON.stringify(versions)) {
    return { payload: cached.payload, fromCache: true };
  }

  const conds: string[] = ['s.date_parsed IS NOT NULL'];
  const params: any[] = [];
  if (filters.congTrinh.length) {
    params.push(filters.congTrinh);
    conds.push(`UPPER(TRIM(s.ten_cong_trinh)) = ANY($${params.length}::text[])`);
  }

  // SỬA: thay LEFT JOIN trực tiếp trên toàn bộ lịch sử ton_kho (rất nặng, gây
  // statement timeout) bằng CTE lọc TRƯỚC tập ma_id_sap thỏa điều kiện xưởng/
  // tình trạng/IPO từ production_status_app (bảng snapshot hiện tại, nhỏ hơn
  // nhiều và không có nhiều dòng lặp theo ngày như ton_kho), sau đó chỉ INNER
  // JOIN ton_kho với tập ma_id_sap đã lọc sẵn này — giảm chi phí đáng kể.
  let cteClause = '';
  let joinClause = '';
  if (needsJoin) {
    const pConds: string[] = [];
    if (filters.xuong.length) { params.push(filters.xuong); pConds.push(`UPPER(TRIM(xuong_chinh)) = ANY($${params.length}::text[])`); }
    if (filters.tinhTrang.length) { params.push(filters.tinhTrang); pConds.push(`UPPER(TRIM(tinh_trang)) = ANY($${params.length}::text[])`); }
    if (filters.tinhTrangIpo.length) { params.push(filters.tinhTrangIpo); pConds.push(`UPPER(TRIM(tinh_trang_ipo)) = ANY($${params.length}::text[])`); }

    cteClause = `
      WITH matched_ids AS (
        SELECT DISTINCT ma_id_sap FROM production_status_app
        WHERE ma_id_sap IS NOT NULL${pConds.length ? ` AND ${pConds.join(' AND ')}` : ''}
      )
    `;
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
    const needsJoin = filters.xuong.length > 0 || filters.tinhTrang.length > 0 || filters.tinhTrangIpo.length > 0;

    const conds: string[] = ['s.date_parsed = $1'];
    const params: any[] = [date];
    if (filters.congTrinh.length) {
      params.push(filters.congTrinh);
      conds.push(`UPPER(TRIM(s.ten_cong_trinh)) = ANY($${params.length}::text[])`);
    }

    let cteClause = '';
    let joinClause = '';
    if (needsJoin) {
      const pConds: string[] = [];
      if (filters.xuong.length) { params.push(filters.xuong); pConds.push(`UPPER(TRIM(xuong_chinh)) = ANY($${params.length}::text[])`); }
      if (filters.tinhTrang.length) { params.push(filters.tinhTrang); pConds.push(`UPPER(TRIM(tinh_trang)) = ANY($${params.length}::text[])`); }
      if (filters.tinhTrangIpo.length) { params.push(filters.tinhTrangIpo); pConds.push(`UPPER(TRIM(tinh_trang_ipo)) = ANY($${params.length}::text[])`); }

      cteClause = `
        WITH matched_ids AS (
          SELECT DISTINCT ma_id_sap FROM production_status_app
          WHERE ma_id_sap IS NOT NULL${pConds.length ? ` AND ${pConds.join(' AND ')}` : ''}
        )
      `;
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
    res.json(r.rows.map(row => ({ name: row.name, count: Number(row.count), value: Number(row.value) })));
  } catch (error) {
    console.error('Lỗi stock/by-project:', error);
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

const csvEscape = (value: any): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
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

app.get('/api/stock/total-count', async (_req: Request, res: Response) => {
  try {
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
