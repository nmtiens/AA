import { parseNameList, expandProjectNames, canonicalProjectName, normNameSql } from '../server/projectAlias.js';
import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { expandWorkshops, workshopGroupSql, workshopGroupsVersion } from '../server/workshopGroups.js';
import { vnDayKey, vnTodayUtc } from '../server/common.js';
import { parseSafeDate, ANALYSIS_TABLES, ALLOWED_ANALYSIS_KEYS, numericColQualified, notCancelledHexCond, CANCELLED_HEX_SQL, productionKeySql } from '../server/data.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { app } from '../server/app.js';

// --- CACHE IN-MEMORY (theo phiên bản bảng, xem server/cache.ts) ---
const overviewSummaryCache = createCache<unknown>(50);
const overviewByGroupCache = createCache<unknown>(80);
// Luôn kèm production: lọc bỏ hạng mục HỦY / lọc tình trạng dựa vào bảng sản xuất
const OVERVIEW_SUMMARY_VERSION_KEYS = ['order', 'tkbv', 'pthsp', 'inventory', 'export', 'production'];

const splitUpper = (v: unknown) => String(v || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

// Bộ lọc Tình trạng / Tình trạng IPO (từ bảng sản xuất) cho các bảng giao dịch.
// TRƯỚC: `EXISTS (SELECT 1 FROM production_status_app p WHERE p.hex::text = t.hex::text AND ...)` — Postgres
// ước lượng sai số dòng và chạy nested loop quét lại bảng sản xuất (~52k dòng, không có index trên hex::text)
// cho TỪNG dòng giao dịch => vượt statement timeout 8s, trang Tổng quan báo lỗi khi lọc IPO.
// SAU: tính TRƯỚC tập HEX thoả bộ lọc thành CTE (1 lần quét), rồi semi-join băm với từng bảng.
interface RoleFilter { ctes: string[]; existsCond: (hexExpr: string, joinCol: string) => string }
const buildRoleFilter = (tinhTrangList: string[], tinhTrangIpoList: string[], params: any[], joinCols: string[]): RoleFilter | null => {
  if (!tinhTrangList.length && !tinhTrangIpoList.length) return null;
  const conds: string[] = [];
  if (tinhTrangList.length) { params.push(tinhTrangList); conds.push(`UPPER(TRIM(tinh_trang)) = ANY($${params.length}::text[])`); }
  if (tinhTrangIpoList.length) { params.push(tinhTrangIpoList); conds.push(`UPPER(TRIM(tinh_trang_ipo)) = ANY($${params.length}::text[])`); }
  const ctes = [...new Set(joinCols)].map(col =>
    // ma_id_sap: chuẩn hoá mã 18 số về 12 số (productionKeySql) cho khớp ton_kho
    `role_${col} AS (SELECT DISTINCT ${productionKeySql(col)}::text AS k FROM production_status_app WHERE "${col}" IS NOT NULL AND ${conds.join(' AND ')})`);
  return { ctes, existsCond: (hexExpr, joinCol) => `EXISTS (SELECT 1 FROM role_${joinCol} rh WHERE rh.k = ${hexExpr}::text)` };
};

// [ĐO TIMING] Endpoint từng mất 34.71s trên Network tab — điểm nóng số 1.
app.get('/api/overview/summary', async (req: Request, res: Response) => {
  try {
    // Mọi cách viết của công trình được chọn (xem server/projectAlias.ts)
    const congTrinhList = expandProjectNames(parseNameList(req.query.congTrinh));
    // Xưởng đã gộp -> mọi mã gốc (setup gộp xưởng)
    const xuongList = expandWorkshops(splitUpper(req.query.xuong));
    const tinhTrangList = splitUpper(req.query.tinhTrang).sort();
    const tinhTrangIpoList = splitUpper(req.query.tinhTrangIpo).sort();

    const cacheKey = JSON.stringify({
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

    const overviewPayload = await cachedByVersions(overviewSummaryCache, cacheKey, OVERVIEW_SUMMARY_VERSION_KEYS, async () => {
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
      // CTE dùng chung cho 5 bảng: tập HEX đã HỦY tính 1 lần; tập HEX thoả bộ lọc tình trạng tính 1 lần
      const ctes: string[] = [`cancelled_hex AS (${CANCELLED_HEX_SQL})`];
      const role = buildRoleFilter(tinhTrangList, tinhTrangIpoList, allParams,
        Object.values(ANALYSIS_TABLES).map(c => c.productionJoinCol || 'hex'));
      if (role) ctes.push(...role.ctes);

      // Mọi bảng nguồn dùng alias 't' cố định
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
          // Lũy kế tháng tính đến ngày xem (dateTo), không đến cuối tháng — khớp /overview/by-group và nhánh dates
          localParams = [dateFromStr, dateToStr, monthStart, dateToStr, prevMonthStart, prevMonthEnd];
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
        if (cfg.hexCol) outerConds.push(notCancelledHexCond(colBare(cfg.hexCol), 'cancelled_hex'));
        if (congTrinhList.length && cfg.congTrinhCol) {
          allParams.push(congTrinhList);
          outerConds.push(`${normNameSql(colBare(cfg.congTrinhCol))} = ANY($${allParams.length}::text[])`);
        }
        if (xuongList.length && cfg.xuongCol) {
          allParams.push(xuongList);
          outerConds.push(`UPPER(TRIM(${colBare(cfg.xuongCol)})) = ANY($${allParams.length}::text[])`);
        }
        // Lọc tinh_trang / tinh_trang_ipo bằng semi-join (dòng không có hex khớp bên production bị loại;
        // 1 hex khớp nhiều dòng production thì SUM(value) KHÔNG bị cộng lặp)
        if (role && cfg.hexCol) outerConds.push(role.existsCond(colBare(cfg.hexCol), cfg.productionJoinCol || 'hex'));
        const outerWhere = outerConds.length ? outerConds.join(' AND ') : 'TRUE';

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
        WHERE ${outerWhere}
      `);
      });

      const finalQuery = `WITH ${ctes.join(',\n')}\n${subQueries.join('\nUNION ALL\n')}`;
      const r = await timedQuery(finalQuery, allParams, { workMemMb: 32 });

      const results: Record<string, any> = {};
      r.rows.forEach(row => {
        results[row.source_key] = {
          daily: { count: Number(row.period_count), value: Number(row.period_value) },
          mtd: { count: Number(row.mtd_count), value: Number(row.mtd_value) },
          lastMonth: { count: Number(row.last_month_count), value: Number(row.last_month_value) },
        };
      });

      return { date: dateToStr, dateFrom: dateFromStr, ...results };
    }, workshopGroupsVersion());

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
    const xuongList = expandWorkshops(splitUpper(req.query.xuong));
    const tinhTrangList = splitUpper(req.query.tinhTrang).sort();
    const tinhTrangIpoList = splitUpper(req.query.tinhTrangIpo).sort();

    const cacheKey = JSON.stringify({
      key, groupBy,
      dateFrom: req.query.dateFrom || null, dateTo: req.query.dateTo || null, date: req.query.date || null,
      dates: req.query.dates || null, allTime: req.query.allTime || null,
      today: vnDayKey(new Date()),
      congTrinh: congTrinhList, xuong: xuongList, tinhTrang: tinhTrangList, tinhTrangIpo: tinhTrangIpoList,
    });

    const rows = await cachedByVersions(overviewByGroupCache, cacheKey, [key, 'production'], async () => {
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
      // allTime=1: thẻ đang xem "toàn bộ thời gian" (không lọc ngày) — cột trong kỳ tính mọi ngày, giống
      // /overview/summary. Trước by-group lấy dateFrom = dateTo => cột trong kỳ chỉ là 1 ngày (lệch thẻ)
      if (req.query.allTime === '1' && !useExplicitDates) {
        periodCond = 'TRUE';
      } else if (useExplicitDates) {
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
      const allTime = periodCond === 'TRUE';
      // Khoảng ngày bao ngoài để quét ít dòng; toàn bộ thời gian thì không chặn (xem WHERE bên dưới)
      let outerWhere = 'TRUE';
      if (!allTime) {
        params.push(loCandidates.sort()[0], hiCandidates.sort().slice(-1)[0]);
        outerWhere = `${colBare('date_parsed')} BETWEEN $${params.length - 1} AND $${params.length}`;
      }

      const ctes: string[] = [`cancelled_hex AS (${CANCELLED_HEX_SQL})`];
      const extraConds: string[] = [];
      // Không tính hạng mục đã HỦY
      if (cfg.hexCol) extraConds.push(notCancelledHexCond(colBare(cfg.hexCol), 'cancelled_hex'));
      if (congTrinhList.length && cfg.congTrinhCol) {
        params.push(congTrinhList);
        extraConds.push(`${normNameSql(colBare(cfg.congTrinhCol))} = ANY($${params.length}::text[])`);
      }
      if (xuongList.length && cfg.xuongCol) {
        params.push(xuongList);
        extraConds.push(`UPPER(TRIM(${colBare(cfg.xuongCol)})) = ANY($${params.length}::text[])`);
      }
      // Semi-join với tập HEX thoả bộ lọc tình trạng (xem buildRoleFilter): không cộng lặp SUM
      const joinCol = cfg.productionJoinCol || 'hex';
      const role = buildRoleFilter(tinhTrangList, tinhTrangIpoList, params, [joinCol]);
      if (role && cfg.hexCol) { ctes.push(...role.ctes); extraConds.push(role.existsCond(colBare(cfg.hexCol), joinCol)); }
      const extraWhere = extraConds.length ? ` AND ${extraConds.join(' AND ')}` : '';

      const q = `
      WITH ${ctes.join(',\n')}
      SELECT
        -- Công trình: gom theo tên đã chuẩn hoá (hoa/thường, khoảng trắng) như khi lọc / xem chi tiết
        COALESCE(NULLIF(${groupBy === 'congtrinh' ? `MIN(TRIM(${groupCol}))` : workshopGroupSql(groupCol)}, ''), 'Chưa xác định') AS name,
        COUNT(DISTINCT ${colBare(cfg.hexCol!)}) FILTER (WHERE ${periodCond}) AS daily_count,
        COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${periodCond}), 0) / ${cfg.valueDivisor} AS daily_value,
        COUNT(DISTINCT ${colBare(cfg.hexCol!)}) FILTER (WHERE ${mtdCond}) AS mtd_count,
        COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${mtdCond}), 0) / ${cfg.valueDivisor} AS mtd_value
      FROM ${cfg.table} ${alias}
      -- Toàn bộ thời gian: không chặn ngày — gồm dòng không có ngày (vd. đơn hàng thiếu ngày nhận từ PM) và dòng ngày
      -- sau hôm nay, giống /overview/summary (trước chặn tới hôm nay => tổng thẻ lớn hơn tổng các dòng chia nhóm)
      WHERE ${outerWhere}${extraWhere}
      GROUP BY ${groupBy === 'congtrinh' ? normNameSql(groupCol) : '1'}
      ORDER BY mtd_value DESC
    `;
      const r = await timedQuery(q, params, { workMemMb: 32 });
      // Theo công trình: gộp các cách viết của cùng 1 công trình (cùng mã) thành 1 dòng — khớp khi lọc
      const merged = new Map<string, { name: string; dailyCount: number; dailyValue: number; mtdCount: number; mtdValue: number }>();
      for (const row of r.rows) {
        const raw = row.name as string;
        const name = groupBy === 'congtrinh' && raw !== 'Chưa xác định' ? canonicalProjectName(raw) : raw;
        const e = merged.get(name) ?? { name, dailyCount: 0, dailyValue: 0, mtdCount: 0, mtdValue: 0 };
        e.dailyCount += Number(row.daily_count);
        e.dailyValue += Number(row.daily_value);
        e.mtdCount += Number(row.mtd_count);
        e.mtdValue += Number(row.mtd_value);
        merged.set(name, e);
      }
      return [...merged.values()]
        .sort((a, b) => b.mtdValue - a.mtdValue)
        .filter(row =>
          row.dailyCount > 0 || row.dailyValue > 0 ||
          row.mtdCount > 0 || row.mtdValue > 0
        );
    }, workshopGroupsVersion());

    res.json(rows);
  } catch (error) {
    console.error('Lỗi overview/by-group:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
