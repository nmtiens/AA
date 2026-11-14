import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ghepDoanhSoNam, khoaChungDoanhSo } from '../src/server/doanhSoNam.js';

describe('ghepDoanhSoNam — ghép 2 câu GROUPING SETS của /api/revenue', () => {
  it('dòng tổng (la_tong = 1) cho tổng / quý, các dòng còn lại cho theo xưởng', () => {
    const kq = ghepDoanhSoNam(2026,
      [
        { la_tong: 1, name: null, plan: '300', q1: '60', q2: '150', q3: '240' },
        { la_tong: 0, name: 'X2', plan: '200', q1: '40', q2: '100', q3: '160' },
        { la_tong: 0, name: 'KHÁC', plan: '100', q1: '20', q2: '50', q3: '80' },
      ],
      [
        { la_tong: 1, name: null, actual: '150000' },
        { la_tong: 0, name: 'X1', actual: '50000' },
        { la_tong: 0, name: 'X2', actual: '100000' },
      ]);
    assert.deepEqual(kq, {
      year: 2026,
      targetRevenue2026: 300,
      quarterlyTargets: { q1: 60, q2: 150, q3: 240, q4: 300 },
      actual: { value: 150, percent: 50 }, // triệu -> tỷ
      // Xưởng chỉ có thực hiện vẫn hiện (plan 0); KHÁC luôn cuối
      byWorkshop: [
        { name: 'X1', plan: 0, actual: 50 },
        { name: 'X2', plan: 200, actual: 100 },
        { name: 'KHÁC', plan: 100, actual: 0 },
      ],
    });
  });

  it('năm chưa có dữ liệu: chỉ có dòng tổng bằng 0 => không chia cho 0, không có xưởng', () => {
    const kq = ghepDoanhSoNam(2031,
      [{ la_tong: 1, name: null, plan: '0', q1: '0', q2: '0', q3: '0' }],
      [{ la_tong: 1, name: null, actual: '0' }]);
    assert.equal(kq.targetRevenue2026, 0);
    assert.deepEqual(kq.actual, { value: 0, percent: 0 });
    assert.deepEqual(kq.byWorkshop, []);
  });

  it('thiếu hẳn dòng tổng vẫn ra 0 thay vì NaN', () => {
    const kq = ghepDoanhSoNam(2026, [], []);
    assert.deepEqual(kq.quarterlyTargets, { q1: 0, q2: 0, q3: 0, q4: 0 });
    assert.equal(kq.actual.value, 0);
  });
});

describe('khoaChungDoanhSo', () => {
  it('chỉ năm hiện tại mới dùng bản chung (1 dòng cố định)', () => {
    assert.equal(khoaChungDoanhSo(2026, 2026), 'revenue-nam-nay');
    assert.equal(khoaChungDoanhSo(2025, 2026), '');
  });
});
