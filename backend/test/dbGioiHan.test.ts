import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chayCoGioiHan, lenhMoGiaoDich } from '../src/db.js';

// Chạy: npm test. Không kết nối DB: dùng client giả, ghi lại thứ tự lệnh.
const clientGia = (loiO?: string) => {
  const lenh: string[] = [];
  return {
    lenh,
    query: async (text: string) => {
      lenh.push(text);
      if (loiO && text === loiO) throw new Error('hết giờ');
      return { rows: [{ text }] };
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
  it('thành công: mở, chạy, COMMIT và trả kết quả truy vấn', async () => {
    const c = clientGia();
    const r = await chayCoGioiHan(c, 'SELECT 1');
    assert.deepEqual(c.lenh, [lenhMoGiaoDich(), 'SELECT 1', 'COMMIT']);
    assert.equal(r.rows[0].text, 'SELECT 1');
  });
  it('lỗi: ROLLBACK rồi ném lại đúng lỗi', async () => {
    const c = clientGia('SELECT 1');
    await assert.rejects(chayCoGioiHan(c, 'SELECT 1'), /hết giờ/);
    assert.deepEqual(c.lenh, [lenhMoGiaoDich(), 'SELECT 1', 'ROLLBACK']);
  });
});
