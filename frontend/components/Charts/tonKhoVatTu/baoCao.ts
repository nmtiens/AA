import type {
  Column, Content, ContentTable, DynamicContent, TableCell, TCreatedPdf, TDocumentDefinitions, TFontDictionary, TVirtualFileSystem,
} from 'pdfmake/interfaces';
import {
  dinhDangChenh, dinhDangChiSo, dinhDangPt, dinhDangSo, nhanNgay, tenNhomGon, tomTatNhom, trungBinhTong, xuHuongTong,
  type ChiSo, type ChuoiNhom, type DiemChuoi, type MocXem, type O, type TongCacNhom, type XuHuong,
} from './xuLy';

// ============================================================================
// BÁO CÁO TỒN KHO VẬT TƯ — nút "Xuất báo cáo" của trang 7. Tồn kho vật tư
//   dungBaoCaoPdf: định nghĩa tài liệu pdfmake (thuần, test render thật bằng bản server): trang ngang A4 — tiêu đề,
//     4 số tổng, bảng tổng kết 6 nhóm, rồi mỗi nhóm: câu tóm tắt + ẢNH biểu đồ chụp từ trang + trung bình / xu hướng
//     + bảng số từng kỳ (khi ≤ 13 kỳ). Đúng chế độ đang xem (tháng / tuần, khoảng, giá trị / số mã).
//   bangBaoCaoExcel: sheet "Báo cáo" (1 dòng / nhóm) đặt trước các sheet số liệu.
//   taiBaoCaoPdf: nạp ĐỘNG pdfmake + font Roboto (đủ dấu tiếng Việt) lúc bấm xuất — không vào gói chính.
// ============================================================================

/** Tổng kết 1 nhóm cho báo cáo (cùng cách tính với thẻ biểu đồ trên trang) */
export interface TongKetNhom {
  nhom: string;
  cuoi: DiemChuoi;
  dau: DiemChuoi;
  /** cuoi.tong − dau.tong; null khi chỉ 1 điểm */
  chenhDau: number | null;
  ptDau: number | null;
  dinh: DiemChuoi;
  tb: number | null;
  xh: XuHuong | null;
  /** % chậm luân chuyển ở điểm cuối (null khi lần chốt cuối thiếu cờ) */
  ptCham: number | null;
  cau: string;
}

export function tongKetNhom(c: ChuoiNhom, chiSo: ChiSo): TongKetNhom | null {
  const ds = c.diem;
  if (!ds.length) return null;
  const cuoi = ds[ds.length - 1], dau = ds[0];
  const dinh = ds.reduce((m, d) => (d.tong > m.tong ? d : m), ds[0]);
  const coSoSanh = ds.length > 1;
  return {
    nhom: c.nhom,
    cuoi,
    dau,
    chenhDau: coSoSanh ? cuoi.tong - dau.tong : null,
    ptDau: coSoSanh && dau.tong > 0 ? ((cuoi.tong - dau.tong) / dau.tong) * 100 : null,
    dinh,
    tb: coSoSanh ? trungBinhTong(ds) : null,
    xh: xuHuongTong(ds),
    ptCham: !cuoi.thieuCham && cuoi.tong > 0 ? (cuoi.cham / cuoi.tong) * 100 : null,
    cau: tomTatNhom(ds, chiSo),
  };
}

const donViKy = (moc: MocXem) => (moc === 'tuan' ? 'tuần' : 'tháng');

/** "tăng ~2.58 tỷ/tháng (+75% cả khoảng)" / "đi ngang" / "" (chưa đủ 3 điểm). Không dùng ▲ ▼: phông Roboto của PDF
 *  không có 2 ký tự này (in ra ô vuông) — hướng đã rõ bằng chữ + màu */
export const chuXuHuong = (xh: XuHuong | null, chiSo: ChiSo, moc: MocXem): string => {
  if (!xh) return '';
  if (xh.huong === 'ngang') return 'đi ngang';
  return `${xh.huong === 'tang' ? 'tăng' : 'giảm'} ~${dinhDangChiSo(Math.abs(xh.moiDiem), chiSo)}/${donViKy(moc)}`
    + (xh.ptCaKhoang !== null ? ` (${dinhDangPt(xh.ptCaKhoang, true)} cả khoảng)` : '');
};

// ---------------------------------------------------------------------------
// Excel — sheet "Báo cáo"
// ---------------------------------------------------------------------------

