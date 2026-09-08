import { useMemo } from 'react';
import { ColumnDefinition, TARGET_COLUMN_NAMES } from '../../../types';
import { findColumnKey } from '../utils/columnKeyResolver';

interface UseColumnKeysParams {
  productionColumns: ColumnDefinition[];
  materialColumns: ColumnDefinition[];
  khsxColumns: ColumnDefinition[];
  inventoryColumns: ColumnDefinition[];
  exportColumns: ColumnDefinition[];
  stockColumns: ColumnDefinition[];
  orderColumns: ColumnDefinition[];
  tkbvColumns: ColumnDefinition[];
  pthspColumns: ColumnDefinition[];
  analysisColumns: ColumnDefinition[];
  attendanceColumns: ColumnDefinition[];
}

/**
 * Gom toàn bộ logic findColumnKey(...) của Dashboard vào 1 chỗ.
 * Trả về object phẳng chứa tất cả các key đã resolve, memo hoá theo
 * từng mảng columns tương ứng để tránh tính toán lại không cần thiết.
 */
export function useColumnKeys({
  productionColumns,
  materialColumns,
  khsxColumns,
  inventoryColumns,
  exportColumns,
  stockColumns,
  orderColumns,
  tkbvColumns,
  pthspColumns,
  analysisColumns,
  attendanceColumns,
}: UseColumnKeysParams) {

  // 1. Production Keys
  const productionKeys = useMemo(() => ({
    hexKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.HEX) || 'hex',
    tinhTrangKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TINH_TRANG) || 'tinh_trang',
    tinhTrangIpoKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TINH_TRANG_IPO) || 'tinh_trang_ipo',
    valueKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.GIA_TRI_CON_LAI) || 'gia_tri_don_hang_con_lai',
    realValueKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.GIA_TRI_THUC_TE) || 'gia_tri_con_lai',
    congTrinhKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
    xuongKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    hangMucKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TEN_HANG_MUC) || 'ten_hang_muc',
    daysAtCurrentStageKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.SO_NGAY_CD_HIEN_TAI) || 'so_ngay_cd_hien_tai',
    bopKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.BOP) || 'bop',
    triGiaDonHangTongKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG) || 'tri_gia_don_hang_tong',
    thanhTienTinhPhieuKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.THANH_TIEN_TINH_PHIEU) || 'thanh_tien_tinh_phieu',
    thanhTienNhapKhoKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO) || 'thanh_tien_nhap_kho_luy_ke',
  }), [productionColumns]);

  // 2. Material Keys
  const materialKeys = useMemo(() => ({
    matCongTrinhKey: findColumnKey(materialColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
    matNhomVtKey: findColumnKey(materialColumns, TARGET_COLUMN_NAMES.NHOM_VT) || 'nhom_vt',
    matSlYeuCauKey: findColumnKey(materialColumns, TARGET_COLUMN_NAMES.SL_YEU_CAU) || 'so_luong_yeu_cau',
    matSlDaNhanKey: findColumnKey(materialColumns, TARGET_COLUMN_NAMES.SL_DA_NHAN) || 'so_luong_da_nhan_sap',
    matStatusKey: findColumnKey(materialColumns, TARGET_COLUMN_NAMES.STATUS) || 'trang_thai',
    matStatusSapKey: findColumnKey(materialColumns, TARGET_COLUMN_NAMES.STATUS_SAP) || 'trang_thai_sap',
    matEstDateKey: findColumnKey(materialColumns, TARGET_COLUMN_NAMES.EST_DELIVERY) || 'ngay_du_kien_giao_hang_pmh_nhap',
  }), [materialColumns]);

  // 3. KHSX Keys
  const khsxKeys = useMemo(() => ({
    khsxXuongKey: findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    khsxCongTrinhKey: findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
    khsxNamKey: findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.NAM) || 'nam',
    khsxThangKey: findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.THANG) || 'thang',
    khsxNgayKey: findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.NGAY) || 'ngay',
    khsxTuanKey: findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.TUAN) || 'tuan',
  }), [khsxColumns]);

  // 4. Inventory Keys
  const inventoryKeys = useMemo(() => ({
    invThanhTienKey: findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.INVENTORY_AMOUNT) || 'thanh_tien_nhap_kho',
    invXuongKey: findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    invCongTrinhKey: findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
    invNamKey: findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.NAM) || 'nam',
    invThangKey: findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.THANG) || 'thang',
    invNgayKey: findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.NGAY) || 'ngay',
    invDateKey: findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.DATE) || 'date',
    invTuanKey: findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.TUAN) || 'tuan',
  }), [inventoryColumns]);

  // 5. Export Keys
  const exportKeys = useMemo(() => ({
    expThanhTienKey: findColumnKey(exportColumns, TARGET_COLUMN_NAMES.EXPORT_AMOUNT) || 'so_luong_xuat_kho',
    expDateKey: findColumnKey(exportColumns, TARGET_COLUMN_NAMES.DATE) || 'date',
    expXuongKey: findColumnKey(exportColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    expCongTrinhKey: findColumnKey(exportColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
  }), [exportColumns]);

  // 6. Stock Keys
  const stockKeys = useMemo(() => ({
    stockDateKey: findColumnKey(stockColumns, TARGET_COLUMN_NAMES.DATE) || 'date',
    stockValueKey: findColumnKey(stockColumns, TARGET_COLUMN_NAMES.GIA_TRI_TON_KHO) || 'gia_tri',
    stockSapIdKey: findColumnKey(stockColumns, TARGET_COLUMN_NAMES.MA_ID_SAP) || 'ma_id_sap',
  }), [stockColumns]);

  // 7. Order Keys
  const orderKeys = useMemo(() => ({
    orderDateKey: findColumnKey(orderColumns, TARGET_COLUMN_NAMES.NGAY_NHAN_TU_PM) || 'ngay_nhan_tu_pm',
    orderValueKey: findColumnKey(orderColumns, TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG) || 'tri_gia_don_hang_tong',
    orderXuongKey: findColumnKey(orderColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    orderCongTrinhKey: findColumnKey(orderColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
  }), [orderColumns]);

  // 8. TKBV Keys
  const tkbvKeys = useMemo(() => ({
    tkbvDateKey: findColumnKey(tkbvColumns, TARGET_COLUMN_NAMES.NGAY_NHAN) || 'ngay_nhan',
    tkbvValueKey: findColumnKey(tkbvColumns, TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG) || 'tri_gia_don_hang_tong',
    tkbvXuongKey: findColumnKey(tkbvColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    tkbvCongTrinhKey: findColumnKey(tkbvColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
  }), [tkbvColumns]);

  // 9. PTHSP Keys
  const pthspKeys = useMemo(() => ({
    pthspDateKey: findColumnKey(pthspColumns, TARGET_COLUMN_NAMES.NGAY_HOAN_THANH) || 'ngay_hoan_thanh',
    pthspValueKey: findColumnKey(pthspColumns, TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG) || 'tri_gia_don_hang_tong',
    pthspXuongKey: findColumnKey(pthspColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    pthspCongTrinhKey: findColumnKey(pthspColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
  }), [pthspColumns]);

  // 10. Analysis Keys
  const analysisKeys = useMemo(() => ({
    analysisXuongKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    analysisCongTrinhKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
    analysisPlanKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.THANH_TIEN_KE_HOACH) || 'thanh_tien_ke_hoach',
    analysisActualKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.NHAP_KHO_TUAN) || 'nhap_kho_tuan',
    analysisWeekKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.TUAN) || 'tuan',
    analysisDungKhKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.DUNG_KE_HOACH) || 'dung_ke_hoach',
    analysisThucHienDungKh1PhanKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.THUC_HIEN_DUNG_KE_HOACH_1_PHAN) || 'thuc_hien_dung_ke_hoach_1_phan',
    analysisRotKhKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.ROT_KE_HOACH) || 'rot_ke_hoach',
    analysisThucHienRotKh1PhanKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.THUC_HIEN_ROT_KE_HOACH_1_PHAN) || 'thuc_hien_rot_ke_hoach_1_phan',
    analysisNhapKhoTruocKhKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.NHAP_KHO_TRUOC_KE_HOACH) || 'nhap_kho_truoc_ke_hoach',
    analysisVuotKhKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.VUOT_KE_HOACH) || 'vuot_ke_hoach',
    analysisNhapKhoNgoaiKhKey: findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.NHAP_KHO_NGOAI_KE_HOACH) || 'nhap_kho_ngoai_ke_hoach',
  }), [analysisColumns]);

  // 11. Attendance Keys
  const attendanceKeys = useMemo(() => ({
    attXuongKey: findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    attSoLuongCnKey: findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.SO_LUONG_CONG_NHAN) || 'so_luong_cong_nhan',
    attGioCongHcKey: findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.GIO_CONG_HC) || 'gio_cong_hanh_chinh',
    attGioCongTcKey: findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.GIO_CONG_TC) || 'gio_cong_tang_ca',
    attTuanKey: findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.TUAN) || 'tuan',
    attNamKey: findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.NAM) || 'nam',
    attThangKey: findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.THANG) || 'thang',
    attNgayKey: findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.NGAY) || 'ngay',
    attDinhBienKey: findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.DINH_BIEN) || 'dinh_bien',
  }), [attendanceColumns]);

  return useMemo(() => ({
    ...productionKeys,
    ...materialKeys,
    ...khsxKeys,
    ...inventoryKeys,
    ...exportKeys,
    ...stockKeys,
    ...orderKeys,
    ...tkbvKeys,
    ...pthspKeys,
    ...analysisKeys,
    ...attendanceKeys,
  }), [
    productionKeys, materialKeys, khsxKeys, inventoryKeys, exportKeys,
    stockKeys, orderKeys, tkbvKeys, pthspKeys, analysisKeys, attendanceKeys,
  ]);
}

export type ColumnKeys = ReturnType<typeof useColumnKeys>;