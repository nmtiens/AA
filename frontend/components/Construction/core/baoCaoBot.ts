// ============================================================================
// BÁO CÁO BOT — dựng lại pivot sheet "BÁO CÁO BOT" của MASTER_PROJECT_COORDINATION.xlsx:
//   lọc  TÌNH TRẠNG IPO FINAL (mặc định 01. ĐANG SẢN XUẤT); MÃ CÔNG TRÌNH chỉ mã CTxx-xxx (như file)
//   hàng TÊN CÔNG TRÌNH, xếp giảm dần theo tổng
//   cột  năm của NGÀY CẦN GIAO PC ĐỀ XUẤT (bấm năm bung tháng), không có ngày = CHƯA BOT
//   ô    Sum of TT ĐH CÒN LẠI (ô trống = không có dòng nào, giống Excel)
// Dữ liệu vào: các ô đã cộng ở máy chủ (GET /api/bot-tong-hop).
// ============================================================================

/** ct: MÃ CÔNG TRÌNH dạng CTxx-xxx (lọc mã của pivot trong file chỉ chọn các mã này, bỏ OEM / hàng lẻ / xuất khẩu) */
export interface OBot { ten: string; ipo: string; thang: string; ct: boolean; tt: number | null; so: number }

export const CHUA_BOT = 'CHUA';
export const IPO_MAC_DINH = '01. ĐANG SẢN XUẤT';

export interface CotBot {
  khoa: string;        // 'CHUA' | 'YYYY' | 'YYYY-MM'
  nhan: string;
  loai: 'chua' | 'nam' | 'thang';
  nam?: string;        // cột năm / tháng: năm của nó
  moDuoc?: boolean;    // cột năm: có tháng để bung
  dangMo?: boolean;
}

export interface DongBot { ten: string; o: Record<string, number>; tong: number; so: number }

export interface BaoCaoBot { cot: CotBot[]; dong: DongBot[]; tongCot: Record<string, number>; tong: number; so: number }

const cong = (m: Record<string, number>, k: string, v: number) => { m[k] = (m[k] ?? 0) + v; };

const ngayVN = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);   // giờ Việt Nam UTC+7

/** File công trình lưu trong ngày hôm nay (giờ Việt Nam)? `luu`: ISO giờ lưu file. */
export const luuHomNay = (luu: string | undefined, bayGio: Date = new Date()): boolean => {
  if (!luu) return false;
  const d = new Date(luu);
  return !Number.isNaN(d.getTime()) && ngayVN(d) === ngayVN(bayGio);
};

/** Khoá cột của 1 ô theo trạng thái bung năm. Tháng rỗng = CHƯA BOT. */
export function khoaCot(thang: string, namMo: ReadonlySet<string>): string[] {
  if (!thang) return [CHUA_BOT];
  const nam = thang.slice(0, 4);
  return namMo.has(nam) ? [thang, nam] : [nam];   // năm đang bung: cộng cả cột tháng và cột tổng năm
}

export function dungBaoCaoBot(o: readonly OBot[], ipo: ReadonlySet<string> | null, namMo: ReadonlySet<string> = new Set(), chiCt = false): BaoCaoBot {
  const theoTen = new Map<string, DongBot>();
  const coKhoa = new Set<string>();
  const thangCuaNam = new Map<string, Set<string>>();
  const tongCot: Record<string, number> = {};
  let tong = 0, so = 0;
  for (const x of o) {
    if (ipo && !ipo.has(x.ipo)) continue;
    if (chiCt && !x.ct) continue;
    const v = x.tt ?? 0;
    let d = theoTen.get(x.ten);
    if (!d) { d = { ten: x.ten, o: {}, tong: 0, so: 0 }; theoTen.set(x.ten, d); }
    for (const k of khoaCot(x.thang, namMo)) { cong(d.o, k, v); cong(tongCot, k, v); coKhoa.add(k); }
    if (x.thang) {
      const nam = x.thang.slice(0, 4);
      coKhoa.add(nam);
      if (!thangCuaNam.has(nam)) thangCuaNam.set(nam, new Set());
      thangCuaNam.get(nam)!.add(x.thang);
    }
    d.tong += v; d.so += x.so; tong += v; so += x.so;
  }
  const cot: CotBot[] = [];
  if (coKhoa.has(CHUA_BOT)) cot.push({ khoa: CHUA_BOT, nhan: 'CHƯA BOT', loai: 'chua' });
  for (const nam of [...thangCuaNam.keys()].sort()) {
    const mo = namMo.has(nam);
    if (mo) {
      for (const t of [...thangCuaNam.get(nam)!].sort()) {
        cot.push({ khoa: t, nhan: `T${Number(t.slice(5))}`, loai: 'thang', nam });
      }
    }
    cot.push({ khoa: nam, nhan: mo ? `Tổng ${nam}` : nam, loai: 'nam', nam, moDuoc: true, dangMo: mo });
  }
  const dong = [...theoTen.values()].sort((a, b) => b.tong - a.tong || a.ten.localeCompare(b.ten, 'vi'));
  return { cot, dong, tongCot, tong, so };
}
