import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { TRIEU_TO_TY } from '../server/common.js';
import { numericCol, notCancelledHexCond } from '../server/data.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { app } from '../server/app.js';
import { parseNameList, expandProjectNames, normNameSql } from '../server/projectAlias.js';
import { workshopCondition, workshopGroupsVersion } from '../server/workshopGroups.js';

// ============================================================================
// KẾ HOẠCH NHẬP KHO THEO NGÀY — cột "Kế hoạch" cạnh cột nhập kho của biểu đồ "Nhập kho mỗi ngày" (trang Tổng quan).
//   Nguồn: KH TUẦN của bảng khsx — mỗi dòng có ngày kế hoạch nhập kho (ngay_khnk). KH tháng không có ngày nên không dùng.
//   Lọc xưởng (nhóm xưởng gộp) / công trình (mọi cách viết) như /api/khsx-nhapkho/summary; bỏ hạng mục HỦY. Đơn vị: TỶ.
//   GET /api/khsx/ke-hoach-ngay?tu=YYYY-MM-DD&den=YYYY-MM-DD[&xuong=4A,3A][&congTrinh=...]
//   => [{ ngay: 'YYYY-MM-DD', kh: số tỷ }] (chỉ ngày có KH)
// ============================================================================

const cache = createCache<unknown>(50);
const NGAY_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get('/api/khsx/ke-hoach-ngay', async (req: Request, res: Response) => {
  try {
    const { tu, den, xuong, congTrinh } = req.query as Record<string, string>;
    if (!NGAY_RE.test(tu ?? '') || !NGAY_RE.test(den ?? '')) return res.status(400).json({ error: 'tu / den phải dạng YYYY-MM-DD' });
    const payload = await cachedByVersions(cache, JSON.stringify({ tu, den, xuong, congTrinh }), ['khsx', 'production'], async () => {
      const params: unknown[] = [tu, den];
      let where = `UPPER(TRIM(phan_loai_kh)) LIKE '%TUẦN%' AND ngay_khnk BETWEEN $1::date AND $2::date AND ${notCancelledHexCond('hex')}`;
      const ctList = expandProjectNames(parseNameList(congTrinh));
      if (ctList.length) { params.push(ctList); where += ` AND ${normNameSql('ten_cong_trinh')} = ANY($${params.length}::text[])`; }
      const xuongList = String(xuong ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      if (xuongList.length) where += ` AND ${workshopCondition('xuong_chinh', xuongList, params)}`;
      const r = await timedQuery(
        `SELECT to_char(ngay_khnk, 'YYYY-MM-DD') AS ngay, COALESCE(SUM(${numericCol('khsx', 'thanh_tien_ke_hoach')}), 0) / ${TRIEU_TO_TY} AS kh
         FROM khsx WHERE ${where} GROUP BY 1 ORDER BY 1`, params, { workMemMb: 32 });
      return r.rows.map(x => ({ ngay: String(x.ngay), kh: Number(x.kh) || 0 }));
    }, workshopGroupsVersion());
    res.json(payload);
  } catch (error) {
    console.error('Lỗi khsx/ke-hoach-ngay:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
