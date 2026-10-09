import { getToken } from './userService';

// ============================================================================
// API vướng mắc sản xuất (5M) — dùng chung cho app điện thoại (/m/) và web.
// Quy trình: open (mới) -> doing (đang xử lý) -> done (đã xử lý, chờ xác nhận) -> closed (đã đóng).
// isResolved = status là done hoặc closed (giữ cho các màn hình cũ).
// ============================================================================

export const FIVE_M_CATEGORIES = ['man', 'machine', 'material', 'method', 'measurement'] as const;
export type FiveMCategory = typeof FIVE_M_CATEGORIES[number];

export const FIVE_M_LABELS: Record<FiveMCategory, string> = {
  man: 'Man (Con người)',
  machine: 'Machine (Máy móc)',
  material: 'Material (Nguyên vật liệu)',
  method: 'Method (Phương pháp)',
  measurement: 'Measurement (Đo lường)',
};

export const VM_STATUSES = ['open', 'doing', 'done', 'closed'] as const;
export type VmStatus = typeof VM_STATUSES[number];
export const VM_PRIORITIES = ['normal', 'high', 'urgent'] as const;
export type VmPriority = typeof VM_PRIORITIES[number];

/** Quyền của người đang đăng nhập trên 1 vướng mắc (server tính) */
export interface VmPerms { edit: boolean; work: boolean; close: boolean; delete: boolean }

// Một lần "Cần thêm thời gian"
export interface VuongMacExtension {
  id: number;
  content: string;
  bot: string;          // BOT mới
  oldBot?: string | null; // BOT trước đó
  note?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface VuongMacItem {
  id: number;
  hex: string;
  category: FiveMCategory;
  content: string;
  isResolved: boolean;
  status: VmStatus;
  priority: VmPriority;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  handler?: string | null; // người xử lý (họ tên)
  bot?: string | null;
  solution?: string | null;     // giải pháp
  note?: string | null;         // ghi chú
  resolvedNote?: string | null; // nội dung đã xử lý
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  acceptedAt?: string | null;   // lúc nhận xử lý
  acceptedBy?: string | null;
  closedAt?: string | null;     // lúc người báo xác nhận đóng
  closedBy?: string | null;
  escalatedAt?: string | null;  // đã báo quản lý vì quá hạn lâu
  extensions?: VuongMacExtension[]; // lịch sử xin thêm thời gian
  photos?: number[];                 // id các ảnh đính kèm
  createdDepartment?: string | null; // phòng ban của người tạo
  /** Công đoạn (BOP) và khu vực SX LÚC BÁO */
  stage?: string | null;
  xuong?: string | null;
  congTrinh?: string | null;
  maCongTrinh?: string | null;
  hangMuc?: string | null;
  /** Thông tin sản xuất HIỆN TẠI của hạng mục (chỉ có khi API nối bảng sản xuất) */
  bop?: string | null;
  tinhTrang?: string | null;
  tinhTrangIpo?: string | null;
  pc?: string | null;
  pm?: string | null;
  /** Hạn nhập kho của hạng mục (KH tuần -> KH tháng), YYYY-MM-DD */
  deadline?: string | null;
  ngayCanGiao?: string | null;
  perms?: VmPerms;
  canModify?: boolean; // = perms.edit (cũ)
}
/** Tên cũ — danh sách và chi tiết giờ dùng chung 1 kiểu */
export type VuongMacRow = VuongMacItem;

export interface VuongMacExtra {
  handler: string;
  bot: string;
  solution: string;
  note: string;
  priority?: VmPriority;
}

export interface VuongMacExtendInput {
  content: string;
  bot: string;
  note?: string;
}

// Bản chụp thông tin vướng mắc tại thời điểm ghi log (dùng để xem chi tiết vướng mắc đã xóa)
export interface VuongMacSnapshot {
  handler?: string | null;
  bot?: string | null;
  solution?: string | null;
  note?: string | null;
  department?: string | null;
  createdDepartment?: string | null; // phòng khi backend đặt tên khác
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface VuongMacLogEntry {
  id: number;
  vuongMacId: number | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS' | 'COMMENT';
  category: FiveMCategory | null;
  contentBefore: string | null;
  contentAfter: string | null;
  detail?: string | null; // mô tả thêm: "Đánh dấu đã xử lý: ..." / "Cần thêm thời gian ..." / "Nhận xử lý"
  snapshot?: VuongMacSnapshot | string | null; // object hoặc chuỗi JSON (tùy driver/ORM)
  actor: string;
  actedAt: string;
}

// Mã lỗi khi chưa đăng nhập / token hết hạn — trang mobile dựa vào đây để hiện nút đăng nhập
export const UNAUTHORIZED = 'UNAUTHORIZED';

const authHeaders = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Gọi API, ném lỗi kèm LÝ DO từ server (hết phiên -> UNAUTHORIZED) để màn hình báo đúng nguyên nhân
async function callJson<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  } catch {
    throw new Error('Không kết nối được máy chủ, kiểm tra mạng rồi thử lại');
  }
  if (r.status === 401) throw new Error(UNAUTHORIZED);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.success === false) {
    if (r.status === 413) throw new Error('Dữ liệu gửi lên quá lớn');
    throw new Error(d.message || d.error || `Lỗi ${r.status}`);
  }
  return d as T;
}

