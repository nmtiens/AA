import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nhomLanTruoc } from '../src/server/xuong/tram.js';

test('nhóm lần trước: đoạn đóng muộn nhất + đoạn chồng thời gian của cùng hàng', () => {
  const d = (mnv: string, key: string, start: number, end: number | null) => ({ mnv, key, start, end });
  const doan = [
    d('A', 'h1|c', 0, 10), d('B', 'h1|c', 2, 10), // lượt đầu
    d('C', 'h1|c', 20, 40), d('D', 'h1|c', 25, 38), d('A', 'h1|c', 30, 41), // lượt gần nhất
    d('E', 'h2|c', 30, 50), // hàng khác
    d('F', 'h1|c', 45, null), // đang ở hàng (chưa rời) không tính
  ];
  assert.deepEqual(nhomLanTruoc(doan, 'h1|c').sort(), ['A', 'C', 'D']);
  assert.deepEqual(nhomLanTruoc(doan, 'h9|c'), []);
});
