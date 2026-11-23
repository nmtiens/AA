import { describe, expect, it } from 'vitest';
import { laMayTinhBang } from './mayTinhBang';

const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140';
const goc = { duongDan: '/', rong: 820, manNgan: 820, cham: 5, chiCham: true, ua: IPAD };

describe('laMayTinhBang', () => {
  it('iPad dọc / ngang / gắn bàn phím chuột', () => {
    expect(laMayTinhBang(goc)).toBe(true);
    expect(laMayTinhBang({ ...goc, rong: 1180 })).toBe(true);
    expect(laMayTinhBang({ ...goc, chiCham: false })).toBe(true);
  });
  it('Android tablet', () => expect(laMayTinhBang({ ...goc, ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/140' })).toBe(true));
  it('máy Mac, PC, laptop cảm ứng có chuột: không', () => {
    expect(laMayTinhBang({ ...goc, cham: 0, chiCham: false, rong: 1440, manNgan: 900 })).toBe(false);
    expect(laMayTinhBang({ ...goc, ua: WIN, cham: 0, chiCham: false })).toBe(false);
    expect(laMayTinhBang({ ...goc, ua: WIN, cham: 10, chiCham: false })).toBe(false);
  });
  it('điện thoại, chia đôi màn, app /m và /xuong: không', () => {
    expect(laMayTinhBang({ ...goc, rong: 980, manNgan: 390, ua: 'Android' })).toBe(false);
    expect(laMayTinhBang({ ...goc, rong: 507 })).toBe(false);
    expect(laMayTinhBang({ ...goc, duongDan: '/m/' })).toBe(false);
    expect(laMayTinhBang({ ...goc, duongDan: '/xuong' })).toBe(false);
  });
});
