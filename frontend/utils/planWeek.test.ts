import { describe, it, expect } from 'vitest';
import { planWeekOf, inPlanWeek } from '../components/Dashboard/hooks/useUnifiedTimeFilters';

// Tuần mặc định của bộ lọc thời gian phải cùng cách đánh số với inPlanWeek / bảng KHSX
// (tuần ISO cắt trong năm dương lịch), không phải tuần ISO thuần.
describe('planWeekOf — tuần mặc định theo cách đánh số KHSX', () => {
  it('ngày thường trùng tuần ISO', () => {
    expect(planWeekOf(new Date(2026, 9, 10))).toBe(41); // 10/10/2026
    expect(planWeekOf(new Date(2026, 0, 5))).toBe(2); // thứ Hai 05/01/2026
  });

  it('01–04/01/2026 là tuần 1 của 2026', () => {
    for (let day = 1; day <= 4; day++) expect(planWeekOf(new Date(2026, 0, day))).toBe(1);
  });

  it('29–31/12/2025 là tuần 53 của 2025 (ISO thuần ra tuần 1)', () => {
    for (let day = 29; day <= 31; day++) {
      const d = new Date(2025, 11, day);
      expect(planWeekOf(d)).toBe(53);
      expect(inPlanWeek(d, 2025, 53)).toBe(true);
    }
  });

  it('01–03/01/2027 không ra tuần 53 của 2027 mà chặn về tuần 1', () => {
    for (let day = 1; day <= 3; day++) expect(planWeekOf(new Date(2027, 0, day))).toBe(1);
    expect(planWeekOf(new Date(2027, 0, 4))).toBe(1);
    expect(planWeekOf(new Date(2027, 0, 11))).toBe(2);
  });

  it('mọi ngày từ tuần 1 trở đi đều thuộc đúng tuần planWeekOf trả về', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      for (let d = new Date(year, 0, 4); d.getFullYear() === year; d = new Date(year, d.getMonth(), d.getDate() + 1)) {
        expect(inPlanWeek(d, year, planWeekOf(d))).toBe(true);
      }
    }
  });
});
