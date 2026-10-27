import { numericExprQualified } from './data.js';

// ============================================================================
// DANH MỤC "HỎI SỐ LIỆU" (tự tra, không dùng AI): các bảng / cột người dùng được hỏi.
// Câu SQL chỉ được ghép từ biểu thức khai báo ở đây (không bao giờ từ chữ người dùng gõ) — giá trị lọc đi bằng
// tham số $n. Thêm bảng / cột mới = thêm 1 dòng vào danh mục, giao diện tự hiện (GET /api/hoi-dap/danh-muc).
// Bí danh bảng trong SQL luôn là `t`.
// ============================================================================

/** so: cộng / trung bình được · chu: chữ · ngay: ngày · ma: mã (HEX, PR…) · xuong: xưởng (gộp theo setup) ·
 *  ct: tên công trình (gộp mọi cách viết của cùng mã) */
export type KieuCot = 'so' | 'chu' | 'ngay' | 'ma' | 'xuong' | 'ct';

export interface Cot {
  id: string;
  ten: string;
  /** Cách gọi khác (giao diện bỏ dấu khi so) */
  dn?: string[];
  kieu: KieuCot;
  /** Biểu thức SQL (bí danh t). Không có => t."id" */
  sql?: string;
  /** Đơn vị triệu đồng (giao diện đổi ra tỷ) */
  tien?: boolean;
  /** Cần thêm quyền này mới thấy cột (vd. giá vật tư) */
  quyen?: string;
  /** Giá trị cố định (cột tính bằng CASE): gõ đúng chữ này trong câu = lọc theo nó ("quá hạn", "đã xử lý") */
  gt?: string[];
  /** Cột ít giá trị (tình trạng, khách hàng, nhóm…): máy chủ gửi danh sách giá trị để giao diện nhận ra khi câu
   *  chỉ nói giá trị ("ghế", "sun group", "chưa mua") mà không nói tên cột */
  tuDien?: boolean;
}

export interface Bang {
  id: string;
  ten: string;
  dn: string[];
  /** Có 1 trong các quyền là hỏi được (ADMIN luôn được) */
  quyen: string[];
  /** Cột ngày dùng cho kỳ "tuần này / tháng trước…" */
  ngay: string;
  /** Bảng chụp theo ngày (tồn kho): không chọn ngày => lấy ngày chốt mới nhất, không cộng dồn nhiều ngày */
  chot?: boolean;
  /** Có cột HEX nối được sang bảng sản xuất (1 HEX = 1 dòng): lọc / chia theo thông tin hạng mục ("nhập kho của
   *  khách hàng X", "xuất kho theo nhóm sản phẩm") — cột dạng "sx:<id cột bảng sản xuất>" */
  noiSx?: boolean;
  /** Bỏ hạng mục HỦY: 'hex' = so tập HEX hủy của bảng sản xuất, 'ipo' = chính bảng sản xuất */
  huy?: 'hex' | 'ipo';
  /** Khoá phiên bản bảng (cache theo ETL) — không có thì không cache */
  phienBan?: string;
  /** Tên 1 dòng khi đếm */
  dong: string;
  /** Cột hiện khi liệt kê dòng */
  hien: string[];
  /** Số cộng mặc định khi chỉ hỏi "bao nhiêu" */
  soChinh?: string;
  /** Phép tính mặc định khi câu không nói tính gì */
  mac: Array<{ ham: 'tong' | 'dem' | 'dem_khac' | 'tb'; cot?: string }>;
  cot: Cot[];
}

const so = (col: string) => numericExprQualified(`t."${col}"`);
const XUONG: Cot = { id: 'xuong_chinh', ten: 'Xưởng', dn: ['xưởng', 'xuong chinh'], kieu: 'xuong' };
const CT: Cot = { id: 'ten_cong_trinh', ten: 'Công trình', dn: ['công trình', 'dự án', 'tên công trình', 'ct'], kieu: 'ct' };
const MA_CT: Cot = { id: 'ma_cong_trinh', ten: 'Mã công trình', dn: ['mã công trình', 'mã ct', 'mã dự án'], kieu: 'ma' };
// ---- BOT (thời hạn KH nhập kho) — cùng quy tắc thẻ BOT trang Báo cáo tiến độ công trình (chiSoCongTrinh.nhomBot):
// hạn = KH nhập kho tuần → tháng, BỎ KH của kỳ đã nhập đủ số lượng (HEX trong /api/production/plan-met). Danh sách
// HEX đã đạt KH kỳ máy chủ thay vào chỗ __KH_TUAN_DAT__ / __KH_THANG_DAT__ lúc chạy truy vấn (routes/hoiDap.ts).
// Chỉ hạng mục còn theo dõi: không HỦY, chưa nhập đủ số lượng, còn giá trị chưa nhập (hoặc trị giá 0).
const KT = `(CASE WHEN t.ngay_khnk_tuan ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN left(t.ngay_khnk_tuan, 10)::date END)`;
const TUAN_DAT = `(t.hex::text = ANY(__KH_TUAN_DAT__))`;
const THANG_DAT = `(t.hex::text = ANY(__KH_THANG_DAT__))`;
const HAN_KH = `(CASE WHEN ${KT} IS NOT NULL AND NOT ${TUAN_DAT} THEN ${KT} WHEN t.ngay_khnk_thang IS NOT NULL AND NOT ${THANG_DAT} THEN t.ngay_khnk_thang::date END)`;
const MO = `(UPPER(COALESCE(t.tinh_trang_ipo, '')) NOT LIKE '%HỦY%'
  AND NOT (COALESCE(t.so_luong_don_hang_tong, 0) > 0 AND COALESCE(t.so_luong_nhap_kho_luy_ke, 0) >= t.so_luong_don_hang_tong)
  AND (COALESCE(t.tri_gia_don_hang_tong, 0) > COALESCE(t.thanh_tien_nhap_kho_luy_ke, 0) OR COALESCE(t.tri_gia_don_hang_tong, 0) <= 0))`;
