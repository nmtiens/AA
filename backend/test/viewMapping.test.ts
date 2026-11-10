import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  viewMappingSchema, thuTuCongTrinhSchema, luuViewMapping, docViewMapping, khoaThuTu, laKhoaThuTu,
} from '../src/server/viewMapping.js';

describe('viewMappingSchema', () => {
  it('nhận bản cũ chỉ có projects (string[])', () => {
    const r = viewMappingSchema.safeParse({ projects: ['A', 'B'] });
    assert.ok(r.success);
    assert.equal(r.data.thuTu, undefined);
  });
  it('nhận thuTu: trùng STT, bỏ số, luồng đỏ/vàng', () => {
    const r = viewMappingSchema.safeParse({
      projects: ['A', 'B', 'C'],
      thuTu: [{ ten: 'A', stt: 1, luong: 'do' }, { ten: 'B', stt: 1, luong: 'do' }, { ten: 'C', stt: 6, luong: 'vang' }],
    });
    assert.ok(r.success);
  });
  it('từ chối STT không phải số nguyên dương, luồng lạ, tên rỗng', () => {
    assert.equal(thuTuCongTrinhSchema.safeParse({ ten: 'A', stt: 0, luong: 'do' }).success, false);
    assert.equal(thuTuCongTrinhSchema.safeParse({ ten: 'A', stt: 1.5, luong: 'do' }).success, false);
    assert.equal(thuTuCongTrinhSchema.safeParse({ ten: 'A', stt: '1', luong: 'do' }).success, false);
    assert.equal(thuTuCongTrinhSchema.safeParse({ ten: 'A', stt: 1, luong: 'xanh' }).success, false);
    assert.equal(thuTuCongTrinhSchema.safeParse({ ten: ' ', stt: 1, luong: 'do' }).success, false);
    assert.equal(viewMappingSchema.safeParse({ projects: [{ ten: 'A' }] }).success, false);
  });
});

describe('luuViewMapping (POST)', () => {
  const ghi = () => {
    const calls: unknown[][] = [];
    return { calls, q: async (_sql: string, params: unknown[]) => { calls.push(params); } };
  };
  it('chỉ projects: ghi 1 dòng, không đụng dòng thứ tự', async () => {
    const { calls, q } = ghi();
    assert.equal(await luuViewMapping(q, 'luong-do', { projects: ['A'] }), null);
    assert.deepEqual(calls, [['luong-do', '["A"]']]);
  });
  it('kèm thuTu: ghi thêm dòng <viewId>:thu-tu dạng object', async () => {
    const { calls, q } = ghi();
    const thuTu = [{ ten: 'A', stt: 1, luong: 'vang' as const }];
    assert.equal(await luuViewMapping(q, 'luong-do', { projects: ['A'], thuTu }), null);
    assert.equal(calls.length, 2);
    assert.equal(calls[1][0], 'luong-do:thu-tu');
    assert.deepEqual(JSON.parse(String(calls[1][1])), thuTu);
  });
  it('không cho ghi thẳng vào khoá thứ tự', async () => {
    const { calls, q } = ghi();
    assert.ok(await luuViewMapping(q, 'luong-do:thu-tu', { projects: ['A'] }));
    assert.equal(calls.length, 0);
  });
});

describe('docViewMapping (GET)', () => {
  it('dòng thường luôn string[]; dòng thứ tự giữ object hợp lệ', () => {
    const out = docViewMapping([
      { view_id: 'luong-do', projects: ['A', 3, { ten: 'x' }] },
      { view_id: khoaThuTu('luong-do'), projects: [{ ten: 'A', stt: 2, luong: 'do' }, 'rác', { ten: 'B', stt: -1, luong: 'do' }] },
      { view_id: 'can-mau', projects: null },
    ]);
    assert.deepEqual(out['luong-do'], ['A']);
    assert.deepEqual(out['luong-do:thu-tu'], [{ ten: 'A', stt: 2, luong: 'do' }]);
    assert.deepEqual(out['can-mau'], []);
    assert.ok(laKhoaThuTu('can-mau:thu-tu'));
  });
});
