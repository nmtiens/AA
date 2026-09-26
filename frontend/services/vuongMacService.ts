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

export interface VuongMacItem {
  id: number;
  category: FiveMCategory;
  content: string;
  isResolved: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface VuongMacLogEntry {
  id: number;
  vuongMacId: number | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  category: FiveMCategory | null;
  contentBefore: string | null;
  contentAfter: string | null;
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
    return await r.json();
  } catch (e) {
    console.error('fetchVuongMacList error:', e);
    return {};
  }
};

export const createVuongMac = async (
  hex: string, category: FiveMCategory, content: string
): Promise<VuongMacItem | null> => {
  try {
    const r = await fetch('/api/vuong-mac', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ hex, category, content }),
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
  id: number, patch: Partial<{ category: FiveMCategory; content: string; isResolved: boolean }>
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