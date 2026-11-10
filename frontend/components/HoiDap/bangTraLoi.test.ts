import { describe, expect, it } from 'vitest';
import { oBang } from './bangTraLoi';

describe('oBang', () => {
  it('cột số: 0 trống, số giữ dạng 1,234.56', () => {
    expect(oBang('0', true).chu).toBe('');
    expect(oBang('0.00', true).chu).toBe('');
    expect(oBang(0, true).chu).toBe('');
    expect(oBang(1234.5, true).chu).toBe('1,234.5');
    expect(oBang('1,942.89', true).chu).toBe('1,942.89');
    expect(oBang('—', true).chu).toBe('—');
  });

  it('tỷ lệ 0% đỏ, tỷ lệ khác không đỏ', () => {
    expect(oBang('0%', true)).toEqual({ chu: '0%', do: true });
    expect(oBang('12.5%', true)).toEqual({ chu: '12.5%', do: false });
  });

  it('cột chữ giữ nguyên', () => {
    expect(oBang('0', false)).toEqual({ chu: '0', do: false });
  });
});
