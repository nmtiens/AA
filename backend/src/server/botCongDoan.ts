// BOT THEO CÔNG ĐOẠN — phần thuần (không DB) của routes/botCongDoan.ts, để test.

/** Các công đoạn có cột BOT (thứ tự BOP — frontend/utils/productionMetrics.BOP_STAGE_ORDER) */
export const CONG_DOAN = ['P001', 'P002', 'P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021', 'P022', 'P025'] as const;
export type CongDoan = typeof CONG_DOAN[number];
export const laCongDoan = (x: unknown): x is CongDoan => typeof x === 'string' && (CONG_DOAN as readonly string[]).includes(x);

export interface SetupBot {
  /** công đoạn -> các bộ phận (users.department) được nhập */
  congDoan: Partial<Record<CongDoan, string[]>>;
  /** bộ phận -> các xưởng (đã gộp) mà bộ phận đó được nhập; không có / rỗng = mọi xưởng */
  xuongCua: Record<string, string[]>;
}
export const SETUP_RONG: SetupBot = { congDoan: {}, xuongCua: {} };

/** So bộ phận / xưởng không phân biệt hoa thường, khoảng trắng thừa */
export const chuanTen = (s: unknown) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();

/** Đọc setup từ JSON (bỏ khoá lạ, chuẩn hoá tên) */
export function docSetup(x: unknown): SetupBot {
  const ra: SetupBot = { congDoan: {}, xuongCua: {} };
  if (!x || typeof x !== 'object') return ra;
  const o = x as { congDoan?: unknown; xuongCua?: unknown };
  if (o.congDoan && typeof o.congDoan === 'object') {
    for (const [k, v] of Object.entries(o.congDoan as Record<string, unknown>)) {
      if (laCongDoan(k) && Array.isArray(v)) ra.congDoan[k] = [...new Set(v.map(chuanTen).filter(Boolean))];
    }
  }
  if (o.xuongCua && typeof o.xuongCua === 'object') {
    for (const [k, v] of Object.entries(o.xuongCua as Record<string, unknown>)) {
      const bp = chuanTen(k);
      if (bp && Array.isArray(v)) ra.xuongCua[bp] = [...new Set(v.map(chuanTen).filter(Boolean))];
    }
  }
  return ra;
}

export interface NguoiNhap { admin: boolean; boPhan: string | null }

/** Người nhập từ quyền đã nạp sẵn (permissions.UserAccess: role / is_active / department theo DB) — cho ĐƯỜNG ĐỌC.
 *  Tài khoản khoá: role của UserAccess rỗng => không admin, không công đoạn. */
export const nguoiTuQuyen = (a: { active: boolean; role: string; department: string | null }): NguoiNhap & { active: boolean } =>
  ({ admin: a.active && a.role === 'ADMIN', boPhan: a.department ?? null, active: a.active });

/** Khoá nhớ danh sách HEX thô của /bot-cong-doan/hex: mốc file công trình + phiên bản bảng sản xuất.
 *  null = không nhớ (chưa có bảng mốc file / chưa có phiên bản sản xuất — không chắc dữ liệu đứng yên). */
export const khoaNhoHex = (moc: { coBang: boolean; khoa: string }, verSanXuat: unknown): string | null =>
  (moc.coBang && verSanXuat != null && String(verSanXuat) !== '' ? `${moc.khoa}|${String(verSanXuat)}` : null);

/** Các công đoạn người này được nhập */
export function congDoanDuocNhap(nguoi: NguoiNhap, setup: SetupBot): CongDoan[] {
  if (nguoi.admin) return [...CONG_DOAN];
  const bp = chuanTen(nguoi.boPhan);
  if (!bp) return [];
  return CONG_DOAN.filter(c => (setup.congDoan[c] ?? []).includes(bp));
}

/** Xưởng người này được nhập; null = mọi xưởng */
export function xuongDuocNhap(nguoi: NguoiNhap, setup: SetupBot): string[] | null {
  if (nguoi.admin) return null;
  const ds = setup.xuongCua[chuanTen(nguoi.boPhan)];
  return ds && ds.length ? ds : null;
}

/** Lý do không được nhập 1 ô (null = được) */
export function lyDoCam(nguoi: NguoiNhap, setup: SetupBot, congDoan: string, xuongHex: string | null | undefined): string | null {
  if (!laCongDoan(congDoan)) return 'Công đoạn không có cột BOT';
  if (nguoi.admin) return null;
  if (!congDoanDuocNhap(nguoi, setup).includes(congDoan)) return `Bộ phận ${nguoi.boPhan || '(chưa có bộ phận)'} không được nhập ${congDoan}`;
  const xs = xuongDuocNhap(nguoi, setup);
  if (xs && !xs.includes(chuanTen(xuongHex))) return `HEX thuộc xưởng ${xuongHex || '(trống)'} — bộ phận chỉ nhập xưởng ${xs.join(', ')}`;
  return null;
}

/** 'YYYY-MM-DD' hợp lệ (ngày có thật, năm 2000–2100) hoặc null = xoá; undefined = sai dạng */
export function docNgay(x: unknown): string | null | undefined {
  if (x === null || x === '') return null;
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return undefined;
  const [y, m, d] = x.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return undefined;
  return x;
}
