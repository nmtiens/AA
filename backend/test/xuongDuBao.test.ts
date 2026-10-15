import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { duBaoHangMuc, type MocCd } from '../src/server/xuong/duBao.js';
import type { SuKien } from '../src/server/xuong/types.js';

// Chạy: npm test. Dự báo nguy cơ rớt kế hoạch — server/xuong/duBao.ts

const NGAY = 86_400_000;
const NOW = Date.parse('2026-10-15T08:00:00+07:00');
let seq = 0;
const ev = (p: Partial<SuKien> & Pick<SuKien, 'loai'>, ts = NOW): SuKien => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  hex: '250301895', congDoanId: null, toId: 1, soLuong: null, congDoanDenId: null, congDoanNguonId: null,
  xuongNguon: null, soNguoi: null, duLieu: null, ts, serverTs: ts, suaCho: null, ...p,
});
const tk = (thanhPhan: Array<{ ten: string; tuyen: string[] }>) =>
  ev({ loai: 'trien_khai', soLuong: 5, duLieu: { xuong: '2A', thanhPhan: thanhPhan.map(t => ({ ...t, xuong: '2A' })) } }, NOW - 5 * NGAY);
const moc = (o: Record<string, number>, nguon: MocCd['nguon'] = 'mra') =>
  new Map(Object.entries(o).map(([k, v]) => [k, { ngay: v, n: 10, nguon }]));

describe('duBaoHangMuc', () => {
  it('cộng mốc các công đoạn chưa xong; công đoạn đang làm trừ phần đã qua', () => {
    const evts = [tk([{ ten: 'GỖ', tuyen: ['CAT', 'LAP', 'SON'] }]),
      ev({ loai: 'nhan', congDoanId: 'LAP', soLuong: 5 }, NOW - 1 * NGAY)];
    const d = duBaoHangMuc(evts, moc({ CAT: 2, LAP: 3, SON: 2 }), cd => cd === 'CAT', NOW + 10 * NGAY, NOW)!;
    assert.equal(d.canNgay, 4); // LAP còn 3 − 1 = 2, SON 2
    assert.deepEqual(d.conLai, ['LAP', 'SON']);
    assert.equal(d.muc, 'kip');
    assert.equal(d.nguonMoc, 'mra');
  });

  it('cần nhiều hơn số ngày còn => nguy cơ rớt; gần chạm (> 80%) => sát hạn', () => {
    const evts = [tk([{ ten: 'GỖ', tuyen: ['CAT', 'LAP'] }])];
    assert.equal(duBaoHangMuc(evts, moc({ CAT: 2, LAP: 3 }), () => false, NOW + 4 * NGAY, NOW)!.muc, 'rot');
    assert.equal(duBaoHangMuc(evts, moc({ CAT: 2, LAP: 3 }), () => false, NOW + 5.5 * NGAY, NOW)!.muc, 'sat');
    assert.equal(duBaoHangMuc(evts, moc({ CAT: 2, LAP: 3 }), () => false, NOW + 9 * NGAY, NOW)!.muc, 'kip');
  });

  it('thành phần song song: lấy nhánh dài nhất; công đoạn thiếu mốc ghi riêng', () => {
    const evts = [tk([{ ten: 'GỖ', tuyen: ['CAT', 'LAP'] }, { ten: 'KIM LOẠI', tuyen: ['HAN', 'LAP'] }])];
    const d = duBaoHangMuc(evts, moc({ CAT: 1, LAP: 2, HAN: 4 }), () => false, NOW + 10 * NGAY, NOW)!;
    assert.equal(d.canNgay, 6);
    assert.deepEqual(d.conLai, ['HAN', 'LAP']);
    const thieu = duBaoHangMuc(evts, moc({ CAT: 1, LAP: 2 }), () => false, NOW + 10 * NGAY, NOW)!;
    assert.deepEqual(thieu.thieuMoc, ['HAN']);
  });

  it('không có tuyến (nhận thẳng) hoặc đã xong hết => không dự báo', () => {
    assert.equal(duBaoHangMuc([ev({ loai: 'nhan', congDoanId: 'CAT', soLuong: 1 })], moc({ CAT: 1 }), () => false, NOW + NGAY, NOW), null);
    assert.equal(duBaoHangMuc([tk([{ ten: 'GỖ', tuyen: ['CAT'] }])], moc({ CAT: 1 }), () => true, NOW + NGAY, NOW), null);
  });
});
