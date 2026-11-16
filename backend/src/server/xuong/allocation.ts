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
// 6. Chấm công theo người (docs/designs/xuong-cham-cong.md): ca có điểm danh (coMat) thì quân số tại mỗi thời điểm =
//    số người đang có mặt (đến trễ / về sớm / mượn người), và chỉ người đang có mặt mới được tính giờ — gắn tên vào
//    hạng mục mà đã về sớm / không ở lại tăng ca thì không cộng. Ca không điểm danh: người gắn tên coi như có mặt.
//    Hạng mục khai theo tên (nguoi): mỗi người nhận đúng giờ của đoạn mình được gắn (co theo quân số như trên);
//    người có mặt mà không gắn hạng mục nào là giờ chờ của người đó.
// 7. Hạng mục có bấm chạy / dừng ngoài mọi ca trong ngày (quên khai tăng ca, Chủ nhật chưa khai): phần đó không tính
//    giờ công như cũ, chỉ gắn cờ "chay_ngoai_ca" + số giờ bị loại (doanNgoaiCa) để tổ trưởng khai bù tăng ca.
// R3-3: hạng mục không được xác nhận cuối ngày: ngày kế vẫn tính nhưng cờ "chua_xac_nhan"; từ ngày thứ 2 liên
//       tiếp không xác nhận thì ngừng tính (nơi gọi truyền vào chuaXacNhan / ngungTinh).
// ============================================================================

const VN_OFFSET = '+07:00';
const GIO_MS = 3_600_000;

const moc = (ngay: string, hhmm: string): number => Date.parse(`${ngay}T${hhmm.slice(0, 5)}:00${VN_OFFSET}`);

/**
 * Ngày-tổ gần như không có việc: thường là quân số / điểm danh sai (chọn cả tổ khi chỉ vài người làm), một ngày như vậy
 * làm lệch cả kỳ báo cáo. Dưới 1 giờ công thì bỏ qua (vừa điểm danh xong chưa nói lên gì).
 */
export const tyLeCoViecThap = (gioNguoi: number, gioCong: number): boolean => gioNguoi >= 1 && gioCong / gioNguoi < 0.1;

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

export interface ThayDoiSoNguoi { key: string; at: number; soNguoi: number; /** Mã NV người làm (khai theo tên) */ nguoi?: string[] | null }

/** Một lần có mặt của một người trong một loại ca (end = null: tới hết ca) */
export interface DoanCoMat { mnv: string; start: number; end: number | null }

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
  /** Điểm danh theo loại ca — có thì quân số tính theo người có mặt từng lúc (bỏ qua quanSo của ca đó) */
  coMat?: Partial<Record<LoaiCa, DoanCoMat[]>>;
  /** Đoạn tạm ngưng theo khoá cặp (từ tam_ngung tới lúc chạy lại / xong) — để tách lý do giờ chờ */
  doanNgung?: Record<string, Array<{ start: number; end: number | null; lyDo: string }>>;
  /** Giờ hiện tại, dùng cắt đoạn đang chạy (end = null) */
  now: number;
  /** Khung ngày ca đang tính (06:00 → 06:00 hôm sau) — có thì gắn cờ "chay_ngoai_ca" (không đổi giờ công) */
  khungNgay?: { start: number; end: number };
}

