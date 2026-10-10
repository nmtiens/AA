// ============================================================================
// Parse cột "Tổng hợp thông tin QC" của bảng sản xuất (thuần, không phụ thuộc DB/Express — có test ở test/qc.test.ts).
// Mỗi lần kiểm bắt đầu bằng "dd/mm/yyyy:  # QC: … # Công đoạn: … # Trạng thái: … # SL Kiểm: … # SL Đạt: … # SL Lỗi: …".
// Frontend có bản tương đương ở frontend/utils/qcParse.ts — sửa quy tắc thì sửa cả hai.
// ============================================================================
export interface QcEntry {
  date: string; qc: string; stage: string; status: string;
  checked: number; pass: number; fail: number; note: string; photos: number;
}
export interface QcSummary {
  n: number;                 // số lần kiểm
  checked: number; pass: number; fail: number;
  bad: number;               // số lần kiểm có lỗi (SL lỗi > 0) hoặc bị từ chối / gắn cờ
  last: { date: string; stage: string; status: string; fail: number } | null; // lần kiểm gần nhất
}

const qcNum = (v: string) => { const n = Number(String(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
// Chuẩn hoá trạng thái QC: approved / APPROVED / verified → 'approved'; rỗng → 'approved' nếu không lỗi, ngược lại 'unknown'
const qcStatus = (raw: string, fail: number): string => {
  const s = raw.trim().toLowerCase();
  if (!s) return fail > 0 ? 'unknown' : 'approved';
  if (s === 'verified') return 'approved';
  return s;
};
const QC_BAD_STATUS = new Set(['rejected', 'flagged']);

/** Parse cột "Tổng hợp thông tin QC": mỗi lần kiểm bắt đầu bằng "dd/mm/yyyy:  # QC: … # Công đoạn: … # Trạng thái: …". */
export const parseQcEntries = (text: unknown): QcEntry[] => {
  const s = String(text ?? '');
  if (!s.trim()) return [];
  const parts = s.split(/\n(?=\d{2}\/\d{2}\/\d{4}:\s*#)/).map(p => p.trim()).filter(Boolean);
  const out: QcEntry[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d{2}\/\d{2}\/\d{4}):\s*#([\s\S]*)$/);
    if (!m) continue;
    const photos = (p.match(/https?:\/\//g) ?? []).length;
    const fields = m[2].split('#').map(x => x.trim());
    const get = (label: string) => {
      const f = fields.find(x => x.toUpperCase().startsWith(label.toUpperCase()));
      return f ? f.slice(label.length).replace(/^:/, '').trim() : '';
    };
    const fail = qcNum(get('SL Lỗi'));
    out.push({
      date: m[1], qc: get('QC'), stage: get('Công đoạn'), status: qcStatus(get('Trạng thái'), fail),
      checked: qcNum(get('SL Kiểm')), pass: qcNum(get('SL Đạt')), fail,
      note: get('Ghi chú').replace(/https?:\/\/\S+/g, '').trim(), photos,
    });
  }
  return out;
};

export const summarizeQc = (entries: QcEntry[]): QcSummary | null => {
  if (!entries.length) return null;
  // Cùng ngày + công đoạn + QC + số lượng mà 1 dòng có trạng thái, dòng kia trống (bản ghi trùng) => giữ 1
  const seen = new Map<string, QcEntry>();
  for (const e of entries) {
    const k = `${e.date}|${e.stage}|${e.qc}|${e.checked}|${e.fail}`;
    const prev = seen.get(k);
    if (!prev || (prev.status === 'approved' && e.status !== 'approved')) seen.set(k, e);
  }
  const list = [...seen.values()];
  let checked = 0, pass = 0, fail = 0, bad = 0;
  for (const e of list) {
    checked += e.checked; pass += e.pass; fail += e.fail;
    if (e.fail > 0 || QC_BAD_STATUS.has(e.status)) bad++;
  }
  // Lần kiểm gần nhất theo ngày (dd/mm/yyyy -> yyyymmdd)
  const key = (d: string) => d.slice(6, 10) + d.slice(3, 5) + d.slice(0, 2);
  const last = [...list].sort((a, b) => key(b.date).localeCompare(key(a.date)))[0];
  return { n: list.length, checked, pass, fail, bad, last: { date: last.date, stage: last.stage, status: last.status, fail: last.fail } };
};