/**
 * Sheet "Báo cáo": 1 dòng / nhóm + dòng tổng; số theo đơn vị hiển thị (tỷ đồng hoặc số mã), ô trống khi không có.
 * nhanTong: tên dòng tổng (có nhóm đang lọc tên => tổng không còn là toàn kho, nơi gọi ghi rõ).
 */
export function bangBaoCaoExcel(chuoi: ChuoiNhom[], chiSo: ChiSo, moc: MocXem, nhanTong = 'Tổng các nhóm'): O[][] {
  const dv = chiSo === 'giaTri' ? '(tỷ)' : '(mã)';
  const so = (v: number | null): O => (v === null ? '' : chiSo === 'giaTri' ? Math.round(v) / 1000 : Math.round(v));
  const pt = (v: number | null): O => (v === null ? '' : Math.round(v * 10) / 10);
  const dau: O[] = [
    'Nhóm vật tư', `Tồn mới nhất ${dv}`, 'Ngày chốt', `So với đầu khoảng ${dv}`, '% so với đầu khoảng',
    `Đỉnh ${dv}`, 'Kỳ đỉnh', `Trung bình ${dv}`, `Xu hướng mỗi ${donViKy(moc)} ${dv}`, '% xu hướng cả khoảng',
    `Chậm luân chuyển > 3 tháng ${dv}`, '% chậm luân chuyển', 'Tóm tắt',
  ];
  const dong: O[][] = [dau];
  let tCuoi = 0, tDau = 0, tCham = 0, thieu = false, ngay = '';
  for (const c of chuoi) {
    const k = tongKetNhom(c, chiSo);
    if (!k) continue;
    tCuoi += k.cuoi.tong; tDau += k.dau.tong; tCham += k.cuoi.cham; thieu = thieu || k.cuoi.thieuCham; ngay = k.cuoi.ngayChot;
    dong.push([
      k.nhom, so(k.cuoi.tong), nhanNgay(k.cuoi.ngayChot), so(k.chenhDau), pt(k.ptDau),
      so(k.dinh.tong), k.dinh.nhan, so(k.tb), so(k.xh ? k.xh.moiDiem : null), pt(k.xh ? k.xh.ptCaKhoang : null),
      k.cuoi.thieuCham ? '' : so(k.cuoi.cham), pt(k.ptCham), k.cau,
    ]);
  }
  if (dong.length > 2) {
    const nhieuDiem = (chuoi[0]?.diem.length ?? 0) > 1;
    dong.push([
      nhanTong, so(tCuoi), nhanNgay(ngay), nhieuDiem ? so(tCuoi - tDau) : '', nhieuDiem && tDau > 0 ? pt(((tCuoi - tDau) / tDau) * 100) : '',
      '', '', '', '', '', thieu ? '' : so(tCham), !thieu && tCuoi > 0 ? pt((tCham / tCuoi) * 100) : '', '',
    ]);
  }
  return dong;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export interface DauVaoBaoCao {
  chuoi: ChuoiNhom[];
  tong: TongCacNhom;
  chiSo: ChiSo;
  moc: MocXem;
  /** 'Tất cả' / '6 tháng gần nhất' / '3 tháng gần nhất' */
  khoangNhan: string;
  ngayMoiNhat: string;
  /** Thời điểm dữ liệu cập nhật (đã định dạng) */
  capNhat: string | null;
  nguoiLap: string;
  luc: Date;
  /** Ảnh PNG (data URL) biểu đồ từng nhóm, chụp từ trang; thiếu ảnh => ghi chú thay ảnh */
  anh: Record<string, string | undefined>;
  /** Màu từng nhóm (đồng bộ với trang) */
  mau: Record<string, string>;
  /** Bộ lọc tên của từng biểu đồ (nhóm => tên thoả + câu mô tả); nhóm có ở đây thì `chuoi` của nhóm là số theo bộ lọc */
  loc?: Record<string, LocBaoCao>;
  /** Doanh thu tháng cả công ty (tỷ, khoá 'YYYY-MM') — có khi xem theo tháng: thêm dòng "Doanh thu" vào bảng từng kỳ */
  doanhThu?: Record<string, number>;
  /** Tháng đang chạy ('YYYY-MM'): doanh thu tạm tính, đánh dấu * */
  thangTamTinh?: string;
}

/** Bộ lọc tên 1 nhóm trong báo cáo: các tên thoả + câu mô tả ("tên chứa “vải”", "3 tên đã chọn") */
export interface LocBaoCao { ten: string[]; moTa: string }

/** "Vải Da Mouss" / "Vải Da Mouss (lọc: tên chứa “vải”)" */
const tenNhomBaoCao = (nhom: string, loc?: Record<string, LocBaoCao>) =>
  tenNhomGon(nhom) + (loc?.[nhom] ? ` (lọc: ${loc[nhom].moTa})` : '');

/** Tối đa bấy nhiêu tên in ra ở trang của nhóm đang lọc (đủ danh sách trong Excel, sheet "Bộ lọc tên") */
const TEN_LOC_TOI_DA_PDF = 20;

const XAM = '#64748b';
const NEN = '#f1f5f9';
const MAU_TANG = '#b45309';
const MAU_GIAM = '#047857';
const RONG_NOI_DUNG = 842 - 32 - 32; // A4 ngang trừ lề trái / phải
/** Bảng số từng kỳ chỉ in khi ≤ bấy nhiêu kỳ (theo tuần 33 lần chốt thì quá hẹp — số từng tuần xem trong Excel) */
const KY_TOI_DA_BANG = 13;

const hai = (n: number) => String(n).padStart(2, '0');
const nhanLuc = (d: Date) => `${hai(d.getHours())}:${hai(d.getMinutes())} ${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()}`;
const mauChenh = (v: number | null) => (v === null || Math.abs(v) < 1e-9 ? XAM : v > 0 ? MAU_TANG : MAU_GIAM);
/** "+13.17 tỷ (+50%)" — dấu + / − và màu (cam tăng, xanh giảm) thay ▲ ▼ (Roboto không có, in ra ô vuông) */
const chenhCoDau = (v: number | null, pt: number | null, chiSo: ChiSo) =>
  v === null ? '—' : `${dinhDangChenh(v, chiSo)}${pt !== null ? ` (${dinhDangPt(pt, true)})` : ''}`;

/** Ô vuông màu nhóm (canvas pdfmake) đứng trước tên nhóm */
const oMau = (mau: string): Column => ({ canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, r: 1.5, color: mau }], width: 12 });

