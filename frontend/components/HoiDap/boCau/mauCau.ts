import type { Ham, Loc, Moc } from '../truyVanApi';
import type { Y } from '../hieuCauHoi';
import {
  KY, KY_MAC_DINH, CAP_KY, XUONG, TEN_CT, MA_CT, KHACH_HANG, PM_DH, PM_SX, PC_SX, NGUOI_TK, CONG_DOAN, NHOM_SP, NHOM_VT, TUAN_SO, CONG_DOAN_GCVT,
  type Ky,
} from './giaTri';

// ============================================================================
// MẪU CÂU HỎI (viết tay theo nghiệp vụ) + ĐÁP ÁN. Mỗi mẫu có nhiều cách nói; chỗ {…} được điền giá trị thật
// (giaTri.ts). Đáp án là truy vấn đúng — dùng để chấm điểm bộ đọc câu (chamDiem.ts) và làm ví dụ cho AI.
// ============================================================================

export type KyVong =
  /** Câu quen thuộc: câu trả lời mẫu (traLoi.ts) phải xử lý, đúng loại câu */
  | { loai: 'mau'; y: Y }
  | {
    loai: 'tu_tra';
    bang: string;
    kieu?: 'tong' | 'dong';
    /** Phép tính (so khớp đúng tập) — bỏ trống = không chấm */
    do?: Array<{ ham: Ham; cot?: string }>;
    /** Có phép tính này trong danh sách (không cần đúng tập) */
    coDo?: { ham: Ham; cot?: string };
    nhom?: string[];
    loc?: Loc[];
    /** undefined = không chấm; null = không được có kỳ */
    ky?: { tu: string; den: string } | null;
    soSanh?: { tu: string; den: string };
    binhQuan?: Moc;
    sapChenh?: 'giam' | 'tang';
    gioiHan?: number;
    /** Xếp ít trước */
    sapTang?: boolean;
  }
  /** Câu danh mục không trả lời được: không được trả lời tự tin (phải nhờ AI / báo chưa hiểu) */
  | { loai: 'chua_tra_loi' }
  /** Lệnh thao tác cửa sổ, không phải câu hỏi số liệu: "xuất báo cáo [câu hỏi]" (baoCao/moHinh.ts laLenhXuat) — phải nhận ra
   *  đúng định dạng người dùng nói; conLai = phần câu hỏi kèm theo (undefined = không chấm) */
  | { loai: 'lenh'; lenh: 'xuat_bao_cao'; dinhDang: 'xlsx' | 'pdf' | null; conLai?: string };

/** Giá trị đã điền vào 1 câu */
export interface Dien {
  ky: Ky; ky2: Ky; x: string; x2: string; ct: string; ma: string; kh: string; pm: string; pmsx: string; pcsx: string; ntk: string;
  cd: [string, string]; nsp: [string, string]; nvt: [string, string]; n: number; b: BangDong;
  /** Tên gọi của bảng {b} đã điền vào câu ("nhập kho" / "nhập kho thành phẩm"…) */
  bTen: string;
}
export type KhoaDien = keyof Dien;

export interface MauCau {
  id: string;
  nhom: string;
  cau: string[];
  dung?: KhoaDien[];
  /** Câu hỏi trước (ngữ cảnh) — câu này hỏi nối tiếp; mảng = nhiều lượt theo thứ tự */
  truoc?: string | string[];
  /** Đáp án; `mau` = cách nói đã chọn trong `cau` (chưa điền) — mẫu có nhiều cách nói cho đáp án khác nhau thì xem chữ này */
  kv: (d: Dien, mau: string) => KyVong;
}

/** Bảng "dòng chảy": tên gọi + cột ngày */
export interface BangDong { id: string; ngay: string; ten: string[]; dong: string }
export const BANG_DONG: BangDong[] = [
  { id: 'nhap_kho', ngay: 'date', ten: ['nhập kho', 'nhập kho thành phẩm'], dong: 'dòng nhập kho' },
  { id: 'xuat_kho', ngay: 'date', ten: ['xuất kho', 'xuất kho thành phẩm'], dong: 'dòng xuất kho' },
  { id: 'dht', ngay: 'ngay_nhan_tu_pm', ten: ['đơn hàng mới', 'đơn hàng'], dong: 'dòng đơn hàng' },
  { id: 'tkbv_full', ngay: 'ngay_nhan', ten: ['triển khai bản vẽ', 'bản vẽ triển khai'], dong: 'dòng triển khai' },
  { id: 'pthsp_full', ngay: 'ngay_hoan_thanh', ten: ['tính phiếu', 'phiếu đã tính'], dong: 'dòng tính phiếu' },
];

const SX = 'production_status_app';
const kyCua = (k: Ky) => ({ tu: k.tu, den: k.den });
const xLoc = (...xs: string[]): Loc => ({ cot: 'xuong_chinh', op: 'bang', gt: xs });
const ctLoc = (ten: string): Loc => ({ cot: 'ten_cong_trinh', op: 'chua', gt: ten });
const maLoc = (ma: string): Loc => ({ cot: 'ten_cong_trinh', op: 'chua', gt: [ma] });
const conLai: Loc = { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 };
/** Vướng mắc "đang mở / chưa xong" = Mới + Đang xử lý (hieuTruyVan KHAI_NIEM vuong_mac — cùng cách đếm open của trang Vướng mắc) */
const vmDangMo: Loc = { cot: 'status', op: 'bang', gt: ['Mới', 'Đang xử lý'] };
/** Cột PM của bảng: đơn hàng / sản xuất có sẵn, bảng khác nối từ bảng sản xuất */
const pmCot = (bang: string) => (bang === 'dht' || bang === SX ? 'ten_pm' : 'sx:ten_pm');
/** Cột tiền chính của thẻ */
const tienCot = (bang: string) => ({ nhap_kho: 'thanh_tien_nhap_kho', xuat_kho: 'thanh_tien_xuat_kho' } as Record<string, string>)[bang] ?? 'tri_gia_don_hang_tong';
/** Cột PC của bảng: đơn hàng có sẵn, bảng khác nối từ bảng sản xuất */
const pcCot = (bang: string) => (bang === 'dht' || bang === SX ? 'ten_pc' : 'sx:ten_pc');
const quaHanGiao: Loc[] = [{ cot: 'ngay_can_giao', op: 'nho_hon', gt: '2026-10-19' }, conLai];
/** Kỳ câu trả lời mẫu đọc được (hieuCauHoi.docKy) — quý / năm 2025 / tháng 9/2025 thì phải tự tra */
const KY_MAU = new Set(['hôm nay', 'hôm qua', 'tuần này', 'tuần trước', 'tháng này', 'tháng trước', 'tháng 9', 'tháng 8', 'tháng 3', 'năm nay', '7 ngày qua', '30 ngày', 'từ 1/9 đến 15/9']);
const mauHay = (y: Y, bang: string, d: { ky: Ky }, them: Partial<Extract<KyVong, { loai: 'tu_tra' }>> = {}): KyVong =>
  (KY_MAU.has(d.ky.noi) ? { loai: 'mau', y } : { loai: 'tu_tra', bang, ky: { tu: d.ky.tu, den: d.ky.den }, ...them });
const tt = (bang: string, r: Omit<Extract<KyVong, { loai: 'tu_tra' }>, 'loai' | 'bang'> = {}): KyVong => ({ loai: 'tu_tra', bang, ...r });
/** Số tuần nói trong câu ("tuần 43") — dùng cho mẫu cố định không điền {ky} */
const soTuan = (cau: string) => Number(/tuần (\d+)/.exec(cau)?.[1]);

