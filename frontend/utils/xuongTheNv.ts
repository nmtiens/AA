// ============================================================================
// TRẠM QUÉT THEO TỔ (docs/designs/xuong-tram-quet.md) — phần thuần của màn trạm:
//  - docMaQuet: một lần quét là thẻ NV hay phiếu PTHSP (mẫu thẻ thật chưa chốt — T6: thẻ có mã NV trần, hoặc QR /
//    đường dẫn chứa mã NV; phiếu PTHSP chứa mã hạng mục 9 số).
//  - caChoLanQuet: quét thẻ thuộc ca nào (ca đang mở; sớm ≤ 60 phút tính từ giờ bắt đầu ca; ngoài ca gắn cờ).
//  - Bảng "ai đang ở hàng nào" cập nhật ngay trên máy (R4) trước khi tải lại từ máy chủ.
// ============================================================================

export type LoaiCaTram = 'chinh' | 'ca1' | 'ca2' | 'ca3' | 'ca4' | 'chu_nhat';
export interface LichCaTram { loaiCa: LoaiCaTram; gioBatDau: string; gioKetThuc: string }

/** Mã NV: chữ hoa / số, bỏ khoảng trắng (cùng quy tắc backend chamCong.ts) */
export const MNV_RE = /^[A-Z0-9][A-Z0-9._-]{1,19}$/;
export const chuanMnv = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');

export type KetQuaQuet =
  | { loai: 'the'; mnv: string; biet: boolean }
  | { loai: 'phieu'; hex: string }
  | { loai: 'khong_ro'; raw: string };

/**
 * Phân loại nội dung quét. `biet(mnv)` = mã có trong danh sách công nhân.
 * Thứ tự: mã NV có trong danh sách (cả chuỗi, tham số mnv= / id=, hoặc một đoạn của chuỗi) → thẻ; có mã 9 số → phiếu;
 * chuỗi ngắn dạng mã NV mà không có trong danh sách → thẻ lạ (trạm báo "báo tổ trưởng").
 */
