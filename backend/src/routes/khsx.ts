import { parseNameList, expandProjectNames, normNameSql, canonicalProjectName } from '../server/projectAlias.js';
import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { TRIEU_TO_TY, isoWeekRangeInYear } from '../server/common.js';
import { numericCol, notCancelledHexCond } from '../server/data.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { app } from '../server/app.js';
import { workshopGroupSql, workshopCondition, workshopGroupsVersion } from '../server/workshopGroups.js';

// --- CACHE IN-MEMORY CHO /api/khsx-nhapkho/summary (theo phiên bản bảng, xem server/cache.ts) ---
const khsxNhapKhoCache = createCache<unknown>(50);
const KHSX_NHAPKHO_VERSION_KEYS = ['khsx', 'inventory', 'production'];

// [ĐO TIMING] Endpoint tổng hợp phức tạp — 2 query chính (khQuery, thQuery).
// Đơn vị trả ra: TỶ ĐỒNG (cả KH lẫn TH đều từ triệu -> tỷ, chia 1000).
app.get('/api/khsx-nhapkho/summary', async (req: Request, res: Response) => {
  try {
    const { nam, thang, mode = 'month', tuan, ngay, congTrinh, xuong } = req.query as Record<string, string>;
    if (!nam) return res.status(400).json({ error: 'Missing nam' });

    const khsxCacheKey = JSON.stringify({ nam, thang, mode, tuan, ngay, congTrinh, xuong });
    const khsxPayload = await cachedByVersions(khsxNhapKhoCache, khsxCacheKey, KHSX_NHAPKHO_VERSION_KEYS, async () => {
    const isWeek = mode === 'week';
    const phanLoaiPattern = isWeek ? '%TUẦN%' : '%THÁNG%';

    const normalize = (s: string) => s.trim().toUpperCase();
    // Bộ lọc thời gian cho chọn NHIỀU giá trị (ngăn bằng dấu phẩy) — trước chỉ lấy giá trị đầu
    const numList = (v?: string) => String(v ?? '').split(',').map(x => Number(x.trim())).filter(x => Number.isFinite(x) && x > 0);
    const thangList = numList(thang), tuanList = numList(tuan), ngayList = numList(ngay);
    // Xem theo TUẦN đã chọn tuần: không lọc thêm tháng (tuần giáp 2 tháng bị cắt mất 1 phần, tuần ngoài tháng = 0)
    const useThang = thangList.length > 0 && !(isWeek && tuanList.length > 0);
    // Mọi cách viết của công trình được chọn (xem server/projectAlias.ts)
    const congTrinhList = expandProjectNames(parseNameList(congTrinh));
    const xuongList = xuong ? xuong.split(',').map(normalize).filter(Boolean) : [];

    // ---------- KẾ HOẠCH (khsx) ----------
    const khParams: any[] = [phanLoaiPattern, nam];
    // Không tính hạng mục đã HỦY
    let khWhere = `WHERE UPPER(TRIM(phan_loai_kh)) LIKE $1 AND nam = $2::bigint AND ${notCancelledHexCond('hex')}`;
    if (useThang) { khParams.push(thangList); khWhere += ` AND thang = ANY($${khParams.length}::bigint[])`; }
    if (isWeek && tuanList.length) { khParams.push(tuanList); khWhere += ` AND tuan = ANY($${khParams.length}::double precision[])`; }
    if (isWeek && ngayList.length) { khParams.push(ngayList); khWhere += ` AND ngay = ANY($${khParams.length}::double precision[])`; }
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
    const khResult = await timedQuery(khQuery, khParams, { workMemMb: 32 });

    // ---------- THỰC HIỆN (nhap_kho) ----------
    const thParams: any[] = [nam];
    // Không tính hạng mục đã HỦY
    let thWhere = `WHERE nam = $1::bigint AND ${notCancelledHexCond('hex')}`;
    if (useThang) { thParams.push(thangList); thWhere += ` AND thang = ANY($${thParams.length}::bigint[])`; }
    // Tuần: lấy theo NGÀY của tuần ISO, cắt trong năm dương lịch — khớp cách bảng KHSX đánh số (29–31/12/2025 là
    // tuần 53 của 2025, 01–04/01/2026 là tuần 1 của 2026). Cột nhap_kho.tuan là tuần ISO thuần nên trước đó
    // 29–31/12 bị tính vào "tuần 1" của năm cũ, lệch với KH.
    // Khoảng ngày của từng tuần tính sẵn ở Node (common.isoWeekRangeInYear) rồi so bằng daterange[] —
    // trước gọi to_date(...) cho từng dòng nhập kho × từng tuần (~3s)
    if (isWeek && tuanList.length) {
      const ranges = tuanList
        .map(w => isoWeekRangeInYear(Number(nam), Math.trunc(w)))
        .filter((r): r is { start: string; end: string } => r !== null)
        .map(r => `[${r.start},${r.end}]`);
      if (ranges.length) { thParams.push(ranges); thWhere += ` AND date_parsed <@ ANY($${thParams.length}::daterange[])`; }
      else thWhere += ' AND FALSE';
    }
    if (isWeek && ngayList.length) { thParams.push(ngayList); thWhere += ` AND ngay = ANY($${thParams.length}::bigint[])`; }
    if (congTrinhList.length) { thParams.push(congTrinhList); thWhere += ` AND ${normNameSql('ten_cong_trinh')} = ANY($${thParams.length}::text[])`; }
    if (xuongList.length) thWhere += ` AND ${workshopCondition('xuong_chinh', xuongList, thParams)}`;

    // HEX có trong kế hoạch của CÙNG kỳ (KH tháng / KH tuần) — tách TH thành "nhập kho theo KH" và
    // "nhập kho ngoài KH"; tỷ lệ hoàn thành chỉ tính phần theo KH (trước cộng cả hạng mục không có KH
    // nên % trông gần đạt dù phần lớn nhập kho là hạng mục ngoài KH).
    thParams.push(phanLoaiPattern, nam);
    let planHexWhere = `UPPER(TRIM(phan_loai_kh)) LIKE $${thParams.length - 1} AND nam = $${thParams.length}::bigint AND hex IS NOT NULL`;
    if (useThang) { thParams.push(thangList); planHexWhere += ` AND thang = ANY($${thParams.length}::bigint[])`; }
    if (isWeek && tuanList.length) { thParams.push(tuanList); planHexWhere += ` AND tuan = ANY($${thParams.length}::double precision[])`; }
    if (isWeek && ngayList.length) { thParams.push(ngayList); planHexWhere += ` AND ngay = ANY($${thParams.length}::double precision[])`; }

    // Ghép nhập kho với KH của ĐÚNG kỳ của ngày nhập (tháng của dòng nhập kho / tuần chứa ngày nhập) — chọn nhiều
    // kỳ cùng lúc thì hạng mục có KH T8 mà nhập T9 không bị tính "theo KH" (trước lấy hợp HEX của mọi kỳ)
    // Tham số năm chỉ thêm khi xem theo tuần (tham số thừa => Postgres báo lỗi)
    if (isWeek) thParams.push(Number(nam));
    const yIdx = thParams.length;
    // Khoảng ngày của tuần KH tính 1 lần trong CTE plan_hex (ws..we, cắt trong năm) — trước to_date(...)
    // được tính lại cho mỗi cặp (dòng nhập kho, dòng KH) trong EXISTS
    const planHexCte = isWeek
      ? `plan_hex AS MATERIALIZED (
           SELECT hex, thang,
                  GREATEST(ws, make_date($${yIdx}::int, 1, 1)) AS ws,
                  LEAST(ws + 6, make_date($${yIdx}::int, 12, 31)) AS we
           FROM (SELECT DISTINCT hex::text AS hex, thang,
                        to_date(($${yIdx}::int)::text || '-' || tuan::int::text, 'IYYY-IW') AS ws
                 FROM khsx WHERE ${planHexWhere} AND tuan BETWEEN 1 AND 53) k)`
      : `plan_hex AS MATERIALIZED (SELECT DISTINCT hex::text AS hex, thang FROM khsx WHERE ${planHexWhere})`;
    const inPlanExpr = isWeek
      ? `EXISTS (SELECT 1 FROM plan_hex ph WHERE ph.hex = nhap_kho.hex::text AND nhap_kho.date_parsed BETWEEN ph.ws AND ph.we)`
      : `EXISTS (SELECT 1 FROM plan_hex ph WHERE ph.hex = nhap_kho.hex::text AND ph.thang = nhap_kho.thang)`;

    const thQuery = `
      WITH ${planHexCte}
      SELECT
        ${workshopGroupSql('xuong_chinh')} AS xuong,
        TRIM(ten_cong_trinh) AS cong_trinh,
        TRIM(ma_cong_trinh) AS ma_cong_trinh,
        (${inPlanExpr}) AS in_plan,
        COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0) / ${TRIEU_TO_TY} AS gia_tri
      FROM nhap_kho
      ${thWhere}
      GROUP BY 1, 2, 3, 4
    `;
    const thResult = await timedQuery(thQuery, thParams, { workMemMb: 32 });

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

    return {
      totalKh: Number(totalKh.toFixed(2)),
      totalTh: Number(totalTh.toFixed(2)),
      totalThPlan: Number(totalThPlan.toFixed(2)),
      completionRate: Number(completionRate.toFixed(1)),
      ...(weeklyKhFallback !== undefined ? { weeklyKhFallback } : {}),
      byXuong,
      byCongTrinh,
    };
    }, workshopGroupsVersion());
    res.json(khsxPayload);
  } catch (error) {
    console.error('Lỗi khsx-nhapkho/summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
