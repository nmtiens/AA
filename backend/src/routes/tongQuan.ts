import type { Request, Response } from 'express';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { z } from 'zod';
import { app } from '../server/app.js';
import { cronAuth } from '../vuongMacPush.js';
import { getVersions, getTablesData } from '../server/data.js';
import { layPlanMet } from './data.js';
import { docSnapshot, luuSnapshot, guiGzip } from '../server/snapshot.js';
import { dangKyLamNong } from '../server/lamNong.js';
import { verBang, tuCot } from '../server/goiBang.js';
import { ensureProjectAliases, listProjectAliases, projectAliasesVersion } from '../server/projectAlias.js';
import { ensureWorkshopGroups, getWorkshopMapping, workshopGroupsVersion } from '../server/workshopGroups.js';
import {
  tinhTongQuanSanXuat, DEFAULT_FILTERS, TUY_CHON_MAC_DINH, canonicalizeProjectNames, canonicalizePersonNames,
  setServerProjectAliases, canonicalizeWorkshops, applyWorkshopMapping, cotTuDuLieu, setPlanMet, taoBanGhi, nenBanGhi,
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
  // Mảnh riêng bảng sản xuất (server/goiBang.ts — mảng dòng, làm nóng sau ETL) trước
  for (const khoaManh of ['bangc:production|1', 'bang:production|1']) {
    const manh = await docSnapshot(khoaManh, verBang(verSanXuat), { v: '' });
    if (!manh) continue;
    try {
      const rows = tuCot(JSON.parse(gunzipSync(manh).toString('utf8')));
      if (rows) return rows;
    } catch { /* bản nén hỏng: thử bản khác */ }
  }
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
    // Như App.tsx (canonicalProductionBase): tên công trình -> tên người (PM / PC) -> gộp xưởng
    const rows = canonicalizeWorkshops(canonicalizePersonNames(canonicalizeProjectNames(tho, cols), cols), cols);
    const bang: BangChuan = { ver, rows, cols };
    chuan = bang;
    return bang;
  })().finally(() => { if (chuanDang?.ver === ver) chuanDang = null; });
  chuanDang = { ver, p };
  return p;
}

// ----------------------------------------------------------------------------
// Dựng (hoặc lấy lại) kết quả gzip — dùng chung cho route và lệnh hẹn giờ dựng sẵn. Cùng khoá đang dựng thì chờ chung.
// ----------------------------------------------------------------------------
const dangDung = new Map<string, Promise<{ buf: Buffer; nguon: string; timing: string }>>();

async function phienBanChuan() {
  await Promise.all([ensureProjectAliases(), ensureWorkshopGroups()]);
  const versions = await getVersions();
  const verSanXuat = versions.production ?? '';
  const verChuan = JSON.stringify([verSanXuat, projectAliasesVersion(), workshopGroupsVersion()]);
  return { versions, verSanXuat, verChuan };
}

const nhoKetQua = (k: string, buf: Buffer) => {
  ketQuaNho.set(k, buf);
  while (ketQuaNho.size > KET_QUA_NHO_MAX) {
    const cu = ketQuaNho.keys().next().value;
    if (cu === undefined) break;
    ketQuaNho.delete(cu);
  }
};

/** Lấy từ bộ nhớ / bản lưu (luuDb) hoặc dựng mới; luuDb = lưu all_data_snapshot dùng chung mọi phiên bản hàm */
function layHoacDung(khoa: string, ver: string, luuDb: boolean, dung: () => Promise<{ buf: Buffer; timing: string }>) {
  const k = `${khoa}|${ver}`;
  const nho = ketQuaNho.get(k);
  if (nho) return Promise.resolve({ buf: nho, nguon: 'mem', timing: '' });
  let p = dangDung.get(k);
  if (!p) {
    p = (async () => {
      if (luuDb) {
        const nguon = { v: '' };
        const buf = await docSnapshot(khoa, ver, nguon);
        if (buf) { nhoKetQua(k, buf); return { buf, nguon: nguon.v, timing: '' }; }
      }
      const { buf, timing } = await dung();
      nhoKetQua(k, buf);
      if (luuDb) await luuSnapshot(khoa, ver, buf);
      return { buf, nguon: 'tinh', timing };
    })().finally(() => dangDung.delete(k));
    dangDung.set(k, p);
  }
  return p;
}

/** Màn đầu Tổng quan theo bộ lọc + nút (bộ lọc mặc định mới lưu DB) */
async function tongQuanSanXuat(filters: DashboardFiltersState, tuy: TuyChonTongQuan) {
  const { verSanXuat, verChuan } = await phienBanChuan();
  const khoa = `tongquan|${createHash('sha1').update(JSON.stringify([filters, tuy])).digest('hex').slice(0, 20)}`;
  const macDinh = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);
  return layHoacDung(khoa, verChuan, macDinh, async () => {
    const tDoc = Date.now();
    const { rows, cols } = await sanXuatChuan(verChuan, verSanXuat);
    const tTinh = Date.now();
    const kq = tinhTongQuanSanXuat(rows, cols, filters, tuy);
    const buf = gzipSync(JSON.stringify({ success: true, ver: verChuan, ...kq }));
    return { buf, timing: `bang;dur=${tTinh - tDoc}, tinh;dur=${Date.now() - tTinh}` };
  });
}

