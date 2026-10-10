// Thứ Hai của tuần ISO `week` thuộc năm ISO `year` (giờ địa phương)
export const isoWeekMonday = (year: number, week: number): Date => {
    const jan4 = new Date(year, 0, 4);
    const dow = (jan4.getDay() + 6) % 7; // 0 = Thứ Hai
    return new Date(year, 0, 4 - dow + (week - 1) * 7);
};

/**
 * Khoảng ngày của tuần `week` năm `year` theo cách đánh số của bảng KHSX: tuần ISO cắt trong năm dương lịch
 * (tuần 1/2026 = 01–04/01/2026, 29–31/12/2025 thuộc tuần 53 của 2025) — cùng khoảng số liệu đang tính
 * (inPlanWeek, /api/khsx-nhapkho/summary). Trước nhãn luôn tính theo năm 2026 và không cắt năm.
 */
export const planWeekRange = (year: number, week: number) => {
    const mon = isoWeekMonday(year, week);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    const first = new Date(year, 0, 1);
    const last = new Date(year, 11, 31);
    return { start: mon < first ? first : mon, end: sun > last ? last : sun };
};
