import type { CuaSo, LichCaRow, LoaiCa, DoanChay } from './types.js';
import { LOAI_CA_TANG_CA } from './types.js';

// ============================================================================
// PHÂN BỔ GIỜ CÔNG THEO QUÂN SỐ TỔ (quy tắc đo trong docs/designs/xuong-checkin.md, D3 /office-hours)
//
// 1. Cửa sổ làm việc của tổ trong ngày = ca chính (trừ khoảng nghỉ) + các ca tăng ca tổ đã khai.
//    Giờ địa phương Asia/Ho_Chi_Minh (UTC+7, không đổi giờ mùa). Ca qua đêm (ca 4) thuộc ngày bắt đầu ca.
//    Chủ nhật không có ca chính; chỉ tính khi tổ khai tăng ca "chu_nhat".
// 2. Thời gian chạy của hạng mục = các đoạn bat_dau/tiep_tuc → tam_ngung/hoan_thanh, cắt theo cửa sổ.
// 3. Chia cửa sổ thành các đoạn mà tập hạng mục đang chạy và số người khai không đổi. Mỗi đoạn:
//    giờ người = quân số × độ dài; chia cho hạng mục theo tỷ lệ số người khai. Khai ít hơn quân số → phần dư là
//    giờ chờ; khai nhiều hơn → co theo tỷ lệ + cờ "khai_vuot_quan_so"; không hạng mục nào chạy → toàn bộ là giờ chờ.
// 4. Ca chưa chốt quân số: giờ công chỉ theo số người khai trên từng hạng mục, không tính giờ chờ, cờ
//    "chua_chot_quan_so".
//    Giờ chờ tách lý do: có hạng mục chạy nhưng khai ít hơn quân số → "nguoi_ranh"; không hạng mục nào chạy → lý do
//    tạm ngưng của hạng mục vừa tạm ngưng gần nhất (đang tạm ngưng lúc đó), không có thì "khong_viec".
// 5. Tăng ca: hạng mục bị bỏ chọn trong lần khai tăng ca của tổ coi như không chạy trong cửa sổ đó.
// R3-3: hạng mục không được xác nhận cuối ngày: ngày kế vẫn tính nhưng cờ "chua_xac_nhan"; từ ngày thứ 2 liên
//       tiếp không xác nhận thì ngừng tính (nơi gọi truyền vào chuaXacNhan / ngungTinh).
// ============================================================================

const VN_OFFSET = '+07:00';
const GIO_MS = 3_600_000;

const moc = (ngay: string, hhmm: string): number => Date.parse(`${ngay}T${hhmm.slice(0, 5)}:00${VN_OFFSET}`);

/** Thứ trong tuần của một ngày 'YYYY-MM-DD' (0 = Chủ nhật) */
export const thuTrongTuan = (ngay: string): number => new Date(`${ngay}T12:00:00${VN_OFFSET}`).getUTCDay();

/** Trừ các khoảng nghỉ khỏi [start, end) */
function truNghi(start: number, end: number, nghi: Array<[number, number]>): Array<[number, number]> {
  let doan: Array<[number, number]> = [[start, end]];
  for (const [ns, ne] of nghi) {
    const next: Array<[number, number]> = [];
    for (const [s, e] of doan) {
      if (ne <= s || ns >= e) { next.push([s, e]); continue; }
      if (ns > s) next.push([s, ns]);
      if (ne < e) next.push([ne, e]);
    }
    doan = next;
  }
  return doan.filter(([s, e]) => e > s);
}

/** Dựng cửa sổ của một loại ca trong ngày `ngay` */
export function cuaSoCuaCa(ngay: string, ca: LichCaRow): CuaSo[] {
  const start = moc(ngay, ca.gioBatDau);
  let end = moc(ngay, ca.gioKetThuc);
  if (end <= start) end += 24 * GIO_MS; // qua đêm
  const nghi = (ca.nghi ?? []).map(([a, b]): [number, number] => {
    let ns = moc(ngay, a);
    let ne = moc(ngay, b);
    if (ns < start) { ns += 24 * GIO_MS; ne += 24 * GIO_MS; }
    if (ne <= ns) ne += 24 * GIO_MS;
    return [ns, ne];
  });
  return truNghi(start, end, nghi).map(([s, e]) => ({ loaiCa: ca.loaiCa, start: s, end: e }));
}

/**
 * Cửa sổ làm việc của tổ trong ngày: ca chính (trừ Chủ nhật) + các ca tăng ca đã khai.
 * Ca tăng ca trùng giờ với ca chính (vd "chu_nhat" vào ngày thường) vẫn tính riêng theo loại ca.
 */
