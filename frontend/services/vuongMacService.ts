import { getToken } from './userService';

export const FIVE_M_CATEGORIES = ['man', 'machine', 'material', 'method', 'measurement'] as const;
export type FiveMCategory = typeof FIVE_M_CATEGORIES[number];

export const FIVE_M_LABELS: Record<FiveMCategory, string> = {
  man: 'Man (Con người)',
  machine: 'Machine (Máy móc)',
  material: 'Material (Nguyên vật liệu)',
  method: 'Method (Phương pháp)',
  measurement: 'Measurement (Đo lường)',
};

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
  category: FiveMCategory;
  content: string;
  isResolved: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  handler?: string | null; // người xử lý
  bot?: string | null;
  solution?: string | null;     // giải pháp
  note?: string | null;         // ghi chú
  resolvedNote?: string | null; // nội dung đã xử lý
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  extensions?: VuongMacExtension[]; // lịch sử xin thêm thời gian
  photos?: number[];                 // [MỚI] id các ảnh đính kèm
  createdDepartment?: string | null; // phòng ban của người tạo
  canModify?: boolean;               // user hiện tại có được sửa/xóa/đánh dấu xử lý không (server tính)
}

export interface VuongMacExtra {
  handler: string;
  bot: string;
  solution: string;
  note: string;
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
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  category: FiveMCategory | null;
  contentBefore: string | null;
  contentAfter: string | null;
  detail?: string | null; // mô tả thêm: "Đánh dấu đã xử lý: ..." / "Cần thêm thời gian ..."
  snapshot?: VuongMacSnapshot | string | null; // object hoặc chuỗi JSON (tùy driver/ORM)
  actor: string;
  actedAt: string;
}

const authHeaders = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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
    // Modal chat tự sắp xếp lại cũ -> mới nên không bị ảnh hưởng.
    Object.values(data).forEach(list =>
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id)
    );
    return data;
  } catch (e) {
    console.error('fetchVuongMacList error:', e);
    return {};
  }
};

export const createVuongMac = async (
  hex: string,
  category: FiveMCategory,
  content: string,
  extra?: VuongMacExtra
): Promise<VuongMacItem | null> => {
  try {
    const r = await fetch('/api/vuong-mac', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ hex, category, content, ...extra }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.success ? d.data : null;
  } catch (e) {
    console.error('createVuongMac error:', e);
    return null;
  }
};

// [MỚI] Bản ném lỗi (kèm thông báo của server) cho form mobile
export const createVuongMacStrict = async (
  hex: string,
  category: FiveMCategory,
  content: string,
  extra?: VuongMacExtra
): Promise<VuongMacItem> => {
  const r = await fetch('/api/vuong-mac', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ hex, category, content, ...extra }),
  });
  if (r.status === 401) throw new Error(UNAUTHORIZED);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) throw new Error(d.message || d.error || `Lỗi ${r.status}`);
  return d.data as VuongMacItem;
};

export const updateVuongMac = async (
  id: number,
  patch: Partial<{
    category: FiveMCategory;
    content: string;
    isResolved: boolean;
    handler: string;
    bot: string;
    solution: string;
    note: string;
    resolvedNote: string; // bắt buộc khi isResolved = true
  }>
): Promise<VuongMacItem | null> => {
  try {
    const r = await fetch(`/api/vuong-mac/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.success ? d.data : null;
  } catch (e) {
    console.error('updateVuongMac error:', e);
    return null;
  }
};

// Như updateVuongMac nhưng ném lỗi kèm LÝ DO từ server (hết phiên -> UNAUTHORIZED,
// không có quyền, dữ liệu sai, lỗi hệ thống...) để màn hình báo đúng nguyên nhân.
export const updateVuongMacStrict = async (
  id: number,
  patch: Parameters<typeof updateVuongMac>[1]
): Promise<VuongMacItem> => {
  let r: Response;
  try {
    r = await fetch(`/api/vuong-mac/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
  } catch {
    throw new Error('Không kết nối được máy chủ, kiểm tra mạng rồi thử lại');
  }
  if (r.status === 401) throw new Error(UNAUTHORIZED);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) {
    if (r.status === 413) throw new Error('Dữ liệu gửi lên quá lớn');
    throw new Error(d.message || d.error || `Không lưu được (lỗi ${r.status})`);
  }
  return d.data as VuongMacItem;
};

