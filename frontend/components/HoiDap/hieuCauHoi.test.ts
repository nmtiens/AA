import { describe, it, expect } from 'vitest';
import { hieuCauHoi, boDau, tuanIso, thu2TuanIso } from './hieuCauHoi';

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
});
