import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chayCoGioiHan, lenhMoGiaoDich } from '../src/db.js';

// Chạy: npm test. Không kết nối DB: dùng client giả, ghi lại thứ tự lệnh.
// Lệnh gộp (nhiều lệnh trong 1 chuỗi) trả MẢNG kết quả như pg thật: mỗi lệnh 1 phần tử.
const clientGia = (loiO?: string) => {
  const lenh: string[] = [];
  return {
    lenh,
    query: async (text: string | { text: string }) => {
      const t = typeof text === 'string' ? text : text.text;
      lenh.push(t);
      if (loiO && t.includes(loiO)) throw new Error('hết giờ');
      const cac = t.split(/;\s*/).map(x => x.trim()).filter(Boolean);
      return cac.length > 1 ? cac.map(x => ({ rows: [{ text: x }] })) : { rows: [{ text: t }] };
    },
  };
};

describe('giới hạn truy vấn theo giao dịch', () => {
  it('lệnh mở dùng SET LOCAL, mặc định 8 giây, không có SET phiên', () => {
    const sql = lenhMoGiaoDich();
    assert.match(sql, /^BEGIN; /);
    assert.match(sql, /SET LOCAL statement_timeout = 8000/);
    assert.match(sql, /SET LOCAL idle_in_transaction_session_timeout = 30000/);
    assert.doesNotMatch(sql.replace(/SET LOCAL/g, ''), /\bSET\b/);
    assert.doesNotMatch(sql, /work_mem/);
  });
  it('timeout và work_mem riêng', () => {
    const sql = lenhMoGiaoDich({ timeoutMs: 25000.7, workMemMb: 32 });
    assert.match(sql, /statement_timeout = 25000;/);
    assert.match(sql, /work_mem = '32MB'/);
  });
  it('có tham số: 3 lượt — mở, chạy, COMMIT và trả kết quả truy vấn', async () => {
    const c = clientGia();
    const r = await chayCoGioiHan(c, 'SELECT $1', [1]);
    assert.deepEqual(c.lenh, [lenhMoGiaoDich(), 'SELECT $1', 'COMMIT']);
    assert.equal(r.rows[0].text, 'SELECT $1');
  });
  it('có tham số, lỗi: ROLLBACK rồi ném lại đúng lỗi', async () => {
    const c = clientGia('SELECT $1');
    await assert.rejects(chayCoGioiHan(c, 'SELECT $1', [1]), /hết giờ/);
    assert.deepEqual(c.lenh, [lenhMoGiaoDich(), 'SELECT $1', 'ROLLBACK']);
  });
  it('không tham số: gộp 1 lượt (mở + câu + COMMIT) và trả đúng kết quả của câu', async () => {
    const c = clientGia();
    const r = await chayCoGioiHan(c, 'SELECT 1 ;\n');
    assert.deepEqual(c.lenh, [`${lenhMoGiaoDich()};\nSELECT 1\n; COMMIT`]);
    assert.equal(r.rows[0].text, 'SELECT 1');
    // mảng tham số rỗng cũng gộp; work_mem thêm 1 lệnh mở vẫn lấy đúng kết quả
    const c2 = clientGia();
    const r2 = await chayCoGioiHan(c2, 'SELECT 2', [], { workMemMb: 32 });
    assert.equal(c2.lenh.length, 1);
    assert.equal(r2.rows[0].text, 'SELECT 2');
  });
  it('không tham số, câu tự chứa 2 lệnh: trả mảng 2 kết quả như pg', async () => {
    const c = clientGia();
    const r = await chayCoGioiHan(c, 'SELECT 1; SELECT 2');
    assert.deepEqual(r.map((x: { rows: { text: string }[] }) => x.rows[0].text), ['SELECT 1', 'SELECT 2']);
  });
  it('không tham số, lỗi: ROLLBACK rồi ném lại đúng lỗi', async () => {
    const c = clientGia('SELECT 1');
    await assert.rejects(chayCoGioiHan(c, 'SELECT 1'), /hết giờ/);
    assert.deepEqual(c.lenh, [`${lenhMoGiaoDich()};\nSELECT 1\n; COMMIT`, 'ROLLBACK']);
  });
  it('text dạng object (rowMode…) không gộp', async () => {
    const c = clientGia();
    await chayCoGioiHan(c, { text: 'SELECT 1', rowMode: 'array' });
    assert.equal(c.lenh.length, 3);
  });
});
