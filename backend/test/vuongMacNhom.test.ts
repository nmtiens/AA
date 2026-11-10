import test from 'node:test';
import assert from 'node:assert/strict';
import { gopKhac, type DongNhom } from '../src/server/vuongMacNhom.js';

const dong = (name: string, open: number): DongNhom => ({ name, open, doing: 0, waiting: 1, overdue: 0, soon: 0, created: 0, done: 0, closed: 0, avgDoneHours: 2 });

test('gopKhac: phần bị cắt cộng vào dòng Khác, tổng không đổi', () => {
  const kq = gopKhac([dong('A', 5), dong('B', 3), dong('C', 2), dong('D', 1)], 2);
  assert.deepEqual(kq.map(d => d.name), ['A', 'B', 'Khác']);
  assert.equal(kq[2].open, 3);
  assert.equal(kq[2].waiting, 2);
  assert.equal(kq[2].avgDoneHours, null);
});

test('gopKhac: đủ dòng thì giữ nguyên', () => {
  assert.equal(gopKhac([dong('A', 5)], 2).length, 1);
});
