import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tinhTrangThai, suKienConHieuLuc, tuyenTheoThanhPhan, slGiaoDenDongBo } from '../src/server/xuong/state.js';
import type { SuKien } from '../src/server/xuong/types.js';

// Chạy: npm test. Trạng thái (hex, công đoạn) tính lại từ sổ sự kiện — quyết định R3 trong docs/designs/xuong-checkin.md

let seq = 0;
const T0 = Date.parse('2026-10-13T08:00:00+07:00');
const ev = (p: Partial<SuKien> & Pick<SuKien, 'loai'>, phut = 0): SuKien => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  hex: '250301895', congDoanId: 'CD1', toId: 1, soLuong: null, congDoanDenId: null, congDoanNguonId: null,
  xuongNguon: null, soNguoi: null, duLieu: null, ts: T0 + phut * 60_000, serverTs: T0 + phut * 60_000, suaCho: null,
  ...p,
});
const giaoDen = (sl: number, phut = 0) => ev({ loai: 'giao', congDoanId: 'CD0', congDoanDenId: 'CD1', soLuong: sl }, phut);

describe('tinhTrangThai — chuỗi bình thường', () => {
  it('giao đến → chờ nhận → nhận → bắt đầu → hoàn thành → giao', () => {
    const den = [giaoDen(10, 0)];
    assert.equal(tinhTrangThai([], den).trangThai, 'cho_nhan');
    const own = [ev({ loai: 'nhan', soLuong: 10 }, 5)];
    assert.equal(tinhTrangThai(own, den).trangThai, 'da_nhan');
    own.push(ev({ loai: 'bat_dau', soNguoi: 3 }, 10));
    const dang = tinhTrangThai(own, den);
    assert.equal(dang.trangThai, 'dang_lam');
    assert.equal(dang.soNguoi, 3);
    assert.deepEqual(dang.doanChay, [{ start: T0 + 600_000, end: null }]);
    own.push(ev({ loai: 'hoan_thanh', soLuong: 10 }, 70));
    assert.equal(tinhTrangThai(own, den).trangThai, 'cho_giao');
    own.push(ev({ loai: 'giao', soLuong: 10, congDoanDenId: 'CD2' }, 71));
    const xong = tinhTrangThai(own, den);
    assert.equal(xong.trangThai, 'xong');
    assert.deepEqual(xong.co, []);
    assert.deepEqual(xong.doanChay, [{ start: T0 + 600_000, end: T0 + 70 * 60_000 }]);
  });

  it('xong một phần: vẫn đang chạy phần còn lại; xong hết số đã nhận mới dừng đồng hồ', () => {
    const own = [ev({ loai: 'nhan', soLuong: 10 }, 0), ev({ loai: 'bat_dau', soNguoi: 5 }, 0), ev({ loai: 'hoan_thanh', soLuong: 6 }, 30)];
    const motPhan = tinhTrangThai(own, [giaoDen(10)]);
    assert.equal(motPhan.trangThai, 'dang_lam');
    assert.equal(motPhan.slHoanThanh, 6);
    assert.deepEqual(motPhan.doanChay, [{ start: T0, end: null }]);
    own.push(ev({ loai: 'hoan_thanh', soLuong: 4 }, 60));
    const het = tinhTrangThai(own, [giaoDen(10)]);
    assert.equal(het.trangThai, 'cho_giao');
    assert.deepEqual(het.doanChay, [{ start: T0, end: T0 + 60 * 60_000 }]);
  });

  it('tạm ngưng / tiếp tục tạo hai đoạn chạy', () => {
    const own = [
      ev({ loai: 'nhan', soLuong: 2 }, 0), ev({ loai: 'bat_dau', soNguoi: 2 }, 0),
      ev({ loai: 'tam_ngung' }, 30), ev({ loai: 'tiep_tuc', soNguoi: 1 }, 60),
    ];
    const st = tinhTrangThai(own, [giaoDen(2)]);
    assert.equal(st.trangThai, 'dang_lam');
    assert.equal(st.soNguoi, 1);
    assert.equal(st.doanChay.length, 2);
    assert.equal(st.doanChay[0].end, T0 + 30 * 60_000);
    const dung = tinhTrangThai([...own, ev({ loai: 'tam_ngung' }, 90)], [giaoDen(2)]);
    assert.equal(dung.trangThai, 'tam_ngung');
  });
});

