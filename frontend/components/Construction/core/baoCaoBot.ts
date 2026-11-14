// ============================================================================
// BÁO CÁO BOT — dựng lại pivot sheet "BÁO CÁO BOT" của MASTER_PROJECT_COORDINATION.xlsx:
//   lọc  TÌNH TRẠNG IPO FINAL (mặc định 01. ĐANG SẢN XUẤT); MÃ CÔNG TRÌNH chỉ mã CTxx-xxx (như file)
//   hàng TÊN CÔNG TRÌNH, xếp giảm dần theo tổng
//   cột  năm của NGÀY CẦN GIAO PC ĐỀ XUẤT (bấm năm bung tháng, bấm tháng bung ngày), không có ngày = CHƯA BOT
//        tiêu đề nhiều tầng có gộp ô: tầng 1 năm, tầng 2 tháng, tầng 3 ngày; mỗi cấp đang mở có cột Tổng của cấp đó
//   ô    Sum of TT ĐH CÒN LẠI (ô trống = không có dòng nào, giống Excel)
// Dữ liệu vào: các ô đã cộng ở máy chủ (GET /api/bot-tong-hop).
// ============================================================================

/** ct: MÃ CÔNG TRÌNH dạng CTxx-xxx (lọc mã của pivot trong file chỉ chọn các mã này, bỏ OEM / hàng lẻ / xuất khẩu) */
/** ngay: 'YYYY-MM-DD' (máy chủ cũ không có => chỉ bung tới tháng); thang: 'YYYY-MM'; cả 2 rỗng = CHƯA BOT */
/** nsp / xuong: nhóm sản phẩm / xưởng (đã gộp) của HEX theo dữ liệu sản xuất ('' = không có; máy chủ cũ không gửi) */
export interface OBot { ten: string; ipo: string; thang: string; ngay?: string; ct: boolean; tt: number | null; so: number; nsp?: string; xuong?: string }

export const CHUA_BOT = 'CHUA';
export const IPO_MAC_DINH = '01. ĐANG SẢN XUẤT';
// Mã IPO để so giữa danh sách của trang (từ dữ liệu sản xuất) và của file công trình: "01. ĐANG SẢN XUẤT" => "01"
export const maIpo = (x: string) => x.match(/^\s*(\d+)/)?.[1] ?? x.trim().toUpperCase();
// Các IPO của BÁO CÁO BOT ứng với lựa chọn ở bộ lọc trang; chọn rỗng => tất cả (null)
export function ipoTheoTrang(chon: readonly string[], ipos: readonly string[]): Set<string> | null {
  if (!chon.length) return null;
  const ma = new Set(chon.map(maIpo));
  return new Set(ipos.filter(x => ma.has(maIpo(x))));
}

export interface CotBot {
  khoa: string;        // 'CHUA' | 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'
  nhan: string;
  loai: 'chua' | 'nam' | 'thang' | 'ngay';
  nam?: string;        // cột năm / tháng / ngày: năm của nó
  moDuoc?: boolean;    // cột năm / tháng: có cấp con để bung
  dangMo?: boolean;    // cấp đang bung: cột này là cột "Tổng" của cấp
}

/** 1 ô tiêu đề: cot = cột lá (ô không có con), con = cấp đang bung (gộp ngang trên các cột con) */
export interface OTieuDe { khoa: string; nhan: string; loai: CotBot['loai']; colSpan: number; rowSpan: number; cot?: CotBot; moDuoc?: boolean; dangMo?: boolean }

export interface DongBot { ten: string; o: Record<string, number>; tong: number; so: number }

/** cot: các cột lá theo thứ tự; tieuDe: các tầng tiêu đề (tầng 1 năm, 2 tháng, 3 ngày) — cột cố định ngoài (STT, tên, TỔNG) rowSpan = tieuDe.length */
export interface BaoCaoBot { cot: CotBot[]; tieuDe: OTieuDe[][]; dong: DongBot[]; tongCot: Record<string, number>; tong: number; so: number }

const cong = (m: Record<string, number>, k: string, v: number) => { m[k] = (m[k] ?? 0) + v; };

const ngayVN = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);   // giờ Việt Nam UTC+7

/** File công trình lưu trong ngày hôm nay (giờ Việt Nam)? `luu`: ISO giờ lưu file. */
export const luuHomNay = (luu: string | undefined, bayGio: Date = new Date()): boolean => {
  if (!luu) return false;
  const d = new Date(luu);
  return !Number.isNaN(d.getTime()) && ngayVN(d) === ngayVN(bayGio);
};

