import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KHOA_HOP_LE, dinhDang, oTuDong, fileCanXem } from '../src/server/botTongHop.js';

// Chạy: npm test. BÁO CÁO BOT — server/botTongHop.ts (phần thuần của routes/botTongHop.ts)

describe('BÁO CÁO BOT — ô theo ngày', () => {
  it('trả ngày + tháng (giữ tương thích bản giao diện cũ chỉ đọc thang)', () => {
    assert.deepEqual(oTuDong({ ten: 'A', ipo: 'x', ngay: '2026-03-05', ct: true, tt: '1.5', so: 2 }),
      { ten: 'A', ipo: 'x', ngay: '2026-03-05', thang: '2026-03', ct: true, tt: 1.5, so: 2 });
  });
  it('CHƯA BOT: ngày rỗng, tháng rỗng; TT trống giữ null', () => {
    assert.deepEqual(oTuDong({ ten: null, ipo: null, ngay: '', ct: false, tt: null, so: 1 }),
      { ten: '', ipo: '', ngay: '', thang: '', ct: false, tt: null, so: 1 });
  });
});

describe('BÁO CÁO BOT — khoá chi tiết', () => {
  it('nhận CHUA / năm / tháng / ngày, chặn chuỗi lạ', () => {
    for (const k of ['CHUA', '2026', '2026-03', '2026-03-05']) assert.ok(KHOA_HOP_LE.test(k), k);
    for (const k of ['2026-3', "2026'; --", '2026-03-05x', 'chua']) assert.ok(!KHOA_HOP_LE.test(k), k);
  });
  it('mẫu to_char theo độ dài khoá', () => {
    assert.equal(dinhDang('2026'), 'YYYY');
    assert.equal(dinhDang('2026-03'), 'YYYY-MM');
    assert.equal(dinhDang('2026-03-05'), 'YYYY-MM-DD');
  });
});

describe('BÁO CÁO BOT — file cần xem', () => {
  const f = [
    { nguon: 'B/b.xlsx', loi: 'không có sheet 02_DATA / DATA', nap_luc: '2026-11-10T03:00:00Z', mtime: '2026-11-09T01:00:00Z' },
    { nguon: 'C/c.xlsx', loi: '[Errno 13] Permission denied', nap_luc: '2026-11-10T04:00:00Z', mtime: null },
    { nguon: 'A/a.xlsx', loi: null, nap_luc: '2026-11-10T02:00:00Z', mtime: '2026-11-10T01:00:00Z' },
    { nguon: 'D/d.xlsx', loi: null, nap_luc: '2026-11-10T02:00:00Z', mtime: '2026-11-10T01:00:00Z' },
  ];
  const tk = [
    { nguon: 'B/b.xlsx', n: 5, tt: 5, ipo: 5, ten: 5, ds: ['CT B'] },
    { nguon: 'A/a.xlsx', n: 3, tt: 0, ipo: 3, ten: 3, ds: ['CT A'] },
  ];
  const kq = fileCanXem(f, tk);
  it('file đọc lỗi trước, giữ giờ lưu của bản đang hiện số; chưa từng đọc được => luuTot null', () => {
    assert.deepEqual(kq.map(x => [x.nguon, x.kieu]), [['B/b.xlsx', 'doc'], ['C/c.xlsx', 'doc'], ['A/a.xlsx', 'cot']]);
    assert.deepEqual(kq[0], { nguon: 'B/b.xlsx', kieu: 'doc', loi: 'không có sheet 02_DATA / DATA', luc: '2026-11-10T03:00:00Z',
      luuTot: '2026-11-09T01:00:00Z', soDong: 5, ten: ['CT B'] });
    assert.equal(kq[1].luuTot, null);
    assert.equal(kq[1].soDong, 0);
  });
  it('đọc được nhưng cột TT trống cả file => báo thiếu cột; file bình thường không báo', () => {
    assert.match(kq[2].loi, /TT ĐH CÒN LẠI/);
    assert.ok(!kq.some(x => x.nguon === 'D/d.xlsx'));
  });
});
