import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hieuChinhGio, tinhLech, NGUONG_LECH_MS } from '../src/server/xuong/clock.js';
import { thoiGianTheoLo } from '../src/server/xuong/metrics.js';

describe('hieuChinhGio — lệch đo gần lúc bấm (R8)', () => {
  const now = Date.parse('2026-10-13T10:00:00Z');
  it('cộng lệch của sự kiện, không dùng lệch lúc gửi lô', () => {
    const kq = hieuChinhGio(now - 3_600_000, 90_000, false, now);
    assert.equal(kq.ts, now - 3_600_000 + 90_000);
    assert.deepEqual(kq.co, []);
  });
  it('gắn cờ: chưa đo lệch, lệch lớn, máy đổi giờ, giờ tương lai', () => {
    assert.deepEqual(hieuChinhGio(now, null, false, now).co, ['chua_do_lech']);
    assert.ok(hieuChinhGio(now, NGUONG_LECH_MS + 1, false, now + NGUONG_LECH_MS * 2).co.includes('lech_dong_ho_lon'));
    assert.ok(hieuChinhGio(now, 0, true, now).co.includes('doi_gio_may'));
    assert.ok(hieuChinhGio(now + 10 * 60_000, 0, false, now).co.includes('gio_tuong_lai'));
  });
  it('tinhLech dùng điểm giữa thời gian đi về', () => {
    assert.equal(tinhLech(1000, 1400, 5200), 4000);
  });
});

describe('thoiGianTheoLo — trong xưởng theo lô, mốc cố định (R3-4, R10)', () => {
  const t = (h: number) => h * 3_600_000;
  it('FIFO: lô sau không làm kết thúc sớm; mốc theo triển khai', () => {
    // Nhận 10 lúc 0h, giao ra 10 lúc 5h, nhận thêm 20 lúc 6h, giao 20 lúc 9h; triển khai 30
    const kq = thoiGianTheoLo(
      [{ ts: t(0), soLuong: 10 }, { ts: t(6), soLuong: 20 }],
      [{ ts: t(5), soLuong: 10 }, { ts: t(9), soLuong: 20 }],
      { soLuong: 30, loai: 'trien_khai' }, t(20));
    assert.equal(kq.lo[0].thoiGian, t(5));
    assert.equal(kq.lo[1].thoiGian, t(3));
    assert.equal(kq.ketThuc, t(9));
    assert.equal(kq.thoiGian, t(9));
    assert.equal(kq.tamTinh, false);
    assert.equal(kq.phanTram, 100);
  });
  it('chưa đủ mốc: % và thời gian tạm tính tới now', () => {
    const kq = thoiGianTheoLo([{ ts: t(0), soLuong: 10 }], [{ ts: t(5), soLuong: 10 }], { soLuong: 30, loai: 'trien_khai' }, t(8));
    assert.equal(kq.ketThuc, null);
    assert.equal(kq.tamTinh, true);
    assert.equal(kq.thoiGian, t(8));
    assert.equal(Math.round(kq.phanTram), 33);
  });
  it('không có QT1 trên app → mốc theo đơn hàng', () => {
    const kq = thoiGianTheoLo([{ ts: t(1), soLuong: 4 }], [{ ts: t(3), soLuong: 4 }], { soLuong: 4, loai: 'don_hang' }, t(5));
    assert.equal(kq.loaiMoc, 'don_hang');
    assert.equal(kq.thoiGian, t(2));
  });
});
