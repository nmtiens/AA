// ============================================================================
// BỘ CÂU HỎI MẪU — giá trị thật dùng để điền vào mẫu câu (lấy từ từ điển giá trị /api/hoi-dap/tu-dien, 10/2026)
// và các kỳ thời gian kèm đáp án (ngày chốt: thứ Hai 19/10/2026 — cùng ngày với test hieuTruyVan).
// ============================================================================

export const HOM_NAY = new Date(2026, 9, 19);

export type Ky = { noi: string; tu: string; den: string };
/** Kỳ của bảng sự kiện (nhập / xuất / đơn hàng…): "tháng này" tính tới hôm nay */
export const KY: Ky[] = [
  { noi: 'hôm nay', tu: '2026-10-19', den: '2026-10-19' },
  { noi: 'hôm qua', tu: '2026-10-18', den: '2026-10-18' },
  { noi: 'tuần này', tu: '2026-10-19', den: '2026-10-19' },
  { noi: 'tuần trước', tu: '2026-10-12', den: '2026-10-18' },
  { noi: 'tháng này', tu: '2026-10-01', den: '2026-10-19' },
  { noi: 'tháng trước', tu: '2026-09-01', den: '2026-09-30' },
  { noi: 'tháng 9', tu: '2026-09-01', den: '2026-09-30' },
  { noi: 'tháng 8', tu: '2026-08-01', den: '2026-08-31' },
  { noi: 'tháng 3', tu: '2026-03-01', den: '2026-03-31' },
  { noi: 'quý 3', tu: '2026-07-01', den: '2026-09-30' },
  { noi: 'quý 2 năm 2025', tu: '2025-04-01', den: '2025-06-30' },
  { noi: 'năm 2025', tu: '2025-01-01', den: '2025-12-31' },
  { noi: 'năm nay', tu: '2026-01-01', den: '2026-10-19' },
  { noi: '7 ngày qua', tu: '2026-10-13', den: '2026-10-19' },
  { noi: '30 ngày', tu: '2026-09-20', den: '2026-10-19' },
  { noi: 'từ 1/9 đến 15/9', tu: '2026-09-01', den: '2026-09-15' },
  { noi: 'tháng 9/2025', tu: '2025-09-01', den: '2025-09-30' },
];
/** Kỳ mặc định khi câu không nói kỳ (bảng sự kiện, không hỏi 1 công trình / HEX) */
export const KY_MAC_DINH = { tu: '2026-01-01', den: '2026-10-19' };

/** Cặp kỳ để so sánh */
export const CAP_KY: Array<[Ky, Ky]> = [
  [KY[6], KY[7]], // tháng 9 / tháng 8
  [KY[4], KY[5]], // tháng này / tháng trước
  [KY[9], { noi: 'quý 2', tu: '2026-04-01', den: '2026-06-30' }],
  [KY[12], { noi: 'năm 2025', tu: '2025-01-01', den: '2025-12-31' }],
  [KY[3], { noi: 'tuần 41', tu: '2026-10-05', den: '2026-10-11' }],
];

/** Tuần ISO quanh HÔM NAY (thứ Hai 19/10/2026 = tuần 43), trọn tuần thứ Hai → Chủ nhật — bảng kế hoạch / KH-TH nói "tuần N" lấy trọn tuần */
export const TUAN_SO: Record<number, { tu: string; den: string }> = {
  41: { tu: '2026-10-05', den: '2026-10-11' },
  42: { tu: '2026-10-12', den: '2026-10-18' },
  43: { tu: '2026-10-19', den: '2026-10-25' },
  44: { tu: '2026-10-26', den: '2026-11-01' },
};

export const XUONG = ['2A', '3A', '4A', '5A', '8AB', '8C'];

/** Tên công trình nói tắt (đều nằm trong tên chuẩn của ít nhất 1 công trình) */
export const TEN_CT = ['tây hồ view', 'nam phương', 'holiday inn', 'emerald raiya', 'capella', 'olalani', 'intercontinental', 'sun premier village', 'hyatt place', 'st.regis', 'tiến bộ plaza', 'nhà xinh'];
/** Mã công trình có thật */
export const MA_CT = ['CT25-070', 'CT26-110', 'CT24-066', 'CT25-059', 'CT26-041', 'CT24-067', 'CT25-043', 'CT26-011', 'CT25-060', 'CT26-061', 'CT24-041', 'CT25-078'];

export const KHACH_HANG = ['SUN GROUP', 'BIM GROUP', 'CAPITALAND', 'SONKIM LAND', 'EMERALD CRUISES', 'BCG LAND', 'TMS GROUP', 'NISO'];
/** PM ở bảng đơn hàng (tên đăng nhập) */
export const PM_DH = ['tailv', 'linhnd', 'thuongdv', 'tuanlm', 'nguyennd', 'saudn'];
/** PM / PC ở bảng sản xuất (họ tên) */
export const PM_SX = ['LÊ MINH TUẤN', 'ĐINH VĂN THƯỜNG', 'LÊ VIẾT TÀI', 'BÀNH VĨ LONG', 'TRẦN GIANG NAM'];
export const PC_SX = ['NGUYỄN THÀNH THẬT', 'LÊ ANH QUANG', 'TRẦN QUỐC VŨ', 'NGUYỄN VIỆT HÙNG'];
export const NGUOI_TK = ['NGUYỄN NGỌC YẾN', 'LÊ ANH QUANG', 'TRẦN QUỐC VŨ', 'VŨ NGỌC ÁNH'];

/** [cách nói, giá trị trong DB] */
export const CONG_DOAN: Array<[string, string]> = [
  ['mộc', '05. MỘC'], ['máy', '06. MÁY'], ['vecni', '04. VECNI'], ['fitting', '03. FITTING'], ['bao bì', '02. BAO BÌ'],
  ['bọc nệm', '04.1. BỌC NỆM'], ['phôi', '07.2. PHÔI'], ['hàn', '06.1. HÀN'], ['nguội', '05.2. NGUỘI'], ['đóng kiện', '02.1. ĐÓNG KIỆN'],
];
/** 4 công đoạn gia công vệ tinh (giá trị cột tinh_trang) — "hàng gia công vệ tinh" = cả 4 */
export const CONG_DOAN_GCVT = ['16. GIA CÔNG VỆ TINH-BTP', '16.1. GIA CÔNG VỆ TINH-NGUYÊN CON', '16.2. GIA CÔNG VỆ TINH-ĐÁ', '16.3. GIA CÔNG VỆ TINH-KHÁC'];
export const NHOM_SP: Array<[string, string]> = [
  ['ghế', '02. GHẾ'], ['bàn', '01. BÀN'], ['tủ', '03. TỦ'], ['tủ áo', '06. TỦ ÁO'], ['cửa', '10. CỬA'], ['tường', '08. TƯỜNG'],
  ['sàn', '09. SÀN'], ['giường', '04. GIƯỜNG'], ['trần', '07. TRẦN'], ['khung gương', '05. KHUNG GƯƠNG'],
];
export const NHOM_VT: Array<[string, string]> = [
  ['kính', '110 - Kính'], ['gỗ', '101 - Gỗ'], ['vải', '106 - Vải'], ['đá', '111 - Đá'], ['da', '107 - Da'], ['keo', '113 - Keo'],
  ['kim loại', '105 - Kim loại'], ['phụ kiện', '115 - Phụ kiện'], ['gia công', '806 - Gia công'],
];