/** Bản ghi gọn Tổng quan công trình (không phụ thuộc bộ lọc — 1 bản / phiên bản dữ liệu, luôn lưu DB) */
async function tongQuanCongTrinh() {
  const { versions, verSanXuat, verChuan } = await phienBanChuan();
  const ver = JSON.stringify([verChuan, versions.inventory ?? '']);
  return layHoacDung('tongquan-congtrinh', ver, true, async () => {
    const tDoc = Date.now();
    const [{ rows, cols }, planMet] = await Promise.all([sanXuatChuan(verChuan, verSanXuat), layPlanMet()]);
    const tTinh = Date.now();
    // Hạn bỏ qua KH tuần / tháng đã đạt — như trình duyệt (setPlanMet từ /api/production/plan-met)
    setPlanMet(planMet);
    const banGhi = nenBanGhi(taoBanGhi(rows, cols, Date.now()));
    const buf = gzipSync(JSON.stringify({ success: true, ver, banGhi }));
    return { buf, timing: `bang;dur=${tTinh - tDoc}, tinh;dur=${Date.now() - tTinh}` };
  });
}

app.post('/api/tong-quan/san-xuat', async (req: Request, res: Response) => {
  try {
    const parsed = BodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Bộ lọc không hợp lệ' });
    const t0 = Date.now();
    const { buf, nguon, timing } = await tongQuanSanXuat(
      { ...DEFAULT_FILTERS, ...parsed.data.filters }, { ...TUY_CHON_MAC_DINH, ...parsed.data.tuyChon });
    guiGzip(res, buf, `tq;desc="${nguon}";dur=${Date.now() - t0}${timing ? `, ${timing}` : ''}`);
  } catch (e) {
    console.error('[tong-quan] lỗi', e);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Không tính được số liệu Tổng quan' });
  }
});

// ============================================================================
// GET /api/tong-quan/cong-trinh — BẢN GHI GỌN "TỔNG QUAN CÔNG TRÌNH" dựng sẵn (frontend/components/Construction/core/
// banGhiCongTrinh.ts: taoBanGhi + nenBanGhi) cho trình duyệt CHƯA có bảng sản xuất: mọi bảng / biểu đồ / bộ lọc của
// trang tính từ bản ghi nên hiện và lọc được ngay; bảng sản xuất tải ngầm cho danh sách HEX / cửa sổ công trình.
// Không phụ thuộc bộ lọc => 1 bản / phiên bản dữ liệu (sản xuất + nhập kho cho "KH đã đạt" + bảng tên + gộp xưởng),
// lưu all_data_snapshot dùng chung mọi phiên bản hàm.
// ============================================================================
app.get('/api/tong-quan/cong-trinh', async (_req: Request, res: Response) => {
  try {
    const t0 = Date.now();
    const { buf, nguon, timing } = await tongQuanCongTrinh();
    guiGzip(res, buf, `tqct;desc="${nguon}";dur=${Date.now() - t0}${timing ? `, ${timing}` : ''}`);
  } catch (e) {
    console.error('[tong-quan/cong-trinh] lỗi', e);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Không dựng được số liệu công trình' });
  }
});

// ============================================================================
// GET /api/cron/tong-quan — DỰNG SẴN SAU ETL: lệnh hẹn giờ (cron ngoài, vài phút / lần, header Authorization:
// Bearer CRON_SECRET) gọi; dữ liệu đổi thì dựng + lưu ngay màn đầu Tổng quan (bộ lọc mặc định, nút mặc định và
// nút Hạng mục) + bản ghi Tổng quan công trình, để cả người ĐẦU TIÊN sau ETL cũng không phải chờ. Chưa đổi thì chỉ
// kiểm tra phiên bản rồi trả "mem" / "db" (rất nhẹ).
// ============================================================================
// Tự làm nóng sau ETL (server/lamNong.ts, kích từ /api/check-versions): cùng các bản như lệnh hẹn giờ dưới
dangKyLamNong('tong-quan-cong-trinh', tongQuanCongTrinh);
dangKyLamNong('tong-quan', () => tongQuanSanXuat(DEFAULT_FILTERS, TUY_CHON_MAC_DINH));
dangKyLamNong('tong-quan-hang-muc', () => tongQuanSanXuat(DEFAULT_FILTERS, { ...TUY_CHON_MAC_DINH, workshopMetric: 'COUNT_HEX' }));

app.get('/api/cron/tong-quan', cronAuth, async (_req: Request, res: Response) => {
  const t0 = Date.now();
  const ketQua: Record<string, string> = {};
  const chay = async (ten: string, f: () => Promise<{ nguon: string }>) => {
    const t = Date.now();
    try { ketQua[ten] = `${(await f()).nguon} ${Date.now() - t}ms`; } catch (e) { ketQua[ten] = 'lỗi'; console.error(`[cron/tong-quan] ${ten}`, e); }
  };
  // Lần lượt (không dồn tải DB): công trình trước (nặng nhất — KH đã đạt + bảng sản xuất)
  await chay('cong-trinh', tongQuanCongTrinh);
  await chay('tong-quan', () => tongQuanSanXuat(DEFAULT_FILTERS, TUY_CHON_MAC_DINH));
  await chay('tong-quan-hang-muc', () => tongQuanSanXuat(DEFAULT_FILTERS, { ...TUY_CHON_MAC_DINH, workshopMetric: 'COUNT_HEX' }));
  res.json({ ok: true, ketQua, ms: Date.now() - t0 });
});
