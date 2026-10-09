import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { REPORT_COLUMNS, parseSafeDate, parseExplicitDates, applyNonStockDateFilter, getPeriodRangeFromKey, buildStockSnapshotCondition, eqNormalized, projectNameCondition, notCancelledHexCond, applyCtWhitelist, buildMatchedProductionCTE, TrendTableConfig, STOCK_TREND_CONFIG, ANALYSIS_TABLES, TREND_SOURCES, numericCol, numericColQualified } from '../server/data.js';
import { workshopCondition, workshopGroupSql, workshopGroupOf, workshopGroupsVersion } from '../server/workshopGroups.js';
import { canonicalProjectName } from '../server/projectAlias.js';
import { createCache, cachedByVersions, queryKey, type VersionedCache } from '../server/cache.js';
import { app } from '../server/app.js';

// ============================================================================
// CACHE: mọi API ở file này chỉ đọc, kết quả phụ thuộc (tham số query, phiên bản bảng nguồn + bảng sản
// xuất, setup gộp xưởng). Bấm qua lại giữa các biểu đồ / mở lại trang => trả ngay kết quả cũ khi dữ liệu
// chưa đổi (xem server/cache.ts).
// ============================================================================
const trendCache = createCache<unknown>(120);
const detailCache = createCache<unknown>(10);   // tới 10.000 dòng / entry
const filterCache = createCache<unknown>(8);
const TREND_PARAMS = ['source', 'granularity', 'dateFrom', 'dateTo', 'dates', 'xuong', 'congTrinh', 'dvt', 'phanLoai', 'ctWhitelist', 'dimension', 'value'];
const sourceVersionKeys = (source: string) => [source === 'stock' ? 'stock' : source, 'production'];

class BadRequest extends Error { status = 400; }

