import type { CuaSo, DoanChay, LoaiCa, SuKien } from './types.js';
import { pairKey } from './types.js';
import type { DoanCoMat, ThayDoiSoNguoi } from './allocation.js';
import { chuanMnv, MNV_RE, nguoiTrongSuKien } from './chamCong.js';
import { soSanhSuKien, tinhTrangThai } from './state.js';

// ============================================================================
// TRẠM QUÉT THEO TỔ (docs/designs/xuong-tram-quet.md) — bộ chuyển đổi sổ trạm → đầu vào sẵn có (D1).
//
//   trạm: quét thẻ ─▶ vao_ca (du_lieu.tram) ───────────────────────────────▶ doanCoMat (chamCong.ts, không đổi)
//         quét phiếu ─▶ nguoi_vao {mnv, hex, CĐ} ─┐
//         Ra khỏi hàng ─▶ nguoi_ra {mnv}          ├─▶ chuyenDoiTram ─▶ đoạn ở hàng từng người (doanNguoi)
//         Ra ca ─▶ nguoi_ra + ra_ca (du_lieu.tram)┘        │              ├─▶ soNguoi có tên  ─▶ allocation.phanBoGioCong
//   tổ trưởng: Xong hết số đã nhận (hoan_thanh) ───────────┘              ├─▶ doanChay        ─┘ (thuật toán không đổi)
//                                                                         └─▶ sự kiện giả bat_dau / tam_ngung ─▶ state.ts
//
// Quy tắc (tính lúc đọc, không ghi sự kiện tự động):
//  - Mỗi người một hàng một lúc: vào hàng mới thì rời hàng cũ tại mốc đó (hai lần vào chồng nhau: lần sau thắng).
//  - Hàng đang chạy khi có ≥ 1 người; hết người = tạm ngưng (không lý do). Xong hết số đã nhận: mọi người ra tại mốc Xong.
//  - Quên ra: đoạn đang mở tự đóng ở cuối khối ca chứa lúc vào (ca chính + tăng ca tổ đã khai, nối nhau nếu cách
//    ≤ 60 phút), gắn cờ "tự đóng". Vào ngoài mọi ca (và không có ca nào bắt đầu trong 60 phút): đoạn rỗng, cờ "ngoài ca".
//  - Chế độ tổ theo ngày ca: 'cu' bỏ qua sổ trạm (số y hệt trước khi có trạm); 'song_song' số chính thức theo cách cũ,
//    sổ trạm chỉ dùng để so khớp; 'tram' sổ trạm thay Bắt đầu / Tạm ngưng / Tiếp tục / Chia người.
// ============================================================================

export const CHE_DO_CHAM = ['cu', 'song_song', 'tram'] as const;
export type CheDoCham = typeof CHE_DO_CHAM[number];

const GIO_MS = 3_600_000;
/** Hai cửa sổ ca cách nhau không quá mức này coi là một khối (nghỉ trưa, chuyển ca chính → tăng ca) */
const NOI_CA_MS = 60 * 60_000;
/** Quét sớm tối đa trước giờ bắt đầu ca (ca chính 07:30 → từ 06:00) */
export const SOM_TOI_DA_MS = 90 * 60_000;

/** Ngày ca của một mốc: ngày bắt đầu ca (ca 4 tới 06:00 sáng hôm sau vẫn thuộc hôm trước) — giờ Asia/Ho_Chi_Minh */
export const ngayCa = (ts: number): string => new Date(ts + 7 * GIO_MS - 6 * GIO_MS).toISOString().slice(0, 10);

/** Sự kiện thuộc sổ trạm: người vào / ra hàng; vào / ra ca ghi từ trạm hoặc tổ trưởng ghi hộ ở màn Sửa ngày */
export const laSuKienTram = (e: Pick<SuKien, 'loai' | 'duLieu'>): boolean =>
  e.loai === 'nguoi_vao' || e.loai === 'nguoi_ra'
  || ((e.loai === 'vao_ca' || e.loai === 'ra_ca') && e.duLieu?.tram === true);