// Vướng mắc đang mở gộp theo công trình (Báo cáo tiến độ công trình). Khớp theo mã công trình trước, tên chuẩn sau.
export interface VmByProjectRow { ma: string; ten: string; open: number; overdue: number }
export const fetchVuongMacByProject = async (): Promise<VmByProjectRow[]> => {
  try {
    const r = await fetch('/api/vuong-mac/by-project', { headers: authHeaders() });
    if (!r.ok) return [];
    return (await r.json()) as VmByProjectRow[];
  } catch {
    return [];
  }
};

const VUONG_MAC_LIST_BATCH = 2000;

export const fetchVuongMacList = async (hexes: string[]): Promise<Record<string, VuongMacItem[]>> => {
  try {
    if (hexes.length === 0) return {};
    // Server nhận tối đa 2000 hex/lần -> chia lô (trước đây quá 2000 thì lỗi 400 và trả rỗng âm thầm)
    const unique = [...new Set(hexes)];
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += VUONG_MAC_LIST_BATCH) chunks.push(unique.slice(i, i + VUONG_MAC_LIST_BATCH));
    const parts = await Promise.all(chunks.map(async chunk => {
      const r = await fetch('/api/vuong-mac/list', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ hexes: chunk }),
      });
      if (!r.ok) throw new Error('fetch failed');
      return (await r.json()) as Record<string, VuongMacItem[]>;
    }));
    const data: Record<string, VuongMacItem[]> = Object.assign({}, ...parts);
    // Mới nhất lên đầu: nơi hiển thị "nội dung mới nhất" (vd. ô trong bảng) lấy phần tử đầu tiên.
    Object.values(data).forEach(list =>
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id)
    );
    return data;
  } catch (e) {
    console.error('fetchVuongMacList error:', e);
    return {};
  }
};

/** 1 vướng mắc theo id (mở từ thông báo / đường dẫn chia sẻ) */
export const fetchVuongMacItem = async (id: number): Promise<VuongMacItem> =>
  (await callJson<{ data: VuongMacItem }>(`/api/vuong-mac/item/${id}`)).data;

export const createVuongMac = async (
  hex: string,
  category: FiveMCategory,
  content: string,
  extra?: VuongMacExtra
): Promise<VuongMacItem | null> => {
  try {
    return await createVuongMacStrict(hex, category, content, extra);
  } catch (e) {
    console.error('createVuongMac error:', e);
    return null;
  }
};

export const createVuongMacStrict = async (
  hex: string,
  category: FiveMCategory,
  content: string,
  extra?: VuongMacExtra
): Promise<VuongMacItem> =>
  (await callJson<{ data: VuongMacItem }>('/api/vuong-mac', {
    method: 'POST', body: JSON.stringify({ hex, category, content, ...extra }),
  })).data;

export type VuongMacPatch = Partial<{
  category: FiveMCategory;
  content: string;
  /** Cũ: true = báo xong (done), false = mở lại */
  isResolved: boolean;
  /** Mới: chuyển trạng thái theo quy trình; statusNote bắt buộc khi báo xong / mở lại */
  status: VmStatus;
  statusNote: string;
  priority: VmPriority;
  handler: string;
  bot: string;
  solution: string;
  note: string;
  resolvedNote: string; // bắt buộc khi isResolved = true
}>;

