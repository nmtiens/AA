import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CO_CHI_DE_BIET, canXuLy, sqlCanXuLy, sqlThaoTacCanXuLy } from '../src/server/xuong/canXem.js';

// Một định nghĩa "thao tác cần xử lý" cho số Cần xem ở Tổng quan, danh sách Cần xem và thông báo 8h

describe('canXuLy', () => {
  it('có ít nhất một cờ ngoài nhóm chỉ để biết', () => {
    assert.equal(canXuLy(['gio_may_lech']), true);
    assert.equal(canXuLy(['quan_ly_ghi_ho', 'giao_vuot']), true);
  });
  it('chỉ cờ để biết / không cờ / dữ liệu lạ: không', () => {
    assert.equal(canXuLy(['quan_ly_ghi_ho']), false);
    assert.equal(canXuLy([...CO_CHI_DE_BIET]), false);
    assert.equal(canXuLy([]), false);
    assert.equal(canXuLy(null), false);
  });
});

describe('sqlCanXuLy — cùng điều kiện viết bằng SQL', () => {
  it('loại đúng các cờ chỉ để biết, theo bí danh', () => {
    const s = sqlCanXuLy('x');
    assert.match(s, /^\(x\.co <> '\{\}' AND NOT \(x\.co <@ ARRAY\[.*\]::text\[\]\)\)$/);
    for (const c of CO_CHI_DE_BIET) assert.ok(s.includes(`'${c}'`), c);
    assert.equal((s.match(/'[a-z_]+'/g) ?? []).length, CO_CHI_DE_BIET.length);
  });
  it('thao tác cần xử lý: mặc định 30 ngày, bỏ thao tác đã huỷ', () => {
    const s = sqlThaoTacCanXuLy('e');
    assert.ok(s.includes(`interval '720 hours'`));
    assert.ok(s.includes(`h.sua_cho = e.id`));
    assert.ok(sqlThaoTacCanXuLy('e', 24).includes(`interval '24 hours'`));
  });
});
