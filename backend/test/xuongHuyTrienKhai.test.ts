import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kiemTraHuyDot, suKienCuaDot } from '../src/server/xuong/huyTrienKhai.js';
import type { SuKien } from '../src/server/xuong/types.js';

// Huỷ đợt triển khai từ máy tính: chọn trien_khai + khai_bao_cd của đợt, chặn khi tổ đầu tuyến đã nhận hàng của đợt

let seq = 0;
const T0 = Date.parse('2026-10-20T08:00:00+07:00');
const ev = (p: Partial<SuKien> & Pick<SuKien, 'loai'>, phut = 0): SuKien => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  hex: '250301895', congDoanId: null, toId: null, soLuong: null, congDoanDenId: null, congDoanNguonId: null,
  xuongNguon: null, soNguoi: null, duLieu: null, ts: T0 + phut * 60_000, serverTs: T0 + phut * 60_000, suaCho: null,
  ...p,
});
/** Đợt triển khai: trien_khai + khai_bao_cd tới công đoạn đầu mỗi tuyến */
const dot = (sl: number, tp: Array<{ ten: string; tuyen: string[] }>, phut = 0) => {
  const tk = ev({ loai: 'trien_khai', soLuong: sl, duLieu: { xuong: 'X1', thanhPhan: tp.map(t => ({ ...t, xuong: 'X1' })) } }, phut);
  const kb = tp.map(t => ev({ loai: 'khai_bao_cd', soLuong: sl, congDoanDenId: t.tuyen[0], duLieu: { trienKhaiId: tk.id, thanhPhan: t.ten, tuyen: t.tuyen } }, phut));
  return [tk, ...kb];
};
const nhan = (cd: string, to: number, sl: number, phut = 10) => ev({ loai: 'nhan', congDoanId: cd, toId: to, soLuong: sl }, phut);

describe('suKienCuaDot', () => {
  it('trien_khai + khai_bao_cd gắn trienKhaiId (cả khai của xưởng phụ), không lấy đợt khác', () => {
    const a = dot(10, [{ ten: 'GỖ', tuyen: ['CD1', 'CD2'] }]);
    const b = dot(5, [{ ten: 'GỖ', tuyen: ['CD1', 'CD2'] }], 5);
    const phu = ev({ loai: 'khai_bao_cd', soLuong: 10, congDoanDenId: 'P1', duLieu: { trienKhaiId: a[0].id, thanhPhan: 'SOFA', tuyen: ['P1'] } }, 20);
    assert.deepEqual(suKienCuaDot([...a, ...b, phu], a[0].id).map(e => e.id), [a[0].id, a[1].id, phu.id]);
  });
  it('đợt đã huỷ: rỗng; khai_bao_cd đã huỷ riêng thì không lấy', () => {
    const a = dot(10, [{ ten: 'GỖ', tuyen: ['CD1'] }]);
    assert.deepEqual(suKienCuaDot([...a, ev({ loai: 'huy', suaCho: a[0].id }, 1)], a[0].id), []);
    assert.deepEqual(suKienCuaDot([...a, ev({ loai: 'huy', suaCho: a[1].id }, 1)], a[0].id).map(e => e.id), [a[0].id]);
  });
});

describe('kiemTraHuyDot — chặn khi tổ đã nhận hàng của đợt', () => {
  it('chưa ai nhận: huỷ được', () => {
    const a = dot(10, [{ ten: 'GỖ', tuyen: ['CD1', 'CD2'] }]);
    const kq = kiemTraHuyDot(a, a[0].id);
    assert.ok(kq);
    assert.equal(kq.huy.length, 2);
    assert.deepEqual(kq.chan, []);
  });
  it('tổ đầu tuyến đã nhận: chặn, báo tổ, số nhận và số còn giao tới', () => {
    const a = dot(10, [{ ten: 'GỖ', tuyen: ['CD1', 'CD2'] }]);
    const kq = kiemTraHuyDot([...a, nhan('CD1', 7, 4)], a[0].id);
    assert.deepEqual(kq?.chan, [{ congDoanId: 'CD1', toIds: [7], slNhan: 4, slGiaoDenConLai: 0 }]);
  });
  it('hai đợt, đã nhận ít hơn đợt còn lại: huỷ được; nhận nhiều hơn: chặn', () => {
    const a = dot(10, [{ ten: 'GỖ', tuyen: ['CD1'] }]);
    const b = dot(5, [{ ten: 'GỖ', tuyen: ['CD1'] }], 5);
    assert.deepEqual(kiemTraHuyDot([...a, ...b, nhan('CD1', 7, 5)], a[0].id)?.chan, []);
    assert.equal(kiemTraHuyDot([...a, ...b, nhan('CD1', 7, 6)], a[0].id)?.chan[0]?.slGiaoDenConLai, 5);
  });
  it('nhận đã huỷ, nhận ngoài app (ghi nguồn): không chặn', () => {
    const a = dot(10, [{ ten: 'GỖ', tuyen: ['CD1'] }]);
    const n = nhan('CD1', 7, 4);
    assert.deepEqual(kiemTraHuyDot([...a, n, ev({ loai: 'huy', suaCho: n.id }, 20)], a[0].id)?.chan, []);
    assert.deepEqual(kiemTraHuyDot([...a, ev({ loai: 'nhan', congDoanId: 'CD1', toId: 7, soLuong: 4, xuongNguon: 'X9' }, 10)], a[0].id)?.chan, []);
  });
  it('xưởng phụ đã nhận thành phần của đợt: chặn ở công đoạn xưởng phụ', () => {
    const a = dot(10, [{ ten: 'GỖ', tuyen: ['CD1'] }]);
    const phu = ev({ loai: 'khai_bao_cd', soLuong: 10, congDoanDenId: 'P1', duLieu: { trienKhaiId: a[0].id, thanhPhan: 'SOFA', tuyen: ['P1'] } }, 20);
    const kq = kiemTraHuyDot([...a, phu, nhan('P1', 9, 10, 30)], a[0].id);
    assert.deepEqual(kq?.chan.map(c => c.congDoanId), ['P1']);
  });
  it('đợt không còn hiệu lực: null', () => {
    const a = dot(10, [{ ten: 'GỖ', tuyen: ['CD1'] }]);
    assert.equal(kiemTraHuyDot([...a, ev({ loai: 'huy', suaCho: a[0].id }, 1)], a[0].id), null);
    assert.equal(kiemTraHuyDot(a, 'khong-co'), null);
  });
});
