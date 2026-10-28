import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';

// ============================================================================
// BOP-M2 — tình trạng vật liệu (M001…M008) của 1 công trình (tab BOM, cửa sổ công trình)
//   GET /api/bop-m2?ct=CT26-105   => { coBang, nguon, docLuc, maCt, hex[], vatLieu[] }  (cùng dạng DuLieuM2 ở
//                                   frontend/components/Construction/core/bopM2.ts)
// - Bảng bop_m2_hex / bop_m2_vat_lieu / bop_m2_file do backend/scripts/nap_bop_m2.py nạp từ file Excel của PC
//   (sheet 02_DATA + 03_MATERIALS). Chưa chạy SQL tạo bảng => coBang = false (giao diện cho chọn file thay thế).
// - Mỗi công trình vài chục–vài trăm dòng: đọc thẳng, không cache.
// ============================================================================

const MA_CT = /^CT\d{2}-\d{3}$/i;

app.get('/api/bop-m2', async (req: Request, res: Response) => {
  const ct = String(req.query.ct ?? '').trim().toUpperCase();
  if (!MA_CT.test(ct)) return res.status(400).json({ error: 'Thiếu / sai mã công trình (dạng CT26-105)' });
  try {
    const [f, h, v] = await Promise.all([
      timedQuery(`SELECT ten_file, to_char(nap_luc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS nap_luc
                    FROM bop_m2_file WHERE ma_ct = $1 AND loi IS NULL ORDER BY nap_luc DESC LIMIT 1`, [ct]),
      timedQuery(`SELECT hex, ma_nha_may, ten_hang_muc, nhom_sp, xuong, ipo, bop, m2, final
                    FROM bop_m2_hex WHERE ma_ct = $1 ORDER BY nhom_sp, hex`, [ct]),
      timedQuery(`SELECT nhom_vat_tu, code, mo_ta, tt_mau, ngay_duyet, nhu_cau, ghi_chu, tt_pr, ngay_pr, ngay_du_kien, ngay_ve, bop_m2
                    FROM bop_m2_vat_lieu WHERE ma_ct = $1 ORDER BY stt`, [ct]),
    ]);
    const s = (x: unknown) => (x === null || x === undefined ? '' : String(x));
    res.json({
      coBang: true,
      maCt: ct,
      nguon: s(f.rows[0]?.ten_file),
      docLuc: s(f.rows[0]?.nap_luc),
      hex: h.rows.map(r => ({
        hex: s(r.hex), maNm: s(r.ma_nha_may), hangMuc: s(r.ten_hang_muc), nhomSp: s(r.nhom_sp), xuong: s(r.xuong),
        ipo: s(r.ipo), bop: s(r.bop), m2: r.m2 ?? {}, final: s(r.final),
      })),
      vatLieu: v.rows.map(r => ({
        nhom: s(r.nhom_vat_tu), code: s(r.code), moTa: s(r.mo_ta), ttMau: s(r.tt_mau), ngayDuyet: s(r.ngay_duyet),
        nhuCau: s(r.nhu_cau), ghiChu: s(r.ghi_chu), ttPr: s(r.tt_pr), ngayPr: s(r.ngay_pr), ngayDuKien: s(r.ngay_du_kien),
        ngayVe: s(r.ngay_ve), m: s(r.bop_m2),
      })),
    });
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return res.json({ coBang: false, maCt: ct, hex: [], vatLieu: [] });
    console.error('[bop-m2]', e);
    res.status(500).json({ error: 'Không đọc được dữ liệu BOP-M2' });
  }
});
