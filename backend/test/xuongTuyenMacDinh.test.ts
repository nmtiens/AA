import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chonGoiY, loiThanhPhan } from '../src/server/xuong/tuyenMacDinh.js';

const cd = new Map([['A1', '2A'], ['A2', '2A'], ['C1', '8C']]);
const go = { ten: 'GỖ', xuong: '2A', tuyen: ['A1', 'A2'] };
const kimLoai = { ten: 'KIM LOẠI', xuong: '8C', tuyen: [] };

test('thành phần hợp lệ: xưởng phụ được để trống tuyến', () => {
  assert.equal(loiThanhPhan([go, kimLoai], '2A', cd), null);
});

test('thành phần sai: rỗng, trùng, xưởng chính thiếu tuyến, công đoạn tắt, đầu tuyến sai xưởng', () => {
  assert.ok(loiThanhPhan([], '2A', cd));
  assert.ok(loiThanhPhan([go, go], '2A', cd));
  assert.ok(loiThanhPhan([{ ...go, tuyen: [] }], '2A', cd));
  assert.ok(loiThanhPhan([{ ...go, tuyen: ['KHONG_CO'] }], '2A', cd));
  assert.ok(loiThanhPhan([{ ...go, tuyen: ['C1', 'A1'] }], '2A', cd));
});

test('gợi ý: mặc định trước, lần trước sau', () => {
  const truoc = [{ ...go, tuyen: ['A2'] }];
  assert.deepEqual(chonGoiY([go], truoc, '2A', cd), { thanhPhan: [go], nguon: 'mac_dinh' });
  assert.deepEqual(chonGoiY(undefined, truoc, '2A', cd), { thanhPhan: truoc, nguon: 'lan_truoc' });
  assert.deepEqual(chonGoiY(undefined, undefined, '2A', cd), { thanhPhan: null, nguon: null });
});

test('gợi ý: mặc định có công đoạn đã tắt thì về lần trước', () => {
  const truoc = [{ ...go, tuyen: ['A2'] }];
  assert.deepEqual(chonGoiY([{ ...go, tuyen: ['DA_TAT'] }], truoc, '2A', cd), { thanhPhan: truoc, nguon: 'lan_truoc' });
});
