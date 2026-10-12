import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { khoaAnhHopLe, kieuAnh } from '../src/server/xuong/anh.js';

// Ảnh tiến độ mục Xưởng lưu trong Postgres (quyết định D24): khoá ảnh = uuid máy sinh; kiểu ảnh theo byte đầu.

describe('ảnh tiến độ (Postgres)', () => {
  it('khoá ảnh: chỉ nhận uuid', () => {
    assert.equal(khoaAnhHopLe('0f8fad5b-d9cb-469f-a165-70867728950e'), true);
    assert.equal(khoaAnhHopLe('../bi-mat'), false);
    assert.equal(khoaAnhHopLe('xuong/2026/10/250301895/a.webp'), false);
    assert.equal(khoaAnhHopLe(123), false);
  });

  it('kiểu ảnh theo byte đầu: WebP, JPEG; còn lại (PNG, HTML giả ảnh) bị từ chối', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
    assert.equal(kieuAnh(webp), 'image/webp');
    assert.equal(kieuAnh(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), 'image/jpeg');
    assert.equal(kieuAnh(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), null);
    assert.equal(kieuAnh(Buffer.from('<html><script>alert(1)</script></html>')), null);
  });
});
