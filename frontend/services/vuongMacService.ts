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

export interface VuongMacLogEntry {
  id: number;
  vuongMacId: number | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  category: FiveMCategory | null;
  contentBefore: string | null;
  contentAfter: string | null;
  detail?: string | null; // mô tả thêm: "Đánh dấu đã xử lý: ..." / "Cần thêm thời gian ..."
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

export const fetchVuongMacList = async (hexes: string[]): Promise<Record<string, VuongMacItem[]>> => {
  try {
    if (hexes.length === 0) return {};
    const r = await fetch('/api/vuong-mac/list', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ hexes }),
    });
    if (!r.ok) throw new Error('fetch failed');
    const data: Record<string, VuongMacItem[]> = await r.json();
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