import type { SuKien, StageState, TrangThai, DoanChay } from './types.js';

// ============================================================================
// TRẠNG THÁI MỘT HẠNG MỤC Ở MỘT CÔNG ĐOẠN — tính lại từ sổ sự kiện (quyết định R3)
//
//  chờ_nhận ─nhan─▶ đã_nhận ─bat_dau─▶ đang_làm ─tam_ngung(lý do)─▶ tạm_ngưng ─tiep_tuc─▶ đang_làm
//                                        └─hoan_thanh─▶ chờ_giao ─giao(SL, CĐ kế)─▶ [công đoạn sau: chờ_nhận]
//  huy(sua_cho) ở bất kỳ bước nào → bỏ sự kiện gốc rồi tính lại đúng cặp đó.
//
// Số lượng đi theo lô: một hạng mục có thể nhận / hoàn thành / giao nhiều lần với số lượng khác nhau.
// Hàng "giao đến" một công đoạn = sự kiện giao (cong_doan_den_id = công đoạn này) + khai báo công đoạn chi tiết
// QT2 (khai_bao_cd, cong_doan_den_id = công đoạn đầu tiên nhận đơn hàng nội bộ).
//
// Sự kiện sai thứ tự / sai chuỗi vẫn được tính, chỉ gắn cờ để quản lý xưởng xem ("cần xem").
// ============================================================================

/** Thứ tự chuẩn: giờ bấm đã hiệu chỉnh → giờ server → id */
export const soSanhSuKien = (a: SuKien, b: SuKien): number =>
  a.ts - b.ts || a.serverTs - b.serverTs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Bỏ các sự kiện đang bị huỷ. Chỉ một cấp: `huy` trỏ vào sự kiện thường thì huỷ nó; `huy` trỏ vào một `huy`
 * khác thì vô hiệu `huy` đó (khôi phục sự kiện gốc). `huy` trỏ vào `huy`-của-`huy` không có tác dụng thêm.
 * Trả về các sự kiện thường còn hiệu lực (không gồm `huy`), đã sắp theo thứ tự chuẩn.
 */
export function suKienConHieuLuc(events: SuKien[]): SuKien[] {
  const byId = new Map(events.map(e => [e.id, e]));
  const huyBiVoHieu = new Set<string>();
  for (const e of events) {
    if (e.loai !== 'huy' || !e.suaCho) continue;
    const dich = byId.get(e.suaCho);
    if (dich?.loai === 'huy') huyBiVoHieu.add(dich.id);
  }
  const biHuy = new Set<string>();
  for (const e of events) {
    if (e.loai !== 'huy' || !e.suaCho || huyBiVoHieu.has(e.id)) continue;
    const dich = byId.get(e.suaCho);
    if (dich && dich.loai !== 'huy') biHuy.add(dich.id);
  }
  return events.filter(e => e.loai !== 'huy' && !biHuy.has(e.id)).sort(soSanhSuKien);
}

const so = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Nhận có ghi nguồn ngoài app (xưởng chưa bật) thì không cần sự kiện giao tương ứng (R10) */
const nhanNgoaiApp = (e: SuKien) => !!(e.congDoanNguonId || e.xuongNguon);

/**
 * Tính trạng thái của một cặp (hex, công đoạn).
 * @param cuaCongDoan  sự kiện có cong_doan_id = công đoạn này (đã bỏ sự kiện bị huỷ hay chưa đều được)
 * @param giaoDen      sự kiện giao / khai_bao_cd có cong_doan_den_id = công đoạn này
 */
export function tinhTrangThai(cuaCongDoan: SuKien[], giaoDen: SuKien[]): StageState {
  const own = suKienConHieuLuc(cuaCongDoan);
  const incoming = suKienConHieuLuc(giaoDen).filter(e => e.loai === 'giao' || e.loai === 'khai_bao_cd');

  const co = new Set<string>();
  let slGiaoDen = 0;
  for (const e of incoming) slGiaoDen += so(e.soLuong);

  let slNhan = 0;
  let slNhanTrongApp = 0;
  let slHoanThanh = 0;
  let slGiao = 0;
  let soNguoi: number | null = null;
  let dangChayTu: number | null = null;
  let tamNgung = false;
  let daBatDau = false;
  const doanChay: DoanChay[] = [];

  const batDauChay = (e: SuKien) => {
    if (dangChayTu !== null) { co.add('bat_dau_hai_lan'); }
    else { dangChayTu = e.ts; doanChay.push({ start: e.ts, end: null }); }
    if (e.soNguoi !== null && e.soNguoi !== undefined) soNguoi = e.soNguoi;
    tamNgung = false;
    daBatDau = true;
  };
  const dungChay = (e: SuKien) => {
    if (dangChayTu === null) return false;
    doanChay[doanChay.length - 1].end = e.ts;
    dangChayTu = null;
    return true;
  };

  for (const e of own) {
    switch (e.loai) {
      case 'nhan':
        slNhan += so(e.soLuong);
        if (!nhanNgoaiApp(e)) slNhanTrongApp += so(e.soLuong);
        break;
      case 'bat_dau':
        batDauChay(e);
        break;
      case 'tiep_tuc':
        if (dangChayTu === null && !tamNgung) co.add('tiep_tuc_khi_chua_tam_ngung');
        batDauChay(e);
        break;
      case 'tam_ngung':
        if (!dungChay(e)) co.add('tam_ngung_khi_khong_chay');
        tamNgung = true;
        break;
      case 'hoan_thanh':
        if (!daBatDau) co.add('hoan_thanh_chua_bat_dau');
        slHoanThanh += so(e.soLuong);
        // Xong một phần (giao bớt cho tổ sau) thì tổ vẫn đang làm phần còn lại: chỉ dừng đồng hồ khi đã xong hết số đã nhận
        if (slHoanThanh >= slNhan) { dungChay(e); tamNgung = false; }
        break;
      case 'giao':
        slGiao += so(e.soLuong);
        break;
      default:
        break;
    }
  }

  if (slNhanTrongApp > slGiaoDen) co.add('nhan_chua_thay_giao');
  if (slGiao > slHoanThanh) co.add('giao_vuot_hoan_thanh');
  if (slHoanThanh > slNhan && slNhan > 0) co.add('hoan_thanh_vuot_nhan');

  let trangThai: TrangThai;
  if (dangChayTu !== null) trangThai = 'dang_lam';
  else if (tamNgung) trangThai = 'tam_ngung';
  else if (slHoanThanh > slGiao) trangThai = 'cho_giao';
  else if (slNhan > slHoanThanh) trangThai = 'da_nhan';
  else if (slGiaoDen > slNhan) trangThai = 'cho_nhan';
  else if (slNhan > 0 || slGiao > 0) trangThai = 'xong';
  else trangThai = 'cho_nhan';

  const tatCa = [...own, ...incoming];
  const suKienCuoi = tatCa.length ? Math.max(...tatCa.map(e => e.ts)) : null;

  return {
    trangThai, slGiaoDen, slNhan, slHoanThanh, slGiao, soNguoi, dangChayTu, suKienCuoi,
    doanChay, co: [...co].sort(),
  };
}
