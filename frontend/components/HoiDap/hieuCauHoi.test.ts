import { describe, it, expect } from 'vitest';
import { hieuCauHoi, boDau, tuanIso, thu2TuanIso, moVietTat } from './hieuCauHoi';

const H = new Date(2026, 9, 17); // thứ Bảy 17/10/2026
const ymd = (d: Date | undefined) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : '');

describe('hieuCauHoi', () => {
  it('bỏ dấu', () => {
    expect(boDau('Nhập KHO  tuần này')).toBe('nhap kho tuan nay');
    expect(boDau('Đơn hàng')).toBe('don hang');
  });

  it('nhận loại câu hỏi', () => {
    expect(hieuCauHoi('nhập kho tuần này', H).y).toBe('nhap_kho');
    expect(hieuCauHoi('Tồn kho hiện tại', H).y).toBe('ton_kho');
    expect(hieuCauHoi('đơn hàng mới hôm qua', H).y).toBe('don_hang');
    expect(hieuCauHoi('kế hoạch tuần 41', H).y).toBe('ke_hoach_tuan');
    expect(hieuCauHoi('tiến độ kế hoạch năm', H).y).toBe('tien_do_nam');
    expect(hieuCauHoi('vướng mắc quá hạn xưởng 4A', H).y).toBe('vuong_mac');
    expect(hieuCauHoi('chưa thể sản xuất bao nhiêu', H).y).toBe('co_the_sx');
    expect(hieuCauHoi('giờ công xưởng 2A tuần này', H).y).toBe('mra');
    expect(hieuCauHoi('260816258', H).y).toBe('tra_hex');
    expect(hieuCauHoi('hỏi được gì', H).y).toBe('tro_giup');
    expect(hieuCauHoi('điểm nghẽn ở đâu', H).y).toBe('diem_nghen');
  });

  it('đọc xưởng, hex, nhóm', () => {
    const c = hieuCauHoi('nhập kho xưởng 8ab 7 ngày theo công trình', H);
    expect(c.xuong).toBe('8AB');
    expect(c.nhom).toBe('congtrinh');
    expect(hieuCauHoi('nhập kho 30 ngày', H).xuong).toBeNull();
    expect(hieuCauHoi('xuất kho theo xưởng', H).nhom).toBe('xuong');
    expect(hieuCauHoi('tra 260816258', H).hex).toBe('260816258');
  });

  it('đọc khoảng ngày', () => {
    expect(ymd(hieuCauHoi('nhập kho hôm qua', H).ky?.tu)).toBe('2026-10-16');
    const tn = hieuCauHoi('đơn hàng tuần này', H).ky!;
    expect(ymd(tn.tu)).toBe('2026-10-12');
    expect(ymd(tn.den)).toBe('2026-10-17');
    const tt = hieuCauHoi('nhập kho tháng trước', H).ky!;
    expect(ymd(tt.tu)).toBe('2026-9-1');
    expect(ymd(tt.den)).toBe('2026-9-30');
    expect(ymd(hieuCauHoi('xuất kho 7 ngày', H).ky?.tu)).toBe('2026-10-11');
    const r = hieuCauHoi('nhập kho từ 1/10 đến 10/10', H).ky!;
    expect(ymd(r.tu)).toBe('2026-10-1');
    expect(ymd(r.den)).toBe('2026-10-10');
    expect(hieuCauHoi('tồn kho', H).ky).toBeNull();
  });

  it('công trình, nhiều HEX, tìm tự do', () => {
    const a = hieuCauHoi('công trình CT26-110', H);
    expect(a.y).toBe('cong_trinh');
    expect(a.congTrinh).toBe('CT26-110');
    const b = hieuCauHoi('nhập kho tháng này công trình Tây Hồ View tháp 4A', H);
    expect(b.y).toBe('nhap_kho');
    expect(b.congTrinh).toBe('Tây Hồ View tháp 4A');
    expect(b.xuong).toBeNull();
    expect(hieuCauHoi('ct24 066 thế nào', H).congTrinh).toBe('CT24-066');
    expect(hieuCauHoi('công trình TÀU KHÁCH_CT25-047', H).congTrinh).toBe('CT25-047');
    expect(hieuCauHoi('nhập kho theo công trình', H).congTrinh).toBeNull();
    const c = hieuCauHoi('260816258, 260816259 260816258', H);
    expect(c.y).toBe('tra_hex');
    expect(c.hexList).toEqual(['260816258', '260816259']);
    const d = hieuCauHoi('Emerald Raiya', H);
    expect(d.y).toBe('tim_kiem');
    expect(d.tuKhoa).toBe('Emerald Raiya');
    expect(hieuCauHoi('hỏi được gì', H).y).toBe('tro_giup');
  });

  it('tuần ISO', () => {
    expect(tuanIso(H)).toBe(42);
    expect(ymd(thu2TuanIso(2026, 42))).toBe('2026-10-12');
  });

  it('mở viết tắt trước khi đọc ("vm", "kh", "nk", "tg", "bn"); số sau PR / PO không phải HEX', () => {
    // câu gõ không dấu => mở cũng không dấu
    expect(moVietTat('nk 8AB tuan nay bn')).toBe('nhap kho 8AB tuan nay bao nhieu');
    expect(moVietTat('còn bn tiền chưa nk')).toBe('còn bao nhiêu tiền chưa nhập kho');
    // không mở: "kh-th / kh th" (bảng KH-TH), "vướng SL" (mẫu chưa thể sản xuất), "500 k" (nghìn)
    expect(moVietTat('kh-th tuần 41, kh th, vướng sl, 500 k')).toBe('kh-th tuần 41, kh th, vướng sl, 500 k');
    expect(hieuCauHoi('vm qua han', H).y).toBe('vuong_mac');
    expect(hieuCauHoi('kh tuần 42 xưởng 4A', H).y).toBe('ke_hoach_tuan');
    expect(hieuCauHoi('vuong sl', H).y).toBe('co_the_sx');
    const a = hieuCauHoi('nk 8AB tuan nay bn', H);
    expect(a.y).toBe('nhap_kho');
    expect(a.xuong).toBe('8AB');
    expect(ymd(a.ky?.tu)).toBe('2026-10-12');
    expect(hieuCauHoi('tiến độ tg 10 ntn', H).thang).toBe(10);
    expect(hieuCauHoi('số PR 1000234567 đến đâu rồi', H).hex).toBeNull();
  });

  it('vòng 1 (cụm parser-mau): "<kỳ> sao rồi", "vấn đề / sự cố", tên công trình + "làm tới đâu", 2 chỉ số của 1 công trình', () => {
    // chỉ kỳ, không chủ ngữ => tiến độ tháng / kế hoạch tuần / tiến độ năm
    expect(hieuCauHoi('tháng này sao rồi', H).y).toBe('tien_do_thang');
    expect(hieuCauHoi('tuần trước thế nào', H).y).toBe('ke_hoach_tuan');
    expect(hieuCauHoi('năm nay sao rồi', H).y).toBe('tien_do_nam');
    // "4A tháng này sao rồi" vẫn là nhập kho của xưởng (luật cũ)
    expect(hieuCauHoi('4A tháng này sao rồi', H).y).toBe('nhap_kho');
    expect(hieuCauHoi('chỗ nào có vấn đề', H).y).toBe('vuong_mac');
    expect(hieuCauHoi('hôm nay có sự cố gì không', H).y).toBe('vuong_mac');
    // tên công trình nói trống + hỏi tình hình => tóm tắt công trình
    const np = hieuCauHoi('nam phương làm tới đâu rồi', H);
    expect(np.y).toBe('cong_trinh');
    expect(np.congTrinh).toBe('nam phương');
    expect(hieuCauHoi('tủ áo của tây hồ view bên 4A làm tới đâu rồi', H).congTrinh).toBeNull();
    // hỏi 2 chỉ số của 1 công trình => tóm tắt; "chưa nhập kho" không tính là chỉ số nhập kho
    const hai = hieuCauHoi('CT25-070 tổng đơn bao nhiêu, nhập kho được bao nhiêu rồi?', H);
    expect(hai.y).toBe('cong_trinh');
    expect(hai.tuKhop).toBe('tom tat');
    expect(hieuCauHoi('CT25-070 còn bao nhiêu hạng mục chưa nhập kho', H).y).toBe('nhap_kho');
  });

  it('vòng 1 (cụm parser-ke-hoach): kỳ nói trước "kế hoạch"; kỳ "tháng sau / tuần sau"', () => {
    expect(hieuCauHoi('tuần này kế hoạch nhập kho bao nhiêu', H).y).toBe('ke_hoach_tuan');
    expect(hieuCauHoi('tháng này kế hoạch bao nhiêu', H).y).toBe('tien_do_thang');
    // "kế hoạch nhập kho tháng này" vẫn là nhập kho ở đây — bộ đọc tự tra chọn bảng kế hoạch (nenTuTra)
    expect(hieuCauHoi('kế hoạch nhập kho tháng này', H).y).toBe('nhap_kho');
    const ts = hieuCauHoi('kế hoạch tháng sau', H).ky!;
    expect(ymd(ts.tu)).toBe('2026-11-1');
    expect(ymd(ts.den)).toBe('2026-11-30');
    const tuanSau = hieuCauHoi('kế hoạch tuần tới', H).ky!;
    expect(ymd(tuanSau.tu)).toBe('2026-10-19');
    expect(ymd(tuanSau.den)).toBe('2026-10-25');
    // "chỉ tiêu" + tuần / tháng = kế hoạch tuần / tiến độ tháng; "tháng 9 đạt kế hoạch chưa" = tiến độ tháng 9; "chỉ tiêu" lẻ vẫn là tiến độ năm
    expect(hieuCauHoi('chỉ tiêu tuần 43 của 8AB', H).y).toBe('ke_hoach_tuan');
    expect(hieuCauHoi('chỉ tiêu tháng này', H).y).toBe('tien_do_thang');
    expect(hieuCauHoi('nhập kho tháng 9 đạt kế hoạch chưa', H).y).toBe('tien_do_thang');
    expect(hieuCauHoi('chỉ tiêu năm nay còn thiếu bao nhiêu', H).y).toBe('tien_do_nam');
  });
});
