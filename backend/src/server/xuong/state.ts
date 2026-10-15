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

// ---------------------------------------------------------------------------
// CÔNG ĐOẠN THÀNH PHẦN (QT1) — trường hợp "song song": một hạng mục tách thành các thành phần (Gỗ / Sofa / Kim loại /
// Kính / Đá), mỗi thành phần đi tuyến công đoạn chi tiết riêng rồi hợp lại ở một công đoạn chung (vd Fitting).
// Tuyến lấy từ trien_khai.du_lieu.thanhPhan[] (xưởng chính khai) và khai_bao_cd.du_lieu (xưởng phụ khai CĐ chi tiết
// cho thành phần được giao — QT2). Bản cũ chỉ có trien_khai.du_lieu.tuyen = một tuyến (thành phần không tên).
// ---------------------------------------------------------------------------
export const THANH_PHAN = ['GỖ', 'SOFA', 'KIM LOẠI', 'KÍNH', 'ĐÁ'] as const;
export interface TuyenThanhPhan { thanhPhan: string; tuyen: string[] }

const dsChuoi = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/** Tuyến theo thành phần của một hạng mục (sự kiện của hex, đã hay chưa bỏ huỷ đều được). Cùng thành phần: lần sau đè. */
export function tuyenTheoThanhPhan(evts: SuKien[]): TuyenThanhPhan[] {
  const m = new Map<string, string[]>();
  for (const e of suKienConHieuLuc(evts)) {
    if (e.loai === 'trien_khai') {
      const tp = Array.isArray(e.duLieu?.thanhPhan) ? (e.duLieu!.thanhPhan as Array<Record<string, unknown>>) : null;
      if (tp) for (const x of tp) { const t = dsChuoi(x?.tuyen); if (t.length) m.set(String(x?.ten ?? ''), t); }
      else { const t = dsChuoi(e.duLieu?.tuyen); if (t.length) m.set('', t); }
    } else if (e.loai === 'khai_bao_cd' && typeof e.duLieu?.thanhPhan === 'string') {
      const t = dsChuoi(e.duLieu?.tuyen);
      if (t.length) m.set(e.duLieu.thanhPhan as string, t);
    }
  }
  return [...m.entries()].map(([thanhPhan, tuyen]) => ({ thanhPhan, tuyen }));
}

/**
 * Số lượng "giao đến" một công đoạn, đồng bộ theo thành phần: ở công đoạn hợp nhánh (nhiều thành phần cùng đi qua),
 * một bộ chỉ tính là đã về khi đủ mọi thành phần => min theo thành phần (+ phần giao từ công đoạn chung phía trước).
 * Công đoạn chỉ một thành phần đi qua: cộng thẳng như cũ.
 */
export function slGiaoDenDongBo(incoming: SuKien[], tuyen: TuyenThanhPhan[], congDoanId: string | null): number {
  const tong = incoming.reduce((a, e) => a + so(e.soLuong), 0);
  if (!congDoanId) return tong;
  const qua = tuyen.filter(t => t.tuyen.includes(congDoanId));
  if (qua.length < 2) return tong;
  const theoTp = new Map<string, number>(qua.map(t => [t.thanhPhan, 0]));
  let chung = 0;
  for (const e of incoming) {
    let tp: string | null = null;
    if (e.loai === 'khai_bao_cd' && typeof e.duLieu?.thanhPhan === 'string' && theoTp.has(e.duLieu.thanhPhan as string)) {
      tp = e.duLieu.thanhPhan as string;
    } else if (e.congDoanId) {
      // Nguồn nằm trước công đoạn này trong đúng một nhánh => hàng của thành phần đó; nguồn chung mọi nhánh => phần chung
      const nhanh = qua.filter(t => { const i = t.tuyen.indexOf(e.congDoanId!); return i >= 0 && i < t.tuyen.indexOf(congDoanId); });
      if (nhanh.length && nhanh.length < qua.length) tp = nhanh[0].thanhPhan;
    }
    if (tp === null) chung += so(e.soLuong);
    else theoTp.set(tp, (theoTp.get(tp) ?? 0) + so(e.soLuong));
  }
  return chung + Math.min(...theoTp.values());
}

/**
 * Công đoạn CUỐI TUYẾN: nằm trong ít nhất một tuyến của hạng mục và là bước cuối của mọi tuyến đi qua nó.
 * Xong ở đây là xong hạng mục (hàng ra khỏi tuyến / nhập kho) — không còn nơi để giao, nên không tính "chờ giao".
 */
export function laCuoiTuyen(tuyen: TuyenThanhPhan[], congDoanId: string | null): boolean {
  if (!congDoanId) return false;
  const qua = tuyen.filter(t => t.tuyen.includes(congDoanId));
  return qua.length > 0 && qua.every(t => t.tuyen[t.tuyen.length - 1] === congDoanId);
}

/** Nhận có ghi nguồn ngoài app (xưởng chưa bật) thì không cần sự kiện giao tương ứng (R10) */
const nhanNgoaiApp = (e: SuKien) => !!(e.congDoanNguonId || e.xuongNguon);

/**
 * Tính trạng thái của một cặp (hex, công đoạn).
 * @param cuaCongDoan  sự kiện có cong_doan_id = công đoạn này (đã bỏ sự kiện bị huỷ hay chưa đều được)
 * @param giaoDen      sự kiện giao / khai_bao_cd có cong_doan_den_id = công đoạn này
 * @param tuyen        tuyến theo thành phần của hạng mục (tuyenTheoThanhPhan) — đồng bộ số giao đến ở công đoạn hợp nhánh
 * @param congDoanId   công đoạn đang tính
 */
export function tinhTrangThai(cuaCongDoan: SuKien[], giaoDen: SuKien[], tuyen: TuyenThanhPhan[] = [], congDoanId: string | null = null): StageState {
  const own = suKienConHieuLuc(cuaCongDoan);
  const incoming = suKienConHieuLuc(giaoDen).filter(e => e.loai === 'giao' || e.loai === 'khai_bao_cd');

  const co = new Set<string>();
  const slGiaoDen = slGiaoDenDongBo(incoming, tuyen, congDoanId);

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
  // Công đoạn cuối tuyến: xong là hết, không chờ giao
  else if (slHoanThanh > slGiao && !laCuoiTuyen(tuyen, congDoanId)) trangThai = 'cho_giao';
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