export interface KetQuaHangMuc {
  gioChay: number; gioCongThuong: number; gioCongTangCa: number; co: string[];
  /** Giờ người theo số người KHAI (trước khi co theo quân số) — số người bình quân = gioNguoiKhai / gioChay */
  gioNguoiKhai: number;
  /** Số người khai nhiều nhất / ít nhất trong lúc chạy (0 = chưa chạy) */
  soNguoiMax: number;
  soNguoiMin: number;
  /** Giờ chạy ngoài mọi ca (không tính giờ công) — chỉ có khi > 0, kèm cờ "chay_ngoai_ca" */
  gioNgoaiCa?: number;
}
export interface KetQuaNguoi {
  /** Giờ có mặt trong cửa sổ ca (trừ nghỉ) */
  coMatThuong: number; coMatTangCa: number;
  /** Giờ công đã gắn hạng mục */
  congThuong: number; congTangCa: number;
  /** Giờ có mặt mà không gắn hạng mục nào */
  cho: number;
  theoHangMuc: Record<string, number>;
}
export interface KetQuaPhanBo {
  theoHangMuc: Record<string, KetQuaHangMuc>;
  gioCho: { thuong: number; tangCa: number };
  /** Tổng giờ người của tổ theo quân số (ca đã chốt) */
  gioNguoiTo: { thuong: number; tangCa: number };
  /** Giờ chờ (thường + tăng ca) theo lý do: nguoi_ranh, khong_viec, hoặc mã lý do tạm ngưng */
  gioChoLyDo: Record<string, number>;
  /** Theo người (mã NV) — chỉ có khi tổ điểm danh / khai tên */
  theoNguoi: Record<string, KetQuaNguoi>;
  /** Giờ (đồng hồ) có hạng mục chạy ngoài mọi ca trong ngày — bị loại khỏi giờ công; chỉ có khi > 0 */
  gioChayNgoaiCa?: number;
  co: string[];
}

const lamTron = (h: number) => Math.round(h * 1000) / 1000;

