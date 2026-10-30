import {
  chiSoNhan, congThangKhoa, nhanNgayNgan, tenNhomGon, tomTatNhom, xuHuongTong,
  type ChiSo, type ChuoiNhom, type DoanhThuKeHoach, type DuBaoTon, type MocXem,
} from './xuLy';
import { chuDuBao, chuXuHuong } from './baoCao';

// ============================================================================
// BIỂU ĐỒ EXCEL THẬT cho file Excel "Xuất báo cáo" của trang 7. Tồn kho vật tư
//   SheetJS bản cộng đồng không ghi được biểu đồ => dựng workbook bằng SheetJS như cũ rồi mở gói .xlsx (JSZip) chèn
//   thêm biểu đồ đường gốc của Excel (DrawingML): sheet "Biểu đồ" có 6 biểu đồ, số lấy từ sheet "Số liệu biểu đồ"
//   (các nhóm xếp DỌC, cùng 5 cột A–E; sửa số ở đó thì biểu đồ đổi theo). Giống biểu đồ trên trang: tổng tồn (màu nhóm, số ghi tại điểm), chậm luân
//   chuyển > 3 tháng (xám, nét đứt, lần chốt thiếu cờ để trống và nối qua), trung bình (chấm, ô công thức AVERAGE),
//   đường xu hướng = trendline tuyến tính của chính Excel (cam tăng / xanh giảm), trục Y từ 0. Xem theo tháng có doanh
//   thu: cột F doanh số cần đạt (doanhSoCanDat.ts) + biểu đồ doanh thu dưới mỗi biểu đồ tồn; xem giá trị có
//   dự báo: thêm các dòng tháng dự báo, cột G dự báo tồn, H sai số ± (thanh sai số trên đường dự báo), I xu hướng.
// ============================================================================

export const TEN_SHEET_BIEU_DO = 'Biểu đồ';
export const TEN_SHEET_SO_LIEU = 'Số liệu biểu đồ';

/** Biểu đồ đầu tiên đặt ở dòng (0-based) này của sheet "Biểu đồ"; mỗi nhóm chiếm 25 dòng (36 khi có biểu đồ số ngày) */
export const DONG_BIEU_DO_DAU = 5;
const EMU_MOI_PX = 9525;
const RONG_PX = 1100;
const CAO_PX = 450;
/** Biểu đồ doanh thu chung (cả công ty) ở đầu sheet: cao bấy nhiêu px, các biểu đồ nhóm lùi xuống bấy nhiêu dòng
 *  (dòng Excel ~19px => 17 dòng ≥ 300px) */
const CAO_DT_PX = 300;
const DONG_DT_TREN = 17;

type Os = string | number | null;

