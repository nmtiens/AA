import { formatTrieuAsTy } from '../../utils/money';
import type { TraLoi } from './traLoi';
import { moTaTruyVan } from './hieuTruyVan';
import { chayTruyVan, type BangDM, type CotKQ, type KetQua, type TruyVan } from './truyVanApi';

// ============================================================================
// Chạy truy vấn tự tra rồi dựng câu trả lời (chữ + bảng + dòng tổng) cho cửa sổ Hỏi số liệu.
// ============================================================================

/** Trang dữ liệu tương ứng (nút "Mở trang") */
const TRANG: Record<string, string> = {
  nhap_kho: '/inventory', xuat_kho: '/export', ton_kho: '/stock', dht: '/orders', tkbv_full: '/tkbv', pthsp_full: '/pthsp',
  production_status_app: '/list', vat_tu: '/materials', khsx: '/khsx', khsx_nam: '/yearly-plan', phan_tich_kh_th: '/analysis',
  diem_danh: '/attendance', vuong_mac: '/vuong-mac',
};

const vn = (s: string) => s.split('-').reverse().join('/');
/** Ô kết quả -> chữ hiện */
export function hienO(v: string | number | null, c: CotKQ): string {
  if (v === null || v === undefined || v === '') return c.nhom ? '(trống)' : '—';
  if (c.kieu === 'so' && typeof v === 'number') {
    if (c.tien) return formatTrieuAsTy(v);
    return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
  const s = String(v);
  let m = s.match(/^(\d{4})-T(\d{2})$/);
  if (m) return `Tuần ${+m[2]}/${m[1]}`;
  m = s.match(/^(\d{4})-Q(\d)$/);
  if (m) return `Quý ${m[2]}/${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[2]}/${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return vn(s);
  return s;
}

const phanTram = (a: number | null, z: number | null) => {
  if (a === null || z === null) return '—';
  if (!z) return a ? 'mới' : '0%';
  const p = Math.round(((a - z) / Math.abs(z)) * 100);
  return `${p > 0 ? '▲ +' : p < 0 ? '▼ ' : ''}${p}%`;
};
const vnKy = (tu?: string, den?: string) => (tu && den ? (tu === den ? vn(tu) : `${vn(tu)} – ${vn(den)}`) : 'mọi thời gian');
/** Kỳ gọn cho tiêu đề cột: "01/10–19/10" (cùng năm thì bỏ năm) */
const kyGon = (tu?: string, den?: string) => {
  if (!tu || !den) return 'mọi lúc';
  const ng = (x: string) => x.slice(8, 10) + '/' + x.slice(5, 7);
  const cungNam = tu.slice(0, 4) === den.slice(0, 4);
  return tu === den ? vn(tu) : `${ng(tu)}–${ng(den)}${cungNam ? `/${den.slice(0, 4)}` : ''}`;
};

/** So sánh 2 kỳ: chạy cùng truy vấn với kỳ B rồi ghép theo nhóm; mỗi phép tính có 3 cột (kỳ A, kỳ B, chênh) */
async function soSanh(tv: TruyVan, dm: BangDM[], ghiDau: string[], link: TraLoi['link']): Promise<TraLoi> {
  const ss = tv.soSanh!;
  const [a, z] = await Promise.all([chayTruyVan({ ...tv, gioiHan: 500 }), chayTruyVan({ ...tv, tu: ss.tu, den: ss.den, gioiHan: 500 })]);
  const nN = a.cot.filter(c => c.nhom).length;
  const tenA = vnKy(tv.tu, tv.den), tenB = vnKy(ss.tu, ss.den);
  const doCot = a.cot.slice(nN);
  if (!nN) {
    const dong = doCot.map((c, i) => {
      const va = a.dong[0]?.[i] ?? null, vb = z.dong[0]?.[i] ?? null;
      return `${c.ten}${c.tien ? ' (tỷ)' : ''}: **${hienO(va, c)}** (${tenA}) so với **${hienO(vb, c)}** (${tenB}) · ${phanTram(typeof va === 'number' ? va : null, typeof vb === 'number' ? vb : null)}`;
    });
    return { chu: [...dong, ...ghiDau.map(g => `_${g}_`)].join('\n'), link, tv };
  }
  const khoa = (r: Array<string | number | null>) => JSON.stringify(r.slice(0, nN));
  const mapB = new Map(z.dong.map(r => [khoa(r), r]));
  const keys = [...new Set([...a.dong.map(khoa), ...z.dong.map(khoa)])];
  const mapA = new Map(a.dong.map(r => [khoa(r), r]));
  // Bảng gọn vừa khung: so phép tính đầu (tên phép tính ghi ở câu dẫn, tiêu đề cột chỉ ghi kỳ)
  const doDung = doCot.slice(0, 1);
  const kA = kyGon(tv.tu, tv.den), kB = kyGon(ss.tu, ss.den);
  const cot = [...a.cot.slice(0, nN).map(c => c.ten), ...doDung.flatMap(c => [`${kA}${c.tien ? ' (tỷ)' : ''}`, kB, 'Chênh'])];
  const so = (r: Array<string | number | null> | undefined, i: number) => { const v = r?.[nN + i]; return typeof v === 'number' ? v : null; };
  const dong = keys.map(k => {
    const ra = mapA.get(k), rb = mapB.get(k);
    const g = (JSON.parse(k) as Array<string | number | null>).map((v, i) => hienO(v, a.cot[i]));
    const va = so(ra, 0) ?? 0, vb = so(rb, 0) ?? 0;
    // Hỏi "giảm / tăng nhiều nhất": xếp theo mức chênh (kỳ này − kỳ so) — theo số, hoặc theo % nếu người hỏi chọn
    const chenh = tv.sapChenhTheo === 'pt' ? (vb ? (va - vb) / Math.abs(vb) : va ? Infinity : 0) : va - vb;
    return { g, ra, rb, sx: tv.sapChenh === 'giam' ? -chenh : tv.sapChenh === 'tang' ? chenh : va };
  }).sort((x, y) => y.sx - x.sx).slice(0, Math.max(tv.gioiHan ?? 50, tv.sapChenh ? 10 : 0))
    .map(({ g, ra, rb }) => [...g, ...doDung.flatMap((c, i) => [hienO(so(ra, i), c), hienO(so(rb, i), c), phanTram(so(ra, i), so(rb, i))])]);
  const cuoi = a.tong && z.tong ? [...Array.from({ length: nN }, (_, i) => (i === 0 ? 'Tổng' : '')), ...doDung.flatMap((c, i) => {
    const va = a.tong![nN + i], vb = z.tong![nN + i];
    return [hienO(va, c), hienO(vb, c), phanTram(va, vb)];
  })] : undefined;
  const phai = cot.map((_, i) => (i >= nN ? i : -1)).filter(i => i >= 0);
  // Câu có thể hiểu nhiều cách => cho người hỏi chọn lại: xếp theo số hay %; kỳ đang chạy so với trọn kỳ trước (chưa đủ ngày)
  const chon: NonNullable<TraLoi['chon']> = [];
  if (tv.sapChenh) {
    const theoPt = tv.sapChenhTheo === 'pt';
    chon.push({ nhan: theoPt ? `Xếp theo mức ${tv.sapChenh === 'giam' ? 'giảm' : 'tăng'} bằng số (không theo %)` : `Xếp theo % ${tv.sapChenh === 'giam' ? 'giảm' : 'tăng'} (không theo số)`, tv: { ...tv, sapChenhTheo: theoPt ? undefined : 'pt' } });
  }
  const cungNgay = soCungSoNgay(tv);
  if (cungNgay) chon.push({ nhan: `So cùng số ngày: ${vnKy(tv.tu, tv.den)} với ${vnKy(cungNgay.tu, cungNgay.den)}`, tv: { ...tv, soSanh: cungNgay } });
  return {
    chu: [`So sánh **${doDung[0].ten.toLowerCase()}${doDung[0].tien ? ' (tỷ)' : ''}**: ${tenA} với ${tenB} · **${keys.length} nhóm**.`, ...ghiDau.map(g => `_${g}_`)].join('\n'),
    bang: { cot, dong, phai, cuoi }, link, tv, ...(chon.length ? { chon } : {}),
  };
}

/** Kỳ chính là tháng đang chạy (1/10–20/10) mà đem so trọn tháng trước => kỳ so cắt cùng số ngày (1/9–20/9) */
function soCungSoNgay(tv: TruyVan): { tu: string; den: string } | null {
  const ss = tv.soSanh;
  if (!ss || !tv.tu || !tv.den || tv.tu.slice(8) !== '01' || ss.tu.slice(8) !== '01') return null;
  const [y, m, d] = tv.den.split('-').map(Number);
  const cuoiThang = new Date(y, m, 0).getDate();
  const [y2, m2] = ss.tu.split('-').map(Number);
  const cuoiThang2 = new Date(y2, m2, 0).getDate();
  // Kỳ chính chưa hết tháng, kỳ so là trọn 1 tháng
  if (tv.tu.slice(0, 7) !== tv.den.slice(0, 7) || d >= cuoiThang || ss.den !== `${ss.tu.slice(0, 8)}${String(cuoiThang2).padStart(2, '0')}`) return null;
  return { tu: ss.tu, den: `${ss.tu.slice(0, 8)}${String(Math.min(d, cuoiThang2)).padStart(2, '0')}` };
}

/** Bình quân mỗi ngày / tuần / tháng: chia theo mốc rồi lấy trung bình các mốc có số liệu */
function binhQuan(tv: TruyVan, kq: KetQua): string[] {
  const nN = kq.cot.filter(c => c.nhom).length;
  const n = kq.soDong;
  if (!n) return [];
  const moc = ({ ngay: 'ngày', tuan: 'tuần', thang: 'tháng', quy: 'quý', nam: 'năm' } as Record<string, string>)[tv.binhQuan!];
  return [
    ...kq.cot.slice(nN).map((c, i) => {
      const t = kq.tong?.[nN + i];
      return `Bình quân mỗi ${moc} — ${c.ten}${c.tien ? ' (tỷ)' : ''}: **${typeof t === 'number' ? hienO(t / n, c) : '—'}**`;
    }),
    `_Tính trên ${n} ${moc} có số liệu._`,
  ];
}

export async function traLoiTruyVan(tv: TruyVan, dm: BangDM[], boQua: string[] = [], aiHieu?: string, ghiThem: string[] = []): Promise<TraLoi> {
  const b = dm.find(x => x.id === tv.bang);
  // Câu do AI dịch: ghi rõ để người hỏi kiểm tra (bấm "Sửa điều kiện" nếu hiểu sai)
  const dauAI = [...ghiThem, ...(aiHieu !== undefined ? [`AI hiểu câu hỏi: ${aiHieu || '(không ghi)'} — kiểm tra điều kiện bên dưới`] : [])];
  if (tv.soSanh && tv.kieu === 'tong') {
    const link0 = TRANG[tv.bang] ? { ten: `Mở trang ${b?.ten ?? 'dữ liệu'}`, to: TRANG[tv.bang] } : undefined;
    return soSanh(tv, dm, [...dauAI, `Hiểu là: ${moTaTruyVan(tv, dm)}`, ...(boQua.length ? [`Bỏ qua: ${boQua.join('; ')}.`] : [])], link0);
  }
  const kq = await chayTruyVan(tv.binhQuan ? { ...tv, gioiHan: 500 } : tv);
  const ghi: string[] = [...dauAI, `Hiểu là: ${moTaTruyVan(tv, dm)}${kq.boHuy ? ' · không tính hạng mục HỦY' : ''}`];
  if (kq.ngayChot) ghi.push(`Tồn kho chốt ngày **${vn(kq.ngayChot)}** (tồn kho là số chụp từng ngày, không cộng dồn).`);
  // Kỳ hỏi vượt quá ngày có số liệu mới nhất (vd "tuần này" khi mới nhập đến thứ Tư) => nói rõ kẻo tưởng số 0 là thật
  if (kq.maxNgay && tv.den && tv.den > kq.maxNgay) {
    ghi.push(tv.tu && tv.tu > kq.maxNgay
      ? `Chưa có số liệu cho kỳ này — ${b?.ten ?? 'bảng'} mới nhất đến **${vn(kq.maxNgay)}**.`
      : `${b?.ten ?? 'Bảng'} có số liệu đến **${vn(kq.maxNgay)}** (kỳ hỏi tới ${vn(tv.den)}).`);
  }
  // Bảng kế hoạch có 2 loại dòng (KH THÁNG / KH TUẦN); máy chủ chọn 1 loại theo kỳ hỏi để không cộng đôi => nói rõ loại nào
  if (kq.loaiKh) ghi.push(`Lấy **kế hoạch ${kq.loaiKh.toLowerCase()}** (${kq.loaiKh === 'THÁNG' ? 'kỳ tháng / quý / năm' : 'kỳ ngắn hơn 4 tuần'}); muốn xem cả hai thì nói "theo loại kế hoạch".`);
  if (boQua.length) ghi.push(`Bỏ qua: ${boQua.join('; ')}.`);
  const link = TRANG[tv.bang] ? { ten: `Mở trang ${b?.ten ?? 'dữ liệu'}`, to: TRANG[tv.bang] } : undefined;

  // Không chia nhóm: trả lời bằng chữ
  if (tv.kieu === 'tong' && !tv.nhom.length) {
    const dong = kq.dong[0] ?? [];
    const dongSo = kq.cot.map((c, i) => `${c.ten}${c.tien ? ' (tỷ)' : ''}: **${hienO(dong[i] ?? null, c)}**`);
    return { chu: [...dongSo, ...ghi.map(g => `_${g}_`)].join('\n'), link, tv };
  }

  if (!kq.dong.length) return { chu: ['Không có dòng nào thoả điều kiện.', ...ghi.map(g => `_${g}_`)].join('\n'), link, tv };

  const phai = kq.cot.map((c, i) => (c.kieu === 'so' ? i : -1)).filter(i => i >= 0);
  const cot = kq.cot.map(c => `${c.ten}${c.tien ? ' (tỷ)' : ''}`);
  const dong = kq.dong.map(r => r.map((v, i) => hienO(v, kq.cot[i])));
  const cuoi = kq.tong ? kq.tong.map((v, i) => (i === 0 ? 'Tổng' : kq.cot[i].nhom ? '' : hienO(v, kq.cot[i]))) : undefined;
  const ten = tv.kieu === 'dong' ? 'dòng' : 'nhóm';
  const dauBq = tv.binhQuan ? binhQuan(tv, kq) : [];
  const dau = kq.soDong > kq.dong.length
    ? `Có **${kq.soDong.toLocaleString('en-US')} ${ten}** — hiện ${kq.dong.length} ${tv.kieu === 'dong' ? (tv.sap ? 'dòng đầu' : 'dòng mới nhất') : 'nhóm đầu'}.`
    : `**${kq.soDong.toLocaleString('en-US')} ${ten}**.`;
  return {
    chu: [...dauBq, dau, ...ghi.map(g => `_${g}_`)].join('\n'),
    bang: { cot, dong, phai, cuoi },
    link,
    tv,
  };
}