/** Hợp các khoảng [s, e) (bỏ khoảng rỗng) */
function hopKhoang(ds: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [s, e] of ds.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])) {
    const cuoi = out[out.length - 1];
    if (cuoi && s <= cuoi[1]) cuoi[1] = Math.max(cuoi[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * Phần chạy ngoài mọi ca của một hạng mục trong khung ngày ca. Chỉ tính khi có bấm thật ngoài ca (bắt đầu / tiếp tục
 * hoặc dừng / xong lúc không có ca nào): hạng mục bấm tay để chạy qua đêm (bình thường, không ai tạm ngưng lúc tan ca)
 * không bị tính. Nghỉ trưa và khoảng giữa hai ca trong ngày coi như trong ca.
 *  - bấm bắt đầu ngoài ca: từ lúc bấm tới khi vào ca (hoặc dừng / hết khung);
 *  - bấm dừng ngoài ca: từ lúc hết ca (hoặc lúc bắt đầu / đầu khung) tới lúc bấm.
 */
export function doanNgoaiCa(doan: DoanChay[], cuaSo: CuaSo[], khung: { start: number; end: number }, now: number): Array<[number, number]> {
  const dau = cuaSo.length ? Math.min(...cuaSo.map(c => c.start)) : null;
  const het = cuaSo.length ? Math.max(...cuaSo.map(c => c.end)) : null;
  const trongKhung = (t: number) => t >= khung.start && t < khung.end;
  const ngoaiCa = (t: number) => dau === null || het === null || t < dau || t > het;
  const ra: Array<[number, number]> = [];
  for (const d of doan) {
    const ketThuc = Math.min(d.end ?? now, now);
    if (ketThuc <= d.start) continue;
    if (trongKhung(d.start) && ngoaiCa(d.start)) {
      const toi = dau !== null && d.start < dau ? dau : khung.end;
      ra.push([d.start, Math.min(ketThuc, toi, khung.end)]);
    }
    if (d.end !== null && d.end <= now && trongKhung(d.end) && ngoaiCa(d.end)) {
      const tu = het !== null && d.end > het ? het : khung.start;
      ra.push([Math.max(d.start, tu, khung.start), d.end]);
    }
  }
  return hopKhoang(ra);
}

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
  const khaiLuc = (key: string, t: number): ThayDoiSoNguoi | null => {
    const ds = soNguoiTheoKey.get(key);
    if (!ds) return null;
    let v: ThayDoiSoNguoi | null = null;
    for (const c of ds) { if (c.at <= t) v = c; else break; }
    return v;
  };
  /** Khai theo tên thì số người = số tên */
  const soNguoiLuc = (key: string, t: number): number => {
    const c = khaiLuc(key, t);
    if (!c) return 0;
    return Math.max(0, Array.isArray(c.nguoi) ? c.nguoi.length : c.soNguoi);
  };
  const nguoiLuc = (key: string, t: number): string[] | null => {
    const c = khaiLuc(key, t);
    return c && Array.isArray(c.nguoi) ? c.nguoi : null;
  };
  const theoNguoi: Record<string, KetQuaNguoi> = {};
  const nguoi = (mnv: string) => (theoNguoi[mnv] ??= { coMatThuong: 0, coMatTangCa: 0, congThuong: 0, congTangCa: 0, cho: 0, theoHangMuc: {} });
  const dangChayLuc = (key: string, t: number): boolean =>
    input.doanChay[key].some(d => d.start <= t && t < (d.end ?? input.now));

  const out: Record<string, KetQuaHangMuc> = {};
  for (const k of keys) out[k] = { gioChay: 0, gioCongThuong: 0, gioCongTangCa: 0, gioNguoiKhai: 0, soNguoiMax: 0, soNguoiMin: 0, co: chuaXn.has(k) ? ['chua_xac_nhan'] : [] };
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

  // Người có điểm danh (bất kỳ ca nào) trong ngày ở tổ
  const coDiemDanhNgay = new Set<string>(Object.values(input.coMat ?? {}).flatMap(ds => (ds ?? []).map(d => d.mnv)));
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
    const coMat = input.coMat?.[cs.loaiCa] ?? [];
    const coDiemDanh = coMat.length > 0;
    for (const d of coMat) for (const t of [d.start, d.end ?? input.now]) if (t > cs.start && t < end) mocs.add(t);
    const ds = [...mocs].sort((a, b) => a - b);

    const q = input.quanSo[cs.loaiCa];
    const daChot = coDiemDanh || (typeof q === 'number' && q >= 0);
    if (!daChot) coTo.add('chua_chot_quan_so');

    for (let i = 0; i + 1 < ds.length; i++) {
      const s = ds[i];
      const gio = (ds[i + 1] - s) / GIO_MS;
      if (gio <= 0) continue;
      const chay = ks.filter(k => dangChayLuc(k, s));
      for (const k of chay) out[k].gioChay += gio;

      // "Ai làm" không phụ thuộc điểm danh: người gắn tên vào hạng mục đang chạy mà KHÔNG có điểm danh nào trong ngày
      // ở tổ (mượn tổ khác, người mới) coi như có mặt lúc đó. Người CÓ điểm danh trong ngày mà lúc đó không có mặt ở ca
      // này (đã ra ca / về sớm, chưa vào, không ở lại tăng ca) thì không cộng giờ (số người khai cũng không đếm người đó).
      const coMatDd = new Set<string>();
      if (coDiemDanh) for (const d of coMat) if (d.start <= s && s < (d.end ?? input.now)) coMatDd.add(d.mnv);
      const tenLuc = (k: string): string[] | null => {
        const ds = nguoiLuc(k, s);
        return ds && coDiemDanh ? ds.filter(m => coMatDd.has(m) || !coDiemDanhNgay.has(m)) : ds;
      };
      const khai = chay.map(k => { const t = tenLuc(k); return [k, t ? t.length : soNguoiLuc(k, s)] as const; });
      const coMatLuc = new Set<string>(coMatDd);
      for (const k of chay) for (const m of tenLuc(k) ?? []) coMatLuc.add(m);
      for (const [k, n] of khai) {
        out[k].gioNguoiKhai += n * gio;
        if (n > out[k].soNguoiMax) out[k].soNguoiMax = n;
        if (n > 0 && (out[k].soNguoiMin === 0 || n < out[k].soNguoiMin)) out[k].soNguoiMin = n;
      }
      const tongKhai = khai.reduce((a, [, n]) => a + n, 0);
      const cong = (k: string, h: number) => {
        if (laTangCa) out[k].gioCongTangCa += h; else out[k].gioCongThuong += h;
      };

      // Giờ có mặt / giờ chờ / giờ công từng người (hệ số co khi khai vượt quân số)
      const tinhNguoi = (heSo: number) => {
        const daGan = new Set<string>();
        for (const k of chay) {
          for (const m of tenLuc(k) ?? []) {
            const x = nguoi(m);
            const h = gio * heSo;
            if (laTangCa) x.congTangCa += h; else x.congThuong += h;
            x.theoHangMuc[k] = (x.theoHangMuc[k] ?? 0) + h;
            daGan.add(m);
          }
        }
        for (const m of coMatLuc) {
          const x = nguoi(m);
          if (laTangCa) x.coMatTangCa += gio; else x.coMatThuong += gio;
          if (!daGan.has(m)) x.cho += gio;
        }
      };

      if (!daChot) {
        for (const [k, n] of khai) cong(k, n * gio);
        tinhNguoi(1);
        continue;
      }
      const Q = coDiemDanh ? coMatLuc.size : (q as number);
      if (laTangCa) gioNguoiTo.tangCa += Q * gio; else gioNguoiTo.thuong += Q * gio;
      tinhNguoi(tongKhai > Q && tongKhai > 0 ? Q / tongKhai : 1);
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

  // Chạy ngoài giờ ca (quên khai tăng ca, làm Chủ nhật chưa khai): chỉ gắn cờ + số giờ bị loại, giờ công giữ nguyên
  let gioChayNgoaiCa = 0;
  if (input.khungNgay) {
    const tatCa: Array<[number, number]> = [];
    for (const k of keys) {
      const ds = doanNgoaiCa(input.doanChay[k], input.cuaSo, input.khungNgay, input.now);
      const h = ds.reduce((a, [s, e]) => a + (e - s) / GIO_MS, 0);
      if (h <= 0) continue;
      out[k].gioNgoaiCa = lamTron(h);
      coHangMuc(k, 'chay_ngoai_ca');
      tatCa.push(...ds);
    }
    gioChayNgoaiCa = hopKhoang(tatCa).reduce((a, [s, e]) => a + (e - s) / GIO_MS, 0);
    if (gioChayNgoaiCa > 0) coTo.add('chay_ngoai_ca');
  }

  for (const k of keys) {
    out[k].gioChay = lamTron(out[k].gioChay);
    out[k].gioCongThuong = lamTron(out[k].gioCongThuong);
    out[k].gioCongTangCa = lamTron(out[k].gioCongTangCa);
    out[k].gioNguoiKhai = lamTron(out[k].gioNguoiKhai);
    out[k].co.sort();
  }
  return {
    theoHangMuc: out,
    gioCho: { thuong: lamTron(gioCho.thuong), tangCa: lamTron(gioCho.tangCa) },
    gioNguoiTo: { thuong: lamTron(gioNguoiTo.thuong), tangCa: lamTron(gioNguoiTo.tangCa) },
    gioChoLyDo: Object.fromEntries(Object.entries(gioChoLyDo).map(([k, v]) => [k, lamTron(v)])),
    theoNguoi: Object.fromEntries(Object.entries(theoNguoi).map(([m, x]) => [m, {
      coMatThuong: lamTron(x.coMatThuong), coMatTangCa: lamTron(x.coMatTangCa),
      congThuong: lamTron(x.congThuong), congTangCa: lamTron(x.congTangCa), cho: lamTron(x.cho),
      theoHangMuc: Object.fromEntries(Object.entries(x.theoHangMuc).map(([k, v]) => [k, lamTron(v)])),
    }])),
    ...(gioChayNgoaiCa > 0 ? { gioChayNgoaiCa: lamTron(gioChayNgoaiCa) } : {}),
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
