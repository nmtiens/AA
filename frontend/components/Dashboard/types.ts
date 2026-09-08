export interface BottleneckItem {
  name: string;
  [key: string]: string | number;
}

export type MetricType = 'COUNT_HEX' | 'SUM_GT_CON_LAI' | 'SUM_GT_DON_HANG';

export interface WorkshopPivotData {
  uniqueWorkshops: string[];
  rows: { bop: string; status: string; key: string }[];
  uniqueBops: string[];
  bopTotals: Record<string, Record<string, number>>;
  bopRowTotals: Record<string, number>;
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

export interface ProjectPivotData {
  uniqueProjects: string[];
  uniqueStatuses: string[];
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

export interface MaterialSummaryPivotData {
  summary: Record<string, { req: number; rec: number }>;
  sortedGroups: string[];
  totalReq: number;
  totalRec: number;
}

export interface MaterialStatusPivotData {
  sortedGroups: string[];
  uniqueStatuses: string[];
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

export interface AnalysisItem {
  name: string;
  daily: number;
  mtd: number;
}

export type ExportFlowType = 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';