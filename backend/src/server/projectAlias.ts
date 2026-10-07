import { timedQuery } from '../db.js';

// ============================================================================
// TÊN CÔNG TRÌNH GIỮA CÁC BẢNG
// Cùng 1 công trình được ghi nhiều cách: production_status_app có thể có vài cách viết cho 1 mã,
// còn nhap_kho / xuat_kho / dht / tkbv / pthsp / khsx / ton_kho… lại ghi tên riêng
// (vd. "CHAIRLADY CT23-018" vs "CHAIRLADY_CT23-018"). nhap_kho.ma_cong_trinh luôn trống nên
// không lọc theo mã được.
// => Dựng bảng: mã công trình (theo production) -> mọi cách viết tên, gom qua HEX của các bảng.
// Khi lọc theo tên công trình, mở rộng tên được chọn thành mọi cách viết của cùng mã rồi so
// khớp không phân biệt hoa/thường và khoảng trắng (normName / normNameSql).
// ============================================================================

const REFRESH_MS = 10 * 60 * 1000;

/** Chuẩn hoá tên phía Node: bỏ khoảng trắng thừa, viết hoa. */
export const normName = (v: unknown): string => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
/** Chuẩn hoá tên phía SQL — khớp với normName. */
export const normNameSql = (colExpr: string): string =>
  `UPPER(REGEXP_REPLACE(TRIM(COALESCE(${colExpr}::text, '')), '\\s+', ' ', 'g'))`;

/**
 * Tách danh sách tên trong query string. Tên công trình có thể chứa dấu phẩy
 * ("VILLA TULIP 3-HTNT_FITOUT, BUILTIN, LOOSE_CT26-056") nên client gửi ngăn bằng "|";
 * client cũ (ngăn bằng ",") vẫn đọc được.
 */
export const parseNameList = (raw: unknown): string[] => {
  const s = String(raw ?? '');
  if (!s) return [];
  return s.split(s.includes('|') ? '|' : ',').map(normName).filter(Boolean);
};

// Bảng tham chiếu (từng bảng có cột hex + ten_cong_trinh). Bảng không tồn tại thì bỏ qua.
const NAME_SOURCES = ['nhap_kho', 'xuat_kho', 'dht', 'tkbv_full', 'pthsp_full', 'khsx', 'phan_tich_kh_th', 'ton_kho'];

let nameToCodes = new Map<string, Set<string>>();
let codeToNames = new Map<string, Set<string>>();
let loadedAt = 0;
let loading: Promise<void> | null = null;

const load = async () => {
  const exist = await timedQuery(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name IN ('hex', 'ten_cong_trinh') AND table_name = ANY($1::text[])
     GROUP BY table_name HAVING COUNT(DISTINCT column_name) = 2`,
    [NAME_SOURCES]
  );
  const tables: string[] = exist.rows.map((r: { table_name: string }) => r.table_name);
  const parts = [
    `SELECT code, ${normNameSql('ten_cong_trinh')} AS name FROM production_status_app p
       CROSS JOIN LATERAL (SELECT UPPER(TRIM(p.ma_cong_trinh)) AS code) c`,
    ...tables.map(t =>
      `SELECT pc.code, ${normNameSql('t.ten_cong_trinh')} AS name
       FROM (SELECT DISTINCT hex::text AS hex, ten_cong_trinh FROM "${t}" WHERE hex IS NOT NULL AND ten_cong_trinh IS NOT NULL) t
       JOIN pc ON pc.hex = t.hex`),
  ];
  const r = await timedQuery(
    `WITH pc AS (SELECT hex::text AS hex, UPPER(TRIM(ma_cong_trinh)) AS code FROM production_status_app
                 WHERE COALESCE(TRIM(ma_cong_trinh), '') <> '')
     SELECT code, ARRAY_AGG(DISTINCT name) AS names
     FROM (${parts.join('\nUNION\n')}) x
     WHERE COALESCE(code, '') <> '' AND name <> ''
     GROUP BY code`,
    [],
    { timeoutMs: 60000 }
  );
  const n2c = new Map<string, Set<string>>();
  const c2n = new Map<string, Set<string>>();
  for (const row of r.rows as { code: string; names: string[] }[]) {
    c2n.set(row.code, new Set(row.names));
    for (const n of row.names) {
      let s = n2c.get(n);
      if (!s) { s = new Set(); n2c.set(n, s); }
      s.add(row.code);
    }
  }
  nameToCodes = n2c;
  codeToNames = c2n;
  loadedAt = Date.now();
};

/** Nạp / làm mới bảng tên (tối đa 10 phút 1 lần). Lỗi thì giữ bảng cũ, không làm hỏng request. */
export const ensureProjectAliases = async (): Promise<void> => {
  if (Date.now() - loadedAt < REFRESH_MS) return;
  if (!loading) {
    loading = load()
      .catch(err => { console.error('Lỗi nạp bảng tên công trình:', err); loadedAt = Date.now() - REFRESH_MS + 60_000; })
      .finally(() => { loading = null; });
  }
  await loading;
};

/**
 * Mở rộng danh sách tên công trình (đã chuẩn hoá) thành mọi cách viết của cùng mã công trình.
 * Tên không có trong bảng thì giữ nguyên. Kết quả đã chuẩn hoá, sắp xếp (dùng được làm khoá cache).
 */
export const expandProjectNames = (names: string[]): string[] => {
  const out = new Set<string>();
  for (const raw of names) {
    const n = normName(raw);
    if (!n) continue;
    out.add(n);
    nameToCodes.get(n)?.forEach(code => codeToNames.get(code)?.forEach(v => out.add(v)));
  }
  return [...out].sort();
};
