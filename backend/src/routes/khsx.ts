import { parseNameList, expandProjectNames, normNameSql, canonicalProjectName } from '../server/projectAlias.js';
import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { TRIEU_TO_TY } from '../server/common.js';
import { getRelevantVersions, trimCache, numericCol, notCancelledHexCond } from '../server/data.js';
import { app } from '../server/app.js';
import { workshopGroupSql, workshopCondition, workshopGroupsVersion } from '../server/workshopGroups.js';

// --- CACHE IN-MEMORY CHO /api/khsx-nhapkho/summary ---
const khsxNhapKhoCache = new Map<string, { versions: Record<string, string>; payload: any }>();
const KHSX_NHAPKHO_VERSION_KEYS = ['khsx', 'inventory', 'production'];

// [ĐO TIMING] Endpoint tổng hợp phức tạp — 2 query chính (khQuery, thQuery).
// Đơn vị trả ra: TỶ ĐỒNG (cả KH lẫn TH đều từ triệu -> tỷ, chia 1000).
app.get('/api/khsx-nhapkho/summary', async (req: Request, res: Response) => {
  try {
    const { nam, thang, mode = 'month', tuan, ngay, congTrinh, xuong } = req.query as Record<string, string>;
    if (!nam) return res.status(400).json({ error: 'Missing nam' });

    const khsxCacheKey = JSON.stringify({ nam, thang, mode, tuan, ngay, congTrinh, xuong, wg: workshopGroupsVersion() });
    const khsxVersions = await getRelevantVersions(KHSX_NHAPKHO_VERSION_KEYS);
    const cachedKhsx = khsxNhapKhoCache.get(khsxCacheKey);
    if (cachedKhsx && JSON.stringify(cachedKhsx.versions) === JSON.stringify(khsxVersions)) {
      return res.json(cachedKhsx.payload);
    }

    const isWeek = mode === 'week';
    const phanLoaiPattern = isWeek ? '%TUẦN%' : '%THÁNG%';

    const normalize = (s: string) => s.trim().toUpperCase();
    // Mọi cách viết của công trình được chọn (xem server/projectAlias.ts)
    const congTrinhList = expandProjectNames(parseNameList(congTrinh));
    const xuongList = xuong ? xuong.split(',').map(normalize).filter(Boolean) : [];

    // ---------- KẾ HOẠCH (khsx) ----------
    const khParams: any[] = [phanLoaiPattern, nam];
    // Không tính hạng mục đã HỦY
    let khWhere = `WHERE UPPER(TRIM(phan_loai_kh)) LIKE $1 AND nam = $2::bigint AND ${notCancelledHexCond('hex')}`;
    if (thang) { khParams.push(thang); khWhere += ` AND thang = $${khParams.length}::bigint`; }
    if (isWeek && tuan) { khParams.push(tuan); khWhere += ` AND tuan = $${khParams.length}::double precision`; }
    if (isWeek && ngay) { khParams.push(ngay); khWhere += ` AND ngay = $${khParams.length}::double precision`; }
    if (congTrinhList.length) { khParams.push(congTrinhList); khWhere += ` AND ${normNameSql('ten_cong_trinh')} = ANY($${khParams.length}::text[])`; }
    if (xuongList.length) khWhere += ` AND ${workshopCondition('xuong_chinh', xuongList, khParams)}`;

    const khQuery = `
      SELECT
        ${workshopGroupSql('xuong_chinh')} AS xuong,
        TRIM(ten_cong_trinh) AS cong_trinh,
        TRIM(ma_cong_trinh) AS ma_cong_trinh,
        COALESCE(SUM(${numericCol('khsx', 'thanh_tien_ke_hoach')}), 0) / ${TRIEU_TO_TY} AS gia_tri
      FROM khsx
      ${khWhere}
      GROUP BY 1, 2, 3
    `;
    const khResult = await timedQuery(khQuery, khParams);

    // ---------- THỰC HIỆN (nhap_kho) ----------
    const thParams: any[] = [nam];
    // Không tính hạng mục đã HỦY
    let thWhere = `WHERE nam = $1::bigint AND ${notCancelledHexCond('hex')}`;
    if (thang) { thParams.push(thang); thWhere += ` AND thang = $${thParams.length}::bigint`; }
    if (isWeek && tuan) { thParams.push(tuan); thWhere += ` AND tuan = $${thParams.length}::bigint`; }
    if (isWeek && ngay) { thParams.push(ngay); thWhere += ` AND ngay = $${thParams.length}::bigint`; }
    if (congTrinhList.length) { thParams.push(congTrinhList); thWhere += ` AND ${normNameSql('ten_cong_trinh')} = ANY($${thParams.length}::text[])`; }
    if (xuongList.length) thWhere += ` AND ${workshopCondition('xuong_chinh', xuongList, thParams)}`;

    // HEX có trong kế hoạch của CÙNG kỳ (KH tháng / KH tuần) — tách TH thành "nhập kho theo KH" và
    // "nhập kho ngoài KH"; tỷ lệ hoàn thành chỉ tính phần theo KH (trước cộng cả hạng mục không có KH
    // nên % trông gần đạt dù phần lớn nhập kho là hạng mục ngoài KH).
    thParams.push(phanLoaiPattern, nam);
    let planHexWhere = `UPPER(TRIM(phan_loai_kh)) LIKE $${thParams.length - 1} AND nam = $${thParams.length}::bigint AND hex IS NOT NULL`;
    if (thang) { thParams.push(thang); planHexWhere += ` AND thang = $${thParams.length}::bigint`; }
    if (isWeek && tuan) { thParams.push(tuan); planHexWhere += ` AND tuan = $${thParams.length}::double precision`; }
    if (isWeek && ngay) { thParams.push(ngay); planHexWhere += ` AND ngay = $${thParams.length}::double precision`; }

    const thQuery = `
      WITH plan_hex AS (SELECT DISTINCT hex::text AS hex FROM khsx WHERE ${planHexWhere})
      SELECT
        ${workshopGroupSql('xuong_chinh')} AS xuong,
        TRIM(ten_cong_trinh) AS cong_trinh,
        TRIM(ma_cong_trinh) AS ma_cong_trinh,
        (hex::text IN (SELECT hex FROM plan_hex)) AS in_plan,
        COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0) / ${TRIEU_TO_TY} AS gia_tri
      FROM nhap_kho
      ${thWhere}
      GROUP BY 1, 2, 3, 4
    `;
    const thResult = await timedQuery(thQuery, thParams);

    // ---------- GỘP THEO XƯỞNG ----------
    const xuongMap = new Map<string, { kh: number; th: number; thPlan: number }>();
    khResult.rows.forEach(r => {
      const k = r.xuong || 'Chưa xác định';
      const e = xuongMap.get(k) || { kh: 0, th: 0, thPlan: 0 };
      e.kh += Number(r.gia_tri);
      xuongMap.set(k, e);
    });
    thResult.rows.forEach(r => {
      const k = r.xuong || 'Chưa xác định';
      const e = xuongMap.get(k) || { kh: 0, th: 0, thPlan: 0 };
      e.th += Number(r.gia_tri);
      if (r.in_plan) e.thPlan += Number(r.gia_tri);
      xuongMap.set(k, e);
    });
    const byXuong = Array.from(xuongMap.entries())
      .map(([xuong, v]) => ({ xuong, kh: Number(v.kh.toFixed(2)), th: Number(v.th.toFixed(2)), thPlan: Number(v.thPlan.toFixed(2)) }))
      .sort((a, b) => a.xuong.localeCompare(b.xuong));

    // ---------- GỘP THEO CÔNG TRÌNH (top 10) ----------
    const ctMap = new Map<string, { codes: Set<string>; kh: number; th: number; thPlan: number }>();
    // Gộp các cách viết của cùng 1 công trình (cùng mã) — cùng quy tắc biểu đồ / Tổng quan theo công trình
    const ctEntry = (r: any) => {
      const k = r.cong_trinh ? canonicalProjectName(r.cong_trinh) : 'Chưa xác định';
      const e = ctMap.get(k) || { codes: new Set<string>(), kh: 0, th: 0, thPlan: 0 };
      if (r.ma_cong_trinh) e.codes.add(r.ma_cong_trinh);
      ctMap.set(k, e);
      return e;
    };
    khResult.rows.forEach(r => { ctEntry(r).kh += Number(r.gia_tri); });
    thResult.rows.forEach(r => {
      const e = ctEntry(r);
      e.th += Number(r.gia_tri);
      if (r.in_plan) e.thPlan += Number(r.gia_tri);
    });
    // Nhãn trục = mã công trình khi tên chỉ có đúng 1 mã; tên dùng cho nhiều mã (vd. ARHAUS mỗi đơn 1 mã)
    // thì giữ tên — trước lấy đại 1 mã trong số đó
    const byCongTrinh = Array.from(ctMap.entries())
      .map(([name, v]) => ({ name, code: v.codes.size === 1 ? [...v.codes][0] : name, kh: Number(v.kh.toFixed(2)), th: Number(v.th.toFixed(2)), thPlan: Number(v.thPlan.toFixed(2)) }))
      .sort((a, b) => Math.max(b.kh, b.th) - Math.max(a.kh, a.th))
      .slice(0, 10);

    // Cộng từ số CHƯA làm tròn (byXuong đã làm tròn 2 số => cộng lại có thể lệch 0.01)
    const totalKh = [...xuongMap.values()].reduce((a, b) => a + b.kh, 0);
    const totalTh = [...xuongMap.values()].reduce((a, b) => a + b.th, 0);
    const totalThPlan = [...xuongMap.values()].reduce((a, b) => a + b.thPlan, 0);
    const completionRate = totalKh > 0 ? (totalThPlan / totalKh) * 100 : 0;

    // Xem theo THÁNG mà kỳ đó chưa có KH tháng (vd. tháng mới, KH tháng chưa nhập) nhưng đã có KH tuần:
    // trả thêm tổng KH tuần cùng bộ lọc để giao diện chú thích thay vì chỉ hiện 0.
    let weeklyKhFallback: number | undefined;
    if (!isWeek && totalKh === 0) {
      const wkParams = [...khParams];
      wkParams[0] = '%TUẦN%';
      const wk = await timedQuery(
        `SELECT COALESCE(SUM(${numericCol('khsx', 'thanh_tien_ke_hoach')}), 0) / ${TRIEU_TO_TY} AS v FROM khsx ${khWhere}`,
        wkParams
      );
      const v = Number(wk.rows[0]?.v) || 0;
      if (v > 0) weeklyKhFallback = Number(v.toFixed(2));
    }

    const khsxPayload = {
      totalKh: Number(totalKh.toFixed(2)),
      totalTh: Number(totalTh.toFixed(2)),
      totalThPlan: Number(totalThPlan.toFixed(2)),
      completionRate: Number(completionRate.toFixed(1)),
      ...(weeklyKhFallback !== undefined ? { weeklyKhFallback } : {}),
      byXuong,
      byCongTrinh,
    };
    khsxNhapKhoCache.set(khsxCacheKey, { versions: khsxVersions, payload: khsxPayload });
    trimCache(khsxNhapKhoCache);
    res.json(khsxPayload);
  } catch (error) {
    console.error('Lỗi khsx-nhapkho/summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
