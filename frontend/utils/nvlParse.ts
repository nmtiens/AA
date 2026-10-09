// Đọc các cột định mức / tình trạng NVL theo hạng mục của bảng sản xuất (bộ phận kế hoạch cập nhật).
// Dùng cho hạng mục không có PR ghi mã nhà máy (vật tư mua gộp theo công trình): vẫn biết hạng mục cần
// vật tư gì và tình trạng mua đến đâu.
//
// Định mức (nvl_go_tam_veneer_khac, nvl_kinh_da, nvl_sofa, nvl_vecni, nvl_kim_loai) — mỗi dòng:
//   "- VÁN ÉP E2 C/A 9 LY # ĐVT: TAM # Tổng KL theo Chủng loại: 45 # Tổng KL theo Nguyên liệu: 44"
//   "- MÉT VUỐNG SƠN # ĐVT: M2 # Tổng M2/1 SP: 14.385 # Tổng ĐM trên 1 SP: 14.385"
//   => lấy số CUỐI dòng (theo nguyên liệu / ĐM trên 1 SP) làm khối lượng của vật tư đó.
// Tình trạng (tinh_trang_nvl_*_item_by_item, tinh_trang_gcn_chua_ve) — các khối cách nhau dòng trống:
//   "[Mở|Hoàn thành|Đóng - ]TÊN VT SAP: … | Ngày dự kiến giao hàng PMH nhập: dd/mm/yyyy | TEAM PR NOTE: …
//    | KHỐI LƯỢNG YÊU CẦU: a | KHỐI LƯỢNG ĐÃ VỀ: b | KHỐI LƯỢNG CÒN LẠI: c"

export type NvlGroup = 'go' | 'kinhDa' | 'sofa' | 'vecni' | 'kimLoai';
export const NVL_GROUP_LABEL: Record<NvlGroup, string> = {
  go: 'Gỗ / ván / veneer', kinhDa: 'Kính / đá', sofa: 'Sofa (vải, da, mút)', vecni: 'Sơn / vecni', kimLoai: 'Kim loại',
};
const DM_COLUMNS: Record<NvlGroup, string> = {
  go: 'nvl_go_tam_veneer_khac', kinhDa: 'nvl_kinh_da', sofa: 'nvl_sofa', vecni: 'nvl_vecni', kimLoai: 'nvl_kim_loai',
};

export interface NvlNeed { group: NvlGroup; name: string; dvt: string; qty: number | null }

export interface NvlStatusLine {
  source: 'khac' | 'kinhDa' | 'sofa' | 'gcn';
  state: string;          // Mở / Hoàn thành / Đóng / '' (không ghi)
  name: string;           // Tên VT SAP
  due: string;            // Ngày dự kiến giao hàng PMH nhập
  note: string;           // Team PR note
  req: number | null; got: number | null; left: number | null;
}

export type NvlRaw = Record<string, unknown>;

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

/** Định mức vật tư của 1 hạng mục (mọi nhóm). Bỏ dòng BTP (bán thành phẩm nội bộ). */
export function parseNvlNeeds(raw: NvlRaw | undefined | null): NvlNeed[] {
  if (!raw) return [];
  const out: NvlNeed[] = [];
  (Object.keys(DM_COLUMNS) as NvlGroup[]).forEach(group => {
    const text = String(raw[DM_COLUMNS[group]] ?? '');
    if (!text.trim()) return;
    text.split('\n').forEach(line => {
      const t = line.trim().replace(/^-\s*/, '');
      if (!t) return;
      const parts = t.split('#').map(p => p.trim());
      const name = parts[0];
      if (!name || /^BTP\b/i.test(name)) return;
      const dvt = parts.find(p => /^ĐVT\s*:/i.test(p))?.split(':').slice(1).join(':').trim() ?? '';
      const nums = parts.slice(1).filter(p => !/^ĐVT/i.test(p)).map(p => num(p.split(':').pop()));
      const qty = [...nums].reverse().find(v => v !== null) ?? null;
      out.push({ group, name, dvt, qty });
    });
  });
  return out;
}

