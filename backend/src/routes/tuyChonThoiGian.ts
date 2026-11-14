import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { app } from '../server/app.js';

// Danh sách ngày / năm-tháng-tuần cho bộ lọc Tổng quan, thay việc tải nguyên bảng dht, tkbv_full, pthsp_full, khsx về
// trình duyệt chỉ để gom giá trị. Trả giá trị thô như cột trong bảng, trình duyệt định dạng và sắp xếp như cũ.
const cache = createCache<unknown>(1);
const VERSION_KEYS = ['order', 'tkbv', 'pthsp', 'inventory', 'khsx'];

const SQL = `
  SELECT 'ngay' AS loai, v::text FROM (
    SELECT ngay_nhan_tu_pm AS v FROM dht
    UNION SELECT ngay_nhan FROM tkbv_full
    UNION SELECT ngay_hoan_thanh FROM pthsp_full
    UNION SELECT "date" FROM nhap_kho
  ) a WHERE v IS NOT NULL
  UNION ALL SELECT DISTINCT 'nam', nam::text FROM khsx WHERE nam IS NOT NULL
  UNION ALL SELECT DISTINCT 'thang', thang::text FROM khsx WHERE thang IS NOT NULL
  UNION ALL SELECT DISTINCT 'ngayKhsx', ngay::text FROM khsx WHERE ngay IS NOT NULL
  UNION ALL SELECT DISTINCT 'tuan', tuan::text FROM khsx WHERE tuan IS NOT NULL
`;

app.get('/api/overview/tuy-chon-thoi-gian', async (_req: Request, res: Response) => {
  try {
    // Không tham số, không theo người dùng / quyền, không dùng bảng tên công trình => lưu thêm bản dùng chung mọi
    // instance (khoá = đường dẫn, hợp lệ theo phiên bản 5 bảng nguồn) và không gắn phiên bản bảng tên vào khoá.
    const payload = await cachedByVersions(cache, 'tat-ca', VERSION_KEYS, async () => {
      const r = await timedQuery<{ loai: string; v: string }>(SQL, [], { timeoutMs: 15000, workMemMb: 32 });
      const lay = (loai: string) => r.rows.filter(x => x.loai === loai).map(x => x.v);
      return { ngay: lay('ngay'), khsx: { nam: lay('nam'), thang: lay('thang'), ngay: lay('ngayKhsx'), tuan: lay('tuan') } };
    }, '', '/api/overview/tuy-chon-thoi-gian', false);
    res.json(payload);
  } catch (error) {
    console.error('Lỗi overview/tuy-chon-thoi-gian:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
