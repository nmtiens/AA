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
  export function canonicalizePersonNames(rows: Row[], cols: Cot[]): Row[];
  export function setPlanMet(d: { tuan: string[]; thang: string[] }): void;
  /** Bản ghi gọn Tổng quan công trình (frontend/components/Construction/core/banGhiCongTrinh.ts) */
  export function taoBanGhi(rows: Row[], cols: Cot[], today: number): unknown[];
  export function nenBanGhi(recs: unknown[]): { n: number } & Record<string, unknown>;
  export function setServerProjectAliases(list: { k: string; c: string }[]): void;
  export function canonicalizeWorkshops(rows: Row[], cols: Cot[]): Row[];
  export function applyWorkshopMapping(mapping: Record<string, string>): void;
  export function cotTuDuLieu(rows: Row[]): Cot[];
  /** Số theo file công trình (frontend/components/Construction/core/ghepFileCongTrinh.ts) */
  export interface DuLieuFileCongTrinh { coBang: boolean; capNhat: string | null; soFile: number; cot: string[]; dong: [string, Record<string, unknown> | 0][] }
  export function ghepDongFile(app: Row[], cols: Cot[], hexKey: string, d: DuLieuFileCongTrinh): Row[];
  export function coSoFile(d: DuLieuFileCongTrinh | null | undefined): d is DuLieuFileCongTrinh;
  /** Vị trí công đoạn MRA (frontend/components/Dashboard/core/viTriMra.ts) */
  export type MaViTriMra = 'P012' | 'P013' | 'P014' | 'P016' | 'P018' | 'P020' | 'P021';
  export type ViTriMra = { ma: MaViTriMra; tu: string | null; cd: string[]; trangThai: string };
  export type BanDoMra = { ver: string; map: Record<string, ViTriMra> };
  export const NHAN_DU_PHONG: Record<MaViTriMra, string>;
  export function soNgayTuMoc(tuIso: string | null | undefined, nowMs: number): string;
  export function nhanTheoMa(rows: Row[], bopKey: string): Map<string, string>;
  export function phuViTriMra(rows: Row[], cols: Cot[], ban: BanDoMra | null | undefined, nowMs: number, nhan?: Map<string, string>): { rows: Row[]; soPhu: number };
  export function demNguonBop(rows: Row[]): number;
}
