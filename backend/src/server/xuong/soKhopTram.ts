import type { KetQuaPhanBo } from './allocation.js';

// ============================================================================
// SO KHỚP TRẠM (tuần chạy song song — docs/designs/xuong-tram-quet.md T5): giờ công chính thức theo bấm tay so với số
// tính từ sổ trạm (gioCongToNgay → soKhopTram). Hàm thuần, không đọc DB; route Báo cáo gom kết quả từng (tổ, ngày).
// ============================================================================

/** Chênh từ 10% và từ 0,5 giờ trở lên thì coi là lớn (tô màu) — dưới 0,5 giờ là lệch vài phút quét thẻ */
export const NGUONG_CHENH_PHAN_TRAM = 10;
export const NGUONG_CHENH_GIO = 0.5;

const lam = (n: number) => Math.round(n * 100) / 100;

export interface SoSanh {
  /** Theo bấm tay — số chính thức */
  chinhThuc: number;
  /** Theo sổ trạm — chỉ để so */
  tram: number;
  /** tram − chinhThuc */
  chenh: number;
  /** chenh / chinhThuc (%); chinhThuc = 0 thì null */
  phanTram: number | null;
  lon: boolean;
}

export function soSanh(chinhThuc: number, tram: number): SoSanh {
  const chenh = tram - chinhThuc;
  const phanTram = chinhThuc > 0 ? Math.round((chenh / chinhThuc) * 100) : null;
  const lon = Math.abs(chenh) >= NGUONG_CHENH_GIO && (phanTram === null || Math.abs(phanTram) >= NGUONG_CHENH_PHAN_TRAM);
  return { chinhThuc: lam(chinhThuc), tram: lam(tram), chenh: lam(chenh), phanTram, lon };
}

type DiemDanh = Record<string, { vao: number; ra: number | null }>;
type PhanBo = Pick<KetQuaPhanBo, 'gioNguoiTo' | 'theoHangMuc' | 'theoNguoi'> & { diemDanh?: DiemDanh };
/** Kết quả gioCongToNgay của một (tổ, ngày) — chỉ ngày song song mới có soKhopTram */
export interface NgaySoKhopVao {
  toId: number; ngay: string;
  kq: PhanBo & { soKhopTram?: PhanBo };
}

export interface SoKhopNguoi {
  mnv: string; hoTen: string | null;
  vao: { chinhThuc: number | null; tram: number | null };
  ra: { chinhThuc: number | null; tram: number | null };
  gioCong: SoSanh; gioCongSp: SoSanh;
}
export interface SoKhopNgay {
  ngay: string;
  gioCong: SoSanh; gioCongSp: SoSanh;
  /** Số người có tên (điểm danh / khai tên) mỗi bên */
  soNguoi: { chinhThuc: number; tram: number };
  /** Ngày song song mà trạm không ghi được gì (chưa ai quét) */
  khongCoTram: boolean;
  /** Người có chênh lớn trước */
  theoNguoi: SoKhopNguoi[];
}
export interface SoKhopTo {
  toId: number; ten: string;
  gioCong: SoSanh; gioCongSp: SoSanh;
  soNgay: number; soNgayLon: number;
  /** Mới nhất trước */
  theoNgay: SoKhopNgay[];
}

const tongGio = (g: { thuong: number; tangCa: number }) => g.thuong + g.tangCa;
const gioSp = (pb: PhanBo) => Object.values(pb.theoHangMuc).reduce((a, h) => a + h.gioCongThuong + h.gioCongTangCa, 0);
const coSoTram = (pb: PhanBo) => tongGio(pb.gioNguoiTo) > 0 || gioSp(pb) > 0
  || Object.keys(pb.theoNguoi ?? {}).length > 0 || Object.keys(pb.diemDanh ?? {}).length > 0;
const doLech = (s: SoSanh) => Math.abs(s.chenh);

