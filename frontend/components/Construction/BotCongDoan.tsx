import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, History, Plus, RefreshCw, Search, Settings, X } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { useBotHangMuc } from '../../services/botHangMuc';
import { API_BASE_URL } from '../../services/dataService';
import { fmtInt, fmtTy, fmtDate } from '../../utils/format';
import { stageRank } from '../../utils/productionMetrics';
import * as bang from '../shared/bangBaoCao';
import { Chip, NutMoTatCa, type HexInfo } from './ProjectHealthTabs';
import { BOP_GROUP } from './core/bopPivot';
import { mauLuong, soSanhThuTu } from './core/thuTuNhom';
import { useThuTuLuongDo } from './useThuTuLuongDo';
import {
  CONG_DOAN_BOT, TEN_CONG_DOAN_BOT, TEN_DOT, chuanTen, docDan, duocNhap, fmtNgayBot, khoaNgay, ngayNhom, type DotBot, type OGhi, type QuyenBot,
} from './core/botCongDoan';

// ============================================================================
// BOT THEO CÔNG ĐOẠN — các bộ phận nhập ngày BOT (hạn phải xong) cho từng HEX × công đoạn.
// Dòng: công trình (theo Luồng đỏ) → nhóm sản phẩm (bảng không bung tới HEX — bấm số để xem / nhập từng HEX trong cửa sổ); nhập ở dòng công trình / nhóm = áp cho mọi HEX bên dưới mà mình
// được nhập. Ô được nhập: ADMIN mọi ô; bộ phận khác theo setup (công đoạn + xưởng). Ngày đã qua mà HEX chưa qua công đoạn
// đó => đỏ. Dán từ Excel: cột HEX + các cột công đoạn (hoặc 2 cột HEX + ngày). Máy chủ kiểm quyền lại từng ô.
// ============================================================================

export type NgayMap = Record<string, Record<string, string>>;
interface Setup { congDoan: Record<string, string[]>; xuongCua: Record<string, string[]> }
interface DuLieu { coBang: boolean; ngay: NgayMap; quyen: QuyenBot | null; setup: Setup; boPhanDs: string[] }

// Không nhớ giữa các lần mở (quyền theo tài khoản đang đăng nhập — đổi tài khoản không dùng nhầm quyền cũ)
const taiBot = async (): Promise<DuLieu> => {
  const r = await fetch(`${API_BASE_URL}/bot-cong-doan`);
  if (!r.ok) throw new Error(`Lỗi ${r.status}`);
  return r.json();
};
// Bố cục như bảng BOP: Chưa triển khai P001 · Chưa tính phiếu P002 · Đang trên chuyền P012→P021 (gộp 1 cột, bấm + tách) ·
// Kho: Đã nhập P022 · Đã xuất P025
const CHUYEN = ['P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021'] as const;
type Cot = { k: string; cd: string } | { k: 'chuyen'; cds: readonly string[] };
const DOT_GUI = 5000;   // số ô / lần gửi (giới hạn kích thước gói của máy chủ)
// Giới hạn ô ngày: có max thì trình duyệt chỉ cho gõ 4 chữ số năm (không thì gõ được năm 6 chữ số, VD 01/01/200202)
const NGAY_MIN = '2020-01-01', NGAY_MAX = '2100-12-31';
const ngayHopLe = (v: string) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= NGAY_MIN && v <= NGAY_MAX);

const NOI = '\u0000';
const NO_NSP = '(Chưa có nhóm)';
// Dòng theo công trình / sản phẩm / xưởng như BOP: tầng 1 theo chiều chọn, tầng 2 theo chiều kế (không bung tới HEX; bấm số mở cửa sổ HEX)
type ChieuBcd = 'ct' | 'nsp' | 'xuong';
const TEN_CHIEU_BCD: Record<ChieuBcd, string> = { ct: 'Công trình', nsp: 'Sản phẩm', xuong: 'Xưởng' };
const TANG2: Record<ChieuBcd, ChieuBcd> = { ct: 'nsp', nsp: 'ct', xuong: 'ct' };
const KHONG_CO_BCD: Record<ChieuBcd, string> = { ct: '(Chưa có công trình)', nsp: NO_NSP, xuong: '(Chưa có xưởng)' };
const giaTriBcd = (h: HexInfo, c: ChieuBcd) => (c === 'ct' ? h.congTrinh : c === 'nsp' ? h.nhomSp : h.area) || KHONG_CO_BCD[c];
// Ô số vừa bấm: tgt = tổng giá trị đơn hàng, tong = tổng còn lại, gt = giá trị của (các) công đoạn cds
interface XemSo { ten: string; loai: 'tgt' | 'tong' | 'gt'; cds: readonly string[] | null; hs: HexInfo[] }
const TEN_LOAI: Record<XemSo['loai'], string> = { tgt: 'Tổng giá trị đơn hàng', tong: 'Tổng còn lại', gt: '' };
// Giá trị của 1 HEX trong ô (cùng công thức soCua của bảng)
const giaTriO = (h: HexInfo, x: Pick<XemSo, 'loai' | 'cds'>) => {
  if (x.loai === 'tgt') return h.total;
  if (x.loai === 'tong') return h.remain;
  const cds = x.cds ?? [];
  if (cds.includes('P022')) return h.inv;
  if (cds.includes('P025')) return h.xuat ?? 0;
  return h.stage && cds.includes(h.stage) ? h.remain : 0;
};
// Ô gộp nhiều HEX khác ngày: khoảng "01/10 → 20/11" (thêm năm khi 2 đầu khác năm)
const khoangNgay = (tu: string | null | undefined, den: string | null | undefined) => {
  if (!tu || !den) return fmtNgayBot(tu || den);
  const ngan = (x: string) => `${x.slice(8)}/${x.slice(5, 7)}${tu.slice(0, 4) !== den.slice(0, 4) ? `/${x.slice(2, 4)}` : ''}`;
  return `${ngan(tu)} → ${ngan(den)}`;
};
const homNayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** HEX chưa qua công đoạn cd (đang ở công đoạn đó hoặc trước); công đoạn lạ / trống (HỦY, TẠM NGƯNG…) coi như chưa qua */
const chuaQua = (h: HexInfo, cd: string) => { const r = stageRank(h.stage); return r === 999 || r <= stageRank(cd); };

/** chiCuaToi: trang "Nhập BOT" — chỉ các công đoạn người này được nhập (mỗi công đoạn Đợt đầu · Đợt cuối · Giá trị),
 *  thêm BOT dự án + Tổng còn lại; không có cột Tổng giá trị / gộp chuyền. */
