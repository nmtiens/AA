import { describe, it, expect } from 'vitest';
import { tuanISO, tuanTrongThang, thuHaiCua, thuNamCua } from './dateUtils';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('tuần trong tháng', () => {
  it('mọi tháng năm 2026, 2027: các tuần phủ đủ mọi ngày, không trùng ngày', () => {
    for (const nam of [2026, 2027]) for (let t = 1; t <= 12; t++) {
      const ngay: string[] = [];
      for (const w of tuanTrongThang(nam, t)) {
        for (const d = new Date(w.tuTrong); d <= w.denTrong; d.setDate(d.getDate() + 1)) ngay.push(iso(d));
      }
      const soNgay = new Date(nam, t, 0).getDate();
      expect(ngay).toHaveLength(soNgay);
      expect(new Set(ngay).size).toBe(soNgay);
    }
  });
  it('T8/2026 gồm ngày 1, 2, 31 (trước đây rơi mất)', () => {
    const ds = tuanTrongThang(2026, 8);
    expect(iso(ds[0].tuTrong)).toBe('2026-08-01');
    expect(iso(ds[ds.length - 1].denTrong)).toBe('2026-08-31');
  });
  it('nhãn T45 (02-08/11)', () => {
    const w = tuanTrongThang(2026, 11).find(x => x.tuan === 45)!;
    expect(w.nhan).toBe('T45 (02-08/11)');
    expect(tuanTrongThang(2026, 11)[0].nhan).toBe('T44 (01-01/11)');
  });
  it('tuần ISO theo Thứ Năm', () => {
    expect(tuanISO(new Date(2026, 10, 7))).toEqual({ nam: 2026, tuan: 45 });
    expect(tuanISO(new Date(2027, 0, 1))).toEqual({ nam: 2026, tuan: 53 });
    expect(tuanISO(new Date(2026, 0, 1))).toEqual({ nam: 2026, tuan: 1 });
  });
  it('Thứ Hai, Thứ Năm của tuần', () => {
    expect(iso(thuHaiCua(new Date(2026, 10, 1)))).toBe('2026-10-26');
    expect(iso(thuNamCua(new Date(2026, 10, 1)))).toBe('2026-10-29');
  });
});
