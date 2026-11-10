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

/** Thứ Hai của tuần chứa ngày d */
export const thuHaiCua = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
/** Thứ Năm của tuần chứa ngày d: mốc chọn năm, tháng của tuần (như tuần ISO) */
export const thuNamCua = (d: Date): Date => { const t2 = thuHaiCua(d); return new Date(t2.getFullYear(), t2.getMonth(), t2.getDate() + 3); };

/** Tuần ISO của ngày: năm theo Thứ Năm của tuần */
export const tuanISO = (d: Date): { nam: number; tuan: number } => {
    const t5 = thuNamCua(d);
    const nam = t5.getFullYear();
    return { nam, tuan: Math.floor((Date.UTC(nam, t5.getMonth(), t5.getDate()) - Date.UTC(nam, 0, 1)) / 864e5 / 7) + 1 };
};

const dd = (d: Date) => String(d.getDate()).padStart(2, '0');
const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, '0');

export interface TuanTrongThang {
    nam: number; tuan: number;
    /** Trọn tuần T2-CN */
    tu: Date; den: Date;
    /** Phần ngày nằm trong tháng */
    tuTrong: Date; denTrong: Date;
    /** T45 (02-08/11); tuần sang tháng khác chỉ ghi phần trong tháng */
    nhan: string;
}

/** Mọi tuần có ít nhất 1 ngày trong tháng (thang = 1..12): ghép các tuần lại phủ đủ mọi ngày của tháng */
export const tuanTrongThang = (nam: number, thang: number): TuanTrongThang[] => {
    const dau = new Date(nam, thang - 1, 1);
    const cuoi = new Date(nam, thang, 0);
    const ds: TuanTrongThang[] = [];
    for (let thu2 = thuHaiCua(dau); thu2 <= cuoi; thu2 = new Date(thu2.getFullYear(), thu2.getMonth(), thu2.getDate() + 7)) {
        const den = new Date(thu2.getFullYear(), thu2.getMonth(), thu2.getDate() + 6);
        const tuTrong = thu2 < dau ? dau : thu2;
        const denTrong = den > cuoi ? cuoi : den;
        ds.push({ ...tuanISO(thu2), tu: thu2, den, tuTrong, denTrong, nhan: `T${tuanISO(thu2).tuan} (${dd(tuTrong)}-${dd(denTrong)}/${mm(denTrong)})` });
    }
    return ds;
};
