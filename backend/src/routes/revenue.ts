import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { TRIEU_TO_TY, TARGET_WORKSHOPS, currentVnYear } from '../server/common.js';
import { ghepDoanhSoNam, khoaChungDoanhSo, type DongKeHoachNam, type DongThucHienNam } from '../server/doanhSoNam.js';
import { notCancelledHexCond } from '../server/data.js';
import { numericCol } from '../server/data.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { app } from '../server/app.js';
import { workshopGroupSql, workshopCondition, workshopGroupsVersion } from '../server/workshopGroups.js';
import { parseNameList, expandProjectNames, normNameSql } from '../server/projectAlias.js';

// Cache theo phiên bản bảng (server/cache.ts): kế hoạch năm chỉ đổi khi khsx_nam / nhap_kho / sản xuất đổi
const revenueCache = createCache<unknown>(20);
const REVENUE_VERSION_KEYS = ['yearlyPlan', 'inventory', 'production'];

// Trả về: kế hoạch năm, quý, thực hiện, theo xưởng.
// Trước đây năm 2026 bị hardcode trong SQL — giờ nhận qua path param ?/:year, mặc định năm hiện tại.
// Trả về: kế hoạch năm, quý, thực hiện, theo xưởng.
// Đơn vị trả ra: TỶ ĐỒNG.


