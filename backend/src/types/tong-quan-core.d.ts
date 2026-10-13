// Kiểu cho bí danh '@tong-quan/core' = frontend/components/Dashboard/core/mayChu.ts (esbuild gom vào bundle, xem
// script build:bundle). tsc của backend không đọc file frontend (khác cách phân giải module) nên khai báo gọn ở
// đây — kết quả chỉ chuyển nguyên sang JSON cho giao diện, giao diện có kiểu đầy đủ.
declare module '@tong-quan/core' {
  type Row = Record<string, unknown>;
  interface Cot { key: string; label: string }
  export interface DashboardFiltersState {
    congTrinh: string[]; xuong: string[]; tinhTrang: string[]; tinhTrangIpo: string[];
    khachHang: string[]; khuVucDuAn: string[]; phanLoai: string[];
  }
  export interface TuyChonTongQuan {
    workshopMetric: string; projectMetric: string; projectSummaryMetric: 'VALUE' | 'COUNT';
    excludeFabrics: boolean; bottleneckViewMode: 'BOP' | 'TÌNH TRẠNG';
  }
  export const DEFAULT_FILTERS: DashboardFiltersState;
  export const TUY_CHON_MAC_DINH: TuyChonTongQuan;
  export function tinhTongQuanSanXuat(rows: Row[], cols: Cot[], filters: DashboardFiltersState, tuy: TuyChonTongQuan): { soDong: number } & Record<string, unknown>;
  export function canonicalizeProjectNames(rows: Row[], cols: Cot[]): Row[];
  export function setServerProjectAliases(list: { k: string; c: string }[]): void;
  export function canonicalizeWorkshops(rows: Row[], cols: Cot[]): Row[];
  export function applyWorkshopMapping(mapping: Record<string, string>): void;
  export function cotTuDuLieu(rows: Row[]): Cot[];
}