/** Khoá cột của 1 ô theo trạng thái bung năm / tháng. Rỗng = CHƯA BOT. Ô cộng vào cột lá của nó và mọi cột Tổng cấp trên đang mở. */
export function khoaCot(thang: string, namMo: ReadonlySet<string>, ngay = '', thangMo: ReadonlySet<string> = new Set()): string[] {
  const th = thang || ngay.slice(0, 7);
  if (!th) return [CHUA_BOT];
  const nam = th.slice(0, 4);
  if (!namMo.has(nam)) return [nam];
  return ngay && thangMo.has(th) ? [ngay, th, nam] : [th, nam];
}

const nhanNgay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function dungBaoCaoBot(o: readonly OBot[], ipo: ReadonlySet<string> | null, namMo: ReadonlySet<string> = new Set(), chiCt = false,
  thangMo: ReadonlySet<string> = new Set()): BaoCaoBot {
  const theoTen = new Map<string, DongBot>();
  let coChua = false;
  const cay = new Map<string, Map<string, Set<string>>>();   // năm -> tháng -> các ngày có dữ liệu
  const tongCot: Record<string, number> = {};
  let tong = 0, so = 0;
  for (const x of o) {
    if (ipo && !ipo.has(x.ipo)) continue;
    if (chiCt && !x.ct) continue;
    const v = x.tt ?? 0;
    const ngay = x.ngay ?? '';
    const th = x.thang || ngay.slice(0, 7);
    let d = theoTen.get(x.ten);
    if (!d) { d = { ten: x.ten, o: {}, tong: 0, so: 0 }; theoTen.set(x.ten, d); }
    for (const k of khoaCot(th, namMo, ngay, thangMo)) { cong(d.o, k, v); cong(tongCot, k, v); }
    if (!th) coChua = true;
    else {
      const nam = th.slice(0, 4);
      if (!cay.has(nam)) cay.set(nam, new Map());
      const m = cay.get(nam)!;
      if (!m.has(th)) m.set(th, new Set());
      if (ngay) m.get(th)!.add(ngay);
    }
    d.tong += v; d.so += x.so; tong += v; so += x.so;
  }

  // Cây tiêu đề: nút lá = 1 cột; nút đang bung = các nút con + cột Tổng của nó
  interface Nut { cot: CotBot; con?: Nut[] }
  const goc: Nut[] = [];
  if (coChua) goc.push({ cot: { khoa: CHUA_BOT, nhan: 'CHƯA BOT', loai: 'chua' } });
  for (const nam of [...cay.keys()].sort()) {
    const cotNam: CotBot = { khoa: nam, nhan: nam, loai: 'nam', nam, moDuoc: true, dangMo: namMo.has(nam) };
    if (!cotNam.dangMo) { goc.push({ cot: cotNam }); continue; }
    const thangs = cay.get(nam)!;
    const con: Nut[] = [...thangs.keys()].sort().map(t => {
      const ngays = [...thangs.get(t)!].sort();
      const cotThang: CotBot = { khoa: t, nhan: `T${Number(t.slice(5))}`, loai: 'thang', nam, moDuoc: ngays.length > 0, dangMo: ngays.length > 0 && thangMo.has(t) };
      if (!cotThang.dangMo) return { cot: cotThang };
      return {
        cot: cotThang,
        con: [...ngays.map(n => ({ cot: { khoa: n, nhan: nhanNgay(n), loai: 'ngay' as const, nam } })), { cot: { ...cotThang, nhan: 'Tổng' } }],
      };
    });
    goc.push({ cot: cotNam, con: [...con, { cot: { ...cotNam, nhan: 'Tổng' } }] });
  }
  const sau = (n: Nut): number => (n.con ? 1 + Math.max(...n.con.map(sau)) : 1);
  const soTang = Math.max(1, ...goc.map(sau));
  const la = (n: Nut): number => (n.con ? n.con.reduce((a, c) => a + la(c), 0) : 1);
  const tieuDe: OTieuDe[][] = Array.from({ length: soTang }, () => []);
  const cot: CotBot[] = [];
  const duyet = (n: Nut, tang: number) => {
    const { khoa, nhan, loai, moDuoc, dangMo } = n.cot;
    if (n.con) {
      tieuDe[tang].push({ khoa, nhan, loai, colSpan: la(n), rowSpan: 1, moDuoc, dangMo });
      for (const c of n.con) duyet(c, tang + 1);
    } else {
      tieuDe[tang].push({ khoa, nhan, loai, colSpan: 1, rowSpan: soTang - tang, cot: n.cot, moDuoc, dangMo });
      cot.push(n.cot);
    }
  };
  for (const n of goc) duyet(n, 0);
  const dong = [...theoTen.values()].sort((a, b) => b.tong - a.tong || a.ten.localeCompare(b.ten, 'vi'));
  return { cot, tieuDe, dong, tongCot, tong, so };
}

