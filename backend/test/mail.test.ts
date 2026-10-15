import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { noiDungOtp, coGuiMail } from '../src/server/mail.js';

// Chạy: npm test. Email mã OTP quên mật khẩu — server/mail.ts

describe('email OTP', () => {
  it('nội dung có mã, thời hạn, lời chào theo tên; HTML được thoát ký tự', () => {
    const m = noiDungOtp('348318', 5, 'Nguyễn <A>');
    assert.match(m.subject, /348318/);
    assert.match(m.text, /348318/);
    assert.match(m.text, /5 phút/);
    assert.match(m.text, /Chào Nguyễn <A>,/);
    assert.match(m.html, /Nguyễn &lt;A&gt;/);
    assert.doesNotMatch(m.html, /<A>/);
  });
  it('thiếu SMTP_HOST / USER / PASS => chưa bật gửi mail', () => {
    const cu = { ...process.env };
    delete process.env.SMTP_HOST; process.env.SMTP_USER = 'x'; process.env.SMTP_PASS = 'y';
    assert.equal(coGuiMail(), false);
    process.env.SMTP_HOST = 'smtp.vi-du.test';
    assert.equal(coGuiMail(), true);
    process.env = cu;
  });
});