export const updateVuongMac = async (id: number, patch: VuongMacPatch): Promise<VuongMacItem | null> => {
  try {
    return await updateVuongMacStrict(id, patch);
  } catch (e) {
    console.error('updateVuongMac error:', e);
    return null;
  }
};

export const updateVuongMacStrict = async (id: number, patch: VuongMacPatch): Promise<VuongMacItem> =>
  (await callJson<{ data: VuongMacItem }>(`/api/vuong-mac/${id}`, { method: 'PUT', body: JSON.stringify(patch) })).data;

/** Chuyển trạng thái: nhận xử lý (doing), báo xong (done, cần note), xác nhận đóng (closed), mở lại (doing/open, cần note) */
export const changeVuongMacStatus = (id: number, status: VmStatus, statusNote?: string) =>
  updateVuongMacStrict(id, { status, statusNote: statusNote ?? '' });

/** Bình luận / trao đổi trong 1 vướng mắc (ghi vào nhật ký, báo cho người tạo + người xử lý + người được tag) */
export const commentVuongMac = async (id: number, content: string) =>
  (await callJson<{ data: { id: number; actedAt: string; actor: string; content: string } }>(
    `/api/vuong-mac/${id}/comment`, { method: 'POST', body: JSON.stringify({ content }) })).data;

// "Cần thêm thời gian": ghi nhận nội dung + BOT mới + ghi chú
export const extendVuongMac = async (id: number, input: VuongMacExtendInput): Promise<VuongMacItem | null> => {
  try {
    return await extendVuongMacStrict(id, input);
  } catch (e) {
    console.error('extendVuongMac error:', e);
    return null;
  }
};
export const extendVuongMacStrict = async (id: number, input: VuongMacExtendInput): Promise<VuongMacItem> =>
  (await callJson<{ data: VuongMacItem }>(`/api/vuong-mac/${id}/extend`, { method: 'POST', body: JSON.stringify(input) })).data;

export const deleteVuongMac = async (id: number): Promise<boolean> => {
  try {
    const r = await fetch(`/api/vuong-mac/${id}`, { method: 'DELETE', headers: authHeaders() });
    return r.ok;
  } catch (e) {
    console.error('deleteVuongMac error:', e);
    return false;
  }
};
export const deleteVuongMacStrict = async (id: number): Promise<void> => {
  await callJson(`/api/vuong-mac/${id}`, { method: 'DELETE' });
};

/** Nhật ký theo HEX; truyền id để chỉ lấy của 1 vướng mắc */
export const fetchVuongMacLog = async (hex: string, id?: number): Promise<VuongMacLogEntry[]> => {
  try {
    const qs = id ? `?id=${id}` : '';
    const r = await fetch(`/api/vuong-mac/log/${encodeURIComponent(hex)}${qs}`, { headers: authHeaders() });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) {
    console.error('fetchVuongMacLog error:', e);
    return [];
  }
};

export interface VuongMacQuery {
  /** Cũ: open = chưa xong (open + doing), resolved = done + closed */
  status?: 'open' | 'resolved' | 'all';
  /** Mới: các trạng thái cụ thể (ưu tiên hơn status) */
  st?: VmStatus[] | '';
  category?: FiveMCategory | '';
  q?: string;
  page?: number;
  pageSize?: number;
  /** 1 = tôi tạo hoặc tôi xử lý; assignee = tôi xử lý; reporter = tôi tạo; confirm = tôi tạo, chờ tôi xác nhận */
  mine?: '1' | 'assignee' | 'reporter' | 'confirm' | '';
  /** Theo hạn BOT (chỉ vướng mắc chưa xong): quá hạn / còn ≤ 24 giờ */
  due?: 'overdue' | 'soon' | '';
  /** bot = hạn BOT gần nhất lên đầu; oldest = cũ nhất trước; priority = ưu tiên trước; mặc định mới tạo lên đầu */
  sort?: 'bot' | 'oldest' | 'priority' | '';
  /** Ngày tạo từ / đến (YYYY-MM-DD, giờ Việt Nam) */
  from?: string;
  to?: string;
  xuong?: string;
  congTrinh?: string;
  handler?: string;
  stage?: string;
  priority?: VmPriority | '';
}

export interface VuongMacPage { data: VuongMacItem[]; total: number; page: number; pageSize: number; workflow: boolean }