const HOM_NAY_VN = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
// "Còn lại" = trị giá − đã nhập kho (không âm) — cùng công thức trang Tổng quan công trình (Construction/core/chiSoCongTrinh.ts).
// Cột SAP gia_tri_con_lai bằng 0 ở nhiều hạng mục trang vẫn theo dõi (SAP đóng ngắn) => không dùng, kẻo chatbot nói
// "còn 14,4 tỷ" trong khi trang nói 17,9 tỷ cho cùng công trình.
const CON_LAI = `GREATEST(COALESCE(t.tri_gia_don_hang_tong, 0) - COALESCE(t.thanh_tien_nhap_kho_luy_ke, 0), 0)`;
export const NHOM_BOT = ['1. Quá hạn KH', '2. ≤ 14 ngày', '3. 15–30 ngày', '4. Sau 30 ngày', '5. Đạt KH kỳ, chờ KH tiếp', '6. Chưa có KH nhập kho'];
const NHOM_BOT_SQL = `(CASE WHEN NOT ${MO} THEN NULL
  WHEN ${HAN_KH} IS NULL AND ((${KT} IS NOT NULL AND ${TUAN_DAT}) OR (t.ngay_khnk_thang IS NOT NULL AND ${THANG_DAT})) THEN '${NHOM_BOT[4]}'
  WHEN ${HAN_KH} IS NULL THEN '${NHOM_BOT[5]}'
  WHEN ${HAN_KH} < ${HOM_NAY_VN} THEN '${NHOM_BOT[0]}'
  WHEN ${HAN_KH} <= ${HOM_NAY_VN} + 14 THEN '${NHOM_BOT[1]}'
  WHEN ${HAN_KH} <= ${HOM_NAY_VN} + 30 THEN '${NHOM_BOT[2]}'
  ELSE '${NHOM_BOT[3]}' END)`;

const HM: Cot = { id: 'ten_hang_muc', ten: 'Hạng mục', dn: ['hạng mục', 'tên hạng mục', 'sản phẩm'], kieu: 'chu' };
const HEX: Cot = { id: 'hex', ten: 'HEX', dn: ['hex', 'mã hex'], kieu: 'ma', sql: `t.hex::text` };
// Loại vướng mắc 5M lưu mã tiếng Anh (routes/vuongMac.ts FIVE_M_CATEGORIES) => chatbot hiện / lọc bằng tên tiếng Việt như trang
// Vướng mắc (VuongMac/model.ts CAT_NAME). Riêng machine ghi 'Máy' (không 'Máy móc') vì bộ đọc câu chỉ khớp nguyên cụm:
// công nhân hỏi "vướng mắc về máy". Giá trị lạ (chưa có trong bảng này) giữ nguyên mã.
const LOAI_5M: Array<[string, string]> = [['man', 'Con người'], ['machine', 'Máy'], ['material', 'Vật tư'], ['method', 'Phương pháp'], ['measurement', 'Đo lường']];
const LOAI_5M_SQL = `(CASE t.category ${LOAI_5M.map(([ma, ten]) => `WHEN '${ma}' THEN '${ten}'`).join(' ')} ELSE t.category END)`;

// ---- Bảng kế hoạch (khsx): mỗi hạng mục có 2 loại dòng — KH THÁNG (phan_loai_kh 'THÁNG', chỉ có nam/thang, ngay_khnk NULL)
// và KH TUẦN ('TUẦN', ngay_khnk = ngày nam/thang/ngay). Cột kỳ phải có ngày cho cả KH tháng (ngày 1 của tháng), không thì
// mọi câu có kỳ ("tháng 9", "quý 3") bỏ hết KH tháng, chỉ cộng KH tuần (tháng 9 ra 155,77 tỷ thay cho 161,01 tỷ của trang).
const NGAY_KHSX = `COALESCE(t.ngay_khnk, make_date(t.nam::int, GREATEST(LEAST(t.thang::int, 12), 1), 1))`;
export type LoaiKh = 'THÁNG' | 'TUẦN';
/**
 * Loại kế hoạch lấy mặc định cho 1 truy vấn bảng khsx — cộng cả 2 loại là cộng đôi. Câu không lọc / không chia theo loại kế hoạch
 * => chọn 1 loại theo kỳ hỏi, cùng cách trang Kế hoạch nhập kho (routes/khsx.ts: xem tháng => '%THÁNG%', xem tuần => '%TUẦN%'):
 * chia theo tuần / ngày hoặc kỳ ngắn hơn 1 tháng (< 28 ngày: "tuần này", "tuần 43", "hôm nay", "từ 1/9 đến 15/9") = KH TUẦN;
 * còn lại (tháng / quý / năm, chia theo tháng, không kỳ) = KH THÁNG. null = không thêm điều kiện (bảng khác, hoặc câu đã nói loại).
 */
export function loaiKhsx(bangId: string, q: { loc: Array<{ cot: string }>; nhom: string[]; tu?: string; den?: string }): LoaiKh | null {
  if (bangId !== 'khsx') return null;
  if (q.loc.some(l => l.cot === 'phan_loai_kh') || q.nhom.some(n => n.split('@')[0] === 'phan_loai_kh')) return null;
  const moc = q.nhom.map(n => n.split('@')[1]).find(Boolean);
  if (moc === 'tuan' || moc === 'ngay') return 'TUẦN';
  if (moc) return 'THÁNG';
  if (q.tu && q.den) {
    const soNgay = Math.round((Date.parse(q.den) - Date.parse(q.tu)) / 86400000) + 1;
    if (soNgay < 28) return 'TUẦN';
  }
  return 'THÁNG';
}