app.get(['/api/revenue', '/api/revenue/:year'], async (req: Request, res: Response) => {
  try {
    const yearParam = Number(req.params.year);
    const year = Number.isInteger(yearParam) && yearParam > 2000 && yearParam < 2100
      ? yearParam
      : currentVnYear();

    // Trước 4 câu (2 đợt qua pool 2 kết nối): tổng và theo-xưởng cùng quét 1 bảng với cùng WHERE. Nay 2 câu chạy song
    // song, mỗi câu GROUPING SETS trả luôn dòng tổng (la_tong = 1) + các dòng theo xưởng => cùng con số, bớt 1 lượt
    // quét khsx_nam, 1 lượt quét nhap_kho và 1 lần dựng tập HỦY.
    // Bản dùng chung mọi instance chỉ cho năm hiện tại; kết quả không theo người dùng và không dùng bảng tên công trình
    // (dungBangTen = false: không tính lại khi bảng tên vừa nạp xong ở nền). Năm nằm trong extraVersion.
    const payload = await cachedByVersions(revenueCache, `revenue|${year}`, REVENUE_VERSION_KEYS, async () => {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const xuongExpr = `COALESCE(NULLIF(${workshopGroupSql('xuong_chinh')}, ''), 'KHÁC')`;

    const [planQ, actualQ] = await Promise.all([
      timedQuery<DongKeHoachNam>(`
        SELECT GROUPING(t.name) AS la_tong, t.name,
               COALESCE(SUM(t.v), 0) AS plan,
               COALESCE(SUM(t.v) FILTER (WHERE t.thang BETWEEN 1 AND 3), 0) AS q1,
               COALESCE(SUM(t.v) FILTER (WHERE t.thang BETWEEN 1 AND 6), 0) AS q2,
               COALESCE(SUM(t.v) FILTER (WHERE t.thang BETWEEN 1 AND 9), 0) AS q3
        FROM (
          SELECT ${xuongExpr} AS name,
                 ${numericCol('khsx_nam', 'thanh_tien_ke_hoach')} AS v,
                 NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int AS thang
          FROM khsx_nam WHERE nam = $1::bigint
        ) t
        GROUP BY GROUPING SETS ((), (t.name))
      `, [String(year)]),

      timedQuery<DongThucHienNam>(`
        SELECT GROUPING(t.name) AS la_tong, t.name, COALESCE(SUM(t.v), 0) AS actual
        FROM (
          SELECT ${xuongExpr} AS name, ${numericCol('nhap_kho', 'thanh_tien_nhap_kho')} AS v
          FROM nhap_kho
          WHERE date_parsed BETWEEN $1 AND $2 AND ${notCancelledHexCond('hex')}
        ) t
        GROUP BY GROUPING SETS ((), (t.name))
      `, [yearStart, yearEnd]),
    ]);

    return ghepDoanhSoNam(year, planQ.rows, actualQ.rows);
    }, `${workshopGroupsVersion()}|${year}`, khoaChungDoanhSo(year, currentVnYear()), false);
    res.json(payload);
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
    const payload = await cachedByVersions(revenueCache, `plan|${fromKey}|${toKey}|${req.query.xuong || ''}`, ['yearlyPlan'], async () => {
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
    return {
      byMonth: byMonth.rows.map(r => ({
        period: `${r.nam}-${String(r.thang).padStart(2, '0')}`,
        value: Number(r.value),
      })),
      byXuong: byXuong.rows.map(r => ({ xuong: r.xuong, value: Number(r.value) })),
    };
    // Chỉ lọc xưởng, không dùng tên công trình => không gắn phiên bản bảng tên vào khoá (dungBangTen = false)
    }, workshopGroupsVersion(), '', false);
    res.json(payload);
  } catch (error) {
    console.error('Lỗi khsx-nam/plan:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Kế hoạch năm (khsx_nam, TỶ) và thực hiện nhập kho (nhap_kho, triệu -> TỶ, không tính hạng mục HỦY)
// theo THÁNG × XƯỞNG của 1 năm — cho bảng "Kế hoạch năm – Thực hiện" chia theo khu vực sản xuất.
// Xưởng theo setup gộp xưởng (server/workshopGroups.ts); xưởng chính (TARGET_WORKSHOPS) xếp trước.
// ?congTrinh= lọc thực hiện; khsx_nam không có cột công trình nên khi lọc thì plan rỗng.
app.get('/api/khsx-nam/plan-actual', async (req: Request, res: Response) => {
  try {
    const year = Number(req.query.year) || currentVnYear();
    const congTrinhList = expandProjectNames(parseNameList(req.query.congTrinh));
    const payload = await cachedByVersions(revenueCache, `plan-actual|${year}|${congTrinhList.join('|')}`, REVENUE_VERSION_KEYS, async () => {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const xuongExpr = `COALESCE(NULLIF(${workshopGroupSql('xuong_chinh')}, ''), 'KHÁC')`;
    const actualParams: unknown[] = [yearStart, yearEnd];
    let actualCt = '';
    if (congTrinhList.length) { actualParams.push(congTrinhList); actualCt = ` AND ${normNameSql('ten_cong_trinh')} = ANY($3::text[])`; }
    const [plan, actual] = await Promise.all([
      congTrinhList.length ? Promise.resolve({ rows: [] as any[] }) : timedQuery(
        `SELECT thang::int AS thang, ${xuongExpr} AS xuong,
                COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')}), 0) AS value
         FROM khsx_nam WHERE nam = $1::bigint GROUP BY 1, 2`,
        [String(year)]
      ),
      timedQuery(
        `SELECT EXTRACT(MONTH FROM date_parsed)::int AS thang, ${xuongExpr} AS xuong,
                COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0) / ${TRIEU_TO_TY} AS value
         FROM nhap_kho
         WHERE date_parsed BETWEEN $1 AND $2 AND ${notCancelledHexCond('hex')}${actualCt}
         GROUP BY 1, 2`,
        actualParams
      ),
    ]);
    const map = (rows: any[]) => rows.map(r => ({ thang: Number(r.thang), xuong: String(r.xuong), value: Number(r.value) }));
    const p = map(plan.rows), a = map(actual.rows);
    // Thứ tự cột: xưởng chính trước, các xưởng gộp khác theo ABC, "KHÁC" cuối
    const seen = new Set([...p, ...a].map(r => r.xuong).filter(Boolean));
    const main = TARGET_WORKSHOPS.filter(w => seen.has(w));
    const rest = [...seen].filter(w => !TARGET_WORKSHOPS.includes(w) && w !== 'KHÁC').sort();
    const workshops = [...main, ...rest, ...(seen.has('KHÁC') ? ['KHÁC'] : [])];
    return { year, workshops, plan: p, actual: a };
    }, workshopGroupsVersion());
    res.json(payload);
  } catch (error) {
    console.error('Lỗi khsx-nam/plan-actual:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
