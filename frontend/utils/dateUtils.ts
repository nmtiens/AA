export const getWeekRange2026 = (week: number) => {
    const week1Start = new Date(2025, 11, 29); // Dec 29, 2025 (Monday)
    const start = new Date(week1Start);
    start.setDate(week1Start.getDate() + (week - 1) * 7);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    return { start, end };
};
