import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { truSoCapKhiHuy, khoaCanLay, khoaCap, type SoCap } from '../src/routes/xuong.js';

// POST /api/xuong/events: huỷ rồi làm lại trong cùng lô (mất sóng) và khoá theo cặp khi ghi

const HEX = '250301895';
const K = `${HEX}|CD1`;
const sk = (loai: string, so_luong: number) => ({ loai, hex: HEX, cong_doan_id: 'CD1', so_luong });

/** Cộng dồn số theo thứ tự trong lô như route: nhận ≤ mốc triển khai, xong ≤ đã nhận; huỷ trả số của đích */
function chayLo(dau: SoCap, moc: number, lo: Array<{ loai: string; sl?: number; dich?: number; huyDaLuu?: boolean }>) {
  const soCap = new Map<string, SoCap>([[K, { ...dau }]]);
  const nhan: boolean[] = [];
  lo.forEach((e, i) => {
    const c = soCap.get(K)!;
    if (e.loai === 'huy') {
      const d = lo[e.dich!];
      const ok = nhan[e.dich!];
      if (ok) truSoCapKhiHuy(soCap, sk(d.loai, d.sl!), { cungLo: true, dichDaHuy: false, huyDaLuu: !!e.huyDaLuu });
      nhan[i] = ok; return;
    }
    if (e.loai === 'nhan' && c.nhan + e.sl! > moc) { nhan[i] = false; return; }
    if (e.loai === 'hoan_thanh' && c.ht + e.sl! > c.nhan) { nhan[i] = false; return; }
    if (e.loai === 'nhan') c.nhan += e.sl!; else c.ht += e.sl!;
    nhan[i] = true;
  });
  return { nhan, so: soCap.get(K)! };
}

describe('truSoCapKhiHuy — huỷ rồi làm lại trong cùng lô', () => {
  it('[nhận 10, huỷ, nhận 8] với triển khai 10: nhận 8 được chấp nhận', () => {
    const r = chayLo({ nhan: 0, ht: 0, giao: 0 }, 10, [{ loai: 'nhan', sl: 10 }, { loai: 'huy', dich: 0 }, { loai: 'nhan', sl: 8 }]);
    assert.deepEqual(r.nhan, [true, true, true]);
    assert.equal(r.so.nhan, 8);
  });
  it('[xong nhầm, huỷ, xong đúng]: xong đúng được chấp nhận', () => {
    const r = chayLo({ nhan: 10, ht: 0, giao: 0 }, 10, [{ loai: 'hoan_thanh', sl: 10 }, { loai: 'huy', dich: 0 }, { loai: 'hoan_thanh', sl: 6 }]);
    assert.deepEqual(r.nhan, [true, true, true]);
    assert.equal(r.so.ht, 6);
  });
  it('không trừ: lệnh huỷ đã lưu (gửi lại lô), đích từ DB đã bị huỷ, đích là lệnh huỷ / không có số', () => {
    const tao = () => new Map<string, SoCap>([[K, { nhan: 10, ht: 4, giao: 2 }]]);
    let m = tao();
    assert.equal(truSoCapKhiHuy(m, sk('nhan', 10), { cungLo: false, dichDaHuy: false, huyDaLuu: true }), false);
    assert.equal(m.get(K)!.nhan, 10);
    m = tao();
    assert.equal(truSoCapKhiHuy(m, sk('nhan', 10), { cungLo: false, dichDaHuy: true, huyDaLuu: false }), false);
    assert.equal(truSoCapKhiHuy(m, sk('huy', 10), { cungLo: true, dichDaHuy: false, huyDaLuu: false }), false);
    assert.equal(truSoCapKhiHuy(m, { loai: 'nhan', hex: HEX, cong_doan_id: 'CD1', so_luong: null }, { cungLo: true, dichDaHuy: false, huyDaLuu: false }), false);
    assert.deepEqual(m.get(K), { nhan: 10, ht: 4, giao: 2 });
  });
  it('đích từ DB chưa huỷ: trừ đúng trường; cặp không có trong lô thì bỏ qua; không âm', () => {
    const m = new Map<string, SoCap>([[K, { nhan: 10, ht: 4, giao: 2 }]]);
    assert.equal(truSoCapKhiHuy(m, sk('giao', 2), { cungLo: false, dichDaHuy: false, huyDaLuu: false }), true);
    assert.equal(truSoCapKhiHuy(m, sk('hoan_thanh', 9), { cungLo: false, dichDaHuy: false, huyDaLuu: false }), true);
    assert.deepEqual(m.get(K), { nhan: 10, ht: 0, giao: 0 });
    assert.equal(truSoCapKhiHuy(m, { ...sk('nhan', 1), cong_doan_id: 'CD9' }, { cungLo: false, dichDaHuy: false, huyDaLuu: false }), false);
  });
});

describe('khoaCap — khoá theo cặp hạng mục|công đoạn', () => {
  it('bỏ trùng, sắp theo chuỗi để mọi lô lấy khoá cùng thứ tự', () => {
    assert.deepEqual(khoaCanLay([[HEX, 'CD2'], [HEX, 'CD1'], [HEX, 'CD2'], ['250301890', 'CD9']]),
      ['250301890|CD9', `${HEX}|CD1`, `${HEX}|CD2`]);
  });
  it('mỗi cặp một lệnh pg_advisory_xact_lock; không có cặp thì không gọi', async () => {
    const goi: unknown[][] = [];
    const client = { query: async (sql: string, p: unknown[]) => { goi.push([sql, ...p]); return { rows: [] }; } };
    await khoaCap(client as never, [[HEX, 'CD2'], [HEX, 'CD1'], [HEX, 'CD1']]);
    assert.deepEqual(goi.map(g => g[1]), [`${HEX}|CD1`, `${HEX}|CD2`]);
    assert.ok(goi.every(g => String(g[0]).includes('pg_advisory_xact_lock')));
    goi.length = 0;
    await khoaCap(client as never, []);
    assert.equal(goi.length, 0);
  });
});
