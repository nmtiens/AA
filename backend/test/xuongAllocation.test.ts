import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cuaSoTrongNgay, phanBoGioCong, trangThaiXacNhan, thuTrongTuan } from '../src/server/xuong/allocation.js';
import type { LichCaRow } from '../src/server/xuong/types.js';

// Phân bổ giờ công theo quân số tổ — không bao giờ nhân "thời gian × số người khai" như MRA (từng có 664 người / ngày)

const LICH: LichCaRow[] = [
  { loaiCa: 'chinh', gioBatDau: '07:30', gioKetThuc: '15:45', nghi: [['11:30', '12:30']] },
  { loaiCa: 'ca2', gioBatDau: '16:15', gioKetThuc: '20:15', nghi: [] },
  { loaiCa: 'ca4', gioBatDau: '16:15', gioKetThuc: '06:00', nghi: [] },
  { loaiCa: 'chu_nhat', gioBatDau: '07:30', gioKetThuc: '15:45', nghi: [] },
];
const NGAY = '2026-10-13'; // thứ Ba
const t = (hhmm: string, ngay = NGAY) => Date.parse(`${ngay}T${hhmm}:00+07:00`);
const H = (h: number) => Math.round(h * 1000) / 1000;

describe('cuaSoTrongNgay — giờ Việt Nam, nghỉ trưa, qua đêm, Chủ nhật', () => {
  it('ca chính trừ nghỉ trưa = 7,25 giờ', () => {
    const cs = cuaSoTrongNgay(NGAY, LICH, []);
    assert.equal(cs.length, 2);
    const tong = cs.reduce((a, c) => a + (c.end - c.start), 0) / 3_600_000;
    assert.equal(tong, 7.25);
    assert.equal(cs[0].start, t('07:30'));
  });
  it('ca 4 16h15–6h00 thuộc ngày bắt đầu, dài 13,75 giờ', () => {
    const cs = cuaSoTrongNgay(NGAY, LICH, ['ca4']).filter(c => c.loaiCa === 'ca4');
    assert.equal(cs[0].end, t('06:00', '2026-10-14'));
    assert.equal((cs[0].end - cs[0].start) / 3_600_000, 13.75);
  });
  it('Chủ nhật không có ca chính, chỉ tính khi khai tăng ca chu_nhat', () => {
    assert.equal(thuTrongTuan('2026-10-18'), 0);
    assert.deepEqual(cuaSoTrongNgay('2026-10-18', LICH, []), []);
    assert.equal(cuaSoTrongNgay('2026-10-18', LICH, ['chu_nhat']).length, 1);
  });
});

