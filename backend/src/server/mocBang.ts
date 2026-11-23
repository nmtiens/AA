import { timedQuery } from '../db.js';

// ============================================================================
// MỐC THAY ĐỔI của các bảng KHÔNG có trong table_versions (BOT, KHNK, BOM, biên bản họp, danh mục vật liệu…) — để
// trình duyệt biết có dữ liệu mới và tự làm mới trang đang xem (người dùng 23/11/2026).
// Đọc bộ đếm dòng ghi của Postgres (pg_stat_user_tables: thêm + sửa + xoá): 1 câu rất nhẹ, không quét bảng, không cần
// tool nạp nào ghi thêm gì, bảng chưa tạo thì tự bỏ qua. Bộ đếm chỉ tăng khi có ghi thật; đặt lại (DB khởi động lại
// bất thường) thì trình duyệt làm mới thừa 1 lần, không sai số.
// ============================================================================
/** nhóm (trình duyệt dùng) -> các bảng */
export const NHOM_MOC: Record<string, string[]> = {
  bot: ['bot_tong_hop', 'cong_trinh_hang_muc', 'bot_tong_hop_file'],
  botCongDoan: ['bot_cong_doan', 'bot_cong_doan_setup'],   // người dùng gõ từng ô: tách riêng để không gọi lại cả trang BOT
  khnk: ['khnk_sheet'],
  bom: ['bop_m2_hex', 'bop_m2_vat_lieu', 'bop_m2_file'],
  tonKhoVt: ['ton_kho_vt'],
  tieuHao: ['xuat_tieu_hao_vt', 'xuat_tieu_hao_vt_gop'],
  nhanVt: ['vat_tu_nhan_ls'],
  banVt: ['ban_vt_ton', 'ban_vt_master', 'ban_vt_anh', 'ban_vt_thong_tin'],
  nhapKhoSap: ['nhap_kho_sap'],
  hoSo: ['bien_ban_hop', 'cong_trinh_tai_lieu', 'ct_vl', 'ct_vl_anh_dong', 'ct_vl_file'],
  vuongMac: ['vuong_mac', 'vuong_mac_log'],
};

/** Gộp dòng (bảng, số lần ghi) thành mốc theo nhóm. Nhóm không có bảng nào thì không có khoá. Hàm thuần. */
export const gopMoc = (rows: { t: string; n: string | number }[]): Record<string, string> => {
  const dem = new Map(rows.map(r => [r.t, String(r.n)]));
  const ra: Record<string, string> = {};
  for (const [nhom, bang] of Object.entries(NHOM_MOC)) {
    const co = bang.filter(b => dem.has(b));
    if (co.length) ra[nhom] = co.map(b => dem.get(b)).join('.');
  }
  return ra;
};

const NHO_MS = 3000;
let nho: { luc: number; kq: Record<string, string> } | null = null;
let dang: Promise<Record<string, string>> | null = null;

/** Lỗi thì trả {} (trình duyệt coi như không biết, không làm mới) — không làm hỏng check-versions */
export function layMocBang(): Promise<Record<string, string>> {
  if (nho && Date.now() - nho.luc < NHO_MS) return Promise.resolve(nho.kq);
  dang ??= (async () => {
    try {
      const ds = Object.values(NHOM_MOC).flat().map(b => `'${b}'`).join(', ');   // tên bảng là hằng trong code
      const r = await timedQuery<{ t: string; n: string }>(
        `SELECT relname AS t, (n_tup_ins + n_tup_upd + n_tup_del)::text AS n FROM pg_stat_user_tables
          WHERE schemaname = 'public' AND relname IN (${ds})`);
      const kq = gopMoc(r.rows);
      nho = { luc: Date.now(), kq };
      return kq;
    } catch (e) {
      console.error('[moc-bang]', e);
      return {};
    }
  })().finally(() => { dang = null; });
  return dang;
}
