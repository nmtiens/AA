// ============================================================================
// TOKEN GIAO DIỆN MÀN XƯỞNG (quyết định 5A, docs/designs/xuong-checkin.md — Pass 5)
// Kế thừa components/Mobile/mobileUi.tsx (BG, BottomSheet, Toast). Bối cảnh: tay đeo găng, đèn xưởng sáng.
// Kích thước dùng rem để theo cỡ chữ người dùng chọn ở /m/ (gốc 19px → 64px ≈ 3.375rem; dùng h-16 = 4rem cho chắc).
// - Nút chính ≥ 64px, nút phụ / dòng ≥ 56px, hai vùng chạm cách nhau ≥ 12px.
// - Số lượng / quân số 24px tabular-nums; ô chốt quân số 40px.
// - Chữ nhỏ nhất 16px (text-base), màu slate-600 trở lên. Màu trạng thái luôn kèm chữ + icon (6B).
// - Nút chính màu đỏ AA (thiết kế Figma "Operations Hub – Thiết kế lại"); nút phụ trắng viền xám.
// ============================================================================

export const NUT_CHINH =
  'flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-aa-600 px-4 text-lg font-semibold text-white active:bg-aa-700 disabled:opacity-40';
export const NUT_PHU =
  'flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-800 active:bg-slate-100 disabled:opacity-40';
/** Nút hành động chính trên một dòng hạng mục (Xong — giao / Tiếp tục / Bắt đầu / Nhận) */
export const NUT_DONG =
  'flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-aa-600 px-3 text-base font-semibold text-white active:bg-aa-700 disabled:opacity-40';
/** Nút −/+ 64px */
export const NUT_DEM =
  'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-300 bg-white text-3xl font-semibold text-slate-800 active:bg-slate-100 disabled:opacity-30';
export const SO = 'text-2xl font-semibold tabular-nums text-slate-900';
export const SO_LON = 'text-[2.5rem] font-semibold leading-none tabular-nums text-slate-900';
export const CHU_PHU = 'text-base text-slate-600';
export const KHOI = 'overflow-hidden rounded-2xl bg-white';
export const KE = 'divide-y divide-slate-100';

/** 4 màu trạng thái cố định — luôn hiển thị cùng chữ + icon */
export const MAU = {
  chay: { chu: 'text-emerald-700', nen: 'bg-emerald-50', vien: 'border-emerald-200' },
  ngung: { chu: 'text-amber-700', nen: 'bg-amber-50', vien: 'border-amber-200' },
  loi: { chu: 'text-red-700', nen: 'bg-red-50', vien: 'border-red-200' },
  cho: { chu: 'text-slate-500', nen: 'bg-slate-100', vien: 'border-slate-200' },
} as const;
