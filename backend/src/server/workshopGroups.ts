import { timedQuery } from '../db.js';
import { giuHamSong } from './sharedCache.js';

// ============================================================================
// GỘP XƯỞNG (khu vực sản xuất)
// Ngoài các xưởng chính, dữ liệu còn nhiều mã xưởng nhỏ phát sinh (X.ĐB, ABC, VÁN SÀN, OTHERS…).
// ADMIN setup "mã gốc -> xưởng gộp" ở bảng workshop_group_mapping (trang Setup gộp xưởng).
// Mọi nơi chia / lọc theo xưởng dùng chung:
//   - workshopGroupSql(col): biểu thức SQL trả về TÊN XƯỞNG ĐÃ GỘP (để GROUP BY / hiển thị)
//   - expandWorkshops(list): xưởng (đã gộp) được chọn -> mọi mã gốc thuộc xưởng đó (để lọc)
// Mã không có trong bảng giữ nguyên (viết hoa, bỏ khoảng trắng thừa 2 đầu).
// ============================================================================

const REFRESH_MS = 5 * 60 * 1000;

export const normWorkshop = (v: unknown): string => String(v ?? '').trim().toUpperCase();

let rawToGroup = new Map<string, string>();
let version = '0';
let loadedAt = 0;
let loading: Promise<void> | null = null;

const load = async () => {
  try {
    const r = await timedQuery(
      `SELECT xuong_raw, xuong_group, updated_at FROM workshop_group_mapping`
    );
    const m = new Map<string, string>();
    let latest = 0;
    for (const row of r.rows as { xuong_raw: string; xuong_group: string; updated_at: Date | null }[]) {
      const raw = normWorkshop(row.xuong_raw);
      const group = normWorkshop(row.xuong_group);
      if (raw && group && raw !== group) m.set(raw, group);
      if (row.updated_at) latest = Math.max(latest, new Date(row.updated_at).getTime());
    }
    rawToGroup = m;
    version = `${m.size}-${latest}`;
  } catch (err: any) {
    // Lỗi tạm thời: giữ bản đang có, thử lại sau 1 phút. Chỉ chưa tạo bảng (42P01) mới coi là không gộp
    if (err?.code !== '42P01') {
      console.error('Lỗi nạp setup gộp xưởng:', err);
      loadedAt = Date.now() - Math.max(0, REFRESH_MS - 60_000);
      return;
    }
    rawToGroup = new Map();
    version = '0';
  }
  loadedAt = Date.now();
};

// Bản đang có cũ hơn mức này thì CHỜ nạp lại như trước (instance Vercel ngủ lâu rồi thức dậy không dùng setup quá cũ)
const CHO_NAP_SAU_MS = 30 * 60 * 1000;
/** 'khong' = còn mới; 'nen' = dùng bản đang có, nạp lại ở nền; 'cho' = phải chờ nạp xong. Hàm thuần. */
export const cachLamMoi = (force: boolean, daNapLuc: number, now: number, nenDuoc = true): 'khong' | 'nen' | 'cho' => {
  if (force || daNapLuc === 0) return 'cho';
  const tuoi = now - daNapLuc;
  if (tuoi < REFRESH_MS) return 'khong';
  return nenDuoc && tuoi < CHO_NAP_SAU_MS ? 'nen' : 'cho';
};

/**
 * Nạp / làm mới setup (tối đa 5 phút 1 lần; force = ngay sau khi lưu).
 * Chưa nạp lần nào, force, hoặc bản đang có quá 30 phút: CHỜ nạp xong. Còn lại (5–30 phút) làm mới ở NỀN, request dùng
 * ngay bản đang có — trước cứ 5 phút lại có 1 request phải chờ 1 truy vấn trước khi vào route. An toàn: setup đổi ở
 * instance khác chỉ trễ thêm 1 request (vốn đã trễ tới 5 phút), khoá cache có workshopGroupsVersion nên kết quả tính
 * theo bản cũ không bị giữ; lưu setup ở chính instance này vẫn force nạp ngay. Lượt nạp nền được đăng ký waitUntil
 * (Vercel không đóng băng giữa truy vấn); trên Vercel mà không đăng ký được thì chờ như cũ.
 * `nenDuoc` (mặc định false): CHỈ middleware chung truyền true. Route tự gọi `await ensureWorkshopGroups()` (vd. kiểm
 * xưởng được nhập ở đường GHI BOT công đoạn, báo cáo Xưởng) vẫn CHỜ bản mới khi quá 5 phút, đúng như trước.
 */
export const ensureWorkshopGroups = async (force = false, nenDuoc = false): Promise<void> => {
  const cach = cachLamMoi(force, loadedAt, Date.now(), nenDuoc);
  if (cach === 'khong') return;
  // Vừa lưu setup (force): lượt nạp đang chạy có thể đã đọc TRƯỚC khi lưu (nay middleware kích nạp nền ngay đầu chính
  // request lưu) => chờ nó xong rồi nạp lượt MỚI, không nhận bản cũ rồi giữ thêm 5 phút. load() không ném lỗi.
  if (force && loading) await loading;
  if (!loading) loading = load().finally(() => { loading = null; });
  if (cach === 'cho') { await loading; return; }
  if (!giuHamSong(loading) && process.env.VERCEL) await loading;
};

/** Khoá phiên bản setup — đưa vào khoá cache của các API có chia / lọc theo xưởng. */
export const workshopGroupsVersion = (): string => version;

export const getWorkshopMapping = (): Record<string, string> => Object.fromEntries(rawToGroup);

/** Tên xưởng đã gộp của 1 mã gốc. */
export const workshopGroupOf = (raw: unknown): string => {
  const n = normWorkshop(raw);
  return rawToGroup.get(n) ?? n;
};

const sqlLit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Biểu thức SQL: tên xưởng đã gộp (viết hoa) của cột colExpr. */
export const workshopGroupSql = (colExpr: string): string => {
  const base = `UPPER(TRIM(COALESCE(${colExpr}::text, '')))`;
  if (rawToGroup.size === 0) return base;
  const whens = [...rawToGroup.entries()].map(([raw, g]) => `WHEN ${sqlLit(raw)} THEN ${sqlLit(g)}`).join(' ');
  return `(CASE ${base} ${whens} ELSE ${base} END)`;
};

/** Điều kiện SQL: cột xưởng thuộc (các) xưởng đã gộp được chọn. Đẩy tham số vào params. */
export const workshopCondition = (colExpr: string, selected: string | string[], params: any[]): string => {
  params.push(expandWorkshops(Array.isArray(selected) ? selected : [selected]));
  return `UPPER(TRIM(COALESCE(${colExpr}::text, ''))) = ANY($${params.length}::text[])`;
};

/** Danh sách xưởng (đã gộp) -> mọi mã gốc thuộc các xưởng đó (viết hoa), dùng cho điều kiện lọc. */
export const expandWorkshops = (list: string[]): string[] => {
  const want = new Set(list.map(normWorkshop).filter(Boolean));
  if (want.size === 0) return [];
  const out = new Set<string>();
  want.forEach(g => out.add(g));
  rawToGroup.forEach((g, raw) => { if (want.has(g)) out.add(raw); });
  return [...out].sort();
};