export const DANH_MUC: Bang[] = [
  {
    id: 'nhap_kho', noiSx: true, ten: 'Nhập kho', dn: ['nhập kho', 'nhập kho thành phẩm', 'p022', 'nhập', 'nk', 'thành phẩm nhập', 'doanh thu', 'doanh số'],
    quyen: ['inventory', 'chart_inventory', 'dashboard'], ngay: 'date', huy: 'hex', phienBan: 'inventory',
    dong: 'dòng nhập kho', soChinh: 'thanh_tien_nhap_kho', mac: [{ ham: 'tong', cot: 'thanh_tien_nhap_kho' }, { ham: 'dem_khac', cot: 'hex' }],
    hien: ['date', 'hex', 'ten_cong_trinh', 'ten_hang_muc', 'xuong_chinh', 'so_luong_nhap_kho', 'thanh_tien_nhap_kho'],
    cot: [
      { id: 'date', ten: 'Ngày nhập kho', dn: ['ngày nhập', 'ngày'], kieu: 'ngay' },
      XUONG, CT, MA_CT, HM, HEX,
      { id: 'ten_chi_tiet', ten: 'Chi tiết', dn: ['tên chi tiết'], kieu: 'chu' },
      { id: 'ghi_chu', ten: 'Ghi chú', kieu: 'chu' },
      { id: 'thanh_tien_nhap_kho', ten: 'Giá trị nhập kho', dn: ['giá trị', 'thành tiền', 'giá trị nhập'], kieu: 'so', sql: 't.thanh_tien_nhap_kho_num', tien: true },
      { id: 'so_luong_nhap_kho', ten: 'Số lượng nhập kho', dn: ['số lượng', 'sl'], kieu: 'so' },
    ],
  },
  {
    id: 'xuat_kho', noiSx: true, ten: 'Xuất kho', dn: ['xuất kho', 'xuất kho thành phẩm', 'p025', 'xuất', 'xk', 'giao hàng', 'giao được'],
    quyen: ['export', 'chart_export', 'dashboard'], ngay: 'date', huy: 'hex', phienBan: 'export',
    dong: 'dòng xuất kho', soChinh: 'thanh_tien_xuat_kho', mac: [{ ham: 'tong', cot: 'thanh_tien_xuat_kho' }, { ham: 'dem_khac', cot: 'hex' }],
    hien: ['date', 'hex', 'ten_cong_trinh', 'ten_hang_muc', 'xuong_chinh', 'so_luong_xuat_kho', 'thanh_tien_xuat_kho'],
    cot: [
      { id: 'date', ten: 'Ngày xuất kho', dn: ['ngày xuất', 'ngày'], kieu: 'ngay' },
      XUONG, CT, MA_CT, HM, HEX,
      { id: 'so_phieu', ten: 'Số phiếu', dn: ['phiếu xuất'], kieu: 'ma' },
      { id: 'tinh_doi_voi_hang_tp', ten: 'Loại xuất', tuDien: true, dn: ['tính đối với hàng tp', 'loại'], kieu: 'chu' },
      { id: 'ghi_chu', ten: 'Ghi chú', kieu: 'chu' },
      { id: 'thanh_tien_xuat_kho', ten: 'Giá trị xuất kho', dn: ['giá trị', 'thành tiền'], kieu: 'so', tien: true },
      { id: 'so_luong_xuat_kho', ten: 'Số lượng xuất kho', dn: ['số lượng', 'sl'], kieu: 'so', sql: 't.so_luong_xuat_kho_num' },
    ],
  },
  {
    id: 'ton_kho', noiSx: true, ten: 'Tồn kho', dn: ['tồn kho', 'tồn', 'hàng tồn', 'trong kho', 'kho'],
    quyen: ['stock', 'dashboard'], ngay: 'date', chot: true, phienBan: 'stock',
    dong: 'dòng tồn kho', soChinh: 'gia_tri', mac: [{ ham: 'tong', cot: 'gia_tri' }, { ham: 'dem_khac', cot: 'ma_id_sap' }],
    hien: ['date', 'ma_id_sap', 'ten_cong_trinh', 'ten_san_pham', 'so_luong', 'gia_tri', 'so_thang_ton_kho'],
    cot: [
      { id: 'date', ten: 'Ngày chốt tồn', dn: ['ngày chốt', 'ngày'], kieu: 'ngay' },
      CT, MA_CT, HEX,
      { id: 'ten_san_pham', ten: 'Sản phẩm', dn: ['hạng mục', 'tên sản phẩm'], kieu: 'chu' },
      { id: 'ma_id_sap', ten: 'Mã SAP', dn: ['mã id sap', 'sap', 'id sap'], kieu: 'ma', sql: 't.ma_id_sap::text' },
      { id: 'nhom_ct', ten: 'Nhóm công trình', dn: ['nhóm ct'], kieu: 'chu' },
      { id: 'tinh_trang_ke_hoach_giao_hang', ten: 'Kế hoạch giao hàng', tuDien: true, dn: ['tình trạng kế hoạch giao hàng', 'tình trạng giao hàng', 'giao hàng'], kieu: 'chu' },
      // "tồn kho NHẬP TỪ tháng 9", "ngày nhập": ngày hàng vào kho (khác ngày chốt tồn `date`)
      { id: 'ngay_nhap_kho', ten: 'Ngày nhập kho', dn: ['ngày nhập', 'nhập từ'], kieu: 'ngay' },
      { id: 'so_thang_ton_kho', ten: 'Số tháng tồn', dn: ['tháng tồn', 'tuổi tồn'], kieu: 'so' },
      { id: 'gia_tri', ten: 'Giá trị tồn', dn: ['giá trị', 'thành tiền'], kieu: 'so', sql: 't.gia_tri_num', tien: true },
      { id: 'so_luong', ten: 'Số lượng tồn', dn: ['số lượng', 'sl'], kieu: 'so' },
    ],
  },
  {
    id: 'dht', noiSx: true, ten: 'Đơn hàng tổng', dn: ['đơn hàng', 'đơn hàng mới', 'đơn hàng tổng', 'p001', 'đơn mới', 'dht', 'đơn'],
    quyen: ['orders', 'chart_order', 'dashboard'], ngay: 'ngay_nhan_tu_pm', huy: 'hex', phienBan: 'order',
    dong: 'dòng đơn hàng', soChinh: 'tri_gia_don_hang_tong', mac: [{ ham: 'tong', cot: 'tri_gia_don_hang_tong' }, { ham: 'dem_khac', cot: 'hex' }],
    hien: ['ngay_nhan_tu_pm', 'hex', 'ten_cong_trinh', 'ten_hang_muc', 'xuong_chinh', 'ten_pm', 'tri_gia_don_hang_tong'],
    cot: [
      { id: 'ngay_nhan_tu_pm', ten: 'Ngày nhận từ PM', dn: ['ngày nhận', 'ngày'], kieu: 'ngay' },
      { id: 'ngay_can', ten: 'Ngày cần', kieu: 'ngay' },
      XUONG, CT, MA_CT, HM, HEX,
      { id: 'ten_pm', ten: 'PM', dn: ['tên pm'], kieu: 'chu', tuDien: true },
      { id: 'ten_pc', ten: 'PC', dn: ['tên pc'], kieu: 'chu', tuDien: true },
      { id: 'khu_vuc', ten: 'Khu vực', kieu: 'chu' },
      { id: 'so_ipo', ten: 'Số IPO', dn: ['ipo'], kieu: 'ma' },
      { id: 'tam_ngung_huy_dht', ten: 'Tạm ngưng / hủy', dn: ['tạm ngưng', 'hủy'], kieu: 'chu' },
      { id: 'tri_gia_don_hang_tong', ten: 'Trị giá đơn hàng', dn: ['trị giá', 'giá trị'], kieu: 'so', sql: 't.tri_gia_don_hang_tong_num', tien: true },
      { id: 'so_luong_don_hang_tong', ten: 'Số lượng đơn hàng', dn: ['số lượng', 'sl'], kieu: 'so' },
    ],
  },
  {
    id: 'tkbv_full', noiSx: true, ten: 'Triển khai bản vẽ', dn: ['triển khai bản vẽ', 'triển khai', 'tkbv', 'p002', 'bản vẽ'],
    quyen: ['tkbv', 'chart_tkbv', 'dashboard'], ngay: 'ngay_nhan', huy: 'hex', phienBan: 'tkbv',
    dong: 'dòng triển khai', soChinh: 'tri_gia_don_hang_tong', mac: [{ ham: 'tong', cot: 'tri_gia_don_hang_tong' }, { ham: 'dem_khac', cot: 'hex' }],
    hien: ['ngay_nhan', 'hex', 'ten_cong_trinh', 'ten_hang_muc', 'xuong_chinh', 'nguoi_trien_khai', 'tri_gia_don_hang_tong'],
    cot: [
      { id: 'ngay_nhan', ten: 'Ngày triển khai', dn: ['ngày nhận', 'ngày'], kieu: 'ngay' },
      XUONG, CT, MA_CT, HM, HEX,
      { id: 'nguoi_trien_khai', ten: 'Người triển khai', tuDien: true, dn: ['người vẽ', 'kỹ thuật'], kieu: 'chu' },
      { id: 'so_luong_trien_khai', ten: 'Số lượng triển khai', dn: ['số lượng', 'sl'], kieu: 'so' },
      { id: 'tri_gia_don_hang_tong', ten: 'Trị giá', dn: ['trị giá', 'giá trị'], kieu: 'so', sql: 't.tri_gia_don_hang_tong_num', tien: true },
    ],
  },
  {
    id: 'pthsp_full', noiSx: true, ten: 'Tính phiếu', dn: ['tính phiếu', 'pthsp', 'p012', 'phiếu', 'phân tích hồ sơ'],
    quyen: ['pthsp', 'chart_pthsp', 'dashboard'], ngay: 'ngay_hoan_thanh', huy: 'hex', phienBan: 'pthsp',
    dong: 'dòng tính phiếu', soChinh: 'tri_gia_don_hang_tong', mac: [{ ham: 'tong', cot: 'tri_gia_don_hang_tong' }, { ham: 'dem_khac', cot: 'hex' }],
    hien: ['ngay_hoan_thanh', 'hex', 'ten_cong_trinh', 'ten_hang_muc', 'xuong_chinh', 'tinh_trang_phieu', 'tri_gia_don_hang_tong'],
    cot: [
      { id: 'ngay_hoan_thanh', ten: 'Ngày tính phiếu xong', dn: ['ngày hoàn thành', 'ngày'], kieu: 'ngay' },
      { id: 'ngay_duyet', ten: 'Ngày duyệt phiếu', dn: ['ngày duyệt'], kieu: 'ngay' },
      { id: 'tinh_trang_phieu', ten: 'Tình trạng phiếu', dn: ['trạng thái phiếu', 'tình trạng'], kieu: 'chu', tuDien: true },
      XUONG, CT, MA_CT, HM, HEX,
      { id: 'so_luong_tinh', ten: 'Số lượng tính', dn: ['số lượng', 'sl'], kieu: 'so' },
      { id: 'tri_gia_don_hang_tong', ten: 'Trị giá', dn: ['trị giá', 'giá trị'], kieu: 'so', sql: 't.tri_gia_don_hang_tong_num', tien: true },
    ],
  },
  {
    id: 'production_status_app', ten: 'Sản xuất (hạng mục)',
    dn: ['sản xuất', 'hạng mục', 'đang sản xuất', 'tình trạng sản xuất', 'sx', 'đơn đang làm', 'trên chuyền'],
    quyen: ['production', 'construction_overview', 'hex_lookup', 'dashboard'], ngay: 'ngay_nhan_tu_pm', huy: 'ipo', phienBan: 'production',
    dong: 'hạng mục', soChinh: 'tri_gia_don_hang_tong', mac: [{ ham: 'dem' }, { ham: 'tong', cot: 'tri_gia_don_hang_tong' }, { ham: 'tong', cot: 'gia_tri_con_lai' }],
    hien: ['hex', 'ten_cong_trinh', 'ten_hang_muc', 'xuong_chinh', 'tinh_trang', 'tri_gia_don_hang_tong', 'gia_tri_con_lai'],
    cot: [
      { id: 'tinh_trang', ten: 'Công đoạn hiện tại', tuDien: true, dn: ['công đoạn', 'tình trạng', 'trạng thái', 'đang ở'], kieu: 'chu' },
      { id: 'tinh_trang_ipo', ten: 'Tình trạng IPO', dn: ['ipo'], kieu: 'chu' },
      { id: 'tinh_trang_du_an', ten: 'Tình trạng dự án', tuDien: true, kieu: 'chu' },
      XUONG, CT, MA_CT, HM, HEX,
      { id: 'ten_pm', ten: 'PM', dn: ['tên pm'], kieu: 'chu', tuDien: true },
      { id: 'ten_pc', ten: 'PC', dn: ['tên pc'], kieu: 'chu', tuDien: true },
      { id: 'khach_hang', ten: 'Khách hàng', tuDien: true, dn: ['chủ đầu tư'], kieu: 'chu' },
      { id: 'khu_vuc_du_an', ten: 'Khu vực', tuDien: true, dn: ['khu vực dự án', 'vùng'], kieu: 'chu' },
      { id: 'phan_loai_nhom_san_pham', ten: 'Nhóm sản phẩm', tuDien: true, dn: ['loại sản phẩm', 'phân loại'], kieu: 'chu' },
      { id: 'nhom_ct', ten: 'Nhóm công trình', dn: ['nhóm ct'], kieu: 'chu' },
      { id: 'tinh_trang_phieu', ten: 'Tình trạng phiếu', kieu: 'chu', tuDien: true },
      { id: 'tinh_trang_trien_khai_ban_ve', ten: 'Tình trạng bản vẽ', tuDien: true, dn: ['tình trạng triển khai bản vẽ', 'triển khai bản vẽ'], kieu: 'chu' },
      { id: 'tinh_trang_gcn', ten: 'Gia công ngoài', dn: ['gcn', 'tình trạng gcn'], kieu: 'chu' },
      { id: 'bop', ten: 'BOP', tuDien: true, dn: ['bước sản xuất', 'bước bop', 'bước'], kieu: 'chu' },
      // BOT: 6 nhóm thời hạn KH nhập kho + hạn KH đang dùng (xem NHOM_BOT_SQL)
      { id: 'nhom_bot', ten: 'Nhóm BOT', tuDien: true, gt: NHOM_BOT, dn: ['bot', 'nhóm bot', 'thời hạn kế hoạch', 'thời hạn kh', 'nhóm thời hạn'], kieu: 'chu', sql: NHOM_BOT_SQL },
      { id: 'han_khnk', ten: 'Hạn KH nhập kho (BOT)', dn: ['hạn kế hoạch', 'hạn kh nhập kho', 'hạn kế hoạch nhập kho', 'hạn bot'], kieu: 'ngay', sql: `(CASE WHEN ${MO} THEN ${HAN_KH} END)` },
      { id: 'ngay_nhan_tu_pm', ten: 'Ngày nhận từ PM', dn: ['ngày nhận'], kieu: 'ngay' },
      { id: 'ngay_can_giao', ten: 'Ngày cần giao', dn: ['hạn giao'], kieu: 'ngay' },
      { id: 'bot_du_an', ten: 'BOT dự án', dn: ['bot dự án', 'hạn dự án'], kieu: 'ngay' },
      { id: 'ngay_khnk_thang', ten: 'KH nhập kho tháng', dn: ['kế hoạch nhập kho', 'kế hoạch tháng'], kieu: 'ngay' },
      // Cột chữ dạng '2026-10-18 00:00:00' => đổi sang ngày (chữ khác dạng coi như trống)
      { id: 'ngay_khnk_tuan', ten: 'KH nhập kho tuần', dn: ['kế hoạch tuần'], kieu: 'ngay', sql: `(CASE WHEN t.ngay_khnk_tuan ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN left(t.ngay_khnk_tuan, 10)::date END)` },
      { id: 'tri_gia_don_hang_tong', ten: 'Trị giá đơn hàng', dn: ['trị giá', 'giá trị'], kieu: 'so', tien: true },
      { id: 'thanh_tien_tinh_phieu', ten: 'Đã tính phiếu', dn: ['giá trị tính phiếu'], kieu: 'so', tien: true },
      { id: 'thanh_tien_nhap_kho_luy_ke', ten: 'Đã nhập kho', dn: ['nhập kho lũy kế', 'đã nhập'], kieu: 'so', tien: true },
      { id: 'thanh_tien_xuat_kho_luy_ke', ten: 'Đã xuất kho', dn: ['xuất kho lũy kế', 'đã xuất'], kieu: 'so', sql: so('thanh_tien_xuat_kho_luy_ke'), tien: true },
      { id: 'thanh_tien_ton_kho_hien_tai', ten: 'Tồn kho hiện tại', dn: ['giá trị tồn'], kieu: 'so', tien: true },
      { id: 'gia_tri_con_lai', ten: 'Giá trị còn lại', dn: ['còn lại', 'chưa nhập'], kieu: 'so', tien: true, sql: CON_LAI },
      { id: 'so_luong_don_hang_tong', ten: 'Số lượng đơn hàng', dn: ['số lượng', 'sl'], kieu: 'so' },
      { id: 'so_luong_nhap_kho_luy_ke', ten: 'Số lượng đã nhập', dn: ['sl nhập'], kieu: 'so' },
      // Cột là NHÓM chữ ('<3 NGÀY', '2 TUẦN', 'TỪ 8 TUẦN TRỞ LÊN'), không phải số ngày
      { id: 'so_ngay_cd_hien_tai', ten: 'Thời gian ở công đoạn', tuDien: true, dn: ['số ngày ở công đoạn', 'nằm bao lâu', 'bao lâu'], kieu: 'chu' },
    ],
  },
  {
    id: 'vat_tu', ten: 'Vật tư', dn: ['vật tư', 'pr', 'po', 'mua hàng', 'nvl', 'nguyên vật liệu', 'bom', 'tình trạng bom'],
    quyen: ['materials'], ngay: 'ngay_pr', phienBan: 'material',
    dong: 'dòng PR', mac: [{ ham: 'dem' }, { ham: 'dem_khac', cot: 'so_pr' }],
    hien: ['ngay_pr', 'so_pr', 'ten_cong_trinh', 'ten_vat_tu', 'so_luong_yeu_cau', 'so_luong_da_nhan_sap', 'trang_thai'],
    cot: [
      { id: 'trang_thai', ten: 'Trạng thái', tuDien: true, dn: ['tình trạng'], kieu: 'chu' },
      { id: 'trang_thai_sap', ten: 'Trạng thái SAP', kieu: 'chu' },
      { id: 'tinh_trang_po', ten: 'Tình trạng PO', kieu: 'chu' },
      { id: 'tinh_trang_pr', ten: 'Tình trạng PR', tuDien: true, kieu: 'chu' },
      { id: 'nguoi_tao', ten: 'Người tạo', kieu: 'chu' },
      { id: 'nguoi_yeu_cau', ten: 'Người yêu cầu', tuDien: true, kieu: 'chu' },
      CT,
      { id: 'so_pr', ten: 'Số PR', kieu: 'ma', sql: 't.so_pr::bigint::text' },
      { id: 'so_po', ten: 'Số PO', kieu: 'ma', sql: 't.so_po::bigint::text' },
      { id: 'ten_vat_tu', ten: 'Tên vật tư', dn: ['vật liệu'], kieu: 'chu' },
      { id: 'ma_vat_tu_sap', ten: 'Mã vật tư SAP', dn: ['mã vật tư'], kieu: 'ma', sql: 't.ma_vat_tu_sap::bigint::text' },
      { id: 'nhom_vt', ten: 'Nhóm vật tư', tuDien: true, dn: ['nhóm vt', 'loại vật tư'], kieu: 'chu' },
      { id: 'nha_cung_cap', ten: 'Nhà cung cấp', dn: ['ncc'], kieu: 'chu', quyen: 'materials_view_price' },
      { id: 'dvt', ten: 'Đơn vị tính', dn: ['đvt'], kieu: 'chu' },
      { id: 'ngay_pr', ten: 'Ngày PR', kieu: 'ngay' },
      // Cách gọi các mốc ngày của PR: "PR CẦN VẬT TƯ trước 1/11", "PR nào HẸN VỀ tuần này", "vật tư VỀ THỰC TẾ tuần trước"
      // (không ghi 'cần trước' / 'hẹn trước': chữ "trước" phải còn lại để đọc thành phép so sánh < ngày)
      { id: 'ngay_can_vat_tu', ten: 'Ngày cần vật tư', dn: ['cần vật tư', 'ngày cần'], kieu: 'ngay' },
      { id: 'ngay_du_kien_giao_hang_pmh_nhap', ten: 'Ngày dự kiến về', dn: ['dự kiến về', 'ngày hẹn', 'hẹn về', 'hẹn giao', 'ngày hẹn về', 'hẹn'], kieu: 'ngay' },
      { id: 'ngay_thuc_te_ve', ten: 'Ngày thực tế về', dn: ['ngày về', 'về thực tế', 'thực tế về', 'ngày về thực tế', 'đã về'], kieu: 'ngay' },
      { id: 'so_luong_yeu_cau', ten: 'SL yêu cầu', dn: ['số lượng yêu cầu', 'số lượng'], kieu: 'so' },
      { id: 'so_luong_da_nhan_sap', ten: 'SL đã nhận', dn: ['đã nhận'], kieu: 'so' },
      { id: 'so_luong_con_lai', ten: 'SL còn lại', dn: ['còn lại', 'còn thiếu'], kieu: 'so' },
      { id: 'don_gia', ten: 'Đơn giá', kieu: 'so', quyen: 'materials_view_price' },
      { id: 'thanh_tien', ten: 'Thành tiền', dn: ['giá trị'], kieu: 'so', quyen: 'materials_view_price' },
    ],
  },
  {
    // Kỳ = NGAY_KHSX (KH tuần: ngày KH; KH tháng: ngày 1 của tháng); máy chủ tự thêm lọc loại KH theo kỳ hỏi (loaiKhsx) để
    // không cộng đôi tháng + tuần
    id: 'khsx', noiSx: true, ten: 'Kế hoạch sản xuất', dn: ['kế hoạch sản xuất', 'khsx', 'kế hoạch nhập kho', 'dữ liệu kế hoạch'],
    quyen: ['khsx', 'dashboard'], ngay: 'ngay_khnk', huy: 'hex', phienBan: 'khsx',
    dong: 'dòng kế hoạch', soChinh: 'thanh_tien_ke_hoach', mac: [{ ham: 'tong', cot: 'thanh_tien_ke_hoach' }, { ham: 'dem_khac', cot: 'hex' }],
    hien: ['ngay_khnk', 'hex', 'ten_cong_trinh', 'ten_hang_muc', 'xuong_chinh', 'phan_loai_kh', 'thanh_tien_ke_hoach'],
    cot: [
      { id: 'ngay_khnk', ten: 'Ngày KH nhập kho', dn: ['ngày kế hoạch', 'ngày'], kieu: 'ngay', sql: NGAY_KHSX },
      { id: 'phan_loai_kh', ten: 'Loại kế hoạch', tuDien: true, dn: ['phân loại'], kieu: 'chu' },
      { id: 'nam', ten: 'Năm', kieu: 'ma', sql: 't.nam::text' },
      { id: 'thang', ten: 'Tháng', kieu: 'ma', sql: 't.thang::text' },
      { id: 'tuan', ten: 'Tuần', kieu: 'ma', sql: 't.tuan::int::text' },
      XUONG, CT, MA_CT, HM, HEX,
      { id: 'thanh_tien_ke_hoach', ten: 'Giá trị kế hoạch', dn: ['giá trị', 'kế hoạch'], kieu: 'so', sql: 't.thanh_tien_ke_hoach_num', tien: true },
      { id: 'so_luong_kh', ten: 'Số lượng kế hoạch', dn: ['số lượng', 'sl'], kieu: 'so', sql: so('so_luong_kh') },
    ],
  },
  {
    id: 'khsx_nam', ten: 'Kế hoạch năm', dn: ['dữ liệu kế hoạch năm', 'bảng kế hoạch năm', 'mục tiêu năm'],
    quyen: ['yearly_plan_data', 'dashboard'], ngay: 'thoi_gian', phienBan: 'yearlyPlan',
    dong: 'dòng kế hoạch', soChinh: 'thanh_tien_ke_hoach', mac: [{ ham: 'tong', cot: 'thanh_tien_ke_hoach' }],
    hien: ['nam', 'thang', 'xuong_chinh', 'thanh_tien_ke_hoach'],
    cot: [
      { id: 'thoi_gian', ten: 'Tháng kế hoạch', kieu: 'ngay', sql: 'make_date(t.nam::int, GREATEST(LEAST(t.thang::int, 12), 1), 1)' },
      { id: 'nam', ten: 'Năm', kieu: 'ma', sql: 't.nam::text' },
      { id: 'thang', ten: 'Tháng', kieu: 'ma', sql: 't.thang::text' },
      XUONG,
      { id: 'thanh_tien_ke_hoach', ten: 'Giá trị kế hoạch', dn: ['giá trị', 'kế hoạch', 'mục tiêu'], kieu: 'so', sql: 't.thanh_tien_ke_hoach_num', tien: true },
    ],
  },
  {
    id: 'phan_tich_kh_th', noiSx: true, ten: 'Phân tích KH-TH', dn: ['phân tích kh-th', 'kh-th', 'khth', 'kh th', 'thực hiện kế hoạch', 'đúng kế hoạch', 'rớt kế hoạch'],
    quyen: ['analysis'], ngay: 'thoi_gian', phienBan: 'analysis',
    dong: 'dòng', soChinh: 'thanh_tien_ke_hoach', mac: [{ ham: 'tong', cot: 'thanh_tien_ke_hoach' }, { ham: 'tong', cot: 'nhap_kho_tuan' }],
    hien: ['nam', 'tuan', 'hex', 'ten_cong_trinh', 'xuong_chinh', 'tinh_trang_thuc_hien_ke_hoach', 'thanh_tien_ke_hoach', 'nhap_kho_tuan'],
    cot: [
      { id: 'thoi_gian', ten: 'Tuần kế hoạch', kieu: 'ngay', sql: `to_date(t.nam::text || '-' || lpad(t.tuan::text, 2, '0'), 'IYYY-IW')` },
      { id: 'nam', ten: 'Năm', kieu: 'ma', sql: 't.nam::text' },
      { id: 'tuan', ten: 'Tuần', kieu: 'ma', sql: 't.tuan::text' },
      XUONG, CT, MA_CT, HM, HEX,
      { id: 'tinh_trang_thuc_hien_ke_hoach', ten: 'Tình trạng thực hiện', tuDien: true, dn: ['tình trạng', 'kết quả'], kieu: 'chu' },
      { id: 'thanh_tien_ke_hoach', ten: 'Giá trị kế hoạch', dn: ['kế hoạch', 'giá trị'], kieu: 'so', sql: so('thanh_tien_ke_hoach'), tien: true },
      { id: 'nhap_kho_tuan', ten: 'Nhập kho tuần', dn: ['thực hiện', 'nhập kho'], kieu: 'so', sql: so('nhap_kho_tuan'), tien: true },
      { id: 'dung_ke_hoach', ten: 'Đúng kế hoạch', kieu: 'so', tien: true },
      { id: 'thuc_hien_dung_ke_hoach_1_phan', ten: 'Đúng KH 1 phần', kieu: 'so', tien: true },
      { id: 'rot_ke_hoach', ten: 'Rớt kế hoạch', kieu: 'so', tien: true },
      { id: 'thuc_hien_rot_ke_hoach_1_phan', ten: 'Rớt KH 1 phần', kieu: 'so', tien: true },
      { id: 'nhap_kho_truoc_ke_hoach', ten: 'Nhập trước kế hoạch', kieu: 'so', tien: true },
      { id: 'vuot_ke_hoach', ten: 'Vượt kế hoạch', kieu: 'so', tien: true },
      { id: 'nhap_kho_ngoai_ke_hoach', ten: 'Nhập ngoài kế hoạch', kieu: 'so', tien: true },
    ],
  },
  {
    id: 'diem_danh', ten: 'Điểm danh', dn: ['điểm danh', 'nhân sự', 'định biên', 'số công nhân'],
    quyen: ['attendance'], ngay: 'date', phienBan: 'attendance',
    dong: 'dòng điểm danh', mac: [{ ham: 'tb', cot: 'so_luong_cong_nhan' }, { ham: 'tong', cot: 'gio_cong_hanh_chinh' }, { ham: 'tong', cot: 'gio_cong_tang_ca' }],
    hien: ['date', 'xuong_chinh', 'so_luong_cong_nhan', 'dinh_bien', 'gio_cong_hanh_chinh', 'gio_cong_tang_ca'],
    cot: [
      { id: 'date', ten: 'Ngày', kieu: 'ngay' },
      XUONG,
      { id: 'so_luong_cong_nhan', ten: 'Số công nhân', dn: ['công nhân', 'số người', 'nhân sự', 'người đi làm', 'đi làm'], kieu: 'so' },
      { id: 'dinh_bien', ten: 'Định biên', kieu: 'so' },
      { id: 'gio_cong_hanh_chinh', ten: 'Giờ công hành chính', dn: ['giờ hành chính', 'giờ công'], kieu: 'so' },
      { id: 'gio_cong_tang_ca', ten: 'Giờ tăng ca', dn: ['tăng ca', 'giờ công tăng ca'], kieu: 'so' },
    ],
  },
  {
    id: 'vuong_mac', ten: 'Vướng mắc', dn: ['vướng mắc', 'vấn đề', 'sự cố', 'vm'],
    quyen: ['vuong_mac'], ngay: 'created_at',
    dong: 'vướng mắc', mac: [{ ham: 'dem' }],
    hien: ['created_at', 'hex', 'ten_cong_trinh', 'xuong', 'category', 'status', 'handler', 'bot_end'],
    cot: [
      { id: 'created_at', ten: 'Ngày báo', dn: ['ngày tạo', 'ngày'], kieu: 'ngay', sql: `(t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` },
      {
        // 'Mới' (open) + 'Đang xử lý' (doing) = "đang mở" của trang Vướng mắc (routes/vuongMac.ts stats.open) — bộ đọc câu lọc
        // "vướng mắc đang mở / chưa xong" bằng 2 giá trị này
        id: 'status', ten: 'Trạng thái', dn: ['tình trạng'], kieu: 'chu', gt: ['Mới', 'Đang xử lý', 'Đã xong', 'Đã đóng'],
        sql: `(CASE t.status WHEN 'open' THEN 'Mới' WHEN 'doing' THEN 'Đang xử lý' WHEN 'done' THEN 'Đã xong' WHEN 'closed' THEN 'Đã đóng' ELSE COALESCE(t.status, CASE WHEN t.is_resolved THEN 'Đã xong' ELSE 'Mới' END) END)`,
      },
      { id: 'is_resolved', ten: 'Đã xử lý', dn: ['xử lý xong', 'đã giải quyết'], kieu: 'chu', gt: ['Đã xử lý', 'Chưa xử lý'], sql: `(CASE WHEN t.is_resolved THEN 'Đã xử lý' ELSE 'Chưa xử lý' END)` },
      {
        id: 'qua_han', ten: 'Quá hạn', dn: ['trễ hạn', 'quá hạn bot'], kieu: 'chu', gt: ['Quá hạn'],
        sql: `(CASE WHEN NOT COALESCE(t.is_resolved, false) AND t.bot_end IS NOT NULL AND t.bot_end < now() THEN 'Quá hạn' ELSE 'Không' END)`,
      },
      { id: 'category', ten: 'Loại vướng mắc', tuDien: true, dn: ['loại', 'nhóm', '5m'], kieu: 'chu', gt: LOAI_5M.map(x => x[1]), sql: LOAI_5M_SQL },
      { id: 'priority', ten: 'Mức ưu tiên', tuDien: true, dn: ['ưu tiên'], kieu: 'chu' },
      { id: 'stage', ten: 'Công đoạn', tuDien: true, kieu: 'chu' },
      // "tổ 4A có bao nhiêu vướng mắc": tổ = xưởng. Chỉ thêm ở bảng này — ở bảng sản xuất "tổ đá / tổ sơn" là tổ nhỏ trong xưởng
      { ...XUONG, id: 'xuong', dn: [...(XUONG.dn ?? []), 'tổ'], sql: 't.xuong' },
      CT, MA_CT, HM,
      { ...HEX, sql: 't.hex' },
      { id: 'handler', ten: 'Người xử lý', tuDien: true, dn: ['người phụ trách'], kieu: 'chu' },
      { id: 'created_by', ten: 'Người báo', dn: ['người tạo'], kieu: 'chu' },
      { id: 'bot_end', ten: 'Hạn BOT', dn: ['hạn', 'bot'], kieu: 'ngay', sql: `(t.bot_end AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` },
      { id: 'resolved_at', ten: 'Ngày xử lý xong', kieu: 'ngay', sql: `(t.resolved_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` },
    ],
  },
];

export const bangTheoId = new Map(DANH_MUC.map(b => [b.id, b]));
export const sqlCot = (c: Cot) => c.sql ?? `t."${c.id}"`;
