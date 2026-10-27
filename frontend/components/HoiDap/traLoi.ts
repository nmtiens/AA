// ============================================================================
// HỎI – ĐÁP SỐ LIỆU: lấy số từ các API sẵn có của app rồi dựng câu trả lời (chữ + bảng nhỏ + gợi ý hỏi tiếp).
// Không dùng AI — mỗi loại câu hỏi (hieuCauHoi.ts) có 1 hàm trả lời riêng.
// ============================================================================
import {
  fetchOverviewSummary, fetchOverviewByGroup, fetchStockDates, fetchRevenue2026, fetchYearPlanActual,
  fetchKhsxNhapKhoSummary, fetchTongQuanSanXuat, fetchTongQuanCongTrinh,
} from '../../services/dataService';
import { giaiNenBanGhi, type Rec } from '../Construction/core/banGhiCongTrinh';
import { tinhChiSo } from '../Construction/core/chiSoCongTrinh';
import { fetchVuongMacDashboard, fetchVuongMacByProject, type HexHit } from '../../services/vuongMacService';
import { searchHex } from '../../services/vuongMacMobileApi';
import { xuongSetupApi } from '../../services/xuongSetupApi';
import { DEFAULT_FILTERS, TUY_CHON_MAC_DINH } from '../Dashboard/core/tongQuanSanXuat';
import { formatTrieuAsTy, formatTy } from '../../utils/money';
import { type CauHoi, type Ky, type Y, kyMacDinh, thu2TuanIso, tuanIso, boDau, docMaCongTrinh } from './hieuCauHoi';
import { chayTruyVan, type DuongTraLoi, type TruyVan } from './truyVanApi';

