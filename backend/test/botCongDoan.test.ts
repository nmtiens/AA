import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { docSetup, congDoanDuocNhap, xuongDuocNhap, lyDoCam, docNgay, CONG_DOAN, nguoiTuQuyen, khoaNhoHex } from '../src/server/botCongDoan.js';

// Chạy: npm test. BOT theo công đoạn — server/botCongDoan.ts (quyền nhập theo bộ phận / xưởng)

const setup = docSetup({
  congDoan: { P001: ['pm'], P002: [' PC '], P014: ['XƯỞNG 5 SOFA & GHẾ', 'XƯỞNG 3 HÀNG HÀNG LOẠT'], XYZ: ['PC'] },
  xuongCua: { 'xưởng 5 sofa & ghế': ['5a'] },
});

describe('BOT công đoạn — setup', () => {
  it('chuẩn hoá tên bộ phận / xưởng, bỏ công đoạn lạ', () => {
    assert.deepEqual(setup.congDoan.P001, ['PM']);
    assert.deepEqual(setup.congDoan.P002, ['PC']);
    assert.equal((setup.congDoan as Record<string, unknown>).XYZ, undefined);
    assert.deepEqual(setup.xuongCua['XƯỞNG 5 SOFA & GHẾ'], ['5A']);
  });
  it('setup hỏng => rỗng', () => {
    assert.deepEqual(docSetup(null), { congDoan: {}, xuongCua: {} });
  });
});

describe('BOT công đoạn — quyền', () => {
  const admin = { admin: true, boPhan: null };
  const pc = { admin: false, boPhan: 'pc' };
  const x5 = { admin: false, boPhan: 'XƯỞNG 5 SOFA & GHẾ' };
  const x3 = { admin: false, boPhan: 'XƯỞNG 3 HÀNG HÀNG LOẠT' };
  const khong = { admin: false, boPhan: null };
  it('ADMIN nhập mọi công đoạn, mọi xưởng', () => {
    assert.deepEqual(congDoanDuocNhap(admin, setup), [...CONG_DOAN]);
    assert.equal(xuongDuocNhap(admin, setup), null);
    assert.equal(lyDoCam(admin, setup, 'P022', '4A'), null);
  });
  it('bộ phận chỉ nhập công đoạn được gán', () => {
    assert.deepEqual(congDoanDuocNhap(pc, setup), ['P002']);
    assert.equal(lyDoCam(pc, setup, 'P002', '4A'), null);
    assert.match(lyDoCam(pc, setup, 'P014', '4A')!, /không được nhập P014/);
  });
  it('bộ phận có gán xưởng chỉ nhập HEX thuộc xưởng đó; không gán xưởng = mọi xưởng', () => {
    assert.equal(lyDoCam(x5, setup, 'P014', '5A'), null);
    assert.match(lyDoCam(x5, setup, 'P014', '4A')!, /chỉ nhập xưởng 5A/);
    assert.equal(lyDoCam(x3, setup, 'P014', '4A'), null);
  });
  it('chưa có bộ phận / công đoạn lạ => không được', () => {
    assert.deepEqual(congDoanDuocNhap(khong, setup), []);
    assert.match(lyDoCam(khong, setup, 'P001', null)!, /chưa có bộ phận/);
    assert.match(lyDoCam(admin, setup, 'P099', null)!, /không có cột BOT/);
  });
});

describe('BOT công đoạn — ngày', () => {
  it('nhận YYYY-MM-DD có thật; rỗng / null = xoá; sai => undefined', () => {
    assert.equal(docNgay('2026-11-30'), '2026-11-30');
    assert.equal(docNgay(''), null);
    assert.equal(docNgay(null), null);
    assert.equal(docNgay('2026-02-30'), undefined);
    assert.equal(docNgay('30/11/2026'), undefined);
    assert.equal(docNgay('1999-01-01'), undefined);
  });
});

describe('BOT công đoạn — đường đọc dùng quyền đã nạp / khoá nhớ HEX', () => {
  it('người nhập từ quyền đã nạp: admin theo role, bộ phận giữ nguyên; tài khoản khoá không còn quyền', () => {
    assert.deepEqual(nguoiTuQuyen({ active: true, role: 'ADMIN', department: null }), { admin: true, boPhan: null, active: true });
    assert.deepEqual(nguoiTuQuyen({ active: true, role: 'USER', department: ' PC ' }), { admin: false, boPhan: ' PC ', active: true });
    const khoa = nguoiTuQuyen({ active: false, role: 'ADMIN', department: 'PC' });
    assert.equal(khoa.admin, false);
    assert.equal(khoa.active, false);
    assert.deepEqual(congDoanDuocNhap(nguoiTuQuyen({ active: true, role: 'USER', department: 'pc' }), setup), ['P002']);
  });
  it('khoá nhớ HEX gồm mốc file + phiên bản sản xuất; thiếu một trong hai => không nhớ', () => {
    assert.equal(khoaNhoHex({ coBang: true, khoa: '2026-11-13 08:00/40' }, 'v1'), '2026-11-13 08:00/40|v1');
    assert.notEqual(khoaNhoHex({ coBang: true, khoa: 'a/1' }, 'v1'), khoaNhoHex({ coBang: true, khoa: 'a/1' }, 'v2'));
    assert.notEqual(khoaNhoHex({ coBang: true, khoa: 'a/1' }, 'v1'), khoaNhoHex({ coBang: true, khoa: 'b/1' }, 'v1'));
    assert.equal(khoaNhoHex({ coBang: false, khoa: 'khong-bang' }, 'v1'), null);
    assert.equal(khoaNhoHex({ coBang: true, khoa: 'a/1' }, undefined), null);
    assert.equal(khoaNhoHex({ coBang: true, khoa: 'a/1' }, ''), null);
  });
});