/** Thao tác bấm tay mà trạm thay thế (tổ chế độ trạm ẩn các nút này) */
const LOAI_BAM_TAY = new Set(['bat_dau', 'tiep_tuc', 'tam_ngung', 'chia_nguoi']);

/** Mã NV của một sự kiện trạm (du_lieu.mnv); không hợp lệ = null */
export const mnvCua = (e: Pick<SuKien, 'duLieu'>): string | null => {
  const m = chuanMnv(e.duLieu?.mnv);
  return MNV_RE.test(m) ? m : null;
};

export interface MocCheDo { toId: number; cheDo: CheDoCham; tuNgay: string }

/** Chế độ của tổ tại một ngày ca: lần đổi gần nhất có tu_ngay ≤ ngày đó; chưa đổi bao giờ = 'cu' */
export function cheDoTheoNgay(ds: MocCheDo[]): (toId: number | null, ngay: string) => CheDoCham {
  const theoTo = new Map<number, MocCheDo[]>();
  for (const m of [...ds].sort((a, b) => a.tuNgay.localeCompare(b.tuNgay))) {
    if (!theoTo.has(m.toId)) theoTo.set(m.toId, []);
    theoTo.get(m.toId)!.push(m);
  }
  return (toId, ngay) => {
    if (toId === null) return 'cu';
    let v: CheDoCham = 'cu';
    for (const m of theoTo.get(toId) ?? []) { if (m.tuNgay <= ngay) v = m.cheDo; else break; }
    return v;
  };
}

/**
 * Lọc sổ theo chế độ tổ từng ngày ca.
 * - 'chinh_thuc': số chính thức — ngày 'cu' / 'song_song' bỏ sổ trạm; ngày 'tram' bỏ thao tác bấm tay mà trạm thay.
 * - 'so_khop': số của trạm để so trong tuần song song — ngày 'song_song' / 'tram' dùng sổ trạm, bỏ bấm tay và
 *   điểm danh tay; ngày 'cu' như chính thức.
 */
export function locTheoCheDo(evts: SuKien[], cheDo: (toId: number | null, ngay: string) => CheDoCham,
  cach: 'chinh_thuc' | 'so_khop' = 'chinh_thuc'): SuKien[] {
  return evts.filter(e => {
    const cd = cheDo(e.toId, ngayCa(e.ts));
    const dungTram = cach === 'chinh_thuc' ? cd === 'tram' : cd !== 'cu';
    if (laSuKienTram(e)) return dungTram;
    if (!dungTram) return true;
    if (LOAI_BAM_TAY.has(e.loai)) return false;
    // So khớp: điểm danh tay không tính (chỉ đo những gì trạm ghi được)
    if (cach === 'so_khop' && (e.loai === 'vao_ca' || e.loai === 'ra_ca')) return false;
    return true;
  });
}

/**
 * Hạng mục đang chạy theo bấm tay (Bắt đầu chưa Tạm ngưng / Xong) lúc tổ chuyển sang chế độ trạm: thêm sự kiện giả
 * tạm ngưng ở đầu ngày ca chuyển (06:00) — từ đó hàng chỉ chạy khi có người quét vào, không chạy mãi với người khai cũ.
 * `own` = sự kiện của một cặp (hex, công đoạn). Không có lần chuyển nào: trả mảng rỗng.
 */
export function dungBamTayKhiChuyen(own: SuKien[], moc: MocCheDo[]): SuKien[] {
  const toId = own.find(e => LOAI_BAM_TAY.has(e.loai) && e.toId !== null)?.toId ?? null;
  if (toId === null) return [];
  const cheDo = cheDoTheoNgay(moc);
  const out: SuKien[] = [];
  for (const m of [...new Set(moc.filter(x => x.toId === toId && x.cheDo === 'tram').map(x => x.tuNgay))].sort()) {
    const truoc = new Date(Date.parse(`${m}T12:00:00+07:00`) - 86_400_000).toISOString().slice(0, 10);
    if (cheDo(toId, truoc) === 'tram') continue; // đã là trạm từ trước
    const t = Date.parse(`${m}T06:00:00+07:00`);
    const st = tinhTrangThai([...own.filter(e => e.ts < t), ...out], []);
    if (st.dangChayTu === null) continue;
    out.push({
      id: `tram:chuyen:${toId}:${m}:${own[0]?.hex}|${own[0]?.congDoanId}`, loai: 'tam_ngung', hex: own[0]?.hex ?? null,
      congDoanId: own[0]?.congDoanId ?? null, toId, soLuong: null, congDoanDenId: null, congDoanNguonId: null, xuongNguon: null,
      soNguoi: null, lyDoTamNgung: null, duLieu: { tram: true, chuyenCheDo: true }, ts: t, serverTs: t, suaCho: null,
    });
  }
  return out;
}

