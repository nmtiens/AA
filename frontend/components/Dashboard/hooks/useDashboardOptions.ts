import { useMemo } from 'react';
import { categoryOptions } from '../utils/filterMatch';
import { DataRow } from '../../../types';
import { formatDateToVN, parseVNDate } from '../utils/dateHelpers';

interface UseDashboardOptionsParams {
  productionData: DataRow[];
  khsxData: DataRow[];
  inventoryData: DataRow[];
  orderData: DataRow[];
  tkbvData: DataRow[];
  pthspData: DataRow[];

  congTrinhKey: string | undefined;
  xuongKey: string | undefined;
  tinhTrangKey: string | undefined;
   tinhTrangIpoKey: string | undefined;
  khachHangKey?: string | undefined;
  khuVucDuAnKey?: string | undefined;


  khsxNamKey: string | undefined;
  khsxThangKey: string | undefined;
  khsxNgayKey: string | undefined;
  khsxTuanKey: string | undefined;

  invNamKey: string | undefined;
  invThangKey: string | undefined;
  invNgayKey: string | undefined;
  invTuanKey: string | undefined;

  orderDateKey: string | undefined;
  tkbvDateKey: string | undefined;
  pthspDateKey: string | undefined;
  invDateKey: string | undefined;
}

/** Giá trị thô khác nhau của 1 cột (1 vòng, không tạo mảng trung gian) — vài trăm nghìn dòng chỉ còn vài nghìn giá trị */
const distinctRaw = (data: DataRow[], key: string): Set<unknown> => {
  const raw = new Set<unknown>();
  for (const row of data) raw.add(row[key]);
  return raw;
};

