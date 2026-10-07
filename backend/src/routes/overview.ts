import { parseNameList, expandProjectNames, normNameSql } from '../server/projectAlias.js';
import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { expandWorkshops, workshopGroupSql, workshopGroupsVersion } from '../server/workshopGroups.js';
import { vnDayKey, vnTodayUtc } from '../server/common.js';
import { parseSafeDate, getRelevantVersions, trimCache, ANALYSIS_TABLES, ALLOWED_ANALYSIS_KEYS, numericColQualified, notCancelledHexCond } from '../server/data.js';
import { app } from '../server/app.js';

// --- CACHE IN-MEMORY CHO /api/overview/summary ---
const overviewSummaryCache = new Map<string, { versions: Record<string, string>; payload: any }>();
const OVERVIEW_SUMMARY_VERSION_KEYS = ['order', 'tkbv', 'pthsp', 'inventory', 'export'];


// [ĐO TIMING] Endpoint từng mất 34.71s trên Network tab — điểm nóng số 1.
app.get('/api/overview/summary', async (req: Request, res: Response) => {
  try {
    // Mọi cách viết của công trình được chọn (xem server/projectAlias.ts)
    const congTrinhList = expandProjectNames(parseNameList(req.query.congTrinh));
    // Xưởng đã gộp -> mọi mã gốc (setup gộp xưởng)
    const xuongList = expandWorkshops(String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
    const tinhTrangList = String(req.query.tinhTrang || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const tinhTrangIpoList = String(req.query.tinhTrangIpo || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const needsRoleJoin = tinhTrangList.length > 0 || tinhTrangIpoList.length > 0;

    const cacheKey = JSON.stringify({
      wg: workshopGroupsVersion(),
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      // Ngày "hôm nay" (giờ VN) nằm trong khoá cache: sang ngày mới thì số lũy kế tháng tính lại
      today: vnDayKey(new Date()),
      date: req.query.date || null,
      dates: req.query.dates || null,
      congTrinh: congTrinhList,
      xuong: xuongList,
      tinhTrang: tinhTrangList,
      tinhTrangIpo: tinhTrangIpoList,
    });
     const overviewVersions = await getRelevantVersions(
      // Luôn kèm production: lọc bỏ hạng mục HỦY dựa vào bảng sản xuất
      [...OVERVIEW_SUMMARY_VERSION_KEYS, 'production']
    );
    const cachedOverview = overviewSummaryCache.get(cacheKey);
    if (cachedOverview && JSON.stringify(cachedOverview.versions) === JSON.stringify(overviewVersions)) {
      return res.json(cachedOverview.payload);
    }

    const hasDateTo = !!(req.query.dateTo || req.query.date);
    const hasDateFrom = !!req.query.dateFrom;

    const explicitDates = String(req.query.dates || '')
      .split(',')
      .map(s => parseSafeDate(s.trim()))
      .filter((d): d is Date => d !== null)
      .map(d => d.toISOString().slice(0, 10));
    const useExplicitDates = explicitDates.length > 0;
    const useAllTime = !hasDateTo && !hasDateFrom && !useExplicitDates;

    const dateToDate = parseSafeDate(req.query.dateTo as string)
      || parseSafeDate(req.query.date as string)
      || vnTodayUtc();
    const dateFromDate = parseSafeDate(req.query.dateFrom as string) || dateToDate;

    const dateToStr = dateToDate.toISOString().slice(0, 10);
    const dateFromStr = dateFromDate.toISOString().slice(0, 10);
    const monthStart = `${dateToStr.slice(0, 7)}-01`;
    const monthEnd = new Date(Date.UTC(dateToDate.getUTCFullYear(), dateToDate.getUTCMonth() + 1, 0))
      .toISOString().slice(0, 10);

    const prevMonthRef = new Date(Date.UTC(dateToDate.getUTCFullYear(), dateToDate.getUTCMonth() - 1, 1));
    const prevMonthStart = prevMonthRef.toISOString().slice(0, 7) + '-01';
    const prevMonthEnd = new Date(Date.UTC(prevMonthRef.getUTCFullYear(), prevMonthRef.getUTCMonth() + 1, 0))
      .toISOString().slice(0, 10);

    let outerLo = dateFromStr < monthStart ? dateFromStr : monthStart;
    outerLo = prevMonthStart < outerLo ? prevMonthStart : outerLo;
    let outerHi = dateToStr > monthEnd ? dateToStr : monthEnd;
    if (useExplicitDates) {
      const sorted = [...explicitDates].sort();
      outerLo = sorted[0] < outerLo ? sorted[0] : outerLo;
      outerHi = sorted[sorted.length - 1] > outerHi ? sorted[sorted.length - 1] : outerHi;
    }

    const subQueries: string[] = [];
    const allParams: any[] = [];

    // MỚI: mọi bảng nguồn giờ dùng alias 't' cố định để qualify cột an toàn khi có JOIN
    Object.entries(ANALYSIS_TABLES).forEach(([key, cfg]) => {
      const alias = 't';
      const colBare = (name: string) => `${alias}.${name}`;

      let periodCond: string;
      let mtdCond: string;
      let lastMonthCond: string;
      let localParams: any[];

            if (useAllTime) {
        periodCond = 'TRUE';
        mtdCond = `${colBare('date_parsed')} BETWEEN $P1 AND $P2`;
        lastMonthCond = `${colBare('date_parsed')} BETWEEN $P3 AND $P4`;
        localParams = [monthStart, dateToStr, prevMonthStart, prevMonthEnd];
      } else if (useExplicitDates) {
        periodCond = `${colBare('date_parsed')} = ANY($P1::date[])`;
        mtdCond = `${colBare('date_parsed')} BETWEEN $P2 AND $P3`;
        lastMonthCond = `${colBare('date_parsed')} BETWEEN $P4 AND $P5`;
        localParams = [explicitDates, monthStart, dateToStr, prevMonthStart, prevMonthEnd];
      } else {
        periodCond = `${colBare('date_parsed')} BETWEEN $P1 AND $P2`;
        mtdCond = `${colBare('date_parsed')} BETWEEN $P3 AND $P4`;
        lastMonthCond = `${colBare('date_parsed')} BETWEEN $P5 AND $P6`;
        localParams = [dateFromStr, dateToStr, monthStart, monthEnd, prevMonthStart, prevMonthEnd];
      }

      const baseIdx = allParams.length;
      localParams.forEach(p => allParams.push(p));
      const remap = (cond: string) => cond.replace(/\$P(\d+)/g, (_, n) => `$${baseIdx + Number(n)}`);

      const countExpr = `COUNT(DISTINCT ${colBare(cfg.hexCol!)})`;

      const outerConds: string[] = [];
            if (!useAllTime) {
        allParams.push(outerLo, outerHi);
        outerConds.push(`${colBare('date_parsed')} BETWEEN $${allParams.length - 1} AND $${allParams.length}`);
      }
      // Không tính hạng mục đã HỦY
      if (cfg.hexCol) outerConds.push(notCancelledHexCond(colBare(cfg.hexCol)));
      if (congTrinhList.length && cfg.congTrinhCol) {
        allParams.push(congTrinhList);
        outerConds.push(`${normNameSql(colBare(cfg.congTrinhCol))} = ANY($${allParams.length}::text[])`);
      }
      if (xuongList.length && cfg.xuongCol) {
        allParams.push(xuongList);
        outerConds.push(`UPPER(TRIM(${colBare(cfg.xuongCol)})) = ANY($${allParams.length}::text[])`);
      }
      // Lọc tinh_trang / tinh_trang_ipo bằng EXISTS (semi-join) thay vì LEFT JOIN:
      // cùng kết quả (dòng không có hex khớp bên production bị loại), nhưng nếu 1 hex
      // khớp nhiều dòng production thì SUM(value) KHÔNG bị cộng lặp.
      if (needsRoleJoin) {
        const pConds: string[] = [
          `p."${cfg.productionJoinCol || 'hex'}"::text = ${colBare(cfg.hexCol!)}::text`,
        ];
        if (tinhTrangList.length) {
          allParams.push(tinhTrangList);
          pConds.push(`UPPER(TRIM(p.tinh_trang)) = ANY($${allParams.length}::text[])`);
        }
        if (tinhTrangIpoList.length) {
          allParams.push(tinhTrangIpoList);
          pConds.push(`UPPER(TRIM(p.tinh_trang_ipo)) = ANY($${allParams.length}::text[])`);
        }
        outerConds.push(`EXISTS (SELECT 1 FROM production_status_app p WHERE ${pConds.join(' AND ')})`);
      }
      const outerWhere = outerConds.length ? outerConds.join(' AND ') : 'TRUE';
      const joinClause = '';

      subQueries.push(`
        SELECT
          '${key}' AS source_key,
          ${countExpr} FILTER (WHERE ${remap(periodCond)}) AS period_count,
          COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${remap(periodCond)}), 0) / ${cfg.valueDivisor} AS period_value,
          ${countExpr} FILTER (WHERE ${remap(mtdCond)}) AS mtd_count,
          COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${remap(mtdCond)}), 0) / ${cfg.valueDivisor} AS mtd_value,
          ${countExpr} FILTER (WHERE ${remap(lastMonthCond)}) AS last_month_count,
          COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${remap(lastMonthCond)}), 0) / ${cfg.valueDivisor} AS last_month_value
        FROM ${cfg.table} ${alias}
        ${joinClause}
        WHERE ${outerWhere}
      `);
    });

    const finalQuery = subQueries.join('\nUNION ALL\n');
    const r = await timedQuery(finalQuery, allParams);

    const results: Record<string, any> = {};
    r.rows.forEach(row => {
      results[row.source_key] = {
        daily: { count: Number(row.period_count), value: Number(row.period_value) },
        mtd: { count: Number(row.mtd_count), value: Number(row.mtd_value) },
        lastMonth: { count: Number(row.last_month_count), value: Number(row.last_month_value) },
      };
    });

    const overviewPayload = { date: dateToStr, dateFrom: dateFromStr, ...results };
    overviewSummaryCache.set(cacheKey, { versions: overviewVersions, payload: overviewPayload });
    trimCache(overviewSummaryCache);
    res.json(overviewPayload);
  } catch (error) {
    console.error('Lỗi overview/summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/overview/by-group', async (req: Request, res: Response) => {
  try {
    const { key, groupBy } = req.query as { key: string; groupBy: string };
    if (!ALLOWED_ANALYSIS_KEYS.has(key)) return res.status(400).json({ error: 'Invalid key' });
    if (groupBy !== 'xuong' && groupBy !== 'congtrinh') return res.status(400).json({ error: 'Invalid groupBy' });

    const cfg = ANALYSIS_TABLES[key];
    const alias = 't';
    const colBare = (name: string) => `${alias}.${name}`;
    const groupColRaw = groupBy === 'congtrinh' ? cfg.congTrinhCol : cfg.xuongCol;
    if (!groupColRaw) return res.json([]);
    const groupCol = colBare(groupColRaw);

    // Mọi cách viết của công trình được chọn (xem server/projectAlias.ts)
    const congTrinhList = expandProjectNames(parseNameList(req.query.congTrinh));
    // Xưởng đã gộp -> mọi mã gốc (setup gộp xưởng)
    const xuongList = expandWorkshops(String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
    const tinhTrangList = String(req.query.tinhTrang || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const tinhTrangIpoList = String(req.query.tinhTrangIpo || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const needsRoleJoin = tinhTrangList.length > 0 || tinhTrangIpoList.length > 0;

    const explicitDates = String(req.query.dates || '')
      .split(',')
      .map(s => parseSafeDate(s.trim()))
      .filter((d): d is Date => d !== null)
      .map(d => d.toISOString().slice(0, 10));
    const useExplicitDates = explicitDates.length > 0;

    const dateToRaw = parseSafeDate(req.query.dateTo as string) || parseSafeDate(req.query.date as string) || vnTodayUtc();
    const dateFromRaw = parseSafeDate(req.query.dateFrom as string) || dateToRaw;
    const dateToStr = dateToRaw.toISOString().slice(0, 10);
    const dateFromStr = dateFromRaw.toISOString().slice(0, 10);

    const refDateStr = useExplicitDates ? [...explicitDates].sort().slice(-1)[0] : dateToStr;
    const monthStart = `${refDateStr.slice(0, 7)}-01`;

        const params: any[] = [];
    let periodCond: string;
    if (useExplicitDates) {
      params.push(explicitDates);
      periodCond = `${colBare('date_parsed')} = ANY($1::date[])`;
    } else {
      params.push(dateFromStr, dateToStr);
      periodCond = `${colBare('date_parsed')} BETWEEN $1 AND $2`;
    }
    const monthStartIdx = params.length + 1;
    const refDateIdx = params.length + 2;
    params.push(monthStart, refDateStr);
    const mtdCond = `${colBare('date_parsed')} BETWEEN $${monthStartIdx} AND $${refDateIdx}`;

    const loCandidates = useExplicitDates ? [monthStart, ...explicitDates] : [monthStart, dateFromStr];
    const hiCandidates = useExplicitDates ? [refDateStr, ...explicitDates] : [refDateStr, dateToStr];
    const outerLo = loCandidates.sort()[0];
    const outerHi = hiCandidates.sort().slice(-1)[0];
    const outerLoIdx = params.length + 1;
    const outerHiIdx = params.length + 2;
    params.push(outerLo, outerHi);

    const extraConds: string[] = [];
    // Không tính hạng mục đã HỦY
    if (cfg.hexCol) extraConds.push(notCancelledHexCond(colBare(cfg.hexCol)));
    if (congTrinhList.length && cfg.congTrinhCol) {
      params.push(congTrinhList);
      extraConds.push(`${normNameSql(colBare(cfg.congTrinhCol))} = ANY($${params.length}::text[])`);
    }
    if (xuongList.length && cfg.xuongCol) {
      params.push(xuongList);
      extraConds.push(`UPPER(TRIM(${colBare(cfg.xuongCol)})) = ANY($${params.length}::text[])`);
    }
    // EXISTS thay cho LEFT JOIN: không cộng lặp SUM khi 1 hex khớp nhiều dòng production.
    if (needsRoleJoin) {
      const pConds: string[] = [
        `p."${cfg.productionJoinCol || 'hex'}"::text = ${colBare(cfg.hexCol!)}::text`,
      ];
      if (tinhTrangList.length) {
        params.push(tinhTrangList);
        pConds.push(`UPPER(TRIM(p.tinh_trang)) = ANY($${params.length}::text[])`);
      }
      if (tinhTrangIpoList.length) {
        params.push(tinhTrangIpoList);
        pConds.push(`UPPER(TRIM(p.tinh_trang_ipo)) = ANY($${params.length}::text[])`);
      }
      extraConds.push(`EXISTS (SELECT 1 FROM production_status_app p WHERE ${pConds.join(' AND ')})`);
    }
    const extraWhere = extraConds.length ? ` AND ${extraConds.join(' AND ')}` : '';
    const joinClause = '';

       const q = `
      SELECT
        COALESCE(NULLIF(${groupBy === 'congtrinh' ? `TRIM(${groupCol})` : workshopGroupSql(groupCol)}, ''), 'Chưa xác định') AS name,
        COUNT(DISTINCT ${colBare(cfg.hexCol!)}) FILTER (WHERE ${periodCond}) AS daily_count,
        COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${periodCond}), 0) / ${cfg.valueDivisor} AS daily_value,
        COUNT(DISTINCT ${colBare(cfg.hexCol!)}) FILTER (WHERE ${mtdCond}) AS mtd_count,
        COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${mtdCond}), 0) / ${cfg.valueDivisor} AS mtd_value
      FROM ${cfg.table} ${alias}
      ${joinClause}
      WHERE ${colBare('date_parsed')} BETWEEN $${outerLoIdx} AND $${outerHiIdx}${extraWhere}
      GROUP BY 1
      ORDER BY mtd_value DESC
    `;
    const r = await timedQuery(q, params);
    res.json(
  r.rows
    .map(row => ({
      name: row.name as string,
      dailyCount: Number(row.daily_count),
      dailyValue: Number(row.daily_value),
      mtdCount: Number(row.mtd_count),
      mtdValue: Number(row.mtd_value),
    }))
    .filter(row =>
      row.dailyCount > 0 || row.dailyValue > 0 ||
      row.mtdCount > 0 || row.mtdValue > 0
    )
);
  } catch (error) {
    console.error('Lỗi overview/by-group:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