export interface Bang {
  cot: string[]; dong: Array<Array<string | number>>; phai?: number[];
  /** Dòng tổng (in đậm cuối bảng) */
  cuoi?: Array<string | number>;
}
export interface TraLoi {
  /** Chữ trả lời; **đậm** được tô đậm, xuống dòng giữ nguyên */
  chu: string;
  bang?: Bang;
  /** Câu hỏi gợi ý tiếp theo (bấm để hỏi) */
  goiY?: string[];
  /** Mở trang chi tiết trong app */
  link?: { ten: string; to: string };
  /** Câu trả lời từ tự tra: truy vấn đã chạy (nút "Sửa điều kiện" mở lại khung Tự tra) */
  tv?: TruyVan;
  /** Tìm tự do không ra gì (để thử nhờ AI đọc câu) */
  rong?: boolean;
  /** Lựa chọn để người hỏi chọn ý (chữ hai nghĩa, xếp theo % hay số…): hỏi lại câu `cau` hoặc chạy truy vấn `tv` */
  chon?: Array<{ nhan: string; cau?: string; tv?: TruyVan; giuNguyen?: boolean }>;
  /** Câu trả lời là lời mời tải báo cáo (cửa sổ hiện nút Tải Excel / Tải PDF): số câu đã tick + định dạng người dùng nói */
  baoCao?: { soMuc: number; dinhDang: 'xlsx' | 'pdf' | null };
  /** Ghi nhật ký: đi đường nào + máy hiểu câu thế nào */
  nk?: { duong: DuongTraLoi; hieu?: string };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const so = (n: number) => Math.round(n).toLocaleString('en-US');
const ty = (trieu: number) => `${formatTrieuAsTy(trieu)} tỷ`;
/** Kỳ liền trước cùng độ dài (để so sánh) */
const kyTruoc = (k: Ky): Ky => {
  const n = Math.round((k.den.getTime() - k.tu.getTime()) / 86400000) + 1;
  const den = new Date(k.tu.getFullYear(), k.tu.getMonth(), k.tu.getDate() - 1);
  const tu = new Date(den.getFullYear(), den.getMonth(), den.getDate() - (n - 1));
  return { tu, den, ten: '' };
};
const chenh = (a: number, b: number) => {
  if (!b) return a ? '(kỳ trước = 0)' : '';
  const p = Math.round(((a - b) / b) * 100);
  return p === 0 ? '(bằng kỳ trước)' : `(${p > 0 ? '▲ +' : '▼ '}${p}% so với kỳ trước)`;
};

// Nguồn "dòng chảy" của tổng quan đơn hàng / kho
const NGUON: Partial<Record<Y, { k: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export'; bang: string; ten: string; dv: string; link: string }>> = {
  don_hang: { k: 'order', bang: 'dht', ten: 'Đơn hàng mới (P001)', dv: 'đơn', link: '/charts/order' },
  trien_khai: { k: 'tkbv', bang: 'tkbv_full', ten: 'Triển khai bản vẽ (P002)', dv: 'bản vẽ', link: '/charts/tkbv' },
  tinh_phieu: { k: 'pthsp', bang: 'pthsp_full', ten: 'Tính phiếu (P012)', dv: 'phiếu', link: '/charts/pthsp' },
  nhap_kho: { k: 'inventory', bang: 'nhap_kho', ten: 'Nhập kho (P022)', dv: 'mục', link: '/charts/inventory' },
  xuat_kho: { k: 'export', bang: 'xuat_kho', ten: 'Xuất kho (P025)', dv: 'mục', link: '/charts/export' },
};

/** Kỳ hỏi chạm những ngày bảng chưa có số (ETL chưa chạy, hỏi "tuần này" sáng thứ Hai) => ghi "số liệu mới nhất đến …"
 *  kẻo tưởng 0 là thật. Lấy maxNgay qua 1 truy vấn đếm nhỏ của tự tra (máy chủ cache theo phiên bản bảng); chỉ hỏi khi
 *  kỳ kết thúc trong 7 ngày gần đây. Lỗi => bỏ qua, câu trả lời vẫn ra. */
async function ghiMaxNgay(bang: string, k: Ky): Promise<string> {
  const homNay = new Date(); homNay.setHours(0, 0, 0, 0);
  if (k.den.getTime() < homNay.getTime() - 7 * 86400000) return '';
  try {
    const kq = await chayTruyVan({ bang, kieu: 'tong', do: [{ ham: 'dem' }], nhom: [], loc: [], tu: iso(k.den), den: iso(k.den) });
    if (!kq.maxNgay || kq.maxNgay >= iso(k.den)) return '';
    const vn = (s: string) => s.split('-').reverse().join('/');
    return iso(k.tu) > kq.maxNgay
      ? `\n_Chưa có số liệu cho kỳ này — mới nhất đến ${vn(kq.maxNgay)}._`
      : `\n_Số liệu mới nhất đến ${vn(kq.maxNgay)} (kỳ hỏi tới ${vn(iso(k.den))})._`;
  } catch { return ''; }
}

async function dongChay(c: CauHoi): Promise<TraLoi> {
  const n = NGUON[c.y]!;
  const k = c.ky ?? kyMacDinh(c.y, new Date());
  const ct = c.congTrinh ? await tenDayDu(c.congTrinh) : null;
  if (c.congTrinh && !ct) return { chu: `Không tìm thấy công trình **${c.congTrinh}**.` };
  const opts = c.xuong || ct ? { ...(c.xuong ? { xuong: [c.xuong] } : {}), ...(ct ? { congTrinh: [ct] } : {}) } : undefined;
  const pham = (c.xuong ? ` · xưởng ${c.xuong}` : '') + (ct ? ` · ${ct}` : '');
  if (c.nhom) {
    const rows = await fetchOverviewByGroup(n.k, c.nhom, { dateFromISO: iso(k.tu), dateToISO: iso(k.den), ...(opts ?? {}) });
    const top = [...rows].sort((a, b) => b.dailyValue - a.dailyValue || b.dailyCount - a.dailyCount).filter(r => r.dailyCount || r.dailyValue).slice(0, 12);
    if (!top.length) return { chu: `Không có số liệu **${n.ten}** ${k.ten}${pham}.${await ghiMaxNgay(n.bang, k)}` };
    const tongV = rows.reduce((a, r) => a + r.dailyValue, 0), tongC = rows.reduce((a, r) => a + r.dailyCount, 0);
    return {
      chu: `**${n.ten}** ${k.ten}${pham} theo ${c.nhom === 'xuong' ? 'xưởng' : 'công trình'}: tổng **${so(tongC)} ${n.dv}** · **${ty(tongV)}**${rows.length > top.length ? ` (hiện ${top.length}/${rows.length} nhóm lớn nhất)` : ''}.`,
      bang: { cot: [c.nhom === 'xuong' ? 'Xưởng' : 'Công trình', 'Số lượng', 'Giá trị (tỷ)', '%'], phai: [1, 2, 3],
        dong: top.map(r => [r.name || '—', so(r.dailyCount), formatTrieuAsTy(r.dailyValue), tongV ? `${Math.round((r.dailyValue / tongV) * 100)}%` : '—']) },
      link: { ten: 'Mở biểu đồ chi tiết', to: n.link },
      goiY: [`${n.ten.split(' (')[0].toLowerCase()} theo ${c.nhom === 'xuong' ? 'công trình' : 'xưởng'} ${k.macDinh ? 'tháng này' : ''}`.trim()],
    };
  }
  const t = kyTruoc(k);
  const [nay, truoc, ghiNgay] = await Promise.all([
    fetchOverviewSummary(iso(k.tu), iso(k.den), undefined, opts),
    fetchOverviewSummary(iso(t.tu), iso(t.den), undefined, opts),
    ghiMaxNgay(n.bang, k),
  ]);
  if (!nay) return { chu: 'Không lấy được số liệu, thử lại sau.' };
  const a = nay[n.k].daily, b = truoc?.[n.k].daily;
  const mtd = nay[n.k].mtd;
  return {
    chu: `**${n.ten}** ${k.ten}${pham}: **${so(a.count)} ${n.dv}** · **${ty(a.value)}** ${b ? chenh(a.value || a.count, b.value || b.count) : ''}`
      + (k.tu.getDate() !== 1 || k.tu.getMonth() !== k.den.getMonth() ? `\nLũy kế tháng ${k.den.getMonth() + 1}: ${so(mtd.count)} ${n.dv} · ${ty(mtd.value)}` : '')
      + ghiNgay,
    link: { ten: 'Mở biểu đồ chi tiết', to: n.link },
    goiY: [`${n.ten.split(' (')[0].toLowerCase()} theo xưởng ${k.macDinh ? 'tháng này' : ''}`.trim(), `${n.ten.split(' (')[0].toLowerCase()} theo công trình`],
  };
}

async function tonKho(): Promise<TraLoi> {
  const ds = await fetchStockDates();
  if (!ds?.length) return { chu: 'Chưa có số liệu tồn kho.' };
  const sx = [...ds].sort((a, b) => a.date.localeCompare(b.date));
  const m = sx[sx.length - 1], t = sx.length > 1 ? sx[sx.length - 2] : null;
  return {
    chu: `**Tồn kho** (ảnh chụp ngày ${m.date.slice(0, 10).split('-').reverse().join('/')}): **${so(m.count)} mục** · **${ty(m.value)}**`
      + (t ? `
Ảnh chụp trước (${t.date.slice(0, 10).split('-').reverse().join('/')}): ${so(t.count)} mục · ${ty(t.value)}` : ''),
    link: { ten: 'Mở biểu đồ tồn kho', to: '/charts/stock' },
    goiY: ['nhập kho tháng này', 'xuất kho tháng này'],
  };
}

async function tienDoNam(): Promise<TraLoi> {
  const r = await fetchRevenue2026();
  if (!r) return { chu: 'Không lấy được kế hoạch năm.' };
  const q = r.quarterlyTargets;
  return {
    chu: `**Tiến độ năm ${r.year}** (nhập kho mọi đơn): thực hiện **${formatTy(r.actual.value)} / ${formatTy(r.targetRevenue2026)} tỷ** · **${Math.round(r.actual.percent)}%**`
      + `\nCòn thiếu ${formatTy(Math.max(0, r.targetRevenue2026 - r.actual.value))} tỷ.`,
    bang: { cot: ['Mốc', 'Kế hoạch lũy kế (tỷ)', 'Đạt?'], phai: [1],
      dong: ([['Quý I', q.q1], ['Quý II', q.q2], ['Quý III', q.q3], ['Quý IV', q.q4]] as const).filter(([, v]) => v > 0)
        .map(([t, v]) => [t, formatTy(v), r.actual.value >= v ? '✓ đạt' : 'chưa']) },
    link: { ten: 'Mở Tổng quan', to: '/' },
    goiY: ['tiến độ kế hoạch tháng này', 'nhập kho theo xưởng tháng này'],
  };
}

async function tienDoThang(c: CauHoi): Promise<TraLoi> {
  const h = new Date();
  const thang = c.thang ?? (c.ky ? c.ky.den.getMonth() + 1 : h.getMonth() + 1);
  const d = await fetchYearPlanActual(h.getFullYear());
  if (!d) return { chu: 'Không lấy được kế hoạch tháng.' };
  const kh = d.plan.filter(r => r.thang === thang && (!c.xuong || r.xuong === c.xuong)).reduce((a, r) => a + r.value, 0);
  const th = d.actual.filter(r => r.thang === thang && (!c.xuong || r.xuong === c.xuong)).reduce((a, r) => a + r.value, 0);
  const theoXuong = d.workshops.map(x => {
    const k = d.plan.filter(r => r.thang === thang && r.xuong === x).reduce((a, r) => a + r.value, 0);
    const t = d.actual.filter(r => r.thang === thang && r.xuong === x).reduce((a, r) => a + r.value, 0);
    return [x, formatTy(k), formatTy(t), k > 0 ? `${Math.round((t / k) * 100)}%` : '—'] as Array<string | number>;
  });
  return {
    chu: `**Kế hoạch tháng ${thang}/${h.getFullYear()}**${c.xuong ? ` · xưởng ${c.xuong}` : ''}: thực hiện **${formatTy(th)} / ${formatTy(kh)} tỷ** · **${kh > 0 ? Math.round((th / kh) * 100) : 0}%**`,
    bang: c.xuong ? undefined : { cot: ['Xưởng', 'KH (tỷ)', 'TH (tỷ)', '% đạt'], phai: [1, 2, 3], dong: theoXuong },
    goiY: [`kế hoạch tuần ${tuanIso(h)}`, 'tiến độ kế hoạch năm'],
  };
}

async function keHoachTuan(c: CauHoi): Promise<TraLoi> {
  const h = new Date();
  const tuan = c.tuan ?? tuanIso(h);
  const r = await fetchKhsxNhapKhoSummary({ nam: String(h.getFullYear()), mode: 'week', tuan: String(tuan), xuong: c.xuong ? [c.xuong] : undefined });
  if (!r) return { chu: 'Không lấy được kế hoạch tuần.' };
  const t2 = thu2TuanIso(h.getFullYear(), tuan);
  const cn = new Date(t2.getFullYear(), t2.getMonth(), t2.getDate() + 6);
  const f = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (!r.totalKh) return { chu: `**Tuần ${tuan}** (${f(t2)} – ${f(cn)}): chưa có kế hoạch tuần. Đã nhập kho **${formatTy(r.totalTh)} tỷ**.` };
  return {
    chu: `**Kế hoạch tuần ${tuan}** (${f(t2)} – ${f(cn)})${c.xuong ? ` · xưởng ${c.xuong}` : ''}: KH **${formatTy(r.totalKh)} tỷ** · nhập kho **${formatTy(r.totalTh)} tỷ**`
      + ` (trong KH ${formatTy(r.totalThPlan)} tỷ) · hoàn thành **${Math.round(r.completionRate)}%**`,
    bang: c.xuong ? undefined : { cot: ['Xưởng', 'KH (tỷ)', 'TH (tỷ)', '% đạt'], phai: [1, 2, 3],
      dong: r.byXuong.filter(x => x.kh || x.th).map(x => [x.xuong, formatTy(x.kh), formatTy(x.th), x.kh ? `${Math.round((x.thPlan / x.kh) * 100)}%` : '—']) },
    goiY: [`kế hoạch tuần ${tuan - 1}`, 'tiến độ kế hoạch tháng này'],
  };
}

async function sanXuat(c: CauHoi): Promise<TraLoi> {
  const r = await fetchTongQuanSanXuat({ filters: { ...DEFAULT_FILTERS, xuong: c.xuong ? [c.xuong] : [] }, tuyChon: TUY_CHON_MAC_DINH });
  if (!r) return { chu: 'Không lấy được số liệu sản xuất.' };
  const pham = `(đơn đang sản xuất${c.xuong ? ` · xưởng ${c.xuong}` : ''})`;
  if (c.y === 'co_the_sx') {
    const m = r.cardMetrics;
    return {
      chu: `**Có thể sản xuất: ${ty(m.coTheSX)}** · **Chưa thể sản xuất: ${ty(m.chuaTheSX)}** ${pham}`,
      bang: { cot: ['Nhóm', 'Giá trị (tỷ)'], phai: [1], dong: [
        ['Đang trên chuyền', formatTrieuAsTy(m.chuyenKhac)], ['Có phiếu chưa SX', formatTrieuAsTy(m.coPhieuChuaSX)], ['Vecni + Fitting', formatTrieuAsTy(m.vecniFitting)],
        ['Vướng SL chưa REV', formatTrieuAsTy(m.vuongSL)], ['Chưa triển khai SX', formatTrieuAsTy(m.chuaTrienKhai)]] },
      link: { ten: 'Mở Tổng quan', to: '/' },
      goiY: ['điểm nghẽn', 'đơn hàng theo công đoạn'],
    };
  }
  if (c.y === 'diem_nghen') {
    const top = r.topBottlenecks.slice(0, 8);
    if (!top.length) return { chu: `Không có điểm nghẽn ${pham}.` };
    return {
      chu: `**Điểm nghẽn lớn nhất: ${top[0].name}** — ${so(top[0].count)} hạng mục đang dừng ${pham}`,
      bang: { cot: ['Công đoạn', 'Số hạng mục'], phai: [1], dong: top.map(t => [t.name, so(t.count)]) },
      link: { ten: 'Mở Tổng quan', to: '/' },
      goiY: ['đơn hàng theo công đoạn', 'chưa thể sản xuất'],
    };
  }
  const ds = r.pivotFunnelData?.data ?? [];
  const tong = ds.reduce((a, d) => a + d.value, 0);
  return {
    chu: `**Đơn hàng theo công đoạn** ${pham}: tổng **${ty(tong)}**`,
    bang: { cot: ['Công đoạn', 'Giá trị (tỷ)', '%'], phai: [1, 2], dong: ds.map(d => [d.name, formatTrieuAsTy(d.value), tong ? `${Math.round((d.value / tong) * 100)}%` : '—']) },
    link: { ten: 'Mở Tổng quan', to: '/' },
    goiY: ['điểm nghẽn', 'có thể sản xuất bao nhiêu'],
  };
}

async function vuongMac(c: CauHoi): Promise<TraLoi> {
  if (c.congTrinh) {
    const ct = await tenDayDu(c.congTrinh);
    const rows = (await fetchVuongMacByProject()).filter(r => (ct && (r.ten === ct || ct.includes(r.ma))) || r.ten.includes(c.congTrinh!));
    const mo = rows.reduce((a, r) => a + r.open, 0), qh = rows.reduce((a, r) => a + r.overdue, 0);
    return {
      chu: `**Vướng mắc · ${ct ?? c.congTrinh}**: đang mở **${so(mo)}**${qh ? ` (**${qh}** quá hạn)` : ''}`,
      link: { ten: 'Mở trang Vướng mắc', to: '/vuong-mac' },
    };
  }
  const k = c.ky ?? kyMacDinh('vuong_mac', new Date());
  const d = await fetchVuongMacDashboard({ from: iso(k.tu), to: iso(k.den), xuong: c.xuong ?? '' });
  const t = d.totals;
  const tra: TraLoi = {
    chu: `**Vướng mắc${c.xuong ? ` xưởng ${c.xuong}` : ''}**: đang mở **${so(t.open)}** (quá hạn BOT **${so(t.overdue)}**, sắp đến hạn ${so(t.soon)}) · chờ xác nhận ${so(t.waiting)}`
      + `\n${k.ten}: báo mới ${so(t.created)} · xử lý xong ${so(t.done)} · đóng ${so(t.closed)}`,
    link: { ten: 'Mở trang Vướng mắc', to: '/vuong-mac' },
    goiY: ['vướng mắc theo xưởng', 'vướng mắc theo công trình'],
  };
  if (c.nhom) {
    const rows = (c.nhom === 'xuong' ? d.byXuong : d.byProject).filter(r => r.open || r.created).slice(0, 12);
    tra.bang = { cot: [c.nhom === 'xuong' ? 'Xưởng' : 'Công trình', 'Chưa xong', 'Quá hạn', 'Mới / xong kỳ'], phai: [1, 2, 3],
      dong: rows.map(r => [r.name, r.open, r.overdue || '–', `${r.created} / ${r.done}`]) };
  } else if (d.oldest.length) {
    tra.bang = { cot: ['HEX', 'Công trình', 'Xưởng', 'Tuổi'], phai: [3],
      dong: d.oldest.slice(0, 6).map(o => [o.hex, o.project, o.xuong, `${Math.round(o.ageHours / 24)} ngày`]) };
  }
  return tra;
}

const soTien = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const ngayVN = (s?: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');

async function traHex(c: CauHoi): Promise<TraLoi> {
  const ma = c.hexList.slice(0, 20);
  const kq = await Promise.all(ma.map(h => searchHex(h, '', 5).then(ds => ds.find(x => x.hex === h) ?? ds[0] ?? null).catch(() => null)));
  const co = kq.filter((h): h is HexHit => !!h);
  const thieu = ma.filter((m, i) => !kq[i]);
  if (!co.length) return { chu: `Không tìm thấy HEX **${ma.join(', ')}**.` };
  if (co.length === 1) {
    const h = co[0];
    return {
      chu: `**HEX ${h.hex}** · ${h.hangMuc ?? ''}\n${h.congTrinh ?? ''}${thieu.length ? `\nKhông tìm thấy: ${thieu.join(', ')}` : ''}`,
      bang: { cot: ['Thông tin', 'Giá trị'], dong: [
        ['Xưởng', h.xuong ?? '—'], ['Công đoạn (BOP)', h.bop ?? '—'], ['Tình trạng', h.tinhTrang ?? '—'], ['Tình trạng IPO', h.tinhTrangIpo ?? '—'],
        ['PC / PM', [h.pc, h.pm].filter(Boolean).join(' / ') || '—'], ['Hạn nhập kho', ngayVN(h.deadline)],
        ['Trị giá', ty(soTien(h.triGia))], ['Đã nhập kho', ty(soTien(h.thanhTienKho))]] },
      link: { ten: 'Mở Tra cứu', to: '/tra-cuu-hex' },
      goiY: h.congTrinh ? [`công trình ${goiTen(h.congTrinh)}`] : undefined,
    };
  }
  const tg = co.reduce((a, h) => a + soTien(h.triGia), 0), nk = co.reduce((a, h) => a + soTien(h.thanhTienKho), 0);
  return {
    chu: `**${co.length} HEX** · trị giá **${ty(tg)}** · đã nhập kho **${ty(nk)}**${thieu.length ? `\nKhông tìm thấy: ${thieu.join(', ')}` : ''}`,
    bang: { cot: ['HEX', 'Hạng mục', 'Xưởng', 'BOP', 'Trị giá (tỷ)'], phai: [4],
      dong: co.map(h => [h.hex, h.hangMuc ?? '—', h.xuong ?? '—', h.bop ?? '—', formatTrieuAsTy(soTien(h.triGia))]) },
    link: { ten: 'Mở Tra cứu', to: '/tra-cuu-hex' },
  };
}

/** Tìm hạng mục theo chữ (mã HEX, mã nhà máy, tên công trình, tên hạng mục) — tối đa 501 dòng */
const tim = (q: string) => searchHex(q, '', 501).catch(() => [] as HexHit[]);
/** Gom kết quả tìm theo công trình, nhiều hạng mục trước */
const theoCongTrinh = (ds: HexHit[]) => {
  const m = new Map<string, HexHit[]>();
  ds.forEach(h => { const k = h.congTrinh?.trim() || '(chưa có công trình)'; m.set(k, [...(m.get(k) ?? []), h]); });
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
};

// Bản ghi đủ mọi hạng mục của trang Tổng quan công trình (máy chủ dựng sẵn) — tải 1 lần, dùng lại 10 phút
let banGhi: { luc: number; p: Promise<Rec[]> } | null = null;
const taiBanGhi = () => {
  if (!banGhi || Date.now() - banGhi.luc > 600000) {
    banGhi = { luc: Date.now(), p: fetchTongQuanCongTrinh().then(z => (z ? giaiNenBanGhi(z, new Date().setHours(0, 0, 0, 0)) : [])) };
  }
  return banGhi.p;
};
/** Mã ngắn để gợi ý hỏi tiếp ("công trình CT24-066" thay vì tên dài) */
const goiTen = (ten: string, ma?: string) => docMaCongTrinh(ma || ten) ?? ten;
const NHAN_BUCKET: Record<string, string> = {
  notDeployed: 'Chưa triển khai (P001)', p002: 'Bản vẽ kỹ thuật (P002)', onLine: 'Đang trên chuyền', shortfall: 'Nhập kho chưa đủ', cancelled: 'Đơn HỦY',
};

/** Các công trình khớp chữ tìm (mã CT.. hoặc một phần tên, không phân biệt dấu) — nhiều hạng mục trước */
async function timCongTrinh(q: string): Promise<Array<{ ten: string; ma: string; rows: Rec[] }>> {
  const recs = await taiBanGhi();
  const ma = docMaCongTrinh(q);
  const k = boDau(q);
  const m = new Map<string, { ten: string; ma: string; rows: Rec[] }>();
  recs.forEach(r => {
    const khop = ma ? (r.ma?.toUpperCase().includes(ma) || r.ct.toUpperCase().includes(ma)) : boDau(r.ct).includes(k);
    if (!khop) return;
    const o = m.get(r.ct) ?? { ten: r.ct, ma: r.ma, rows: [] };
    o.rows.push(r);
    m.set(r.ct, o);
  });
  return [...m.values()].sort((a, b) => b.rows.length - a.rows.length);
}

/** Tóm tắt 1 công trình — cùng cách tính với trang Tổng quan công trình (core/chiSoCongTrinh) */
async function tomTatCongTrinh(ct: { ten: string; ma: string; rows: Rec[] }): Promise<TraLoi> {
  const cs = tinhChiSo(ct.rows, new Date().setHours(0, 0, 0, 0));
  const vm = (await fetchVuongMacByProject()).filter(r => (ct.ma && r.ma === ct.ma) || r.ten === ct.ten);
  const vmMo = vm.reduce((a, r) => a + r.open, 0), vmQh = vm.reduce((a, r) => a + r.overdue, 0);
  const pm = [...new Set(ct.rows.map(r => r.pm).filter(x => x && x !== '(Chưa có)'))].slice(0, 2).join(', ');
  const pc = [...new Set(ct.rows.map(r => r.pc).filter(x => x && x !== '(Chưa có)'))].slice(0, 2).join(', ');
  const ten = goiTen(ct.ten, ct.ma);
  return {
    chu: `**${ct.ten}**\n**${so(cs.items)} hạng mục** · trị giá **${ty(cs.total)}** · đã nhập kho **${ty(cs.done)}** (${cs.total > 0 ? Math.round((cs.done / cs.total) * 100) : 0}%) · còn **${ty(cs.remain)}**`
      + `\nQuá hạn KH nhập kho: **${so(cs.bot.quaHan.n)}** hạng mục (${ty(cs.bot.quaHan.remain)}) · vướng mắc đang mở: **${so(vmMo)}**${vmQh ? ` (${vmQh} quá hạn)` : ''}`
      + `\nĐã xuất / giao ${ty(cs.exported)} · tồn kho ${ty(cs.stock)}` + (pm || pc ? `\nPM: ${pm || '—'} · PC: ${pc || '—'}` : ''),
    bang: { cot: ['Phần chưa nhập kho', 'Giá trị (tỷ)'], phai: [1],
      dong: Object.entries(cs.remainBy).filter(([, v]) => v > 0.0005).sort((a, b) => b[1] - a[1]).map(([k, v]) => [NHAN_BUCKET[k] ?? k, formatTrieuAsTy(v)]) },
    link: { ten: 'Mở Tổng quan công trình', to: '/cong-trinh/tong-quan' },
    goiY: [`nhập kho tháng này công trình ${ten}`, `vướng mắc công trình ${ten}`],
  };
}

async function congTrinh(c: CauHoi): Promise<TraLoi> {
  const ds = await timCongTrinh(c.congTrinh!);
  if (!ds.length) return { chu: `Không tìm thấy công trình **${c.congTrinh}** (trong các đơn đang theo dõi). Thử gõ mã (vd. CT26-110) hoặc một phần tên.` };
  if (ds.length > 1 && !docMaCongTrinh(c.congTrinh!)) {
    return {
      chu: `Có **${ds.length} công trình** khớp "**${c.congTrinh}**" — chọn 1 công trình:`,
      bang: { cot: ['Công trình', 'Hạng mục', 'Trị giá (tỷ)'], phai: [1, 2],
        dong: ds.slice(0, 12).map(d => [d.ten, so(d.rows.length), formatTrieuAsTy(d.rows.reduce((a, r) => a + r.total, 0))]) },
      goiY: ds.slice(0, 5).map(d => `công trình ${goiTen(d.ten, d.ma)}`),
    };
  }
  return tomTatCongTrinh(ds[0]);
}

async function timKiem(c: CauHoi): Promise<TraLoi> {
  const q = c.tuKhoa ?? '';
  const ds = await tim(q);
  if (!ds.length) return { ...TRO_GIUP, rong: true, chu: `Không tìm thấy gì khớp "**${q}**" (mã HEX, mã nhà máy, công trình, hạng mục). ${TRO_GIUP.chu}` };
  const nhom = theoCongTrinh(ds);
  if (nhom.length === 1) {
    const ct = (await timCongTrinh(docMaCongTrinh(nhom[0][0]) ?? nhom[0][0]))[0];
    if (ct) return tomTatCongTrinh(ct);
  }
  if (ds.length <= 8) {
    return {
      chu: `Tìm "**${q}**": **${ds.length} hạng mục**`,
      bang: { cot: ['HEX', 'Hạng mục', 'Công trình', 'Xưởng'], dong: ds.map(h => [h.hex, h.hangMuc ?? '—', h.congTrinh ?? '—', h.xuong ?? '—']) },
      goiY: ds.slice(0, 3).map(h => h.hex),
    };
  }
  return {
    chu: `Tìm "**${q}**": **${ds.length >= 501 ? 'hơn 500' : so(ds.length)} hạng mục** ở **${nhom.length} công trình**`,
    bang: { cot: ['Công trình', 'Hạng mục khớp'], phai: [1], dong: nhom.slice(0, 12).map(([k, v]) => [k, so(v.length)]) },
    goiY: nhom.slice(0, 4).map(([k]) => `công trình ${goiTen(k)}`),
  };
}

/** Tên công trình đầy đủ (đúng như trong dữ liệu) từ mã / một phần tên — để lọc các API theo công trình */
async function tenDayDu(q: string): Promise<string | null> {
  const ct = (await timCongTrinh(q))[0];
  if (ct) return ct.ten;
  const nhom = theoCongTrinh(await tim(q));
  return nhom[0]?.[0] ?? null;
}

async function mra(c: CauHoi): Promise<TraLoi> {
  if (!c.xuong) return { chu: 'Bạn hỏi xưởng nào? Ví dụ: **giờ công xưởng 2A tuần này**.', goiY: ['giờ công xưởng 2A tuần này', 'giờ công xưởng 4A 7 ngày'] };
  const k = c.ky ?? kyMacDinh('mra', new Date());
  const r = await xuongSetupApi.baoCao(c.xuong, iso(k.tu), iso(k.den));
  if (!r.ok) return { chu: `Không lấy được báo cáo xưởng ${c.xuong}: ${r.message}` };
  const to = r.data.theoTo.filter(t => t.gioNguoi.thuong + t.gioNguoi.tangCa > 0);
  const sum = (f: (t: (typeof to)[number]) => number) => to.reduce((a, t) => a + f(t), 0);
  const gioNguoi = sum(t => t.gioNguoi.thuong + t.gioNguoi.tangCa), gioCong = sum(t => t.gioCong.thuong + t.gioCong.tangCa), gioCho = sum(t => t.gioCho.thuong + t.gioCho.tangCa);
  const tl = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  return {
    chu: `**Xưởng ${c.xuong}** ${k.ten}: giờ công **${so(gioNguoi)}** · giờ công sản phẩm **${so(gioCong)}** · chờ việc ${so(gioCho)} · **tỷ lệ có việc ${tl(gioCong, gioNguoi)}**`,
    bang: to.length ? { cot: ['Tổ', 'Giờ công', 'Giờ SP', 'Chờ việc', 'Có việc'], phai: [1, 2, 3, 4],
      dong: to.sort((a, b) => (b.gioNguoi.thuong + b.gioNguoi.tangCa) - (a.gioNguoi.thuong + a.gioNguoi.tangCa))
        .map(t => [t.ten, so(t.gioNguoi.thuong + t.gioNguoi.tangCa), so(t.gioCong.thuong + t.gioCong.tangCa), so(t.gioCho.thuong + t.gioCho.tangCa),
          tl(t.gioCong.thuong + t.gioCong.tangCa, t.gioNguoi.thuong + t.gioNguoi.tangCa)]) } : undefined,
    link: { ten: 'Mở MRA', to: '/mra' },
  };
}

export const TRO_GIUP: TraLoi = {
  chu: 'Gõ mã HEX, mã / tên công trình, tên hạng mục để tra; hoặc hỏi bằng câu ngắn: **bảng** (nhập kho, đơn hàng, vật tư, tồn kho, điểm danh…) + **tính gì** (tổng, số, trung bình, lớn nhất…) + **theo** cột nào + **lọc** (xưởng 4A, công trình…, PM là…, giá trị trên 1 tỷ) + **kỳ** (hôm qua, tuần này, tháng 9, quý 3, năm 2025, tất cả). Không chắc cách gõ thì bấm **Tự tra** để chọn bảng / cột. Hỏi xong, tick **Vào báo cáo** rồi gõ "xuất báo cáo" để tải Excel / PDF. Ví dụ:',
  // Gợi ý mở đầu: mỗi kiểu hỏi 1 câu (mẫu, chia theo, lọc theo giá trị, khái niệm, so sánh, tra mã)
  goiY: [
    'nhập kho tuần này', 'đơn hàng theo PM tháng trước', 'hạng mục quá hạn giao theo xưởng', 'công trình nào còn nhiều giá trị chưa nhập kho nhất',
    'nhập kho tháng này so với tháng trước', 'vật tư chưa mua theo công trình', 'tồn kho trên 6 tháng', 'vướng mắc quá hạn', '260816258', 'công trình CT26-110',
  ],
};

export async function traLoi(c: CauHoi): Promise<TraLoi> {
  switch (c.y) {
    case 'don_hang': case 'trien_khai': case 'tinh_phieu': case 'nhap_kho': case 'xuat_kho': return dongChay(c);
    case 'ton_kho': return tonKho();
    case 'tien_do_nam': return tienDoNam();
    case 'tien_do_thang': return tienDoThang(c);
    case 'ke_hoach_tuan': return keHoachTuan(c);
    case 'cong_doan': case 'co_the_sx': case 'diem_nghen': return sanXuat(c);
    case 'vuong_mac': return vuongMac(c);
    case 'tra_hex': return traHex(c);
    case 'cong_trinh': return congTrinh(c);
    case 'tim_kiem': return timKiem(c);
    case 'mra': return mra(c);
    default: return TRO_GIUP;
  }
}

/** Quyền cần có cho từng loại câu hỏi (theo quyền xem trang tương ứng) */
export const QUYEN: Record<Y, (co: (id: string) => boolean, admin: boolean) => boolean> = {
  don_hang: co => co('dashboard') || co('chart_order'),
  trien_khai: co => co('dashboard') || co('chart_tkbv'),
  tinh_phieu: co => co('dashboard') || co('chart_pthsp'),
  nhap_kho: co => co('dashboard') || co('chart_inventory'),
  xuat_kho: co => co('dashboard') || co('chart_export'),
  ton_kho: co => co('dashboard') || co('chart_stock'),
  tien_do_nam: co => co('dashboard'),
  tien_do_thang: co => co('dashboard'),
  ke_hoach_tuan: co => co('dashboard'),
  cong_doan: co => co('dashboard'),
  co_the_sx: co => co('dashboard'),
  diem_nghen: co => co('dashboard'),
  vuong_mac: co => co('vuong_mac'),
  tra_hex: co => co('hex_lookup'),
  cong_trinh: co => co('hex_lookup') || co('construction_overview'),
  tim_kiem: co => co('hex_lookup'),
  mra: (co, admin) => admin || co('xuong_quan_ly'),
  tro_giup: () => true,
};