/**
 * Tổ trạm: người ở lại tăng ca không quét lại thẻ (đoạn ở hàng nối qua mốc chuyển ca). Người có mặt ca chính chưa ra ca
 * (hoặc ra ca sau giờ bắt đầu tăng ca) được tính có mặt trong từng ca tăng ca đã khai, từ giờ bắt đầu ca đó tới lúc ra ca.
 */
export function noiCoMatTangCa(coMat: Partial<Record<LoaiCa, DoanCoMat[]>>, cuaSo: CuaSo[]): Partial<Record<LoaiCa, DoanCoMat[]>> {
  const chinh = coMat.chinh ?? [];
  const csChinh = cuaSo.filter(c => c.loaiCa === 'chinh');
  if (!chinh.length || !csChinh.length) return coMat;
  const hetChinh = Math.max(...csChinh.map(c => c.end));
  const out = { ...coMat };
  for (const loai of new Set(cuaSo.filter(c => c.loaiCa !== 'chinh').map(c => c.loaiCa))) {
    const bd = Math.min(...cuaSo.filter(c => c.loaiCa === loai).map(c => c.start));
    if (bd < hetChinh) continue; // tăng ca trùng giờ ca chính (Chủ nhật…) — không nối
    const coSan = new Set((out[loai] ?? []).map(d => d.mnv));
    const them = chinh.filter(d => !coSan.has(d.mnv) && (d.end === null || d.end > bd)).map(d => ({ mnv: d.mnv, start: bd, end: d.end }));
    if (them.length) out[loai] = [...(out[loai] ?? []), ...them];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Khối ca: tự đóng cuối ca
// ---------------------------------------------------------------------------
export interface KhoiCa { start: number; end: number }

/** Gộp các cửa sổ ca (mọi ngày) thành khối liền: cách nhau ≤ 60 phút thì nối */
export function khoiCa(cuaSo: CuaSo[]): KhoiCa[] {
  const out: KhoiCa[] = [];
  for (const c of [...cuaSo].sort((a, b) => a.start - b.start)) {
    const cuoi = out[out.length - 1];
    if (cuoi && c.start - cuoi.end <= NOI_CA_MS) cuoi.end = Math.max(cuoi.end, c.end);
    else out.push({ start: c.start, end: c.end });
  }
  return out;
}

/** Mốc tự đóng của một đoạn bắt đầu lúc `t`: cuối khối ca chứa t (hoặc bắt đầu trong 60 phút sau t); ngoài ca = t */
export function mocTuDong(khoi: KhoiCa[] | null, t: number): { end: number; ngoaiCa: boolean } {
  if (!khoi) return { end: Number.POSITIVE_INFINITY, ngoaiCa: false };
  for (const k of khoi) if (k.start - SOM_TOI_DA_MS <= t && t < k.end) return { end: k.end, ngoaiCa: false };
  return { end: t, ngoaiCa: true };
}

// ---------------------------------------------------------------------------
// Bộ chuyển đổi
// ---------------------------------------------------------------------------
export interface DoanNguoi {
  mnv: string;
  key: string;
  hex: string;
  congDoanId: string;
  /** Tổ của trạm ghi lần vào */
  toId: number | null;
  start: number;
  /** null = đang ở hàng */
  end: number | null;
  /** Cách kết thúc: ra (nguoi_ra / ra ca), doi_hang (vào hàng khác), xong (Xong hết), tu_dong (cuối ca), ngoai_ca */
  ketThuc: 'ra' | 'doi_hang' | 'xong' | 'tu_dong' | 'ngoai_ca' | null;
  /** id sự kiện nguoi_vao mở đoạn / sự kiện đóng đoạn (để Sửa ngày huỷ) */
  suKienVao: string;
  suKienRa: string | null;
  /** Nguồn đoạn: quét ở trạm, tổ trưởng phân công, hệ thống tự gán theo hàng hôm trước, tổ trưởng / quản lý ghi hộ */
  nguon: NguonDoan;
}
export type NguonDoan = 'quet' | 'phan_cong' | 'tu_gan' | 'ghi_ho';
export const nguonCua = (e: Pick<SuKien, 'duLieu'>): NguonDoan =>
  e.duLieu?.tuGan === true ? 'tu_gan' : e.duLieu?.phanCong === true ? 'phan_cong' : e.duLieu?.ghiHo === true ? 'ghi_ho' : 'quet';

// ---------------------------------------------------------------------------
// Phân công đầu ca + tự gán (giai đoạn A — công nhân gần như không thao tác)
// ---------------------------------------------------------------------------
/** Có mặt mà sau mốc này chưa ở hàng nào → tự gán vào hàng đang làm dở lần trước (cờ "tự gán", tổ trưởng xác nhận) */
export const TU_GAN_SAU_MS = 30 * 60_000;

/**
 * Chuẩn bị sổ trước khi chuyển đổi (tính lúc đọc, không ghi sự kiện):
 *  - Phân công của tổ trưởng (nguoi_vao có du_lieu.phanCong) chỉ có hiệu lực khi người đó có mặt trong ngày ca: dời tới
 *    lúc vào ca nếu phân công trước khi tới; vắng cả ngày thì bỏ (không cộng giờ cho người vắng).
 *  - Có mặt quá 30 phút mà chưa có lần vào hàng nào (quét / phân công / ghi hộ) trong 30 phút đầu, chưa ra ca: tự gán từ
 *    lúc vào ca vào hàng gần nhất người đó làm trước hôm nay, nếu hàng đó chưa xong hết số đã nhận.
 * Có mặt = vao_ca (trạm hoặc điểm danh tay) — sau này nạp từ máy chấm công.
 */
export function boSungPhanCongTuGan(evts: SuKien[], now: number): SuKien[] {
  const ds = [...evts].sort(soSanhSuKien);
  // Lúc có mặt đầu tiên theo (mã NV, ngày ca)
  const coMat = new Map<string, number>();
  for (const e of ds) {
    if (e.loai !== 'vao_ca') continue;
    for (const n of nguoiTrongSuKien(e.duLieu)) {
      const t = n.luc ?? e.ts;
      const k = `${n.mnv}|${ngayCa(t)}`;
      if (!coMat.has(k) || coMat.get(k)! > t) coMat.set(k, t);
    }
  }
  const out: SuKien[] = [];
  for (const e of ds) {
    if (e.loai === 'nguoi_vao' && e.duLieu?.phanCong === true) {
      const mnv = mnvCua(e);
      const p = mnv ? coMat.get(`${mnv}|${ngayCa(e.ts)}`) : undefined;
      if (p === undefined) continue; // chưa / không có mặt trong ngày ca: phân công chưa có hiệu lực
      out.push(p > e.ts ? { ...e, ts: p } : e);
      continue;
    }
    out.push(e);
  }
  // Tự gán
  const vaoHang = out.filter(e => e.loai === 'nguoi_vao' && e.hex && e.congDoanId && mnvCua(e));
  const raCa = out.filter(e => e.loai === 'ra_ca' && mnvCua(e));
  for (const [k, p] of coMat) {
    const [mnv, ngay] = k.split('|');
    if (now < p + TU_GAN_SAU_MS) continue;
    if (vaoHang.some(e => mnvCua(e) === mnv && ngayCa(e.ts) === ngay && e.ts <= p + TU_GAN_SAU_MS)) continue;
    if (raCa.some(e => mnvCua(e) === mnv && e.ts >= p && e.ts <= p + TU_GAN_SAU_MS)) continue;
    // Tổ trưởng báo "Không làm" cho lần tự gán ngày này (Sửa ngày) — không phụ thuộc giờ ghi
    if (out.some(e => e.loai === 'nguoi_ra' && e.duLieu?.tuChoiTuGan === true && mnvCua(e) === mnv
      && String(e.duLieu?.ngayCa ?? ngayCa(e.ts)) === ngay)) continue;
    const truoc = vaoHang.filter(e => mnvCua(e) === mnv && e.ts < p && ngayCa(e.ts) < ngay).sort(soSanhSuKien).pop();
    if (!truoc) continue;
    // Hàng đó đã xong hết số đã nhận trước lúc vào ca thì không gán
    let nhan = 0, ht = 0;
    for (const e of out) {
      if (e.hex !== truoc.hex || e.congDoanId !== truoc.congDoanId || e.ts > p) continue;
      if (e.loai === 'nhan') nhan += e.soLuong ?? 0;
      if (e.loai === 'hoan_thanh') ht += e.soLuong ?? 0;
    }
    if (nhan > 0 && ht >= nhan) continue;
    out.push({
      ...truoc, id: `tugan:${mnv}:${ngay}`, ts: p, serverTs: p, suaCho: null,
      duLieu: { mnv, tram: true, tuGan: true },
    });
  }
  return out.sort(soSanhSuKien);
}

export interface KetQuaTram {
  doanNguoi: DoanNguoi[];
  /** Thay đổi người trên từng hạng mục theo thời gian — cùng dạng soNguoi của allocation (khai theo tên) */
  soNguoi: ThayDoiSoNguoi[];
  /** Đoạn hàng có ≥ 1 người */
  doanChay: Record<string, DoanChay[]>;
  /** Sự kiện giả theo cặp: bat_dau khi 0 → có người, tam_ngung khi về 0 (không tính lúc Xong hết) — cho state.ts */
  suKienGia: Record<string, SuKien[]>;
  /** Người đang ở từng hàng lúc `now` */
  dangO: Record<string, string[]>;
}

export interface TuyChonTram {
  now: number;
  /** Cửa sổ ca theo tổ (nhiều ngày) — để tự đóng cuối ca. Tổ không có: không tự đóng */
  cuaSoTheoTo?: Map<number, CuaSo[]> | Record<number, CuaSo[]>;
}

/**
 * Sổ trạm (đã bỏ sự kiện bị huỷ) → đoạn ở hàng từng người + đầu vào allocation / state.
 * `evts` gồm nguoi_vao / nguoi_ra / ra_ca của trạm, cộng nhan / hoan_thanh của các hạng mục (để biết Xong hết).
 * Sự kiện khác bị bỏ qua.
 */
export function chuyenDoiTram(evts: SuKien[], opts: TuyChonTram): KetQuaTram {
  const cuaSoTo = opts.cuaSoTheoTo instanceof Map ? opts.cuaSoTheoTo
    : new Map(Object.entries(opts.cuaSoTheoTo ?? {}).map(([k, v]) => [Number(k), v]));
  const khoiTheoTo = new Map<number, KhoiCa[]>();
  const khoiCua = (toId: number | null): KhoiCa[] | null => {
    if (toId === null || !cuaSoTo.has(toId)) return null;
    if (!khoiTheoTo.has(toId)) khoiTheoTo.set(toId, khoiCa(cuaSoTo.get(toId)!));
    return khoiTheoTo.get(toId)!;
  };

  const doanNguoi: DoanNguoi[] = [];
  const soNguoi: ThayDoiSoNguoi[] = [];
  const doanChay: Record<string, DoanChay[]> = {};
  const suKienGia: Record<string, SuKien[]> = {};
  /** Đoạn đang mở theo người + mốc tự đóng */
  const mo = new Map<string, { d: DoanNguoi; tuDong: number }>();
  /** Người đang ở theo cặp */
  const oHang = new Map<string, Set<string>>();
  const sl = new Map<string, { nhan: number; ht: number }>();
  let thuTuGia = 0;

  const gia = (loai: 'bat_dau' | 'tam_ngung', key: string, d: DoanNguoi, t: number, n: number, ten: string[]): void => {
    (suKienGia[key] ??= []).push({
      id: `tram:${loai}:${key}:${t}:${thuTuGia++}`, loai, hex: d.hex, congDoanId: d.congDoanId, toId: d.toId,
      soLuong: null, congDoanDenId: null, congDoanNguonId: null, xuongNguon: null,
      soNguoi: loai === 'bat_dau' ? n : null, lyDoTamNgung: null,
      duLieu: { tram: true, nguoi: ten }, ts: t, serverTs: t, suaCho: null,
    });
  };

  /** Ghi thay đổi người ở hàng `key` tại t (sau khi tập người đã đổi) */
  const doiHang = (key: string, d: DoanNguoi, t: number, truoc: number, laXong: boolean) => {
    const ds = [...(oHang.get(key) ?? [])].sort();
    const sau = ds.length;
    soNguoi.push({ key, at: t, soNguoi: sau, nguoi: ds });
    if (truoc === 0) {
      (doanChay[key] ??= []).push({ start: t, end: null });
      gia('bat_dau', key, d, t, sau, ds);
    } else if (sau === 0) {
      const ds2 = doanChay[key];
      if (ds2?.length) ds2[ds2.length - 1].end = t;
      if (!laXong) gia('tam_ngung', key, d, t, 0, []);
    }
  };

  const dong = (mnv: string, t: number, ketThuc: DoanNguoi['ketThuc'], suKienRa: string | null) => {
    const m = mo.get(mnv);
    if (!m) return;
    mo.delete(mnv);
    const d = m.d;
    d.end = Math.max(d.start, t);
    d.ketThuc = ketThuc;
    d.suKienRa = suKienRa;
    const set = oHang.get(d.key)!;
    const truoc = set.size;
    set.delete(mnv);
    doiHang(d.key, d, d.end, truoc, ketThuc === 'xong');
  };

  /** Đóng mọi đoạn có mốc tự đóng ≤ t (theo thứ tự mốc) */
  const tuDongDen = (t: number) => {
    const den = [...mo.entries()].filter(([, m]) => m.tuDong <= t).sort((a, b) => a[1].tuDong - b[1].tuDong);
    for (const [mnv, m] of den) dong(mnv, m.tuDong, 'tu_dong', null);
  };

  for (const e of boSungPhanCongTuGan(evts, opts.now)) {
    tuDongDen(e.ts);
    if (e.loai === 'nhan' || e.loai === 'hoan_thanh') {
      if (!e.hex || !e.congDoanId) continue;
      const key = pairKey(e.hex, e.congDoanId);
      const s = sl.get(key) ?? { nhan: 0, ht: 0 };
      if (e.loai === 'nhan') s.nhan += e.soLuong ?? 0; else s.ht += e.soLuong ?? 0;
      sl.set(key, s);
      // Xong hết số đã nhận: mọi người ở hàng ra tại mốc Xong (Xong một phần không đổi ai)
      if (e.loai === 'hoan_thanh' && s.nhan > 0 && s.ht >= s.nhan) {
        for (const mnv of [...(oHang.get(key) ?? [])]) dong(mnv, e.ts, 'xong', e.id);
      }
      continue;
    }
    if (!laSuKienTram(e)) continue;
    const mnv = mnvCua(e);
    if (!mnv) continue;
    if (e.loai === 'nguoi_vao') {
      if (!e.hex || !e.congDoanId) continue;
      const key = pairKey(e.hex, e.congDoanId);
      const dang = mo.get(mnv);
      if (dang?.d.key === key) {
        // Đã ở hàng này; tự gán được tổ trưởng / người đó xác nhận (phân công, quét, ghi hộ) thì đổi nguồn đoạn
        if (dang.d.nguon === 'tu_gan' && nguonCua(e) !== 'tu_gan') dang.d.nguon = nguonCua(e);
        continue;
      }
      if (dang) dong(mnv, e.ts, 'doi_hang', e.id);
      const d: DoanNguoi = {
        mnv, key, hex: e.hex, congDoanId: e.congDoanId, toId: e.toId, start: e.ts, end: null, ketThuc: null,
        suKienVao: e.id, suKienRa: null, nguon: nguonCua(e),
      };
      doanNguoi.push(d);
      const td = mocTuDong(khoiCua(e.toId), e.ts);
      // Ngoài ca: đoạn rỗng gắn cờ, hàng không chạy (tổ trưởng khai tăng ca phủ lúc đó thì lần tính sau tự đúng)
      if (td.ngoaiCa) { d.end = e.ts; d.ketThuc = 'ngoai_ca'; continue; }
      mo.set(mnv, { d, tuDong: td.end });
      if (!oHang.has(key)) oHang.set(key, new Set());
      const set = oHang.get(key)!;
      const truoc = set.size;
      set.add(mnv);
      doiHang(key, d, e.ts, truoc, false);
    } else if (e.loai === 'nguoi_ra' || e.loai === 'ra_ca') {
      if (e.duLieu?.tuChoiTuGan === true) continue; // chỉ là cờ cho boSungPhanCongTuGan
      // Ra khỏi một hàng cụ thể (trạm, ghi hộ lùi giờ): người đó lúc ấy không ở hàng này thì bỏ qua
      if (e.loai === 'nguoi_ra' && e.hex && e.congDoanId && mo.get(mnv) && mo.get(mnv)!.d.key !== pairKey(e.hex, e.congDoanId)) continue;
      dong(mnv, e.ts, 'ra', e.id);
    }
  }
  tuDongDen(opts.now);

  // Bỏ đoạn chạy rỗng (vào rồi ra cùng mốc)
  for (const k of Object.keys(doanChay)) {
    doanChay[k] = doanChay[k].filter(d => d.end === null || d.end > d.start);
    if (!doanChay[k].length) delete doanChay[k];
  }
  const dangO: Record<string, string[]> = {};
  for (const [k, set] of oHang) if (set.size) dangO[k] = [...set].sort();
  // Tự gán bị tổ trưởng báo "không làm" (ra ngay tại mốc gán): bỏ đoạn rỗng
  return { doanNguoi: doanNguoi.filter(d => !(d.nguon === 'tu_gan' && d.end !== null && d.end <= d.start)), soNguoi, doanChay, suKienGia, dangO };
}

// ---------------------------------------------------------------------------
// Sửa ngày: cờ trên dòng thời gian một người
// ---------------------------------------------------------------------------
export const TRONG_TOI_DA_MS = 30 * 60_000;
export const DOAN_TOI_DA_MS = 4 * GIO_MS;

export type CoSuaNgay = 'tu_dong' | 'ngoai_ca' | 'khoang_trong' | 'doan_dai' | 'khong_vao_hang';

/**
 * Cờ cho một người trong một ngày: các đoạn ở hàng (đã sắp) so với lúc có mặt [vao, ra).
 * Khoảng trống > 30 phút trong ca không ở hàng nào, đoạn > 4 giờ không đổi, vào ca nhưng không vào hàng nào, tự đóng.
 */
export function coSuaNgay(doan: DoanNguoi[], coMat: Array<{ start: number; end: number | null }>, now: number): CoSuaNgay[] {
  const co = new Set<CoSuaNgay>();
  const ds = [...doan].sort((a, b) => a.start - b.start);
  for (const d of ds) {
    if (d.ketThuc === 'tu_dong') co.add('tu_dong');
    if (d.ketThuc === 'ngoai_ca') co.add('ngoai_ca');
    if ((d.end ?? now) - d.start > DOAN_TOI_DA_MS) co.add('doan_dai');
  }
  if (coMat.length && !ds.length) co.add('khong_vao_hang');
  for (const c of coMat) {
    const cEnd = c.end ?? now;
    let t = c.start;
    for (const d of ds) {
      const s = Math.max(d.start, c.start);
      const e = Math.min(d.end ?? now, cEnd);
      if (e <= s) continue;
      if (s - t > TRONG_TOI_DA_MS) co.add('khoang_trong');
      t = Math.max(t, e);
    }
    if (ds.length && cEnd - t > TRONG_TOI_DA_MS && c.end !== null) co.add('khoang_trong');
  }
  return [...co].sort();
}