describe('phanBoGioCong', () => {
  const ca = cuaSoTrongNgay(NGAY, LICH, []);
  const now = t('23:00');

  it('tổng giờ công không vượt quân số × giờ; phần dư là giờ chờ', () => {
    // 10 người; hạng mục A 3 người chạy cả ca, B 2 người chạy 7h30–9h30
    const kq = phanBoGioCong({
      cuaSo: ca, quanSo: { chinh: 10 }, now,
      doanChay: { A: [{ start: t('07:30'), end: null }], B: [{ start: t('07:30'), end: t('09:30') }] },
      soNguoi: [{ key: 'A', at: t('07:30'), soNguoi: 3 }, { key: 'B', at: t('07:30'), soNguoi: 2 }],
    });
    assert.equal(kq.theoHangMuc.A.gioChay, 7.25);
    assert.equal(kq.theoHangMuc.A.gioCongThuong, H(3 * 7.25));
    assert.equal(kq.theoHangMuc.B.gioCongThuong, 4);
    assert.equal(kq.gioNguoiTo.thuong, 72.5);
    assert.equal(kq.gioCho.thuong, H(72.5 - 3 * 7.25 - 4));
    assert.deepEqual(kq.co, []);
    // Số người khai: A 3 người cả ca, B 2 người 2 giờ
    assert.equal(kq.theoHangMuc.A.gioNguoiKhai, H(3 * 7.25));
    assert.equal(kq.theoHangMuc.A.soNguoiMax, 3);
    assert.equal(kq.theoHangMuc.A.soNguoiMin, 3);
    assert.equal(kq.theoHangMuc.B.gioNguoiKhai, 4);
  });

  it('khai vượt quân số: co theo tỷ lệ, gắn cờ (không còn đếm trùng kiểu MRA)', () => {
    const kq = phanBoGioCong({
      cuaSo: ca, quanSo: { chinh: 4 }, now,
      doanChay: { A: [{ start: t('07:30'), end: t('08:30') }], B: [{ start: t('07:30'), end: t('08:30') }] },
      soNguoi: [{ key: 'A', at: t('07:30'), soNguoi: 4 }, { key: 'B', at: t('07:30'), soNguoi: 4 }],
    });
    assert.equal(kq.theoHangMuc.A.gioCongThuong + kq.theoHangMuc.B.gioCongThuong, 4);
    assert.ok(kq.co.includes('khai_vuot_quan_so'));
    assert.ok(kq.theoHangMuc.A.co.includes('khai_vuot_quan_so'));
  });

  it('chưa chốt quân số: theo số người khai, không giờ chờ, gắn cờ', () => {
    const kq = phanBoGioCong({
      cuaSo: ca, quanSo: {}, now,
      doanChay: { A: [{ start: t('07:30'), end: t('09:30') }] },
      soNguoi: [{ key: 'A', at: t('07:30'), soNguoi: 5 }],
    });
    assert.equal(kq.theoHangMuc.A.gioCongThuong, 10);
    assert.equal(kq.gioCho.thuong, 0);
    assert.ok(kq.co.includes('chua_chot_quan_so'));
  });

  it('không bấm tạm ngưng khi về: phần ngoài ca không tính; nghỉ trưa không tính', () => {
    const kq = phanBoGioCong({
      cuaSo: ca, quanSo: { chinh: 2 }, now: t('23:59'),
      doanChay: { A: [{ start: t('11:00'), end: null }] },
      soNguoi: [{ key: 'A', at: t('11:00'), soNguoi: 2 }],
    });
    // 11:00–11:30 + 12:30–15:45 = 3,75 giờ
    assert.equal(kq.theoHangMuc.A.gioChay, 3.75);
  });

  it('đổi số người giữa ca (chia lại người) dùng giá trị khai gần nhất trước mỗi đoạn', () => {
    const kq = phanBoGioCong({
      cuaSo: ca, quanSo: { chinh: 6 }, now,
      doanChay: { A: [{ start: t('07:30'), end: t('09:30') }] },
      soNguoi: [{ key: 'A', at: t('07:30'), soNguoi: 2 }, { key: 'A', at: t('08:30'), soNguoi: 6 }],
    });
    assert.equal(kq.theoHangMuc.A.gioCongThuong, 8);
  });

  it('tăng ca: tách giờ tăng ca, hạng mục bỏ chọn không tính trong ca đó', () => {
    const cs = cuaSoTrongNgay(NGAY, LICH, ['ca2']);
    const kq = phanBoGioCong({
      cuaSo: cs, quanSo: { chinh: 4, ca2: 2 }, now,
      doanChay: { A: [{ start: t('07:30'), end: null }], B: [{ start: t('07:30'), end: null }] },
      soNguoi: [{ key: 'A', at: t('07:30'), soNguoi: 2 }, { key: 'B', at: t('07:30'), soNguoi: 2 }],
      boChonTangCa: { ca2: ['B'] },
    });
    assert.equal(kq.theoHangMuc.A.gioCongTangCa, 8);
    assert.equal(kq.theoHangMuc.B.gioCongTangCa, 0);
    assert.equal(kq.theoHangMuc.B.gioChay, 7.25);
    assert.equal(kq.gioNguoiTo.tangCa, 8);
  });

  it('R3-3: ngừng tính hạng mục bỏ quên; chưa xác nhận vẫn tính + cờ', () => {
    const kq = phanBoGioCong({
      cuaSo: ca, quanSo: { chinh: 4 }, now,
      doanChay: { A: [{ start: t('07:30'), end: null }], B: [{ start: t('07:30'), end: null }] },
      soNguoi: [{ key: 'A', at: t('07:30'), soNguoi: 2 }, { key: 'B', at: t('07:30'), soNguoi: 2 }],
      ngungTinh: ['A'], chuaXacNhan: ['B'],
    });
    assert.equal(kq.theoHangMuc.A, undefined);
    assert.deepEqual(kq.theoHangMuc.B.co, ['chua_xac_nhan']);
  });
});

describe('trangThaiXacNhan — R3-3, bỏ qua Chủ nhật', () => {
  it('hôm qua có hoạt động → tính; thiếu 1 ngày → chưa xác nhận; thiếu 2 ngày → ngừng', () => {
    assert.equal(trangThaiXacNhan('2026-10-14', '2026-10-13'), 'tinh');
    assert.equal(trangThaiXacNhan('2026-10-14', '2026-10-12'), 'chua_xac_nhan');
    assert.equal(trangThaiXacNhan('2026-10-14', '2026-10-11'), 'ngung');
    // Thứ Hai sau Chủ nhật: hoạt động thứ Bảy vẫn coi là liền trước
    assert.equal(trangThaiXacNhan('2026-10-19', '2026-10-17'), 'tinh');
  });
});

describe('phanBoGioCong — lý do giờ chờ', () => {
  const ca = cuaSoTrongNgay(NGAY, LICH, []);
  it('người rảnh / tạm ngưng thiếu vật tư / không có việc; tổng = giờ chờ', () => {
    // 5 người. A 2 người chạy 7h30–9h30 (rảnh 3) → tạm ngưng thiếu vật tư tới 10h30 → chạy lại 2 người tới 11h30 → hết việc
    const kq = phanBoGioCong({
      cuaSo: ca, quanSo: { chinh: 5 }, now: t('23:00'),
      doanChay: { A: [{ start: t('07:30'), end: t('09:30') }, { start: t('10:30'), end: t('11:30') }] },
      soNguoi: [{ key: 'A', at: t('07:30'), soNguoi: 2 }],
      doanNgung: { A: [{ start: t('09:30'), end: t('10:30'), lyDo: 'thieu_vat_tu' }] },
    });
    assert.equal(kq.gioChoLyDo.nguoi_ranh, 3 * 3);
    assert.equal(kq.gioChoLyDo.thieu_vat_tu, 5);
    assert.equal(kq.gioChoLyDo.khong_viec, H(5 * 3.25)); // 12h30–15h45 (nghỉ trưa không tính)
    const tong = Object.values(kq.gioChoLyDo).reduce((a, b) => a + b, 0);
    assert.equal(H(tong), kq.gioCho.thuong);
  });
});