/** Màu Excel: '#d55181' => 'D55181' */
const hex = (mau: string) => mau.replace(/^#/, '').toUpperCase();

const xmlChu = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Cột 0-based => chữ cột Excel (0 => A, 26 => AA) */
export const tenCot = (c: number): string => {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const thamChieu = (c: number, r1: number, r2: number) =>
  `'${TEN_SHEET_SO_LIEU}'!$${tenCot(c)}$${r1 + 1}:$${tenCot(c)}$${r2 + 1}`;

/** Bộ lọc tên của 1 nhóm (ghi vào tiêu đề biểu đồ) */
export interface LocNhomExcel { moTa: string }

export interface DauVaoBieuDoExcel {
  chuoi: ChuoiNhom[];
  chiSo: ChiSo;
  moc: MocXem;
  /** Màu từng nhóm ('#rrggbb') */
  mau: Record<string, string>;
  loc?: Record<string, LocNhomExcel>;
  /** Doanh thu thực tế + kế hoạch theo tháng (cả công ty, tỷ) — xem theo tháng: cột F–H + biểu đồ doanh thu */
  doanhThu?: DoanhThuKeHoach;
  /** Tháng hiện tại ('YYYY-MM', giờ VN) — có doanh thu khi có cả tháng này */
  thangHienTai?: string;
  /** Dự báo tồn theo kế hoạch doanh thu từng nhóm (xem theo tháng + giá trị) */
  duBao?: Record<string, DuBaoTon | null>;
}

/** 1 biểu đồ đặt lên sheet "Biểu đồ": XML + dòng neo (0-based) + chiều cao (px) */
export interface BieuDoExcelMot { xml: string; dong: number; caoPx: number }

export interface BieuDoExcel {
  /** Sheet "Số liệu biểu đồ": mỗi nhóm 1 khối (tên, tiêu đề cột, từng kỳ [+ tháng dự báo], câu tóm tắt) xếp DỌC trong
   *  các cột A–E (+ F–H doanh thu, I–J dự báo khi có; null = ô trống) */
  soLieu: Os[][];
  /** Độ rộng các cột (ký tự) — đặt sẵn để câu tóm tắt tràn sang phải thay vì nong cột A */
  rongCot: number[];
  /** Ô công thức trung bình (=AVERAGE) của sheet số liệu, kèm giá trị đã tính sẵn */
  congThuc: Array<{ r: number; c: number; f: string; v: number }>;
  /** Các biểu đồ: [biểu đồ doanh thu chung (xem theo tháng có doanh thu)], rồi biểu đồ tồn từng nhóm */
  bieuDo: BieuDoExcelMot[];
}

/** Cột trong khối số liệu: A Kỳ, B Ngày chốt, C Tổng tồn, D Chậm LC, E Trung bình, F Doanh số cần đạt,
 *  G Dự báo tồn, H Sai số ±, I Xu hướng */
const COT_KY = 0, COT_TONG = 2, COT_CHAM = 3, COT_TB = 4, COT_DB = 6, COT_SS = 7, COT_XH = 8, COT_THAP = 9, COT_CAO = 10;
const MAU_CHAM = '94A3B8';
const MAU_TANG = 'B45309';
const MAU_GIAM = '047857';

// ---- mảnh XML dùng chung ----
const chuTxPr = (sz: number, mau: string, dam = false) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${dam ? 1 : 0}"><a:solidFill><a:srgbClr val="${mau}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr>`;
const duong = (mau: string, rongEmu: number, net?: 'dash' | 'sysDot' | 'lgDash') =>
  `<a:ln w="${rongEmu}" cap="rnd"><a:solidFill><a:srgbClr val="${mau}"/></a:solidFill>${net ? `<a:prstDash val="${net}"/>` : ''}<a:round/></a:ln>`;
const KHONG_NEN = '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>';
const CO_HIEN = (val: boolean) =>
  `<c:showLegendKey val="0"/><c:showVal val="${val ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>`;

/** Nhãn số tại điểm: chỉ các điểm trong `hien` (hết điểm => bật cả dãy, khỏi liệt kê) */
function nhanDiem(hien: Set<number>, soDiem: number, dinhDang: string, viTri: 't' | 'b' | 'r' | 'inEnd', txPr: string): string {
  const fmt = `<c:numFmt formatCode="${xmlChu(dinhDang)}" sourceLinked="0"/>`;
  if (hien.size >= soDiem) return `<c:dLbls>${fmt}${KHONG_NEN}${txPr}<c:dLblPos val="${viTri}"/>${CO_HIEN(true)}</c:dLbls>`;
  const tung = [...hien].sort((a, b) => a - b)
    .map(i => `<c:dLbl><c:idx val="${i}"/>${fmt}${KHONG_NEN}${txPr}<c:dLblPos val="${viTri}"/>${CO_HIEN(true)}</c:dLbl>`).join('');
  return `<c:dLbls>${tung}${fmt}${KHONG_NEN}${txPr}<c:dLblPos val="${viTri}"/>${CO_HIEN(false)}</c:dLbls>`;
}

const cacheSo = (ds: Array<number | null>) =>
  `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${ds.length}"/>${ds
    .map((v, i) => (v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache>`;
const cacheChu = (ds: string[]) =>
  `<c:strCache><c:ptCount val="${ds.length}"/>${ds.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlChu(v)}</c:v></c:pt>`).join('')}</c:strCache>`;

interface DuLieuDay {
  ten: string;
  refGiaTri: string; giaTri: Array<number | null>;
  mau: string; rong: number; net?: 'dash' | 'sysDot' | 'lgDash';
  diem: boolean; nhan: string; trendline?: string;
}

function day(i: number, d: DuLieuDay, refNhan: string, nhan: string[]): string {
  const dauCham = d.diem
    ? `<c:marker><c:symbol val="circle"/><c:size val="${d.net ? 4 : 6}"/><c:spPr><a:solidFill><a:srgbClr val="${d.mau}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:marker>`
    : '<c:marker><c:symbol val="none"/></c:marker>';
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xmlChu(d.ten)}</c:v></c:tx>`
    + `<c:spPr>${duong(d.mau, d.rong, d.net)}</c:spPr>${dauCham}${d.nhan}${d.trendline ?? ''}`
    + `<c:cat><c:strRef><c:f>${xmlChu(refNhan)}</c:f>${cacheChu(nhan)}</c:strRef></c:cat>`
    + `<c:val><c:numRef><c:f>${xmlChu(d.refGiaTri)}</c:f>${cacheSo(d.giaTri)}</c:numRef></c:val><c:smooth val="0"/></c:ser>`;
}

/** Dựng sheet số liệu + XML 6 biểu đồ (thuần — test được không cần trình duyệt) */
export function dungBieuDoExcel(v: DauVaoBieuDoExcel): BieuDoExcel {
  const giaTri = v.chiSo === 'giaTri';
  const dv = giaTri ? '(tỷ)' : '(mã)';
  // Giữ tới nghìn đồng (6 số lẻ của tỷ): làm tròn sẵn tới triệu rồi Excel làm tròn lần nữa thì 44.1496 thành 44.2
  const doi = (x: number) => (giaTri ? Math.round(x * 1000) / 1e6 : Math.round(x));
  const tron3 = (x: number) => Math.round(x * 1000) / 1000;
  const soLieu: Os[][] = [];
  const congThuc: BieuDoExcel['congThuc'] = [];
  const bieuDo: BieuDoExcelMot[] = [];
  const { doanhThu, thangHienTai } = v;
  const coDT = v.moc === 'thang' && !!doanhThu && !!thangHienTai;
  const coDuBao = coDT && giaTri && v.chuoi.some(c => (v.duBao?.[c.nhom]?.diem.length ?? 0) > 0);
  const soCot = 5 + (coDT ? 1 : 0) + (coDuBao ? 5 : 0);
  const dongMoiNhom = 25;
  // Các tháng (kể cả tháng dự báo) của mọi nhóm => trục tháng của biểu đồ doanh thu chung
  const dsKhoa = new Map<string, string>();
  const hang = (...o: Os[]) => { soLieu.push([...o, ...Array<Os>(soCot - o.length).fill(null)]); };
  // Doanh thu tháng = doanh số cần đạt người dùng đưa (doanhSoCanDat.ts) — 29/10/2026
  const keHoach = (t: string) => (doanhThu?.keHoach[t] !== undefined ? tron3(doanhThu.keHoach[t]) : null);

  v.chuoi.forEach((c, k) => {
    const ds = c.diem;
    const n = ds.length;
    const ten = `${tenNhomGon(c.nhom)}${v.loc?.[c.nhom] ? ` (lọc: ${v.loc[c.nhom].moTa})` : ''}`;
    const cau = n ? tomTatNhom(ds, v.chiSo) : '';
    // Tháng dự báo nối tiếp đúng tháng có tồn mới nhất
    const db = coDuBao ? v.duBao?.[c.nhom] ?? null : null;
    const dbDiem = db && n && db.diem.length && congThangKhoa(ds[n - 1].khoa, 1) === db.diem[0].khoa ? db.diem : [];
    const f = dbDiem.length, N = n + f;
    const nhan = [...ds.map(d => (v.moc === 'tuan' ? nhanNgayNgan(d.ngayChot) : d.nhan)), ...dbDiem.map(d => d.nhan)];
    const khoa = [...ds.map(d => d.khoa), ...dbDiem.map(d => d.khoa)];
    khoa.forEach((kh, i) => { if (!dsKhoa.has(kh)) dsKhoa.set(kh, nhan[i]); });
    const rong = Array<null>(f).fill(null);
    const tong = ds.map(d => doi(d.tong));
    const cham = ds.map(d => (d.thieuCham ? null : doi(d.cham)));
    const coCham = ds.some(d => !d.thieuCham && d.cham > 0);
    const coTb = n > 1;
    const tb = coTb ? tong.reduce((s, x) => s + x, 0) / n : null;
    const xh = xuHuongTong(ds);

    // ---- khối số liệu (xếp dọc): tên nhóm, tiêu đề cột, từng kỳ (dòng r1..r2) + tháng dự báo (tới rN), câu tóm tắt ----
    if (k > 0) hang();
    hang(ten);
    hang('Kỳ', 'Ngày chốt', `Tổng tồn ${dv}`, `Chậm luân chuyển > 3 tháng ${dv}`, `Trung bình ${dv}`,
      ...(coDT ? ['Doanh số cần đạt (tỷ)'] : []),
      ...(coDuBao ? ['Dự báo tồn (tỷ)', 'Sai số ± (tỷ)', 'Xu hướng (tỷ)', 'Dự báo thấp (tỷ)', 'Dự báo cao (tỷ)'] : []));
    const r1 = soLieu.length, r2 = r1 + n - 1, rN = r1 + N - 1;
    const cotTong = tenCot(COT_TONG);
    ds.forEach((d, i) => {
      hang(nhan[i], d.ngayChot.split('-').reverse().join('/'), tong[i], cham[i], tb,
        ...(coDT ? [keHoach(d.khoa)] : []),
        ...(coDuBao ? [i === n - 1 && f ? tong[i] : null, null, xh ? doi(xh.giaTri[i]) : null, null, null] : []));
      if (tb !== null) congThuc.push({ r: r1 + i, c: COT_TB, f: `AVERAGE($${cotTong}$${r1 + 1}:$${cotTong}$${r2 + 1})`, v: tb });
    });
    dbDiem.forEach(p => {
      hang(p.nhan, 'dự báo', null, null, null, keHoach(p.khoa), doi(p.ton), p.cao === null ? null : doi(p.cao - p.ton), null,
        p.thap === null ? null : doi(p.thap), p.cao === null ? null : doi(p.cao));
    });
    if (cau) hang(cau);
    if (f && db) hang(`Dự báo theo kế hoạch doanh thu: ${chuDuBao(db)}`);

    // ---- biểu đồ tồn (các dãy trải hết các tháng kể cả tháng dự báo — ô trống ở tháng không có số) ----
    const mau = hex(v.mau[c.nhom] ?? '#334155');
    const maxTong = Math.max(0, ...ds.map(d => d.tong));
    const dinhDang = giaTri ? (maxTong < 2000 ? '0.00' : '0.0') : '#,##0';
    const refNhan = thamChieu(COT_KY, r1, rN);
    const series: string[] = [];
    let idx = 0;
    if (coCham) {
      series.push(day(idx++, {
        ten: 'Chậm luân chuyển > 3 tháng', refGiaTri: thamChieu(COT_CHAM, r1, rN), giaTri: [...cham, ...rong],
        mau: MAU_CHAM, rong: 19050, net: 'dash', diem: true,
        nhan: nhanDiem(chiSoNhan(cham), N, dinhDang, 'b', chuTxPr(800, '64748B')),
      }, refNhan, nhan));
    }
    if (tb !== null) {
      const fmtTb = `"TB "${dinhDang}`;
      series.push(day(idx++, {
        ten: `Trung bình ${n} ${v.moc === 'tuan' ? 'lần chốt' : 'tháng'}`, refGiaTri: thamChieu(COT_TB, r1, rN),
        giaTri: [...tong.map(() => tb), ...rong], mau, rong: 15875, net: 'sysDot', diem: false,
        nhan: nhanDiem(new Set([n - 1]), N, fmtTb, f ? 'b' : 'r', chuTxPr(800, mau, true)),
      }, refNhan, nhan));
    }
    if (f) {
      // Đường dự báo (nét đứt, điểm rỗng) nối từ tháng có tồn mới nhất + thanh sai số ± (cột J)
      const giaTriDb = [...Array<null>(n - 1).fill(null), tong[n - 1], ...dbDiem.map(p => doi(p.ton))];
      const ss = [...Array<null>(n).fill(null), ...dbDiem.map(p => (p.cao === null ? null : doi(p.cao - p.ton)))];
      const refSs = thamChieu(COT_SS, r1, rN);
      const thanhSai = ss.some(x => x !== null)
        ? '<c:errBars><c:errBarType val="both"/><c:errValType val="cust"/><c:noEndCap val="0"/>'
          + `<c:plus><c:numRef><c:f>${xmlChu(refSs)}</c:f>${cacheSo(ss)}</c:numRef></c:plus>`
          + `<c:minus><c:numRef><c:f>${xmlChu(refSs)}</c:f>${cacheSo(ss)}</c:numRef></c:minus>`
          + `<c:spPr>${duong(mau, 12700)}</c:spPr></c:errBars>`
        : '';
      series.push(`<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>${xmlChu('Dự báo theo kế hoạch doanh thu (± sai số kiểm lại)')}</c:v></c:tx>`
        + `<c:spPr>${duong(mau, 22225, 'dash')}</c:spPr>`
        + `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="15875"><a:solidFill><a:srgbClr val="${mau}"/></a:solidFill></a:ln></c:spPr></c:marker>`
        + nhanDiem(new Set(dbDiem.map((_, j) => n + j)), N, dinhDang, 'r', chuTxPr(900, mau, true)) + thanhSai
        + `<c:cat><c:strRef><c:f>${xmlChu(refNhan)}</c:f>${cacheChu(nhan)}</c:strRef></c:cat>`
        + `<c:val><c:numRef><c:f>${xmlChu(thamChieu(COT_DB, r1, rN))}</c:f>${cacheSo(giaTriDb)}</c:numRef></c:val><c:smooth val="0"/></c:ser>`);
      idx++;
      // Số ở 2 đầu thanh sai số: dãy "thấp" / "cao" không nét, không điểm — chỉ để ghi số (cột J / K)
      if (ss.some(x => x !== null)) {
        const thap = [...Array<null>(n).fill(null), ...dbDiem.map(p => (p.thap === null ? null : doi(p.thap)))];
        const cao = [...Array<null>(n).fill(null), ...dbDiem.map(p => (p.cao === null ? null : doi(p.cao)))];
        const hienDb = new Set(dbDiem.map((_, j) => n + j));
        for (const [ten, cot, gt, viTri] of [['Dự báo thấp (− sai số)', COT_THAP, thap, 'b'], ['Dự báo cao (+ sai số)', COT_CAO, cao, 't']] as const) {
          series.push(`<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>${xmlChu(ten)}</c:v></c:tx>`
            + '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>'
            + nhanDiem(hienDb, N, dinhDang, viTri, chuTxPr(800, mau))
            + `<c:cat><c:strRef><c:f>${xmlChu(refNhan)}</c:f>${cacheChu(nhan)}</c:strRef></c:cat>`
            + `<c:val><c:numRef><c:f>${xmlChu(thamChieu(cot, r1, rN))}</c:f>${cacheSo(gt)}</c:numRef></c:val><c:smooth val="0"/></c:ser>`);
          idx++;
        }
      }
    }
    const mauXh = xh?.huong === 'tang' ? MAU_TANG : xh?.huong === 'giam' ? MAU_GIAM : '64748B';
    if (xh && coDuBao) {
      series.push(day(idx++, {
        ten: `Xu hướng ${chuXuHuong(xh, v.chiSo, v.moc)}`, refGiaTri: thamChieu(COT_XH, r1, rN),
        giaTri: [...xh.giaTri.map(doi), ...rong], mau: mauXh, rong: 22225, net: 'lgDash', diem: false, nhan: '',
      }, refNhan, nhan));
    }
    const trend = xh && !coDuBao
      ? `<c:trendline><c:name>${xmlChu(`Xu hướng ${chuXuHuong(xh, v.chiSo, v.moc)}`)}</c:name><c:spPr>${duong(
        mauXh, 22225, 'lgDash')}</c:spPr>`
        + '<c:trendlineType val="linear"/><c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>'
      : '';
    series.push(day(idx++, {
      ten: 'Tổng tồn', refGiaTri: thamChieu(COT_TONG, r1, rN), giaTri: [...tong, ...rong], mau, rong: 28575, diem: true,
      nhan: nhanDiem(chiSoNhan(tong), N, dinhDang, 't', chuTxPr(900, '0F172A', true)), trendline: trend,
    }, refNhan, nhan));

    const tieuDe = `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>`
      + `<a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1200" b="1"><a:solidFill><a:srgbClr val="${mau}"/></a:solidFill></a:rPr><a:t>${xmlChu(ten)}</a:t></a:r></a:p>`
      + (cau ? `<a:p><a:pPr><a:defRPr sz="1000" b="0"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1000" b="0"><a:solidFill><a:srgbClr val="1E293B"/></a:solidFill></a:rPr><a:t>${xmlChu(cau)}</a:t></a:r></a:p>` : '')
      + (f && db ? `<a:p><a:pPr><a:defRPr sz="1000" b="0"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1000" b="1"><a:solidFill><a:srgbClr val="${mau}"/></a:solidFill></a:rPr><a:t>${xmlChu(`Dự báo theo kế hoạch doanh thu: ${chuDuBao(db)}`)}</a:t></a:r></a:p>` : '')
      + `</c:rich></c:tx><c:overlay val="0"/></c:title>`;
    const truc = `<c:catAx><c:axId val="5${k}01"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>`
      + `<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
      + `<c:spPr>${duong('CBD5E1', 9525)}</c:spPr>${chuTxPr(900, '64748B')}<c:crossAx val="5${k}02"/><c:crosses val="autoZero"/>`
      + `<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
      + `<c:valAx><c:axId val="5${k}02"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>`
      + `<c:majorGridlines><c:spPr>${duong('E2E8F0', 9525)}</c:spPr></c:majorGridlines>`
      // Trục tỷ để "General": nhóm nhỏ (Kim Loại < 1 tỷ, vạch 0.1) mà để "0" thì vạch nào cũng ghi 0 / 1
      + `<c:numFmt formatCode="${giaTri ? 'General' : '#,##0'}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
      + `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${chuTxPr(900, '94A3B8')}<c:crossAx val="5${k}01"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
    const dongChinh = DONG_BIEU_DO_DAU + (coDT ? DONG_DT_TREN : 0) + k * dongMoiNhom;
    bieuDo.push({ dong: dongChinh, caoPx: CAO_PX, xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<c:date1904 val="0"/><c:lang val="vi-VN"/><c:roundedCorners val="0"/>'
      + `<c:chart>${tieuDe}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>`
      + `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series.join('')}<c:marker val="1"/><c:axId val="5${k}01"/><c:axId val="5${k}02"/></c:lineChart>`
      + `${truc}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`
      + `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${chuTxPr(900, '475569')}</c:legend>`
      + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="span"/></c:chart>'
      + `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>${duong('E2E8F0', 9525)}</c:spPr>`
      + '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr>'
      + '</c:chartSpace>' });

  });

  // ---- 1 biểu đồ doanh thu chung (cả công ty) ở ĐẦU sheet "Biểu đồ": cột = doanh số cần đạt (tháng dự báo viền đứt),
  // đường = doanh thu thực tế. Số ở khối cuối sheet "Số liệu biểu đồ" (A Kỳ, C Cần đạt, D Thực tế). Trước: 1 biểu đồ
  // doanh thu dưới MỖI nhóm — cùng 1 dãy số lặp 6 lần.
  if (coDT && dsKhoa.size) {
    const khoa = [...dsKhoa.keys()].sort();
    const nhan = khoa.map(k => dsKhoa.get(k)!);
    const thucTe = (t: string) => (t <= thangHienTai! && doanhThu?.thucTe[t] !== undefined ? tron3(doanhThu.thucTe[t]) : null);
    const kh = khoa.map(keHoach), tt = khoa.map(thucTe);
    hang();
    hang('Doanh số cần đạt & thực tế từng tháng (cả công ty, tỷ)');
    hang('Kỳ', null, 'Doanh số cần đạt (tỷ)', 'Thực tế (tỷ)');
    const r1 = soLieu.length, rN = r1 + khoa.length - 1;
    khoa.forEach((_, i) => hang(nhan[i], null, kh[i], tt[i]));
    const refNhan = thamChieu(COT_KY, r1, rN);
    const vien = khoa.map((k, i) => (k > thangHienTai! ? `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/>`
      + `<c:spPr><a:noFill/><a:ln w="12700"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr></c:dPt>` : '')).join('');
    const serKh = `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Doanh số cần đạt</c:v></c:tx>`
      + `<c:spPr><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>${vien}`
      + `<c:dLbls><c:numFmt formatCode="0" sourceLinked="0"/>${KHONG_NEN}${chuTxPr(800, '475569')}<c:dLblPos val="outEnd"/>${CO_HIEN(true)}</c:dLbls>`
      + `<c:cat><c:strRef><c:f>${xmlChu(refNhan)}</c:f>${cacheChu(nhan)}</c:strRef></c:cat>`
      + `<c:val><c:numRef><c:f>${xmlChu(thamChieu(COT_TONG, r1, rN))}</c:f>${cacheSo(kh)}</c:numRef></c:val></c:ser>`;
    const serTt = day(1, {
      ten: 'Thực tế (nhập kho thành phẩm)', refGiaTri: thamChieu(COT_CHAM, r1, rN), giaTri: tt,
      mau: '1E293B', rong: 22225, diem: true, nhan: '',
    }, refNhan, nhan);
    const tieuDeDT = 'Doanh số cần đạt & thực tế từng tháng (cả công ty, tỷ) — cột viền = tháng tới';
    const trucDT = `<c:catAx><c:axId val="7001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>`
      + `<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
      + `<c:spPr>${duong('CBD5E1', 9525)}</c:spPr>${chuTxPr(800, '64748B')}<c:crossAx val="7002"/><c:crosses val="autoZero"/>`
      + `<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
      + `<c:valAx><c:axId val="7002"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>`
      + `<c:majorGridlines><c:spPr>${duong('EEF2F6', 9525)}</c:spPr></c:majorGridlines>`
      + `<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
      + `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${chuTxPr(800, '94A3B8')}<c:crossAx val="7001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
    bieuDo.unshift({ dong: DONG_BIEU_DO_DAU, caoPx: CAO_DT_PX, xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<c:date1904 val="0"/><c:lang val="vi-VN"/><c:roundedCorners val="0"/>'
      + `<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="0"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1000" b="1"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:rPr><a:t>${xmlChu(tieuDeDT)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
      + '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>'
      + `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${serKh}`
      + `<c:gapWidth val="60"/><c:axId val="7001"/><c:axId val="7002"/></c:barChart>`
      + `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${serTt}<c:marker val="1"/><c:axId val="7001"/><c:axId val="7002"/></c:lineChart>`
      + `${trucDT}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`
      + `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${chuTxPr(800, '475569')}</c:legend>`
      + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>'
      + `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>${duong('E2E8F0', 9525)}</c:spPr>`
      + '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800"/></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr>'
      + '</c:chartSpace>' });
  }
  return { soLieu, congThuc, bieuDo, rongCot: [12, 12, 16, 32, 16, ...(coDT ? [22] : []), ...(coDuBao ? [16, 14, 16, 16, 16] : [])] };
}

// ---------------------------------------------------------------------------
// Chèn biểu đồ vào gói .xlsx do SheetJS ghi (drawing + chart + quan hệ + content types)
// ---------------------------------------------------------------------------
const giaiXml = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

interface GoiZip {
  file(ten: string): { async(kieu: 'string'): Promise<string> } | null;
  file(ten: string, noiDung: string): unknown;
  generateAsync(o: { type: 'uint8array'; compression: 'DEFLATE' }): Promise<Uint8Array>;
}

/** Đường dẫn file XML của sheet tên `tenSheet` trong gói (vd 'xl/worksheets/sheet2.xml') */
async function duongDanSheet(zip: GoiZip, tenSheet: string): Promise<string> {
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!wb || !rels) throw new Error('Gói xlsx thiếu workbook.xml');
  const the = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => m[0])
    .find(t => giaiXml(/\bname="([^"]*)"/.exec(t)?.[1] ?? '') === tenSheet);
  const rid = the && /\br:id="([^"]+)"/.exec(the)?.[1];
  const rel = rid && [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(t => t.includes(`Id="${rid}"`));
  const dich = rel && /\bTarget="([^"]+)"/.exec(rel)?.[1];
  if (!dich) throw new Error(`Không thấy sheet "${tenSheet}" trong gói xlsx`);
  return dich.startsWith('/') ? dich.slice(1) : `xl/${dich}`;
}

/** Chèn các biểu đồ (XML + dòng neo + chiều cao) lên sheet `tenSheet` */
export async function chenBieuDoVaoXlsx(du: ArrayBuffer | Uint8Array, tenSheet: string, bieuDo: BieuDoExcelMot[]): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default;
  const zip = (await JSZip.loadAsync(du)) as unknown as GoiZip;
  const dsSheet = await duongDanSheet(zip, tenSheet);
  const thuMuc = dsSheet.slice(0, dsSheet.lastIndexOf('/'));
  const tenFile = dsSheet.slice(dsSheet.lastIndexOf('/') + 1);

  bieuDo.forEach((b, i) => zip.file(`xl/charts/chart${i + 1}.xml`, b.xml));
  const neo = bieuDo.map((b, i) => '<xdr:oneCellAnchor>'
    + `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${b.dong}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
    + `<xdr:ext cx="${RONG_PX * EMU_MOI_PX}" cy="${b.caoPx * EMU_MOI_PX}"/>`
    + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Biểu đồ ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
    + '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">'
    + `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame>`
    + '<xdr:clientData/></xdr:oneCellAnchor>').join('');
  zip.file('xl/drawings/drawing1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `${neo}</xdr:wsDr>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + bieuDo.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join('')
    + '</Relationships>');

  // Quan hệ sheet => drawing
  const duongRels = `${thuMuc}/_rels/${tenFile}.rels`;
  const RID = 'rIdBieuDo1';
  const relMoi = `<Relationship Id="${RID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>`;
  const relCu = await zip.file(duongRels)?.async('string');
  zip.file(duongRels, relCu
    ? relCu.replace('</Relationships>', `${relMoi}</Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relMoi}</Relationships>`);

  // <drawing> đặt sau các phần tử đứng trước nó theo lược đồ (SheetJS không ghi phần tử nào đứng sau drawing)
  let sheet = await zip.file(dsSheet)?.async('string');
  if (!sheet) throw new Error('Không đọc được sheet biểu đồ');
  if (!/xmlns:r="/.test(sheet.slice(0, 600))) {
    sheet = sheet.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  }
  sheet = sheet.replace('</worksheet>', `<drawing r:id="${RID}"/></worksheet>`);
  zip.file(dsSheet, sheet);

  let ct = await zip.file('[Content_Types].xml')?.async('string');
  if (!ct) throw new Error('Gói xlsx thiếu [Content_Types].xml');
  ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
    + bieuDo.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')
    + '</Types>');
  zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
