// Hằng số công đoạn BOP dùng chung (trang Tổng quan, Luồng đỏ, Căn mẫu, máy chủ tính sẵn Tổng quan).
// Tách khỏi OnLineStageDetailModal để phần tính số không kéo theo React / component.

// Công đoạn thuộc "Đang trên chuyền": P012 -> P021 (kể cả GCVT). Đã chốt P012 THUỘC
// "đang trên chuyền". P002 tách riêng thành cột "Chưa tính phiếu P002".
// Mảng này dùng chung cho Dashboard, Luồng đỏ, Căn mẫu — đổi ở đây là đổi mọi nơi.
export const ON_LINE_STAGES = [
  'P012',
  'P013',
  'GCVT',
  'P014',
  'P016',
  'P018',
  'P020',
  'P021',
] as const;

// Công đoạn "Chưa tính phiếu" tách riêng khỏi đang trên chuyền.
export const P002_STAGE = 'P002';

// Giá trị đại diện cho "tất cả công đoạn" khi click vào ô Tổng.
export const TOTAL_STAGE = 'TOTAL';

// Phần CÒN LẠI của 1 hạng mục xếp vào đúng 1 nhóm theo công đoạn BOP, dùng chung phễu, bảng công trình, tab BOP:
//   P001 (hoặc tình trạng 15. CHƯA TRIỂN KHAI)  -> Chưa triển khai
//   P002                                         -> Chưa tính phiếu
//   GCVT, P012 -> P021                           -> Đang trên chuyền
//   còn lại (P022 / P025 nhưng nhập kho chưa đủ) -> Nhập kho chưa đủ
export type RemainBucket = 'notDeployed' | 'p002' | 'onLine' | 'shortfall';
const ON_LINE_STAGE_SET = new Set<string>(ON_LINE_STAGES);

export function remainBucketOf(statusUpper: string, stage: string | null): RemainBucket {
  if (statusUpper.includes('15. CHƯA TRIỂN KHAI') || stage === 'P001') return 'notDeployed';
  if (stage === P002_STAGE) return 'p002';
  if (stage && ON_LINE_STAGE_SET.has(stage)) return 'onLine';
  return 'shortfall';
}

export const extractStage = (value: unknown): string | null => {
  const match = String(value ?? '').trim().toUpperCase().match(/^(P\d{3}|GCVT)/);
  return match ? match[1] : null;
};