export const BotCongDoan = ({ items, onHexClick, chiCuaToi = false }: { items: HexInfo[]; onHexClick?: (hex: string) => void; chiCuaToi?: boolean }) => {
  const [du, setDu] = useState<DuLieu | null>(null);
  const [ngay, setNgay] = useState<NgayMap>({});
  // Lần lưu đang / vừa chạy: kết quả tải lại bắt đầu TRƯỚC lần lưu thì bỏ (không đè ngày vừa lưu bằng số cũ)
  const soLanLuu = useRef(0);
  const huySua = useRef(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [tim, setTim] = useState('');
  const [chieu, setChieu] = useState<ChieuBcd>('ct');
  const [chiChuaXong, setChiChuaXong] = useState(false);   // mặc định đủ HEX như bảng BOP (số khớp BOP)
  const [moDong, setMoDong] = useState<Set<string>>(() => new Set());
  const [dangSua, setDangSua] = useState<{ khoa: string; cd: string; dot: DotBot } | null>(null);
  const [thongBao, setThongBao] = useState<{ loai: 'ok' | 'loi'; noiDung: string } | null>(null);
  const [moDan, setMoDan] = useState(false);
  const [moForm, setMoForm] = useState(false);
  const [moSetup, setMoSetup] = useState(false);
  const [lichSu, setLichSu] = useState<string | null>(null);
  const [xem, setXem] = useState<XemSo | null>(null);
  const [moChuyen, setMoChuyen] = useState(false);
  const cot: Cot[] = [
    { k: 'P001', cd: 'P001' }, { k: 'P002', cd: 'P002' },
    ...(moChuyen ? CHUYEN.map(cd => ({ k: cd, cd })) : [{ k: 'chuyen' as const, cds: CHUYEN }]),
    { k: 'P022', cd: 'P022' }, { k: 'P025', cd: 'P025' },
  ];

  const tai = useCallback(() => {
    setDangTai(true); setLoi(null);
    const luc = soLanLuu.current;
    taiBot().then(d => { setDu(d); if (soLanLuu.current === luc) setNgay(d.ngay); }).catch(e => setLoi(e instanceof Error ? e.message : String(e))).finally(() => setDangTai(false));
  }, []);
  useEffect(() => { tai(); }, [tai]);

  const q = du?.quyen ?? null;
  const today = homNayIso();
  const thuTuNhom = useThuTuLuongDo();

  // Cây chiều chọn → chiều kế → HEX (ct / nhom: tên tầng 1 / tầng 2 — giữ tên trường cũ)
  const c2 = TANG2[chieu];
  const cay = useMemo(() => {
    const t = tim.trim().toUpperCase();
    const ds = items.filter(h => (!chiChuaXong || h.open)
      && (!t || h.hex.includes(t) || (h.congTrinh ?? '').toUpperCase().includes(t) || h.hangMuc.toUpperCase().includes(t)));
    const m = new Map<string, Map<string, HexInfo[]>>();
    for (const h of ds) {
      const ct = giaTriBcd(h, chieu), nsp = giaTriBcd(h, c2);
      let mm = m.get(ct);
      if (!mm) { mm = new Map(); m.set(ct, mm); }
      const a = mm.get(nsp);
      if (a) a.push(h); else mm.set(nsp, [h]);
    }
    return [...m.entries()].map(([ct, mm]) => ({
      ct, nhom: [...mm.entries()].map(([nsp, hs]) => ({ nsp, hs: [...hs].sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.hex.localeCompare(b.hex)) }))
        .sort((a, b) => sapTen(c2, a.nsp, b.nsp, a.hs.length, b.hs.length)),
      tong: [...mm.values()].reduce((s, hs) => s + hs.length, 0),
    })).sort((a, b) => sapTen(chieu, a.ct, b.ct, a.tong, b.tong));
  }, [items, tim, chiChuaXong, thuTuNhom, chieu, c2]); // eslint-disable-line react-hooks/exhaustive-deps
  // Xếp: công trình — Luồng đỏ theo STT rồi nhiều HEX trước; sản phẩm / xưởng — theo tên, trống để cuối
  function sapTen(c: ChieuBcd, a: string, b: string, na: number, nb: number) {
    if (c === 'ct') return soSanhThuTu(thuTuNhom(a), thuTuNhom(b)) || nb - na || a.localeCompare(b, 'vi');
    return Number(a === KHONG_CO_BCD[c]) - Number(b === KHONG_CO_BCD[c]) || a.localeCompare(b, 'vi', { numeric: true });
  }
  const xuongCua = useMemo(() => new Map(items.map(h => [h.hex, h.area])), [items]);
  const soHex = cay.reduce((s, c) => s + c.tong, 0);

  const luu = async (dsGui: OGhi[]) => {
    if (!dsGui.length) return;
    soLanLuu.current += 1;
    // Gửi theo đợt (dán hàng chục nghìn ô); đợt lỗi thì dừng, các đợt trước đã lưu
    const d: { bo: { hex: string; congDoan: string; dot?: DotBot; lyDo: string }[] } = { bo: [] };
    let ds: OGhi[] = [];
    try {
      for (let i = 0; i < dsGui.length; i += DOT_GUI) {
        const lo = dsGui.slice(i, i + DOT_GUI);
        const r = await fetch(`${API_BASE_URL}/bot-cong-doan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ds: lo }) });
        const kq = await r.json().catch(() => null);
        if (!r.ok) throw new Error(kq?.error || `Lỗi ${r.status}`);
        d.bo.push(...kq.bo);
        ds = ds.concat(lo);
      }
    } catch (e) {
      setThongBao({ loai: 'loi', noiDung: `Không lưu được${ds.length ? ` (đã lưu ${fmtInt(ds.length)} ô trước đó)` : ''}: ${e instanceof Error ? e.message : String(e)}` });
      if (!ds.length) return;
    }
    // Ô bị từ chối (máy chủ trả hex + công đoạn): không cập nhật ở máy cả 2 đợt của ô đó
    const bo = new Set(d.bo.map(x => `${x.hex}|${x.congDoan}`));
    setNgay(cu => {
      const n = { ...cu };
      for (const x of ds) {
        if (bo.has(`${x.hex}|${x.congDoan}`)) continue;
        const o = { ...(n[x.hex] ?? {}) }, k = khoaNgay(x.congDoan, x.dot);
        if (x.ngay) o[k] = x.ngay; else delete o[k];
        n[x.hex] = o;
      }
      return n;
    });
    if (ds.length === dsGui.length) {
      setThongBao(d.bo.length
        ? { loai: 'loi', noiDung: `Đã lưu ${fmtInt(ds.length - d.bo.length)} ô · ${fmtInt(d.bo.length)} ô không được lưu: ${d.bo.slice(0, 3).map(x => x.lyDo).join('; ')}${d.bo.length > 3 ? '…' : ''}` }
        : { loai: 'ok', noiDung: `Đã lưu ${fmtInt(ds.length)} ô` });
    }
  };

  // Nhập 1 ngày (đợt đầu / cuối) cho 1 nhóm HEX (dòng tầng 1 / tầng 2) ở công đoạn cd
  const apNgay = (hs: HexInfo[], cd: string, dot: DotBot, v: string | null) => {
    const k = khoaNgay(cd, dot);
    const duoc = hs.filter(h => duocNhap(q, cd, h.area));
    if (!duoc.length) return;
    const khac = duoc.filter(h => ngay[h.hex]?.[k] && ngay[h.hex][k] !== v).length;
    if (duoc.length > 1 && khac && !window.confirm(v
      ? `${fmtInt(khac)} HEX đã có ngày BOT ${cd} ${TEN_DOT[dot].toLowerCase()} khác — ghi đè bằng ${fmtNgayBot(v)} cho cả ${fmtInt(duoc.length)} HEX?`
      : `Xoá ngày BOT ${cd} ${TEN_DOT[dot].toLowerCase()} của ${fmtInt(khac)} HEX?`)) return;
    void luu(duoc.filter(h => (ngay[h.hex]?.[k] ?? null) !== v).map(h => ({ hex: h.hex, congDoan: cd, dot, ngay: v })));
  };

  const doi = (k: string) => setMoDong(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Số như bảng BOP (tỷ): công đoạn = giá trị còn lại của HEX đang ở công đoạn đó; P022 = đã nhập; P025 = đã xuất
  const soCua = (hs: HexInfo[], cds: readonly string[]) => {
    let v = 0;
    for (const h of hs) {
      if (cds.includes('P022')) v += h.inv;
      else if (cds.includes('P025')) v += h.xuat ?? 0;
      else if (h.stage && cds.includes(h.stage)) v += h.remain;
    }
    return v;
  };
  const vien = (cd: string) => (cd === 'P022' ? 'border-l-2 border-l-slate-300' : '');
  // Bấm số => cửa sổ danh sách HEX tạo nên số đó (bảng không bung tới HEX)
  const oSo = (v: number, k: string, hs: HexInfo[], x: Omit<XemSo, 'hs'>, them = '') => (
    <td key={k} onClick={v ? () => { setThongBao(null); setXem({ ...x, hs }); } : undefined} title={v ? 'Bấm để xem danh sách HEX' : undefined}
      className={`${bang.tdSo} ${them} ${v ? 'cursor-pointer hover:bg-amber-50 hover:underline' : ''}`}>{v ? fmtTy(v) : ''}</td>
  );
  const oGiaTri = (ten: string, hs: HexInfo[], cds: readonly string[], k: string) =>
    oSo(soCua(hs, cds), `${k}-gt`, hs, { ten, loai: 'gt', cds }, 'font-semibold');
  // BOT dự án của nhóm: ngày nhiều nhất trong các HEX không HỦY (như bảng Danh sách công trình)
  const botDuAn = (hs: HexInfo[]) => {
    const dem = new Map<number, number>();
    for (const h of hs) if (h.botDuAn && h.status !== 'HỦY') dem.set(h.botDuAn.getTime(), (dem.get(h.botDuAn.getTime()) ?? 0) + 1);
    let best = 0, n = -1;
    dem.forEach((c, t) => { if (c > n) { best = t; n = c; } });
    return n > 0 ? new Date(best) : null;
  };
  // 2 ô đầu như BOP: Tổng giá trị đơn hàng · BOT dự án; ô Tổng còn lại đứng sau cột Đang trên chuyền
  const oDau = (ten: string, hs: HexInfo[]) => {
    const bot = botDuAn(hs);
    const qua = !!bot && bot.getTime() < new Date(`${today}T00:00:00`).getTime() && hs.some(h => h.remain > 0);
    return (
      <>
        {oSo(hs.reduce((s2, h) => s2 + h.total, 0), 'tgt', hs, { ten, loai: 'tgt', cds: null }, 'font-bold')}
        <td className={`${bang.tdSo} ${qua ? 'font-bold text-red-600' : ''}`}>{bot ? fmtDate(bot) : ''}</td>
      </>
    );
  };
  const oTong = (ten: string, hs: HexInfo[]) => oSo(hs.reduce((s2, h) => s2 + h.remain, 0), 'tong', hs, { ten, loai: 'tong', cds: null }, 'font-bold');

  // 1 ô ngày (đợt đầu / cuối) của 1 công đoạn: nhóm khác ngày => đợt đầu hiện ngày sớm nhất, đợt cuối ngày muộn nhất
  const oNgay = (khoa: string, hs: HexInfo[], cd: string, dot: DotBot) => {
    const k = khoaNgay(cd, dot);
    const g = ngayNhom(hs.map(h => h.hex), k, ngay);
    const sua = hs.some(h => duocNhap(q, cd, h.area));
    const dangO = dangSua?.khoa === khoa && dangSua.cd === cd && dangSua.dot === dot;
    // Nhóm đủ ngày và cùng 1 ngày => mở sẵn ngày đó; nhóm thiếu / khác ngày => ô trống (chọn ngày nào là áp ngày đó)
    const batDau = g.ngay && g.co === g.tong ? g.ngay : '';
    const tre = hs.some(h => { const v = ngay[h.hex]?.[k]; return !!v && v < today && chuaQua(h, cd); });
    const xong = hs.length === 1 && !chuaQua(hs[0], cd);
    const hien = g.ngay ?? g.tu;
    return (
      <td key={`${cd}-${dot}`} onClick={sua && !dangO ? () => setDangSua({ khoa, cd, dot }) : undefined}
        className={`${bang.tdSo} min-w-[6.5rem] text-sm ${sua ? 'cursor-pointer hover:bg-amber-50' : 'bg-slate-50/60'} ${dot === 'dau' ? vien(cd) : ''} ${tre ? 'font-bold text-red-600' : xong ? 'text-slate-400' : 'text-blue-800'}`}
        title={`${cd} · ${TEN_CONG_DOAN_BOT[cd as keyof typeof TEN_CONG_DOAN_BOT]} · ${TEN_DOT[dot]}${g.co && !g.ngay ? ` · ${g.co}/${g.tong} HEX có ngày, từ ${fmtNgayBot(g.tu)} đến ${fmtNgayBot(g.den)}` : ''}${tre ? ' · đã qua BOT mà chưa xong công đoạn' : ''}${sua ? ' · bấm để nhập' : ' · không có quyền nhập'}`}>
        {dangO ? (
          <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <input type="date" min={NGAY_MIN} max={NGAY_MAX} autoFocus defaultValue={batDau} className="w-[8.5rem] rounded border border-slate-300 px-1 text-sm text-slate-900"
              onKeyDown={e => {
                if (e.key === 'Escape') { huySua.current = true; (e.target as HTMLInputElement).blur(); }
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              onBlur={e => {
                const v = e.target.value, huy = huySua.current;
                huySua.current = false; setDangSua(null);
                // Huỷ / chưa chọn đủ ngày (ô trống) / không đổi => không ghi gì; xoá ngày dùng nút ×
                if (huy || !v || v === batDau || !ngayHopLe(v)) return;
                apNgay(hs, cd, dot, v);
              }} />
            {g.co > 0 && (
              <button type="button" title="Xoá ngày BOT" aria-label="Xoá ngày BOT" className="rounded px-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
                onMouseDown={e => { e.preventDefault(); huySua.current = true; }}
                onClick={() => { setDangSua(null); huySua.current = false; apNgay(hs, cd, dot, null); }}>×</button>
            )}
          </span>
        ) : hien ? (
          <>{g.ngay || !g.den || g.tu === g.den ? fmtNgayBot(hien) : khoangNgay(g.tu, g.den)}{hs.length > 1 && g.co < g.tong && <span className="ml-1 text-xs font-normal text-slate-500">({g.co}/{g.tong})</span>}</>
        ) : ''}
      </td>
    );
  };

  // 3 ô gộp các công đoạn trên chuyền: đợt đầu sớm nhất · đợt cuối muộn nhất · giá trị; bấm để tách cột nhập từng công đoạn
  const oGop = (ten: string, hs: HexInfo[], cds: readonly string[]) => {
    const tim2 = (dot: DotBot) => {
      let v = '', d = '', tre = false;
      for (const h of hs) for (const cd of cds) {
        const x = ngay[h.hex]?.[khoaNgay(cd, dot)];
        if (!x) continue;
        if (!v || x < v) v = x;
        if (!d || x > d) d = x;
        if (x < today && chuaQua(h, cd)) tre = true;
      }
      return { v, d, tre };
    };
    const o = (dot: DotBot) => {
      const { v, d, tre } = tim2(dot);
      return (
        <td key={`chuyen-${dot}`} onClick={() => setMoChuyen(true)} title={`Đang trên chuyền · ${TEN_DOT[dot]} (khoảng ngày các công đoạn) — bấm để tách từng công đoạn và nhập ngày BOT`}
          className={`${bang.tdSo} min-w-[6.5rem] cursor-pointer text-sm hover:bg-amber-50 ${tre ? 'font-bold text-red-600' : 'text-blue-800'}`}>
          {!v ? '' : v === d ? fmtNgayBot(v) : khoangNgay(v, d)}
        </td>
      );
    };
    return <>{o('dau')}{o('cuoi')}{oGiaTri(ten, hs, cds, 'chuyen')}</>;
  };
  const oCot = (ten: string, khoa: string, hs: HexInfo[], c: Cot) => ('cd' in c
    ? <React.Fragment key={c.k}>{oNgay(khoa, hs, c.cd, 'dau')}{oNgay(khoa, hs, c.cd, 'cuoi')}{oGiaTri(ten, hs, [c.cd], c.k)}</React.Fragment>
    : <React.Fragment key={c.k}>{oGop(ten, hs, c.cds)}</React.Fragment>);
  const cotTruoc = cot.filter(c => !('cd' in c) || (c.cd !== 'P022' && c.cd !== 'P025'));
  // Trang Nhập BOT: chỉ công đoạn mình được nhập, từng công đoạn riêng
  const cdCuaToi2 = CONG_DOAN_BOT.filter(cd => !!q && (q.admin || q.congDoan.includes(cd)));
  const oDongRieng = (ten: string, khoa: string, hs: HexInfo[]) => {
    const bot = botDuAn(hs);
    const qua = !!bot && bot.getTime() < new Date(`${today}T00:00:00`).getTime() && hs.some(h => h.remain > 0);
    return (
      <>
        <td className={`${bang.tdSo} ${qua ? 'font-bold text-red-600' : ''}`}>{bot ? fmtDate(bot) : ''}</td>
        {cdCuaToi2.map(cd => oCot(ten, khoa, hs, { k: cd, cd }))}
        {oTong(ten, hs)}
      </>
    );
  };
  const oDong = (ten: string, khoa: string, hs: HexInfo[]) => (chiCuaToi ? oDongRieng(ten, khoa, hs) : (
    <>
      {oDau(ten, hs)}
      {cotTruoc.map(c => oCot(ten, khoa, hs, c))}
      {oTong(ten, hs)}
      {oCot(ten, khoa, hs, { k: 'P022', cd: 'P022' })}
      {oCot(ten, khoa, hs, { k: 'P025', cd: 'P025' })}
    </>
  ));
  // Tiêu đề 1 nhóm cột (công đoạn): chữ mờ nếu không có quyền nhập
  const thNhom = (key: string, cd: string | null, nd: React.ReactNode, colSpan: number, rowSpan: number, them = '', onClick?: () => void) => {
    const sua = !cd || (!!q && (q.admin || q.congDoan.includes(cd)));
    return (
      <th key={key} colSpan={colSpan} rowSpan={rowSpan} onClick={onClick}
        className={`${bang.thC} whitespace-nowrap text-sm leading-tight ${them} ${sua ? '' : 'text-slate-600'} ${onClick ? 'cursor-pointer select-none hover:bg-emerald-400' : ''}`}
        title={cd ? `${cd} · ${TEN_CONG_DOAN_BOT[cd as keyof typeof TEN_CONG_DOAN_BOT]}${sua ? ' · bạn nhập được' : ' · không có quyền nhập'}` : undefined}>{nd}</th>
    );
  };
  const thCon = (key: string, them = '') => (['dau', 'cuoi', 'gt'] as const).map(x => (
    <th key={`${key}-${x}`} className={`${bang.thC} whitespace-nowrap text-xs ${x === 'dau' ? them : ''}`}>{x === 'gt' ? 'Giá trị' : TEN_DOT[x]}</th>
  ));
  const soTang = moChuyen ? 4 : 3;

  if (loi && !du) return <p className="py-10 text-center text-sm text-slate-600">Không tải được BOT công đoạn ({loi}). <button type="button" onClick={tai} className="font-semibold text-blue-700 underline">Thử lại</button></p>;
  if (!du) return <p className="py-10 text-center text-sm font-semibold text-slate-500">Đang tải BOT công đoạn…</p>;
  if (!du.coBang) return <p className="py-10 text-center text-sm text-slate-600">Chưa có bảng BOT công đoạn: cần chạy backend/sql/2026-11-13_bot_cong_doan.sql.</p>;

  const cdCuaToi = q?.admin ? 'mọi công đoạn' : q?.congDoan.length ? `${q.congDoan.join(', ')}${q.xuong ? ` · xưởng ${q.xuong.join(', ')}` : ''}` : '';
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex gap-1" role="group" aria-label="Dòng theo">
          {(['ct', 'nsp', 'xuong'] as const).map(c => (
            <Chip key={c} active={chieu === c} onClick={() => { setChieu(c); setMoDong(new Set()); }}>Theo {TEN_CHIEU_BCD[c].toLowerCase()}</Chip>
          ))}
        </div>
        <span className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${cdCuaToi ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
          {cdCuaToi ? `Bạn nhập được: ${cdCuaToi}` : `Chỉ xem — bộ phận ${q?.boPhan || '(chưa có)'} chưa được giao công đoạn nào (ADMIN gán ở Setup)`}
        </span>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 font-semibold text-slate-700">
          <input type="checkbox" checked={chiChuaXong} onChange={e => setChiChuaXong(e.target.checked)} /> Chỉ HEX chưa xong
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {cdCuaToi && (
            <button type="button" onClick={() => setMoForm(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 font-semibold text-white hover:bg-slate-700">
              <Plus className="h-4 w-4" aria-hidden />Nhập BOT
            </button>
          )}
          {cdCuaToi && (
            <button type="button" onClick={() => setMoDan(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 font-semibold text-slate-700 hover:bg-slate-50">
              <ClipboardPaste className="h-4 w-4" aria-hidden />Dán từ Excel
            </button>
          )}
          {q?.admin && (
            <button type="button" onClick={() => setMoSetup(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 font-semibold text-slate-700 hover:bg-slate-50">
              <Settings className="h-4 w-4" aria-hidden />Setup phân công
            </button>
          )}
          <button type="button" onClick={tai} disabled={dangTai} title="Tải lại" aria-label="Tải lại"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${dangTai ? 'animate-spin' : ''}`} aria-hidden />
          </button>
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm HEX / công trình / hạng mục" className="w-52 outline-none" />
            {tim && <button type="button" onClick={() => setTim('')} aria-label="Xoá tìm"><X className="h-4 w-4 text-slate-400" /></button>}
          </label>
        </div>
      </div>
      {thongBao && (
        <p className={`flex items-start justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ${thongBao.loai === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          {thongBao.noiDung}<button type="button" onClick={() => setThongBao(null)} aria-label="Đóng"><X className="h-4 w-4" /></button>
        </p>
      )}

      <div className={`${bang.khung} max-h-[calc(100vh-14rem)] min-h-[20rem]`}>
        <table className={bang.table}>
          {chiCuaToi ? (
          <thead className={bang.thead}>
            <tr>
              <th rowSpan={3} className={`${bang.thC} sticky left-0 z-20 w-[24rem] min-w-[16rem] whitespace-nowrap bg-emerald-300`}>
                {TEN_CHIEU_BCD[chieu]} <span className="font-normal">({fmtInt(soHex)} HEX)</span>
                <NutMoTatCa onMo={() => setMoDong(new Set(cay.map(c => c.ct)))} onThu={() => setMoDong(new Set())} />
              </th>
              <th rowSpan={3} className={`${bang.thC} min-w-[6.5rem] whitespace-nowrap`} title="BOT dự án — hạn chung của công trình">BOT<br />dự án</th>
              <th colSpan={cdCuaToi2.length * 3} className={bang.thC}
                title="Ngày BOT đợt đầu · đợt cuối (bấm ô để nhập) · giá trị còn lại (tỷ) của HEX đang ở công đoạn">BOT các công đoạn bạn nhập</th>
              <th rowSpan={3} className={`${bang.thC} min-w-[6rem]`} title="Giá trị còn lại (tỷ)">Tổng<br />còn lại</th>
            </tr>
            <tr>{cdCuaToi2.map(cd => thNhom(cd, cd, <><div>{cd}</div><div className="text-xs font-semibold">{TEN_CONG_DOAN_BOT[cd]}</div></>, 3, 1))}</tr>
            <tr>{cdCuaToi2.map(cd => <React.Fragment key={cd}>{thCon(cd)}</React.Fragment>)}</tr>
          </thead>
          ) : (
          <thead className={bang.thead}>
            <tr>
              <th rowSpan={soTang} className={`${bang.thC} sticky left-0 z-20 w-[24rem] min-w-[16rem] whitespace-nowrap bg-emerald-300`}>
                {TEN_CHIEU_BCD[chieu]} <span className="font-normal">({fmtInt(soHex)} HEX)</span>
                <NutMoTatCa onMo={() => setMoDong(new Set(cay.map(c => c.ct)))} onThu={() => setMoDong(new Set())} />
              </th>
              <th rowSpan={soTang} className={`${bang.thC} min-w-[6.5rem] whitespace-nowrap`} title="Kể cả hạng mục đã nhập kho đủ">Tổng giá trị<br />đơn hàng</th>
              <th rowSpan={soTang} className={`${bang.thC} min-w-[6.5rem] whitespace-nowrap`} title="BOT dự án — hạn chung của công trình (ngày nhiều nhất trong các hạng mục không HỦY); đỏ = đã qua mà còn giá trị chưa xong">BOT<br />dự án</th>
              <th colSpan={6 + (moChuyen ? CHUYEN.length * 3 : 3) + 1} className={bang.thC}
                title="Mỗi công đoạn: ngày BOT đợt đầu · đợt cuối (bấm ô để nhập) · giá trị còn lại (tỷ) của HEX đang ở công đoạn">Tổng giá trị đơn hàng còn lại</th>
              <th colSpan={6} className={`${bang.thC} border-l-2 border-l-slate-300 bg-emerald-50/60 text-sm text-emerald-900`}>Kho (lũy kế)</th>
            </tr>
            <tr>
              {([['P001', 'notDeployed'], ['P002', 'p002']] as const).map(([cd, b]) => thNhom(cd, cd,
                <><span className={`mr-1.5 inline-block h-2 w-2 rounded-sm ${BOP_GROUP[b].dot}`} />{BOP_GROUP[b].label}<br /><span className="font-semibold text-slate-800">{cd}</span></>, 3, moChuyen ? 2 : 1))}
              {thNhom('chuyen', null, <>
                <span className={`mr-1.5 inline-block h-2 w-2 rounded-sm ${BOP_GROUP.onLine.dot}`} />{BOP_GROUP.onLine.label}
                {!moChuyen && <><br /><span className="font-semibold text-slate-800">P012→P021</span></>}
                <span className="ml-1 font-bold text-emerald-700">{moChuyen ? '−' : '+'}</span>
              </>, moChuyen ? CHUYEN.length * 3 : 3, 1, '', () => setMoChuyen(v => !v))}
              <th rowSpan={soTang - 1} className={`${bang.thC} min-w-[6rem]`}>Tổng</th>
              {thNhom('P022', 'P022', <>Đã nhập<br /><span className="font-semibold text-slate-800">P022</span></>, 3, moChuyen ? 2 : 1, 'border-l-2 border-l-slate-300 bg-emerald-50/60')}
              {thNhom('P025', 'P025', <>Đã xuất<br /><span className="font-semibold text-slate-800">P025</span></>, 3, moChuyen ? 2 : 1, 'bg-emerald-50/60')}
            </tr>
            {moChuyen && (
              <tr>
                {CHUYEN.map(cd => thNhom(cd, cd, <><div>{cd}</div><div className="text-xs font-semibold">{TEN_CONG_DOAN_BOT[cd]}</div></>, 3, 1))}
              </tr>
            )}
            <tr>
              {thCon('P001')}{thCon('P002')}
              {moChuyen ? CHUYEN.map(cd => <React.Fragment key={cd}>{thCon(cd)}</React.Fragment>) : thCon('chuyen')}
              {thCon('P022', 'border-l-2 border-l-slate-300')}{thCon('P025')}
            </tr>
          </thead>
          )}
          <tbody>
            {cay.map(c => {
              const mau = chieu === 'ct' ? mauLuong(thuTuNhom(c.ct)) : null, mo = moDong.has(c.ct), tatCaHex = c.nhom.flatMap(n => n.hs);
              const nen = mau ? mau.nen : 'bg-white';
              return (
                <React.Fragment key={c.ct}>
                  <tr className={`${nen} font-bold`}>
                    <td className={`${bang.tdB} sticky left-0 z-[1] max-w-[24rem] truncate ${nen}`} title={c.ct}>
                      <button type="button" onClick={() => doi(c.ct)} className="text-left hover:underline">
                        <span className="inline-block w-4 text-slate-500">{mo ? '▾' : '▸'}</span>
                        {mau && <span className={`mr-1.5 inline-block min-w-[1.5rem] rounded px-1 text-center text-sm ${mau.stt}`}>{thuTuNhom(c.ct)!.stt}</span>}
                        {c.ct} <span className="font-normal text-slate-500">({fmtInt(c.tong)})</span>
                      </button>
                    </td>
                    {oDong(c.ct, `ct${NOI}${c.ct}`, tatCaHex)}
                  </tr>
                  {mo && c.nhom.map(n => {
                    const kN = `${c.ct}${NOI}${n.nsp}`;
                    const tt2 = c2 === 'ct' ? thuTuNhom(n.nsp) : null, mau2 = mauLuong(tt2);
                    return (
                      <tr key={kN} className="bg-slate-50 font-semibold">
                        <td className={`${bang.tdB} sticky left-0 z-[1] max-w-[24rem] truncate bg-slate-50 pl-11`} title={n.nsp}>
                          {mau2 && <span className={`mr-1.5 inline-block min-w-[1.5rem] rounded px-1 text-center text-sm ${mau2.stt}`}>{tt2!.stt}</span>}
                          {n.nsp} <span className="font-normal text-slate-500">({fmtInt(n.hs.length)})</span>
                        </td>
                        {oDong(`${c.ct} · ${n.nsp}`, `n${NOI}${kN}`, n.hs)}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {cay.length === 0 && <tr><td colSpan={chiCuaToi ? 3 + cdCuaToi2.length * 3 : 3 + 6 + (moChuyen ? CHUYEN.length * 3 : 3) + 1 + 6} className={`${bang.tdB} py-8 text-center text-slate-500`}>Không có HEX nào.</td></tr>}
          </tbody>
          {cay.length > 0 && (() => {
            const tat = cay.flatMap(c => c.nhom.flatMap(n => n.hs));
            const td2 = (v: number, k: string, x: Omit<XemSo, 'hs' | 'ten'>) => oSo(v, k, tat, { ...x, ten: 'Tất cả' });
            return (
              <tfoot className={bang.tfoot}>
                {chiCuaToi ? (
                <tr>
                  <td className={`${bang.tdB} left-0 !z-[3] text-center`}>TỔNG</td>
                  <td className={bang.tdB} />
                  {cdCuaToi2.map(cd => <React.Fragment key={cd}><td className={bang.tdSo} /><td className={bang.tdSo} />{td2(soCua(tat, [cd]), cd, { loai: 'gt', cds: [cd] })}</React.Fragment>)}
                  {td2(tat.reduce((s2, h) => s2 + h.remain, 0), 'tong', { loai: 'tong', cds: null })}
                </tr>
                ) : (
                <tr>
                  <td className={`${bang.tdB} left-0 !z-[3] text-center`}>TỔNG</td>
                  {td2(tat.reduce((s2, h) => s2 + h.total, 0), 'tgt', { loai: 'tgt', cds: null })}
                  <td className={bang.tdB} />
                  {cotTruoc.map(c => <React.Fragment key={c.k}><td className={bang.tdSo} /><td className={bang.tdSo} />{td2(soCua(tat, 'cd' in c ? [c.cd] : c.cds), c.k, { loai: 'gt', cds: 'cd' in c ? [c.cd] : c.cds })}</React.Fragment>)}
                  {td2(tat.reduce((s2, h) => s2 + h.remain, 0), 'tong', { loai: 'tong', cds: null })}
                  <td className={`${bang.tdSo} border-l-2 border-l-slate-300`} /><td className={bang.tdSo} />{td2(soCua(tat, ['P022']), 'nk', { loai: 'gt', cds: ['P022'] })}
                  <td className={bang.tdSo} /><td className={bang.tdSo} />{td2(soCua(tat, ['P025']), 'xk', { loai: 'gt', cds: ['P025'] })}
                </tr>
                )}
              </tfoot>
            );
          })()}
        </table>
      </div>

      {moForm && <FormNhapBot items={items} quyen={q} ngay={ngay} thuTu={thuTuNhom} onClose={() => setMoForm(false)}
        onLuu={ds => { setMoForm(false); void luu(ds); }} />}
      {moDan && <DanExcel quyen={q} xuongCua={xuongCua} onClose={() => setMoDan(false)} onLuu={ds => { setMoDan(false); void luu(ds); }} />}
      {moSetup && du && <SetupPhanCong du={du}
        xuongDs={[...new Set([...items.map(h => chuanTen(h.area)), ...Object.values(du.setup.xuongCua).flat()].filter(Boolean))].sort()}
        onClose={() => setMoSetup(false)} onDaLuu={tai} />}
      {xem && <CuaSoHex xem={xem} ngay={ngay} quyen={q} today={today} onHexClick={onHexClick} onLichSu={setLichSu}
        thongBao={thongBao} onLuu={luu} onClose={() => setXem(null)} />}
      {lichSu && <LichSu hex={lichSu} onClose={() => setLichSu(null)} />}
    </div>
  );
};


// ---------------------------------------------------------------------------- cửa sổ HEX của 1 ô số
// Danh sách HEX tạo nên số vừa bấm (tổng dòng = số đó). Ngày BOT đợt đầu / cuối của công đoạn ô (ô gộp trên chuyền / ô tổng:
// công đoạn hiện tại của HEX) nhập được ngay trong cửa sổ nếu bộ phận có quyền.
const CuaSoHex = ({ xem, ngay, quyen, today, thongBao, onHexClick, onLichSu, onLuu, onClose }: {
  xem: XemSo; ngay: NgayMap; quyen: QuyenBot | null; today: string; thongBao: { loai: 'ok' | 'loi'; noiDung: string } | null;
  onHexClick?: (hex: string) => void; onLichSu: (hex: string) => void; onLuu: (ds: OGhi[]) => Promise<void>; onClose: () => void;
}) => {
  const [tim, setTim] = useState('');
  // Lưu xong (kể cả bị từ chối / lỗi) => tăng phienO để dựng lại ô ngày theo dữ liệu đã lưu, không giữ chữ vừa gõ
  const [phienO, setPhienO] = useState(0);
  const botHm = useBotHangMuc();
  const boQuaBlur = useRef(false);
  const ghi = (o: OGhi) => { void onLuu([o]).finally(() => setPhienO(v => v + 1)); };
  const cdCua = (h: HexInfo): string | null => {
    if (xem.cds?.length === 1) return xem.cds[0];
    if (h.stage && (xem.cds ? xem.cds.includes(h.stage) : (CONG_DOAN_BOT as readonly string[]).includes(h.stage))) return h.stage;
    return null;
  };
  const ds = useMemo(() => {
    const t = tim.trim().toUpperCase();
    return xem.hs.map(h => ({ h, v: giaTriO(h, xem) }))
      .filter(x => x.v !== 0 && (!t || x.h.hex.includes(t) || (x.h.congTrinh ?? '').toUpperCase().includes(t) || x.h.hangMuc.toUpperCase().includes(t)))
      .sort((a, b) => b.v - a.v || a.h.hex.localeCompare(b.h.hex));
  }, [xem, tim]);
  const tong = ds.reduce((s, x) => s + x.v, 0);
  const tenCot = xem.loai === 'gt'
    ? (xem.cds ?? []).length === 1 ? `${xem.cds![0]} · ${TEN_CONG_DOAN_BOT[xem.cds![0] as keyof typeof TEN_CONG_DOAN_BOT] ?? ''}` : 'Đang trên chuyền (P012→P021)'
    : TEN_LOAI[xem.loai];
  const oNgayHex = (h: HexInfo, cd: string | null, dot: DotBot) => {
    if (!cd) return <td className={`${bang.tdSo} text-slate-300`}>–</td>;
    const k = khoaNgay(cd, dot), v = ngay[h.hex]?.[k] ?? '';
    const tre = !!v && v < today && chuaQua(h, cd);
    if (!duocNhap(quyen, cd, h.area)) return <td className={`${bang.tdSo} text-sm ${tre ? 'font-bold text-red-600' : 'text-blue-800'}`}>{v ? fmtNgayBot(v) : ''}</td>;
    return (
      <td className={`${bang.tdSo} text-sm`}>
        <span className="inline-flex items-center gap-1">
          <input key={`${k}-${v}-${phienO}`} type="date" min={NGAY_MIN} max={NGAY_MAX} defaultValue={v} aria-label={`${h.hex} ${cd} ${TEN_DOT[dot]}`}
            className={`w-[10rem] rounded border border-slate-300 px-1.5 py-0.5 text-base ${tre ? 'font-bold text-red-600' : 'text-slate-900'}`}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            onBlur={e => {
              const m = e.target.value;
              if (boQuaBlur.current) { boQuaBlur.current = false; return; }
              if (m && m !== v && ngayHopLe(m)) ghi({ hex: h.hex, congDoan: cd, dot, ngay: m });
            }} />
          {v && <button type="button" title="Xoá ngày BOT" aria-label="Xoá ngày BOT" className="rounded px-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
            onMouseDown={e => { e.preventDefault(); boQuaBlur.current = true; }}
            onClick={() => { boQuaBlur.current = false; ghi({ hex: h.hex, congDoan: cd, dot, ngay: null }); }}>×</button>}
        </span>
      </td>
    );
  };
  return (
    <ModalShell open onClose={onClose} labelledBy="bcd-hex" closeOnEsc closeOnBackdrop overlayClassName={bang.cuaSoNen} panelClassName={bang.cuaSoKhung}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="bcd-hex" className="text-xl font-bold text-slate-900">{xem.ten}</h3>
          <p className="text-base text-slate-600">{tenCot} · <b>{fmtInt(ds.length)}</b> HEX · <b>{fmtTy(tong)}</b> tỷ</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm HEX / công trình / hạng mục" className="w-52 outline-none" />
          </label>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
      </div>
      {thongBao && (
        <p className={`rounded-lg px-3 py-1.5 text-sm ${thongBao.loai === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{thongBao.noiDung}</p>
      )}
      <div className={`${bang.khung} min-h-0 flex-1`}>
        <table className={`${bang.table} ${bang.cuaSoBang}`}>
          <thead className={bang.thead}>
            <tr>
              <th className={`${bang.thC} w-10`}>#</th>
              <th className={bang.thC}>HEX</th>
              <th className={bang.thC}>Công trình</th>
              <th className={bang.thC}>Nhóm SP</th>
              <th className={bang.thC}>Hạng mục</th>
              <th className={bang.thC}>Xưởng</th>
              <th className={bang.thC}>Công đoạn</th>
              <th className={`${bang.thC} whitespace-nowrap`}>Giá trị (tỷ)</th>
              <th className={`${bang.thC} whitespace-nowrap`} title="BOT hạng mục = NGÀY CẦN GIAO PC ĐỀ XUẤT của HEX trong file công trình (như tab BOT)">BOT hạng mục</th>
              <th className={`${bang.thC} whitespace-nowrap`} title="Ngày BOT của công đoạn ô (ô tổng / gộp: công đoạn hiện tại của HEX)">BOT đợt đầu</th>
              <th className={`${bang.thC} whitespace-nowrap`}>BOT đợt cuối</th>
              <th className={`${bang.thC} whitespace-nowrap`}>Lịch sử</th>
            </tr>
          </thead>
          <tbody>
            {ds.map(({ h, v }, i) => {
              const cd = cdCua(h);
              return (
                <tr key={h.hex} className="bg-white">
                  <td className={`${bang.tdB} text-center text-slate-500`}>{i + 1}</td>
                  <td className={`${bang.tdB} whitespace-nowrap`}>
                    {onHexClick ? <button type="button" onClick={() => onHexClick(h.hex)} className="font-semibold text-blue-700 hover:underline">{h.hex}</button>
                      : <span className="font-semibold">{h.hex}</span>}
                  </td>
                  <td className={`${bang.tdB} max-w-[22rem] truncate`} title={h.congTrinh ?? ''}>{h.congTrinh}</td>
                  <td className={`${bang.tdB} max-w-[12rem] truncate`} title={h.nhomSp ?? ''}>{h.nhomSp}</td>
                  <td className={`${bang.tdB} max-w-[30rem] truncate`} title={h.hangMuc}>{h.hangMuc}</td>
                  <td className={`${bang.tdB} whitespace-nowrap text-center`}>{h.area}</td>
                  <td className={`${bang.tdB} whitespace-nowrap text-center`}>{h.stage ?? ''}</td>
                  <td className={`${bang.tdSo} font-semibold`}>{fmtTy(v)}</td>
                  {(() => {
                    const bh = botHm?.get(h.hex), qua = !!bh && bh.getTime() < new Date(`${today}T00:00:00`).getTime() && h.remain > 0;
                    return <td className={`${bang.tdSo} ${qua ? 'font-semibold text-red-600' : ''}`} title={bh ? undefined : botHm ? 'CHƯA BOT' : 'Đang tải…'}>{bh ? fmtDate(bh) : ''}</td>;
                  })()}
                  {oNgayHex(h, cd, 'dau')}
                  {oNgayHex(h, cd, 'cuoi')}
                  <td className={`${bang.tdB} text-center`}>
                    <button type="button" onClick={() => onLichSu(h.hex)} title="Lịch sử sửa ngày BOT" aria-label="Lịch sử" className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                      <History className="h-5 w-5" />Xem
                    </button>
                  </td>
                </tr>
              );
            })}
            {!ds.length && <tr><td colSpan={12} className={`${bang.tdB} py-6 text-center text-slate-500`}>Không có HEX nào.</td></tr>}
          </tbody>
          {ds.length > 0 && (
            <tfoot className={bang.tfoot}>
              <tr>
                <td className={`${bang.tdB} text-center`} colSpan={7}>TỔNG</td>
                <td className={`${bang.tdSo} font-bold`}>{fmtTy(tong)}</td>
                <td className={bang.tdB} colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------- biểu mẫu nhập (từng bước)
// Chọn công trình → phạm vi (cả công trình / nhóm sản phẩm / từng HEX) → công đoạn của mình → ngày đợt đầu / đợt cuối
// → xem trước số HEX sẽ ghi / ghi đè / bỏ qua → Lưu. Ô ngày để trống = không đổi ngày đợt đó.
// nhung: hiện thẳng trên trang (trang Nhập BOT), không phải cửa sổ
export const FormNhapBot = ({ items, quyen, ngay, thuTu, onClose, onLuu, nhung = false, dangLuu = false }: {
  items: HexInfo[]; quyen: QuyenBot | null; ngay: NgayMap; thuTu: (ten: unknown) => { stt: number } | null;
  onClose: () => void; onLuu: (ds: OGhi[]) => void; nhung?: boolean; dangLuu?: boolean;
}) => {
  const cdCua = CONG_DOAN_BOT.filter(cd => quyen?.admin || quyen?.congDoan.includes(cd));
  const theoCt = useMemo(() => {
    const m = new Map<string, HexInfo[]>();
    for (const h of items) { const ct = h.congTrinh || '(Chưa có công trình)'; const a = m.get(ct); if (a) a.push(h); else m.set(ct, [h]); }
    return m;
  }, [items]);
  const dsCt = useMemo(() => [...theoCt.keys()].sort((a, b) => {
    const ta = thuTu(a)?.stt ?? 1e9, tb = thuTu(b)?.stt ?? 1e9;
    return ta - tb || a.localeCompare(b, 'vi');
  }), [theoCt, thuTu]);
  const [timCt, setTimCt] = useState('');
  const [ct, setCt] = useState('');
  const [phamVi, setPhamVi] = useState<'ct' | 'nhom' | 'hex'>('ct');
  const [nhomChon, setNhomChon] = useState<Set<string>>(() => new Set());
  const [hexChon, setHexChon] = useState<Set<string>>(() => new Set());
  const [timHex, setTimHex] = useState('');
  const [cdChon, setCdChon] = useState<Set<string>>(() => new Set(cdCua.length === 1 ? cdCua : []));
  const [ngayDau, setNgayDau] = useState('');
  const [ngayCuoi, setNgayCuoi] = useState('');

  const hsCt = useMemo(() => theoCt.get(ct) ?? [], [theoCt, ct]);
  const nhomDs = useMemo(() => [...new Set(hsCt.map(h => h.nhomSp || NO_NSP))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })), [hsCt]);
  const hsPhamVi = useMemo(() => (phamVi === 'ct' ? hsCt
    : phamVi === 'nhom' ? hsCt.filter(h => nhomChon.has(h.nhomSp || NO_NSP))
      : hsCt.filter(h => hexChon.has(h.hex))), [phamVi, hsCt, nhomChon, hexChon]);
  const lat = (s0: Set<string>, v: string) => { const n = new Set(s0); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  // Xem trước: ô sẽ ghi (đổi), trong đó ghi đè ngày khác; HEX bỏ qua vì không có quyền (xưởng)
  const xemTruoc = useMemo(() => {
    const ghi: OGhi[] = [];
    let deDe = 0;
    const boQua = new Set<string>();
    const dots: [DotBot, string][] = [];
    if (ngayDau) dots.push(['dau', ngayDau]);
    if (ngayCuoi) dots.push(['cuoi', ngayCuoi]);
    for (const h of hsPhamVi) for (const cd of cdChon) {
      if (!duocNhap(quyen, cd, h.area)) { boQua.add(h.hex); continue; }
      for (const [dot, v] of dots) {
        const cu = ngay[h.hex]?.[khoaNgay(cd, dot)];
        if (cu === v) continue;
        if (cu) deDe++;
        ghi.push({ hex: h.hex, congDoan: cd, dot, ngay: v });
      }
    }
    return { ghi, deDe, boQua: boQua.size };
  }, [hsPhamVi, cdChon, ngayDau, ngayCuoi, ngay, quyen]);
  const ngoaiKhoang = !ngayHopLe(ngayDau) || !ngayHopLe(ngayCuoi);
  const sai = ngoaiKhoang || (ngayDau && ngayCuoi && ngayDau > ngayCuoi);
  const ctLoc = dsCt.filter(x => !timCt.trim() || x.toUpperCase().includes(timCt.trim().toUpperCase())).slice(0, 200);
  const hexLoc = hsCt.filter(h => !timHex.trim() || `${h.hex} ${h.hangMuc}`.toUpperCase().includes(timHex.trim().toUpperCase())).slice(0, 300);
  const nhan = 'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500';

  const noiDung = (
    <>
      {!nhung && (
        <div className="flex items-start justify-between">
          <h3 id="bcd-form" className="text-base font-bold text-slate-900">Nhập ngày BOT</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
      )}

      <div>
        <span className={nhan}>1. Công trình</span>
        <input value={timCt} onChange={e => setTimCt(e.target.value)} placeholder="Gõ tên / mã công trình để tìm"
          className="mb-1.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        <select value={ct} onChange={e => { setCt(e.target.value); setNhomChon(new Set()); setHexChon(new Set()); }} size={6}
          className="w-full rounded-lg border border-slate-300 p-1 text-sm">
          {ctLoc.map(x => <option key={x} value={x}>{thuTu(x) ? `${thuTu(x)!.stt}. ` : ''}{x} ({fmtInt(theoCt.get(x)!.length)} HEX)</option>)}
        </select>
      </div>

      {ct && (
        <div>
          <span className={nhan}>2. Phạm vi</span>
          <div className="flex flex-wrap gap-1.5">
            {([['ct', `Cả công trình (${fmtInt(hsCt.length)} HEX)`], ['nhom', 'Chọn nhóm sản phẩm'], ['hex', 'Chọn từng HEX']] as const).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setPhamVi(k)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${phamVi === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{t}</button>
            ))}
          </div>
          {phamVi === 'nhom' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nhomDs.map(n => {
                const so = hsCt.filter(h => (h.nhomSp || NO_NSP) === n).length;
                return (
                  <label key={n} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-sm ${nhomChon.has(n) ? 'border-slate-900 bg-slate-50 font-semibold' : 'border-slate-300'}`}>
                    <input type="checkbox" checked={nhomChon.has(n)} onChange={() => setNhomChon(s0 => lat(s0, n))} />{n} ({fmtInt(so)})
                  </label>
                );
              })}
            </div>
          )}
          {phamVi === 'hex' && (
            <div className="mt-2">
              <div className="mb-1 flex items-center gap-2">
                <input value={timHex} onChange={e => setTimHex(e.target.value)} placeholder="Tìm HEX / hạng mục" className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                <button type="button" onClick={() => setHexChon(new Set(hexLoc.map(h => h.hex)))} className="text-xs font-semibold text-blue-700 hover:underline">Chọn hết</button>
                <button type="button" onClick={() => setHexChon(new Set())} className="text-xs font-semibold text-slate-500 hover:underline">Bỏ chọn</button>
              </div>
              <div className="max-h-48 overflow-auto rounded-lg border border-slate-200">
                {hexLoc.map(h => (
                  <label key={h.hex} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2 py-1 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={hexChon.has(h.hex)} onChange={() => setHexChon(s0 => lat(s0, h.hex))} />
                    <span className="font-semibold">{h.hex}</span><span className="truncate text-slate-600">{h.hangMuc}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">{h.area} · {h.stage ?? ''}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {ct && (
        <div>
          <span className={nhan}>3. Công đoạn</span>
          <div className="flex flex-wrap gap-1.5">
            {cdCua.map(cd => (
              <label key={cd} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-sm ${cdChon.has(cd) ? 'border-slate-900 bg-slate-50 font-semibold' : 'border-slate-300'}`}>
                <input type="checkbox" checked={cdChon.has(cd)} onChange={() => setCdChon(s0 => lat(s0, cd))} />{cd} · {TEN_CONG_DOAN_BOT[cd]}
              </label>
            ))}
          </div>
        </div>
      )}

      {ct && (
        <div>
          <span className={nhan}>4. Ngày BOT</span>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Đợt đầu
              <input type="date" min={NGAY_MIN} max={NGAY_MAX} value={ngayDau} onChange={e => setNgayDau(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="text-sm">Đợt cuối
              <input type="date" min={NGAY_MIN} max={NGAY_MAX} value={ngayCuoi} onChange={e => setNgayCuoi(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-slate-300 px-2 py-1.5" />
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">Để trống 1 ô = giữ nguyên ngày đợt đó.</p>
        </div>
      )}

      {ct && (
        <div className={`rounded-lg px-3 py-2 text-sm ${sai ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'}`}>
          {ngoaiKhoang ? 'Ngày không hợp lệ (năm phải từ 2020 đến 2100) — kiểm tra lại.'
            : sai ? 'Ngày đợt đầu đang sau ngày đợt cuối — kiểm tra lại.'
            : !cdChon.size ? 'Chọn ít nhất 1 công đoạn.'
              : !ngayDau && !ngayCuoi ? 'Chọn ngày đợt đầu và / hoặc đợt cuối.'
                : <>Sẽ lưu <b>{fmtInt(xemTruoc.ghi.length)}</b> ô cho <b>{fmtInt(new Set(xemTruoc.ghi.map(x => x.hex)).size)}</b> HEX
                  {xemTruoc.deDe > 0 && <> · <b className="text-amber-700">{fmtInt(xemTruoc.deDe)}</b> ô đang có ngày khác sẽ bị ghi đè</>}
                  {xemTruoc.boQua > 0 && <> · {fmtInt(xemTruoc.boQua)} HEX không thuộc xưởng bạn nhập (bỏ qua)</>}
                  {!xemTruoc.ghi.length && <> — không có gì thay đổi</>}</>}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={nhung ? () => { setNgayDau(''); setNgayCuoi(''); setCdChon(new Set(cdCua.length === 1 ? cdCua : [])); setPhamVi('ct'); setNhomChon(new Set()); setHexChon(new Set()); } : onClose}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">{nhung ? 'Nhập lại' : 'Huỷ'}</button>
        <button type="button" disabled={!!sai || !xemTruoc.ghi.length || dangLuu} onClick={() => onLuu(xemTruoc.ghi)}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">{dangLuu ? 'Đang lưu…' : 'Lưu'}</button>
      </div>
    </>
  );
  return nhung ? <div className="flex flex-col gap-4">{noiDung}</div> : (
    <ModalShell open onClose={onClose} labelledBy="bcd-form" closeOnEsc
      overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/40 p-2 sm:p-4"
      panelClassName="flex max-h-[92vh] w-full max-w-2xl flex-col gap-4 overflow-auto rounded-xl bg-white p-4 shadow-xl sm:p-5">
      {noiDung}
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------- dán từ Excel
const DanExcel = ({ quyen, xuongCua, onClose, onLuu }: {
  quyen: QuyenBot | null; xuongCua: Map<string, string>; onClose: () => void; onLuu: (ds: OGhi[]) => void;
}) => {
  const [text, setText] = useState('');
  const cdCuaToi = CONG_DOAN_BOT.filter(cd => quyen?.admin || quyen?.congDoan.includes(cd));
  const [cd, setCd] = useState<string>(cdCuaToi[0] ?? '');
  const [dot, setDot] = useState<DotBot>('cuoi');
  const kq = useMemo(() => docDan(text, cd || null, dot), [text, cd, dot]);
  const duoc = kq.ghi.filter(x => duocNhap(quyen, x.congDoan, xuongCua.get(x.hex) ?? ''));
  const khongQuyen = kq.ghi.length - duoc.length;
  const khongThay = kq.ghi.filter(x => !xuongCua.has(x.hex)).length;
  return (
    <ModalShell open onClose={onClose} labelledBy="bcd-dan" closeOnEsc
      overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/40 p-4"
      panelClassName="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between">
        <h3 id="bcd-dan" className="text-base font-bold text-slate-900">Dán ngày BOT từ Excel</h3>
        <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <p className="text-sm text-slate-600">
        Copy từ Excel rồi dán vào ô dưới: <b>có dòng tiêu đề</b> gồm cột <b>HEX</b> và các cột công đoạn + đợt
        (<b>P014 ĐẦU</b>, <b>P014 CUỐI</b>; chỉ ghi P014 = đợt cuối), hoặc <b>2 cột HEX + ngày</b> cho công đoạn / đợt chọn bên dưới.
        Ô trống bỏ qua; gõ <b>xoá</b> để xoá ngày.
      </p>
      <label className="flex items-center gap-2 text-sm">Công đoạn (khi dán 2 cột):
        <select value={cd} onChange={e => setCd(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
          {cdCuaToi.map(c => <option key={c} value={c}>{c} · {TEN_CONG_DOAN_BOT[c]}</option>)}
        </select>
        <select value={dot} onChange={e => setDot(e.target.value as DotBot)} className="rounded border border-slate-300 px-2 py-1">
          <option value="dau">{TEN_DOT.dau}</option><option value="cuoi">{TEN_DOT.cuoi}</option>
        </select>
      </label>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={10} placeholder={'HEX\tP014 ĐẦU\tP014 CUỐI\n260815398\t20/11/2026\t30/11/2026'}
        className="w-full rounded-lg border border-slate-300 p-2 font-mono text-sm" />
      {text.trim() && (
        <div className="space-y-1 text-sm">
          <p><b className="text-emerald-700">{fmtInt(duoc.length)}</b> ô sẽ lưu
            {khongQuyen > 0 && <> · <b className="text-amber-700">{fmtInt(khongQuyen)}</b> ô không có quyền (bỏ qua)</>}
            {khongThay > 0 && <> · {fmtInt(khongThay)} ô có HEX không thấy trong danh sách đang xem</>}
            {kq.loi.length > 0 && <> · <b className="text-red-700">{fmtInt(kq.loi.length)}</b> dòng lỗi</>}</p>
          {kq.loi.length > 0 && (
            <ul className="max-h-32 overflow-auto rounded bg-red-50 p-2 text-xs text-red-800">
              {kq.loi.slice(0, 50).map((x, i) => <li key={i}>Dòng {x.dong}: {x.lyDo}</li>)}
            </ul>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">Huỷ</button>
        <button type="button" disabled={!duoc.length} onClick={() => onLuu(duoc)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Lưu {fmtInt(duoc.length)} ô</button>
      </div>
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------- setup phân công (ADMIN)
const SetupPhanCong = ({ du, xuongDs, onClose, onDaLuu }: { du: DuLieu; xuongDs: string[]; onClose: () => void; onDaLuu: () => void }) => {
  const [cdBp, setCdBp] = useState<Record<string, string[]>>(() => ({ ...du.setup.congDoan }));
  const [xuongBp, setXuongBp] = useState<Record<string, string[]>>(() => ({ ...du.setup.xuongCua }));
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const boPhan = useMemo(() => [...new Set([...du.boPhanDs, ...Object.values(du.setup.congDoan).flat()])].sort((a, b) => a.localeCompare(b, 'vi')), [du]);
  const lat = (m: Record<string, string[]>, k: string, v: string) => {
    const s = new Set(m[k] ?? []);
    if (s.has(v)) s.delete(v); else s.add(v);
    return { ...m, [k]: [...s] };
  };
  const luu = async () => {
    setDangLuu(true); setLoi(null);
    try {
      const r = await fetch(`${API_BASE_URL}/bot-cong-doan/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ congDoan: cdBp, xuongCua: xuongBp }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Lỗi ${r.status}`);
      onDaLuu(); onClose();
    } catch (e) { setLoi(e instanceof Error ? e.message : String(e)); } finally { setDangLuu(false); }
  };
  return (
    <ModalShell open onClose={onClose} labelledBy="bcd-setup" closeOnEsc
      overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/40 p-4"
      panelClassName="flex max-h-[90vh] w-full max-w-6xl flex-col gap-3 rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <h3 id="bcd-setup" className="text-base font-bold text-slate-900">Setup phân công nhập BOT công đoạn</h3>
          <p className="text-sm text-slate-600">Tích bộ phận được nhập từng công đoạn. Cột "Chỉ xưởng": bộ phận chỉ nhập HEX thuộc các xưởng đã chọn (không chọn = mọi xưởng). ADMIN luôn nhập được mọi ô.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <div className={`${bang.khung} min-h-0`}>
        <table className={bang.table}>
          <thead className={bang.thead}>
            <tr>
              <th className={`${bang.thC} sticky left-0 z-20 bg-emerald-300`}>Bộ phận</th>
              {CONG_DOAN_BOT.map(cd => <th key={cd} className={`${bang.thC} whitespace-nowrap`}><div>{cd}</div><div className="text-xs font-semibold">{TEN_CONG_DOAN_BOT[cd]}</div></th>)}
              <th className={bang.thC}>Chỉ xưởng</th>
            </tr>
          </thead>
          <tbody>
            {boPhan.map(bp => (
              <tr key={bp} className="hover:bg-slate-50">
                <td className={`${bang.tdB} sticky left-0 z-[1] whitespace-nowrap bg-white font-semibold`}>{bp}</td>
                {CONG_DOAN_BOT.map(cd => (
                  <td key={cd} className={bang.tdSo}>
                    <input type="checkbox" checked={(cdBp[cd] ?? []).includes(bp)} onChange={() => setCdBp(m => lat(m, cd, bp))} aria-label={`${bp} nhập ${cd}`} />
                  </td>
                ))}
                <td className={`${bang.tdB} min-w-[16rem]`}>
                  <div className="flex flex-wrap gap-1">
                    {xuongDs.map(x => {
                      const on = (xuongBp[bp] ?? []).includes(x);
                      return (
                        <button key={x} type="button" onClick={() => setXuongBp(m => lat(m, bp, x))}
                          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${on ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{x}</button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loi && <p className="text-sm text-red-700">Không lưu được: {loi}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">Huỷ</button>
        <button type="button" disabled={dangLuu} onClick={luu} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Lưu setup</button>
      </div>
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------- lịch sử sửa 1 HEX
const LichSu = ({ hex, onClose }: { hex: string; onClose: () => void }) => {
  const [ds, setDs] = useState<{ cong_doan: string; dot?: string; ngay_cu: string | null; ngay_moi: string | null; nguoi: string; bo_phan: string | null; luc: string }[] | null>(null);
  useEffect(() => {
    fetch(`${API_BASE_URL}/bot-cong-doan/lich-su?hex=${encodeURIComponent(hex)}`).then(r => r.json()).then(d => setDs(d.ds ?? [])).catch(() => setDs([]));
  }, [hex]);
  return (
    <ModalShell open onClose={onClose} labelledBy="bcd-ls" closeOnEsc closeOnBackdrop
      overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/40 p-4"
      panelClassName="flex max-h-[80vh] w-full max-w-2xl flex-col gap-3 rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between">
        <h3 id="bcd-ls" className="text-base font-bold text-slate-900">Lịch sử ngày BOT · HEX {hex}</h3>
        <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      {!ds ? <p className="text-sm text-slate-500">Đang tải…</p> : !ds.length ? <p className="text-sm text-slate-500">Chưa có lần sửa nào.</p> : (
        <div className={`${bang.khung} min-h-0`}>
          <table className={bang.table}>
            <thead className={bang.thead}><tr>{['Lúc', 'Công đoạn', 'Đợt', 'Ngày cũ', 'Ngày mới', 'Người sửa'].map(t => <th key={t} className={bang.thC}>{t}</th>)}</tr></thead>
            <tbody>
              {ds.map((x, i) => (
                <tr key={i}>
                  <td className={bang.tdSo}>{new Date(x.luc).toLocaleString('vi-VN')}</td>
                  <td className={bang.tdSo}>{x.cong_doan}</td>
                  <td className={bang.tdSo}>{x.dot === 'dau' ? TEN_DOT.dau : TEN_DOT.cuoi}</td>
                  <td className={bang.tdSo}>{fmtNgayBot(x.ngay_cu) || '—'}</td>
                  <td className={bang.tdSo}>{fmtNgayBot(x.ngay_moi) || '(xoá)'}</td>
                  <td className={bang.tdB}>{x.nguoi}{x.bo_phan ? ` · ${x.bo_phan}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  );
};
