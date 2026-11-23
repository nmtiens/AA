// ============================================================================
// TỰ LÀM MỚI KHI CÓ DỮ LIỆU MỚI (người dùng 23/11/2026: "mỗi lần có dữ liệu thì tự refresh")
// App hỏi /api/check-versions (App.tsx) rồi đưa kết quả vào nhanMoc(); nhóm dữ liệu nào đổi thì báo cho các trang đang
// nghe nhóm đó (hooks/useMocBang) gọi lại API của mình — giữ nguyên bộ lọc, vị trí cuộn, cửa sổ đang mở.
// Một lần nạp thường đổi nhiều bảng cách nhau vài giây => gom GOM_MS rồi mới báo 1 lần.
// ============================================================================

/** 12 bảng của table_versions (khoá như máy chủ trả) + các nhóm của server/mocBang.ts */
export type NhomDuLieu =
  | 'production' | 'material' | 'khsx' | 'order' | 'inventory' | 'tkbv' | 'pthsp' | 'analysis' | 'yearlyPlan' | 'export' | 'attendance' | 'stock'
  | 'bot' | 'botCongDoan' | 'khnk' | 'bom' | 'tonKhoVt' | 'tieuHao' | 'nhanVt' | 'banVt' | 'nhapKhoSap' | 'hoSo' | 'vuongMac';

export const TEN_NHOM: Record<NhomDuLieu, string> = {
  production: 'Sản xuất', material: 'Vật tư', khsx: 'Kế hoạch SX', order: 'Đơn hàng tổng', inventory: 'Nhập kho', tkbv: 'TKBV', pthsp: 'PTHSP',
  analysis: 'Phân tích KH-TH', yearlyPlan: 'Kế hoạch năm', export: 'Xuất kho', attendance: 'Điểm danh', stock: 'Tồn kho',
  bot: 'BOT / file công trình', botCongDoan: 'BOT công đoạn', khnk: 'Bảng KHNK', bom: 'BOM', tonKhoVt: 'Tồn kho vật tư', tieuHao: 'Tiêu hao vật tư', nhanVt: 'Nhận vật tư',
  banVt: 'Danh mục vật tư', nhapKhoSap: 'Nhập kho SAP', hoSo: 'Hồ sơ công trình', vuongMac: 'Vướng mắc',
};

/** Nguồn nạp hằng ngày mới hiện dòng báo; dữ liệu người dùng gõ / tool canh file đổi liên tục thì làm mới lặng lẽ */
export const NHOM_BAO: readonly NhomDuLieu[] = ['production', 'material', 'khsx', 'order', 'inventory', 'tkbv', 'pthsp', 'analysis', 'yearlyPlan',
  'export', 'attendance', 'stock', 'khnk', 'tonKhoVt', 'tieuHao', 'nhapKhoSap'];

/** Nhóm khác nhau giữa 2 lần hỏi. Chỉ tính nhóm CÓ ở cả hai lần: máy chủ lỗi phần nào thì không coi là dữ liệu đổi. */
export function nhomDoi(cu: Record<string, string>, moi: Record<string, string>): NhomDuLieu[] {
  return (Object.keys(TEN_NHOM) as NhomDuLieu[]).filter(k => cu[k] !== undefined && moi[k] !== undefined && cu[k] !== moi[k]);
}

/** Kết quả /api/check-versions => mốc phẳng theo nhóm */
export function phangMoc(v: Record<string, unknown>): Record<string, string> {
  const ra: Record<string, string> = {};
  const { _moc, ...bang } = v;
  for (const [k, x] of Object.entries({ ...bang, ...(_moc && typeof _moc === 'object' ? _moc : {}) })) if (x != null && k in TEN_NHOM) ra[k] = String(x);
  return ra;
}

const GOM_MS = 4000;   // dài hơn mọi bản nhớ ngắn (2–3 giây) của máy chủ
/** Sau khi có dữ liệu mới, các lời gọi API trong chừng này kèm x-du-lieu-moi để máy chủ không trả bản nhớ cũ */
const CAN_MOI_MS = 60_000;
let cu: Record<string, string> = {};
let cho = new Set<NhomDuLieu>();
let hen: ReturnType<typeof setTimeout> | null = null;
// Lượt tải đầu cũng xin số mới: mốc gốc đọc mới, số phải mới bằng mốc đó
let canMoiDen = Date.now() + 30_000;
const nghe = new Set<(nhom: ReadonlySet<NhomDuLieu>) => void>();

/** Đưa kết quả mới hỏi vào. Lần đầu (hoặc nhóm mới xuất hiện) chỉ ghi mốc. Trả các nhóm vừa đổi. */
export function nhanMoc(v: Record<string, unknown>): NhomDuLieu[] {
  const moi = phangMoc(v);
  const doi = nhomDoi(cu, moi);
  cu = { ...cu, ...moi };   // nhóm vắng mặt lần này (máy chủ lỗi) giữ mốc cũ
  if (!doi.length) return doi;
  canMoiDen = Date.now() + CAN_MOI_MS;
  doi.forEach(k => cho.add(k));
  if (hen === null) hen = setTimeout(() => {
    hen = null;
    const ds = cho; cho = new Set();
    nghe.forEach(f => { try { f(ds); } catch (e) { console.error('[moc-du-lieu]', e); } });
  }, GOM_MS);
  return doi;
}

export function theoDoiMocBang(f: (nhom: ReadonlySet<NhomDuLieu>) => void): () => void {
  nghe.add(f);
  return () => { nghe.delete(f); };
}

/** Đang trong lúc cần số mới (services/authFetch gắn tiêu đề) */
export const dangCanSoMoi = (): boolean => Date.now() < canMoiDen;

/**
 * Có nên hỏi máy chủ lúc này không. Tab ẩn: không. Vừa thao tác (< 15 phút): mỗi phút. Màn hình mở nhưng không ai chạm:
 * mỗi 3 phút, chỉ 6h–21h giờ VN — DB gói miễn phí phải được ngủ ban đêm (Layerbase).
 */
export const RANH_SAU_MS = 15 * 60_000;
const NHIP_RANH_MS = 3 * 60_000;
export function nenHoi(x: { hien: boolean; tuLucThaoTac: number; tuLucHoi: number; gioVN: number }): boolean {
  if (!x.hien) return false;
  if (x.tuLucThaoTac < RANH_SAU_MS) return true;
  return x.gioVN >= 6 && x.gioVN < 21 && x.tuLucHoi >= NHIP_RANH_MS - 5000;
}
export const gioVN = (d = new Date()): number => new Date(d.getTime() + 7 * 3600_000).getUTCHours();

/** CHỈ DÙNG TRONG TEST */
export function datLaiMoc() { cu = {}; cho = new Set(); if (hen) clearTimeout(hen); hen = null; canMoiDen = 0; nghe.clear(); }