/** Đăng ký route GET chỉ đọc có cache theo phiên bản bảng. compute ném BadRequest => 400. */
const cachedGet = (
  path: string,
  cache: VersionedCache<unknown>,
  versionKeysOf: (req: Request) => string[],
  compute: (req: Request) => Promise<unknown>,
) => {
  app.get(path, async (req: Request, res: Response) => {
    try {
      const key = `${path}|${queryKey(req.query as Record<string, unknown>, TREND_PARAMS)}`;
      const data = await cachedByVersions(cache, key, versionKeysOf(req), () => compute(req), workshopGroupsVersion());
      res.json(data);
    } catch (error) {
      if (error instanceof BadRequest) return res.status(400).json({ error: error.message });
      console.error(`Lỗi ${path}:`, error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
};

const sourceCfg = (req: Request): { source: string; cfg: TrendTableConfig; isStock: boolean } => {
  const source = String(req.query.source || '');
  if (!TREND_SOURCES.has(source)) throw new BadRequest('Invalid source');
  return { source, cfg: source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source], isStock: source === 'stock' };
};

// [ĐO TIMING] Dùng chung cho biểu đồ trend của mọi bảng lớn (dht, nhap_kho, xuat_kho, tkbv_full, pthsp_full, ton_kho).
cachedGet('/api/trend', trendCache, req => sourceVersionKeys(String(req.query.source || '')), async (req: Request) => {
    const { cfg, isStock } = sourceCfg(req);

    const granularity = (req.query.granularity as string) || 'day';
    const truncUnit = granularity === 'week' ? 'week' : granularity === 'month' ? 'month' : 'day';

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const explicitDates = isStock ? [] : parseExplicitDates(req); // [DATES FIX]
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsDvtJoin = !!(dvt && !cfg.dvtCol);
    const needsPhanLoaiJoin = !!phanLoai;
    const needsXuongJoin = !!(xuong && !cfg.xuongCol && cfg.xuongViaProductionJoin);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    // [SNAPSHOT FIX] Tồn kho là ảnh chụp: không có khoảng ngày => 1 ảnh mới nhất (≤ dateTo). Có khoảng ngày
    // (dateFrom) => lấy mọi ảnh chụp trong khoảng; theo tuần / tháng thì period_dates bên dưới chọn ảnh CUỐI
    // mỗi kỳ (trước luôn ép về 1 ngày nên biểu đồ xu hướng tồn kho chỉ có 1 cột)
    if (isStock) {
      if (dateFrom) {
        params.push(dateFrom.toISOString().slice(0, 10));
        conditions.push(`${colBare(cfg.dateCol)} >= $${params.length}`);
        if (dateTo) { params.push(dateTo.toISOString().slice(0, 10)); conditions.push(`${colBare(cfg.dateCol)} <= $${params.length}`); }
      } else {
        conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
      }
    } else {
      // [DATES FIX] Ưu tiên danh sách ngày rời rạc nếu có
      applyNonStockDateFilter(colBare(cfg.dateCol), explicitDates, dateFrom, dateTo, conditions, params);
    }

    // [FILTER FIX] chuẩn hóa UPPER/TRIM
    if (xuong) {
      if (cfg.xuongCol) {
        conditions.push(workshopCondition(colBare(cfg.xuongCol), xuong, params));
      } else if (cfg.xuongViaProductionJoin) {
        conditions.push(workshopCondition('p.xuong_chinh', xuong, params));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      conditions.push(projectNameCondition(colBare(cfg.congTrinhCol), congTrinh, params));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    // Không tính hạng mục đã HỦY (tồn kho là hàng thực có trong kho -> giữ nguyên)
    if (cfg.hexCol && cfg !== STOCK_TREND_CONFIG) conditions.push(notCancelledHexCond(colBare(cfg.hexCol)));
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else if (needsJoin) {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai && needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    // [DATES FIX] Có dates rời rạc thì không áp limit mặc định — hiển thị đúng các
    // ngày đã chọn, dù ít hay nhiều.
    const useDefaultLimit = !dateFrom && !dateTo && explicitDates.length === 0;
    const limit = granularity === 'day' ? 15 : 12;

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueColExpr = needsJoin
      ? numericColQualified(cfg.table, mainAlias, cfg.valueCol)
      : numericCol(cfg.table, cfg.valueCol);
    const valueExpr = `SUM(${valueColExpr})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text` : '';

    const cteList: string[] = [];
    if (needsJoin) cteList.push(buildMatchedProductionCTE(joinKey));

    let q: string;
    if (isStock && truncUnit !== 'day') {
      cteList.push(`
        period_dates AS (
          SELECT date_trunc('${truncUnit}', ${colBare(cfg.dateCol)})::date AS period,
                 MAX(${colBare(cfg.dateCol)}) AS snap_date
          FROM ${cfg.table} ${mainAlias}
          ${joinClause}
          WHERE ${conditions.join(' AND ')}
          GROUP BY 1
        )
      `);
      q = `
        WITH ${cteList.join(',\n')}
        SELECT
          pd.period AS period,
          COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
          ${countExpr} AS total_count,
          NULL::bigint AS distinct_total_count
        FROM period_dates pd
        JOIN ${cfg.table} ${mainAlias} ON ${colBare(cfg.dateCol)} = pd.snap_date
        ${joinClause}
        WHERE ${conditions.join(' AND ')} AND ${colBare(cfg.dateCol)} = pd.snap_date
        GROUP BY pd.period
        ORDER BY pd.period ${useDefaultLimit ? 'DESC' : 'ASC'}
        ${useDefaultLimit ? `LIMIT ${limit}` : ''}
      `;
    } else if (!isStock && cfg.hexCol) {
      // [COUNT FIX] Số HEX DUY NHẤT trên CẢ KHOẢNG (không phải cộng dồn từng cột) — để badge "Tổng" ở client
      // không đếm trùng 1 HEX xuất hiện ở nhiều kỳ. Các dòng khớp bộ lọc lấy 1 lần vào CTE `base` rồi vừa gộp
      // theo kỳ vừa đếm tổng từ đó — trước đếm tổng bằng subquery quét lại bảng với cùng bộ lọc (2 lần quét).
      cteList.push(`
        base AS (
          SELECT date_trunc('${truncUnit}', ${colBare(cfg.dateCol)})::date AS period,
                 ${colBare(cfg.hexCol)} AS hx,
                 ${valueColExpr} AS v
          FROM ${cfg.table} ${mainAlias}
          ${joinClause}
          WHERE ${conditions.join(' AND ')}
        )
      `);
      q = `
        WITH ${cteList.join(',\n')}
        SELECT
          period,
          COALESCE(SUM(v), 0) / ${cfg.valueDivisor} AS total_value,
          COUNT(DISTINCT hx) AS total_count,
          (SELECT COUNT(DISTINCT hx) FROM base) AS distinct_total_count
        FROM base
        GROUP BY 1
        ORDER BY 1 ${useDefaultLimit ? 'DESC' : 'ASC'}
        ${useDefaultLimit ? `LIMIT ${limit}` : ''}
      `;
    } else {
      const withClause = cteList.length ? `WITH ${cteList.join(',\n')}` : '';
      q = `
        ${withClause}
        SELECT
          date_trunc('${truncUnit}', ${colBare(cfg.dateCol)})::date AS period,
          COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
          ${countExpr} AS total_count,
          NULL::bigint AS distinct_total_count
        FROM ${cfg.table} ${mainAlias}
        ${joinClause}
        WHERE ${conditions.join(' AND ')}
        GROUP BY 1
        ORDER BY 1 ${useDefaultLimit ? 'DESC' : 'ASC'}
        ${useDefaultLimit ? `LIMIT ${limit}` : ''}
      `;
    }
    const r = await timedQuery(q, params, { workMemMb: 32 });
    return (useDefaultLimit ? r.rows.reverse() : r.rows).map(row => ({
      period: row.period,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
      ...(row.distinct_total_count != null ? { distinctTotalCount: Number(row.distinct_total_count) } : {}),
    }));
});

// [ĐO TIMING] 4 route filters/* — UNION ALL 7 bảng lớn (~1s), giờ cache theo phiên bản các bảng đó.
// Danh sách các giá trị xưởng distinct, dùng cho dropdown filter
cachedGet('/api/filters/xuong', filterCache, () => ['khsx', 'order', 'inventory', 'export', 'tkbv', 'pthsp', 'production'], async () => {
    const q = `
      SELECT DISTINCT ON (UPPER(TRIM(name))) TRIM(name) AS name
      FROM (
        SELECT xuong_chinh AS name FROM khsx WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM dht WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM nhap_kho WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM xuat_kho WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM tkbv_full WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM pthsp_full WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM production_status_app WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
      ) t
      ORDER BY UPPER(TRIM(name)), name
    `;
    const r = await timedQuery(q);
    // Trả tên xưởng ĐÃ GỘP (setup gộp xưởng), bỏ trùng
    const groups = [...new Set(r.rows.map(row => workshopGroupOf(row.name)).filter(Boolean))].sort();
    return groups.map(name => ({ code: name, name }));
});

// Danh sách công trình distinct, dùng cho dropdown filter
cachedGet('/api/filters/cong-trinh', filterCache, () => ['khsx', 'order', 'inventory', 'export', 'tkbv', 'pthsp', 'stock'], async () => {
    const q = `
      SELECT DISTINCT ON (UPPER(TRIM(name))) TRIM(name) AS name
      FROM (
        SELECT ten_cong_trinh AS name FROM khsx WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM dht WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM nhap_kho WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM xuat_kho WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM tkbv_full WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM pthsp_full WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM ton_kho WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
      ) t
      ORDER BY UPPER(TRIM(name)), name
    `;
    const r = await timedQuery(q);
    return r.rows.map(row => ({ code: row.name, name: row.name }));
});

// Danh sách đơn vị tính (dvt) distinct từ dht — dùng cho dropdown filter Đơn hàng mới
cachedGet('/api/filters/dvt', filterCache, () => ['order', 'stock'], async () => {
    const q = `
      SELECT DISTINCT UPPER(TRIM(dvt)) AS name FROM dht
      WHERE dvt IS NOT NULL AND TRIM(dvt) <> ''
      UNION
      SELECT DISTINCT UPPER(TRIM(dvt)) AS name FROM ton_kho
      WHERE dvt IS NOT NULL AND TRIM(dvt) <> ''
      ORDER BY 1
    `;
    const r = await timedQuery(q);
    return r.rows.map(row => ({ code: row.name, name: row.name }));
});

// Danh sách phân loại nhóm sản phẩm distinct từ production_status_app — dùng cho dropdown filter
cachedGet('/api/filters/phan-loai-nhom-san-pham', filterCache, () => ['production'], async () => {
    const q = `
      SELECT DISTINCT TRIM(phan_loai_nhom_san_pham) AS name
      FROM production_status_app
      WHERE phan_loai_nhom_san_pham IS NOT NULL AND TRIM(phan_loai_nhom_san_pham) <> ''
      ORDER BY 1
    `;
    const r = await timedQuery(q);
    return r.rows.map(row => ({ code: row.name, name: row.name }));
});

// [ĐO TIMING] Trả về: tổng hợp theo XƯỞNG (không group theo thời gian) — dùng cho biểu đồ so sánh xưởng
cachedGet('/api/trend-by-xuong', trendCache, req => sourceVersionKeys(String(req.query.source || '')), async (req: Request) => {
    const { cfg, isStock } = sourceCfg(req);
    if (!cfg.xuongCol && !cfg.xuongViaProductionJoin) return [];

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsDvtJoin = !!(dvt && !cfg.dvtCol);
    const needsPhanLoaiJoin = !!phanLoai;
    const needsXuongJoin = !!(cfg.xuongViaProductionJoin && !cfg.xuongCol);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      applyNonStockDateFilter(colBare(cfg.dateCol), parseExplicitDates(req), dateFrom, dateTo, conditions, params); // [DATES FIX]
    }

    if (xuong) {
      if (cfg.xuongCol) {
        conditions.push(workshopCondition(colBare(cfg.xuongCol), xuong, params));
      } else if (cfg.xuongViaProductionJoin) {
        conditions.push(workshopCondition('p.xuong_chinh', xuong, params));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      conditions.push(projectNameCondition(colBare(cfg.congTrinhCol), congTrinh, params));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    // Không tính hạng mục đã HỦY (tồn kho là hàng thực có trong kho -> giữ nguyên)
    if (cfg.hexCol && cfg !== STOCK_TREND_CONFIG) conditions.push(notCancelledHexCond(colBare(cfg.hexCol)));
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else if (needsJoin) {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai && needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`
      : `SUM(${numericCol(cfg.table, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text` : '';
    const withClause = needsJoin ? `WITH ${buildMatchedProductionCTE(joinKey)}` : '';

    const xuongExpr = cfg.xuongCol ? colBare(cfg.xuongCol) : 'p.xuong_chinh';
    // Dòng không có xưởng: tồn kho = mã không khớp dòng sản xuất; nguồn khác = chưa ghi xưởng (giống Tổng quan)
    const noXuongLabel = isStock ? 'TỒN KHO KHÁC' : 'Chưa xác định';

    const q = `
      ${withClause}
      SELECT
        COALESCE(NULLIF(${workshopGroupSql(xuongExpr)}, ''), '${noXuongLabel}') AS xuong,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await timedQuery(q, params, { workMemMb: 32 });
    return r.rows.map(row => ({
      xuongCode: row.xuong,
      xuongName: row.xuong,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
});

// [ĐO TIMING] Trả về: tổng hợp theo CÔNG TRÌNH (không group theo thời gian) — dùng cho biểu đồ so sánh công trình
cachedGet('/api/trend-by-congtrinh', trendCache, req => sourceVersionKeys(String(req.query.source || '')), async (req: Request) => {
    const { cfg, isStock } = sourceCfg(req);
    if (!cfg.congTrinhCol) return [];

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsDvtJoin = !!(dvt && !cfg.dvtCol);
    const needsPhanLoaiJoin = !!phanLoai;
    const needsXuongJoin = !!(xuong && !cfg.xuongCol && cfg.xuongViaProductionJoin);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      applyNonStockDateFilter(colBare(cfg.dateCol), parseExplicitDates(req), dateFrom, dateTo, conditions, params); // [DATES FIX]
    }

    if (xuong) {
      if (cfg.xuongCol) {
        conditions.push(workshopCondition(colBare(cfg.xuongCol), xuong, params));
      } else if (cfg.xuongViaProductionJoin) {
        conditions.push(workshopCondition('p.xuong_chinh', xuong, params));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      conditions.push(projectNameCondition(colBare(cfg.congTrinhCol), congTrinh, params));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    // Không tính hạng mục đã HỦY (tồn kho là hàng thực có trong kho -> giữ nguyên)
    if (cfg.hexCol && cfg !== STOCK_TREND_CONFIG) conditions.push(notCancelledHexCond(colBare(cfg.hexCol)));
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else if (needsJoin) {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai && needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`
      : `SUM(${numericCol(cfg.table, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text` : '';
    const withClause = needsJoin ? `WITH ${buildMatchedProductionCTE(joinKey)}` : '';

    const q = `
      ${withClause}
      SELECT
        COALESCE(NULLIF(TRIM(${colBare(cfg.congTrinhCol)}), ''), 'Chưa xác định') AS cong_trinh,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await timedQuery(q, params, { workMemMb: 32 });
    // Gộp các cách viết của cùng 1 công trình (cùng mã) thành 1 cột — khớp với khi lọc theo công trình
    // (lọc mở rộng tên được chọn ra mọi cách viết của cùng mã, xem server/projectAlias.ts)
    const merged = new Map<string, { total: number; totalCount: number }>();
    for (const row of r.rows) {
      const name = row.cong_trinh === 'Chưa xác định' ? row.cong_trinh : canonicalProjectName(row.cong_trinh);
      const e = merged.get(name) ?? { total: 0, totalCount: 0 };
      e.total += Number(row.total_value);
      e.totalCount += Number(row.total_count);
      merged.set(name, e);
    }
    return [...merged.entries()]
      .map(([name, v]) => ({ congTrinhCode: name, congTrinhName: name, total: v.total, totalCount: v.totalCount }))
      // Bỏ cột rỗng (giá trị 0, không HEX) — giống Tổng quan theo công trình
      .filter(x => x.total !== 0 || x.totalCount > 0)
      .sort((a, b) => b.total - a.total);
});


// [MỚI - ĐÃ SỬA JOIN] Trả về: tổng hợp theo ĐƠN VỊ TÍNH (DVT)
cachedGet('/api/trend-by-dvt', trendCache, req => sourceVersionKeys(String(req.query.source || '')), async (req: Request) => {
    const { cfg, isStock } = sourceCfg(req);

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsDvtJoin = !cfg.dvtCol;
    const needsPhanLoaiJoin = !!phanLoai;
    const needsXuongJoin = !!(xuong && !cfg.xuongCol && cfg.xuongViaProductionJoin);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      applyNonStockDateFilter(colBare(cfg.dateCol), parseExplicitDates(req), dateFrom, dateTo, conditions, params); // [DATES FIX]
    }

    if (xuong) {
      if (cfg.xuongCol) {
        conditions.push(workshopCondition(colBare(cfg.xuongCol), xuong, params));
      } else if (cfg.xuongViaProductionJoin) {
        conditions.push(workshopCondition('p.xuong_chinh', xuong, params));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      conditions.push(projectNameCondition(colBare(cfg.congTrinhCol), congTrinh, params));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    // Không tính hạng mục đã HỦY (tồn kho là hàng thực có trong kho -> giữ nguyên)
    if (cfg.hexCol && cfg !== STOCK_TREND_CONFIG) conditions.push(notCancelledHexCond(colBare(cfg.hexCol)));
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else if (needsJoin) {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai && needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`
      : `SUM(${numericCol(cfg.table, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text` : '';
    const withClause = needsJoin ? `WITH ${buildMatchedProductionCTE(joinKey)}` : '';

    const dvtExpr = cfg.dvtCol ? colBare(cfg.dvtCol) : 'p.dvt';

    const q = `
      ${withClause}
      SELECT
        COALESCE(NULLIF(UPPER(TRIM(${dvtExpr})), ''), 'Chưa xác định') AS dvt,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await timedQuery(q, params, { workMemMb: 32 });
    return r.rows.map(row => ({
      dvtCode: row.dvt,
      dvtName: row.dvt,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
});

// [MỚI - ĐÃ SỬA JOIN] Trả về: tổng hợp theo PHÂN LOẠI NHÓM SẢN PHẨM
cachedGet('/api/trend-by-phanloai', trendCache, req => sourceVersionKeys(String(req.query.source || '')), async (req: Request) => {
    const { cfg, isStock } = sourceCfg(req);
    if (!cfg.joinProductionForFilters || !cfg.hexCol) return [];

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';
    const mainAlias = 'm';
    const colBare = (name: string) => `${mainAlias}.${name}`;

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      applyNonStockDateFilter(colBare(cfg.dateCol), parseExplicitDates(req), dateFrom, dateTo, conditions, params); // [DATES FIX]
    }

    if (xuong) {
      if (cfg.xuongCol) {
        conditions.push(workshopCondition(colBare(cfg.xuongCol), xuong, params));
      } else if (cfg.xuongViaProductionJoin) {
        conditions.push(workshopCondition('p.xuong_chinh', xuong, params));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      conditions.push(projectNameCondition(colBare(cfg.congTrinhCol), congTrinh, params));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    // Không tính hạng mục đã HỦY (tồn kho là hàng thực có trong kho -> giữ nguyên)
    if (cfg.hexCol && cfg !== STOCK_TREND_CONFIG) conditions.push(notCancelledHexCond(colBare(cfg.hexCol)));
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai) {
      params.push(phanLoai);
      conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`);
    }

    const countExpr = `COUNT(DISTINCT ${colBare(cfg.hexCol)})`;
    const valueExpr = `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text`;
    const withClause = `WITH ${buildMatchedProductionCTE(joinKey)}`;

    const q = `
      ${withClause}
      SELECT
        COALESCE(NULLIF(TRIM(p.phan_loai_nhom_san_pham), ''), 'Chưa xác định') AS phan_loai,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await timedQuery(q, params, { workMemMb: 32 });
    return r.rows.map(row => ({
      phanLoaiCode: row.phan_loai,
      phanLoaiName: row.phan_loai,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
});

// ============================================================================
// [MỚI] KHUNG NHÌN CHI TIẾT DỮ LIỆU — dùng cho tính năng "con mắt" trên 4 loại
// biểu đồ (theo thời gian, theo xưởng, theo công trình, theo ĐVT/phân loại).
// Khi người dùng bấm chọn 1 cột rồi bấm icon con mắt, frontend gọi endpoint
// này để lấy TOÀN BỘ dòng dữ liệu gốc khớp với giá trị cột đó + bộ lọc hiện
// tại (không lấy full toàn bộ bảng).
// ============================================================================
const DETAIL_DIMENSIONS = new Set(['period', 'xuong', 'congtrinh', 'dvt', 'phanloai']);

// MỚI: các nhãn "sentinel" mà /api/trend-by-* trả về thay cho giá trị gốc khi
// cột NULL/rỗng (xem COALESCE(NULLIF(...), '<nhãn>') ở các route đó). Khi người
// dùng bấm "Xem chi tiết" trên đúng cột này, value gửi lên sẽ là chuỗi nhãn đó
// chứ không phải giá trị thật trong DB (vì giá trị thật là NULL/rỗng) — nên
// không thể so `= value` như bình thường, phải chuyển thành điều kiện IS NULL
// hoặc rỗng.
const UNKNOWN_VALUE_LABELS = new Set(['CHƯA XÁC ĐỊNH', 'TỒN KHO KHÁC']);
const isUnknownValueLabel = (v: string) => UNKNOWN_VALUE_LABELS.has(v.trim().toUpperCase());

cachedGet('/api/detail', detailCache, req => sourceVersionKeys(String(req.query.source || '')), async (req: Request) => {
    const { cfg, isStock } = sourceCfg(req);

    const dimension = (req.query.dimension as string) || '';
    if (!DETAIL_DIMENSIONS.has(dimension)) throw new BadRequest('Invalid dimension');

    const value = ((req.query.value as string) || '').trim();
    if (!value) throw new BadRequest('Missing value');

    const granularity = (req.query.granularity as string) || 'day';

    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';
    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);

    const needsDvtJoin = dimension === 'dvt' ? !cfg.dvtCol : !!(dvt && !cfg.dvtCol);
    const needsPhanLoaiJoin = dimension === 'phanloai' || !!phanLoai;
    const needsXuongJoin = dimension === 'xuong'
      ? (!cfg.xuongCol && !!cfg.xuongViaProductionJoin)
      : !!(xuong && !cfg.xuongCol && cfg.xuongViaProductionJoin);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const alias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (alias ? `${alias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    // [DATES FIX] Danh sách ngày rời rạc — dùng cho cả nhánh 'period' lẫn các
    // chiều khác (xưởng/công trình/ĐVT/phân loại), trừ stock (snapshot).
    const explicitDates = isStock ? [] : parseExplicitDates(req);

    // Chiều thời gian
    if (dimension === 'period') {
      if (!parseSafeDate(value)) throw new BadRequest('Invalid period value');
      const range = getPeriodRangeFromKey(value, granularity);
      // Cắt kỳ theo khoảng ngày đang xem (cột đầu / cuối của biểu đồ chỉ là 1 phần tuần / tháng) — trước lấy trọn
      // kỳ nên chi tiết lớn hơn số trên cột
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const start = dateFrom && iso(dateFrom) > String(range.start).slice(0, 10) ? iso(dateFrom) : range.start;
      const end = dateTo && iso(dateTo) < String(range.end).slice(0, 10) ? iso(dateTo) : range.end;
      if (!isStock && explicitDates.length > 0) {
        // Đang chọn các ngày rời rạc: chỉ những ngày đó trong kỳ (giống /api/trend)
        params.push(explicitDates);
        conditions.push(`${colBare(cfg.dateCol)} = ANY($${params.length}::date[])`);
      }
      if (isStock && granularity !== 'day') {
        // [SNAPSHOT FIX] Khớp đúng cách /api/trend tính cột tuần/tháng: chỉ lấy
        // ĐÚNG 1 ngày đại diện (mới nhất trong kỳ) — không liệt kê cả tuần/tháng.
        params.push(start, end);
        conditions.push(
          `${colBare(cfg.dateCol)} = (SELECT MAX(${cfg.dateCol}) FROM ${cfg.table} WHERE ${cfg.dateCol} BETWEEN $${params.length - 1} AND $${params.length})`
        );
      } else {
        // Cột ngày / tuần / tháng: khớp khoảng [start, end] (với ngày rời rạc, start = end = chính ngày đó)
        params.push(start, end);
        conditions.push(`${colBare(cfg.dateCol)} BETWEEN $${params.length - 1} AND $${params.length}`);
      }
    } else if (isStock) {
      // [SNAPSHOT FIX] Các chiều khác (xưởng/công trình/ĐVT/phân loại): tồn kho
      // luôn chỉ xem đúng 1 ngày đại diện, không liệt kê nhiều ngày snapshot.
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      // [DATES FIX] Bấm xem chi tiết 1 cột xưởng/công trình/ĐVT/phân loại: phải lọc
      // đúng tập ngày người dùng đang chọn ở "Bộ lọc ngày chung", không phải cả
      // khoảng [dateFrom, dateTo] liên tục (nếu không sẽ lại lệch giống lỗi ban đầu).
      applyNonStockDateFilter(colBare(cfg.dateCol), explicitDates, dateFrom, dateTo, conditions, params);
    }

    const emptyCond = (colExpr: string) => `(${colExpr} IS NULL OR TRIM(${colExpr}::text) = '')`;

    // Chiều xưởng — [FILTER FIX] chuẩn hóa UPPER/TRIM
    if (dimension === 'xuong') {
      const colExpr = cfg.xuongCol ? colBare(cfg.xuongCol) : (cfg.xuongViaProductionJoin ? 'p.xuong_chinh' : null);
      if (colExpr) {
        if (isUnknownValueLabel(value)) {
          conditions.push(emptyCond(colExpr));
        } else {
          conditions.push(workshopCondition(colExpr, value, params));
        }
      }
    } else if (xuong) {
      if (cfg.xuongCol) { conditions.push(workshopCondition(colBare(cfg.xuongCol), xuong, params)); }
      else if (cfg.xuongViaProductionJoin) { conditions.push(workshopCondition('p.xuong_chinh', xuong, params)); }
    }

    // Chiều công trình
    if (dimension === 'congtrinh' && cfg.congTrinhCol) {
      if (isUnknownValueLabel(value)) {
        conditions.push(emptyCond(colBare(cfg.congTrinhCol)));
      } else {
        // Mọi cách viết của cùng công trình (cột bấm vào là tên chuẩn đã gộp) — trước chỉ so đúng tên
        conditions.push(projectNameCondition(colBare(cfg.congTrinhCol), value, params));
      }
    } else if (congTrinh && cfg.congTrinhCol) {
      conditions.push(projectNameCondition(colBare(cfg.congTrinhCol), congTrinh, params));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    // Không tính hạng mục đã HỦY (tồn kho là hàng thực có trong kho -> giữ nguyên)
    if (cfg.hexCol && cfg !== STOCK_TREND_CONFIG) conditions.push(notCancelledHexCond(colBare(cfg.hexCol)));
    // Chiều ĐVT
    if (dimension === 'dvt') {
      const colExpr = cfg.dvtCol ? colBare(cfg.dvtCol) : 'p.dvt';
      if (isUnknownValueLabel(value)) {
        conditions.push(emptyCond(colExpr));
      } else {
        params.push(value); conditions.push(eqNormalized(colExpr, params.length));
      }
    } else if (dvt) {
      if (cfg.dvtCol) { params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length)); }
      else if (needsJoin) { params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length)); }
    }

    // Chiều phân loại nhóm sản phẩm
    if (dimension === 'phanloai') {
      if (isUnknownValueLabel(value)) {
        conditions.push(emptyCond('p.phan_loai_nhom_san_pham'));
      } else {
        params.push(value); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`);
      }
    } else if (phanLoai && needsJoin) {
      params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`);
    }

    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin
      ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text`
      : '';
    const withClause = needsJoin ? `WITH ${buildMatchedProductionCTE(joinKey)}` : '';

    const cols = REPORT_COLUMNS[cfg.table] || [];
    if (cols.length === 0) throw new BadRequest('Bảng không được hỗ trợ');
    const selectClause = cols.map(c => `${alias ? `${alias}.` : ''}"${c}"`).join(', ');

    // Cửa sổ chi tiết tự chia trang (200 dòng/trang) => tải tối đa 10.000 dòng. Vượt mức này cửa sổ vẫn báo
    // đã giới hạn (truncated).
    const DETAIL_LIMIT = 10000; // đủ 1 ảnh chụp tồn kho (~5.100 dòng) — 5000 cắt mất danh sách tồn kho
    const q = `
      ${withClause}
      SELECT ${selectClause}
      FROM ${cfg.table} ${alias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${colBare(cfg.dateCol)} DESC
      LIMIT ${DETAIL_LIMIT + 1}
    `;
    const r = await timedQuery(q, params, { workMemMb: 32 });
    const truncated = r.rows.length > DETAIL_LIMIT;
    const rows = truncated ? r.rows.slice(0, DETAIL_LIMIT) : r.rows;

    return { rows, columns: cols, truncated };
});
