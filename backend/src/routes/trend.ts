import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { REPORT_COLUMNS, parseSafeDate, parseExplicitDates, applyNonStockDateFilter, getPeriodRangeFromKey, buildStockSnapshotCondition, eqNormalized, notCancelledHexCond, applyCtWhitelist, buildMatchedProductionCTE, TrendTableConfig, STOCK_TREND_CONFIG, ANALYSIS_TABLES, TREND_SOURCES, numericCol, numericColQualified } from '../server/data.js';
import { app } from '../server/app.js';

// [ĐO TIMING] Dùng chung cho biểu đồ trend của mọi bảng lớn (dht, nhap_kho, xuat_kho, tkbv_full, pthsp_full, ton_kho).
app.get('/api/trend', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    const isStock = source === 'stock';

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

    // [SNAPSHOT FIX]
    if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      // [DATES FIX] Ưu tiên danh sách ngày rời rạc nếu có
      applyNonStockDateFilter(colBare(cfg.dateCol), explicitDates, dateFrom, dateTo, conditions, params);
    }

    // [FILTER FIX] chuẩn hóa UPPER/TRIM
    if (xuong) {
      if (cfg.xuongCol) {
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
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
    const valueExpr = needsJoin
      ? `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`
      : `SUM(${numericCol(cfg.table, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text` : '';

    const cteList: string[] = [];
    if (needsJoin) cteList.push(buildMatchedProductionCTE(joinKey));

    // [COUNT FIX] Số HEX DUY NHẤT trên CẢ KHOẢNG (không phải cộng dồn từng cột) —
    // để badge "Tổng" ở client không đếm trùng 1 HEX xuất hiện ở nhiều kỳ khác nhau.
    // Không áp dụng cho stock (snapshot, không có khái niệm "trùng theo ngày").
    const distinctTotalExpr = (!isStock && cfg.hexCol)
      ? `(SELECT ${countExpr} FROM ${cfg.table} ${mainAlias} ${joinClause} WHERE ${conditions.join(' AND ')})`
      : 'NULL::bigint';

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
    } else {
      const withClause = cteList.length ? `WITH ${cteList.join(',\n')}` : '';
      q = `
        ${withClause}
        SELECT
          date_trunc('${truncUnit}', ${colBare(cfg.dateCol)})::date AS period,
          COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
          ${countExpr} AS total_count,
          ${distinctTotalExpr} AS distinct_total_count
        FROM ${cfg.table} ${mainAlias}
        ${joinClause}
        WHERE ${conditions.join(' AND ')}
        GROUP BY 1
        ORDER BY 1 ${useDefaultLimit ? 'DESC' : 'ASC'}
        ${useDefaultLimit ? `LIMIT ${limit}` : ''}
      `;
    }
    const r = await timedQuery(q, params);
    const rows = (useDefaultLimit ? r.rows.reverse() : r.rows).map(row => ({
      period: row.period,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
      ...(row.distinct_total_count != null ? { distinctTotalCount: Number(row.distinct_total_count) } : {}),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [ĐO TIMING] 4 route filters/* — đang mất 2-3.6s bất thường trong log dù query rất nhẹ.
// Danh sách các giá trị xưởng distinct, dùng cho dropdown filter
app.get('/api/filters/xuong', async (_req: Request, res: Response) => {
  try {
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
    res.json(r.rows.map(row => ({ code: row.name, name: row.name })));
  } catch (error) {
    console.error('Lỗi filters/xuong:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách công trình distinct, dùng cho dropdown filter
app.get('/api/filters/cong-trinh', async (_req: Request, res: Response) => {
  try {
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
    res.json(r.rows.map(row => ({ code: row.name, name: row.name })));
  } catch (error) {
    console.error('Lỗi filters/cong-trinh:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách đơn vị tính (dvt) distinct từ dht — dùng cho dropdown filter Đơn hàng mới
app.get('/api/filters/dvt', async (_req: Request, res: Response) => {
  try {
    const q = `
      SELECT DISTINCT UPPER(TRIM(dvt)) AS name FROM dht
      WHERE dvt IS NOT NULL AND TRIM(dvt) <> ''
      UNION
      SELECT DISTINCT UPPER(TRIM(dvt)) AS name FROM ton_kho
      WHERE dvt IS NOT NULL AND TRIM(dvt) <> ''
      ORDER BY 1
    `;
    const r = await timedQuery(q);
    res.json(r.rows.map(row => ({ code: row.name, name: row.name })));
  } catch (error) {
    console.error('Lỗi filters/dvt:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách phân loại nhóm sản phẩm distinct từ production_status_app — dùng cho dropdown filter
app.get('/api/filters/phan-loai-nhom-san-pham', async (_req: Request, res: Response) => {
  try {
    const q = `
      SELECT DISTINCT TRIM(phan_loai_nhom_san_pham) AS name
      FROM production_status_app
      WHERE phan_loai_nhom_san_pham IS NOT NULL AND TRIM(phan_loai_nhom_san_pham) <> ''
      ORDER BY 1
    `;
    const r = await timedQuery(q);
    res.json(r.rows.map(row => ({ code: row.name, name: row.name })));
  } catch (error) {
    console.error('Lỗi filters/phan-loai-nhom-san-pham:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [ĐO TIMING] Trả về: tổng hợp theo XƯỞNG (không group theo thời gian) — dùng cho biểu đồ so sánh xưởng
app.get('/api/trend-by-xuong', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    if (!cfg.xuongCol && !cfg.xuongViaProductionJoin) {
      return res.json([]);
    }
    const isStock = source === 'stock';

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
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
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

    const q = `
      ${withClause}
      SELECT
        COALESCE(NULLIF(TRIM(${xuongExpr}), ''), 'TỒN KHO KHÁC') AS xuong,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await timedQuery(q, params);
    const rows = r.rows.map(row => ({
      xuongCode: row.xuong,
      xuongName: row.xuong,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend-by-xuong:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [ĐO TIMING] Trả về: tổng hợp theo CÔNG TRÌNH (không group theo thời gian) — dùng cho biểu đồ so sánh công trình
app.get('/api/trend-by-congtrinh', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    if (!cfg.congTrinhCol) {
      return res.json([]);
    }
    const isStock = source === 'stock';

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
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
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
    const r = await timedQuery(q, params);
    const rows = r.rows.map(row => ({
      congTrinhCode: row.cong_trinh,
      congTrinhName: row.cong_trinh,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend-by-congtrinh:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// [MỚI - ĐÃ SỬA JOIN] Trả về: tổng hợp theo ĐƠN VỊ TÍNH (DVT)
app.get('/api/trend-by-dvt', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    const isStock = source === 'stock';

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
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
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
    const r = await timedQuery(q, params);
    const rows = r.rows.map(row => ({
      dvtCode: row.dvt,
      dvtName: row.dvt,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend-by-dvt:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [MỚI - ĐÃ SỬA JOIN] Trả về: tổng hợp theo PHÂN LOẠI NHÓM SẢN PHẨM
app.get('/api/trend-by-phanloai', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    if (!cfg.joinProductionForFilters || !cfg.hexCol) {
      return res.json([]);
    }
    const isStock = source === 'stock';

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
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
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
    if (phanLoai) {                                          // ← THÊM KHỐI NÀY
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
    const r = await timedQuery(q, params);
    const rows = r.rows.map(row => ({
      phanLoaiCode: row.phan_loai,
      phanLoaiName: row.phan_loai,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend-by-phanloai:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
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

app.get('/api/detail', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const dimension = (req.query.dimension as string) || '';
    if (!DETAIL_DIMENSIONS.has(dimension)) return res.status(400).json({ error: 'Invalid dimension' });

    const value = ((req.query.value as string) || '').trim();
    if (!value) return res.status(400).json({ error: 'Missing value' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    const isStock = source === 'stock';
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

    // Chiều thời gian
      // [DATES FIX] Danh sách ngày rời rạc — dùng cho cả nhánh 'period' lẫn các
    // chiều khác (xưởng/công trình/ĐVT/phân loại), trừ stock (snapshot).
    const explicitDates = isStock ? [] : parseExplicitDates(req);

    // Chiều thời gian
    if (dimension === 'period') {
      if (!parseSafeDate(value)) return res.status(400).json({ error: 'Invalid period value' });
      const { start, end } = getPeriodRangeFromKey(value, granularity);
      if (isStock && granularity !== 'day') {
        // [SNAPSHOT FIX] Khớp đúng cách /api/trend tính cột tuần/tháng: chỉ lấy
        // ĐÚNG 1 ngày đại diện (mới nhất trong kỳ) — không liệt kê cả tuần/tháng.
        params.push(start, end);
        conditions.push(
          `${colBare(cfg.dateCol)} = (SELECT MAX(${cfg.dateCol}) FROM ${cfg.table} WHERE ${cfg.dateCol} BETWEEN $${params.length - 1} AND $${params.length})`
        );
      } else if (!isStock && granularity === 'day' && explicitDates.length > 0) {
        // [DATES FIX] Bấm xem chi tiết 1 cột ngày: cột đó (value) đã LÀ 1 ngày cụ
        // thể, nên chỉ cần khớp đúng ngày đó — không cần lọc thêm theo explicitDates
        // (start/end đã đúng đúng 1 ngày rồi). Giữ điều kiện BETWEEN start/end như
        // nhánh mặc định bên dưới cho nhất quán.
        params.push(start, end);
        conditions.push(`${colBare(cfg.dateCol)} BETWEEN $${params.length - 1} AND $${params.length}`);
      } else {
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
          params.push(value); conditions.push(eqNormalized(colExpr, params.length));
        }
      }
    } else if (xuong) {
      if (cfg.xuongCol) { params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length)); }
      else if (cfg.xuongViaProductionJoin) { params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length)); }
    }

    // Chiều công trình
    if (dimension === 'congtrinh' && cfg.congTrinhCol) {
      if (isUnknownValueLabel(value)) {
        conditions.push(emptyCond(colBare(cfg.congTrinhCol)));
      } else {
        params.push(value); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
      }
    } else if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
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
    if (cols.length === 0) return res.status(400).json({ error: 'Bảng không được hỗ trợ' });
    const selectClause = cols.map(c => `${alias ? `${alias}.` : ''}"${c}"`).join(', ');

    const DETAIL_LIMIT = 500;
    const q = `
      ${withClause}
      SELECT ${selectClause}
      FROM ${cfg.table} ${alias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${colBare(cfg.dateCol)} DESC
      LIMIT ${DETAIL_LIMIT + 1}
    `;
    const r = await timedQuery(q, params);
    const truncated = r.rows.length > DETAIL_LIMIT;
    const rows = truncated ? r.rows.slice(0, DETAIL_LIMIT) : r.rows;

    res.json({ rows, columns: cols, truncated });
  } catch (error) {
    console.error('Lỗi /api/detail:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