function oSo(nhan: string, giaTri: string, phu: string, mau?: string): TableCell {
  return {
    stack: [
      { text: nhan, fontSize: 8, color: XAM },
      { text: giaTri, fontSize: 14, bold: true, color: mau ?? '#0f172a', margin: [0, 2, 0, 1] },
      { text: phu, fontSize: 7.5, color: XAM },
    ],
    margin: [6, 5, 6, 5],
  };
}

function bangTongKet(ds: TongKetNhom[], chiSo: ChiSo, moc: MocXem, loc?: Record<string, LocBaoCao>): ContentTable {
  const dau = ['Nhóm vật tư', 'Tồn mới nhất', 'So với đầu khoảng', 'Đỉnh (kỳ)', 'Trung bình', `Xu hướng`, 'Chậm luân chuyển > 3 tháng'];
  const body: TableCell[][] = [dau.map((t, i) => ({ text: t, bold: true, fillColor: NEN, alignment: i ? 'right' : 'left' }))];
  for (const k of ds) {
    body.push([
      { text: tenNhomBaoCao(k.nhom, loc), bold: true },
      { text: dinhDangChiSo(k.cuoi.tong, chiSo), alignment: 'right' },
      { text: chenhCoDau(k.chenhDau, k.ptDau, chiSo), alignment: 'right', color: mauChenh(k.chenhDau) },
      { text: `${dinhDangChiSo(k.dinh.tong, chiSo)} (${k.dinh.nhan})`, alignment: 'right' },
      { text: k.tb === null ? '—' : dinhDangChiSo(k.tb, chiSo), alignment: 'right' },
      { text: chuXuHuong(k.xh, chiSo, moc) || '—', alignment: 'right', color: k.xh ? mauChenh(k.xh.huong === 'ngang' ? 0 : k.xh.moiDiem) : XAM },
      { text: k.cuoi.thieuCham ? 'thiếu số' : `${dinhDangChiSo(k.cuoi.cham, chiSo)} (${dinhDangPt(k.ptCham)})`, alignment: 'right' },
    ]);
  }
  return { table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'], body, dontBreakRows: true }, layout: 'lightHorizontalLines', fontSize: 8.5 };
}

/** Bảng số từng kỳ của 1 nhóm: Kỳ / Tổng tồn / Chậm LC / So kỳ trước (+ Doanh thu tháng khi có) */
function bangKy(c: ChuoiNhom, chiSo: ChiSo, doanhThu?: Record<string, number>, thangTamTinh?: string): ContentTable {
  const ds = c.diem;
  const o = (t: string, phai = true, them: { bold?: boolean; fillColor?: string; color?: string } = {}): TableCell =>
    ({ text: t, alignment: phai ? 'right' : 'left', ...them });
  const body: TableCell[][] = [
    [o('Kỳ', false, { bold: true, fillColor: NEN }), ...ds.map(d => o(d.nhan, true, { bold: true, fillColor: NEN }))],
    [o('Tổng tồn', false), ...ds.map(d => o(dinhDangChiSo(d.tong, chiSo).replace(/ (tỷ|mã)$/, '')))],
    [o('Chậm LC', false), ...ds.map(d => o(d.thieuCham ? '—' : dinhDangChiSo(d.cham, chiSo).replace(/ (tỷ|mã)$/, ''), true, { color: XAM }))],
    [o('So kỳ trước', false), ...ds.map(d => o(d.chenh === null ? '' : dinhDangChenh(d.chenh, chiSo).replace(/ (tỷ|mã)$/, ''), true, { color: mauChenh(d.chenh) }))],
  ];
  if (doanhThu && ds.some(d => doanhThu[d.khoa] !== undefined)) {
    body.push([o('Doanh thu (tỷ)', false, { bold: true }), ...ds.map(d => o(doanhThu[d.khoa] === undefined ? '—'
      : `${dinhDangSo(doanhThu[d.khoa], 2)}${d.khoa === thangTamTinh ? '*' : ''}`, true, { color: '#334155' }))]);
  }
  return { table: { headerRows: 1, widths: ['auto', ...ds.map(() => '*' as const)], body }, layout: 'lightHorizontalLines', fontSize: 7.5 };
}

const coDoanhThu = (c: ChuoiNhom, v: DauVaoBaoCao) => v.moc === 'thang' && !!v.doanhThu && c.diem.some(d => v.doanhThu?.[d.khoa] !== undefined);

function phanNhom(c: ChuoiNhom, k: TongKetNhom, v: DauVaoBaoCao): Content {
  const mau = v.mau[c.nhom] ?? '#334155';
  const anh = v.anh[c.nhom];
  const locNhom = v.loc?.[c.nhom];
  const tenLoc = locNhom?.ten ?? [];
  const dongPhu = [
    k.tb !== null ? `Trung bình ${c.diem.length} ${v.moc === 'tuan' ? 'lần chốt' : 'tháng'}: ${dinhDangChiSo(k.tb, v.chiSo)}` : '',
    k.xh ? `Xu hướng ${chuXuHuong(k.xh, v.chiSo, v.moc)}` : '',
    coDoanhThu(c, v) ? `Doanh thu tháng: đường điểm vuông xám đậm, trục phải (tỷ)${c.diem.some(d => d.khoa === v.thangTamTinh) ? '; * tạm tính (tháng chưa hết)' : ''}` : '',
  ].filter(Boolean).join('   ·   ');
  const noiDung: Content[] = [
    { columns: [oMau(mau), { text: tenNhomBaoCao(c.nhom, v.loc), bold: true, fontSize: 11 }], columnGap: 4 },
    ...(tenLoc.length ? [{
      text: `Bộ lọc: ${locNhom?.moTa} — ${tenLoc.length} tên vật tư: ${tenLoc.slice(0, TEN_LOC_TOI_DA_PDF).join(', ')}`
        + (tenLoc.length > TEN_LOC_TOI_DA_PDF ? ` … và ${tenLoc.length - TEN_LOC_TOI_DA_PDF} tên khác` : ''),
      fontSize: 7.5, color: XAM, margin: [0, 2, 0, 0] as [number, number, number, number],
    }] : []),
    { text: k.cau, fontSize: 9.5, bold: true, margin: [0, 3, 0, 4] },
    // Ảnh chụp ở tỷ lệ ~2,7:1 (trang tạm cao biểu đồ lúc xuất) => rộng hết trang ~288pt, mỗi nhóm vừa 1 trang ngang
    anh ? { image: anh, fit: [RONG_NOI_DUNG, 300], alignment: 'center' } : { text: '(Không chụp được biểu đồ của nhóm này)', italics: true, color: XAM, fontSize: 8 },
  ];
  if (dongPhu) noiDung.push({ text: dongPhu, fontSize: 8, color: XAM, margin: [0, 2, 0, 3] });
  if (c.diem.length <= KY_TOI_DA_BANG) noiDung.push(bangKy(c, v.chiSo, v.moc === 'thang' ? v.doanhThu : undefined, v.thangTamTinh));
  return { stack: noiDung, unbreakable: true, margin: [0, 6, 0, 6] };
}

export function dungBaoCaoPdf(v: DauVaoBaoCao): TDocumentDefinitions {
  const ds = v.chuoi.map(c => ({ c, k: tongKetNhom(c, v.chiSo) })).filter((x): x is { c: ChuoiNhom; k: TongKetNhom } => !!x.k);
  const mau = v.chuoi[0]?.diem ?? [];
  const khoangThat = mau.length ? `${mau[0].nhan} – ${mau[mau.length - 1].nhan}` : '';
  const dv = v.chiSo === 'giaTri' ? 'giá trị, tỷ đồng' : 'số mã vật tư';
  const ngayThieu = mau.filter(d => d.thieuCham).map(d => nhanNgay(d.ngayChot));
  const t = v.tong;
  const nhanTruoc = v.moc === 'tuan' ? 'So với lần chốt trước' : 'So với cuối tháng trước';
  const ghiChu = [
    'Tồn kho là ảnh chụp từng lần chốt (thứ Năm hằng tuần) — không cộng dồn các lần chốt; xem theo tháng lấy lần chốt cuối tháng.',
    'Chậm luân chuyển > 3 tháng theo cột đánh dấu của file tồn kho vật tư. Đường xu hướng: đường thẳng hồi quy qua các điểm trong khoảng.',
    ...(ngayThieu.length ? [`Lần chốt ${ngayThieu.join(', ')}: file nguồn không có cột chậm luân chuyển (ghi "—" / "thiếu số").`] : []),
    ...(v.moc === 'thang' && v.doanhThu && v.chuoi.some(c => coDoanhThu(c, v))
      ? ['Doanh thu tháng = giá trị nhập kho thành phẩm của cả công ty (không tính hạng mục hủy), cùng số với bảng Kế hoạch năm – Thực hiện; vẽ ở trục phải từng biểu đồ.']
      : []),
    ...(Object.keys(v.loc ?? {}).length
      ? ['4 số tổng phía trên tính cho toàn kho. Nhóm ghi "lọc: …" chỉ tính các tên vật tư thoả bộ lọc (như bộ lọc cột của Excel) của biểu đồ đó — danh sách tên in ở trang của nhóm.']
      : []),
  ];
  const footer: DynamicContent = (trang, tongTrang) => ({
    text: `Báo cáo tồn kho vật tư · chốt ${nhanNgay(v.ngayMoiNhat)} · Trang ${trang}/${tongTrang}`,
    alignment: 'right', fontSize: 7.5, color: XAM, margin: [32, 10, 32, 0],
  });
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [32, 32, 32, 36],
    info: { title: `Báo cáo tồn kho vật tư ${nhanNgay(v.ngayMoiNhat)}`, author: v.nguoiLap },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#0f172a' },
    footer,
    content: [
      { text: 'BÁO CÁO TỒN KHO VẬT TƯ', fontSize: 16, bold: true },
      { text: `${v.moc === 'tuan' ? 'Theo từng lần chốt (tuần)' : 'Theo tháng (lần chốt cuối tháng)'} · ${v.khoangNhan}${khoangThat ? ` (${khoangThat})` : ''} · ${dv}`, color: XAM, margin: [0, 2, 0, 0] },
      { text: `Chốt mới nhất ${nhanNgay(v.ngayMoiNhat)}${v.capNhat ? ` · dữ liệu cập nhật ${v.capNhat}` : ''} · lập lúc ${nhanLuc(v.luc)} · người lập: ${v.nguoiLap}`, color: XAM, fontSize: 8, margin: [0, 1, 0, 10] },
      {
        table: {
          widths: ['*', '*', '*', '*'],
          body: [[
            oSo('Tổng tồn vật tư', dinhDangChiSo(t.tong, v.chiSo), `chốt ${nhanNgay(t.ngayChot)} · ${t.soNhom} nhóm`),
            oSo(nhanTruoc, chenhCoDau(t.truoc?.chenh ?? null, t.truoc?.chenhPt ?? null, v.chiSo),
              t.truoc ? `so với ${v.moc === 'tuan' ? nhanNgay(t.truoc.ngayChot) : `${t.truoc.nhan} (chốt ${nhanNgay(t.truoc.ngayChot)})`}` : 'chưa có kỳ trước', mauChenh(t.truoc?.chenh ?? null)),
            oSo('So với đầu khoảng', chenhCoDau(t.dau?.chenh ?? null, t.dau?.chenhPt ?? null, v.chiSo),
              t.dau ? `từ ${v.moc === 'tuan' ? nhanNgay(t.dau.ngayChot) : t.dau.nhan}` : 'khoảng chỉ có 1 kỳ', mauChenh(t.dau?.chenh ?? null)),
            oSo('Chậm luân chuyển > 3 tháng', t.thieuCham ? '—' : dinhDangChiSo(t.cham, v.chiSo),
              t.thieuCham ? 'lần chốt cuối thiếu cột chậm luân chuyển' : `${dinhDangPt(t.ptCham)} ${v.chiSo === 'giaTri' ? 'tổng giá trị tồn' : 'tổng số mã'}`),
          ]],
        },
        layout: { hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0', paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      },
      { text: 'Tổng kết theo nhóm', bold: true, fontSize: 11, margin: [0, 12, 0, 4] },
      bangTongKet(ds.map(x => x.k), v.chiSo, v.moc, v.loc),
      { ul: ghiChu, fontSize: 7.5, color: XAM, margin: [0, 8, 0, 0] },
      { text: 'Biểu đồ từng nhóm', bold: true, fontSize: 11, pageBreak: 'before', margin: [0, 0, 0, 2] },
      // Mỗi nhóm 1 trang (nhóm đầu nằm ngay dưới đề mục "Biểu đồ từng nhóm")
      ...ds.map((x, i): Content => (i === 0 ? phanNhom(x.c, x.k, v) : { stack: [phanNhom(x.c, x.k, v)], pageBreak: 'before' })),
    ],
  };
}

export const tenFileBaoCao = (v: Pick<DauVaoBaoCao, 'moc' | 'ngayMoiNhat'>, duoi: 'pdf' | 'xlsx') =>
  `bao-cao-ton-kho-vat-tu_${v.moc === 'tuan' ? 'theo-tuan' : 'theo-thang'}_${v.ngayMoiNhat}.${duoi}`;

// ---- Nạp pdfmake trên trình duyệt (cùng cách components/HoiDap/baoCao/xuatPdf.ts — không import file đó vì nó kéo
// theo bộ đọc câu của cửa sổ Hỏi số liệu) ------------------------------------------------------------------------

interface PdfMakeTrinhDuyet {
  createPdf(docDef: TDocumentDefinitions): TCreatedPdf;
  addVirtualFileSystem(vfs: TVirtualFileSystem): void;
  addFonts(fonts: TFontDictionary): void;
  fonts?: TFontDictionary;
}
/** Module thật từ namespace import động: CJS/UMD qua Vite nằm ở `.default`, ESM thì là chính namespace */
export const layModule = <T extends object>(ns: unknown): T => {
  const o = ns as { default?: unknown } | null;
  return (o && typeof o.default === 'object' && o.default !== null ? o.default : ns) as T;
};
export const FONT_ROBOTO: TFontDictionary = {
  Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
};
let daNapFont = false;

export async function taiBaoCaoPdf(v: DauVaoBaoCao): Promise<void> {
  const [nsPdf, nsVfs] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const pdfMake = layModule<PdfMakeTrinhDuyet>(nsPdf);
  if (!daNapFont) {
    pdfMake.addVirtualFileSystem(layModule<TVirtualFileSystem>(nsVfs));
    if (!pdfMake.fonts?.Roboto) pdfMake.addFonts(FONT_ROBOTO);
    daNapFont = true;
  }
  await pdfMake.createPdf(dungBaoCaoPdf(v)).download(tenFileBaoCao(v, 'pdf'));
}