const STATUS_COLUMNS: [NvlStatusLine['source'], string][] = [
  ['khac', 'tinh_trang_nvl_khac_item_by_item'],
  ['kinhDa', 'tinh_trang_nvl_kinh_da_item_by_item'],
  ['sofa', 'tinh_trang_nvl_sofa_item_by_item'],
  ['gcn', 'tinh_trang_gcn_chua_ve'],
];

/** Tình trạng các dòng PR của hạng mục do kế hoạch ghi (gộp dòng trùng nội dung giữa các cột). */
export function parseNvlStatus(raw: NvlRaw | undefined | null): NvlStatusLine[] {
  if (!raw) return [];
  // Cùng 1 dòng PR có thể được ghi ở nhiều cột (vd. kính vừa ở "NVL khác" vừa ở "kính / đá", một nơi có
  // tiền tố "Mở - ") => chỉ gộp trùng GIỮA các cột (lấy số lần xuất hiện nhiều nhất trong 1 cột). Trong
  // CÙNG 1 cột, các khối giống hệt nhau là các dòng PR thật khác nhau (cùng vật tư, cùng SL) — trước bị gộp
  // nên số "dòng còn chờ" đếm thiếu.
  const byBody = new Map<string, NvlStatusLine[]>();
  STATUS_COLUMNS.forEach(([source, col]) => {
    const text = String(raw[col] ?? '');
    if (!text.trim()) return;
    const inCol = new Map<string, NvlStatusLine[]>();
    text.split(/\n\s*\n|\n(?=(?:Mở|Hoàn thành|Đóng)\s*-\s*TÊN VT SAP|TÊN VT SAP)/).forEach(block => {
      const b = block.trim();
      if (!b || !/TÊN VT SAP/i.test(b)) return;
      const m = /^(Mở|Hoàn thành|Đóng)\s*-\s*/i.exec(b);
      const body = m ? b.slice(m[0].length) : b;
      const field = (label: RegExp) => body.split('|').map(p => p.trim()).find(p => label.test(p))?.split(':').slice(1).join(':').trim();
      const list = inCol.get(body) ?? [];
      list.push({
        source,
        state: m ? m[1] : '',
        name: field(/^TÊN VT SAP/i) ?? '',
        due: field(/^Ngày dự kiến/i) ?? '',
        note: field(/^TEAM PR NOTE/i) ?? '',
        req: num(field(/^KHỐI LƯỢNG YÊU CẦU/i)),
        got: num(field(/^KHỐI LƯỢNG ĐÃ VỀ/i)),
        left: num(field(/^KHỐI LƯỢNG CÒN LẠI/i)),
      });
      inCol.set(body, list);
    });
    inCol.forEach((list, body) => {
      const prev = byBody.get(body);
      if (!prev) { byBody.set(body, list); return; }
      // Đã có ở cột khác: giữ bản nhiều dòng hơn, bổ sung trạng thái còn trống
      const keep = list.length > prev.length ? list : prev;
      const other = keep === list ? prev : list;
      const state = keep.find(l => l.state)?.state || other.find(l => l.state)?.state || '';
      if (state) keep.forEach(l => { if (!l.state) l.state = state; });
      byBody.set(body, keep);
    });
  });
  return [...byBody.values()].flat();
}

/** Dòng tình trạng còn chờ về (còn lại > 0, chưa đóng / hoàn thành, không phải CCLD). */
export const nvlLinePending = (l: NvlStatusLine): boolean =>
  (l.left ?? 0) > 0 && !/^(Hoàn thành|Đóng)$/i.test(l.state) && !/CCLD|DONE/i.test(l.note);

/** Rút gọn định mức để hiện trong 1 ô bảng: "Ván ép E2 C/A 9 LY 44 TAM · MDF … +2". */
export function summarizeNeeds(needs: NvlNeed[], max = 2): string {
  if (!needs.length) return '';
  const fmt = (n: NvlNeed) => `${n.name}${n.qty !== null ? ` ${Number(n.qty.toFixed(3))} ${n.dvt}` : ''}`;
  return needs.slice(0, max).map(fmt).join(' · ') + (needs.length > max ? ` +${needs.length - max}` : '');
}
