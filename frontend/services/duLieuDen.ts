// "Dữ liệu đến dd/mm" ở thanh bên: ngày cũ nhất của các nguồn chính, lấy từ /api/data-update-log.
// Chỉ gọi khi mở app và khi bấm Làm mới, không polling (DB Layerbase cần ngủ).

/** 6 thẻ Tổng quan + bảng sản xuất; nguồn nhập tay không tính */
export const NGUON_CHINH = ['dht', 'tkbv_full', 'pthsp_full', 'nhap_kho', 'xuat_kho', 'ton_kho', 'production_status_app'];

/** Cũ hơn số ngày này thì tô đỏ */
export const NGUONG_CU_NGAY = 2;

export interface DongNhatKy {
  table: string;
  label: string;
  dataAsOfDate: string | null;
  isManual: boolean;
}

export interface DuLieuDen {
  /** YYYY-MM-DD, ngày cũ nhất của các nguồn chính */
  ngay: string;
  /** dd/mm */
  nhan: string;
  cu: boolean;
  /** Mỗi dòng 1 nguồn, cũ nhất lên đầu */
  chiTiet: string;
}

const soNgay = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export const tomTatDuLieuDen = (rows: DongNhatKy[], homNay: string): DuLieuDen | null => {
  const nguon = rows
    .filter(r => !r.isManual && NGUON_CHINH.includes(r.table) && /^\d{4}-\d{2}-\d{2}/.test(r.dataAsOfDate ?? ''))
    .map(r => ({ ten: r.label, ngay: (r.dataAsOfDate as string).slice(0, 10) }))
    .sort((a, b) => a.ngay.localeCompare(b.ngay));
  if (!nguon.length) return null;
  const ngay = nguon[0].ngay;
  return {
    ngay,
    nhan: ddmm(ngay),
    cu: soNgay(homNay) - soNgay(ngay) > NGUONG_CU_NGAY,
    chiTiet: nguon.map(n => `${n.ten}: ${ddmm(n.ngay)}`).join('\n'),
  };
};

/** YYYY-MM-DD theo giờ VN */
export const homNayVN = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

export const layDuLieuDen = async (): Promise<DuLieuDen | null> => {
  const r = await fetch('/api/data-update-log');
  if (!r.ok) throw new Error(`data-update-log ${r.status}`);
  return tomTatDuLieuDen((await r.json()) as DongNhatKy[], homNayVN());
};
