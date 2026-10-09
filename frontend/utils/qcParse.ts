// ============================================================================
// Parse cột "Tổng hợp thông tin QC" của bảng sản xuất (cùng quy tắc với backend routes/data.ts):
// mỗi lần kiểm là 1 dòng bắt đầu bằng "dd/mm/yyyy:  # QC: … # Công đoạn: … # Trạng thái: … # SL Kiểm: …
// # SL Đạt: … # TL Đạt: … # SL Lỗi: … # TL Lỗi: … # Ghi chú: … # Link Ảnh: …" (link ảnh có thể xuống dòng).
// ============================================================================
export interface QcEntry {
  date: string;      // dd/mm/yyyy
  qc: string;        // người kiểm
  stage: string;     // "P16 - Lắp Ráp Tinh Chỉnh"
  status: string;    // approved | rejected | flagged | pending | submitted | unknown
  checked: number; pass: number; fail: number;
  note: string;
  photos: string[];  // link ảnh
}

const num = (v: string) => { const n = Number(String(v).replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const normStatus = (raw: string, fail: number): string => {
  const s = raw.trim().toLowerCase();
  if (!s) return fail > 0 ? 'unknown' : 'approved';
  if (s === 'verified') return 'approved';
  return s;
};

export const parseQcEntries = (text: unknown): QcEntry[] => {
  const s = String(text ?? '');
  if (!s.trim()) return [];
  const parts = s.split(/\n(?=\d{2}\/\d{2}\/\d{4}:\s*#)/).map(p => p.trim()).filter(Boolean);
  const out: QcEntry[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d{2}\/\d{2}\/\d{4}):\s*#([\s\S]*)$/);
    if (!m) continue;
    const photos = p.match(/https?:\/\/\S+/g) ?? [];
    const fields = m[2].split('#').map(x => x.trim());
    const get = (label: string) => {
      const f = fields.find(x => x.toUpperCase().startsWith(label.toUpperCase()));
      return f ? f.slice(label.length).replace(/^:/, '').trim() : '';
    };
    const fail = num(get('SL Lỗi'));
    out.push({
      date: m[1], qc: get('QC'), stage: get('Công đoạn'), status: normStatus(get('Trạng thái'), fail),
      checked: num(get('SL Kiểm')), pass: num(get('SL Đạt')), fail,
      note: get('Ghi chú').replace(/https?:\/\/\S+/g, '').trim(), photos,
    });
  }
  // Bản ghi trùng (cùng ngày / công đoạn / QC / số lượng, 1 dòng có trạng thái 1 dòng trống): giữ dòng có trạng thái
  const seen = new Map<string, QcEntry>();
  for (const e of out) {
    const k = `${e.date}|${e.stage}|${e.qc}|${e.checked}|${e.fail}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, e);
    else if (prev.status === 'approved' && e.status !== 'approved') seen.set(k, { ...e, photos: [...new Set([...prev.photos, ...e.photos])] });
    else prev.photos = [...new Set([...prev.photos, ...e.photos])];
  }
  // Mới nhất lên trước (dd/mm/yyyy -> yyyymmdd)
  const key = (d: string) => d.slice(6, 10) + d.slice(3, 5) + d.slice(0, 2);
  return [...seen.values()].sort((a, b) => key(b.date).localeCompare(key(a.date)));
};
