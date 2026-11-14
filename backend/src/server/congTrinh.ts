// TỔNG QUAN CÔNG TRÌNH theo file công trình — phần thuần (không DB) của routes/congTrinh.ts, để test.
//
// Bảng cong_trinh_hang_muc (tool trên Drive nạp từ các file 05_PRODUCTION STATUS, cùng nguồn sheet TỔNG HỢP của
// MASTER_PROJECT_COORDINATION.xlsx). Trang đã có sẵn dòng production_status_app (dữ liệu app) trong máy, nên máy chủ chỉ gửi
// danh sách HEX của file + các ô file KHÁC dữ liệu app (gói nhỏ, ~0,5 MB thay vì ~18 MB cả bảng):
//   'f' file quyết định (tình trạng, BOP, IPO, xưởng): khác app (kể cả file trống) => gửi giá trị file
//   'g' file trước, trống thì giữ app (tên PM / PC, khu vực, nhóm SP...: file cũ thiếu cột)
//   'n' số file quyết định (lệch > 1e-6 tương đối mới tính là khác)
//   'd' ngày file quyết định, gửi 'YYYY-MM-DD'
// HEX có trong file mà app chưa có => mọi ô có giá trị đều khác => gửi đủ.

export type KieuCot = 'f' | 'g' | 'n' | 'd';

/** Cột ghép vào dòng của trang (tên = cột production_status_app cùng nghĩa = cột cong_trinh_hang_muc) */
export const COT_CT: ReadonlyArray<{ k: string; kieu: KieuCot }> = [
  { k: 'ma_cong_trinh', kieu: 'g' }, { k: 'ten_cong_trinh', kieu: 'g' }, { k: 'ten_hang_muc', kieu: 'g' },
  { k: 'tinh_trang_ipo', kieu: 'f' }, { k: 'tinh_trang', kieu: 'f' }, { k: 'bop', kieu: 'f' }, { k: 'xuong_chinh', kieu: 'f' },
  { k: 'phan_loai_nhom_san_pham', kieu: 'g' }, { k: 'khu_vuc', kieu: 'g' }, { k: 'khu_vuc_du_an', kieu: 'g' },
  { k: 'dvt', kieu: 'g' }, { k: 'ten_pm', kieu: 'g' }, { k: 'ten_pc', kieu: 'g' },
  ...[
    'so_luong_don_hang_tong', 'tri_gia_don_hang_tong', 'so_luong_tinh_phieu', 'thanh_tien_tinh_phieu',
    'so_luong_nhap_kho_luy_ke', 'thanh_tien_nhap_kho_luy_ke', 'so_luong_xuat_kho_luy_ke', 'thanh_tien_xuat_kho_luy_ke',
    'so_luong_ton_kho_hien_tai', 'thanh_tien_ton_kho_hien_tai', 'so_luong_con_lai', 'gia_tri_con_lai',
    'so_luong_don_hang_con_lai', 'gia_tri_don_hang_con_lai', 'sl_khnk_thang', 'gt_khnk_thang', 'sl_khnk_tuan', 'gt_khnk_tuan',
  ].map(k => ({ k, kieu: 'n' as const })),
  ...['ngay_khnk_thang', 'ngay_khnk_tuan', 'ngay_duyet_phieu'].map(k => ({ k, kieu: 'd' as const })),
];

const TEN_HOP_LE = /^[a-z0-9_]+$/;

/** Biểu thức SQL (jsonb hoặc NULL) cho 1 cột: [giá trị file] khi khác dữ liệu app. c = dòng file, p = dòng app.
 *  Cột file không có (c.ct_thieu — đổi tên / xoá cột) => NULL: giữ số app, không coi ô trống của file là số đúng. */
export function bieuThucKhac(k: string, kieu: KieuCot): string {
  if (!TEN_HOP_LE.test(k)) throw new Error(`Tên cột lạ: ${k}`);
  const bt = bieuThucKhacGoc(k, kieu);
  return kieu === 'g' ? bt : `CASE WHEN '${k}' = ANY(COALESCE(c.ct_thieu, '{}'::text[])) THEN NULL ELSE ${bt} END`;
}

