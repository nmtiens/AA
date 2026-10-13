import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScanLine, ChevronDown, MoreHorizontal, Wifi, WifiOff, Check, Loader2, AlertTriangle, Users } from 'lucide-react';
import { BG, Toast } from '../mobileUi';
import DangNhapXuong from './DangNhapXuong';
import { getToken } from '../../../services/userService';
import { useAuth } from '../../../context/AuthContext';
import TrienKhaiGon from './TrienKhaiGon';
import { dangKyThietBi, xoaTokenXuong, xuongApi, type ToCuaToi, type DanhMucXuong } from '../../../services/xuongApi';
import {
  themSuKien, guiHangDoi, tinhTrangHangDoi, danhSachCho, xinLuuBen, themAnh, LoiLuuMay, LoiQuaNhieuAnh, type SuKienNhap, type SuKienCho,
} from '../../../services/xuongQueue';
import { doLech } from '../../../services/xuongClock';
import {
  apDung, caCanChot, caHienTai, chiaDeu, denGioXacNhan, gioVN, hhmm, hienSl, khoa, khoaDong, nhomDangLam, soNguoiRanh,
  TEN_CA, tenLyDo, moTaSuKien, type CongViec, type DongViec, type LoaiCa, type MaLyDo,
} from '../../../services/xuongModel';
import XuongDong, { type TrangThaiGui } from './XuongDong';
import QuetQr from './QuetQr';
import {
  QuanSoSheet, BatDauSheet, TamNgungSheet, GiaoSheet, NhanSheet, TangCaSheet, XacNhanSheet, ChiaNguoiSheet, LichSuSheet, GoMaSheet,
  ChonToSheet, MenuSheet, type NhanKetQua, type XacNhanDong, type AnhChup,
} from './XuongSheets';
import { NUT_CHINH, NUT_DONG, NUT_PHU, CHU_PHU, KHOI, KE, MAU } from './xuongUi';

// ============================================================================
// MÀN TỔ TRƯỞNG — mục "Tổ" của app Xưởng (/xuong, XuongShell). Thiết kế: docs/designs/xuong-checkin.md — Design Review Pass 1–7.
// Ba tầng (1A): trên = tổ + trạng thái gửi + thẻ việc cần làm; giữa = 3 tab; đáy = "Quét phiếu" 64px.
// Mọi thao tác ghi vào hàng đợi trên máy TRƯỚC (services/xuongQueue.ts), màn đổi ngay, nhãn "Chờ gửi" → "Đã gửi".
// ============================================================================

type Tab = 'choNhan' | 'dangLam' | 'choGiao';
type Sheet =
  | { loai: 'quanSo'; ca: LoaiCa; sau?: { nhan: string; chay: (quanSoMoi?: number) => void } }
  | { loai: 'tamNgung'; r: DongViec }
  | { loai: 'giao'; r: DongViec; cheDo: 'xong' | 'giao' }
  | { loai: 'nhan'; hex: string; ten: string | null }
  | { loai: 'hex'; hex: string }
  | { loai: 'tangCa' } | { loai: 'xacNhan' } | { loai: 'chiaNguoi' } | { loai: 'lichSu' }
  | { loai: 'goMa' } | { loai: 'quet' } | { loai: 'chonTo' } | { loai: 'menu' }
  | { loai: 'trienKhai'; hex: string | null }
  | { loai: 'batDau'; r: DongViec; suKien: 'bat_dau' | 'tiep_tuc'; quanSo: number | null };

const KHOA_PHIEN = 'xuong_phien';
const KHOA_TO = 'xuong_to_cuoi';
const KHOA_CV = (toId: number) => `xuong_cv_${toId}`;
const KHOA_DM = 'xuong_danh_muc';
const docLS = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } };
const ghiLS = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };

interface Phien { user: { id: number; fullName: string | null; username: string }; to: ToCuaToi[] }

/** Tổ quản lý chọn ở Tổng quan để xem / thao tác hộ (D25); `lan` đổi mỗi lần chọn để chọn lại cùng tổ vẫn mở */
export interface ToMo { id: number; ten: string; xuong: string; lan: number }

