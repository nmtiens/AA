import { describe, it, expect } from 'vitest';
import { fmtInt, fmtPt, fmtSoTy, fmtThang, fmtTy } from './format';
import { formatTrieuAsTy } from './money';

describe('định dạng chung', () => {
  it('số nguyên kiểu 1,234', () => expect(fmtInt(1234.4)).toBe('1,234'));
  it('tỷ 2 số lẻ, dưới 0.01 ghi <0.01, đúng 0 giữ 0.00', () => {
    expect(fmtTy(1942890)).toBe('1,942.89');
    expect(fmtTy(9.9)).toBe('<0.01');
    expect(fmtTy(10)).toBe('0.01');
    expect(fmtTy(0)).toBe('0.00');
    expect(fmtTy(-3)).toBe('<0.01');
    expect(fmtTy(NaN)).toBe('0.00');
    expect(fmtSoTy(0.004)).toBe('<0.01');
    expect(formatTrieuAsTy(3)).toBe('<0.01');
  });
  it('% 1 số lẻ, 0 ghi 0%', () => {
    expect(fmtPt(12.34)).toBe('12.3%');
    expect(fmtPt(1234.5)).toBe('1,234.5%');
    expect(fmtPt(0)).toBe('0%');
    expect(fmtPt(null)).toBe('—');
  });
  it('tháng T11/2026', () => {
    expect(fmtThang('2026-11')).toBe('T11/2026');
    expect(fmtThang('2026-03-15')).toBe('T3/2026');
    expect(fmtThang(new Date(2026, 10, 7))).toBe('T11/2026');
    expect(fmtThang('')).toBe('—');
  });
});
