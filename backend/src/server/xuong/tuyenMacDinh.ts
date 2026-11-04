// ============================================================================
// TUYẾN MẶC ĐỊNH THEO NHÓM SẢN PHẨM: kiểm tra thành phần + chọn gợi ý khi triển khai.
// Ưu tiên tuyến mặc định xưởng đã khai; mặc định không còn hợp lệ (vd công đoạn đã tắt) hoặc chưa khai thì dùng tuyến
// lần triển khai gần nhất của cùng nhóm.
// ============================================================================

export interface ThanhPhanTuyen { ten: string; xuong: string; tuyen: string[] }
export type NguonGoiY = 'mac_dinh' | 'lan_truoc';

/** Cùng quy tắc POST /api/xuong/trien-khai. xuongCd = id công đoạn đang bật → xưởng. */
export function loiThanhPhan(ds: ThanhPhanTuyen[], xuong: string, xuongCd: Map<string, string>): string | null {
  if (!ds.length) return 'Cần ít nhất một thành phần';
  if (new Set(ds.map(t => t.ten)).size !== ds.length) return 'Mỗi thành phần chỉ khai một lần';
  for (const t of ds) {
    if (t.xuong === xuong && !t.tuyen.length) return `${t.ten}: thành phần của xưởng chính cần tuyến công đoạn`;
    const thieu = t.tuyen.find(id => !xuongCd.has(id));
    if (thieu) return `${t.ten}: công đoạn ${thieu} không tồn tại hoặc đã tắt`;
    if (t.tuyen.length && xuongCd.get(t.tuyen[0]) !== t.xuong) return `${t.ten}: công đoạn đầu tuyến phải thuộc xưởng ${t.xuong}`;
  }
  return null;
}

export function chonGoiY(macDinh: ThanhPhanTuyen[] | undefined, lanTruoc: ThanhPhanTuyen[] | undefined, xuong: string, xuongCd: Map<string, string>):
  { thanhPhan: ThanhPhanTuyen[] | null; nguon: NguonGoiY | null } {
  if (macDinh && !loiThanhPhan(macDinh, xuong, xuongCd)) return { thanhPhan: macDinh, nguon: 'mac_dinh' };
  return lanTruoc ? { thanhPhan: lanTruoc, nguon: 'lan_truoc' } : { thanhPhan: null, nguon: null };
}