export default function XuongApp({ moTo, onTongQuan }: {
  moTo: ToMo | null;
  /** Sang mục Tổng quan của app (quản lý) */
  onTongQuan: () => void;
}) {
  const { hasPermission } = useAuth();
  // Quản lý / kế hoạch xưởng: triển khai gọn trên điện thoại (7A). Backend kiểm lại quyền theo xưởng.
  const laQuanLy = hasPermission('xuong_quan_ly');
  const quetDeTrienKhai = useRef(false);
  // Quản lý xem / thao tác hộ một tổ không phải của mình (D25)
  const [toNgoai, setToNgoai] = useState<ToCuaToi | null>(null);
  const [phien, setPhien] = useState<Phien | null>(() => docLS<Phien>(KHOA_PHIEN));
  const [dangKy, setDangKy] = useState<'dang' | 'ok' | 'loi'>('dang');
  const [loiDangKy, setLoiDangKy] = useState('');
  const [canDangNhap, setCanDangNhap] = useState(() => !getToken() && !localStorage.getItem('xuong_token'));
  const [toId, setToId] = useState<number | null>(() => Number(localStorage.getItem(KHOA_TO)) || null);
  const [cv, setCv] = useState<CongViec | null>(null);
  const [cvLuc, setCvLuc] = useState<number | null>(null);
  const [taiLoi, setTaiLoi] = useState('');
  const [dm, setDm] = useState<DanhMucXuong | null>(() => docLS<DanhMucXuong>(KHOA_DM));
  const [tab, setTab] = useState<Tab>('dangLam');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [hangDoi, setHangDoi] = useState({ soCho: 0, canhBao: false });
  const [choGui, setChoGui] = useState<Set<string>>(new Set());
  const [vuaGui, setVuaGui] = useState<Set<string>>(new Set());
  const [tuChoi, setTuChoi] = useState<Array<{ id: string; reason: string; hex: string | null; moTa: string }>>([]);
  const [loiLuu, setLoiLuu] = useState(false);
  const [hoanTac, setHoanTac] = useState<{ ids: string[]; nhan: string } | null>(null);
  const [hienRanh, setHienRanh] = useState(false);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const toastT = useRef<ReturnType<typeof setTimeout>>();
  const hoanTacT = useRef<ReturnType<typeof setTimeout>>();
  const choGuiTruoc = useRef<Set<string>>(new Set());

  const flash = useCallback((m: string) => {
    setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 3000);
  }, []);

  // ---------- Đăng ký máy (R4/R5) ----------
  const dangKyMay = useCallback(async () => {
    setDangKy('dang');
    const kq = await dangKyThietBi();
    if (kq.ok && kq.user && kq.to) {
      const p: Phien = { user: kq.user, to: kq.to };
      setPhien(p); ghiLS(KHOA_PHIEN, p);
      setToId(id => (id && kq.to!.some(t => t.id === id) ? id : kq.to![0]?.id ?? null));
      setDangKy('ok');
      xinLuuBen();
      return;
    }
    // Mất mạng mà đã từng đăng ký: vẫn làm việc với hàng đợi
    if (!kq.available && kq.message?.startsWith('Mất mạng') && docLS<Phien>(KHOA_PHIEN)) { setDangKy('ok'); return; }
    setLoiDangKy(kq.message || 'Không đăng ký được máy');
    setDangKy('loi');
  }, []);
  useEffect(() => { if (!canDangNhap) dangKyMay(); }, [canDangNhap, dangKyMay]);

  useEffect(() => { if (toId) localStorage.setItem(KHOA_TO, String(toId)); }, [toId]);

  // Tổng quan chọn một tổ → mở tổ đó (tổ không phải của mình thì xem với quyền quản lý)
  useEffect(() => {
    if (!moTo) return;
    const cuaToi = phien?.to.some(t => t.id === moTo.id);
    setToNgoai(cuaToi ? null : { id: moTo.id, ten: moTo.ten, xuong: moTo.xuong } as ToCuaToi);
    setToId(moTo.id); setTab('dangLam'); setSheet(null); setHienRanh(false);
  }, [moTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const veToCuaToi = () => { setToNgoai(null); setToId(phien?.to[0]?.id ?? null); setHienRanh(false); };

  // ---------- Tải việc của tổ ----------
  const taiCv = useCallback(async () => {
    if (!toId) return;
    const r = await xuongApi.congViec(toId);
    if (r.ok && r.data) {
      if (r.data.available === false) { setTaiLoi('Máy chủ chưa bật mục Xưởng. Báo quản lý.'); return; }
      setCv(r.data); setCvLuc(Date.now()); setTaiLoi('');
      ghiLS(KHOA_CV(toId), { cv: r.data, luc: Date.now() });
    } else if (r.status === 401) {
      xoaTokenXuong(); setCanDangNhap(true);
    } else {
      const cu = docLS<{ cv: CongViec; luc: number }>(KHOA_CV(toId));
      if (cu) { setCv(c => c ?? cu.cv); setCvLuc(l => l ?? cu.luc); }
      setTaiLoi(r.status === 0 ? '' : (r.message || 'Không tải được việc của tổ'));
    }
  }, [toId]);

  useEffect(() => {
    if (dangKy !== 'ok' || !toId) return;
    const cu = docLS<{ cv: CongViec; luc: number }>(KHOA_CV(toId));
    setCv(cu?.cv ?? null); setCvLuc(cu?.luc ?? null);
    taiCv();
  }, [dangKy, toId, taiCv]);

  const taiDm = useCallback(() => {
    xuongApi.danhMuc().then(r => {
      if (r.ok && r.data && r.data.available !== false) {
        const d = { congDoan: r.data.congDoan, to: r.data.to };
        setDm(d); ghiLS(KHOA_DM, d);
      }
    });
  }, []);
  useEffect(() => { if (dangKy === 'ok') taiDm(); }, [dangKy, taiDm]);

  // ---------- Hàng đợi ----------
  const capNhatHangDoi = useCallback(async () => {
    try {
      const [t, ds] = await Promise.all([tinhTrangHangDoi(), danhSachCho()]);
      setHangDoi({ soCho: t.soCho, canhBao: t.canhBao });
      const keys = new Set(ds.filter(e => e.hex && e.congDoanId).map(e => khoa(e.hex!, e.congDoanId!)));
      const xong = [...choGuiTruoc.current].filter(k => !keys.has(k));
      if (xong.length) {
        setVuaGui(s => new Set([...s, ...xong]));
        setTimeout(() => setVuaGui(s => { const t2 = new Set(s); xong.forEach(k => t2.delete(k)); return t2; }), 5000);
      }
      choGuiTruoc.current = keys;
      setChoGui(keys);
    } catch { /* IndexedDB không đọc được: giữ trạng thái cũ */ }
  }, []);

  const gui = useCallback(async () => {
    const kq = await guiHangDoi();
    if (kq.loi === 'dang_nhap_lai') { xoaTokenXuong(); setCanDangNhap(true); }
    if (kq.tuChoi.length) {
      setTuChoi(a => [...a, ...kq.tuChoi.map(x => ({
        id: x.id, reason: x.reason, hex: x.suKien?.hex ?? null, moTa: x.suKien ? moTaSuKien({ loai: x.suKien.loai, soLuong: x.suKien.soLuong }) : '',
      }))]);
      navigator.vibrate?.([80, 60, 80]);
    }
    await capNhatHangDoi();
    if (kq.daGui > 0 || kq.tuChoi.length) taiCv();
  }, [capNhatHangDoi, taiCv]);

  useEffect(() => {
    if (dangKy !== 'ok') return;
    capNhatHangDoi(); gui();
    const t = setInterval(() => { setNow(Date.now()); if (navigator.onLine) gui(); }, 20_000);
    const len = () => { setOnline(true); doLech(); gui(); taiCv(); };
    const mat = () => setOnline(false);
    const hien = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); gui(); taiCv(); } };
    window.addEventListener('online', len); window.addEventListener('offline', mat);
    document.addEventListener('visibilitychange', hien);
    return () => {
      clearInterval(t); window.removeEventListener('online', len); window.removeEventListener('offline', mat);
      document.removeEventListener('visibilitychange', hien);
    };
  }, [dangKy, gui, capNhatHangDoi, taiCv]);

  // ---------- Ghi một thao tác ----------
  const ghi = useCallback(async (ds: SuKienNhap[], nhan: string, doi?: (c: CongViec) => CongViec): Promise<SuKienCho[] | null> => {
    const evs: SuKienCho[] = [];
    try {
      for (const x of ds) evs.push(await themSuKien(x, phien?.user.id ?? null));
    } catch (e) {
      if (e instanceof LoiLuuMay) { setLoiLuu(true); return null; }
      throw e;
    }
    navigator.vibrate?.(30);
    if (doi) setCv(c => (c ? doi(c) : c));
    setSheet(null);
    setHoanTac({ ids: evs.map(e => e.id), nhan });
    clearTimeout(hoanTacT.current);
    hoanTacT.current = setTimeout(() => setHoanTac(null), 10_000);
    await capNhatHangDoi();
    gui();
    return evs;
  }, [phien, capNhatHangDoi, gui]);

  // Ảnh kèm thao tác: lưu vào máy trước (hàng đợi ảnh, tối đa 20 chờ gửi — R11); trả id ảnh, null = không lưu được
  const luuAnh = async (anh: AnhChup[], hex: string): Promise<string[] | null> => {
    try {
      const ids: string[] = [];
      for (const a of anh) ids.push(await themAnh(a.blob, a.kieu, hex));
      return ids;
    } catch (e) {
      if (e instanceof LoiQuaNhieuAnh) { flash(e.message); return null; }
      if (e instanceof LoiLuuMay) { setLoiLuu(true); return null; }
      throw e;
    }
  };

  const huy = useCallback(async (ids: string[], nhan: string) => {
    const ok = await ghi(ids.map(id => ({ loai: 'huy', suaCho: id })), `Huỷ: ${nhan}`);
    setHoanTac(null);
    if (ok) flash(`Đã huỷ: ${nhan}`);
    setHienRanh(false);
  }, [ghi, flash]);

  // ---------- Dẫn xuất ----------
  const nhom = useMemo(() => nhomDangLam(cv?.dangLam ?? []), [cv]);
  const caChot = cv ? caCanChot(cv, now) : null;
  const ca = cv ? caHienTai(cv, now) : null;
  const quanSo = ca && cv ? cv.quanSo[ca] : undefined;
  const ranh = soNguoiRanh(quanSo, nhom.dangChay);
  const canChia = typeof quanSo === 'number' && nhom.dangChay.length > 0
    && ((ranh ?? 0) > 0 || nhom.dangChay.some(r => !r.soNguoi));
  const nhieuCd = (cv?.congDoan.length ?? 0) > 1;
  const tenCd = (id: string) => (nhieuCd ? cv?.congDoan.find(c => c.id === id)?.ten ?? null : null);
  const guiCua = (r: DongViec): TrangThaiGui => (choGui.has(khoaDong(r)) ? 'cho' : vuaGui.has(khoaDong(r)) ? 'da_gui' : null);
  const toHienTai = phien?.to.find(t => t.id === toId) ?? (toNgoai && toNgoai.id === toId ? toNgoai : null);
  const laToNgoai = !!toHienTai && !phien?.to.some(t => t.id === toHienTai.id);

  // 3A: ca chưa chốt quân số → chốt trước, rồi tự làm tiếp thao tác vừa bấm
  const canQuanSo = (nhan: string, chay: (quanSoMoi?: number) => void) => {
    if (caChot) setSheet({ loai: 'quanSo', ca: caChot, sau: { nhan, chay } });
    else chay();
  };

  const chotQuanSo = async (caChon: LoaiCa, n: number, sau?: (quanSoMoi?: number) => void) => {
    const ok = await ghi([{ loai: 'quan_so', toId: toId!, soNguoi: n, duLieu: { loaiCa: caChon, soNguoi: n } }],
      `Chốt quân số ${TEN_CA[caChon].toLowerCase()} ${n} người`,
      c => ({ ...c, quanSo: { ...c.quanSo, [caChon]: n } }));
    if (ok && sau) sau(n);
  };

  // Mỗi lần chạy hạng mục (bắt đầu / tiếp tục) phải khai số người làm: chốt quân số ca trước (nếu chưa), rồi cửa sổ
  // khai số người — gợi ý số người đang rảnh (quân số − người các hạng mục khác đang chạy), tiếp tục thì số cũ.
  const batDau = (r: DongViec, loai: 'bat_dau' | 'tiep_tuc') => canQuanSo(loai === 'bat_dau' ? 'bắt đầu' : 'tiếp tục', quanSoMoi => {
    const q = quanSoMoi ?? quanSo;
    setSheet({ loai: 'batDau', r, suKien: loai, quanSo: typeof q === 'number' ? q : null });
  });
  const ghiBatDau = (r: DongViec, loai: 'bat_dau' | 'tiep_tuc', soNguoi: number) => {
    setSheet(null);
    ghi([{ loai, hex: r.hex, congDoanId: r.congDoanId, toId: toId!, soNguoi }],
      `${loai === 'bat_dau' ? 'Bắt đầu' : 'Tiếp tục'} ${r.hex}${soNguoi ? ` · ${soNguoi} người` : ''}`,
      c => apDung(c, khoaDong(r), x => ({ ...x, dangChayTu: new Date().toISOString(), soNguoi, suKienCuoi: new Date().toISOString() })))
      .then(ok => { if (ok) setHienRanh(true); });
  };

  const tamNgung = (r: DongViec, ma: MaLyDo) => {
    ghi([{ loai: 'tam_ngung', hex: r.hex, congDoanId: r.congDoanId, toId: toId!, lyDoTamNgung: ma }],
      `Tạm ngưng ${r.hex} — ${tenLyDo(ma)}`,
      c => apDung(c, khoaDong(r), x => ({ ...x, dangChayTu: null, soNguoi: 0, trangThai: 'tam_ngung', suKienCuoi: new Date().toISOString() })))
      .then(ok => { if (ok) setHienRanh(true); });
  };

  const xongGiao = async (r: DongViec, cheDo: 'xong' | 'giao', soLuong: number, den: string | null, anh: AnhChup[]) => {
    const anhCho = anh.length ? await luuAnh(anh, r.hex) : [];
    if (anhCho === null) return;
    const kemAnh = anhCho.length ? { duLieu: { anhCho } } : {};
    const ds: SuKienNhap[] = [];
    if (cheDo === 'xong') ds.push({ loai: 'hoan_thanh', hex: r.hex, congDoanId: r.congDoanId, toId: toId!, soLuong, ...kemAnh });
    if (den) ds.push({ loai: 'giao', hex: r.hex, congDoanId: r.congDoanId, toId: toId!, soLuong, congDoanDenId: den, ...(cheDo === 'giao' ? kemAnh : {}) });
    const tenDen = den ? (dm?.congDoan.find(c => c.id === den)?.ten ?? den) : '';
    const dv = r.dvt?.trim() || 'cái';
    const nhan = cheDo === 'xong' ? `Xong ${hienSl(soLuong)} ${dv} ${r.hex}${den ? ` — giao sang ${tenDen}` : ''}` : `Giao ${hienSl(soLuong)} ${dv} ${r.hex} sang ${tenDen}`;
    ghi(ds, nhan, c => apDung(c, khoaDong(r), x => ({
      ...x,
      dangChayTu: cheDo === 'xong' && soLuong >= x.slNhan - x.slHoanThanh ? null : x.dangChayTu,
      slHoanThanh: x.slHoanThanh + (cheDo === 'xong' ? soLuong : 0),
      slGiao: x.slGiao + (den ? soLuong : 0),
      suKienCuoi: new Date().toISOString(),
    }))).then(ok => { if (ok && cheDo === 'xong') setHienRanh(true); });
  };

  const nhan = async (hex: string, p: NhanKetQua, ten: string | null) => {
    const anhCho = p.anh.length ? await luuAnh(p.anh, hex) : [];
    if (anhCho === null) return;
    const moi: DongViec = {
      hex, congDoanId: p.congDoanId, trangThai: 'cho_nhan', slGiaoDen: 0, slNhan: 0, slHoanThanh: 0, slGiao: 0,
      soNguoi: null, dangChayTu: null, suKienCuoi: null, co: [], tenHangMuc: ten, maCongTrinh: null, tenCongTrinh: null,
      dvt: null, goiYKe: [],
    };
    ghi([{ loai: 'nhan', hex, congDoanId: p.congDoanId, toId: toId!, soLuong: p.soLuong,
      congDoanNguonId: p.congDoanNguonId ?? null, xuongNguon: p.xuongNguon ?? null, ...(anhCho.length ? { duLieu: { anhCho } } : {}) }],
      `Nhận ${hienSl(p.soLuong)} ${[...(cv?.choNhan ?? []), ...(cv?.dangLam ?? [])].find(x => x.hex === hex)?.dvt?.trim() || 'cái'} ${hex}`,
      c => apDung(c, khoa(hex, p.congDoanId), x => ({ ...x, slNhan: x.slNhan + p.soLuong, suKienCuoi: new Date().toISOString() }), moi))
      .then(ok => { if (ok) setTab('dangLam'); });
  };

  const chiaNguoi = (m: Record<string, number>) => {
    const phanBo = nhom.dangChay.map(r => ({ hex: r.hex, congDoanId: r.congDoanId, soNguoi: m[khoaDong(r)] ?? 0 }));
    ghi([{ loai: 'chia_nguoi', toId: toId!, duLieu: { phanBo } }], `Chia người cho ${phanBo.length} hạng mục`,
      c => phanBo.reduce<CongViec>((acc, p) => apDung(acc, khoa(p.hex, p.congDoanId), x => ({ ...x, soNguoi: p.soNguoi })), c));
    setHienRanh(false);
  };

  const khaiTangCa = (p: { loaiCa: LoaiCa; soNguoi: number; boChon: string[] }) => {
    ghi([
      { loai: 'tang_ca', toId: toId!, soNguoi: p.soNguoi, duLieu: { loaiCa: p.loaiCa, boChon: p.boChon } },
      { loai: 'quan_so', toId: toId!, soNguoi: p.soNguoi, duLieu: { loaiCa: p.loaiCa, soNguoi: p.soNguoi } },
    ], `Khai tăng ca ${TEN_CA[p.loaiCa].toLowerCase()} · ${p.soNguoi} người`,
    c => ({ ...c, tangCa: [...new Set([...c.tangCa, p.loaiCa])], quanSo: { ...c.quanSo, [p.loaiCa]: p.soNguoi }, soNguoiTangCaTruoc: p.soNguoi }));
  };

  const xacNhan = async (ds: XacNhanDong[]) => {
    // Ảnh lưu vào máy trước; sự kiện tiến độ mang id ảnh, gửi khi có sóng
    const anhCua = new Map<XacNhanDong, string[]>();
    for (const x of ds) {
      if (!x.anh.length) continue;
      const ids = await luuAnh(x.anh, x.r.hex);
      if (ids === null) return;
      anhCua.set(x, ids);
    }
    const evs: SuKienNhap[] = [];
    for (const x of ds) {
      if (!x.vanLam && x.dungLuc !== null) {
        evs.push({ loai: 'tam_ngung', hex: x.r.hex, congDoanId: x.r.congDoanId, toId: toId!, lyDoTamNgung: 'khac',
          ghiChu: `Đã dừng lúc ${hhmm(x.dungLuc)} (xác nhận cuối ngày)`, lucXayRa: x.dungLuc, duLieu: { ghiLui: true } });
      }
      const anhCho = anhCua.get(x);
      if (x.tienDo !== null || anhCho) {
        evs.push({ loai: 'tien_do', hex: x.r.hex, congDoanId: x.r.congDoanId, toId: toId!, tienDo: x.tienDo,
          duLieu: { ...(x.tienDo !== null ? { tienDo: x.tienDo } : {}), ...(anhCho ? { anhCho } : {}) } });
      }
    }
    evs.push({ loai: 'xac_nhan_cuoi_ngay', toId: toId!, duLieu: {
      hangMuc: ds.map(x => ({ hex: x.r.hex, congDoanId: x.r.congDoanId, trangThai: x.vanLam ? 'van_lam' : 'da_dung',
        ...(x.dungLuc !== null ? { dungLuc: new Date(x.dungLuc).toISOString() } : {}) })),
    } });
    const dung = ds.filter(x => !x.vanLam);
    ghi(evs, dung.length ? `Xác nhận cuối ngày · ${dung.length} hạng mục đã dừng` : 'Xác nhận cuối ngày · tất cả vẫn làm',
      c => dung.reduce<CongViec>((acc, x) => apDung(acc, khoaDong(x.r), y => ({ ...y, dangChayTu: null, trangThai: 'tam_ngung' })),
        { ...c, daXacNhanHomNay: true }));
  };

  const moHex = (hex: string, ten: string | null = null) => {
    if (quetDeTrienKhai.current) { quetDeTrienKhai.current = false; setSheet({ loai: 'trienKhai', hex }); return; }
    if (!cv) { setSheet({ loai: 'nhan', hex, ten }); return; }
    const co = [...cv.choNhan, ...cv.dangLam, ...cv.choGiao].some(r => r.hex === hex);
    setSheet(co ? { loai: 'hex', hex } : { loai: 'nhan', hex, ten });
  };

  const sheetTrienKhai = (<>
    {sheet?.loai === 'trienKhai' && (
      <TrienKhaiGon hexBanDau={sheet.hex} xuongBanDau={toHienTai?.xuong ?? null}
        onQuet={() => { quetDeTrienKhai.current = true; setSheet({ loai: 'quet' }); }}
        onXong={m => { setSheet(null); flash(m); taiCv(); }} onClose={() => setSheet(null)} />
    )}
    {sheet?.loai === 'quet' && quetDeTrienKhai.current && (
      <QuetQr onHex={h => moHex(h)} onGoMa={() => { quetDeTrienKhai.current = false; setSheet({ loai: 'trienKhai', hex: null }); }}
        onClose={() => { quetDeTrienKhai.current = false; setSheet({ loai: 'trienKhai', hex: null }); }} />
    )}
  </>);

  // ---------- Màn chặn ----------
  if (canDangNhap) {
    return (
      <DangNhapXuong onSuccess={() => { setCanDangNhap(false); }} ghiChu={hangDoi.soCho > 0 && (
        <p className={`rounded-2xl ${MAU.ngung.nen} p-3 text-base font-medium ${MAU.ngung.chu}`} role="alert">
          Còn {hangDoi.soCho} thao tác chưa gửi — đăng nhập để gửi. Các thao tác vẫn giữ trên máy.
        </p>
      )} />
    );
  }
  if (dangKy === 'dang' && !phien) {
    return <div className={`flex min-h-full items-center justify-center ${BG} text-base text-slate-700`}><Loader2 className="mr-2 animate-spin" aria-hidden /> Đang tải việc của tổ…</div>;
  }
  if (dangKy === 'loi') {
    return (
      <div className={`flex min-h-full flex-col justify-center gap-4 ${BG} px-5`}>
        <p className={`rounded-2xl ${MAU.loi.nen} p-4 text-base font-medium ${MAU.loi.chu}`} role="alert">{loiDangKy}</p>
        {loiDangKy.startsWith('Mất mạng') && <p className={CHU_PHU}>Cần có sóng lần đầu để tải việc của tổ.</p>}
        <button className={NUT_CHINH} onClick={dangKyMay}>Thử lại</button>
      </div>
    );
  }
  if (phien && phien.to.length === 0 && !toNgoai) {
    return (
      <div className={`mx-auto flex min-h-full max-w-xl flex-col justify-center gap-4 ${BG} px-5 py-10`}>
        <p className="text-lg font-semibold text-slate-900">Tài khoản chưa được gán tổ nào</p>
        {laQuanLy ? (<>
          <p className={CHU_PHU}>Bạn là quản lý: chọn một tổ ở Tổng quan để xem hoặc ghi hộ.</p>
          <button className={NUT_CHINH} onClick={onTongQuan}>Mở Tổng quan xưởng</button>
          <button className={NUT_PHU} onClick={() => setSheet({ loai: 'trienKhai', hex: null })}>Triển khai hạng mục</button>
        </>) : (
          <p className={CHU_PHU}>Báo quản lý xưởng gán bạn làm tổ trưởng hoặc thêm mã nhân viên của bạn vào tổ (Quản lý → Tổ & tổ trưởng).</p>
        )}
        {sheetTrienKhai}
        <Toast text={toast} />
      </div>
    );
  }

  // ---------- Màn chính ----------
  const soTab = { choNhan: cv?.choNhan.length ?? 0, dangLam: cv?.dangLam.length ?? 0, choGiao: cv?.choGiao.length ?? 0 };
  const nhacXacNhan = !!cv && denGioXacNhan(now) && !cv.daXacNhanHomNay && nhom.dangChay.length > 0;
  const dongHex = sheet?.loai === 'hex' && cv ? [...cv.choNhan, ...cv.dangLam, ...cv.choGiao].filter(r => r.hex === sheet.hex) : [];

  const nutDong = (r: DongViec, o: 'choNhan' | 'dangLam' | 'choGiao') => {
    if (o === 'choNhan') return <button className={NUT_DONG} onClick={() => setSheet({ loai: 'nhan', hex: r.hex, ten: r.tenHangMuc })}>Nhận {hienSl(r.slGiaoDen - r.slNhan)}</button>;
    if (o === 'choGiao') return <button className={NUT_DONG} onClick={() => setSheet({ loai: 'giao', r, cheDo: 'giao' })}>Giao {hienSl(r.slHoanThanh - r.slGiao)}</button>;
    if (r.trangThai === 'dang_lam') return (<>
      <button className={NUT_DONG} onClick={() => setSheet({ loai: 'giao', r, cheDo: 'xong' })}>Xong — giao</button>
      <button className={`${NUT_PHU} shrink-0`} onClick={() => setSheet({ loai: 'tamNgung', r })}>Tạm ngưng</button>
    </>);
    if (r.trangThai === 'tam_ngung') return <button className={NUT_DONG} onClick={() => batDau(r, 'tiep_tuc')}>Tiếp tục</button>;
    return <button className={NUT_DONG} onClick={() => batDau(r, 'bat_dau')}>Bắt đầu</button>;
  };

  const nhomEl = (tieuDe: string, ds: DongViec[], o: 'choNhan' | 'dangLam' | 'choGiao') => ds.length ? (
    <section aria-label={tieuDe} className="space-y-2">
      <h2 className="px-1 text-base font-semibold uppercase tracking-wide text-slate-700">{tieuDe} ({ds.length})</h2>
      <ul className={`${KHOI} ${KE}`}>
        {ds.map(r => <XuongDong key={khoaDong(r)} r={r} now={now} tenCongDoan={tenCd(r.congDoanId)} gui={guiCua(r)}>{nutDong(r, o)}</XuongDong>)}
      </ul>
    </section>
  ) : null;

  // Ô trống: chỉ câu báo — nút Quét phiếu đã ở đáy màn hình (trước có 2 nút trùng nhau)
  const trong = (cau: string) => (
    <div className="rounded-2xl bg-white p-6 text-center text-base text-slate-700">{cau}</div>
  );

  const thanhGui = !online
    ? { ten: hangDoi.soCho ? `Mất sóng · ${hangDoi.soCho} thao tác chờ gửi` : 'Mất sóng', icon: <WifiOff size="1em" aria-hidden />, mau: hangDoi.canhBao ? MAU.loi : MAU.ngung }
    : hangDoi.soCho
      ? { ten: `Đang gửi ${hangDoi.soCho} thao tác`, icon: <Loader2 size="1em" className="animate-spin motion-reduce:animate-none" aria-hidden />, mau: hangDoi.canhBao ? MAU.loi : MAU.cho }
      : { ten: 'Đã gửi hết', icon: <Check size="1em" aria-hidden />, mau: MAU.chay };

  return (
    <div className={`min-h-full ${BG}`} style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${10 + (hoanTac ? 5 : 0) + (hienRanh && canChia ? 5 : 0)}rem)` }}>
      {/* Tầng trên */}
      {/* Phần đầu cuộn theo trang (không dính) — chỉ thanh 3 tab dính trên cùng, để điện thoại còn chỗ cho danh sách */}
      <header className="mx-auto max-w-3xl space-y-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {phien && phien.to.length > 1 ? (
              <button className="flex min-h-12 min-w-0 items-center gap-1 text-left" onClick={() => setSheet({ loai: 'chonTo' })} aria-label="Chọn tổ">
                <span className="truncate text-2xl font-semibold text-slate-900">{toHienTai?.ten ?? 'Chọn tổ'}</span>
                <ChevronDown size="1.25em" className="shrink-0 text-slate-700" aria-hidden />
              </button>
            ) : (
              <h1 className="min-w-0 break-words text-2xl font-semibold text-slate-900">{toHienTai?.ten ?? 'Xưởng'}</h1>
            )}
            <p className={`flex items-center gap-1.5 text-base font-medium ${thanhGui.mau.chu}`} aria-live="polite">
              {thanhGui.icon} {thanhGui.ten}{hangDoi.canhBao ? ' — quá 4 giờ, tìm chỗ có sóng' : ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-700 active:bg-slate-100" aria-label="Việc khác" onClick={() => setSheet({ loai: 'menu' })}>
              <MoreHorizontal size="1.5em" />
            </button>
          </div>
        </div>
        {laToNgoai && (
          <div className={`space-y-2 rounded-2xl border ${MAU.ngung.vien} ${MAU.ngung.nen} p-3`}>
            <p className={`text-base ${MAU.ngung.chu}`}>Đang xem tổ xưởng {toHienTai?.xuong} với quyền quản lý — thao tác sẽ ghi "quản lý ghi hộ".</p>
            <div className="flex flex-wrap gap-2">
              <button className={NUT_PHU} onClick={onTongQuan}>Về Tổng quan</button>
              {!!phien?.to.length && <button className={NUT_PHU} onClick={veToCuaToi}>Về tổ của tôi</button>}
            </div>
          </div>
        )}
        {loiLuu && (
          <div className={`space-y-2 rounded-2xl border ${MAU.loi.vien} ${MAU.loi.nen} p-4`} role="alert">
            <p className={`text-base font-semibold ${MAU.loi.chu}`}>Chưa lưu được trên máy. Thao tác vừa bấm CHƯA được ghi.</p>
            <p className="text-base text-slate-800">Bộ nhớ trình duyệt đầy hoặc bị chặn. Xoá bớt ảnh / ứng dụng rồi bấm lại.</p>
            <button className={`${NUT_PHU} w-full`} onClick={() => setLoiLuu(false)}>Đã hiểu</button>
          </div>
        )}

        {tuChoi.map(x => (
          <div key={x.id} className={`space-y-2 rounded-2xl border ${MAU.loi.vien} ${MAU.loi.nen} p-4`} role="alert">
            <p className={`flex items-start gap-2 text-base font-semibold ${MAU.loi.chu}`}><AlertTriangle size="1.1em" className="mt-0.5 shrink-0" aria-hidden />
              Không ghi được: {x.reason}{x.hex ? ` — ${x.hex}` : ''}{x.moTa ? ` (${x.moTa})` : ''}</p>
            <div className="flex gap-3">
              {x.hex && <button className={`${NUT_PHU} flex-1`} onClick={() => { setTuChoi(a => a.filter(y => y.id !== x.id)); moHex(x.hex!); }}>Làm lại</button>}
              <button className={`${NUT_PHU} flex-1`} onClick={() => setTuChoi(a => a.filter(y => y.id !== x.id))}>Bỏ qua</button>
            </div>
          </div>
        ))}

        {cv && caChot && (
          <div className={`flex items-center justify-between gap-3 rounded-2xl border ${MAU.loi.vien} ${MAU.loi.nen} p-3`}>
            <p className={`flex items-center gap-2 text-base font-semibold ${MAU.loi.chu}`}><Users size="1.1em" aria-hidden /> Chưa chốt quân số {TEN_CA[caChot].toLowerCase()}</p>
            <button className={`${NUT_PHU} shrink-0`} onClick={() => setSheet({ loai: 'quanSo', ca: caChot })}>Chốt quân số</button>
          </div>
        )}
        {nhacXacNhan && (
          <div className={`flex items-center justify-between gap-3 rounded-2xl border ${MAU.ngung.vien} ${MAU.ngung.nen} p-3`}>
            <p className={`text-base font-semibold ${MAU.ngung.chu}`}>Xác nhận cuối ngày ({nhom.dangChay.length} hạng mục đang chạy)</p>
            <button className={`${NUT_PHU} shrink-0`} onClick={() => setSheet({ loai: 'xacNhan' })}>Xác nhận</button>
          </div>
        )}

      </header>

      {/* Tầng giữa: 3 tab có số — dính trên cùng khi cuộn */}
      <div className="sticky top-0 z-10 mx-auto max-w-3xl bg-[#f4f6fa]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+4px)] backdrop-blur">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1" role="tablist">
          {([['choNhan', 'Chờ nhận'], ['dangLam', 'Đang làm'], ['choGiao', 'Chờ giao']] as [Tab, string][]).map(([t, ten]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`min-h-14 rounded-xl px-1 text-base ${tab === t ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-700'}`}>
              {ten} <span className="tabular-nums">{soTab[t]}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-4 px-4">
        {!online && cvLuc && <p className={`flex items-center gap-2 ${CHU_PHU}`}><Wifi size="1em" aria-hidden /> Đang mất sóng — danh sách cập nhật lúc {hhmm(cvLuc)}{gioVN(cvLuc).ngay !== gioVN(now).ngay ? ` ngày ${gioVN(cvLuc).ngay.split('-').reverse().join('/')}` : ''}</p>}
        {taiLoi && <p className={`rounded-2xl ${MAU.loi.nen} p-3 text-base ${MAU.loi.chu}`} role="alert">{taiLoi}</p>}
        {!cv && !taiLoi && (online
          ? [0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white motion-reduce:animate-none" />)
          : <div className="space-y-3 rounded-2xl bg-white p-5"><p className="text-base text-slate-800">Cần có sóng lần đầu để tải việc của tổ.</p><button className={NUT_PHU} onClick={taiCv}>Thử lại</button></div>)}

        {cv && tab === 'dangLam' && (soTab.dangLam ? (<>
          {nhomEl('Đang chạy', nhom.dangChay, 'dangLam')}
          {nhomEl('Tạm ngưng', nhom.tamNgung, 'dangLam')}
          {nhomEl('Chưa bắt đầu', nhom.chuaBatDau, 'dangLam')}
        </>) : trong('Tổ chưa có việc đang làm.'))}
        {cv && tab === 'choNhan' && (soTab.choNhan ? nhomEl('Hàng giao tới tổ', cv.choNhan, 'choNhan') : trong('Chưa có hàng giao tới tổ.'))}
        {cv && tab === 'choGiao' && (soTab.choGiao ? nhomEl('Xong, chờ giao', cv.choGiao, 'choGiao') : (
          <div className="rounded-2xl bg-white p-6 text-center text-base text-slate-700">Không có hàng chờ giao.</div>
        ))}
      </main>

      {/* Tầng đáy (vùng ngón cái): dải người rảnh / hoàn tác + Quét phiếu */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-20 bg-gradient-to-t from-[#f4f6fa] via-[#f4f6fa] to-[#f4f6fa]/0 px-4 pb-2 pt-4 rmd:bottom-0 rmd:left-60 rmd:pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="mx-auto max-w-3xl space-y-2">
        {hienRanh && canChia && (
          <div className={`flex flex-wrap items-center gap-2 rounded-2xl border ${MAU.ngung.vien} ${MAU.ngung.nen} p-3`} aria-live="polite">
            <p className={`min-w-0 flex-1 text-base font-medium ${MAU.ngung.chu}`}>
              {(ranh ?? 0) > 0 ? `${ranh} người đang rảnh` : 'Có hạng mục chưa có người'}
            </p>
            <button className={NUT_PHU} onClick={() => chiaNguoi(chiaDeu(quanSo ?? 0, nhom.dangChay.map(khoaDong)))}>Chia đều</button>
            <button className={NUT_PHU} onClick={() => setSheet({ loai: 'chiaNguoi' })}>Chọn</button>
          </div>
        )}
        {hoanTac && (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-900 p-3 pl-4 text-white" aria-live="polite">
            <p className="min-w-0 flex-1 text-base">Đã ghi: {hoanTac.nhan}</p>
            <button className="min-h-14 shrink-0 rounded-xl px-3 text-base font-semibold text-amber-300 active:bg-white/10" onClick={() => huy(hoanTac.ids, hoanTac.nhan)}>Hoàn tác</button>
          </div>
        )}
        {/* Quét phiếu + Gõ mã cùng 1 hàng (trước 2 hàng — đáy chiếm gần 1/4 màn điện thoại) */}
        <div className="flex gap-3">
          <button className={NUT_CHINH} onClick={() => setSheet({ loai: 'quet' })}><ScanLine size="1.5em" aria-hidden /> Quét phiếu</button>
          <button className={`${NUT_PHU} h-16 shrink-0 px-5`} onClick={() => setSheet({ loai: 'goMa' })}>Gõ mã</button>
        </div>
        </div>
      </div>

      {/* Cửa sổ */}
      {sheet?.loai === 'quet' && !quetDeTrienKhai.current && <QuetQr onHex={h => moHex(h)} onGoMa={() => setSheet({ loai: 'goMa' })} onClose={() => setSheet(null)} />}
      {sheet?.loai === 'goMa' && toId && <GoMaSheet toId={toId} cv={cv} onHex={(h, ten) => moHex(h, ten ?? null)} onClose={() => setSheet(null)} />}
      {sheet?.loai === 'quanSo' && cv && (
        <QuanSoSheet ca={sheet.ca} sauDo={sheet.sau?.nhan}
          macDinh={cv.quanSo[sheet.ca] ?? cv.quanSoTruoc[sheet.ca] ?? cv.quanSo.chinh ?? 0}
          homQua={cv.quanSoTruoc[sheet.ca] ?? null}
          onChot={n => chotQuanSo(sheet.ca, n, sheet.sau?.chay)} onClose={() => setSheet(null)} />
      )}
      {sheet?.loai === 'batDau' && (
        <BatDauSheet r={sheet.r} tiepTuc={sheet.suKien === 'tiep_tuc'} quanSo={sheet.quanSo}
          dangChayKhac={nhom.dangChay.filter(x => khoaDong(x) !== khoaDong(sheet.r))}
          onBatDau={n => ghiBatDau(sheet.r, sheet.suKien, n)} onClose={() => setSheet(null)} />
      )}
      {sheet?.loai === 'tamNgung' && <TamNgungSheet r={sheet.r} onChon={ma => tamNgung(sheet.r, ma)} onClose={() => setSheet(null)} />}
      {sheet?.loai === 'giao' && (
        <GiaoSheet r={sheet.r} cheDo={sheet.cheDo} dm={dm} xuong={cv?.to.xuong ?? toHienTai?.xuong ?? null} anhBat={!!cv?.anhBat}
          onXacNhan={p => xongGiao(sheet.r, sheet.cheDo, p.soLuong, p.den, p.anh)} onClose={() => setSheet(null)} />
      )}
      {sheet?.loai === 'nhan' && cv && <NhanSheet hex={sheet.hex} ten={sheet.ten} cv={cv} dm={dm} onNhan={p => nhan(sheet.hex, p, sheet.ten)} onClose={() => setSheet(null)} />}
      {sheet?.loai === 'hex' && cv && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/40 rmd:items-center rmd:justify-center" onClick={() => setSheet(null)}>
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-[#f4f6fa] p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] rmd:max-w-3xl rmd:rounded-3xl" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Hạng mục ${sheet.hex}`}>
            <p className="mb-3 text-lg font-semibold text-slate-900">Hạng mục <span className="tabular-nums">{sheet.hex}</span> ở tổ</p>
            <ul className={`${KHOI} ${KE}`}>
              {dongHex.map(r => {
                const o = cv.dangLam.includes(r) ? 'dangLam' : cv.choNhan.includes(r) ? 'choNhan' : 'choGiao';
                return <XuongDong key={khoaDong(r)} r={r} now={now} tenCongDoan={tenCd(r.congDoanId)} gui={guiCua(r)}>{nutDong(r, o)}</XuongDong>;
              })}
            </ul>
            <div className="mt-3 flex gap-3">
              <button className={`${NUT_PHU} flex-1`} onClick={() => setSheet({ loai: 'nhan', hex: sheet.hex, ten: dongHex[0]?.tenHangMuc ?? null })}>Nhận thêm vào tổ</button>
              <button className={`${NUT_PHU} flex-1`} onClick={() => setSheet(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
      {sheet?.loai === 'tangCa' && cv && <TangCaSheet cv={cv} dangChay={nhom.dangChay} onKhai={khaiTangCa} onClose={() => setSheet(null)} />}
      {sheet?.loai === 'xacNhan' && cv && <XacNhanSheet cv={cv} dangChay={nhom.dangChay} anhBat={!!cv.anhBat} onXacNhan={xacNhan} onClose={() => setSheet(null)} />}
      {sheet?.loai === 'chiaNguoi' && <ChiaNguoiSheet dangChay={nhom.dangChay} quanSo={quanSo ?? 0} onLuu={chiaNguoi} onClose={() => setSheet(null)} />}
      {sheet?.loai === 'lichSu' && toId && <LichSuSheet toId={toId} onHuy={async (id, moTa) => { await huy([id], moTa); }} onClose={() => setSheet(null)} />}
      {sheet?.loai === 'chonTo' && phien && <ChonToSheet ds={phien.to} toId={toId} onChon={id => { setToId(id); setSheet(null); setHienRanh(false); }} onClose={() => setSheet(null)} />}
      {sheet?.loai === 'menu' && (
        <MenuSheet onClose={() => setSheet(null)} muc={[
          { ten: 'Lịch sử hôm nay', icon: 'lichsu', onClick: () => setSheet({ loai: 'lichSu' }) },
          { ten: 'Khai tăng ca', icon: 'tangca', onClick: () => setSheet({ loai: 'tangCa' }), phu: cv?.tangCa.length ? cv.tangCa.map(l => TEN_CA[l]).join(', ') : undefined },
          { ten: 'Xác nhận cuối ngày', icon: 'xacnhan', onClick: () => setSheet({ loai: 'xacNhan' }), phu: cv?.daXacNhanHomNay ? 'Đã xác nhận' : undefined },
          ...(ca ? [{ ten: `Chốt quân số ${TEN_CA[ca].toLowerCase()}`, icon: 'quanso' as const, onClick: () => setSheet({ loai: 'quanSo', ca }), phu: typeof quanSo === 'number' ? `${quanSo} người` : 'Chưa chốt' }] : []),
          // Sửa số người từng hạng mục bất cứ lúc nào (dải vàng chỉ hiện khi còn người rảnh / hạng mục chưa có người)
          ...(typeof quanSo === 'number' && nhom.dangChay.length ? [{ ten: 'Chia người cho hạng mục', icon: 'quanso' as const, onClick: () => setSheet({ loai: 'chiaNguoi' }),
            phu: `${nhom.dangChay.length} hạng mục đang chạy` }] : []),
          ...(laQuanLy ? [{ ten: 'Triển khai hạng mục', icon: 'trienkhai' as const, onClick: () => setSheet({ loai: 'trienKhai', hex: null }) }] : []),
          ...(laToNgoai && phien?.to.length ? [{ ten: 'Về tổ của tôi', icon: 'thoat' as const, onClick: () => { setSheet(null); veToCuaToi(); } }] : []),
          { ten: 'Làm mới', icon: 'lammoi', onClick: () => { setSheet(null); gui(); taiCv(); taiDm(); } },
        ]} />
      )}
      {sheetTrienKhai}
      <Toast text={toast} />
    </div>
  );
}
