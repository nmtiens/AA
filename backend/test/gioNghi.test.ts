import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { laGioNghiDb, khungGioNghi } from '../src/server/gioNghi.js';

// Chạy: npm test. Giờ để DB ngủ (gói miễn phí Layerbase) — server/gioNghi.ts

// Giờ VN = UTC+7: 15:00Z = 22:00 VN, 22:59Z = 05:59 VN, 23:00Z = 06:00 VN, 05:00Z = 12:00 VN
const vn = (iso: string) => new Date(iso);

describe('giờ để DB ngủ', () => {
  it('mặc định 22h–6h giờ VN (qua nửa đêm)', () => {
    assert.equal(laGioNghiDb(vn('2026-10-20T15:00:00Z')), true);
    assert.equal(laGioNghiDb(vn('2026-10-20T22:59:00Z')), true);
    assert.equal(laGioNghiDb(vn('2026-10-20T23:00:00Z')), false);
    assert.equal(laGioNghiDb(vn('2026-10-20T05:00:00Z')), false);
  });
  it('đổi khung, tắt, giá trị sai', () => {
    assert.equal(laGioNghiDb(vn('2026-10-20T05:00:00Z'), '11-14'), true);
    assert.equal(laGioNghiDb(vn('2026-10-20T15:00:00Z'), 'tat'), false);
    assert.deepEqual(khungGioNghi('lung tung'), [22, 6]);
    assert.equal(khungGioNghi('5-5'), null);
  });
});