export function docMaQuet(raw: string, biet: (mnv: string) => boolean): KetQuaQuet {
  const s = String(raw ?? '').trim();
  if (!s) return { loai: 'khong_ro', raw: s };
  const ca = chuanMnv(s);
  if (MNV_RE.test(ca) && biet(ca)) return { loai: 'the', mnv: ca, biet: true };
  const thamSo = /[?&](?:mnv|manv|ma_nv|id)=([^&#\s]+)/i.exec(s);
  if (thamSo) {
    const m = chuanMnv(decodeURIComponent(thamSo[1]));
    if (MNV_RE.test(m)) return { loai: 'the', mnv: m, biet: biet(m) };
  }
  for (const doan of s.split(/[^A-Za-z0-9._-]+/)) {
    const m = chuanMnv(doan);
    if (m && MNV_RE.test(m) && biet(m)) return { loai: 'the', mnv: m, biet: true };
  }
  const hex = /(?:^|\D)(\d{9})(?!\d)/.exec(s);
  if (hex) return { loai: 'phieu', hex: hex[1] };
  if (MNV_RE.test(ca) && /[A-Z]/.test(ca) && /\d/.test(ca)) return { loai: 'the', mnv: ca, biet: false };
  return { loai: 'khong_ro', raw: s.slice(0, 60) };
}

// ---------------------------------------------------------------------------
// Ca của một lần quét thẻ
// ---------------------------------------------------------------------------
const VN_MS = 7 * 3_600_000;
/** Quét thẻ trước giờ bắt đầu ca tối đa 90 phút (từ 06:00 với ca chính 07:30) = vào ca, công tính từ giờ bắt đầu ca */
const SOM_MS = 90 * 60_000;
/** Quét thẻ trong 30 phút trước giờ bắt đầu một ca tăng ca đã khai: vẫn coi là còn trong ca (không tự ra ca) */
const NOI_TANG_CA_MS = 30 * 60_000;

/** Ngày ca (ngày bắt đầu ca, ca 4 tới 06:00 sáng hôm sau vẫn thuộc hôm trước) — cùng quy tắc backend tram.ts */
export const ngayCa = (now: number) => new Date(now + VN_MS - 6 * 3_600_000).toISOString().slice(0, 10);
const moc = (ngay: string, hhmm: string) => Date.parse(`${ngay}T${hhmm.slice(0, 5)}:00+07:00`);
const thu = (ngay: string) => new Date(`${ngay}T12:00:00+07:00`).getUTCDay();

export interface CaQuet {
  loaiCa: LoaiCaTram;
  batDau: number;
  ketThuc: number;
  /** Mốc tính vào ca: giờ bắt đầu ca khi quét sớm, ngược lại giờ quét */
  luc: number;
  som: boolean;
  /** Không có ca nào (ca chính / tăng ca tổ đã khai) đang mở hoặc sắp mở trong 60 phút */
  ngoaiCa: boolean;
}

/**
 * Ca của lần quét thẻ lúc `now`. `tangCa` = các ca tăng ca tổ đã khai cho ngày ca hiện tại.
 * Hai ca chồng nhau (cuối ca chính và đầu tăng ca): ca có giờ bắt đầu gần nhất trước lúc quét.
 */
export function caChoLanQuet(now: number, lichCa: LichCaTram[], tangCa: string[]): CaQuet {
  const ngay = ngayCa(now);
  const ds = lichCa.map(c => {
    const batDau = moc(ngay, c.gioBatDau);
    let ketThuc = moc(ngay, c.gioKetThuc);
    if (ketThuc <= batDau) ketThuc += 24 * 3_600_000;
    const daKhai = c.loaiCa === 'chinh' ? thu(ngay) !== 0 : tangCa.includes(c.loaiCa);
    return { loaiCa: c.loaiCa, batDau, ketThuc, daKhai };
  });
  const dangMo = ds.filter(c => c.daKhai && c.batDau <= now && now < c.ketThuc).sort((a, b) => b.batDau - a.batDau)[0];
  if (dangMo) return { ...pick(dangMo), luc: now, som: false, ngoaiCa: false };
  const sapMo = ds.filter(c => c.daKhai && c.batDau > now && c.batDau - now <= SOM_MS).sort((a, b) => a.batDau - b.batDau)[0];
  if (sapMo) return { ...pick(sapMo), luc: sapMo.batDau, som: true, ngoaiCa: false };
  // Ngoài ca: gắn vào loại ca theo lịch phủ lúc quét (khi tổ trưởng khai tăng ca đó, lần tính sau tự đúng)
  const theoLich = ds.filter(c => c.batDau <= now && now < c.ketThuc).sort((a, b) => b.batDau - a.batDau)[0];
  const c = theoLich ?? ds.find(x => x.loaiCa === 'chinh') ?? { loaiCa: 'chinh' as const, batDau: now, ketThuc: now };
  return { ...pick(c), luc: now, som: false, ngoaiCa: true };
}
/**
 * Đã hết ca chưa (quét thẻ lúc này = ra ca tự động): có ca đã khai trong ngày ca đã kết thúc trước `now`, và không còn ca
 * đã khai nào đang mở hoặc sắp mở trong 30 phút (vd tăng ca 16:15 sau ca chính 15:45).
 */
export function daHetCa(now: number, lichCa: LichCaTram[], tangCa: string[]): boolean {
  const ngay = ngayCa(now);
  const ds = lichCa.map(c => {
    const batDau = moc(ngay, c.gioBatDau);
    let ketThuc = moc(ngay, c.gioKetThuc);
    if (ketThuc <= batDau) ketThuc += 24 * 3_600_000;
    const daKhai = c.loaiCa === 'chinh' ? thu(ngay) !== 0 : tangCa.includes(c.loaiCa);
    return { batDau, ketThuc, daKhai };
  }).filter(c => c.daKhai);
  const conMo = ds.some(c => c.batDau - NOI_TANG_CA_MS <= now && now < c.ketThuc);
  return !conMo && ds.some(c => c.ketThuc <= now);
}

const pick = (c: { loaiCa: LoaiCaTram; batDau: number; ketThuc: number }) => ({ loaiCa: c.loaiCa, batDau: c.batDau, ketThuc: c.ketThuc });

// ---------------------------------------------------------------------------
// Bảng "ai đang ở hàng nào" trên máy (R4): cập nhật ngay khi quét, tải lại máy chủ mỗi 30 giây / sau mỗi lô gửi được
// ---------------------------------------------------------------------------
export interface NguoiTram { mnv: string; hoTen: string }
export interface HangTram { hex: string; congDoanId: string; tenHangMuc: string | null; nguoi: NguoiTram[] }
export interface BangTram { dangO: HangTram[]; chuaVaoHang: NguoiTram[] }

/** Hàng người đó đang ở (null = chưa ở hàng nào) */
export const hangCua = (b: BangTram, mnv: string): HangTram | null => b.dangO.find(h => h.nguoi.some(n => n.mnv === mnv)) ?? null;

const boNguoi = (b: BangTram, mnv: string): BangTram => ({
  dangO: b.dangO.map(h => ({ ...h, nguoi: h.nguoi.filter(n => n.mnv !== mnv) })).filter(h => h.nguoi.length),
  chuaVaoHang: b.chuaVaoHang.filter(n => n.mnv !== mnv),
});

/** Người vào hàng (tự rời hàng cũ — mỗi người một việc một lúc) */
export function vaoHang(b: BangTram, n: NguoiTram, hang: Omit<HangTram, 'nguoi'>): BangTram {
  const bo = boNguoi(b, n.mnv);
  const co = bo.dangO.find(h => h.hex === hang.hex && h.congDoanId === hang.congDoanId);
  return {
    ...bo,
    dangO: co
      ? bo.dangO.map(h => (h === co ? { ...h, nguoi: [...h.nguoi, n].sort((a, c) => a.hoTen.localeCompare(c.hoTen)) } : h))
      : [...bo.dangO, { ...hang, nguoi: [n] }],
  };
}

/** Người ra khỏi hàng: về "chưa ở hàng nào" (vẫn trong ca) */
export const raHang = (b: BangTram, n: NguoiTram): BangTram => {
  const bo = boNguoi(b, n.mnv);
  return { ...bo, chuaVaoHang: [...bo.chuaVaoHang, n] };
};

/** Xong hết hàng: mọi người ở hàng về "chưa ở hàng nào" */
export function xongHang(b: BangTram, hex: string, congDoanId: string): BangTram {
  const h = b.dangO.find(x => x.hex === hex && x.congDoanId === congDoanId);
  if (!h) return b;
  return { dangO: b.dangO.filter(x => x !== h), chuaVaoHang: [...b.chuaVaoHang, ...h.nguoi.filter(n => !b.chuaVaoHang.some(c => c.mnv === n.mnv))] };
}

/** Ra ca: bỏ khỏi bảng */
export const raCa = (b: BangTram, mnv: string): BangTram => boNguoi(b, mnv);

/** Vào ca (chưa ở hàng): thêm vào "chưa ở hàng nào" nếu chưa có trên bảng */
export const vaoCa = (b: BangTram, n: NguoiTram): BangTram =>
  b.chuaVaoHang.some(x => x.mnv === n.mnv) || hangCua(b, n.mnv) ? b : { ...b, chuaVaoHang: [...b.chuaVaoHang, n] };

/** Đã vào ca trên trạm (có trên bảng) */
export const daVaoCa = (b: BangTram, mnv: string) => !!hangCua(b, mnv) || b.chuaVaoHang.some(x => x.mnv === mnv);