export const fetchVuongMacAll = async (p: VuongMacQuery): Promise<{ data: VuongMacItem[]; total: number }> => {
  try {
    return await fetchVuongMacAllStrict(p);
  } catch (e) {
    console.error('fetchVuongMacAll error:', e);
    return { data: [], total: 0 };
  }
};

// Bản ném lỗi cho trang mobile: phân biệt "lỗi mạng/quyền" với "không có dữ liệu".
export const fetchVuongMacAllStrict = async (p: VuongMacQuery): Promise<VuongMacPage> => {
  if (!getToken()) throw new Error(UNAUTHORIZED); // chưa có token thì khỏi gọi API
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v === undefined || v === '' || v === null) return;
    if (Array.isArray(v)) { if (v.length) qs.set(k, v.join(',')); return; }
    qs.set(k, String(v));
  });
  return callJson<VuongMacPage>(`/api/vuong-mac/all?${qs}`);
};

// ---------------------------------------------------------------------------
// Tìm HEX (form Thêm, tab Tra cứu)
// ---------------------------------------------------------------------------
export interface HexHit {
  hex: string;
  congTrinh?: string | null;
  maCongTrinh?: string | null;
  maNhaMay?: string | null;
  hangMuc?: string | null;
  xuong?: string | null;
  pc?: string | null;
  pm?: string | null;
  bop?: string | null;
  stage?: string | null;
  tinhTrang?: string | null;
  tinhTrangIpo?: string | null;
  phanLoai?: string | null;
  triGia?: number | string | null;
  thanhTienPhieu?: number | string | null;
  thanhTienKho?: number | string | null;
  /** Hạn nhập kho của hạng mục (KH tuần -> KH tháng), YYYY-MM-DD */
  deadline?: string | null;
  ngayCanGiao?: string | null;
}

