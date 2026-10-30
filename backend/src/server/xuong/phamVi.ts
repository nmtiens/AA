// ============================================================================
// PHẠM VI XEM của mục Xưởng — phần thuần (không đọc DB) để test được.
// routes/xuong.ts đọc quyền (xuongQuanLy, toTruongCua) rồi gọi các hàm ở đây.
// ============================================================================

export interface ToCuaNguoi { id: number; xuong: string }

/**
 * Phạm vi xem số liệu một xưởng từ quyền đã đọc (luật của phamViXem):
 *  - admin ('*'): cả xưởng;
 *  - tài khoản tổ trưởng: chỉ các tổ mình phụ trách trong xưởng đó — kể cả khi có quyền quản lý xưởng;
 *  - quản lý xưởng (không làm tổ trưởng): cả xưởng;
 *  - còn lại: null. chiTo = null là cả xưởng.
 */
export function phamViTheoQuyen(quanLy: Set<string>, toTruong: ToCuaNguoi[], xuong: string): { chiTo: number[] | null } | null {
  if (quanLy.has('*')) return { chiTo: null };
  if (toTruong.length) {
    const cua = toTruong.filter(t => t.xuong === xuong).map(t => t.id);
    return cua.length ? { chiTo: cua } : null;
  }
  return quanLy.has(xuong) ? { chiTo: null } : null;
}

/** Xưởng / công đoạn mà một hạng mục có dính tới (xưởng chính, trạng thái, sự kiện, triển khai, tuyến) */
export interface LienQuanHex { xuong: Set<string>; congDoan: Set<string> }

export function lienQuanHex(d: {
  /** Xưởng chính theo bảng sản xuất — mã gốc và tên đã gộp (workshop_group_mapping) */
  xuongChinh?: string | null | Array<string | null>;
  trangThai: Array<{ xuong?: unknown; cong_doan_id?: unknown }>;
  suKien: Array<{ xuong?: unknown; cong_doan_id?: unknown; cong_doan_den_id?: unknown; du_lieu?: Record<string, unknown> | null }>;
  /** Công đoạn trên tuyến đã triển khai (hàng sẽ đi qua) */
  tuyen: string[];
  xuongCuaCd: (cdId: string) => string | null;
}): LienQuanHex {
  const xuong = new Set<string>();
  const congDoan = new Set<string>();
  const themX = (v: unknown) => { const s = String(v ?? '').trim().toUpperCase(); if (s) xuong.add(s); };
  const themCd = (v: unknown) => { if (v === null || v === undefined || v === '') return; const s = String(v); congDoan.add(s); themX(d.xuongCuaCd(s)); };
  for (const x of Array.isArray(d.xuongChinh) ? d.xuongChinh : [d.xuongChinh]) themX(x);
  for (const x of d.trangThai) { themX(x.xuong); themCd(x.cong_doan_id); }
  for (const e of d.suKien) {
    themX(e.xuong); themCd(e.cong_doan_id); themCd(e.cong_doan_den_id);
    // Triển khai: xưởng chính + xưởng phụ được giao thành phần
    themX(e.du_lieu?.xuong);
    if (Array.isArray(e.du_lieu?.thanhPhan)) for (const t of e.du_lieu!.thanhPhan as Array<Record<string, unknown>>) themX(t?.xuong);
  }
  for (const cd of d.tuyen) themCd(cd);
  return { xuong, congDoan };
}

/**
 * Được xem chi tiết một hạng mục (GET /api/xuong/hex/:hex):
 *  - admin: mọi hạng mục;
 *  - quản lý xưởng / tổ trưởng: hạng mục dính tới xưởng mà phamViTheoQuyen cho xem (tổ trưởng: xưởng của tổ mình —
 *    để tra cả hàng sắp tới, chưa tới công đoạn của tổ);
 *  - tổ trưởng: thêm hạng mục có hàng / tuyến qua công đoạn tổ mình phụ trách (kể cả công đoạn ở xưởng khác).
 * cdCuaTo = công đoạn của các tổ người này làm tổ trưởng.
 */
export function xemHexDuoc(quanLy: Set<string>, toTruong: ToCuaNguoi[], cdCuaTo: Set<string>, lq: LienQuanHex): boolean {
  if (quanLy.has('*')) return true;
  for (const x of lq.xuong) if (phamViTheoQuyen(quanLy, toTruong, x)) return true;
  for (const cd of lq.congDoan) if (cdCuaTo.has(cd)) return true;
  return false;
}
