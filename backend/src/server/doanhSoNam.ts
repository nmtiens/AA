import { TRIEU_TO_TY } from './common.js';

// Ghép kết quả /api/revenue từ 2 câu GROUPING SETS (kế hoạch khsx_nam, thực hiện nhap_kho): mỗi câu trả 1 dòng tổng
// (la_tong = 1) + các dòng theo xưởng (la_tong = 0). Hàm thuần — không đọc DB — để kiểm thử được.
// Tổng do SQL tự cộng (không cộng lại trong Node) nên giống hệt con số của 4 câu riêng trước đây.

export interface DongKeHoachNam { la_tong: unknown; name: string | null; plan: unknown; q1: unknown; q2: unknown; q3: unknown }
export interface DongThucHienNam { la_tong: unknown; name: string | null; actual: unknown }

const laTong = (r: { la_tong: unknown }) => Number(r.la_tong) === 1;

export const ghepDoanhSoNam = (year: number, keHoach: DongKeHoachNam[], thucHien: DongThucHienNam[]) => {
  const tongKh = keHoach.find(laTong);
  const tongTh = thucHien.find(laTong);
  const targetTotal = Number(tongKh?.plan ?? 0);
  const actualTotal = Number(tongTh?.actual ?? 0) / TRIEU_TO_TY; // triệu -> tỷ

  const workshopMap: Record<string, { plan: number; actual: number }> = {};
  keHoach.filter(r => !laTong(r)).forEach(r => { workshopMap[String(r.name)] = { plan: Number(r.plan), actual: 0 }; });
  thucHien.filter(r => !laTong(r)).forEach(r => {
    const ten = String(r.name);
    if (!workshopMap[ten]) workshopMap[ten] = { plan: 0, actual: 0 };
    workshopMap[ten].actual = Number(r.actual) / TRIEU_TO_TY;
  });

  const byWorkshop = Object.entries(workshopMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => (a.name === 'KHÁC' ? 1 : b.name === 'KHÁC' ? -1 : a.name.localeCompare(b.name)));

  return {
    year,
    targetRevenue2026: targetTotal,
    quarterlyTargets: {
      q1: Number(tongKh?.q1 ?? 0),
      q2: Number(tongKh?.q2 ?? 0),
      q3: Number(tongKh?.q3 ?? 0),
      q4: targetTotal,
    },
    actual: { value: actualTotal, percent: targetTotal > 0 ? (actualTotal / targetTotal) * 100 : 0 },
    byWorkshop,
  };
};

/** Khoá bản dùng chung của /api/revenue: chỉ năm hiện tại (1 dòng cố định) — năm tuỳ ý trên URL không đẻ thêm dòng. */
export const khoaChungDoanhSo = (year: number, namHienTai: number): string => (year === namHienTai ? 'revenue-nam-nay' : '');
