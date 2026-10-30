import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { soSanh, gomSoKhopTram, type NgaySoKhopVao } from '../src/server/xuong/soKhopTram.js';

// So khớp trạm trong Báo cáo xưởng: giờ công bấm tay (chính thức) so với sổ trạm, tuần chạy song song

const nguoi = (coMat: number, cong: number) => ({ coMatThuong: coMat, coMatTangCa: 0, congThuong: cong, congTangCa: 0, cho: coMat - cong, theoHangMuc: {} });
const pb = (gioNguoi: number, gioSp: number, theoNguoi: Record<string, ReturnType<typeof nguoi>> = {}, diemDanh: Record<string, { vao: number; ra: number | null }> = {}) => ({
  gioNguoiTo: { thuong: gioNguoi, tangCa: 0 },
  theoHangMuc: gioSp ? { 'h|cd': { gioChay: 1, gioCongThuong: gioSp, gioCongTangCa: 0, co: [], gioNguoiKhai: gioSp, soNguoiMax: 1, soNguoiMin: 1 } } : {},
  theoNguoi, diemDanh,
});

describe('soSanh — chênh và ngưỡng tô màu', () => {
  it('chênh số và %, lớn khi ≥ 10% và ≥ 0,5 giờ', () => {
    assert.deepEqual(soSanh(100, 88), { chinhThuc: 100, tram: 88, chenh: -12, phanTram: -12, lon: true });
    assert.equal(soSanh(100, 95).lon, false); // 5%
    assert.equal(soSanh(3, 3.4).lon, false); // 13% nhưng chỉ 0,4 giờ
    assert.equal(soSanh(0, 0).lon, false);
  });
  it('chính thức = 0 mà trạm có giờ: % không có, vẫn là chênh lớn', () => {
    const s = soSanh(0, 2);
    assert.equal(s.phanTram, null);
    assert.equal(s.lon, true);
  });
});

describe('gomSoKhopTram — gom theo tổ / ngày / người', () => {
  const tenTo = new Map([[1, 'Tổ A'], [2, 'Tổ B']]);
  it('chỉ ngày có soKhopTram; tổ chưa ai quét không hiện', () => {
    const ds: NgaySoKhopVao[] = [
      { toId: 1, ngay: '2026-10-20', kq: { ...pb(75, 60), soKhopTram: pb(70, 55) } },
      { toId: 1, ngay: '2026-10-21', kq: { ...pb(75, 60), soKhopTram: pb(0, 0) } }, // song song, trạm trống
      { toId: 1, ngay: '2026-10-19', kq: pb(75, 60) }, // ngày 'cu' — không so
      { toId: 2, ngay: '2026-10-20', kq: { ...pb(40, 30), soKhopTram: pb(0, 0) } },
    ];
    const kq = gomSoKhopTram(ds, tenTo);
    assert.equal(kq.length, 1);
    const t = kq[0];
    assert.equal(t.ten, 'Tổ A');
    assert.deepEqual(t.theoNgay.map(n => n.ngay), ['2026-10-21', '2026-10-20']);
    assert.equal(t.theoNgay[0].khongCoTram, true);
    assert.equal(t.theoNgay[1].khongCoTram, false);
    assert.deepEqual([t.gioCong.chinhThuc, t.gioCong.tram], [150, 70]);
    assert.deepEqual([t.gioCongSp.chinhThuc, t.gioCongSp.tram], [120, 55]);
    assert.equal(t.soNgay, 2);
    assert.equal(t.soNgayLon, 1); // ngày trạm trống lệch 100%; ngày 20 lệch ~7%
  });
  it('từng người: hợp hai bên, giờ vào / ra, chênh lớn trước', () => {
    const ds: NgaySoKhopVao[] = [{
      toId: 1, ngay: '2026-10-20',
      kq: {
        ...pb(15, 12, { A: nguoi(7.5, 6), B: nguoi(7.5, 6) }, { A: { vao: 1, ra: 2 }, B: { vao: 1, ra: 2 } }),
        soKhopTram: pb(12.5, 10, { A: nguoi(7.5, 6), B: nguoi(5, 4), C: nguoi(1, 0) }, { A: { vao: 1, ra: 2 }, B: { vao: 3, ra: null } }),
      },
    }];
    const n = gomSoKhopTram(ds, tenTo, new Map([['B', 'Bình']]))[0].theoNgay[0];
    assert.deepEqual(n.soNguoi, { chinhThuc: 2, tram: 3 });
    assert.deepEqual(n.theoNguoi.map(x => x.mnv), ['B', 'C', 'A']);
    const b = n.theoNguoi[0];
    assert.equal(b.hoTen, 'Bình');
    assert.deepEqual(b.vao, { chinhThuc: 1, tram: 3 });
    assert.deepEqual(b.ra, { chinhThuc: 2, tram: null });
    assert.deepEqual([b.gioCong.chenh, b.gioCong.phanTram, b.gioCong.lon], [-2.5, -33, true]);
    assert.equal(n.theoNguoi[1].gioCong.phanTram, null); // C chỉ có ở trạm
    assert.equal(n.theoNguoi[2].gioCong.lon, false);
  });
});