export const fetchHexSearch = async (q: string): Promise<HexHit[]> => {
  try {
    const r = await fetch(`/api/vuong-mac/hex-search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) {
    console.error('fetchHexSearch error:', e);
    return [];
  }
};

// Số liệu màn "Tổng quan" của app mobile
export interface VuongMacStats {
  workflow: boolean;
  /** Chưa xong (open + doing) */
  open: number;
  doing: number;
  /** Đã xử lý, chờ người báo xác nhận */
  waiting: number;
  overdue: number;
  soon: number;
  extended: number;
  noBot: number;
  urgent: number;
  escalated: number;
  mine: { open: number; overdue: number; soon: number; doing: number; waiting: number; reported: number };
  byCategory: Partial<Record<FiveMCategory, number>>;
  byStatus: Partial<Record<VmStatus, number>>;
  createdToday: number;
  resolvedToday: number;
  closedToday: number;
  topProjects: { name: string; open: number; overdue: number }[];
  byXuong: { name: string; open: number; overdue: number }[];
  fullName: string | null;
  generatedAt: string;
}

export const fetchVuongMacStats = async (): Promise<VuongMacStats> => {
  if (!getToken()) throw new Error(UNAUTHORIZED);
  return callJson<VuongMacStats>('/api/vuong-mac/stats');
};

// Bảng điều khiển cho quản lý (desktop)
export interface VmGroupStat {
  name: string; open: number; doing: number; waiting: number; overdue: number; soon: number;
  created: number; done: number; closed: number; avgDoneHours: number | null;
}
export interface VuongMacDashboard {
  workflow: boolean;
  period: { from: string; to: string };
  generatedAt: string;
  totals: {
    open: number; doing: number; waiting: number; overdue: number; soon: number; noBot: number; escalated: number; urgent: number;
    extended: number; created: number; done: number; closed: number;
    avgAcceptHours: number | null; avgDoneHours: number | null; avgCloseHours: number | null;
  };
  byCategory: VmGroupStat[];
  byXuong: VmGroupStat[];
  byStage: VmGroupStat[];
  byHandler: VmGroupStat[];
  byProject: VmGroupStat[];
  aging: { d1: number; d3: number; d7: number; d14: number; more: number };
  weekly: { start: string; created: number; done: number; closed: number }[];
  oldest: {
    id: number; hex: string; content: string; handler: string | null; status: VmStatus; priority: VmPriority;
    createdAt: string; bot: string | null; due: 'overdue' | 'soon' | 'ok' | 'none'; xuong: string; project: string;
    ageHours: number; escalated: boolean;
  }[];
}
export const fetchVuongMacDashboard = async (p: { from?: string; to?: string; xuong?: string }): Promise<VuongMacDashboard> => {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => v && qs.set(k, v));
  return callJson<VuongMacDashboard>(`/api/vuong-mac/dashboard?${qs}`);
};

// Danh sách họ tên người xử lý (users.full_name). Gọi 1 lần mỗi phiên rồi dùng lại;
// lỗi thì lần sau gọi lại.
let handlerNamesPromise: Promise<string[]> | null = null;
export const fetchHandlerNames = (): Promise<string[]> => {
  if (!handlerNamesPromise) {
    handlerNamesPromise = (async () => {
      const r = await fetch('/api/vuong-mac/handlers', { headers: authHeaders() });
      if (!r.ok) throw new Error(`Lỗi ${r.status}`);
      const d = await r.json();
      return Array.isArray(d) ? d.map(String) : [];
    })();
    handlerNamesPromise.catch(() => { handlerNamesPromise = null; });
  }
  return handlerNamesPromise;
};

/** Người xử lý kèm phòng ban (gợi ý giao việc) */
export interface VmPerson { name: string; department: string }
let peoplePromise: Promise<VmPerson[]> | null = null;
export const fetchPeople = (): Promise<VmPerson[]> => {
  if (!peoplePromise) {
    peoplePromise = (async () => {
      const r = await fetch('/api/vuong-mac/people', { headers: authHeaders() });
      if (!r.ok) throw new Error(`Lỗi ${r.status}`);
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    })();
    peoplePromise.catch(() => { peoplePromise = null; });
  }
  return peoplePromise;
};

// ---------------------------------------------------------------------------
// Ảnh đính kèm
// ---------------------------------------------------------------------------

// Tải 1 ảnh (đã nén JPEG) lên. Mỗi request 1 ảnh để không vượt giới hạn body của Vercel.
export const uploadVuongMacPhoto = async (id: number, blob: Blob): Promise<{ id: number }> => {
  const token = getToken();
  const r = await fetch(`/api/vuong-mac/${id}/photos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: blob,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) throw new Error(d.message || `Lỗi ${r.status}`);
  return d.data;
};

export const deleteVuongMacPhoto = async (photoId: number): Promise<void> => {
  const r = await fetch(`/api/vuong-mac/photo/${photoId}`, { method: 'DELETE', headers: authHeaders() });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || `Lỗi ${r.status}`);
  }
  dropCachedPhoto(photoId);
};

// Ảnh cần token nên không dùng <img src="/api/..."> trực tiếp được:
// fetch kèm token -> blob -> objectURL, có cache theo id.
// Mỗi objectURL giữ nguyên blob ảnh trong RAM tới khi bị revoke, nên cache có giới hạn:
// vượt PHOTO_CACHE_MAX thì bỏ ảnh dùng lâu nhất và revoke URL của nó (tránh đầy bộ nhớ
// trên điện thoại khi lướt nhiều vướng mắc có ảnh).
const PHOTO_CACHE_MAX = 60;
const photoUrlCache = new Map<number, Promise<string>>();

const dropCachedPhoto = (photoId: number) => {
  const p = photoUrlCache.get(photoId);
  if (!p) return;
  photoUrlCache.delete(photoId);
  p.then(url => URL.revokeObjectURL(url)).catch(() => {});
};

export const fetchVuongMacPhotoUrl = (photoId: number): Promise<string> => {
  let p = photoUrlCache.get(photoId);
  if (p) {
    // Đưa lên cuối Map = vừa dùng gần nhất
    photoUrlCache.delete(photoId);
    photoUrlCache.set(photoId, p);
    return p;
  }
  p = (async () => {
    const token = getToken();
    const r = await fetch(`/api/vuong-mac/photo/${photoId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error(`Lỗi ${r.status}`);
    return URL.createObjectURL(await r.blob());
  })();
  photoUrlCache.set(photoId, p);
  p.catch(() => { if (photoUrlCache.get(photoId) === p) photoUrlCache.delete(photoId); });
  while (photoUrlCache.size > PHOTO_CACHE_MAX) {
    dropCachedPhoto(photoUrlCache.keys().next().value as number);
  }
  return p;
};