/**
 * Gom so khớp theo tổ: chỉ ngày có soKhopTram (tổ chạy song song hôm đó); tổ chỉ có mặt khi ít nhất một ngày trạm ghi
 * được số (tổ song song mà chưa ai quét thì chưa có gì để so). Ngày song song trạm trống vẫn liệt kê (quên quét cả ngày).
 */
export function gomSoKhopTram(ds: NgaySoKhopVao[], tenTo: Map<number, string>, tenNguoi: Map<string, string> = new Map()): SoKhopTo[] {
  const theoTo = new Map<number, SoKhopNgay[]>();
  for (const { toId, ngay, kq } of ds) {
    const tr = kq.soKhopTram;
    if (!tr) continue;
    const ct = kq;
    const mnvs = [...new Set([...Object.keys(ct.theoNguoi ?? {}), ...Object.keys(tr.theoNguoi ?? {}),
      ...Object.keys(ct.diemDanh ?? {}), ...Object.keys(tr.diemDanh ?? {})])];
    const theoNguoi = mnvs.map((mnv): SoKhopNguoi => {
      const a = ct.theoNguoi?.[mnv]; const b = tr.theoNguoi?.[mnv];
      return {
        mnv, hoTen: tenNguoi.get(mnv) ?? null,
        vao: { chinhThuc: ct.diemDanh?.[mnv]?.vao ?? null, tram: tr.diemDanh?.[mnv]?.vao ?? null },
        ra: { chinhThuc: ct.diemDanh?.[mnv]?.ra ?? null, tram: tr.diemDanh?.[mnv]?.ra ?? null },
        gioCong: soSanh(a ? a.coMatThuong + a.coMatTangCa : 0, b ? b.coMatThuong + b.coMatTangCa : 0),
        gioCongSp: soSanh(a ? a.congThuong + a.congTangCa : 0, b ? b.congThuong + b.congTangCa : 0),
      };
    }).sort((x, y) => Number(y.gioCong.lon || y.gioCongSp.lon) - Number(x.gioCong.lon || x.gioCongSp.lon)
      || Math.max(doLech(y.gioCong), doLech(y.gioCongSp)) - Math.max(doLech(x.gioCong), doLech(x.gioCongSp))
      || (x.hoTen ?? x.mnv).localeCompare(y.hoTen ?? y.mnv));
    if (!theoTo.has(toId)) theoTo.set(toId, []);
    theoTo.get(toId)!.push({
      ngay,
      gioCong: soSanh(tongGio(ct.gioNguoiTo), tongGio(tr.gioNguoiTo)),
      gioCongSp: soSanh(gioSp(ct), gioSp(tr)),
      soNguoi: {
        chinhThuc: new Set([...Object.keys(ct.theoNguoi ?? {}), ...Object.keys(ct.diemDanh ?? {})]).size,
        tram: new Set([...Object.keys(tr.theoNguoi ?? {}), ...Object.keys(tr.diemDanh ?? {})]).size,
      },
      khongCoTram: !coSoTram(tr),
      theoNguoi,
    });
  }
  const out: SoKhopTo[] = [];
  for (const [toId, ngays] of theoTo) {
    if (ngays.every(n => n.khongCoTram)) continue;
    ngays.sort((a, b) => b.ngay.localeCompare(a.ngay));
    const cong = (f: (n: SoKhopNgay) => SoSanh, ben: 'chinhThuc' | 'tram') => ngays.reduce((a, n) => a + f(n)[ben], 0);
    out.push({
      toId, ten: tenTo.get(toId) ?? `Tổ ${toId}`,
      gioCong: soSanh(cong(n => n.gioCong, 'chinhThuc'), cong(n => n.gioCong, 'tram')),
      gioCongSp: soSanh(cong(n => n.gioCongSp, 'chinhThuc'), cong(n => n.gioCongSp, 'tram')),
      soNgay: ngays.length, soNgayLon: ngays.filter(n => n.gioCong.lon || n.gioCongSp.lon).length,
      theoNgay: ngays,
    });
  }
  return out.sort((a, b) => a.ten.localeCompare(b.ten));
}
