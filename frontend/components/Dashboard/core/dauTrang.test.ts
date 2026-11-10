import { describe, expect, it } from 'vitest';
import { khThTheoLoc, macDinhCuaSo, mauTyLe, mocQuy, mucTyLe, trangThaiSo } from './dauTrang';

const d = (s: string) => new Date(`${s}T00:00:00`);

describe('mucTyLe', () => {
  it('chia 4 mức theo 100 / 80 / 50', () => {
    expect([100, 99.9, 80, 79.9, 50, 49.9, 0].map(mucTyLe)).toEqual(['dat', 'gan', 'gan', 'vua', 'vua', 'thap', 'thap']);
    expect(mauTyLe(0).chu).toBe('text-red-600');
  });
});

describe('trangThaiSo', () => {
  it('cả kỳ sau ngày nguồn: chưa có số', () => {
    expect(trangThaiSo(d('2026-11-06'), d('2026-11-06'), '2026-11-05')).toEqual({ chuaCo: true, thieu: true, toi: '05/11' });
  });
  it('kỳ dở: có số nhưng thiếu', () => {
    expect(trangThaiSo(d('2026-10-31'), d('2026-11-06'), '2026-11-05')).toEqual({ chuaCo: false, thieu: true, toi: '05/11' });
  });
  it('đúng ngày nguồn: đủ số', () => {
    expect(trangThaiSo(d('2026-11-05'), d('2026-11-05'), '2026-11-05')).toEqual({ chuaCo: false, thieu: false, toi: '05/11' });
  });
  it('máy chủ chưa trả ngày: coi như đủ', () => {
    expect(trangThaiSo(d('2026-11-06'), d('2026-11-06'), undefined).thieu).toBe(false);
    expect(trangThaiSo(null, null, '2026-11-05').chuaCo).toBe(false);
  });
});

describe('khThTheoLoc, mocQuy', () => {
  const data = {
    plan: [{ thang: 1, xuong: '4A', value: 10 }, { thang: 4, xuong: '4B', value: 20 }, { thang: 11, xuong: '4A', value: 30 }],
    actual: [{ thang: 11, xuong: '4A', value: 5 }, { thang: 11, xuong: '4B', value: 7 }],
  };
  it('không lọc xưởng = toàn bộ; lọc xưởng và tháng', () => {
    expect(khThTheoLoc(data, [])).toEqual({ kh: 60, th: 12 });
    expect(khThTheoLoc(data, ['4A'])).toEqual({ kh: 40, th: 5 });
    expect(khThTheoLoc(data, ['4A', '4B'], 11)).toEqual({ kh: 30, th: 12 });
    expect(khThTheoLoc(null, [])).toEqual({ kh: 0, th: 0 });
  });
  it('mốc quý cộng dồn', () => {
    expect(mocQuy(data, [])).toEqual({ q1: 10, q2: 30, q3: 30, q4: 60 });
    expect(mocQuy(data, ['4B'])).toEqual({ q1: 0, q2: 20, q3: 20, q4: 20 });
  });
});

describe('macDinhCuaSo', () => {
  it('nhiều lựa chọn để trống, không lấy phần tử đầu', () => {
    expect(macDinhCuaSo([])).toBe('');
    expect(macDinhCuaSo(['A'])).toBe('A');
    expect(macDinhCuaSo(['A', 'B'])).toBe('');
  });
});