// ---------------------------------------------------------------------------- dòng theo công trình / sản phẩm / xưởng
// Như tab BOP: chọn chiều của dòng gốc; mở dòng ra chọn chiều con, dòng con mở tiếp theo chiều còn lại.
export type ChieuBot = 'ct' | 'nsp' | 'xuong';
export const TEN_CHIEU_BOT: Record<ChieuBot, string> = { ct: 'Công trình', nsp: 'Sản phẩm', xuong: 'Xưởng' };
/** Thứ tự chiều khi dòng gốc theo 1 chiều (bậc 2, 3 đảo được bằng nút chọn ở dòng gốc) */
export const BAC_BOT: Record<ChieuBot, ChieuBot[]> = { ct: ['ct', 'nsp', 'xuong'], nsp: ['nsp', 'ct', 'xuong'], xuong: ['xuong', 'ct', 'nsp'] };
export const KHONG_CO: Record<ChieuBot, string> = { ct: '(trống)', nsp: '(Chưa có nhóm)', xuong: '(Chưa có xưởng)' };
export const giaTriChieu = (x: OBot, c: ChieuBot) => (c === 'ct' ? x.ten : c === 'nsp' ? x.nsp ?? '' : x.xuong ?? '');
export const nhanChieu = (v: string, c: ChieuBot) => v || KHONG_CO[c];

/** 1 dòng của cây: duong = giá trị từng bậc từ gốc tới dòng này ('' = trống) */
export interface NutBot extends DongBot { duong: string[]; con: NutBot[] }

/** Cây dòng theo các bậc `bac` (cùng lọc IPO / mã CT / khoá cột như dungBaoCaoBot). `loc`: chỉ các ô thoả (vd. tìm theo tên công trình).
 *  Dòng mỗi bậc chưa xếp (giao diện xếp theo chiều). */
export function cayBaoCaoBot(o: readonly OBot[], ipo: ReadonlySet<string> | null, bac: readonly ChieuBot[], namMo: ReadonlySet<string> = new Set(),
  chiCt = false, thangMo: ReadonlySet<string> = new Set(), loc?: (x: OBot) => boolean): NutBot[] {
  // Lúc cộng: mỗi nút giữ Map con theo giá trị; xong thì đổi sang mảng
  interface Tam { n: NutBot; con: Map<string, Tam> }
  const goc = new Map<string, Tam>();
  for (const x of o) {
    if (ipo && !ipo.has(x.ipo)) continue;
    if (chiCt && !x.ct) continue;
    if (loc && !loc(x)) continue;
    const v = x.tt ?? 0;
    const ngay = x.ngay ?? '';
    const khoa = khoaCot(x.thang || ngay.slice(0, 7), namMo, ngay, thangMo);
    let ds = goc;
    const duong: string[] = [];
    for (const c of bac) {
      const g = giaTriChieu(x, c);
      duong.push(g);
      let t = ds.get(g);
      if (!t) { t = { n: { ten: g, duong: [...duong], o: {}, tong: 0, so: 0, con: [] }, con: new Map() }; ds.set(g, t); }
      for (const k of khoa) cong(t.n.o, k, v);
      t.n.tong += v; t.n.so += x.so;
      ds = t.con;
    }
  }
  const raMang = (m: Map<string, Tam>): NutBot[] => [...m.values()].map(t => ({ ...t.n, con: raMang(t.con) }));
  return raMang(goc);
}

// ---------------------------------------------------------------------------- file công trình lỗi
/** File cần xem (GET /api/bot-tong-hop → fileLoi; xem backend/src/server/botTongHop.fileCanXem). Máy chủ cũ chỉ có nguon + loi.
 *  kieu 'doc': tool đọc file lỗi — số đang hiện là của bản đọc tốt gần nhất (luuTot), null = chưa có số;
 *  kieu 'cot': đọc được nhưng 1 cột cần trống cả file (thiếu / đổi tên cột). */
export interface FileLoiBot { nguon: string; loi: string; kieu?: 'doc' | 'cot'; luc?: string | null; luuTot?: string | null; soDong?: number; ten?: string[]; dungSoCua?: string }

/** Tên file từ đường dẫn tương đối (dấu \ của Windows hoặc /). */
export const tenFile = (nguon: string) => nguon.split(/[\\/]/).pop() || nguon;

/** TÊN CÔNG TRÌNH -> các file lỗi có dòng của công trình đó (để gắn dấu cảnh báo vào dòng). */
export function loiTheoTen(ds: readonly FileLoiBot[] | undefined): Map<string, FileLoiBot[]> {
  const m = new Map<string, FileLoiBot[]>();
  for (const f of ds ?? []) for (const ten of f.ten ?? []) { const a = m.get(ten); if (a) a.push(f); else m.set(ten, [f]); }
  return m;
}
