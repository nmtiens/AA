import test from 'node:test';
import assert from 'node:assert/strict';
import { manhThieu, sangCot, tuCot, verBang } from '../src/server/goiBang.js';

test('manhThieu: chỉ lấy mảnh chưa có đúng phiên bản, bỏ khoá trùng', () => {
  const daCo = new Map([['bangc:order|1', 'v1'], ['bangc:khsx|1', 'cu']]);
  const can = [
    { khoa: 'bangc:order|1', ver: 'v1' },   // đã có đúng ver
    { khoa: 'bangc:khsx|1', ver: 'moi' },   // có nhưng sai ver
    { khoa: 'bangc:stock|1', ver: 'v3' },   // chưa có
    { khoa: 'bangc:stock|1', ver: 'v3' },   // trùng
  ];
  assert.deepEqual(manhThieu(can, k => daCo.get(k)), [
    { khoa: 'bangc:khsx|1', ver: 'moi' },
    { khoa: 'bangc:stock|1', ver: 'v3' },
  ]);
  assert.deepEqual(manhThieu([], k => daCo.get(k)), []);
});

test('verBang / sangCot / tuCot giữ nguyên dữ liệu', () => {
  assert.equal(verBang(new Date('2026-11-13T01:02:03.004Z')), '2026-11-13T01:02:03.004Z');
  assert.equal(verBang(undefined), '');
  const rows = [{ a: 1, b: 'x' }, { a: 2, c: null }];
  const cot = sangCot(rows);
  assert.deepEqual(cot.c, ['a', 'b', 'c']);
  assert.deepEqual(tuCot(cot), [{ a: 1, b: 'x', c: null }, { a: 2, b: null, c: null }]);
});