export const MAU_CAU: MauCau[] = [
  // ======================= CÂU QUEN THUỘC (câu trả lời mẫu) =======================
  { id: 'm-nhap-ky', nhom: 'mẫu', dung: ['ky'], cau: ['nhập kho {ky}', 'nhập kho {ky} được bao nhiêu', '{ky} nhập kho bao nhiêu', 'giá trị nhập kho {ky}'], kv: d => mauHay('nhap_kho', 'nhap_kho', d) },
  { id: 'm-xuat-ky', nhom: 'mẫu', dung: ['ky'], cau: ['xuất kho {ky}', 'xuất kho {ky} bao nhiêu tiền', '{ky} giao hàng được bao nhiêu'], kv: d => mauHay('xuat_kho', 'xuat_kho', d) },
  { id: 'm-don-ky', nhom: 'mẫu', dung: ['ky'], cau: ['đơn hàng mới {ky}', 'có bao nhiêu đơn hàng mới {ky}', 'P001 {ky}'], kv: d => mauHay('don_hang', 'dht', d) },
  { id: 'm-tk-ky', nhom: 'mẫu', dung: ['ky'], cau: ['triển khai bản vẽ {ky}', 'P002 {ky}'], kv: d => mauHay('trien_khai', 'tkbv_full', d) },
  { id: 'm-phieu-ky', nhom: 'mẫu', dung: ['ky'], cau: ['tính phiếu {ky}', 'P012 {ky} được bao nhiêu'], kv: d => mauHay('tinh_phieu', 'pthsp_full', d) },
  { id: 'm-nhap-xuong', nhom: 'mẫu', dung: ['ky'], cau: ['nhập kho theo xưởng {ky}', 'nhập kho {ky} theo từng xưởng', 'xưởng nào nhập kho nhiều nhất {ky}'], kv: d => mauHay('nhap_kho', 'nhap_kho', d, { nhom: ['xuong_chinh'] }) },
  { id: 'm-xuat-ct', nhom: 'mẫu', dung: ['ky'], cau: ['xuất kho theo công trình {ky}', 'công trình nào xuất kho nhiều nhất {ky}'], kv: d => mauHay('xuat_kho', 'xuat_kho', d, { nhom: ['ten_cong_trinh'] }) },
  { id: 'm-nhap-x', nhom: 'mẫu', dung: ['x', 'ky'], cau: ['nhập kho xưởng {x} {ky}', 'xưởng {x} {ky} nhập bao nhiêu', '{x} nhập kho {ky}'], kv: d => mauHay('nhap_kho', 'nhap_kho', d, { loc: [xLoc(d.x)] }) },
  { id: 'm-ton', nhom: 'mẫu', cau: ['tồn kho', 'tồn kho hiện tại', 'tồn kho bao nhiêu', 'giá trị tồn kho'], kv: () => ({ loai: 'mau', y: 'ton_kho' }) },
  { id: 'm-tien-do-nam', nhom: 'mẫu', cau: ['tiến độ kế hoạch năm', 'kế hoạch năm đạt bao nhiêu', 'tiến độ năm nay', 'doanh thu năm nay đạt bao nhiêu kế hoạch'], kv: () => ({ loai: 'mau', y: 'tien_do_nam' }) },
  { id: 'm-kh-thang', nhom: 'mẫu', cau: ['kế hoạch tháng này', 'tiến độ tháng này', 'kế hoạch tháng 10'], kv: () => ({ loai: 'mau', y: 'tien_do_thang' }) },
  { id: 'm-kh-tuan', nhom: 'mẫu', cau: ['kế hoạch tuần 42', 'kế hoạch tuần này', 'kh tuần 41'], kv: () => ({ loai: 'mau', y: 'ke_hoach_tuan' }) },
  { id: 'm-nghen', nhom: 'mẫu', cau: ['điểm nghẽn ở đâu', 'điểm nghẽn', 'hàng đang kẹt ở đâu'], kv: () => ({ loai: 'mau', y: 'diem_nghen' }) },
  { id: 'm-the-sx', nhom: 'mẫu', cau: ['chưa thể sản xuất bao nhiêu', 'có thể sản xuất', 'hàng chưa thể sản xuất'], kv: () => ({ loai: 'mau', y: 'co_the_sx' }) },
  { id: 'm-vm', nhom: 'mẫu', cau: ['vướng mắc quá hạn', 'vướng mắc đang mở', 'có bao nhiêu vướng mắc'], kv: () => ({ loai: 'mau', y: 'vuong_mac' }) },
  { id: 'm-hex', nhom: 'mẫu', cau: ['260816258', 'tra hex 260816258', '260816258 nhập kho chưa', 'hex 251012933 đang ở đâu'], kv: () => ({ loai: 'mau', y: 'tra_hex' }) },
  { id: 'm-ct', nhom: 'mẫu', dung: ['ma'], cau: ['công trình {ma}', '{ma} thế nào', 'tình hình công trình {ma}'], kv: () => ({ loai: 'mau', y: 'cong_trinh' }) },
  { id: 'm-mra', nhom: 'mẫu', dung: ['x'], cau: ['giờ công xưởng {x} tuần này', 'giờ công {x} tháng này', 'tỷ lệ có việc xưởng {x}'], kv: () => ({ loai: 'mau', y: 'mra' }) },

  // ======================= BẢNG DÒNG CHẢY (nhập / xuất / đơn hàng / triển khai / tính phiếu) =======================
  { id: 'd-tuan', nhom: 'chia theo thời gian', dung: ['b', 'ky'], cau: ['{b} theo tuần {ky}', '{b} {ky} theo từng tuần', '{b} chia theo tuần {ky}'],
    kv: d => tt(d.b.id, { nhom: [`${d.b.ngay}@tuan`], ky: kyCua(d.ky) }) },
  { id: 'd-ngay', nhom: 'chia theo thời gian', dung: ['b', 'ky'], cau: ['{b} mỗi ngày {ky}', '{b} theo ngày {ky}', '{b} {ky} từng ngày'],
    kv: d => tt(d.b.id, { nhom: [`${d.b.ngay}@ngay`], ky: kyCua(d.ky) }) },
  { id: 'd-thang', nhom: 'chia theo thời gian', dung: ['b'], cau: ['{b} theo tháng năm nay', '{b} từng tháng năm nay', 'tháng nào năm nay {b} cao nhất'],
    kv: d => tt(d.b.id, { nhom: [`${d.b.ngay}@thang`], ky: kyCua(KY[12]) }) },
  { id: 'd-kh', nhom: 'nối bảng sản xuất', dung: ['b', 'kh', 'ky'], cau: ['{b} của {kh} {ky}', '{b} khách hàng {kh} {ky}', '{kh} {b} {ky} bao nhiêu'],
    kv: d => tt(d.b.id, { loc: [{ cot: d.b.id === SX ? 'khach_hang' : 'sx:khach_hang', op: 'bang', gt: [d.kh] }], ky: kyCua(d.ky) }) },
  { id: 'd-theo-kh', nhom: 'nối bảng sản xuất', dung: ['b', 'ky'], cau: ['{b} theo khách hàng {ky}', 'khách hàng nào {b} nhiều nhất {ky}'],
    kv: d => tt(d.b.id, { nhom: ['sx:khach_hang'], ky: kyCua(d.ky) }) },
  { id: 'd-theo-nsp', nhom: 'nối bảng sản xuất', dung: ['b', 'ky'], cau: ['{b} theo nhóm sản phẩm {ky}', '{b} {ky} chia theo nhóm sản phẩm'],
    kv: d => tt(d.b.id, { nhom: ['sx:phan_loai_nhom_san_pham'], ky: kyCua(d.ky) }) },
  { id: 'd-nsp', nhom: 'nối bảng sản xuất', dung: ['b', 'nsp', 'ky'], cau: ['{b} hàng {nsp} {ky}', '{b} {ky} của nhóm {nsp}'],
    kv: d => tt(d.b.id, { loc: [{ cot: 'sx:phan_loai_nhom_san_pham', op: 'bang', gt: [d.nsp[1]] }], ky: kyCua(d.ky) }) },
  { id: 'd-top-ct', nhom: 'xếp hạng', dung: ['b', 'ky', 'n'], cau: ['top {n} công trình {b} nhiều nhất {ky}', 'top {n} công trình {b} {ky}'],
    kv: d => tt(d.b.id, { nhom: ['ten_cong_trinh'], gioiHan: d.n, ky: kyCua(d.ky) }) },
  { id: 'd-it-x', nhom: 'xếp hạng', dung: ['b', 'ky'], cau: ['xưởng nào {b} ít nhất {ky}', '{ky} xưởng nào {b} thấp nhất'],
    kv: d => tt(d.b.id, { nhom: ['xuong_chinh'], sapTang: true, ky: kyCua(d.ky) }) },
  { id: 'd-ct-thang', nhom: 'công trình', dung: ['b', 'ct'], cau: ['{b} công trình {ct} theo tháng', '{b} của {ct} theo tháng', '{ct} {b} từng tháng'],
    kv: d => tt(d.b.id, { loc: [ctLoc(d.ct)], nhom: [`${d.b.ngay}@thang`], ky: null }) },
  { id: 'd-ma', nhom: 'công trình', dung: ['b', 'ma', 'ky'], cau: ['{b} {ma} {ky}', '{b} của {ma} {ky}', '{ma} {b} {ky} bao nhiêu'],
    kv: d => tt(d.b.id, { loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'd-so-sanh', nhom: 'so sánh / bình quân', dung: ['b'], cau: ['{b} {ky} so với {ky2}', 'so sánh {b} {ky} và {ky2}', '{b} {ky} vs {ky2}'],
    kv: d => tt(d.b.id, { ky: kyCua(d.ky), soSanh: kyCua(d.ky2) }) },
  { id: 'd-chenh-giam', nhom: 'so sánh / bình quân', dung: [], cau: ['xưởng nào giảm nhập kho nhiều nhất so với tháng trước', 'xưởng nào giảm nhập kho nhiều nhất tháng này', 'xưởng nào nhập kho sụt giảm mạnh nhất so với tháng trước'],
    kv: () => tt('nhap_kho', { nhom: ['xuong_chinh'], ky: kyCua(KY[4]), soSanh: kyCua(KY[5]), sapChenh: 'giam' }) },
  { id: 'd-chenh-tang', nhom: 'so sánh / bình quân', dung: [], cau: ['xưởng nào nhập kho tăng nhiều nhất so với tháng trước', 'xưởng nào tăng nhập kho nhiều nhất tháng này'],
    kv: () => tt('nhap_kho', { nhom: ['xuong_chinh'], ky: kyCua(KY[4]), soSanh: kyCua(KY[5]), sapChenh: 'tang' }) },
  { id: 'd-bq-ngay', nhom: 'so sánh / bình quân', dung: ['b', 'ky'], cau: ['bình quân mỗi ngày {b} {ky}', 'trung bình mỗi ngày {b} bao nhiêu {ky}', '{b} trung bình 1 ngày {ky}'],
    kv: d => tt(d.b.id, { binhQuan: 'ngay', nhom: [`${d.b.ngay}@ngay`], ky: kyCua(d.ky) }) },
  { id: 'd-bq-tuan', nhom: 'so sánh / bình quân', dung: ['b'], cau: ['bình quân mỗi tuần {b} năm nay', '{b} trung bình mỗi tuần năm nay'],
    kv: d => tt(d.b.id, { binhQuan: 'tuan', nhom: [`${d.b.ngay}@tuan`], ky: kyCua(KY[12]) }) },
  { id: 'd-so-hex', nhom: 'phép tính', dung: ['b', 'x', 'ky'], cau: ['số hex {b} xưởng {x} {ky}', 'bao nhiêu hex {b} xưởng {x} {ky}', 'đếm số hex {b} {x} {ky}'],
    kv: d => tt(d.b.id, { do: [{ ham: 'dem_khac', cot: 'hex' }], loc: [xLoc(d.x)], ky: kyCua(d.ky) }) },
  { id: 'd-2x', nhom: 'lọc xưởng', dung: ['b', 'x', 'x2', 'ky'], cau: ['{b} xưởng {x} và {x2} {ky}, chia theo tháng', '{b} {x} và {x2} {ky} theo tháng'],
    kv: d => tt(d.b.id, { loc: [xLoc(d.x, d.x2)], nhom: [`${d.b.ngay}@thang`], ky: kyCua(d.ky) }) },
  { id: 'd-liet-ke', nhom: 'liệt kê', dung: ['b', 'x', 'ky'], cau: ['liệt kê {b} xưởng {x} {ky}', 'danh sách {b} {ky} xưởng {x}', 'chi tiết {b} {x} {ky}'],
    kv: d => tt(d.b.id, { kieu: 'dong', loc: [xLoc(d.x)], ky: kyCua(d.ky) }) },
  { id: 'd-tat-ca', nhom: 'chia theo thời gian', dung: ['b'], cau: ['{b} theo năm tất cả', '{b} từng năm từ trước tới nay'],
    kv: d => tt(d.b.id, { nhom: [`${d.b.ngay}@nam`], ky: null }) },
  { id: 'd-kh-x', nhom: 'nối bảng sản xuất', dung: ['b', 'kh', 'ky'], cau: ['{b} của {kh} theo xưởng {ky}', '{kh} {b} theo xưởng {ky}'],
    kv: d => tt(d.b.id, { loc: [{ cot: 'sx:khach_hang', op: 'bang', gt: [d.kh] }], nhom: ['xuong_chinh'], ky: kyCua(d.ky) }) },

  // ---- Đơn hàng
  { id: 'dh-pm', nhom: 'người', dung: ['ky'], cau: ['đơn hàng theo PM {ky}', 'PM nào nhiều đơn nhất {ky}', 'đơn hàng mới {ky} theo từng PM'],
    kv: d => tt('dht', { nhom: ['ten_pm'], ky: kyCua(d.ky) }) },
  { id: 'dh-pc', nhom: 'người', dung: ['ky'], cau: ['đơn hàng theo PC {ky}', 'PC nào nhận nhiều đơn nhất {ky}'],
    kv: d => tt('dht', { nhom: ['ten_pc'], ky: kyCua(d.ky) }) },
  { id: 'dh-cua-pm', nhom: 'người', dung: ['pm', 'ky'], cau: ['đơn hàng của PM {pm} {ky}', 'pm {pm} có bao nhiêu đơn {ky}', 'đơn hàng {pm} {ky}'],
    kv: d => tt('dht', { loc: [{ cot: 'ten_pm', op: 'bang', gt: [d.pm] }], ky: kyCua(d.ky) }) },
  { id: 'dh-tren', nhom: 'lọc số', dung: ['n', 'ky'], cau: ['đơn hàng trị giá trên {n} tỷ {ky}', 'đơn hàng lớn hơn {n} tỷ {ky}', 'có bao nhiêu đơn hàng trên {n} tỷ {ky}'],
    kv: d => tt('dht', { loc: [{ cot: 'tri_gia_don_hang_tong', op: 'lon_hon', gt: d.n * 1000 }], ky: kyCua(d.ky) }) },
  { id: 'dh-tren-lk', nhom: 'liệt kê', dung: ['n', 'ky'], cau: ['liệt kê đơn hàng trị giá trên {n} tỷ {ky}', 'danh sách đơn hàng trên {n} tỷ {ky}'],
    kv: d => tt('dht', { kieu: 'dong', loc: [{ cot: 'tri_gia_don_hang_tong', op: 'lon_hon', gt: d.n * 1000 }], ky: kyCua(d.ky) }) },
  { id: 'dh-tb', nhom: 'phép tính', dung: ['ky'], cau: ['trung bình trị giá đơn hàng theo xưởng {ky}', 'trị giá đơn hàng trung bình theo xưởng {ky}'],
    kv: d => tt('dht', { do: [{ ham: 'tb', cot: 'tri_gia_don_hang_tong' }], nhom: ['xuong_chinh'], ky: kyCua(d.ky) }) },
  { id: 'dh-khu-vuc', nhom: 'chia theo cột', dung: ['ky'], cau: ['đơn hàng theo khu vực {ky}', 'đơn hàng {ky} chia theo khu vực'],
    kv: d => tt('dht', { nhom: ['khu_vuc'], ky: kyCua(d.ky) }) },

  // ---- Triển khai bản vẽ / tính phiếu
  { id: 'tk-nguoi', nhom: 'người', dung: ['ky'], cau: ['triển khai bản vẽ theo người triển khai {ky}', 'ai triển khai nhiều bản vẽ nhất {ky}'],
    kv: d => tt('tkbv_full', { nhom: ['nguoi_trien_khai'], ky: kyCua(d.ky) }) },
  { id: 'tk-cua', nhom: 'người', dung: ['ntk', 'ky'], cau: ['bản vẽ triển khai của {ntk} {ky}', '{ntk} triển khai bao nhiêu bản vẽ {ky}'],
    kv: d => tt('tkbv_full', { loc: [{ cot: 'nguoi_trien_khai', op: 'bang', gt: [d.ntk] }], ky: kyCua(d.ky) }) },
  { id: 'ph-tinh-trang', nhom: 'chia theo cột', dung: ['ky'], cau: ['tính phiếu theo tình trạng phiếu {ky}', 'phiếu {ky} chia theo tình trạng phiếu'],
    kv: d => tt('pthsp_full', { nhom: ['tinh_trang_phieu'], ky: kyCua(d.ky) }) },
  { id: 'ph-dai-tra', nhom: 'giá trị', dung: ['ky'], cau: ['phiếu sx đại trà {ky}', 'tính phiếu sx đại trà {ky} theo xưởng'],
    kv: d => tt('pthsp_full', { loc: [{ cot: 'tinh_trang_phieu', op: 'bang', gt: ['2.PHIẾU SX ĐẠI TRÀ'] }], ky: kyCua(d.ky) }) },

  // ======================= SẢN XUẤT (HẠNG MỤC) =======================
  { id: 'sx-chua-tk', nhom: 'giá trị', cau: ['có bao nhiêu hạng mục chưa triển khai', 'số hạng mục chưa triển khai', 'bao nhiêu hạng mục đang chưa triển khai'],
    kv: () => tt(SX, { do: [{ ham: 'dem' }], loc: [{ cot: 'tinh_trang', op: 'bang', gt: ['15. CHƯA TRIỂN KHAI'] }], ky: null }) },
  { id: 'sx-chua-tk-x', nhom: 'giá trị', cau: ['hạng mục chưa triển khai theo xưởng', 'chưa triển khai theo từng xưởng'],
    kv: () => tt(SX, { nhom: ['xuong_chinh'], loc: [{ cot: 'tinh_trang', op: 'bang', gt: ['15. CHƯA TRIỂN KHAI'] }], ky: null }) },
  { id: 'sx-cd-x', nhom: 'giá trị', dung: ['cd'], cau: ['hạng mục đang ở công đoạn {cd} theo xưởng', 'hạng mục đang ở {cd} theo xưởng', '{cd} theo xưởng'],
    kv: d => tt(SX, { nhom: ['xuong_chinh'], loc: [{ cot: 'tinh_trang', op: 'bang', gt: [d.cd[1]] }], ky: null }) },
  { id: 'sx-nsp-cd', nhom: 'giá trị', dung: ['nsp', 'cd'], cau: ['{nsp} ở công đoạn {cd}', 'bao nhiêu {nsp} đang ở {cd}', '{nsp} đang nằm ở {cd}'],
    kv: d => tt(SX, { loc: [{ cot: 'tinh_trang', op: 'bang', gt: [d.cd[1]] }, { cot: 'phan_loai_nhom_san_pham', op: 'bang', gt: [d.nsp[1]] }], ky: null }) },
  { id: 'sx-cd-x-loc', nhom: 'giá trị', dung: ['cd', 'x'], cau: ['có bao nhiêu hạng mục đang ở {cd} xưởng {x}', 'xưởng {x} có bao nhiêu hạng mục ở {cd}'],
    kv: d => tt(SX, { do: [{ ham: 'dem' }], loc: [{ cot: 'tinh_trang', op: 'bang', gt: [d.cd[1]] }, xLoc(d.x)], ky: null }) },
  { id: 'sx-theo-cd', nhom: 'chia theo cột', dung: ['x'], cau: ['hạng mục xưởng {x} theo công đoạn', 'xưởng {x} chia theo công đoạn hiện tại'],
    kv: d => tt(SX, { nhom: ['tinh_trang'], loc: [xLoc(d.x)], ky: null }) },
  { id: 'sx-qh', nhom: 'khái niệm', cau: ['có bao nhiêu hạng mục quá hạn giao', 'số hạng mục trễ hạn giao', 'bao nhiêu hạng mục giao trễ'],
    kv: () => tt(SX, { do: [{ ham: 'dem' }], loc: quaHanGiao, ky: null }) },
  { id: 'sx-qh-theo', nhom: 'khái niệm', cau: ['hạng mục quá hạn giao theo xưởng', 'hạng mục trễ hạn theo xưởng', 'quá hạn giao theo từng xưởng'],
    kv: () => tt(SX, { nhom: ['xuong_chinh'], loc: quaHanGiao, ky: null }) },
  { id: 'sx-qh-pm', nhom: 'khái niệm', cau: ['hạng mục quá hạn giao theo PM', 'ai là PM nhiều hạng mục quá hạn nhất', 'PM nào có nhiều hạng mục trễ hạn nhất'],
    kv: () => tt(SX, { nhom: ['ten_pm'], loc: quaHanGiao, ky: null }) },
  { id: 'sx-qh-kh', nhom: 'khái niệm', dung: ['kh', 'n'], cau: ['hạng mục quá hạn giao của {kh} theo công trình top {n}', '{kh} quá hạn giao theo công trình top {n}'],
    kv: d => tt(SX, { nhom: ['ten_cong_trinh'], loc: [...quaHanGiao, { cot: 'khach_hang', op: 'bang', gt: [d.kh] }], gioiHan: d.n, ky: null }) },
  { id: 'sx-qh-x-lk', nhom: 'khái niệm', dung: ['x'], cau: ['danh sách hex quá hạn giao xưởng {x}', 'liệt kê hạng mục quá hạn giao xưởng {x}'],
    kv: d => tt(SX, { kieu: 'dong', loc: [...quaHanGiao, xLoc(d.x)], ky: null }) },
  { id: 'sx-chua-nk-ma', nhom: 'khái niệm', dung: ['ma'], cau: ['{ma} còn bao nhiêu hạng mục chưa nhập kho', 'công trình {ma} còn bao nhiêu hạng mục chưa nhập kho', 'số hạng mục chưa nhập kho của {ma}'],
    kv: d => tt(SX, { do: [{ ham: 'dem' }], loc: [conLai, maLoc(d.ma)], ky: null }) },
  { id: 'sx-chua-nk-hex', nhom: 'khái niệm', dung: ['ma'], cau: ['những hex nào của {ma} chưa nhập kho', 'các hex chưa nhập kho của {ma}'],
    kv: d => tt(SX, { kieu: 'dong', loc: [conLai, maLoc(d.ma)], ky: null }) },
  { id: 'sx-kh-con', nhom: 'khái niệm', dung: ['kh'], cau: ['{kh} còn bao nhiêu chưa nhập kho', 'khách hàng {kh} còn lại bao nhiêu chưa nhập'],
    kv: d => tt(SX, { loc: [conLai, { cot: 'khach_hang', op: 'bang', gt: [d.kh] }], ky: null }) },
  { id: 'sx-ct-con', nhom: 'công trình', dung: ['ct'], cau: ['dự án {ct} còn lại bao nhiêu', 'công trình {ct} còn lại bao nhiêu'],
    kv: d => tt(SX, { coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, loc: [ctLoc(d.ct)], ky: null }) },
  { id: 'sx-ct-chua-nk', nhom: 'công trình', dung: ['ct'], cau: ['công trình {ct} còn bao nhiêu chưa nhập kho', '{ct} còn bao nhiêu chưa nhập kho'],
    kv: d => tt(SX, { coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, loc: [conLai, ctLoc(d.ct)], ky: null }) },
  { id: 'sx-kh-nhieu', nhom: 'xếp hạng', cau: ['khách hàng nào còn nhiều giá trị chưa nhập nhất', 'khách hàng nào còn lại nhiều nhất'],
    kv: () => tt(SX, { nhom: ['khach_hang'], coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, ky: null }) },
  { id: 'sx-ct-nhieu', nhom: 'xếp hạng', cau: ['công trình nào còn nhiều giá trị chưa nhập kho nhất', 'công trình nào còn lại nhiều nhất'],
    kv: () => tt(SX, { nhom: ['ten_cong_trinh'], coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, ky: null }) },
  { id: 'sx-nsp-x', nhom: 'chia theo cột', cau: ['giá trị còn lại theo nhóm sản phẩm và xưởng', 'còn lại theo nhóm sản phẩm và xưởng'],
    kv: () => tt(SX, { nhom: ['phan_loai_nhom_san_pham', 'xuong_chinh'], coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, ky: null }) },
  { id: 'sx-khong-kh', nhom: 'khái niệm', cau: ['có bao nhiêu hạng mục không có kế hoạch', 'hạng mục chưa có kế hoạch nhập kho', 'bao nhiêu hạng mục ngoài kế hoạch'],
    kv: () => tt(SX, { loc: [{ cot: 'ngay_khnk_thang', op: 'rong' }, { cot: 'ngay_khnk_tuan', op: 'rong' }, conLai], ky: null }) },
  { id: 'sx-khong-kh-x', nhom: 'khái niệm', cau: ['hạng mục không có kế hoạch theo xưởng', 'không có kế hoạch theo từng xưởng'],
    kv: () => tt(SX, { nhom: ['xuong_chinh'], loc: [{ cot: 'ngay_khnk_thang', op: 'rong' }, { cot: 'ngay_khnk_tuan', op: 'rong' }, conLai], ky: null }) },
  { id: 'sx-chua-phieu', nhom: 'khái niệm', cau: ['hạng mục chưa có phiếu', 'bao nhiêu hạng mục chưa tính phiếu'],
    kv: () => tt(SX, { loc: [{ cot: 'tinh_trang_phieu', op: 'bang', gt: ['CHƯA PHIẾU'] }], ky: null }) },
  { id: 'sx-pc', nhom: 'người', dung: ['ma'], cau: ['ai là PC của {ma}', '{ma} ai là PC', 'PC của {ma} là ai'],
    kv: d => tt(SX, { nhom: ['ten_pc'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'sx-pm', nhom: 'người', dung: ['ma'], cau: ['ai là PM của {ma}', 'PM của {ma} là ai', '{ma} PM là ai'],
    kv: d => tt(SX, { nhom: ['ten_pm'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'sx-pm-ct', nhom: 'người', dung: ['ct'], cau: ['ai là PM công trình {ct}', 'PM của {ct} là ai'],
    kv: d => tt(SX, { nhom: ['ten_pm'], loc: [ctLoc(d.ct)], ky: null }) },
  { id: 'sx-cua-pm', nhom: 'người', dung: ['pmsx'], cau: ['hạng mục của PM {pmsx} chưa nhập kho', '{pmsx} còn bao nhiêu hạng mục chưa nhập kho'],
    kv: d => tt(SX, { loc: [conLai, { cot: 'ten_pm', op: 'bang', gt: [d.pmsx] }], ky: null }) },
  { id: 'sx-cua-pc', nhom: 'người', dung: ['pcsx'], cau: ['hạng mục quá hạn giao của PC {pcsx}', 'PC {pcsx} có bao nhiêu hạng mục quá hạn giao'],
    kv: d => tt(SX, { loc: [...quaHanGiao, { cot: 'ten_pc', op: 'bang', gt: [d.pcsx] }], ky: null }) },
  { id: 'sx-con-tren', nhom: 'lọc số', dung: ['n'], cau: ['hạng mục giá trị còn lại trên {n} tỷ', 'số hạng mục có giá trị còn lại lớn hơn {n} tỷ theo xưởng'],
    kv: d => tt(SX, { loc: [{ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: d.n * 1000 }], ky: null }) },
  { id: 'sx-ghe-ct', nhom: 'giá trị', dung: ['nsp', 'ct'], cau: ['hạng mục {nsp} của {ct} còn lại bao nhiêu', '{nsp} công trình {ct} còn lại bao nhiêu'],
    kv: d => tt(SX, { loc: [{ cot: 'phan_loai_nhom_san_pham', op: 'bang', gt: [d.nsp[1]] }, ctLoc(d.ct)], ky: null }) },
  { id: 'sx-kh-theo', nhom: 'chia theo cột', cau: ['sản xuất theo khách hàng', 'hạng mục theo khách hàng', 'hạng mục theo khu vực dự án'],
    kv: () => tt(SX, { ky: null }) },
  { id: 'sx-thoi-gian', nhom: 'chia theo cột', dung: ['x'], cau: ['số hạng mục theo thời gian ở công đoạn xưởng {x}', 'hạng mục xưởng {x} theo thời gian ở công đoạn'],
    kv: d => tt(SX, { nhom: ['so_ngay_cd_hien_tai'], loc: [xLoc(d.x)], ky: null }) },

  // ======================= VẬT TƯ =======================
  { id: 'vt-chua-mua', nhom: 'giá trị', cau: ['vật tư chưa mua theo công trình', 'PR chưa mua theo công trình', 'vật tư chưa mua theo từng công trình'],
    kv: () => tt('vat_tu', { nhom: ['ten_cong_trinh'], loc: [{ cot: 'trang_thai', op: 'bang', gt: ['1.CHƯA MUA'] }], ky: null }) },
  { id: 'vt-tre', nhom: 'khái niệm', cau: ['có bao nhiêu PR đang mua trễ hẹn', 'PR đang mua trễ hẹn', 'vật tư đang mua quá hẹn'],
    kv: () => tt('vat_tu', { loc: [{ cot: 'ngay_du_kien_giao_hang_pmh_nhap', op: 'nho_hon', gt: '2026-10-19' }, { cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }, { cot: 'trang_thai', op: 'bang', gt: ['2.ĐANG MUA'] }], ky: null }) },
  { id: 'vt-tre-nhom', nhom: 'khái niệm', cau: ['PR trễ hẹn theo nhóm vật tư', 'vật tư trễ hẹn theo nhóm vật tư'],
    kv: () => tt('vat_tu', { nhom: ['nhom_vt'], loc: [{ cot: 'ngay_du_kien_giao_hang_pmh_nhap', op: 'nho_hon', gt: '2026-10-19' }, { cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }], ky: null }) },
  { id: 'vt-nhom-chua-ve', nhom: 'giá trị', dung: ['nvt'], cau: ['{nvt} chưa về', 'vật tư {nvt} chưa về', 'vật tư nhóm {nvt} chưa về theo công trình'],
    kv: d => tt('vat_tu', { loc: [{ cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }, { cot: 'nhom_vt', op: 'bang', gt: [d.nvt[1]] }], ky: null }) },
  { id: 'vt-ct-chua-mua', nhom: 'công trình', dung: ['ct'], cau: ['PR của {ct} chưa mua', 'vật tư {ct} chưa mua', 'PR công trình {ct} chưa mua'],
    kv: d => tt('vat_tu', { loc: [{ cot: 'trang_thai', op: 'bang', gt: ['1.CHƯA MUA'] }, ctLoc(d.ct)], ky: null }) },
  { id: 'vt-ma-tt', nhom: 'công trình', dung: ['ma'], cau: ['PR công trình {ma} theo trạng thái', 'vật tư {ma} theo trạng thái'],
    kv: d => tt('vat_tu', { nhom: ['trang_thai'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'vt-ncc', nhom: 'khái niệm', cau: ['nhà cung cấp nào giao trễ nhiều nhất', 'nhà cung cấp nào trễ hẹn nhiều nhất', 'PR trễ hẹn theo nhà cung cấp'],
    kv: () => tt('vat_tu', { nhom: ['nha_cung_cap'], loc: [{ cot: 'ngay_du_kien_giao_hang_pmh_nhap', op: 'nho_hon', gt: '2026-10-19' }, { cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }], ky: null }) },
  { id: 'vt-top', nhom: 'xếp hạng', dung: ['n'], cau: ['vật tư theo nhóm vật tư top {n}', 'top {n} nhóm vật tư nhiều PR nhất'],
    kv: d => tt('vat_tu', { nhom: ['nhom_vt'], gioiHan: d.n, ky: null }) },

  // ======================= TỒN KHO =======================
  { id: 'tn-top', nhom: 'xếp hạng', dung: ['n'], cau: ['tồn kho theo công trình top {n}', 'top {n} công trình tồn kho nhiều nhất', 'công trình nào tồn kho nhiều nhất'],
    kv: () => tt('ton_kho', { nhom: ['ten_cong_trinh'], ky: null }) },
  { id: 'tn-ct', nhom: 'công trình', dung: ['ct'], cau: ['tồn kho của {ct}', 'tồn kho công trình {ct}', '{ct} còn tồn bao nhiêu'],
    kv: d => tt('ton_kho', { loc: [ctLoc(d.ct)], ky: null }) },
  { id: 'tn-kh', nhom: 'nối bảng sản xuất', dung: ['kh'], cau: ['tồn kho của {kh}', 'tồn kho khách hàng {kh}'],
    kv: d => tt('ton_kho', { loc: [{ cot: 'sx:khach_hang', op: 'bang', gt: [d.kh] }], ky: null }) },
  { id: 'tn-thang', nhom: 'khái niệm', dung: ['n'], cau: ['tồn kho trên {n} tháng', 'hàng tồn hơn {n} tháng', 'tồn kho quá {n} tháng theo công trình'],
    kv: d => tt('ton_kho', { loc: [{ cot: 'so_thang_ton_kho', op: 'lon_hon', gt: d.n }], ky: null }) },
  { id: 'tn-lau', nhom: 'khái niệm', cau: ['hàng tồn lâu nhất', 'tồn kho lâu nhất', 'mã nào tồn lâu nhất'],
    kv: () => tt('ton_kho', { kieu: 'dong', ky: null }) },
  { id: 'tn-nhom-ct', nhom: 'chia theo cột', cau: ['giá trị tồn kho theo nhóm công trình', 'tồn kho theo nhóm công trình'],
    kv: () => tt('ton_kho', { nhom: ['nhom_ct'], ky: null }) },

  // ======================= ĐIỂM DANH / KẾ HOẠCH / VƯỚNG MẮC =======================
  { id: 'dd-x', nhom: 'chia theo cột', dung: ['ky'], cau: ['điểm danh theo xưởng {ky}', 'điểm danh {ky} theo từng xưởng'],
    kv: d => tt('diem_danh', { nhom: ['xuong_chinh'], ky: kyCua(d.ky) }) },
  { id: 'dd-tb', nhom: 'phép tính', dung: ['x', 'ky'], cau: ['trung bình số công nhân xưởng {x} {ky}', 'bình quân số công nhân xưởng {x} {ky}'],
    kv: d => tt('diem_danh', { do: [{ ham: 'tb', cot: 'so_luong_cong_nhan' }], loc: [xLoc(d.x)], ky: kyCua(d.ky) }) },
  { id: 'khsx-x', nhom: 'kế hoạch', cau: ['kế hoạch sản xuất theo xưởng tháng 11', 'khsx theo xưởng tháng 11'],
    kv: () => tt('khsx', { nhom: ['xuong_chinh'], ky: { tu: '2026-11-01', den: '2026-11-30' } }) },
  { id: 'khsx-nam', nhom: 'kế hoạch', cau: ['dữ liệu kế hoạch năm theo xưởng', 'mục tiêu năm theo xưởng'],
    kv: () => tt('khsx_nam', { nhom: ['xuong_chinh'], ky: { tu: '2026-01-01', den: '2026-12-31' } }) },
  { id: 'vm-nguoi', nhom: 'người', cau: ['vướng mắc theo người xử lý', 'vướng mắc chia theo người xử lý'],
    kv: () => tt('vuong_mac', { nhom: ['handler'] }) },
  { id: 'vm-qh-nguoi', nhom: 'người', cau: ['vướng mắc quá hạn theo người xử lý', 'ai đang có nhiều vướng mắc quá hạn nhất'],
    kv: () => tt('vuong_mac', { nhom: ['handler'], loc: [{ cot: 'qua_han', op: 'bang', gt: 'Quá hạn' }] }) },
  { id: 'vm-loai', nhom: 'chia theo cột', dung: ['ky'], cau: ['vướng mắc theo loại {ky}', 'vướng mắc {ky} chia theo loại vướng mắc'],
    kv: d => tt('vuong_mac', { nhom: ['category'], ky: kyCua(d.ky) }) },
  // "đang mở" đi tự tra (có chia / có công trình) phải lọc trạng thái như trang Vướng mắc — không đếm cả đã đóng
  { id: 'vm-mo-x', nhom: 'khái niệm', cau: ['vướng mắc đang mở theo xưởng', 'vướng mắc chưa xong theo xưởng', 'xưởng nào còn nhiều vướng mắc đang mở nhất'],
    kv: () => tt('vuong_mac', { nhom: ['xuong'], loc: [vmDangMo], ky: null }) },
  { id: 'vm-mo-ct', nhom: 'khái niệm', cau: ['vướng mắc đang mở theo công trình', 'công trình nào còn nhiều vướng mắc chưa xong nhất', 'vướng mắc chưa đóng chia theo công trình'],
    kv: () => tt('vuong_mac', { nhom: ['ten_cong_trinh'], loc: [vmDangMo], ky: null }) },
  // 1 công trình + đang mở: câu trả lời mẫu vướng mắc lọc được công trình và đếm đúng "đang mở" (cùng API trang) => vẫn là mẫu
  { id: 'm-vm-ma', nhom: 'mẫu', dung: ['ma'], cau: ['vướng mắc đang mở của {ma}', 'công trình {ma} còn bao nhiêu vướng mắc chưa xong'], kv: () => ({ loai: 'mau', y: 'vuong_mac' }) },

  // ======================= CÂU NỐI TIẾP (ngữ cảnh câu trước) =======================
  { id: 'nt-con-lai', nhom: 'ngữ cảnh', dung: ['ma'], truoc: '{ma} ai là PC', cau: ['còn bao nhiêu hạng mục chưa nhập kho', 'còn lại bao nhiêu chưa nhập kho'],
    kv: d => tt(SX, { loc: [conLai, maLoc(d.ma)], ky: null }) },
  { id: 'nt-nhap', nhom: 'ngữ cảnh', dung: ['ma', 'ky'], truoc: 'công trình {ma}', cau: ['nhập kho {ky}', 'còn nhập kho {ky} thì sao'],
    kv: d => tt('nhap_kho', { loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'nt-qh', nhom: 'ngữ cảnh', dung: ['x'], truoc: 'xưởng {x} có bao nhiêu hạng mục ở mộc', cau: ['bao nhiêu hạng mục quá hạn giao', 'hạng mục quá hạn giao'],
    kv: d => tt(SX, { loc: [...quaHanGiao, xLoc(d.x)], ky: null }) },
  { id: 'nt-tat-ca', nhom: 'ngữ cảnh', dung: ['ma'], truoc: '{ma} ai là PC', cau: ['tất cả còn bao nhiêu hạng mục chưa nhập kho', 'toàn nhà máy còn bao nhiêu hạng mục chưa nhập kho'],
    kv: () => tt(SX, { loc: [conLai], ky: null }) },

  // ======================= CÔNG TRÌNH (admin hỏi nhiều nhất) =======================
  { id: 'ct-b-x', nhom: 'công trình', dung: ['b', 'ct'], cau: ['{b} công trình {ct} theo xưởng', '{ct} {b} theo từng xưởng'],
    kv: d => tt(d.b.id, { loc: [ctLoc(d.ct)], nhom: ['xuong_chinh'], ky: null }) },
  { id: 'ct-b-ky', nhom: 'công trình', dung: ['b', 'ct', 'ky'], cau: ['{b} công trình {ct} {ky}', '{ct} {b} {ky} được bao nhiêu'],
    kv: d => tt(d.b.id, { loc: [ctLoc(d.ct)], ky: kyCua(d.ky) }) },
  { id: 'ct-hm-cd', nhom: 'công trình', dung: ['ct'], cau: ['hạng mục công trình {ct} theo công đoạn', 'công trình {ct} có bao nhiêu hạng mục ở từng công đoạn', '{ct} hạng mục chia theo công đoạn hiện tại'],
    kv: d => tt(SX, { nhom: ['tinh_trang'], loc: [ctLoc(d.ct)], ky: null }) },
  { id: 'ct-qh', nhom: 'công trình', dung: ['ct'], cau: ['công trình {ct} có bao nhiêu hạng mục quá hạn giao', '{ct} có bao nhiêu hạng mục trễ hạn giao'],
    kv: d => tt(SX, { loc: [...quaHanGiao, ctLoc(d.ct)], ky: null }) },
  { id: 'ct-ma-con-x', nhom: 'công trình', dung: ['ma'], cau: ['công trình {ma} còn lại bao nhiêu theo xưởng', '{ma} giá trị còn lại theo xưởng'],
    kv: d => tt(SX, { coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, nhom: ['xuong_chinh'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'ct-ma-lk', nhom: 'công trình', dung: ['ma'], cau: ['danh sách hạng mục công trình {ma}', 'liệt kê hạng mục của {ma}'],
    kv: d => tt(SX, { kieu: 'dong', loc: [maLoc(d.ma)], ky: null }) },
  { id: 'ct-nsp', nhom: 'công trình', dung: ['ct'], cau: ['công trình {ct} theo nhóm sản phẩm', 'hạng mục {ct} chia theo nhóm sản phẩm'],
    kv: d => tt(SX, { nhom: ['phan_loai_nhom_san_pham'], loc: [ctLoc(d.ct)], ky: null }) },
  { id: 'ct-chua-tk', nhom: 'công trình', dung: ['ma'], cau: ['công trình {ma} còn bao nhiêu hạng mục chưa triển khai', '{ma} có bao nhiêu hạng mục chưa triển khai'],
    kv: d => tt(SX, { loc: [{ cot: 'tinh_trang', op: 'bang', gt: ['15. CHƯA TRIỂN KHAI'] }, maLoc(d.ma)], ky: null }) },
  { id: 'ct-dh', nhom: 'công trình', dung: ['ct'], cau: ['đơn hàng của công trình {ct}', 'công trình {ct} có bao nhiêu đơn hàng'],
    kv: d => tt('dht', { loc: [ctLoc(d.ct)], ky: null }) },
  { id: 'ct-xuat-het', nhom: 'công trình', dung: ['ct'], cau: ['công trình {ct} đã xuất kho bao nhiêu', '{ct} xuất kho tổng cộng bao nhiêu'],
    kv: d => tt('xuat_kho', { loc: [ctLoc(d.ct)], ky: null }) },
  { id: 'ct-pm-x', nhom: 'người', dung: ['pmsx'], cau: ['hạng mục của PM {pmsx} theo xưởng', 'PM {pmsx} có bao nhiêu hạng mục theo từng xưởng'],
    kv: d => tt(SX, { nhom: ['xuong_chinh'], loc: [{ cot: 'ten_pm', op: 'bang', gt: [d.pmsx] }], ky: null }) },

  // ======================= HẠNG MỤC =======================
  { id: 'hm-bop', nhom: 'chia theo cột', cau: ['hạng mục theo BOP', 'giá trị còn lại theo BOP', 'hạng mục chia theo BOP'],
    kv: () => tt(SX, { nhom: ['bop'], ky: null }) },
  { id: 'hm-ipo', nhom: 'chia theo cột', cau: ['hạng mục theo tình trạng IPO', 'hạng mục chia theo tình trạng IPO'],
    kv: () => tt(SX, { nhom: ['tinh_trang_ipo'], ky: null }) },
  { id: 'hm-tkbv', nhom: 'chia theo cột', cau: ['hạng mục theo tình trạng triển khai bản vẽ', 'hạng mục chia theo tình trạng triển khai bản vẽ'],
    kv: () => tt(SX, { nhom: ['tinh_trang_trien_khai_ban_ve'], ky: null }) },
  { id: 'hm-x-nsp', nhom: 'chia theo cột', dung: ['x'], cau: ['hạng mục xưởng {x} theo nhóm sản phẩm', 'xưởng {x} chia theo nhóm sản phẩm'],
    kv: d => tt(SX, { nhom: ['phan_loai_nhom_san_pham'], loc: [xLoc(d.x)], ky: null }) },
  { id: 'hm-qh-x-dem', nhom: 'khái niệm', dung: ['x'], cau: ['xưởng {x} có bao nhiêu hạng mục quá hạn giao', 'hạng mục quá hạn giao xưởng {x}'],
    kv: d => tt(SX, { loc: [...quaHanGiao, xLoc(d.x)], ky: null }) },
  { id: 'hm-con-x', nhom: 'khái niệm', cau: ['hạng mục chưa nhập kho theo xưởng', 'giá trị chưa nhập kho theo xưởng', 'còn lại chưa nhập kho theo từng xưởng'],
    kv: () => tt(SX, { nhom: ['xuong_chinh'], loc: [conLai], ky: null }) },

  // ======================= XUẤT / NHẬP / TỒN / ĐƠN HÀNG =======================
  { id: 'nx-sl', nhom: 'phép tính', dung: ['ky'], cau: ['số lượng nhập kho {ky}', 'tổng số lượng nhập kho {ky}'],
    kv: d => tt('nhap_kho', { coDo: { ham: 'tong', cot: 'so_luong_nhap_kho' }, ky: kyCua(d.ky) }) },
  { id: 'xk-sl-x', nhom: 'phép tính', dung: ['ky'], cau: ['số lượng xuất kho theo xưởng {ky}', 'tổng số lượng xuất kho {ky} theo xưởng'],
    kv: d => tt('xuat_kho', { coDo: { ham: 'tong', cot: 'so_luong_xuat_kho' }, nhom: ['xuong_chinh'], ky: kyCua(d.ky) }) },
  { id: 'tn-khgh', nhom: 'chia theo cột', cau: ['tồn kho theo tình trạng kế hoạch giao hàng', 'tồn kho chia theo tình trạng kế hoạch giao hàng'],
    kv: () => tt('ton_kho', { nhom: ['tinh_trang_ke_hoach_giao_hang'], ky: null }) },
  { id: 'tn-ct-top', nhom: 'xếp hạng', dung: ['n'], cau: ['top {n} công trình tồn kho trên 3 tháng', 'công trình nào tồn kho trên 3 tháng nhiều nhất'],
    kv: () => tt('ton_kho', { nhom: ['ten_cong_trinh'], loc: [{ cot: 'so_thang_ton_kho', op: 'lon_hon', gt: 3 }], ky: null }) },
  { id: 'dh-x', nhom: 'chia theo cột', dung: ['ky'], cau: ['đơn hàng mới theo xưởng {ky}', 'đơn hàng {ky} chia theo xưởng'],
    kv: d => tt('dht', { nhom: ['xuong_chinh'], ky: kyCua(d.ky) }) },
  { id: 'dh-sl-x', nhom: 'phép tính', dung: ['ky'], cau: ['số lượng đơn hàng theo xưởng {ky}', 'tổng số lượng đơn hàng {ky} theo xưởng'],
    kv: d => tt('dht', { coDo: { ham: 'tong', cot: 'so_luong_don_hang_tong' }, nhom: ['xuong_chinh'], ky: kyCua(d.ky) }) },
  { id: 'dh-ct-ky', nhom: 'chia theo cột', dung: ['ky'], cau: ['đơn hàng mới theo công trình {ky}', 'công trình nào có nhiều đơn hàng mới nhất {ky}'],
    kv: d => tt('dht', { nhom: ['ten_cong_trinh'], ky: kyCua(d.ky) }) },

  // ======================= HỎI NỐI TIẾP (thiếu ý: lấy cả câu trước) =======================
  { id: 'nt-doi-ky', nhom: 'ngữ cảnh', dung: ['b', 'ky', 'ky2'], truoc: '{b} {ky}', cau: ['còn {ky2}?', 'còn {ky2} thì sao', '{ky2} thì sao'],
    kv: d => tt(d.b.id, { ky: kyCua(d.ky2) }) },
  { id: 'nt-doi-bang', nhom: 'ngữ cảnh', dung: ['x', 'ky'], truoc: 'nhập kho xưởng {x} {ky}', cau: ['xuất kho thì sao', 'còn xuất kho?', 'thế còn xuất kho'],
    kv: d => tt('xuat_kho', { loc: [xLoc(d.x)], ky: kyCua(d.ky) }) },
  { id: 'nt-them-nhom', nhom: 'ngữ cảnh', dung: ['b', 'ky'], truoc: '{b} {ky}', cau: ['theo xưởng', 'chia theo xưởng', 'theo từng xưởng thì sao'],
    kv: d => tt(d.b.id, { nhom: ['xuong_chinh'], ky: kyCua(d.ky) }) },
  { id: 'nt-doi-x', nhom: 'ngữ cảnh', dung: ['x', 'x2', 'ky'], truoc: 'nhập kho xưởng {x} {ky}', cau: ['còn xưởng {x2}?', 'xưởng {x2} thì sao', 'còn {x2} thì sao'],
    kv: d => tt('nhap_kho', { loc: [xLoc(d.x2)], ky: kyCua(d.ky) }) },
  { id: 'nt-3-luot', nhom: 'ngữ cảnh', dung: ['ky', 'ky2'], truoc: ['nhập kho {ky}', 'theo xưởng'], cau: ['còn {ky2} thì sao', 'còn {ky2}?'],
    kv: d => tt('nhap_kho', { nhom: ['xuong_chinh'], ky: kyCua(d.ky2) }) },
  { id: 'nt-ct-dh', nhom: 'ngữ cảnh', dung: ['ma', 'ky'], truoc: 'công trình {ma}', cau: ['đơn hàng {ky}', 'đơn hàng mới {ky} bao nhiêu'],
    kv: d => tt('dht', { loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'nt-ct-theo-x', nhom: 'ngữ cảnh', dung: ['ma'], truoc: '{ma} còn bao nhiêu hạng mục chưa nhập kho', cau: ['theo xưởng', 'chia theo xưởng thì sao'],
    kv: d => tt(SX, { nhom: ['xuong_chinh'], loc: [conLai, maLoc(d.ma)], ky: null }) },
  { id: 'nt-qh-pm', nhom: 'ngữ cảnh', truoc: 'hạng mục quá hạn giao theo xưởng', cau: ['theo PM thì sao', 'còn theo PM?', 'chia theo PM'],
    kv: () => tt(SX, { nhom: ['ten_pm'], loc: quaHanGiao, ky: null }) },
  { id: 'nt-dh-pm', nhom: 'ngữ cảnh', dung: ['pm', 'ky'], truoc: 'đơn hàng mới {ky}', cau: ['của PM {pm}', 'còn PM {pm} thì sao'],
    kv: d => tt('dht', { loc: [{ cot: 'ten_pm', op: 'bang', gt: [d.pm] }], ky: kyCua(d.ky) }) },
  { id: 'nt-3-ct-xuat', nhom: 'ngữ cảnh', dung: ['ma', 'ky'], truoc: ['công trình {ma}', 'nhập kho {ky}'], cau: ['xuất kho thì sao', 'còn xuất kho?'],
    kv: d => tt('xuat_kho', { loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'nt-ton-nhap', nhom: 'ngữ cảnh', dung: ['ct', 'ky'], truoc: 'tồn kho công trình {ct}', cau: ['nhập kho {ky}', 'nhập kho {ky} bao nhiêu'],
    kv: d => tt('nhap_kho', { loc: [ctLoc(d.ct)], ky: kyCua(d.ky) }) },
  // Câu mới đủ ý (có tên bảng, không "thì sao / còn…"): KHÔNG lấy lọc xưởng của câu trước
  { id: 'nt-cau-moi', nhom: 'ngữ cảnh', dung: ['x', 'ky'], truoc: 'nhập kho xưởng {x} {ky}', cau: ['đơn hàng mới theo PM tháng này', 'đơn hàng theo PM tháng này'],
    kv: () => tt('dht', { nhom: ['ten_pm'], loc: [], ky: kyCua(KY[4]) }) },

  // ======================= ĐỢT 3: CÔNG TRÌNH / HẠNG MỤC =======================
  { id: 'c3-ct-dem', nhom: 'công trình', dung: ['ma'], cau: ['công trình {ma} có bao nhiêu hạng mục', '{ma} có tổng cộng bao nhiêu hạng mục', 'số hạng mục của {ma}'],
    kv: d => tt(SX, { loc: [maLoc(d.ma)], ky: null }) },
  { id: 'c3-ct-cd-lk', nhom: 'công trình', dung: ['ma', 'cd'], cau: ['hex nào của {ma} đang ở {cd}', 'những hạng mục nào của {ma} đang ở công đoạn {cd}', 'liệt kê hạng mục {ma} đang ở {cd}'],
    kv: d => tt(SX, { kieu: 'dong', loc: [maLoc(d.ma), { cot: 'tinh_trang', op: 'bang', gt: [d.cd[1]] }], ky: null }) },
  { id: 'c3-ct-qh-lk', nhom: 'công trình', dung: ['ma'], cau: ['hạng mục nào của {ma} quá hạn giao', 'liệt kê hạng mục quá hạn giao của {ma}'],
    kv: d => tt(SX, { kieu: 'dong', loc: [...quaHanGiao, maLoc(d.ma)], ky: null }) },
  { id: 'c3-kh-ct', nhom: 'nối bảng sản xuất', dung: ['kh'], cau: ['công trình của khách hàng {kh}', '{kh} có những công trình nào', 'khách hàng {kh} theo công trình'],
    kv: d => tt(SX, { nhom: ['ten_cong_trinh'], loc: [{ cot: 'khach_hang', op: 'bang', gt: [d.kh] }], ky: null }) },
  { id: 'c3-ct-pt', nhom: 'công trình', dung: ['ma'], cau: ['{ma} nhập kho được bao nhiêu phần trăm', 'công trình {ma} hoàn thành bao nhiêu phần trăm'],
    kv: () => ({ loai: 'mau', y: 'cong_trinh' }) },
  { id: 'c3-sap-han', nhom: 'khái niệm', cau: ['hạng mục sắp đến hạn giao', 'có bao nhiêu hạng mục sắp tới hạn giao', 'hạng mục sắp đến hạn giao theo xưởng'],
    kv: () => tt(SX, { loc: [{ cot: 'ngay_can_giao', op: 'trong_khoang', gt: ['2026-10-19', '2026-11-02'] }, conLai], ky: null }) },
  { id: 'c3-sap-han-ct', nhom: 'khái niệm', cau: ['công trình nào sắp đến hạn giao', 'công trình sắp tới hạn giao hàng'],
    kv: () => tt(SX, { nhom: ['ten_cong_trinh'], loc: [{ cot: 'ngay_can_giao', op: 'trong_khoang', gt: ['2026-10-19', '2026-11-02'] }, conLai], ky: null }) },
  { id: 'c3-x-cd-con', nhom: 'giá trị', dung: ['x'], cau: ['xưởng {x} còn lại bao nhiêu theo công đoạn', 'giá trị còn lại xưởng {x} theo công đoạn'],
    kv: d => tt(SX, { coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, nhom: ['tinh_trang'], loc: [xLoc(d.x)], ky: null }) },

  // ======================= ĐỢT 3: XUẤT / NHẬP / TỒN / ĐƠN HÀNG =======================
  { id: 'c3-cung-ky', nhom: 'so sánh / bình quân', dung: ['b'], cau: ['{b} tháng 9 so với cùng kỳ năm ngoái', '{b} tháng 9 so với cùng kỳ năm trước'],
    kv: d => tt(d.b.id, { ky: { tu: '2026-09-01', den: '2026-09-30' }, soSanh: { tu: '2025-09-01', den: '2025-09-30' } }) },
  { id: 'c3-cung-ky-q', nhom: 'so sánh / bình quân', cau: ['nhập kho quý 3 so với cùng kỳ năm ngoái', 'nhập kho quý 3 so với cùng kỳ'],
    kv: () => tt('nhap_kho', { ky: { tu: '2026-07-01', den: '2026-09-30' }, soSanh: { tu: '2025-07-01', den: '2025-09-30' } }) },
  { id: 'c3-ss-x', nhom: 'so sánh / bình quân', dung: ['b', 'x'], cau: ['so sánh {b} xưởng {x} {ky} với {ky2}', '{b} xưởng {x} {ky} so với {ky2}'],
    kv: d => tt(d.b.id, { loc: [xLoc(d.x)], ky: kyCua(d.ky), soSanh: kyCua(d.ky2) }) },
  { id: 'c3-doanh-thu', nhom: 'mẫu', dung: ['ky'], cau: ['doanh thu {ky}', 'doanh thu {ky} được bao nhiêu'],
    kv: d => (d.ky.noi === 'năm nay' ? { loai: 'mau', y: 'tien_do_nam' } : tt('nhap_kho', { ky: kyCua(d.ky) })) },
  { id: 'c3-luy-ke', nhom: 'mẫu', cau: ['lũy kế nhập kho năm nay', 'nhập kho lũy kế từ đầu năm', 'nhập kho lũy kế'],
    kv: () => ({ loai: 'tu_tra', bang: 'nhap_kho', ky: { tu: '2026-01-01', den: '2026-10-19' } }) },
  { id: 'c3-b-ct', nhom: 'chia theo cột', dung: ['b', 'ky'], cau: ['{b} theo công trình {ky}', '{b} {ky} chia theo công trình'],
    kv: d => tt(d.b.id, { nhom: ['ten_cong_trinh'], ky: kyCua(d.ky) }) },
  { id: 'c3-b-x-ct', nhom: 'chia theo cột', dung: ['b', 'x', 'ky'], cau: ['{b} xưởng {x} theo công trình {ky}', '{b} {ky} của xưởng {x} chia theo công trình'],
    kv: d => tt(d.b.id, { nhom: ['ten_cong_trinh'], loc: [xLoc(d.x)], ky: kyCua(d.ky) }) },
  { id: 'c3-b-kvda', nhom: 'nối bảng sản xuất', dung: ['b', 'ky'], cau: ['{b} theo khu vực dự án {ky}', '{b} {ky} chia theo khu vực dự án'],
    kv: d => tt(d.b.id, { nhom: ['sx:khu_vuc_du_an'], ky: kyCua(d.ky) }) },
  { id: 'c3-nk-lk-ngay', nhom: 'liệt kê', dung: ['x'], cau: ['hôm nay nhập kho những hex nào', 'liệt kê hex nhập kho hôm nay xưởng {x}'],
    kv: () => tt('nhap_kho', { kieu: 'dong', ky: { tu: '2026-10-19', den: '2026-10-19' } }) },
  { id: 'c3-dh-max', nhom: 'phép tính', dung: ['ky'], cau: ['đơn hàng trị giá lớn nhất {ky}', 'đơn hàng có trị giá cao nhất {ky}'],
    kv: d => tt('dht', { coDo: { ham: 'max', cot: 'tri_gia_don_hang_tong' }, ky: kyCua(d.ky) }) },
  { id: 'c3-dh-tb', nhom: 'phép tính', dung: ['ky'], cau: ['trị giá trung bình mỗi đơn hàng {ky}', 'trung bình mỗi đơn hàng bao nhiêu tiền {ky}'],
    kv: d => tt('dht', { coDo: { ham: 'tb', cot: 'tri_gia_don_hang_tong' }, ky: kyCua(d.ky) }) },
  { id: 'c3-tn-sp', nhom: 'công trình', dung: ['ct'], cau: ['tồn kho công trình {ct} theo sản phẩm', 'tồn kho của {ct} chia theo sản phẩm'],
    kv: d => tt('ton_kho', { nhom: ['ten_san_pham'], loc: [ctLoc(d.ct)], ky: null }) },
  { id: 'c3-tn-kh-ct', nhom: 'nối bảng sản xuất', dung: ['kh'], cau: ['tồn kho của khách hàng {kh} theo công trình', '{kh} tồn kho theo công trình'],
    kv: d => tt('ton_kho', { nhom: ['ten_cong_trinh'], loc: [{ cot: 'sx:khach_hang', op: 'bang', gt: [d.kh] }], ky: null }) },

  // ======================= ĐỢT 3: HỎI NỐI TIẾP =======================
  { id: 'n3-so-voi', nhom: 'ngữ cảnh', dung: ['b', 'ky', 'ky2'], truoc: '{b} {ky}', cau: ['so với {ky2}', 'so với {ky2} thì sao'],
    kv: d => tt(d.b.id, { ky: kyCua(d.ky), soSanh: kyCua(d.ky2) }) },
  { id: 'n3-top', nhom: 'ngữ cảnh', dung: ['b', 'ky', 'n'], truoc: '{b} {ky}', cau: ['top {n} công trình', 'top {n} công trình thì sao'],
    kv: d => tt(d.b.id, { nhom: ['ten_cong_trinh'], gioiHan: d.n, ky: kyCua(d.ky) }) },
  { id: 'n3-lk', nhom: 'ngữ cảnh', dung: ['x', 'ky'], truoc: 'nhập kho xưởng {x} {ky}', cau: ['liệt kê chi tiết', 'cho xem chi tiết', 'danh sách chi tiết'],
    kv: d => tt('nhap_kho', { kieu: 'dong', loc: [xLoc(d.x)], ky: kyCua(d.ky) }) },
  { id: 'n3-ct-pm', nhom: 'ngữ cảnh', dung: ['ma'], truoc: 'công trình {ma}', cau: ['ai là PM', 'PM là ai', 'ai là PC'],
    kv: () => ({ loai: 'tu_tra', bang: SX, ky: null }) },
  { id: 'n3-ct-qh', nhom: 'ngữ cảnh', dung: ['ma'], truoc: 'công trình {ma}', cau: ['có bao nhiêu hạng mục quá hạn giao', 'bao nhiêu hạng mục trễ hạn giao'],
    kv: d => tt(SX, { loc: [...quaHanGiao, maLoc(d.ma)], ky: null }) },
  { id: 'n3-ct-qh-lk', nhom: 'ngữ cảnh', dung: ['ma'], truoc: 'công trình {ma}', cau: ['hạng mục nào quá hạn giao', 'những hex nào trễ hạn giao'],
    kv: d => tt(SX, { kieu: 'dong', loc: [...quaHanGiao, maLoc(d.ma)], ky: null }) },
  { id: 'n3-tn-sp', nhom: 'ngữ cảnh', dung: ['ct'], truoc: 'tồn kho công trình {ct}', cau: ['theo sản phẩm', 'chia theo sản phẩm thì sao'],
    kv: d => tt('ton_kho', { nhom: ['ten_san_pham'], loc: [ctLoc(d.ct)], ky: null }) },
  { id: 'n3-qh-x', nhom: 'ngữ cảnh', dung: ['x'], truoc: 'hạng mục quá hạn giao theo xưởng', cau: ['xưởng {x} thì sao', 'còn xưởng {x}?'],
    kv: d => tt(SX, { loc: [...quaHanGiao, xLoc(d.x)], ky: null }) },
  { id: 'n3-3-thang', nhom: 'ngữ cảnh', dung: ['ma', 'ky'], truoc: ['công trình {ma}', 'nhập kho {ky}'], cau: ['theo tháng', 'chia theo tháng'],
    kv: d => tt('nhap_kho', { nhom: ['date@thang'], loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'n3-3-x', nhom: 'ngữ cảnh', dung: ['ky', 'x'], truoc: ['đơn hàng mới {ky}', 'theo xưởng'], cau: ['còn xuất kho thì sao', 'xuất kho thì sao'],
    kv: d => tt('xuat_kho', { nhom: ['xuong_chinh'], ky: kyCua(d.ky) }) },

  // ======================= ĐỢT 4: 6 THẺ DỮ LIỆU (P001 · P002 · P012 · P022 · P025 · tồn kho) × PC / CÔNG TRÌNH / HẠNG MỤC =======================
  // Cột PC: đơn hàng có sẵn; các bảng khác lấy từ bảng sản xuất qua HEX
  { id: 'c4-b-pc', nhom: 'người', dung: ['b', 'ky'], cau: ['{b} theo PC {ky}', '{b} {ky} chia theo PC', 'PC nào {b} nhiều nhất {ky}'],
    kv: d => tt(d.b.id, { nhom: [pcCot(d.b.id)], ky: kyCua(d.ky) }) },
  { id: 'c4-b-cua-pc', nhom: 'người', dung: ['b', 'pcsx', 'ky'], cau: ['{b} của PC {pcsx} {ky}', 'PC {pcsx} {b} {ky} được bao nhiêu'],
    kv: d => tt(d.b.id, { ...(d.b.id === 'dht' ? {} : { loc: [{ cot: pcCot(d.b.id), op: 'bang', gt: [d.pcsx] }] }), ky: kyCua(d.ky) }) },
  { id: 'c4-b-pc-ct', nhom: 'người', dung: ['b', 'pcsx', 'ky'], cau: ['{b} của PC {pcsx} theo công trình {ky}', 'PC {pcsx} {b} {ky} chia theo công trình'],
    kv: d => tt(d.b.id, { nhom: ['ten_cong_trinh'], ky: kyCua(d.ky) }) },
  { id: 'c4-b-ct-hm', nhom: 'công trình', dung: ['b', 'ct', 'ky'], cau: ['{b} công trình {ct} theo hạng mục {ky}', '{b} của {ct} {ky} chia theo hạng mục'],
    kv: d => tt(d.b.id, { nhom: ['ten_hang_muc'], loc: [ctLoc(d.ct)], ky: kyCua(d.ky) }) },
  { id: 'c4-b-top-hm', nhom: 'xếp hạng', dung: ['b', 'ky', 'n'], cau: ['top {n} hạng mục {b} nhiều nhất {ky}', 'top {n} hạng mục {b} {ky}'],
    kv: d => tt(d.b.id, { nhom: ['ten_hang_muc'], gioiHan: d.n, ky: kyCua(d.ky) }) },
  { id: 'c4-b-ma-lk', nhom: 'công trình', dung: ['b', 'ma', 'ky'], cau: ['hạng mục nào của {ma} đã {b} {ky}', 'liệt kê hạng mục {ma} {b} {ky}', 'danh sách {b} của {ma} {ky}'],
    kv: d => tt(d.b.id, { kieu: 'dong', loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'c4-b-ma-pc', nhom: 'công trình', dung: ['b', 'ma'], cau: ['{b} công trình {ma} theo PC', '{ma} {b} chia theo PC'],
    kv: d => tt(d.b.id, { nhom: [pcCot(d.b.id)], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'c4-b-hm-x', nhom: 'chia theo cột', dung: ['b', 'x', 'ky'], cau: ['{b} xưởng {x} theo hạng mục {ky}', '{b} {ky} xưởng {x} chia theo hạng mục'],
    kv: d => tt(d.b.id, { nhom: ['ten_hang_muc'], loc: [xLoc(d.x)], ky: kyCua(d.ky) }) },
  // ---- Tồn kho (thẻ 6) ----
  { id: 'c4-tn-pc', nhom: 'người', cau: ['tồn kho theo PC', 'PC nào có tồn kho nhiều nhất', 'tồn kho chia theo PC'],
    kv: () => tt('ton_kho', { nhom: ['sx:ten_pc'], ky: null }) },
  { id: 'c4-tn-cua-pc', nhom: 'người', dung: ['pcsx'], cau: ['tồn kho của PC {pcsx}', 'PC {pcsx} còn tồn kho bao nhiêu', 'tồn kho PC {pcsx} theo công trình'],
    kv: d => tt('ton_kho', { loc: [{ cot: 'sx:ten_pc', op: 'bang', gt: [d.pcsx] }], ky: null }) },
  { id: 'c4-tn-ma', nhom: 'công trình', dung: ['ma'], cau: ['tồn kho công trình {ma}', '{ma} còn tồn kho bao nhiêu', 'tồn kho của {ma} bao nhiêu'],
    kv: d => tt('ton_kho', { loc: [maLoc(d.ma)], ky: null }) },
  // ---- PC phụ trách (bảng hạng mục) ----
  { id: 'c4-pc-ct', nhom: 'người', dung: ['pcsx'], cau: ['PC {pcsx} phụ trách những công trình nào', 'công trình của PC {pcsx}', 'PC {pcsx} theo công trình'],
    kv: d => tt(SX, { nhom: ['ten_cong_trinh'], loc: [{ cot: 'ten_pc', op: 'bang', gt: [d.pcsx] }], ky: null }) },
  { id: 'c4-pc-con', nhom: 'người', dung: ['pcsx'], cau: ['PC {pcsx} còn bao nhiêu hạng mục chưa nhập kho', 'hạng mục chưa nhập kho của PC {pcsx}'],
    kv: d => tt(SX, { loc: [conLai, { cot: 'ten_pc', op: 'bang', gt: [d.pcsx] }], ky: null }) },
  { id: 'c4-pc-cd', nhom: 'người', dung: ['pcsx'], cau: ['hạng mục của PC {pcsx} theo công đoạn', 'PC {pcsx} có bao nhiêu hạng mục ở từng công đoạn'],
    kv: d => tt(SX, { nhom: ['tinh_trang'], loc: [{ cot: 'ten_pc', op: 'bang', gt: [d.pcsx] }], ky: null }) },
  { id: 'c4-pc-qh-nhieu', nhom: 'người', cau: ['PC nào có nhiều hạng mục quá hạn giao nhất', 'hạng mục quá hạn giao theo PC', 'quá hạn giao theo từng PC'],
    kv: () => tt(SX, { nhom: ['ten_pc'], loc: quaHanGiao, ky: null }) },
  { id: 'c4-pc-con-nhieu', nhom: 'người', cau: ['PC nào còn nhiều giá trị chưa nhập kho nhất', 'giá trị còn lại theo PC', 'hạng mục chưa nhập kho theo PC'],
    kv: () => tt(SX, { nhom: ['ten_pc'], ky: null }) },
  { id: 'c4-pc-sap-han', nhom: 'người', dung: ['pcsx'], cau: ['PC {pcsx} có bao nhiêu hạng mục sắp đến hạn giao', 'hạng mục sắp đến hạn giao của PC {pcsx}'],
    kv: d => tt(SX, { loc: [{ cot: 'ngay_can_giao', op: 'trong_khoang', gt: ['2026-10-19', '2026-11-02'] }, conLai, { cot: 'ten_pc', op: 'bang', gt: [d.pcsx] }], ky: null }) },
  // ---- Hỏi nối tiếp quanh 6 thẻ ----
  { id: 'n4-them-pc', nhom: 'ngữ cảnh', dung: ['b', 'ky'], truoc: '{b} {ky}', cau: ['theo PC', 'chia theo PC thì sao', 'còn theo PC?'],
    kv: d => tt(d.b.id, { nhom: [pcCot(d.b.id)], ky: kyCua(d.ky) }) },
  { id: 'n4-pc-doi-ky', nhom: 'ngữ cảnh', dung: ['b', 'ky', 'ky2'], truoc: '{b} theo PC {ky}', cau: ['còn {ky2}?', '{ky2} thì sao'],
    kv: d => tt(d.b.id, { nhom: [pcCot(d.b.id)], ky: kyCua(d.ky2) }) },
  { id: 'n4-pc-doi-bang', nhom: 'ngữ cảnh', dung: ['pcsx', 'ky'], truoc: 'nhập kho của PC {pcsx} {ky}', cau: ['xuất kho thì sao', 'thế còn xuất kho', 'còn xuất kho?'],
    kv: () => ({ loai: 'tu_tra', bang: 'xuat_kho' }) },
  { id: 'n4-ct-hm', nhom: 'ngữ cảnh', dung: ['b', 'ma', 'ky'], truoc: '{b} {ma} {ky}', cau: ['theo hạng mục', 'chia theo hạng mục thì sao'],
    kv: d => tt(d.b.id, { nhom: ['ten_hang_muc'], loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'n4-ct-lk', nhom: 'ngữ cảnh', dung: ['b', 'ma', 'ky'], truoc: '{b} {ma} {ky}', cau: ['liệt kê chi tiết', 'cho xem danh sách'],
    kv: d => tt(d.b.id, { kieu: 'dong', loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'n4-3-pc', nhom: 'ngữ cảnh', dung: ['ky', 'pcsx'], truoc: ['nhập kho {ky}', 'theo PC'], cau: ['còn PC {pcsx} theo công trình', 'PC {pcsx} theo công trình thì sao'],
    kv: d => tt('nhap_kho', { nhom: ['ten_cong_trinh'], loc: [{ cot: 'sx:ten_pc', op: 'bang', gt: [d.pcsx] }], ky: kyCua(d.ky) }) },

  // ======================= ĐỢT 5: 6 THẺ × PM / KHÁCH HÀNG / NHÓM SẢN PHẨM / GIÁ TRỊ =======================
  { id: 'c5-b-pm', nhom: 'người', dung: ['b', 'ky'], cau: ['{b} theo PM {ky}', 'PM nào {b} nhiều nhất {ky}', '{b} {ky} chia theo PM'],
    kv: d => tt(d.b.id, { nhom: [pmCot(d.b.id)], ky: kyCua(d.ky) }) },
  { id: 'c5-b-cua-pm', nhom: 'người', dung: ['b', 'pmsx', 'ky'], cau: ['{b} của PM {pmsx} {ky}', 'PM {pmsx} {b} {ky} bao nhiêu'],
    kv: d => tt(d.b.id, { ...(d.b.id === 'dht' ? {} : { loc: [{ cot: pmCot(d.b.id), op: 'bang', gt: [d.pmsx] }] }), ky: kyCua(d.ky) }) },
  { id: 'c5-b-top-kh', nhom: 'xếp hạng', dung: ['b', 'ky', 'n'], cau: ['top {n} khách hàng {b} nhiều nhất {ky}', 'top {n} khách hàng {b} {ky}'],
    kv: d => tt(d.b.id, { nhom: ['sx:khach_hang'], gioiHan: d.n, ky: kyCua(d.ky) }) },
  { id: 'c5-b-nsp-x', nhom: 'nối bảng sản xuất', dung: ['b', 'ky'], cau: ['{b} theo nhóm sản phẩm và xưởng {ky}', '{b} {ky} chia theo nhóm sản phẩm và xưởng'],
    kv: d => tt(d.b.id, { nhom: ['sx:phan_loai_nhom_san_pham', 'xuong_chinh'], ky: kyCua(d.ky) }) },
  { id: 'c5-b-ma-tuan', nhom: 'công trình', dung: ['b', 'ma', 'ky'], cau: ['{b} công trình {ma} {ky} theo tuần', '{b} {ma} {ky} từng tuần'],
    kv: d => tt(d.b.id, { nhom: [`${d.b.ngay}@tuan`], loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'c5-b-ma-hex', nhom: 'công trình', dung: ['b', 'ma', 'ky'], cau: ['{b} công trình {ma} bao nhiêu hex {ky}', 'số hex {b} của {ma} {ky}'],
    kv: d => tt(d.b.id, { do: [{ ham: 'dem_khac', cot: 'hex' }], loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'c5-b-tren', nhom: 'lọc số', dung: ['b', 'n', 'ky'], cau: ['{b} {ky} các dòng trên {n} tỷ', 'liệt kê {b} {ky} giá trị trên {n} tỷ'],
    kv: d => tt(d.b.id, { kieu: 'dong', loc: [{ cot: tienCot(d.b.id), op: 'lon_hon', gt: d.n * 1000 }], ky: kyCua(d.ky) }) },
  { id: 'c5-b-hom-nay-x', nhom: 'liệt kê', dung: ['b', 'x'], cau: ['hôm nay xưởng {x} {b} những hạng mục nào', 'xưởng {x} hôm nay {b} hạng mục nào'],
    kv: d => tt(d.b.id, { kieu: 'dong', loc: [xLoc(d.x)], ky: { tu: '2026-10-19', den: '2026-10-19' } }) },

  // ======================= ĐỢT 5: HẠNG MỤC / CÔNG TRÌNH =======================
  { id: 'c5-ct-qh-nhieu', nhom: 'xếp hạng', cau: ['công trình nào có nhiều hạng mục quá hạn giao nhất', 'hạng mục quá hạn giao theo công trình', 'quá hạn giao theo từng công trình'],
    kv: () => tt(SX, { nhom: ['ten_cong_trinh'], loc: quaHanGiao, ky: null }) },
  { id: 'c5-kh-qh-nhieu', nhom: 'xếp hạng', cau: ['khách hàng nào có nhiều hạng mục quá hạn giao nhất', 'hạng mục quá hạn giao theo khách hàng'],
    kv: () => tt(SX, { nhom: ['khach_hang'], loc: quaHanGiao, ky: null }) },
  { id: 'c5-ct-chua-tk-nhieu', nhom: 'xếp hạng', cau: ['công trình nào có nhiều hạng mục chưa triển khai nhất', 'hạng mục chưa triển khai theo công trình'],
    kv: () => tt(SX, { nhom: ['ten_cong_trinh'], loc: [{ cot: 'tinh_trang', op: 'bang', gt: ['15. CHƯA TRIỂN KHAI'] }], ky: null }) },
  { id: 'c5-ma-ipo', nhom: 'công trình', dung: ['ma'], cau: ['tình trạng IPO của {ma}', 'công trình {ma} theo tình trạng IPO', '{ma} chia theo tình trạng IPO'],
    kv: d => tt(SX, { nhom: ['tinh_trang_ipo'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'c5-ma-bop', nhom: 'công trình', dung: ['ma'], cau: ['hạng mục {ma} theo BOP', 'công trình {ma} chia theo BOP'],
    kv: d => tt(SX, { nhom: ['bop'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'c5-kh-x', nhom: 'nối bảng sản xuất', dung: ['kh'], cau: ['hạng mục của khách hàng {kh} theo xưởng', '{kh} có bao nhiêu hạng mục theo từng xưởng'],
    kv: d => tt(SX, { nhom: ['xuong_chinh'], loc: [{ cot: 'khach_hang', op: 'bang', gt: [d.kh] }], ky: null }) },
  { id: 'c5-nsp-x', nhom: 'giá trị', dung: ['nsp'], cau: ['hạng mục nhóm {nsp} theo xưởng', 'nhóm {nsp} chia theo xưởng'],
    kv: d => tt(SX, { nhom: ['xuong_chinh'], loc: [{ cot: 'phan_loai_nhom_san_pham', op: 'bang', gt: [d.nsp[1]] }], ky: null }) },
  { id: 'c5-ma-con-cd', nhom: 'công trình', dung: ['ma'], cau: ['{ma} còn lại bao nhiêu theo công đoạn', 'giá trị còn lại của {ma} theo công đoạn'],
    kv: d => tt(SX, { coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, nhom: ['tinh_trang'], loc: [maLoc(d.ma)], ky: null }) },

  // ======================= ĐỢT 5: HỎI NỐI TIẾP =======================
  { id: 'n5-them-pm', nhom: 'ngữ cảnh', dung: ['x', 'ky'], truoc: 'nhập kho xưởng {x} {ky}', cau: ['theo PM', 'chia theo PM thì sao'],
    kv: d => tt('nhap_kho', { nhom: ['sx:ten_pm'], loc: [xLoc(d.x)], ky: kyCua(d.ky) }) },
  { id: 'n5-top-hm', nhom: 'ngữ cảnh', dung: ['b', 'ky', 'n'], truoc: '{b} {ky}', cau: ['top {n} hạng mục', 'top {n} hạng mục thì sao'],
    kv: d => tt(d.b.id, { nhom: ['ten_hang_muc'], gioiHan: d.n, ky: kyCua(d.ky) }) },
  { id: 'n5-qh-ct', nhom: 'ngữ cảnh', truoc: 'hạng mục quá hạn giao theo xưởng', cau: ['theo công trình thì sao', 'còn theo công trình?', 'chia theo công trình'],
    kv: () => tt(SX, { nhom: ['ten_cong_trinh'], loc: quaHanGiao, ky: null }) },
  { id: 'n5-ma-tuan', nhom: 'ngữ cảnh', dung: ['b', 'ma', 'ky'], truoc: '{b} {ma} {ky}', cau: ['theo tuần', 'chia theo tuần thì sao'],
    kv: d => tt(d.b.id, { nhom: [`${d.b.ngay}@tuan`], loc: [maLoc(d.ma)], ky: kyCua(d.ky) }) },
  { id: 'n5-3-x-ky', nhom: 'ngữ cảnh', dung: ['x', 'x2', 'ky', 'ky2'], truoc: ['xuất kho xưởng {x} {ky}', 'theo công trình'], cau: ['còn xưởng {x2}?', 'xưởng {x2} thì sao'],
    kv: d => tt('xuat_kho', { nhom: ['ten_cong_trinh'], loc: [xLoc(d.x2)], ky: kyCua(d.ky) }) },
  { id: 'n5-kh-doi-bang', nhom: 'ngữ cảnh', dung: ['kh', 'ky'], truoc: 'nhập kho của {kh} {ky}', cau: ['xuất kho thì sao', 'còn xuất kho?'],
    kv: d => tt('xuat_kho', { loc: [{ cot: 'sx:khach_hang', op: 'bang', gt: [d.kh] }], ky: kyCua(d.ky) }) },

  // ======================= ĐỢT 6: KẾ HOẠCH NHẬP KHO · BOT · BOP · BOM =======================
  // ---- Kế hoạch nhập kho (bảng kế hoạch sản xuất — kỳ kế hoạch lấy trọn tuần / tháng) ----
  { id: 'k6-kh-thang-x', nhom: 'kế hoạch', cau: ['kế hoạch nhập kho tháng này theo xưởng', 'kế hoạch nhập kho tháng này chia theo xưởng'],
    kv: () => tt('khsx', { nhom: ['xuong_chinh'], ky: { tu: '2026-10-01', den: '2026-10-31' } }) },
  { id: 'k6-kh-thang-ct', nhom: 'kế hoạch', cau: ['kế hoạch nhập kho tháng này theo công trình', 'công trình nào có kế hoạch nhập kho tháng này nhiều nhất'],
    kv: () => tt('khsx', { nhom: ['ten_cong_trinh'], ky: { tu: '2026-10-01', den: '2026-10-31' } }) },
  { id: 'k6-kh-11-x', nhom: 'kế hoạch', dung: ['x'], cau: ['kế hoạch nhập kho tháng 11 xưởng {x}', 'xưởng {x} kế hoạch nhập kho tháng 11 bao nhiêu'],
    kv: d => tt('khsx', { loc: [xLoc(d.x)], ky: { tu: '2026-11-01', den: '2026-11-30' } }) },
  { id: 'k6-kh-ma', nhom: 'kế hoạch', dung: ['ma'], cau: ['kế hoạch nhập kho tháng này của {ma}', 'công trình {ma} kế hoạch nhập kho tháng này'],
    kv: d => tt('khsx', { loc: [maLoc(d.ma)], ky: { tu: '2026-10-01', den: '2026-10-31' } }) },
  // Câu trần (không chia / không công trình) vẫn phải là bảng kế hoạch trọn tháng, không phải mẫu nhập kho (từng trả "Nhập kho tháng 9: 156 tỷ").
  // Kỳ nói TRƯỚC chữ kế hoạch ("tháng 9 kế hoạch …") là câu trả lời mẫu tiến độ tháng (có sẵn số kế hoạch) — cùng quy ước gd-012
  { id: 'k6-kh-thang', nhom: 'kế hoạch', cau: ['kế hoạch nhập kho tháng này', 'kế hoạch nhập kho tháng này bao nhiêu', 'kế hoạch nhập kho tháng 9', 'tháng 9 kế hoạch nhập kho bao nhiêu'],
    kv: (_, mau) => (/^tháng 9/.test(mau) ? { loai: 'mau', y: 'tien_do_thang' }
      : tt('khsx', { loc: [], ky: /tháng 9/.test(mau) ? { tu: '2026-09-01', den: '2026-09-30' } : { tu: '2026-10-01', den: '2026-10-31' } })) },
  { id: 'k6-kh-tuan-ct', nhom: 'kế hoạch', cau: ['kế hoạch nhập kho tuần này theo công trình', 'kế hoạch nhập kho tuần này chia theo công trình'],
    kv: () => tt('khsx', { nhom: ['ten_cong_trinh'], ky: { tu: '2026-10-19', den: '2026-10-25' } }) },
  { id: 'k6-kh-lk', nhom: 'kế hoạch', dung: ['ma'], cau: ['liệt kê kế hoạch nhập kho tháng này của {ma}', 'danh sách hex có kế hoạch nhập kho tháng này của {ma}'],
    kv: d => tt('khsx', { kieu: 'dong', loc: [maLoc(d.ma)], ky: { tu: '2026-10-01', den: '2026-10-31' } }) },
  { id: 'k6-dung-kh', nhom: 'kế hoạch', cau: ['đúng kế hoạch tuần 41 theo xưởng', 'phân tích KH-TH tuần 41 theo xưởng', 'kh-th tuần 41 theo xưởng'],
    kv: () => tt('phan_tich_kh_th', { nhom: ['xuong_chinh'], ky: { tu: '2026-10-05', den: '2026-10-11' } }) },
  { id: 'k6-rot-kh-ct', nhom: 'kế hoạch', cau: ['rớt kế hoạch tuần trước theo công trình', 'kh-th tuần trước theo công trình'],
    kv: () => tt('phan_tich_kh_th', { nhom: ['ten_cong_trinh'], ky: { tu: '2026-10-12', den: '2026-10-18' } }) },

  // ---- BOT: thời hạn KH nhập kho (6 nhóm như thẻ BOT trên web) ----
  { id: 'k6-bot', nhom: 'khái niệm', cau: ['hạng mục theo BOT', 'hạng mục theo nhóm BOT', 'BOT theo từng nhóm', 'hạng mục theo thời hạn kế hoạch'],
    kv: () => tt(SX, { nhom: ['nhom_bot'], ky: null }) },
  { id: 'k6-bot-x', nhom: 'khái niệm', cau: ['BOT theo xưởng', 'hạng mục theo nhóm BOT và xưởng'],
    kv: () => tt(SX, { ky: null }) },
  { id: 'k6-bot-ma', nhom: 'công trình', dung: ['ma'], cau: ['công trình {ma} theo BOT', '{ma} chia theo nhóm BOT', 'BOT của {ma}'],
    kv: d => tt(SX, { nhom: ['nhom_bot'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'k6-qh-kh', nhom: 'khái niệm', cau: ['có bao nhiêu hạng mục quá hạn kế hoạch nhập kho', 'hạng mục quá hạn KH', 'hạng mục trễ kế hoạch nhập kho'],
    kv: () => tt(SX, { loc: [{ cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] }], ky: null }) },
  { id: 'k6-qh-kh-x', nhom: 'khái niệm', cau: ['hạng mục quá hạn kế hoạch theo xưởng', 'quá hạn KH nhập kho theo từng xưởng'],
    kv: () => tt(SX, { nhom: ['xuong_chinh'], loc: [{ cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] }], ky: null }) },
  { id: 'k6-qh-kh-ma', nhom: 'công trình', dung: ['ma'], cau: ['{ma} có bao nhiêu hạng mục quá hạn kế hoạch', 'công trình {ma} trễ kế hoạch nhập kho bao nhiêu'],
    kv: d => tt(SX, { loc: [{ cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] }, maLoc(d.ma)], ky: null }) },
  { id: 'k6-qh-kh-pc', nhom: 'người', dung: ['pcsx'], cau: ['PC {pcsx} có bao nhiêu hạng mục quá hạn kế hoạch', 'hạng mục trễ kế hoạch của PC {pcsx}'],
    kv: d => tt(SX, { loc: [{ cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] }, { cot: 'ten_pc', op: 'bang', gt: [d.pcsx] }], ky: null }) },
  { id: 'k6-sap-kh', nhom: 'khái niệm', cau: ['hạng mục sắp đến hạn kế hoạch nhập kho', 'hạng mục sắp tới hạn KH theo xưởng'],
    kv: () => tt(SX, { loc: [{ cot: 'nhom_bot', op: 'bang', gt: ['2. ≤ 14 ngày'] }], ky: null }) },
  { id: 'k6-dat-ky', nhom: 'khái niệm', cau: ['hạng mục đạt KH kỳ chờ KH tiếp', 'bao nhiêu hạng mục đạt kế hoạch kỳ'],
    kv: () => tt(SX, { loc: [{ cot: 'nhom_bot', op: 'bang', gt: ['5. Đạt KH kỳ, chờ KH tiếp'] }], ky: null }) },
  { id: 'k6-chua-kh-ma', nhom: 'công trình', dung: ['ma'], cau: ['{ma} có bao nhiêu hạng mục chưa có kế hoạch nhập kho', 'hạng mục chưa có kế hoạch của {ma}'],
    kv: d => tt(SX, { loc: [{ cot: 'ngay_khnk_thang', op: 'rong' }, { cot: 'ngay_khnk_tuan', op: 'rong' }, conLai, maLoc(d.ma)], ky: null }) },

  // ---- BOP: bước sản xuất (P001 … P025, GCVT) ----
  { id: 'k6-bop-dem', nhom: 'giá trị', cau: ['bao nhiêu hạng mục đang ở BOP P013', 'hạng mục ở bước P016', 'có bao nhiêu hạng mục đang ở GCVT', 'hạng mục đang ở P018'],
    kv: () => ({ loai: 'tu_tra', bang: SX, ky: null }) },
  { id: 'k6-bop-x', nhom: 'giá trị', cau: ['hạng mục ở BOP P013 theo xưởng', 'GCVT theo xưởng', 'hạng mục đang ở P020 theo xưởng'],
    kv: () => tt(SX, { nhom: ['xuong_chinh'], ky: null }) },
  { id: 'k6-bop-ma', nhom: 'công trình', dung: ['ma'], cau: ['BOP của {ma}', 'công trình {ma} đang ở bước nào', '{ma} theo bước sản xuất'],
    kv: d => tt(SX, { nhom: ['bop'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'k6-bop-con', nhom: 'chia theo cột', cau: ['giá trị còn lại theo BOP', 'còn lại chưa nhập kho theo BOP', 'giá trị chưa nhập theo bước sản xuất'],
    kv: () => tt(SX, { coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, nhom: ['bop'], ky: null }) },
  { id: 'k6-bop-pc', nhom: 'người', dung: ['pcsx'], cau: ['hạng mục của PC {pcsx} theo BOP', 'PC {pcsx} chia theo BOP'],
    kv: d => tt(SX, { nhom: ['bop'], loc: [{ cot: 'ten_pc', op: 'bang', gt: [d.pcsx] }], ky: null }) },

  // ---- BOM: vật tư của hạng mục / công trình (bảng vật tư) ----
  { id: 'k6-bom-ma', nhom: 'công trình', dung: ['ma'], cau: ['BOM công trình {ma}', 'tình trạng BOM của {ma}', 'BOM {ma} theo trạng thái'],
    kv: d => tt('vat_tu', { loc: [maLoc(d.ma)], ky: null }) },
  { id: 'k6-bom-ma-nhom', nhom: 'công trình', dung: ['ma'], cau: ['BOM của {ma} theo nhóm vật tư', 'vật tư {ma} theo nhóm vật tư'],
    kv: d => tt('vat_tu', { nhom: ['nhom_vt'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'k6-bom-tre-ma', nhom: 'công trình', dung: ['ma'], cau: ['vật tư trễ hẹn của {ma}', 'PR trễ hẹn công trình {ma}'],
    kv: d => tt('vat_tu', { loc: [{ cot: 'ngay_du_kien_giao_hang_pmh_nhap', op: 'nho_hon', gt: '2026-10-19' }, { cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }, maLoc(d.ma)], ky: null }) },
  { id: 'k6-bom-chua-ve-ct', nhom: 'xếp hạng', cau: ['công trình nào còn nhiều vật tư chưa về nhất', 'vật tư chưa về theo công trình'],
    kv: () => tt('vat_tu', { nhom: ['ten_cong_trinh'], loc: [{ cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }], ky: null }) },

  // ---- Hỏi nối tiếp ----
  { id: 'n6-qh-kh-pc', nhom: 'ngữ cảnh', truoc: 'hạng mục quá hạn kế hoạch theo xưởng', cau: ['theo PC thì sao', 'còn theo PC?', 'chia theo công trình'],
    kv: () => tt(SX, { loc: [{ cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] }], ky: null }) },
  { id: 'n6-kh-doi-ky', nhom: 'ngữ cảnh', truoc: 'kế hoạch nhập kho tháng này theo xưởng', cau: ['còn tháng 11?', 'tháng 11 thì sao'],
    kv: () => tt('khsx', { nhom: ['xuong_chinh'], ky: { tu: '2026-11-01', den: '2026-11-30' } }) },
  { id: 'n6-ma-bot', nhom: 'ngữ cảnh', dung: ['ma'], truoc: 'công trình {ma}', cau: ['theo BOT', 'chia theo BOT thì sao', 'theo BOP'],
    kv: d => tt(SX, { loc: [maLoc(d.ma)], ky: null }) },
  { id: 'n6-ma-bom', nhom: 'ngữ cảnh', dung: ['ma'], truoc: 'công trình {ma}', cau: ['BOM thì sao', 'còn vật tư?', 'vật tư theo trạng thái'],
    kv: d => tt('vat_tu', { loc: [maLoc(d.ma)], ky: null }) },

  // ======================= ĐỢT 7: CÂU NÓI TỰ NHIÊN (khẩu ngữ, cụt, không tên bảng rõ) =======================
  { id: 't7-nhap-roi', nhom: 'tự nhiên', cau: ['tháng này nhập được bao nhiêu rồi', 'tháng này nhập được nhiêu rồi', 'từ đầu tháng tới giờ nhập bao nhiêu', 'tháng này nhập kho tới đâu rồi'],
    kv: () => ({ loai: 'mau', y: 'nhap_kho' }) },
  { id: 't7-nhap-hq', nhom: 'tự nhiên', cau: ['hôm qua nhập được nhiêu', 'hôm qua nhập kho được bao nhiêu vậy', 'nay nhập kho bao nhiêu', 'hôm nay nhập được bao nhiêu rồi'],
    kv: () => ({ loai: 'mau', y: 'nhap_kho' }) },
  { id: 't7-giao', nhom: 'tự nhiên', cau: ['tuần này giao được bao nhiêu hàng', 'tháng rồi xuất được bao nhiêu', 'từ đầu năm tới giờ xuất bao nhiêu', 'tuần này giao hàng được nhiêu rồi'],
    kv: () => ({ loai: 'mau', y: 'xuat_kho' }) },
  { id: 't7-x-sao', nhom: 'tự nhiên', dung: ['x'], cau: ['{x} tháng này sao rồi', 'xưởng {x} tháng này nhập được bao nhiêu', '{x} tháng này nhập được nhiêu rồi'],
    kv: () => ({ loai: 'mau', y: 'nhap_kho' }) },
  { id: 't7-kho-con', nhom: 'tự nhiên', cau: ['kho còn bao nhiêu hàng', 'trong kho còn bao nhiêu', 'hàng tồn còn bao nhiêu', 'tồn kho giờ còn bao nhiêu'],
    kv: () => ({ loai: 'mau', y: 'ton_kho' }) },
  { id: 't7-ct-sao', nhom: 'tự nhiên', dung: ['ma'], cau: ['{ma} tới đâu rồi', '{ma} sao rồi', '{ma} làm tới đâu rồi', 'công trình {ma} giờ sao rồi'],
    kv: () => ({ loai: 'mau', y: 'cong_trinh' }) },
  { id: 't7-sap-tre', nhom: 'tự nhiên', cau: ['sắp trễ bao nhiêu hạng mục', 'mấy hạng mục sắp trễ hạn', 'bao nhiêu hàng sắp trễ'],
    kv: () => tt(SX, { loc: [{ cot: 'ngay_can_giao', op: 'trong_khoang', gt: ['2026-10-19', '2026-11-02'] }, conLai], ky: null }) },
  { id: 't7-dang-tre', nhom: 'tự nhiên', cau: ['hàng trễ bao nhiêu rồi', 'đang trễ bao nhiêu hạng mục', 'đang trễ hạn mấy hạng mục', 'bao nhiêu hàng đang trễ'],
    kv: () => tt(SX, { loc: quaHanGiao, ky: null }) },
  { id: 't7-x-cham', nhom: 'tự nhiên', cau: ['xưởng nào đang chậm nhất', 'xưởng nào trễ nhiều nhất', 'xưởng nào đang trễ hàng nhiều nhất'],
    kv: () => tt(SX, { nhom: ['xuong_chinh'], loc: quaHanGiao, ky: null }) },
  { id: 't7-ai-tre', nhom: 'tự nhiên', cau: ['PM nào đang ôm nhiều hàng trễ nhất', 'PM nào trễ nhiều nhất', 'ai trễ hàng nhiều nhất'],
    kv: () => tt(SX, { nhom: ['ten_pm'], loc: quaHanGiao, ky: null }) },
  { id: 't7-don-moi', nhom: 'tự nhiên', cau: ['tuần này có bao nhiêu đơn mới', 'đơn mới tuần này nhiều không', 'tuần này nhận được bao nhiêu đơn', 'tháng này về bao nhiêu đơn mới'],
    kv: () => ({ loai: 'mau', y: 'don_hang' }) },
  { id: 't7-pr-chua-ve', nhom: 'tự nhiên', cau: ['PR nào chưa về', 'vật tư nào chưa về', 'những PR nào còn chưa về'],
    kv: () => tt('vat_tu', { kieu: 'dong', loc: [{ cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }], ky: null }) },
  { id: 't7-pr-chua-mua', nhom: 'tự nhiên', cau: ['còn bao nhiêu PR chưa mua', 'PR chưa mua còn bao nhiêu', 'còn mấy PR chưa mua'],
    kv: () => tt('vat_tu', { loc: [{ cot: 'trang_thai', op: 'bang', gt: ['1.CHƯA MUA'] }], ky: null }) },
  { id: 't7-kh-tuan', nhom: 'tự nhiên', cau: ['kế hoạch tuần này được bao nhiêu rồi', 'tuần này đạt kế hoạch chưa', 'kế hoạch tuần này tới đâu rồi'],
    kv: () => ({ loai: 'mau', y: 'ke_hoach_tuan' }) },
  { id: 't7-muc-tieu', nhom: 'tự nhiên', cau: ['mục tiêu năm còn thiếu bao nhiêu', 'năm nay còn thiếu bao nhiêu so với kế hoạch', 'còn bao nhiêu nữa thì đạt kế hoạch năm'],
    kv: () => ({ loai: 'mau', y: 'tien_do_nam' }) },
  { id: 't7-di-lam', nhom: 'tự nhiên', dung: ['x'], cau: ['xưởng {x} hôm nay có bao nhiêu người đi làm', 'hôm nay {x} có bao nhiêu người đi làm'],
    kv: d => tt('diem_danh', { loc: [xLoc(d.x)], ky: { tu: '2026-10-19', den: '2026-10-19' } }) },
  { id: 't7-khong-biet', nhom: 'không trả lời được', cau: ['sao tháng này nhập ít vậy', 'tại sao xuất kho giảm', 'xưởng nào làm tốt nhất', 'tình hình chung thế nào'],
    kv: () => ({ loai: 'chua_tra_loi' }) },

  // ---- Hỏi nối tiếp tự nhiên ----
  // Câu hỏi mới (tự nêu công trình / xưởng + kỳ) sau 1 câu khác: không lấy điều kiện câu trước
  { id: 'n7-moi-ct', nhom: 'ngữ cảnh', dung: ['ma'], truoc: 'hàng trễ bao nhiêu rồi', cau: ['{ma} tới đâu rồi', '{ma} sao rồi'],
    kv: () => ({ loai: 'mau', y: 'cong_trinh' }) },
  { id: 'n7-moi-x', nhom: 'ngữ cảnh', dung: ['x'], truoc: ['hàng trễ bao nhiêu rồi', 'CT25-070 tới đâu rồi'], cau: ['{x} tháng này sao rồi', 'xưởng {x} tháng này nhập được bao nhiêu'],
    kv: () => ({ loai: 'mau', y: 'nhap_kho' }) },
  { id: 'n7-x-sao-con', nhom: 'ngữ cảnh', dung: ['x', 'x2'], truoc: '{x} tháng này sao rồi', cau: ['còn {x2}?', '{x2} thì sao'],
    kv: d => tt('nhap_kho', { loc: [xLoc(d.x2)], ky: kyCua(KY[4]) }) },
  { id: 'n7-moi-tre', nhom: 'ngữ cảnh', truoc: 'xuất kho xưởng 4A tháng 9', cau: ['hàng trễ bao nhiêu rồi', 'đang trễ bao nhiêu hạng mục'],
    kv: () => tt(SX, { loc: quaHanGiao, ky: null }) },
  { id: 'n7-nhap-x', nhom: 'ngữ cảnh', dung: ['x'], truoc: 'tháng này nhập được bao nhiêu rồi', cau: ['còn {x}?', '{x} thì sao', 'riêng {x} thì sao'],
    kv: d => tt('nhap_kho', { loc: [xLoc(d.x)], ky: kyCua(KY[4]) }) },
  { id: 'n7-nhap-ky', nhom: 'ngữ cảnh', truoc: 'tháng này nhập được bao nhiêu rồi', cau: ['vậy tháng trước?', 'tháng trước thì sao', 'còn tháng trước'],
    kv: () => tt('nhap_kho', { ky: kyCua(KY[5]) }) },
  { id: 'n7-nhap-ct', nhom: 'ngữ cảnh', truoc: 'tháng này nhập được bao nhiêu rồi', cau: ['công trình nào nhiều nhất?', 'của công trình nào nhiều nhất', 'chia theo công trình đi'],
    kv: () => tt('nhap_kho', { nhom: ['ten_cong_trinh'], ky: kyCua(KY[4]) }) },
  { id: 'n7-nhap-lk', nhom: 'ngữ cảnh', dung: ['x'], truoc: 'xưởng {x} tháng này nhập được bao nhiêu', cau: ['chi tiết đi', 'cho xem chi tiết', 'liệt kê ra đi'],
    kv: d => tt('nhap_kho', { kieu: 'dong', loc: [xLoc(d.x)], ky: kyCua(KY[4]) }) },
  { id: 'n7-nhap-xuat', nhom: 'ngữ cảnh', truoc: 'tháng này nhập được bao nhiêu rồi', cau: ['xuất thì sao', 'còn xuất?', 'giao được bao nhiêu'],
    kv: () => tt('xuat_kho', { ky: kyCua(KY[4]) }) },
  { id: 'n7-ct-pm', nhom: 'ngữ cảnh', dung: ['ma'], truoc: '{ma} sao rồi', cau: ['ai là PM?', 'PM là ai vậy', 'ai làm PM'],
    kv: d => tt(SX, { nhom: ['ten_pm'], loc: [maLoc(d.ma)], ky: null }) },
  { id: 'n7-ct-tre', nhom: 'ngữ cảnh', dung: ['ma'], truoc: '{ma} tới đâu rồi', cau: ['có gì trễ không?', 'trễ bao nhiêu hạng mục', 'đang trễ mấy hạng mục'],
    kv: d => tt(SX, { loc: [...quaHanGiao, maLoc(d.ma)], ky: null }) },
  // "có hạng mục nào … không": trả lời bằng danh sách
  { id: 'n7-ct-tre-lk', nhom: 'ngữ cảnh', dung: ['ma'], truoc: '{ma} tới đâu rồi', cau: ['có hạng mục nào trễ không', 'hạng mục nào đang trễ'],
    kv: d => tt(SX, { kieu: 'dong', loc: [...quaHanGiao, maLoc(d.ma)], ky: null }) },
  { id: 't7-sap-tre-lk', nhom: 'tự nhiên', cau: ['hàng nào sắp trễ', 'có hạng mục nào sắp trễ không'],
    kv: () => tt(SX, { kieu: 'dong', loc: [{ cot: 'ngay_can_giao', op: 'trong_khoang', gt: ['2026-10-19', '2026-11-02'] }, conLai], ky: null }) },
  { id: 'n7-ct-nhap', nhom: 'ngữ cảnh', dung: ['ma'], truoc: '{ma} sao rồi', cau: ['tháng này nhập được bao nhiêu?', 'nhập tháng này bao nhiêu'],
    kv: d => tt('nhap_kho', { loc: [maLoc(d.ma)], ky: kyCua(KY[4]) }) },
  { id: 'n7-tre-x', nhom: 'ngữ cảnh', truoc: 'hàng trễ bao nhiêu rồi', cau: ['theo xưởng đi', 'chia theo xưởng', 'xưởng nào nhiều nhất?'],
    kv: () => tt(SX, { nhom: ['xuong_chinh'], loc: quaHanGiao, ky: null }) },
  { id: 'n7-tre-pm', nhom: 'ngữ cảnh', truoc: 'hàng trễ bao nhiêu rồi', cau: ['PM nào nhiều nhất?', 'của PM nào nhiều nhất', 'theo PM đi'],
    kv: () => tt(SX, { nhom: ['ten_pm'], loc: quaHanGiao, ky: null }) },
  { id: 'n7-don-pm', nhom: 'ngữ cảnh', truoc: 'tuần này có bao nhiêu đơn mới', cau: ['PM nào nhiều nhất?', 'theo PM đi', 'của PM nào nhiều nhất'],
    kv: () => tt('dht', { nhom: ['ten_pm'], ky: kyCua(KY[2]) }) },
  { id: 'n7-don-ss', nhom: 'ngữ cảnh', truoc: 'tuần này có bao nhiêu đơn mới', cau: ['so với tuần trước?', 'so với tuần trước thì sao'],
    kv: () => tt('dht', { ky: kyCua(KY[2]), soSanh: kyCua(KY[3]) }) },
  { id: 'n7-don-tt', nhom: 'ngữ cảnh', truoc: 'tuần này có bao nhiêu đơn mới', cau: ['tuần trước thì sao', 'còn tuần trước?'],
    kv: () => tt('dht', { ky: kyCua(KY[3]) }) },

  // ======================= ĐỢT 8: QUY ƯỚC RÚT TỪ RÀ SOÁT VÒNG 1 (raSoat/*.json, cụm kv_sai) =======================
  // Quy ước kiểu: câu danh từ ("hạng mục X của xưởng Y", "PR trễ hẹn nhóm Z") không có "liệt kê / danh sách / những … nào"
  // => kiểu tổng; chỉ "hạng mục nào / hex nào / liệt kê / danh sách" mới là liệt kê dòng.
  { id: 'r8-sap-han-x', nhom: 'khái niệm', dung: ['x'], cau: ['hạng mục sắp đến hạn giao của xưởng {x}', 'hạng mục sắp tới hạn giao xưởng {x}'],
    kv: d => tt(SX, { loc: [xLoc(d.x), { cot: 'ngay_can_giao', op: 'trong_khoang', gt: ['2026-10-19', '2026-11-02'] }, conLai], ky: null }) },
  { id: 'r8-gcvt-x', nhom: 'giá trị', dung: ['x'], cau: ['hàng gia công vệ tinh của {x}', 'hạng mục gia công vệ tinh xưởng {x}'],
    kv: d => tt(SX, { loc: [xLoc(d.x), { cot: 'tinh_trang', op: 'bang', gt: CONG_DOAN_GCVT }], ky: null }) },
  { id: 'r8-pr-tre-nvt', nhom: 'khái niệm', dung: ['nvt'], cau: ['PR trễ hẹn nhóm {nvt}', 'vật tư {nvt} trễ hẹn'],
    kv: d => tt('vat_tu', { loc: [{ cot: 'nhom_vt', op: 'bang', gt: [d.nvt[1]] }, { cot: 'ngay_du_kien_giao_hang_pmh_nhap', op: 'nho_hon', gt: '2026-10-19' }, { cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }], ky: null }) },
  { id: 'r8-tren-x', nhom: 'lọc số', dung: ['n', 'x'], cau: ['hạng mục trị giá trên {n} tỷ xưởng {x}', 'hàng trên {n} tỷ đang ở xưởng {x}', 'xưởng {x} có bao nhiêu hạng mục trên {n} tỷ'],
    kv: d => tt(SX, { loc: [xLoc(d.x), { cot: 'tri_gia_don_hang_tong', op: 'lon_hon', gt: d.n * 1000 }], ky: null }) },
  { id: 'r8-nsp-x-chua-nk', nhom: 'giá trị', dung: ['nsp', 'x'], cau: ['hạng mục {nsp} của {x} chưa nhập kho', 'hạng mục {nsp} xưởng {x} chưa nhập kho', '{nsp} của {x} còn bao nhiêu chưa nhập kho'],
    kv: d => tt(SX, { loc: [xLoc(d.x), { cot: 'phan_loai_nhom_san_pham', op: 'bang', gt: [d.nsp[1]] }, conLai], ky: null }) },
  // "top N hạng mục giá trị lớn nhất" = bảng tổng chia theo hạng mục, có tổng trị giá, giới hạn N (không phải liệt kê dòng)
  { id: 'r8-top-hm-x', nhom: 'xếp hạng', dung: ['n', 'x'], cau: ['top {n} hạng mục giá trị lớn nhất đang làm ở {x}', 'top {n} hạng mục giá trị lớn nhất xưởng {x}', 'top {n} hạng mục trị giá lớn nhất của {x}'],
    kv: d => tt(SX, { nhom: ['ten_hang_muc'], coDo: { ham: 'tong', cot: 'tri_gia_don_hang_tong' }, gioiHan: d.n, loc: [xLoc(d.x)], ky: null }) },
  // "hạng mục nào … chưa nhập kho (không)" = liệt kê; "trên N tỷ chưa nhập kho" = trị giá đơn > N tỷ VÀ còn lại > 0
  { id: 'r8-ma-tren-chua-nk', nhom: 'liệt kê', dung: ['ma', 'n'], cau: ['{ma} còn hạng mục nào trên {n} tỷ chưa nhập kho không', 'hạng mục nào của {ma} trên {n} tỷ chưa nhập kho'],
    kv: d => tt(SX, { kieu: 'dong', loc: [maLoc(d.ma), { cot: 'tri_gia_don_hang_tong', op: 'lon_hon', gt: d.n * 1000 }, conLai], ky: null }) },
  // "còn lại bao nhiêu chưa nhập kho" luôn kèm lọc còn lại > 0 (cùng sx-ct-chua-nk); "ct" = công trình
  { id: 'r8-ct-con-chua-nk', nhom: 'công trình', dung: ['ct'], cau: ['ct {ct} còn lại bao nhiêu chưa nhập kho', 'công trình {ct} còn lại bao nhiêu chưa nhập kho'],
    kv: d => tt(SX, { coDo: { ham: 'tong', cot: 'gia_tri_con_lai' }, loc: [conLai, ctLoc(d.ct)], ky: null }) },
  // "chưa phiếu" = cột tình trạng phiếu (CHƯA PHIẾU), không phải công đoạn "14. CHƯA PHIẾU" (cùng sx-chua-phieu)
  { id: 'r8-chua-phieu-x', nhom: 'khái niệm', cau: ['hạng mục chưa phiếu theo xưởng', 'chưa phiếu theo từng xưởng'],
    kv: () => tt(SX, { nhom: ['xuong_chinh'], loc: [{ cot: 'tinh_trang_phieu', op: 'bang', gt: ['CHƯA PHIẾU'] }], ky: null }) },
  { id: 'r8-chua-phieu-cua-x', nhom: 'khái niệm', dung: ['x'], cau: ['hạng mục chưa phiếu của xưởng {x}'],
    kv: d => tt(SX, { loc: [xLoc(d.x), { cot: 'tinh_trang_phieu', op: 'bang', gt: ['CHƯA PHIẾU'] }], ky: null }) },
  // "đã tính phiếu của công trình X" = bảng tính phiếu lọc công trình, không kỳ (cùng ct-xuat-het)
  { id: 'r8-ct-tinh-phieu', nhom: 'công trình', dung: ['ct'], cau: ['trị giá đã tính phiếu của công trình {ct}', 'công trình {ct} đã tính phiếu bao nhiêu'],
    kv: d => tt('pthsp_full', { loc: [ctLoc(d.ct)], ky: null }) },
  // "tuần N xưởng/công trình nào rớt kế hoạch" = KH-TH trọn tuần N, tổng cột rớt kế hoạch chia theo xưởng/công trình (không lọc RỚT)
  { id: 'r8-rot-kh-tuan', nhom: 'kế hoạch', cau: ['tuần 43 xưởng nào rớt kế hoạch', 'xưởng nào rớt kế hoạch tuần 42', 'tuần 41 xưởng nào rớt kế hoạch', 'xưởng nào rớt kế hoạch tuần 44'],
    kv: (_, mau) => tt('phan_tich_kh_th', { coDo: { ham: 'tong', cot: 'rot_ke_hoach' }, nhom: ['xuong_chinh'], loc: [], ky: TUAN_SO[soTuan(mau)] }) },
  { id: 'r8-rot-kh-tuan-ct', nhom: 'kế hoạch', cau: ['tuần 42 công trình nào rớt kế hoạch', 'công trình nào rớt kế hoạch tuần 43'],
    kv: (_, mau) => tt('phan_tich_kh_th', { coDo: { ham: 'tong', cot: 'rot_ke_hoach' }, nhom: ['ten_cong_trinh'], loc: [], ky: TUAN_SO[soTuan(mau)] }) },
  // "kế hoạch tuần N / tuần này của xưởng X" = câu trả lời mẫu kế hoạch tuần (traLoi.keHoachTuan lọc xưởng + tuần)
  { id: 'r8-kh-tuan-x', nhom: 'mẫu', dung: ['x'], cau: ['kế hoạch tuần này của {x}', 'kế hoạch tuần 44 của {x}', 'kế hoạch tuần 43 xưởng {x}', 'kh tuần 42 xưởng {x}'],
    kv: () => ({ loai: 'mau', y: 'ke_hoach_tuan' }) },
  // "giờ công hành chính xưởng X tuần N" = mẫu MRA (đọc xưởng + tuần)
  { id: 'r8-mra-hc', nhom: 'mẫu', dung: ['x'], cau: ['giờ công hành chính {x} tuần 42', 'giờ công hành chính xưởng {x} tuần này', 'giờ công hành chính của {x} tuần trước'],
    kv: () => ({ loai: 'mau', y: 'mra' }) },
  // "hex N còn trong kho không" = tồn kho lọc HEX (gọi rõ "trong kho" => tự tra, không phải mẫu tra HEX)
  { id: 'r8-hex-ton', nhom: 'tra cứu', cau: ['hex 250012345 còn trong kho không', '250012345 còn trong kho không', 'hex 260816258 còn tồn trong kho không', 'hex 251012933 còn trong kho không'],
    kv: (_, mau) => tt('ton_kho', { loc: [{ cot: 'hex', op: 'bang', gt: [/\d{9}/.exec(mau)![0]] }], ky: null }) },

  // ---- Hỏi nối tiếp: "riêng X / còn X thì sao" sau bảng chia theo cột = giữ nhóm câu trước + lọc X (kiểu tổng) ----
  { id: 'n8-rieng-cd', nhom: 'ngữ cảnh', dung: ['x', 'cd'], truoc: 'hạng mục xưởng {x} theo công đoạn', cau: ['riêng {cd} thì sao', 'còn {cd} thì sao'],
    kv: d => tt(SX, { nhom: ['tinh_trang'], loc: [xLoc(d.x), { cot: 'tinh_trang', op: 'bang', gt: [d.cd[1]] }], ky: null }) },
  { id: 'n8-rieng-nsp', nhom: 'ngữ cảnh', dung: ['x', 'nsp'], truoc: 'nhóm sản phẩm {x} đang làm', cau: ['riêng {nsp} thì sao', 'còn {nsp} thì sao'],
    kv: d => tt(SX, { nhom: ['phan_loai_nhom_san_pham'], loc: [xLoc(d.x), { cot: 'phan_loai_nhom_san_pham', op: 'bang', gt: [d.nsp[1]] }], ky: null }) },
  // "chỉ lấy X thôi / X thôi" — cùng đáp án (giữ nhóm + lọc X); cần bộ đọc coi "chỉ lấy", "thôi" là từ đệm (cụm parser-viet-tat vòng 1 —
  // hiện còn nhờ AI "lay thoi"). Trường hợp nhóm sản phẩm ("ghe thoi") có ở raSoat/xuong.json x-089.
  { id: 'n8-chi-lay-thoi', nhom: 'ngữ cảnh', dung: ['x', 'cd'], truoc: 'hàng {x} đang ở công đoạn nào', cau: ['chỉ lấy {cd} thôi', '{cd} thôi'],
    kv: d => tt(SX, { nhom: ['tinh_trang'], loc: [xLoc(d.x), { cot: 'tinh_trang', op: 'bang', gt: [d.cd[1]] }], ky: null }) },

  // ======================= DANH MỤC KHÔNG TRẢ LỜI ĐƯỢC =======================
  { id: 'kh-khong', nhom: 'không trả lời được', cau: [
    'những công trình chưa có đơn hàng mới tháng này', 'tỷ lệ nhập kho đúng kế hoạch tuần 41', 'lương công nhân tháng này bao nhiêu',
    'dự báo nhập kho tháng sau', 'hex nào đã nhập kho nhưng chưa xuất kho', 'so sánh nhập kho và xuất kho tháng này',
    'tại sao xưởng 4A nhập kho giảm', 'thời tiết hôm nay', 'ai nghỉ phép hôm nay',
    'lợi nhuận tháng này bao nhiêu', 'giá bán trung bình mỗi mét vuông', 'khách hàng nào nợ tiền nhiều nhất',
  ], kv: () => ({ loai: 'chua_tra_loi' }) },

  // ======================= LỆNH CỬA SỔ: XUẤT BÁO CÁO (nhận trước khi đọc câu — baoCao/moHinh.ts) =======================
  // Định dạng theo chữ trong câu: "excel" => xlsx, "pdf" => pdf, không nói => null (cửa sổ hiện cả 2 nút)
  { id: 'l-xuat', nhom: 'lệnh', cau: ['xuất báo cáo', 'làm báo cáo', 'xuất file excel', 'xuất pdf', 'gửi file báo cáo', 'xuất báo cáo đi', 'in báo cáo'],
    kv: (_, mau) => ({ loai: 'lenh', lenh: 'xuat_bao_cao', dinhDang: dinhDangCua(mau), conLai: '' }) },
  // Lệnh kèm câu hỏi ("xuất báo cáo nhập kho tháng 9 theo xưởng"): hỏi câu đó trước rồi mời tải — conLai phải là đúng câu hỏi đã điền
  { id: 'l-xuat-mot-phat', nhom: 'lệnh', dung: ['b', 'ky'], cau: ['xuất báo cáo {b} {ky} theo xưởng', 'xuất excel {b} {ky}'],
    kv: (d, mau) => ({ loai: 'lenh', lenh: 'xuat_bao_cao', dinhDang: dinhDangCua(mau), conLai: /excel/.test(mau) ? `${d.bTen} ${d.ky.noi}` : `${d.bTen} ${d.ky.noi} theo xưởng` }) },
];

/** Định dạng file người dùng nói trong câu lệnh */
function dinhDangCua(cau: string): 'xlsx' | 'pdf' | null {
  return /pdf/i.test(cau) ? 'pdf' : /excel|xlsx/i.test(cau) ? 'xlsx' : null;
}

export const MAC_DINH = { KY, KY_MAC_DINH, CAP_KY, XUONG, TEN_CT, MA_CT, KHACH_HANG, PM_DH, PM_SX, PC_SX, NGUOI_TK, CONG_DOAN, NHOM_SP, NHOM_VT };