function bieuThucKhacGoc(k: string, kieu: KieuCot): string {
  const c = `c.${k}`, p = `p.${k}`;
  switch (kieu) {
    case 'f': return `CASE WHEN ${c} IS DISTINCT FROM ${p}::text THEN jsonb_build_array(${c}) END`;
    case 'g': return `CASE WHEN NULLIF(${c}, '') IS NOT NULL AND ${c} IS DISTINCT FROM ${p}::text THEN jsonb_build_array(${c}) END`;
    case 'n': {
      // cột app có thể là chữ (thanh_tien_xuat_kho_luy_ke): chỉ đổi sang số khi đúng dạng số
      const pv = `(CASE WHEN ${p}::text ~ '^\\s*-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?\\s*$' THEN ${p}::text::float8 END)`;
      return `CASE WHEN (${c} IS NULL) <> (${pv} IS NULL) OR abs(${c} - ${pv}) > 1e-6 * greatest(1, abs(${c})) THEN jsonb_build_array(${c}) END`;
    }
    case 'd': {
      const cd = `to_char(${c}, 'YYYY-MM-DD')`;
      return `CASE WHEN ${cd} IS DISTINCT FROM left(${p}::text, 10) THEN jsonb_build_array(${cd}) END`;
    }
  }
}

/** Mỗi HEX 1 dòng (HEX chuyển công trình: HỦY ở file cũ, đang SX ở file mới => lấy dòng không HỦY) + ô khác app. */
export function sqlHangMuc(cot = COT_CT): string {
  const doi = cot.map(({ k, kieu }) => `'${k}', ${bieuThucKhac(k, kieu)}`).join(',\n      ');
  return `WITH c AS (
    SELECT DISTINCT ON (h.hex) h.*, f.ct_thieu
      FROM cong_trinh_hang_muc h LEFT JOIN bot_tong_hop_file f USING (nguon)
     WHERE h.hex IS NOT NULL AND h.hex <> ''
     ORDER BY h.hex, (COALESCE(h.tinh_trang_ipo, '') LIKE '04%'), h.nguon DESC, h.stt
  )
  SELECT c.hex, jsonb_strip_nulls(jsonb_build_object(
      ${doi}
    )) AS doi
    FROM c LEFT JOIN LATERAL (SELECT * FROM production_status_app p WHERE p.hex::text = c.hex LIMIT 1) p ON true
   ORDER BY c.hex`;
}

/** {cột: [giá trị]} của SQL => {cột: giá trị}; không ô nào khác => 0 (gói gọn) */
export function moDoi(doi: unknown): Record<string, unknown> | 0 {
  if (!doi || typeof doi !== 'object') return 0;
  const ra: Record<string, unknown> = {};
  let co = false;
  for (const [k, v] of Object.entries(doi as Record<string, unknown>)) {
    if (Array.isArray(v)) { ra[k] = v[0] ?? null; co = true; }
  }
  return co ? ra : 0;
}

/**
 * Giá trị nhớ có hạn + gộp các lần đọc đồng thời (1 câu DB cho mọi request tới cùng lúc). Hàm thuần (không DB) để test.
 * - `lay()`: còn hạn thì trả bản nhớ; hết hạn thì gọi `doc` (các lần gọi cùng lúc chờ chung 1 lượt). Lỗi KHÔNG được nhớ.
 * - `dat(v)`: gán bản mới (vd. ngay sau khi ghi DB); lượt đọc đang dở (có thể mang dữ liệu trước khi ghi) không được đè.
 * - `docMoi()`: bỏ qua bản nhớ, đọc lại rồi nhớ (đường cần số mới nhất).
 */
export function taoNhoCoHan<T>(hanMs: number, doc: () => Promise<T>, bayGio: () => number = Date.now) {
  let nho: { luc: number; v: T } | null = null;
  let dangDoc: Promise<T> | null = null;
  let luot = 0;
  const docMoi = (): Promise<T> => {
    if (dangDoc) return dangDoc;
    const l = luot;
    const p: Promise<T> = doc()
      .then(v => { if (l === luot) nho = { luc: bayGio(), v }; return v; })
      .finally(() => { if (dangDoc === p) dangDoc = null; });
    dangDoc = p;
    return p;
  };
  return {
    lay: (): Promise<T> => (nho && bayGio() - nho.luc < hanMs ? Promise.resolve(nho.v) : docMoi()),
    docMoi,
    dat: (v: T) => { luot++; dangDoc = null; nho = { luc: bayGio(), v }; },
    xoa: () => { luot++; dangDoc = null; nho = null; },
  };
}
