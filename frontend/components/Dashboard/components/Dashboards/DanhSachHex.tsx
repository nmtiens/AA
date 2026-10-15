import { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../../../../types';
import { findColumnKey } from '../../utils/columnKeyResolver';
import { HexDetailModal, type HexDetailColumnKeys } from '../modals/HexDetailModal';
import { useToast } from '../../../../context/ToastContext';

// ============================================================================
// Danh sách HẠNG MỤC (HEX) khi bấm 1 con số / nút xem chi tiết của biểu đồ, bảng theo Xưởng / Công trình:
// công trình -> hạng mục -> BOT / BOP / BOM. Dùng đúng HexDetailModal có sẵn (như phễu, Tổng quan công trình), dòng lấy
// từ bảng sản xuất theo các HEX tạo nên số đó (máy chủ trả qua /api/detail?chiHex=1).
// Trang bọc DanhSachHexProvider thì biểu đồ / bảng bên trong mở được danh sách; không bọc => giữ cách cũ.
// ============================================================================

/** Khoá cột của bảng sản xuất cho HexDetailModal (dùng chung Tổng quan công trình / trang biểu đồ) */
export function hexColumnKeysOf(columns: ColumnDefinition[]): HexDetailColumnKeys {
  const key = (target: string) => findColumnKey(columns, target) || target;
  return {
    hexKey: key(TARGET_COLUMN_NAMES.HEX),
    congTrinhKey: key(TARGET_COLUMN_NAMES.CONG_TRINH),
    hangMucKey: key(TARGET_COLUMN_NAMES.TEN_HANG_MUC),
    xuongKey: key(TARGET_COLUMN_NAMES.XUONG),
    bopKey: key(TARGET_COLUMN_NAMES.BOP),
    tinhTrangKey: key(TARGET_COLUMN_NAMES.TINH_TRANG),
    phanLoaiNhomSanPhamKey: key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM),
    triGiaDonHangTongKey: key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG),
    thanhTienTinhPhieuKey: key(TARGET_COLUMN_NAMES.THANH_TIEN_TINH_PHIEU),
    thanhTienNhapKhoKey: key(TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO),
    ngayCanGiaoKey: findColumnKey(columns, 'ngay_can_giao') || findColumnKey(columns, 'ngay_can') || 'ngay_can_giao',
  };
}

/** HEX của 1 con số + thông tin của các HEX không còn trong bảng sản xuất (lấy từ bảng nguồn) */
export interface HexChiTiet {
  hexes: string[];
  ngoaiSanXuat: Record<string, unknown>[];
  /** Cột giá trị của bảng nguồn (tri_gia_don_hang_tong / thanh_tien_nhap_kho / thanh_tien_xuat_kho) */
  cotGiaTri: string;
}
/** Tình trạng ghi cho HEX không còn trong bảng sản xuất */
export const KHONG_CON_SX = 'Không còn trong bảng sản xuất';

type MoDanhSachHex = (title: string, ds: HexChiTiet) => void;
const DanhSachHexContext = createContext<MoDanhSachHex | null>(null);
export const useMoDanhSachHex = () => useContext(DanhSachHexContext);

/** Lấy danh sách HEX của 1 số (cùng tham số /api/detail của biểu đồ / bảng), rồi mở danh sách hạng mục */
export async function layHexChiTiet(params: URLSearchParams, signal?: AbortSignal): Promise<HexChiTiet> {
  const p = new URLSearchParams(params);
  p.set('chiHex', '1');
  const r = await fetch(`/api/detail?${p.toString()}`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return {
    hexes: Array.isArray(d.hexes) ? d.hexes : [],
    ngoaiSanXuat: Array.isArray(d.ngoaiSanXuat) ? d.ngoaiSanXuat : [],
    cotGiaTri: String(d.cotGiaTri ?? ''),
  };
}

export function DanhSachHexProvider({ rows, columnKeys, currentUser, children }: {
  /** Bảng sản xuất (1 dòng / HEX) */
  rows: DataRow[];
  columnKeys: HexDetailColumnKeys;
  currentUser: string;
  children: ReactNode;
}) {
  const { showToast } = useToast();
  const [ds, setDs] = useState<{ open: boolean; title: string; hexes: Set<string>; ngoai: Record<string, unknown>[]; cotGiaTri: string }>(
    { open: false, title: '', hexes: new Set(), ngoai: [], cotGiaTri: '' });
  const mo = useMemo<MoDanhSachHex>(() => (title, d) => {
    // Số do máy chủ tính sẵn — danh sách hạng mục cần bảng sản xuất (đang tải ngầm)
    if (rows.length === 0) { showToast('Đang tải chi tiết hạng mục, bấm lại sau ít giây', 'info'); return; }
    setDs({ open: true, title, hexes: new Set(d.hexes), ngoai: d.ngoaiSanXuat, cotGiaTri: d.cotGiaTri });
  }, [rows.length, showToast]);
  const dsRows = useMemo(() => {
    const k = columnKeys;
    if (!ds.open || !k.hexKey) return [];
    const trongSx = rows.filter(row => ds.hexes.has(String(row[k.hexKey] ?? '').trim()));
    const daCo = new Set(trongSx.map(row => String(row[k.hexKey] ?? '').trim()));
    // HEX không còn trong bảng sản xuất (ảnh chụp hiện tại): dòng dựng từ bảng nguồn để danh sách đủ số hạng mục
    // như con số đã bấm; giá trị của bảng nguồn đặt vào cột tương ứng (trị giá đơn hàng / thành tiền nhập kho)
    const cotGt = ds.cotGiaTri === 'tri_gia_don_hang_tong' ? k.triGiaDonHangTongKey
      : ds.cotGiaTri === 'thanh_tien_nhap_kho' ? k.thanhTienNhapKhoKey : '';
    const ngoai: DataRow[] = ds.ngoai
      .filter(x => !daCo.has(String(x.hex ?? '')))
      .map(x => ({
        [k.hexKey]: x.hex,
        [k.congTrinhKey]: x.ten_cong_trinh ?? '',
        [k.hangMucKey]: x.ten_hang_muc ?? '',
        [k.xuongKey]: x.xuong_chinh ?? '',
        [k.tinhTrangKey]: KHONG_CON_SX,
        ...(cotGt ? { [cotGt]: x[ds.cotGiaTri] } : {}),
      }) as DataRow);
    return [...trongSx, ...ngoai];
  }, [ds, rows, columnKeys]);
  return (
    <DanhSachHexContext.Provider value={mo}>
      {children}
      <HexDetailModal
        isOpen={ds.open}
        onClose={() => setDs(prev => ({ ...prev, open: false }))}
        title={ds.title}
        projectName={null}
        rows={dsRows}
        columnKeys={columnKeys}
        currentUser={currentUser}
      />
    </DanhSachHexContext.Provider>
  );
}
