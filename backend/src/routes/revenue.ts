import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { runWithLimit, TRIEU_TO_TY, TARGET_WORKSHOPS, currentVnYear } from '../server/common.js';
import { notCancelledHexCond } from '../server/data.js';
import { numericCol } from '../server/data.js';
import { app } from '../server/app.js';
import { workshopGroupSql, workshopCondition } from '../server/workshopGroups.js';

// Trả về: kế hoạch năm, quý, thực hiện, theo xưởng.
// Trước đây năm 2026 bị hardcode trong SQL — giờ nhận qua path param ?/:year, mặc định năm hiện tại.
// [ĐO TIMING] 4 query chạy song song (giới hạn 2) — đổi cả 4 sang timedQuery.
// Trả về: kế hoạch năm, quý, thực hiện, theo xưởng.
// Đơn vị trả ra: TỶ ĐỒNG.


app.get(['/api/revenue', '/api/revenue/:year'], async (req: Request, res: Response) => {
  try {
    const yearParam = Number(req.params.year);
    const year = Number.isInteger(yearParam) && yearParam > 2000 && yearParam < 2100
      ? yearParam
      : currentVnYear();

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const [planQ, actualQ, byWorkshopPlanQ, byWorkshopActualQ] = await runWithLimit([
      () => timedQuery(`
        SELECT
          COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')}), 0) AS total,
          COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')})
            FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 3), 0) AS q1,
          COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')})
            FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 6), 0) AS q2,
          COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')})
            FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 9), 0) AS q3
        FROM khsx_nam WHERE nam = $1::bigint
      `, [String(year)]),

      () => timedQuery(`
        SELECT COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0) AS total
        FROM nhap_kho
        WHERE date_parsed BETWEEN $1 AND $2 AND ${notCancelledHexCond('hex')}
      `, [yearStart, yearEnd]),

      () => timedQuery(`
        SELECT COALESCE(NULLIF(${workshopGroupSql('xuong_chinh')}, ''), 'KHÁC') AS name,
               COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')}), 0) AS plan
        FROM khsx_nam WHERE nam = $1::bigint
        GROUP BY 1
      `, [String(year)]),

      () => timedQuery(`
        SELECT COALESCE(NULLIF(${workshopGroupSql('xuong_chinh')}, ''), 'KHÁC') AS name,
               COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0) AS actual
        FROM nhap_kho
        WHERE date_parsed BETWEEN $1 AND $2 AND ${notCancelledHexCond('hex')}
        GROUP BY 1
      `, [yearStart, yearEnd]),
    ], 2);

    const targetTotal = Number(planQ.rows[0].total);
    const actualTotal = Number(actualQ.rows[0].total) / TRIEU_TO_TY;   // triệu -> tỷ

    const workshopMap: Record<string, { plan: number; actual: number }> = {};
    byWorkshopPlanQ.rows.forEach(r => { workshopMap[r.name] = { plan: Number(r.plan), actual: 0 }; });
    byWorkshopActualQ.rows.forEach(r => {
      if (!workshopMap[r.name]) workshopMap[r.name] = { plan: 0, actual: 0 };
      workshopMap[r.name].actual = Number(r.actual) / TRIEU_TO_TY;     // SỬA: trước là / VND_TO_TY
    });

    const byWorkshop = Object.entries(workshopMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (a.name === 'KHÁC' ? 1 : b.name === 'KHÁC' ? -1 : a.name.localeCompare(b.name)));

    res.json({
      year,
      targetRevenue2026: targetTotal,
      quarterlyTargets: {
        q1: Number(planQ.rows[0].q1),
        q2: Number(planQ.rows[0].q2),
        q3: Number(planQ.rows[0].q3),
        q4: targetTotal,
      },
      actual: { value: actualTotal, percent: targetTotal > 0 ? (actualTotal / targetTotal) * 100 : 0 },
      byWorkshop,
    });
  } catch (error) {
    console.error('Lỗi revenue:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Kế hoạch năm (bảng khsx_nam, đơn vị TỶ ĐỒNG) theo tháng và theo xưởng, trong khoảng tháng
// [from, to] (dạng YYYY-MM). Dùng để vẽ cột "Kế hoạch" cạnh biểu đồ nhập kho khi người dùng
// bấm ô "Kế hoạch năm". ?xuong= (tuỳ chọn) lọc 1 xưởng như bộ lọc của biểu đồ.
const YM_RE = /^(\d{4})-(\d{2})$/;
app.get('/api/khsx-nam/plan', async (req: Request, res: Response) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const mf = from.match(YM_RE);
    const mt = to.match(YM_RE);
    if (!mf || !mt) return res.status(400).json({ error: 'from/to phải dạng YYYY-MM' });
    const fromKey = Number(mf[1]) * 100 + Number(mf[2]);
    const toKey = Number(mt[1]) * 100 + Number(mt[2]);
    const params: any[] = [fromKey, toKey];
    let where = `(nam::int * 100 + thang::int) BETWEEN $1 AND $2`;
    const xuong = String(req.query.xuong || '').trim();
    if (xuong) where += ` AND ${workshopCondition('xuong_chinh', xuong, params)}`;

    const value = numericCol('khsx_nam', 'thanh_tien_ke_hoach');
    const [byMonth, byXuong] = await Promise.all([
      timedQuery(
        `SELECT nam::int AS nam, thang::int AS thang, COALESCE(SUM(${value}), 0) AS value
         FROM khsx_nam WHERE ${where} GROUP BY 1, 2 ORDER BY 1, 2`,
        params
      ),
      timedQuery(
        `SELECT ${workshopGroupSql('xuong_chinh')} AS xuong, COALESCE(SUM(${value}), 0) AS value
         FROM khsx_nam WHERE ${where} GROUP BY 1 ORDER BY 1`,
        params
      ),
    ]);
    res.json({
      byMonth: byMonth.rows.map(r => ({
        period: `${r.nam}-${String(r.thang).padStart(2, '0')}`,
        value: Number(r.value),
      })),
      byXuong: byXuong.rows.map(r => ({ xuong: r.xuong, value: Number(r.value) })),
    });
  } catch (error) {
    console.error('Lỗi khsx-nam/plan:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Kế hoạch năm (khsx_nam, TỶ) và thực hiện nhập kho (nhap_kho, triệu -> TỶ, không tính hạng mục HỦY)
// theo THÁNG × XƯỞNG của 1 năm — cho bảng "Kế hoạch năm – Thực hiện" chia theo khu vực sản xuất.
// Xưởng theo setup gộp xưởng (server/workshopGroups.ts); xưởng chính (TARGET_WORKSHOPS) xếp trước.
app.get('/api/khsx-nam/plan-actual', async (req: Request, res: Response) => {
  try {
    const year = Number(req.query.year) || currentVnYear();
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const xuongExpr = `COALESCE(NULLIF(${workshopGroupSql('xuong_chinh')}, ''), 'KHÁC')`;
    const [plan, actual] = await Promise.all([
      timedQuery(
        `SELECT thang::int AS thang, ${xuongExpr} AS xuong,
                COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')}), 0) AS value
         FROM khsx_nam WHERE nam = $1::bigint GROUP BY 1, 2`,
        [String(year)]
      ),
      timedQuery(
        `SELECT EXTRACT(MONTH FROM date_parsed)::int AS thang, ${xuongExpr} AS xuong,
                COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0) / ${TRIEU_TO_TY} AS value
         FROM nhap_kho
         WHERE date_parsed BETWEEN $1 AND $2 AND ${notCancelledHexCond('hex')}
         GROUP BY 1, 2`,
        [yearStart, yearEnd]
      ),
    ]);
    const map = (rows: any[]) => rows.map(r => ({ thang: Number(r.thang), xuong: String(r.xuong), value: Number(r.value) }));
    const p = map(plan.rows), a = map(actual.rows);
    // Thứ tự cột: xưởng chính trước, các xưởng gộp khác theo ABC, "KHÁC" cuối
    const seen = new Set([...p, ...a].map(r => r.xuong).filter(Boolean));
    const main = TARGET_WORKSHOPS.filter(w => seen.has(w));
    const rest = [...seen].filter(w => !TARGET_WORKSHOPS.includes(w) && w !== 'KHÁC').sort();
    const workshops = [...main, ...rest, ...(seen.has('KHÁC') ? ['KHÁC'] : [])];
    res.json({ year, workshops, plan: p, actual: a });
  } catch (error) {
    console.error('Lỗi khsx-nam/plan-actual:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