export function cuaSoTrongNgay(ngay: string, lichCa: LichCaRow[], caTangCaDaKhai: LoaiCa[]): CuaSo[] {
  const theoLoai = new Map(lichCa.map(c => [c.loaiCa, c]));
  const out: CuaSo[] = [];
  const chinh = theoLoai.get('chinh');
  if (chinh && thuTrongTuan(ngay) !== 0) out.push(...cuaSoCuaCa(ngay, chinh));
  for (const loai of new Set(caTangCaDaKhai)) {
    if (!LOAI_CA_TANG_CA.includes(loai)) continue;
    const ca = theoLoai.get(loai);
    if (ca) out.push(...cuaSoCuaCa(ngay, ca));
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface ThayDoiSoNguoi { key: string; at: number; soNguoi: number }

export interface DauVaoPhanBo {
  cuaSo: CuaSo[];
  /** Quân số theo loại ca; null / thiếu = chưa chốt */
  quanSo: Partial<Record<LoaiCa, number | null>>;
  /** Đoạn chạy theo khoá cặp (hex|công đoạn) */
  doanChay: Record<string, DoanChay[]>;
  /** Số người khai trên từng hạng mục theo thời gian (bat_dau / tiep_tuc / chia_nguoi) */
  soNguoi: ThayDoiSoNguoi[];
  /** Hạng mục bỏ chọn trong lần khai tăng ca, theo loại ca */
  boChonTangCa?: Partial<Record<LoaiCa, string[]>>;
  /** Không xác nhận từ 2 ngày liên tiếp → không tính */
  ngungTinh?: string[];
  /** Không xác nhận hôm trước → vẫn tính, gắn cờ */
  chuaXacNhan?: string[];
  /** Đoạn tạm ngưng theo khoá cặp (từ tam_ngung tới lúc chạy lại / xong) — để tách lý do giờ chờ */
  doanNgung?: Record<string, Array<{ start: number; end: number | null; lyDo: string }>>;
  /** Giờ hiện tại, dùng cắt đoạn đang chạy (end = null) */
  now: number;
}

export interface KetQuaHangMuc { gioChay: number; gioCongThuong: number; gioCongTangCa: number; co: string[] }
export interface KetQuaPhanBo {
  theoHangMuc: Record<string, KetQuaHangMuc>;
  gioCho: { thuong: number; tangCa: number };
  /** Tổng giờ người của tổ theo quân số (ca đã chốt) */
  gioNguoiTo: { thuong: number; tangCa: number };
  /** Giờ chờ (thường + tăng ca) theo lý do: nguoi_ranh, khong_viec, hoặc mã lý do tạm ngưng */
  gioChoLyDo: Record<string, number>;
  co: string[];
}

const lamTron = (h: number) => Math.round(h * 1000) / 1000;

export function phanBoGioCong(input: DauVaoPhanBo): KetQuaPhanBo {
  const ngung = new Set(input.ngungTinh ?? []);
  const chuaXn = new Set(input.chuaXacNhan ?? []);
  const keys = Object.keys(input.doanChay).filter(k => !ngung.has(k));

  // Số người theo thời gian cho từng hạng mục (lấy giá trị khai gần nhất trước đoạn)
  const soNguoiTheoKey = new Map<string, ThayDoiSoNguoi[]>();
  for (const c of [...input.soNguoi].sort((a, b) => a.at - b.at)) {
    if (!soNguoiTheoKey.has(c.key)) soNguoiTheoKey.set(c.key, []);
    soNguoiTheoKey.get(c.key)!.push(c);
  }
  const soNguoiLuc = (key: string, t: number): number => {
    const ds = soNguoiTheoKey.get(key);
    if (!ds) return 0;
    let v = 0;
    for (const c of ds) { if (c.at <= t) v = c.soNguoi; else break; }
    return Math.max(0, v);
  };
  const dangChayLuc = (key: string, t: number): boolean =>
    input.doanChay[key].some(d => d.start <= t && t < (d.end ?? input.now));

  const out: Record<string, KetQuaHangMuc> = {};
  for (const k of keys) out[k] = { gioChay: 0, gioCongThuong: 0, gioCongTangCa: 0, co: chuaXn.has(k) ? ['chua_xac_nhan'] : [] };
  const coTo = new Set<string>();
  const gioCho = { thuong: 0, tangCa: 0 };
  const gioNguoiTo = { thuong: 0, tangCa: 0 };
  const coHangMuc = (k: string, c: string) => { if (!out[k].co.includes(c)) out[k].co.push(c); };
  const gioChoLyDo: Record<string, number> = {};
  const choVi = (lyDo: string, h: number) => { if (h > 0) gioChoLyDo[lyDo] = (gioChoLyDo[lyDo] ?? 0) + h; };
  const doanNgung = input.doanNgung ?? {};
  // Không hạng mục nào chạy lúc t: lý do của hạng mục tạm ngưng gần nhất còn đang ngưng
  const lyDoCho = (t: number): string => {
    let tot: { start: number; lyDo: string } | null = null;
    for (const ds of Object.values(doanNgung)) {
      for (const d of ds) if (d.start <= t && t < (d.end ?? input.now) && (!tot || d.start > tot.start)) tot = d;
    }
    return tot ? tot.lyDo : 'khong_viec';
  };

  for (const cs of input.cuaSo) {
    const laTangCa = cs.loaiCa !== 'chinh';
    const boChon = new Set(laTangCa ? input.boChonTangCa?.[cs.loaiCa] ?? [] : []);
    const ks = keys.filter(k => !boChon.has(k));
    const end = Math.min(cs.end, input.now);
    if (end <= cs.start) continue;

    // Mốc chia đoạn: biên cửa sổ, biên đoạn chạy, thời điểm đổi số người
    const mocs = new Set<number>([cs.start, end]);
    for (const k of ks) {
      for (const d of input.doanChay[k]) {
        for (const t of [d.start, d.end ?? input.now]) if (t > cs.start && t < end) mocs.add(t);
      }
      for (const c of soNguoiTheoKey.get(k) ?? []) if (c.at > cs.start && c.at < end) mocs.add(c.at);
    }
    for (const ds of Object.values(doanNgung)) {
      for (const d of ds) for (const t of [d.start, d.end ?? input.now]) if (t > cs.start && t < end) mocs.add(t);
    }
    const ds = [...mocs].sort((a, b) => a - b);

    const q = input.quanSo[cs.loaiCa];
    const daChot = typeof q === 'number' && q >= 0;
    if (!daChot) coTo.add('chua_chot_quan_so');

    for (let i = 0; i + 1 < ds.length; i++) {
      const s = ds[i];
      const gio = (ds[i + 1] - s) / GIO_MS;
      if (gio <= 0) continue;
      const chay = ks.filter(k => dangChayLuc(k, s));
      for (const k of chay) out[k].gioChay += gio;

      const khai = chay.map(k => [k, soNguoiLuc(k, s)] as const);
      const tongKhai = khai.reduce((a, [, n]) => a + n, 0);
      const cong = (k: string, h: number) => {
        if (laTangCa) out[k].gioCongTangCa += h; else out[k].gioCongThuong += h;
      };

      if (!daChot) {
        for (const [k, n] of khai) cong(k, n * gio);
        continue;
      }
      const Q = q as number;
      if (laTangCa) gioNguoiTo.tangCa += Q * gio; else gioNguoiTo.thuong += Q * gio;
      if (tongKhai === 0) {
        if (laTangCa) gioCho.tangCa += Q * gio; else gioCho.thuong += Q * gio;
        choVi(lyDoCho(s), Q * gio);
        continue;
      }
      if (tongKhai <= Q) {
        for (const [k, n] of khai) cong(k, n * gio);
        const du = (Q - tongKhai) * gio;
        if (laTangCa) gioCho.tangCa += du; else gioCho.thuong += du;
        choVi('nguoi_ranh', du);
      } else {
        for (const [k, n] of khai) { cong(k, (n * Q / tongKhai) * gio); coHangMuc(k, 'khai_vuot_quan_so'); }
        coTo.add('khai_vuot_quan_so');
      }
    }
  }

  for (const k of keys) {
    out[k].gioChay = lamTron(out[k].gioChay);
    out[k].gioCongThuong = lamTron(out[k].gioCongThuong);
    out[k].gioCongTangCa = lamTron(out[k].gioCongTangCa);
    out[k].co.sort();
  }
  return {
    theoHangMuc: out,
    gioCho: { thuong: lamTron(gioCho.thuong), tangCa: lamTron(gioCho.tangCa) },
    gioNguoiTo: { thuong: lamTron(gioNguoiTo.thuong), tangCa: lamTron(gioNguoiTo.tangCa) },
    gioChoLyDo: Object.fromEntries(Object.entries(gioChoLyDo).map(([k, v]) => [k, lamTron(v)])),
    co: [...coTo].sort(),
  };
}

/**
 * R3-3: số ngày làm việc (bỏ Chủ nhật) liên tiếp trước `ngay` mà hạng mục đang chạy nhưng không có
 * hoạt động / xác nhận. `ngayHoatDongCuoi` là ngày gần nhất có sự kiện của cặp đó (trừ tien_do) hoặc
 * xác nhận "vẫn đang làm". Trả 'tinh' | 'chua_xac_nhan' | 'ngung'.
 */
export function trangThaiXacNhan(ngay: string, ngayHoatDongCuoi: string): 'tinh' | 'chua_xac_nhan' | 'ngung' {
  if (ngayHoatDongCuoi >= ngay) return 'tinh';
  let d = new Date(`${ngayHoatDongCuoi}T12:00:00${VN_OFFSET}`);
  let boQua = 0;
  for (;;) {
    d = new Date(d.getTime() + 24 * GIO_MS);
    const key = d.toISOString().slice(0, 10);
    if (key >= ngay) break;
    if (d.getUTCDay() !== 0) boQua++;
  }
  // Hoạt động hôm qua (ngày làm việc liền trước) → tính bình thường
  if (boQua === 0) return 'tinh';
  if (boQua === 1) return 'chua_xac_nhan';
  return 'ngung';
}