// "Cần thêm thời gian": ghi nhận nội dung + BOT mới + ghi chú
export const extendVuongMac = async (
  id: number,
  input: VuongMacExtendInput
): Promise<VuongMacItem | null> => {
  try {
    const r = await fetch(`/api/vuong-mac/${id}/extend`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.success ? d.data : null;
  } catch (e) {
    console.error('extendVuongMac error:', e);
    return null;
  }
};

export const deleteVuongMac = async (id: number): Promise<boolean> => {
  try {
    const r = await fetch(`/api/vuong-mac/${id}`, { method: 'DELETE', headers: authHeaders() });
    return r.ok;
  } catch (e) {
    console.error('deleteVuongMac error:', e);
    return false;
  }
};

export const fetchVuongMacLog = async (hex: string): Promise<VuongMacLogEntry[]> => {
  try {
    const r = await fetch(`/api/vuong-mac/log/${encodeURIComponent(hex)}`, { headers: authHeaders() });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) {
    console.error('fetchVuongMacLog error:', e);
    return [];
  }
};

export interface VuongMacRow extends VuongMacItem {
  hex: string; congTrinh?: string | null; hangMuc?: string | null; xuong?: string | null;
}

export const fetchVuongMacAll = async (p: {
  status?: 'open' | 'resolved' | 'all'; category?: FiveMCategory | ''; q?: string; page?: number;
}): Promise<{ data: VuongMacRow[]; total: number }> => {
  try {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)));
    const r = await fetch(`/api/vuong-mac/all?${qs}`, { headers: authHeaders() });
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchVuongMacAll error:', e);
    return { data: [], total: 0 };
  }
};

// Mã lỗi khi chưa đăng nhập / token hết hạn — trang mobile dựa vào đây để hiện nút đăng nhập
export const UNAUTHORIZED = 'UNAUTHORIZED';

export interface VuongMacQuery {
  status?: 'open' | 'resolved' | 'all';
  category?: FiveMCategory | '';
  q?: string;
  page?: number;
  /** '1' = việc của tôi (tôi là người xử lý hoặc người tạo) */
  mine?: '1' | '';
  /** Theo hạn BOT (chỉ vướng mắc chưa xử lý): quá hạn / còn ≤ 24 giờ */
  due?: 'overdue' | 'soon' | '';
  /** 'bot' = hạn BOT gần nhất lên đầu; mặc định mới tạo lên đầu */
  sort?: 'bot' | '';
  /** Ngày tạo từ / đến (YYYY-MM-DD, giờ Việt Nam) */
  from?: string;
  to?: string;
}

// Bản ném lỗi cho trang mobile: phân biệt "lỗi mạng/quyền" với "không có dữ liệu".
export const fetchVuongMacAllStrict = async (p: VuongMacQuery): Promise<{ data: VuongMacRow[]; total: number }> => {
  if (!getToken()) throw new Error(UNAUTHORIZED); // chưa có token thì khỏi gọi API
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)));
  const r = await fetch(`/api/vuong-mac/all?${qs}`, { headers: authHeaders() });
  if (r.status === 401) throw new Error(UNAUTHORIZED);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || `Lỗi ${r.status}`);
  return d;
};

// ---------------------------------------------------------------------------
// [MỚI] Tìm HEX (dùng cho form Thêm trên mobile)
// ---------------------------------------------------------------------------
export interface HexHit {
  hex: string;
  congTrinh?: string | null;
  hangMuc?: string | null;
  xuong?: string | null;
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
  open: number;
  overdue: number;
  soon: number;
  extended: number;
  noBot: number;
  mine: { open: number; overdue: number; soon: number };
  byCategory: Partial<Record<FiveMCategory, number>>;
  createdToday: number;
  resolvedToday: number;
  topProjects: { name: string; open: number; overdue: number }[];
  fullName: string | null;
  generatedAt: string;
}

export const fetchVuongMacStats = async (): Promise<VuongMacStats> => {
  if (!getToken()) throw new Error(UNAUTHORIZED);
  const r = await fetch('/api/vuong-mac/stats', { headers: authHeaders() });
  if (r.status === 401) throw new Error(UNAUTHORIZED);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || `Lỗi ${r.status}`);
  return d;
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

// ---------------------------------------------------------------------------
// [MỚI] Ảnh đính kèm
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