/** Lấy danh sách giá trị duy nhất (đã trim, bỏ rỗng, sort) của 1 cột trong 1 tập dữ liệu. */
export const getUniqueOptions = (data: DataRow[], key: string | undefined): string[] => {
  if (!key) return [];
  // Gom giá trị thô trước rồi mới trim (kết quả như trước: trim từng dòng rồi gom)
  const set = new Set<string>();
  for (const v of distinctRaw(data, key)) {
    const t = String(v || '').trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort();
};

/**
 * Gom toàn bộ logic tính danh sách option cho các bộ lọc (Dashboard).
 * Bao gồm option riêng theo từng nguồn dữ liệu (KHSX / Inventory) và
 * option hợp nhất (unified) dùng chung cho bộ lọc thời gian tổng.
 */
export function useDashboardOptions({
  productionData,
  khsxData,
  inventoryData,
  orderData,
  tkbvData,
  pthspData,
  congTrinhKey,
  xuongKey,
  tinhTrangKey,
  tinhTrangIpoKey,
  khachHangKey,
  khuVucDuAnKey,
  khsxNamKey,
  khsxThangKey,
  khsxNgayKey,
  khsxTuanKey,
  invNamKey,
  invThangKey,
  invNgayKey,
  invTuanKey,
  orderDateKey,
  tkbvDateKey,
  pthspDateKey,
  invDateKey,
}: UseDashboardOptionsParams) {

  // --- Production filter options ---
  const congTrinhOptions = useMemo(() => getUniqueOptions(productionData, congTrinhKey), [productionData, congTrinhKey]);
  const xuongOptions = useMemo(() => getUniqueOptions(productionData, xuongKey), [productionData, xuongKey]);
  const tinhTrangOptions = useMemo(() => getUniqueOptions(productionData, tinhTrangKey), [productionData, tinhTrangKey]);
  const tinhTrangIpoOptions = useMemo(() => getUniqueOptions(productionData, tinhTrangIpoKey), [productionData, tinhTrangIpoKey]);
  // Có cả lựa chọn "(Chưa có)" để khớp với lát tương ứng trên biểu đồ "Cơ cấu đơn hàng"
  const khachHangOptions = useMemo(() => categoryOptions(productionData, khachHangKey), [productionData, khachHangKey]);
  const khuVucDuAnOptions = useMemo(() => categoryOptions(productionData, khuVucDuAnKey), [productionData, khuVucDuAnKey]);
  // --- KHSX time filter options ---
  const khsxNamOptions = useMemo(() => getUniqueOptions(khsxData, khsxNamKey), [khsxData, khsxNamKey]);
  const khsxThangOptions = useMemo(() => getUniqueOptions(khsxData, khsxThangKey), [khsxData, khsxThangKey]);
  const khsxNgayOptions = useMemo(() => getUniqueOptions(khsxData, khsxNgayKey), [khsxData, khsxNgayKey]);
  const khsxTuanOptions = useMemo(() => getUniqueOptions(khsxData, khsxTuanKey), [khsxData, khsxTuanKey]);

  // --- Inventory time filter options ---
  const invNamOptions = useMemo(() => getUniqueOptions(inventoryData, invNamKey), [inventoryData, invNamKey]);
  const invThangOptions = useMemo(() => getUniqueOptions(inventoryData, invThangKey), [inventoryData, invThangKey]);
  const invNgayOptions = useMemo(() => getUniqueOptions(inventoryData, invNgayKey), [inventoryData, invNgayKey]);
  const invTuanOptions = useMemo(() => getUniqueOptions(inventoryData, invTuanKey), [inventoryData, invTuanKey]);

  // --- Unified (KHSX + Inventory) time filter options ---
  const unifiedNamOptions = useMemo(() => {
    const s = new Set([...khsxNamOptions, ...invNamOptions]);
    return Array.from(s).sort().reverse();
  }, [khsxNamOptions, invNamOptions]);

  const unifiedThangOptions = useMemo(() => {
    const s = new Set([...khsxThangOptions, ...invThangOptions]);
    return Array.from(s).sort((a, b) => parseInt(a) - parseInt(b));
  }, [khsxThangOptions, invThangOptions]);

  const unifiedNgayOptions = useMemo(() => {
    const s = new Set([...khsxNgayOptions, ...invNgayOptions]);
    return Array.from(s).sort((a, b) => {
      const valA = parseInt(a);
      const valB = parseInt(b);
      if (!isNaN(valA) && !isNaN(valB)) {
        return valA - valB;
      }
      return a.localeCompare(b);
    });
  }, [khsxNgayOptions, invNgayOptions]);

  const unifiedTuanOptions = useMemo(() => {
    const s = new Set([...khsxTuanOptions, ...invTuanOptions]);
    return Array.from(s).sort((a, b) => {
      const valA = parseInt(a);
      const valB = parseInt(b);
      if (!isNaN(valA) && !isNaN(valB)) {
        return valA - valB;
      }
      return a.localeCompare(b);
    });
  }, [khsxTuanOptions, invTuanOptions]);

  // --- Unified date options (Order + TKBV + PTHSP + Inventory), dùng cho bộ lọc "NGÀY BÁO CÁO" ---
  // ~270 nghìn dòng nhưng chỉ vài nghìn ngày khác nhau: gom giá trị thô trước rồi mới đổi định dạng (trước đổi định
  // dạng từng dòng ~200 ms); sắp xếp dùng thời điểm đã parse sẵn. Kết quả giữ nguyên như cũ.
  const unifiedDateOptions = useMemo(() => {
    const dates = new Set<string>();
    const addDates = (data: DataRow[], key: string | undefined) => {
      if (!key) return;
      for (const val of distinctRaw(data, key)) {
        if (val) {
          const formatted = formatDateToVN(val);
          if (formatted) dates.add(formatted);
        }
      }
    };

    addDates(orderData, orderDateKey);
    addDates(tkbvData, tkbvDateKey);
    addDates(pthspData, pthspDateKey);
    addDates(inventoryData, invDateKey);

    const time = new Map<string, number | null>();
    for (const d of dates) time.set(d, parseVNDate(d)?.getTime() ?? null);
    return Array.from(dates).sort((a, b) => {
      const ta = time.get(a) ?? null;
      const tb = time.get(b) ?? null;
      if (ta !== null && tb !== null) return tb - ta;
      return b.localeCompare(a);
    });
  }, [orderData, tkbvData, pthspData, inventoryData, orderDateKey, tkbvDateKey, pthspDateKey, invDateKey]);

  return {
    congTrinhOptions,
    xuongOptions,
    tinhTrangOptions,
    tinhTrangIpoOptions,
    khachHangOptions,
    khuVucDuAnOptions,
    khsxNamOptions,
    khsxThangOptions,
    khsxNgayOptions,
    khsxTuanOptions,
    invNamOptions,
    invThangOptions,
    invNgayOptions,
    invTuanOptions,
    unifiedNamOptions,
    unifiedThangOptions,
    unifiedNgayOptions,
    unifiedTuanOptions,
    unifiedDateOptions,
  };
}

export type DashboardOptions = ReturnType<typeof useDashboardOptions>;