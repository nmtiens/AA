import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daNhapDu, hexDuSoLuong } from '../src/server/xuong/nhapDu.js';

test('đã nhập đủ: đủ tiền hoặc đủ số lượng, 99% tiền chưa đủ SL thì chưa đủ', () => {
  assert.equal(daNhapDu(100, 100), true);
  assert.equal(daNhapDu(100, 99), false);
  assert.equal(daNhapDu(100, 60, true), true);
  assert.equal(daNhapDu(0, 0), false);
});

test('hexDuSoLuong: không có hex thì không gọi DB', async () => {
  const pool = { query: async () => { throw new Error('không được gọi'); } };
  assert.equal((await hexDuSoLuong(pool as never, [])).size, 0);
});
