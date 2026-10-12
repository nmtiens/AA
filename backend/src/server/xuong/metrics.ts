// ============================================================================
// THỜI GIAN TRONG XƯỞNG / THỜI GIAN THÀNH PHẨM THEO LÔ (R3-4, R10 — docs/designs/xuong-checkin.md)
//
// Mỗi lần nhận vào xưởng là một lô. Số lượng ra khỏi xưởng (giao ra ngoài xưởng hoặc hoàn thành BAO BÌ trong
// xưởng) trừ vào các lô theo thứ tự nhận trước ra trước. Thời gian của lô = từ lúc nhận lô đến lúc phần cuối
// cùng của lô ra khỏi xưởng.
// Mức hạng mục: mốc chuẩn CỐ ĐỊNH (số lượng triển khai cho xưởng ở QT1; không có QT1 trên app thì số lượng đơn
// hàng trong production — "mốc theo đơn hàng"), không phải tổng đã nhận. Thời gian của hạng mục = từ lần nhận đầu
// tiên đến khi tổng đã ra ≥ mốc; chưa đủ thì trả % và thời gian tạm tính tới `now`.
// ============================================================================

export interface DongSoLuong { ts: number; soLuong: number }

export interface KetQuaLo {
  nhanLuc: number;
  soLuong: number;
  /** null = lô chưa ra hết */
  raHetLuc: number | null;
  /** ms; lô chưa ra hết thì tính tới now */
  thoiGian: number;
  daRa: number;
}

export interface KetQuaThoiGian {
  lo: KetQuaLo[];
  /** Mốc chuẩn dùng để kết thúc */
  moc: number;
  loaiMoc: 'trien_khai' | 'don_hang' | 'khong_co';
  tongDaRa: number;
  /** 0–100 */
  phanTram: number;
  batDau: number | null;
  ketThuc: number | null;
  /** ms; tạm tính nếu ketThuc = null */
  thoiGian: number | null;
  tamTinh: boolean;
}

const EPS = 1e-9;

export function thoiGianTheoLo(
  vao: DongSoLuong[],
  ra: DongSoLuong[],
  moc: { soLuong: number | null; loai: 'trien_khai' | 'don_hang' } | null,
  now: number,
): KetQuaThoiGian {
  const lots = [...vao].filter(v => v.soLuong > 0).sort((a, b) => a.ts - b.ts)
    .map(v => ({ nhanLuc: v.ts, soLuong: v.soLuong, conLai: v.soLuong, raHetLuc: null as number | null }));
  const outs = [...ra].filter(r => r.soLuong > 0).sort((a, b) => a.ts - b.ts);

  let tongDaRa = 0;
  for (const o of outs) {
    tongDaRa += o.soLuong;
    let can = o.soLuong;
    for (const l of lots) {
      if (can <= EPS) break;
      if (l.conLai <= EPS || l.nhanLuc > o.ts) continue;
      const tru = Math.min(l.conLai, can);
      l.conLai -= tru;
      can -= tru;
      if (l.conLai <= EPS) l.raHetLuc = o.ts;
    }
  }

  const lo: KetQuaLo[] = lots.map(l => ({
    nhanLuc: l.nhanLuc,
    soLuong: l.soLuong,
    raHetLuc: l.raHetLuc,
    thoiGian: (l.raHetLuc ?? now) - l.nhanLuc,
    daRa: l.soLuong - l.conLai,
  }));

  const mocSl = moc?.soLuong && moc.soLuong > 0 ? moc.soLuong : 0;
  const batDau = lots.length ? lots[0].nhanLuc : null;
  if (!mocSl) {
    return { lo, moc: 0, loaiMoc: 'khong_co', tongDaRa, phanTram: 0, batDau, ketThuc: null,
      thoiGian: batDau === null ? null : now - batDau, tamTinh: true };
  }
  let luyKe = 0;
  let ketThuc: number | null = null;
  for (const o of outs) {
    luyKe += o.soLuong;
    if (luyKe + EPS >= mocSl) { ketThuc = o.ts; break; }
  }
  const phanTram = Math.min(100, Math.round((tongDaRa / mocSl) * 1000) / 10);
  return {
    lo, moc: mocSl, loaiMoc: moc!.loai, tongDaRa, phanTram, batDau, ketThuc,
    thoiGian: batDau === null ? null : (ketThuc ?? now) - batDau,
    tamTinh: ketThuc === null,
  };
}
