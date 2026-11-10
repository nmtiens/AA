import test from 'node:test';
import assert from 'node:assert/strict';
import { gomChoNhan, quanSoThucTe } from '../src/server/xuong/chiSoHienTai.js';

test('quanSoThucTe: có điểm danh thì đếm người có mặt, bỏ số chốt', () => {
  assert.deepEqual(quanSoThucTe({ chinh: 9 }, { chinh: [{ mnv: 'A' }, { mnv: 'B' }, { mnv: 'A' }] }), { chinh: 2 });
});

test('quanSoThucTe: không điểm danh giữ số chốt, tổ 5 ngày chỉ có vào ca vẫn có quân số', () => {
  assert.deepEqual(quanSoThucTe({ chinh: 9, ca1: 3 }, {}), { chinh: 9, ca1: 3 });
  assert.deepEqual(quanSoThucTe({}, { chinh: [{ mnv: 'A' }] }), { chinh: 1 });
});

test('quanSoThucTe: ca Chủ nhật là ca chính', () => {
  assert.deepEqual(quanSoThucTe({ chu_nhat: 4 }, {}), { chinh: 4 });
  assert.deepEqual(quanSoThucTe({}, { chu_nhat: [{ mnv: 'A' }] }), { chinh: 1 });
});

test('gomChoNhan: bỏ dòng đủ mốc, tổng xưởng đếm cặp khác nhau', () => {
  const cap = [
    { to_id: 1, hex: 'H1', cong_doan_id: 'C1' },
    { to_id: 2, hex: 'H1', cong_doan_id: 'C1' },
    { to_id: 1, hex: 'H2', cong_doan_id: 'C1' },
    { to_id: 1, hex: 'H3', cong_doan_id: 'C1' },
  ];
  const gh = new Map([['H2|C1', { moc: 5, daNhan: 5 }], ['H3|C1', { moc: null, daNhan: 5 }]]);
  const kq = gomChoNhan(cap, gh);
  assert.equal(kq.theoTo.get(1), 2);
  assert.equal(kq.theoTo.get(2), 1);
  assert.equal(kq.tong, 2);
});
