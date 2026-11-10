// BÁO CÁO BOT — phần thuần (không DB) của routes/botTongHop.ts, để test.

/** Khoá cột chi tiết: CHUA | năm | tháng | ngày */
export const KHOA_HOP_LE = /^(CHUA|\d{4}|\d{4}-\d{2}|\d{4}-\d{2}-\d{2})$/;
/** Mẫu to_char khớp khoá cột: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' */
export const dinhDang = (khoa: string) => (khoa.length === 4 ? 'YYYY' : khoa.length === 7 ? 'YYYY-MM' : 'YYYY-MM-DD');

export const chuoi = (x: unknown) => (x === null || x === undefined ? '' : String(x));

export interface OBotRa { ten: string; ipo: string; ngay: string; thang: string; ct: boolean; tt: number | null; so: number }

/** Dòng SQL (cộng theo ngày) => ô gửi giao diện. Giữ thêm `thang` cho bản giao diện cũ (chỉ biết tháng). */
export const oTuDong = (r: { ten?: unknown; ipo?: unknown; ngay?: unknown; ct?: unknown; tt?: unknown; so?: unknown }): OBotRa => {
  const ngay = chuoi(r.ngay);
  return { ten: chuoi(r.ten), ipo: chuoi(r.ipo), ngay, thang: ngay.slice(0, 7), ct: !!r.ct, tt: r.tt === null || r.tt === undefined ? null : Number(r.tt), so: Number(r.so) || 0 };
};

/** File công trình cần xem: kieu 'doc' = tool đọc lỗi (số đang hiện là của bản đọc tốt gần nhất);
 *  'cot' = đọc được nhưng 1 cột cần cho BÁO CÁO BOT trống cả file (thiếu / đổi tên cột — tool không báo lỗi). */
export interface FileLoi {
  nguon: string; kieu: 'doc' | 'cot'; loi: string;
  luc: string | null;      // 'doc': lần đọc lỗi gần nhất; 'cot': lần nạp (ISO)
  luuTot: string | null;   // giờ lưu file của bản đang hiện số (null = chưa từng đọc được, chưa có số)
  soDong: number;          // số dòng HEX đang hiện của file
  ten: string[];           // TÊN CÔNG TRÌNH có dòng từ file
  dungSoCua?: string;      // file lỗi chưa có số mà app đang dùng số của file cũ cùng công trình (nguon file đó)
}

/** Khoá công trình của 1 file (như tool nạp): mã CTxx-xxx / POxx-xxx trong tên file; không có mã thì thư mục chứa file */
export const khoaCongTrinh = (nguon: string) => {
  const ten = nguon.split(/[\\/]/).pop() ?? nguon;
  const m = ten.match(/(?:CT|PO)\s?\d{2}-\d{3}/i);
  return m ? m[0].toUpperCase().replace(/\s/g, '') : `DIR:${nguon.slice(0, nguon.length - ten.length).replace(/\\/g, '/').toLowerCase()}`;
};

/** Cột của bot_tong_hop mà trống cả file thì báo (ngày cần giao trống cả file là bình thường: CHƯA BOT) */
const COT_CAN: [string, string][] = [['tt', 'TT ĐH CÒN LẠI'], ['ipo', 'TÌNH TRẠNG IPO FINAL'], ['ten', 'TÊN CÔNG TRÌNH']];

/** f: bot_tong_hop_file (nguon, loi, nap_luc, mtime ISO); tk: thống kê bot_tong_hop theo nguon (n, số ô có giá trị tt / ipo / ten, tên). */
export const fileCanXem = (
  f: { nguon?: unknown; loi?: unknown; nap_luc?: unknown; mtime?: unknown }[],
  tk: { nguon?: unknown; n?: unknown; tt?: unknown; ipo?: unknown; ten?: unknown; ds?: unknown }[],
): FileLoi[] => {
  const theo = new Map(tk.map(r => [chuoi(r.nguon), r]));
  const out: FileLoi[] = [];
  for (const r of f) {
    const nguon = chuoi(r.nguon);
    const t = theo.get(nguon);
    const soDong = Number(t?.n) || 0;
    const ten = Array.isArray(t?.ds) ? (t!.ds as unknown[]).map(chuoi).filter(Boolean).sort() : [];
    const chung = { nguon, luc: chuoi(r.nap_luc) || null, soDong, ten };
    if (r.loi) {
      out.push({ ...chung, kieu: 'doc', loi: chuoi(r.loi), luuTot: soDong ? chuoi(r.mtime) || null : null });
      continue;
    }
    if (!soDong) continue;
    const thieu = COT_CAN.filter(([k]) => !Number((t as Record<string, unknown>)[k])).map(([, nhan]) => nhan);
    if (thieu.length) out.push({ ...chung, kieu: 'cot', loi: `Cột ${thieu.join(', ')} trống cả file (thiếu / đổi tên cột?)`, luuTot: chuoi(r.mtime) || null });
  }
  // File mới lỗi (chưa có số) mà file cũ cùng công trình vẫn đang giữ số => ghi rõ đang dùng số file nào
  const coSo = new Map<string, FileLoi>();
  for (const x of out) if (x.soDong > 0 && !coSo.has(khoaCongTrinh(x.nguon))) coSo.set(khoaCongTrinh(x.nguon), x);
  for (const x of out) {
    if (x.soDong > 0) continue;
    const cu = coSo.get(khoaCongTrinh(x.nguon));
    if (cu) { x.dungSoCua = cu.nguon; x.luuTot = cu.luuTot; x.ten = cu.ten; }
  }
  return out.sort((a, b) => (a.kieu === b.kieu ? a.nguon.localeCompare(b.nguon) : a.kieu === 'doc' ? -1 : 1));
};
