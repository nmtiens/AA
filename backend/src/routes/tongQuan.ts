import type { Request, Response } from 'express';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { z } from 'zod';
import { app } from '../server/app.js';
import { getVersions, getTablesData } from '../server/data.js';
import { docSnapshot, luuSnapshot, guiGzip } from '../server/snapshot.js';
import { ensureProjectAliases, listProjectAliases, projectAliasesVersion } from '../server/projectAlias.js';
import { ensureWorkshopGroups, getWorkshopMapping, workshopGroupsVersion } from '../server/workshopGroups.js';
import {
  tinhTongQuanSanXuat, DEFAULT_FILTERS, TUY_CHON_MAC_DINH, canonicalizeProjectNames, setServerProjectAliases,
  canonicalizeWorkshops, applyWorkshopMapping, cotTuDuLieu,
  type DashboardFiltersState, type TuyChonTongQuan,
} from '@tong-quan/core';

// ============================================================================
// POST /api/tong-quan/san-xuat — MÁY CHỦ TÍNH SẴN MÀN ĐẦU "TỔNG QUAN" (phễu, cơ cấu đơn hàng, thẻ, pivot, điểm
// nghẽn, bảng công trình, danh sách lựa chọn bộ lọc) cho trình duyệt CHƯA có bảng sản xuất (người mới / máy mới):
// trang hiện số ngay, bảng ~3 MB tải ngầm sau. Dùng ĐÚNG code tính của trình duyệt
// (frontend/components/Dashboard/core — bí danh '@tong-quan/core') nên số khớp.
// Cache: bộ nhớ theo (phiên bản bảng sản xuất, bảng tên, setup gộp xưởng, bộ lọc + nút); bộ lọc mặc định còn lưu
// vào all_data_snapshot (dùng chung mọi phiên bản hàm — màn đầu của người mới hầu như luôn là bộ lọc mặc định).
// ============================================================================

const dsChuoi = z.array(z.string().max(300)).max(3000);
const BodySchema = z.object({
  filters: z.object({
    congTrinh: dsChuoi, xuong: dsChuoi, tinhTrang: dsChuoi, tinhTrangIpo: dsChuoi,
    khachHang: dsChuoi, khuVucDuAn: dsChuoi, phanLoai: dsChuoi,
  }).partial().default({}),
  tuyChon: z.object({
    workshopMetric: z.enum(['SUM_GT_DON_HANG', 'SUM_GT_CON_LAI', 'COUNT_HEX']),
    projectMetric: z.enum(['SUM_GT_DON_HANG', 'SUM_GT_CON_LAI', 'COUNT_HEX']),
    projectSummaryMetric: z.enum(['VALUE', 'COUNT']),
    excludeFabrics: z.boolean(),
    bottleneckViewMode: z.enum(['BOP', 'TÌNH TRẠNG']),
  }).partial().default({}),
});

// Bảng sản xuất đã chuẩn hoá (tên công trình, gộp xưởng) như trình duyệt — 1 bản / phiên bản
interface BangChuan { ver: string; rows: Record<string, unknown>[]; cols: { key: string; label: string }[] }
let chuan: BangChuan | null = null;
let chuanDang: { ver: string; p: Promise<BangChuan> } | null = null;

const ketQuaNho = new Map<string, Buffer>();
const KET_QUA_NHO_MAX = 60;

/** Bảng sản xuất thô: ưu tiên bản nén của /api/all-data (đọc 1 khối, nhanh hơn truy vấn ~51 nghìn dòng) */
async function bangSanXuatTho(verSanXuat: string): Promise<Record<string, unknown>[]> {
  const ver = JSON.stringify([verSanXuat]);
  for (const khoa of ['production|0', 'production|1']) {
    const buf = await docSnapshot(khoa, ver, { v: '' });
    if (buf) {
      try {
        const rows = JSON.parse(gunzipSync(buf).toString('utf8')).production;
        if (Array.isArray(rows)) return rows;
      } catch { /* bản nén hỏng: đọc bảng */ }
    }
  }
  const { payload } = await getTablesData(['production']);
  return (payload.production ?? []) as Record<string, unknown>[];
}

async function sanXuatChuan(ver: string, verSanXuat: string): Promise<BangChuan> {
  if (chuan?.ver === ver) return chuan;
  if (chuanDang?.ver === ver) return chuanDang.p;
  const p = (async (): Promise<BangChuan> => {
    const tho = await bangSanXuatTho(verSanXuat);
    const cols = cotTuDuLieu(tho);
    setServerProjectAliases(listProjectAliases());
    applyWorkshopMapping(getWorkshopMapping());
    const rows = canonicalizeWorkshops(canonicalizeProjectNames(tho, cols), cols);
    const bang: BangChuan = { ver, rows, cols };
    chuan = bang;
    return bang;
  })().finally(() => { if (chuanDang?.ver === ver) chuanDang = null; });
  chuanDang = { ver, p };
  return p;
}

app.post('/api/tong-quan/san-xuat', async (req: Request, res: Response) => {
  try {
    const parsed = BodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Bộ lọc không hợp lệ' });
    const filters: DashboardFiltersState = { ...DEFAULT_FILTERS, ...parsed.data.filters };
    const tuy: TuyChonTongQuan = { ...TUY_CHON_MAC_DINH, ...parsed.data.tuyChon };

    const t0 = Date.now();
    await Promise.all([ensureProjectAliases(), ensureWorkshopGroups()]);
    const versions = await getVersions();
    const verSanXuat = versions.production ?? '';
    const ver = JSON.stringify([verSanXuat, projectAliasesVersion(), workshopGroupsVersion()]);
    const thamSo = JSON.stringify([filters, tuy]);
    const khoa = `tongquan|${createHash('sha1').update(thamSo).digest('hex').slice(0, 20)}`;
    const macDinh = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

    const nho = ketQuaNho.get(`${khoa}|${ver}`);
    if (nho) return guiGzip(res, nho, `tq;desc="mem";dur=${Date.now() - t0}`);
    if (macDinh) {
      const nguon = { v: '' };
      const buf = await docSnapshot(khoa, ver, nguon);
      if (buf) {
        ketQuaNho.set(`${khoa}|${ver}`, buf);
        return guiGzip(res, buf, `tq;desc="${nguon.v}";dur=${Date.now() - t0}`);
      }
    }

    const tDoc = Date.now();
    const { rows, cols } = await sanXuatChuan(ver, verSanXuat);
    const tTinh = Date.now();
    const kq = tinhTongQuanSanXuat(rows, cols, filters, tuy);
    const buf = gzipSync(JSON.stringify({ success: true, ver, ...kq }));
    ketQuaNho.set(`${khoa}|${ver}`, buf);
    while (ketQuaNho.size > KET_QUA_NHO_MAX) {
      const cu = ketQuaNho.keys().next().value;
      if (cu === undefined) break;
      ketQuaNho.delete(cu);
    }
    if (macDinh) await luuSnapshot(khoa, ver, buf);
    guiGzip(res, buf, `tq;desc="tinh";dur=${Date.now() - t0}, bang;dur=${tTinh - tDoc}, tinh;dur=${Date.now() - tTinh}`);
  } catch (e) {
    console.error('[tong-quan] lỗi', e);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Không tính được số liệu Tổng quan' });
  }
});
