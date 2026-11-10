import {TARGET_COLUMN_NAMES } from '../../types.ts';

// Nhóm tình trạng theo TIỀN TỐ MÃ của cột tinh_trang: 'NN' = đúng mã NN, 'NN.*' = NN và mọi mã con (06.3, 16.9...).
// Đổi tên tình trạng (giữ mã) không làm rơi hạng mục khỏi nhóm. GCVT (04.4, 04.5, 05.3, 06.2, 06.3, 16.*) thuộc Có thể SX.
export const STATUS_GROUPS = {
  VECNI_FITTING: ['01', '02.*'], // tên cũ; thực đo Đóng gói / KĐB
  CHUYEN_KHAC: ['03.*', '04.*', '05.*', '06.*', '07.*', '16.*'],
  CO_PHIEU_CHUA_SX: ['11'],
  VUONG_SL: ['12', '13'],
  CHUA_TRIEN_KHAI: ['14.*', '15'],
} as const;
export type NhomTinhTrang = keyof typeof STATUS_GROUPS;
export const NHOM_CO_THE_SX: NhomTinhTrang[] = ['VECNI_FITTING', 'CHUYEN_KHAC', 'CO_PHIEU_CHUA_SX'];
export const NHOM_CHUA_THE_SX: NhomTinhTrang[] = ['VUONG_SL', 'CHUA_TRIEN_KHAI'];

/** Mã đầu của tình trạng: "06.3. GCVT HÀN" -> 06.3; "07.ĐÃ GIAO GCNB" -> 07; "HỦY" -> '' */
export const maTinhTrang = (status: unknown): string => /^\d{2}(?:\.\d+)?/.exec(String(status ?? '').trim())?.[0] ?? '';

const khopMa = (ma: string, mau: string) => (mau.endsWith('.*') ? ma === mau.slice(0, -2) || ma.startsWith(mau.slice(0, -1)) : ma === mau);

/** Nhóm của 1 mã tình trạng; null = không thuộc nhóm nào (00, 01.1, HỦY, TẠM NGƯNG) */
export const nhomCuaMa = (ma: string): NhomTinhTrang | null =>
  (Object.keys(STATUS_GROUPS) as NhomTinhTrang[]).find(n => (STATUS_GROUPS[n] as readonly string[]).some(m => khopMa(ma, m))) ?? null;

export const laChuaTheSX = (status: unknown): boolean => {
  const n = nhomCuaMa(maTinhTrang(status));
  return !!n && NHOM_CHUA_THE_SX.includes(n);
};

export const MATERIAL_LIST_COLUMNS = [
  TARGET_COLUMN_NAMES.STATUS,
  TARGET_COLUMN_NAMES.CONG_TRINH,
  TARGET_COLUMN_NAMES.SO_PR,
  TARGET_COLUMN_NAMES.TEN_VAT_TU,
  TARGET_COLUMN_NAMES.SL_YEU_CAU,
  TARGET_COLUMN_NAMES.BASE_UNIT,
  TARGET_COLUMN_NAMES.REQUEST_DATE,
  TARGET_COLUMN_NAMES.EST_DELIVERY,
  TARGET_COLUMN_NAMES.SL_DA_NHAN,
  TARGET_COLUMN_NAMES.REMAINING_QTY,
  TARGET_COLUMN_NAMES.TEAM_PR_NOTE,
  TARGET_COLUMN_NAMES.STATUS_PO,
  TARGET_COLUMN_NAMES.NOTE_PO,
  TARGET_COLUMN_NAMES.PR_ITEM,
  TARGET_COLUMN_NAMES.ACTUAL_DATE,
  TARGET_COLUMN_NAMES.ACTUAL_QTY,
  TARGET_COLUMN_NAMES.MATERIAL_CODE,
  TARGET_COLUMN_NAMES.REQUISITIONER,

];

export const MATERIAL_LIST_COLUMN_LABELS: Record<string, string> = {
  [TARGET_COLUMN_NAMES.STATUS]: 'TRẠNG THÁI',
  [TARGET_COLUMN_NAMES.CONG_TRINH]: 'TÊN CÔNG TRÌNH',
  [TARGET_COLUMN_NAMES.SO_PR]: 'SỐ PR',
  [TARGET_COLUMN_NAMES.TEN_VAT_TU]: 'TÊN VẬT TƯ',
  [TARGET_COLUMN_NAMES.SL_YEU_CAU]: 'SỐ LƯỢNG YÊU CẦU',
  [TARGET_COLUMN_NAMES.BASE_UNIT]: 'ĐVT',
  [TARGET_COLUMN_NAMES.REQUEST_DATE]: 'NGÀY PR',
  [TARGET_COLUMN_NAMES.EST_DELIVERY]: 'NGÀY DỰ KIẾN GIAO HÀNG PMH NHẬP',
  [TARGET_COLUMN_NAMES.SL_DA_NHAN]: 'SỐ LƯỢNG ĐÃ NHẬN (SAP)',
  [TARGET_COLUMN_NAMES.REMAINING_QTY]: 'SỐ LƯỢNG CÒN LẠI',
  [TARGET_COLUMN_NAMES.TEAM_PR_NOTE]: 'TEAM PR NOTE',
  [TARGET_COLUMN_NAMES.STATUS_PO]: 'TÌNH TRẠNG PO',
  [TARGET_COLUMN_NAMES.NOTE_PO]: 'GHI CHÚ TÌNH TRẠNG PO',
  [TARGET_COLUMN_NAMES.PR_ITEM]: 'PR LINE',
  [TARGET_COLUMN_NAMES.ACTUAL_DATE]: 'NGÀY VỀ - KHO BÁO',
  [TARGET_COLUMN_NAMES.ACTUAL_QTY]: 'SL HÀNG VỀ THỰC TẾ - KHO BÁO',
  [TARGET_COLUMN_NAMES.MATERIAL_CODE]: 'MÃ VẬT TƯ (SAP)',
  [TARGET_COLUMN_NAMES.REQUISITIONER]: 'NGƯỜI YÊU CẦU',
};