describe('tinhTrangThai — sai thứ tự / sai chuỗi vẫn tính, gắn cờ', () => {
  it('sự kiện đến sai thứ tự được sắp lại theo giờ bấm', () => {
    const own = [ev({ loai: 'hoan_thanh', soLuong: 1 }, 50), ev({ loai: 'nhan', soLuong: 1 }, 0), ev({ loai: 'bat_dau' }, 10)];
    const st = tinhTrangThai(own, [giaoDen(1)]);
    assert.equal(st.trangThai, 'cho_giao');
    assert.deepEqual(st.co, []);
  });
  it('bắt đầu hai lần, hoàn thành khi chưa bắt đầu, nhận khi chưa thấy giao', () => {
    assert.ok(tinhTrangThai([ev({ loai: 'bat_dau' }, 0), ev({ loai: 'bat_dau' }, 5)], []).co.includes('bat_dau_hai_lan'));
    assert.ok(tinhTrangThai([ev({ loai: 'nhan', soLuong: 1 }), ev({ loai: 'hoan_thanh', soLuong: 1 }, 1)], [giaoDen(1)]).co
      .includes('hoan_thanh_chua_bat_dau'));
    const st = tinhTrangThai([ev({ loai: 'nhan', soLuong: 5 })], []);
    assert.ok(st.co.includes('nhan_chua_thay_giao'));
    // Giao tới sau (đồng bộ trễ) => tự hết cờ
    assert.ok(!tinhTrangThai([ev({ loai: 'nhan', soLuong: 5 })], [giaoDen(5, 3)]).co.includes('nhan_chua_thay_giao'));
  });
  it('nhận từ xưởng chưa dùng app (có nguồn) không gắn cờ thiếu giao (R10)', () => {
    const st = tinhTrangThai([ev({ loai: 'nhan', soLuong: 5, xuongNguon: '2B' })], []);
    assert.deepEqual(st.co, []);
    assert.equal(st.trangThai, 'da_nhan');
  });
});

describe('suKienConHieuLuc — huỷ một cấp', () => {
  it('huy bỏ sự kiện gốc; huy-của-huy khôi phục sự kiện gốc', () => {
    const goc = ev({ loai: 'nhan', soLuong: 5 }, 0);
    const huy = ev({ loai: 'huy', suaCho: goc.id }, 1);
    assert.deepEqual(suKienConHieuLuc([goc, huy]).map(e => e.id), []);
    const khoiPhuc = ev({ loai: 'huy', suaCho: huy.id }, 2);
    assert.deepEqual(suKienConHieuLuc([goc, huy, khoiPhuc]).map(e => e.id), [goc.id]);
  });
  it('huỷ sự kiện giao đến làm công đoạn sau hết chờ nhận', () => {
    const g = giaoDen(4, 0);
    assert.equal(tinhTrangThai([], [g]).slGiaoDen, 4);
    const st = tinhTrangThai([], [g, ev({ loai: 'huy', suaCho: g.id, congDoanId: 'CD0' }, 1)]);
    assert.equal(st.slGiaoDen, 0);
  });
});

describe('Công đoạn thành phần — song song (QT1 / QT2)', () => {
  // Gỗ: MOC → FIT; Kim loại: KL1 → KL2 → FIT; hợp nhánh ở FIT, sau đó BB (chung)
  const tk = ev({ loai: 'trien_khai', congDoanId: null, soLuong: 10, duLieu: { xuong: '3A', thanhPhan: [
    { ten: 'GỖ', xuong: '3A', tuyen: ['MOC', 'FIT', 'BB'] },
    { ten: 'KIM LOẠI', xuong: '8C', tuyen: [] },
  ] } });
  const khaiKl = ev({ loai: 'khai_bao_cd', congDoanId: null, congDoanDenId: 'KL1', soLuong: 10,
    duLieu: { thanhPhan: 'KIM LOẠI', trienKhaiId: tk.id, tuyen: ['KL1', 'KL2', 'FIT', 'BB'] } }, 1);
  const giao = (tu: string, den: string, sl: number, phut: number) => ev({ loai: 'giao', congDoanId: tu, congDoanDenId: den, soLuong: sl }, phut);

  it('tuyenTheoThanhPhan: lấy tuyến xưởng chính khai + tuyến xưởng phụ khai CĐ chi tiết; bỏ thành phần chưa có tuyến', () => {
    assert.deepEqual(tuyenTheoThanhPhan([tk, khaiKl]), [
      { thanhPhan: 'GỖ', tuyen: ['MOC', 'FIT', 'BB'] },
      { thanhPhan: 'KIM LOẠI', tuyen: ['KL1', 'KL2', 'FIT', 'BB'] },
    ]);
    // Bản cũ: 1 tuyến không tên
    assert.deepEqual(tuyenTheoThanhPhan([ev({ loai: 'trien_khai', duLieu: { xuong: '3A', tuyen: ['A', 'B'] } })]), [{ thanhPhan: '', tuyen: ['A', 'B'] }]);
  });

  it('công đoạn hợp nhánh chỉ tính số bộ đã về đủ mọi thành phần', () => {
    const tuyen = tuyenTheoThanhPhan([tk, khaiKl]);
    const den = [giao('MOC', 'FIT', 10, 30), giao('KL2', 'FIT', 6, 40)];
    assert.equal(tinhTrangThai([], den, tuyen, 'FIT').slGiaoDen, 6);
    assert.equal(slGiaoDenDongBo([giao('MOC', 'FIT', 10, 30)], tuyen, 'FIT'), 0); // kim loại chưa về
    // Công đoạn sau hợp nhánh (chung mọi nhánh): cộng thẳng
    assert.equal(tinhTrangThai([], [giao('FIT', 'BB', 5, 50)], tuyen, 'BB').slGiaoDen, 5);
    // Công đoạn chỉ một thành phần đi qua: cộng thẳng
    assert.equal(tinhTrangThai([], [giao('KL1', 'KL2', 7, 20)], tuyen, 'KL2').slGiaoDen, 7);
  });

  it('không có thành phần (bản cũ): như trước', () => {
    assert.equal(tinhTrangThai([], [giaoDen(4), giaoDen(3, 1)]).slGiaoDen, 7);
  });
});
