import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Keyboard, LogOut, MoveRight, RefreshCw, UserRound, Wifi, WifiOff, X as XIcon } from 'lucide-react';
import { getToken } from '../../../services/userService';
import { xuongApi } from '../../../services/xuongApi';
import { authXuong } from '../../../services/xuongClock';
import { LoiLuuMay, type SuKienCho, type SuKienNhap } from '../../../services/xuongQueue';
import {
  coTram, xoaTram, hangDoiTram, doLechTram, tramApi, type BangTramMayChu, type CongNhanTram, type HangMucTram,
} from '../../../services/xuongTramApi';
import {
  docMaQuet, caChoLanQuet, daHetCa, ngayCa, vaoHang, raHang, raCa, vaoCa, hangCua, daVaoCa, xongHang,
  type BangTram, type NguoiTram, type LoaiCaTram,
} from '../../../utils/xuongTheNv';
import { hhmm } from '../../../services/xuongModel';
import DangNhapXuong from './DangNhapXuong';
import QuetQr from './QuetQr';
import { NUT_CHINH, NUT_PHU, MAU } from './xuongUi';
import { LogoAANgang, LogoAADayDu } from '../../LogoAA';

// ============================================================================
// MÀN TRẠM QUÉT (/xuong/tram — docs/designs/xuong-tram-quet.md, T4). Máy chung của tổ, để cố định ở xưởng.
//  quét thẻ NV → hiện tên + hàng đang làm, lần đầu trong ca = vào ca
//  quét phiếu PTHSP trong 20 giây → vào hàng (tự rời hàng cũ); tổ nhiều công đoạn → chạm chọn công đoạn
//  "Ra khỏi hàng" / "Ra ca" (nút lớn, hiện 20 giây sau khi quét thẻ)
// Máy quét mã vạch cắm USB / Bluetooth (gõ như bàn phím, kết thúc bằng Enter) hoặc camera. Mọi lần quét lưu hàng đợi
// IndexedDB trước rồi mới gửi; bảng "ai đang ở hàng nào" cập nhật ngay trên máy, tải lại máy chủ mỗi 30 giây và sau
// mỗi lô gửi được (R4).
// ============================================================================

const CHO_PHIEU_MS = 20_000;
/** Đã quét phiếu, chờ thẻ người khai — không đếm ngược trên màn, chỉ tự bỏ khi bỏ quên trạm */
const CHO_THE_MS = 120_000;
/** Nhóm làm chung lần trước theo hạng mục (trên máy trạm) */
const KHOA_NHOM = 'xuong_tram_nhom';
/** Màn chọn người làm chung: mỗi lần chạm gia hạn thêm */
const CHO_NHOM_MS = 60_000;
const TAI_LAI_MS = 30_000;
const KHOA_BANG = 'xuong_tram_bang';
const KHOA_CN = 'xuong_tram_cong_nhan';
const KHOA_CA = 'xuong_tram_ca_nguoi';

const docLs = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } };
const ghiLs = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };

let amThanh: AudioContext | null = null;
/** Bíp: cao ngắn = được, trầm dài = lỗi (xưởng ồn — kèm rung nếu máy có) */
function bip(ok: boolean) {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (C) {
      amThanh ??= new C();
      const o = amThanh.createOscillator();
      const g = amThanh.createGain();
      o.frequency.value = ok ? 1250 : 320;
      g.gain.value = 0.25;
      o.connect(g); g.connect(amThanh.destination);
      o.start(); o.stop(amThanh.currentTime + (ok ? 0.12 : 0.45));
    }
  } catch { /* máy không có âm thanh */ }
  navigator.vibrate?.(ok ? 60 : [120, 60, 120]);
}

type ThongBao = { loai: 'ok' | 'loi' | 'info'; chu: string } | null;
interface NguoiDangQuet extends NguoiTram { tenTo: string | null; toKhac: boolean; han: number }
interface CongDoanChon { id: string; ten: string }
interface Nhom {
  hex: string; ds: CongDoanChon[]; cd: string | null;
  /** Người khai (quét thẻ) */
  chinh: NguoiDangQuet;
  /** Người làm chung chạm chọn */
  chon: string[];
  han: number; tim: string;
  /** 'vao' = khai vào hàng; 'ra' = người khai đang ở hàng này quét lại phiếu → ra hàng / báo làm xong */
  che: 'vao' | 'ra';
}

/**
 * Chọn người làm chung một hạng mục: một người khai cho cả nhóm (mỗi lần chỉ một người quét). Người tổ đã vào ca
 * chưa ở hàng nào lên đầu, rồi người đang ở hàng khác (chọn = chuyển sang hàng này), rồi người chưa vào ca.
 */
function ChonNguoi({ nhom, now, board, tenHm, toId, congNhan, nhomTruoc, onDoi, onVao, onHuy, onRa, hm }: {
  nhom: Nhom; now: number; nhomTruoc: string[]; onRa: (xong: boolean) => void; hm: HangMucTram | null; board: BangTram; tenHm: (hex: string) => string | null; toId: number;
  congNhan: Map<string, CongNhanTram>; onDoi: (d: Partial<Nhom>) => void; onVao: () => void; onHuy: () => void;
}) {
  const tim = nhom.tim.trim().toLowerCase();
  // Nhóm lần trước ở hạng mục này (trừ người khai, người đã nghỉ việc) — lên đầu danh sách, chọn cả nhóm một chạm
  const truoc = nhomTruoc.filter(m => m !== nhom.chinh.mnv && congNhan.has(m));
  const laTruoc = new Set(truoc);
  const trenBang = new Set([...board.dangO.flatMap(h => h.nguoi.map(n => n.mnv)), ...board.chuaVaoHang.map(n => n.mnv)]);
  const ds = [...new Set([...[...congNhan.values()].filter(c => c.toId === toId).map(c => c.mnv), ...trenBang, ...nhom.chon])]
    .filter(m => m !== nhom.chinh.mnv)
    .map(m => {
      const h = hangCua(board, m);
      const oDay = !!h && h.hex === nhom.hex && h.congDoanId === nhom.cd;
      const hang = oDay ? 3 : board.chuaVaoHang.some(n => n.mnv === m) ? 0 : h ? 1 : 2;
      const trangThai = oDay ? 'đã ở hàng này' : h ? `đang ở ${h.tenHangMuc ?? h.hex}` : hang === 0 ? 'chưa ở hàng nào' : 'chưa quét thẻ vào ca';
      return { mnv: m, hoTen: congNhan.get(m)?.hoTen ?? m, hang, trangThai, oDay, khoa: oDay || hang === 2 };
    })
    // Người tổ khác chỉ hiện khi tìm theo tên / mã hoặc đã có trên bảng của trạm
    .filter(x => !tim || x.hoTen.toLowerCase().includes(tim) || x.mnv.toLowerCase().includes(tim))
    .sort((a, b) => Number(laTruoc.has(b.mnv)) - Number(laTruoc.has(a.mnv)) || a.hang - b.hang || a.hoTen.localeCompare(b.hoTen));
  // Tìm người tổ khác (mượn người) theo mã / tên khi gõ ≥ 2 ký tự
  const ngoai = tim.length >= 2 ? [...congNhan.values()].filter(c => c.toId !== toId && !ds.some(x => x.mnv === c.mnv)
    && c.mnv !== nhom.chinh.mnv && (c.hoTen.toLowerCase().includes(tim) || c.mnv.toLowerCase().includes(tim))).slice(0, 8) : [];
  const chon = new Set(nhom.chon);
  // Chọn được ngay: người đã vào ca, chưa ở hàng nào. Người đang làm hàng khác không hiện mặc định (chạm nhầm sẽ kéo
  // họ khỏi hàng đang chạy) — mở riêng "Chuyển người từ hàng khác" khi cả nhóm đổi hàng; quét thẻ người đó cũng chọn được
  const ranh = ds.filter(x => x.hang === 0 || (x.hang === 1 && chon.has(x.mnv)));
  const hangKhac = ds.filter(x => x.hang === 1 && !chon.has(x.mnv));
  const chuaVao = ds.filter(x => x.hang === 2);
  // Nhóm lần trước: chỉ người đang rảnh (không kéo người đang làm hàng khác)
  const truocChua = truoc.filter(m => !chon.has(m) && daVaoCa(board, m) && !hangCua(board, m));
  const truocVang = truoc.filter(m => !daVaoCa(board, m));
  const [moKhac, setMoKhac] = useState(false);
  const nutNguoi = (x: { mnv: string; hoTen: string; trangThai: string }, chuyen: boolean) => (
    <button key={x.mnv} onClick={() => bat(x.mnv)} aria-pressed={chon.has(x.mnv)}
      className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 text-left ${chon.has(x.mnv) ? 'border-slate-900 bg-slate-900 text-white'
        : chuyen ? 'border-amber-200 bg-amber-50 text-slate-900' : 'border-slate-200 bg-white text-slate-900'}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${chon.has(x.mnv) ? 'border-white' : 'border-slate-400'}`} aria-hidden>{chon.has(x.mnv) ? '✓' : ''}</span>
      <span className="min-w-0">
        <span className="block truncate text-lg font-medium">{x.hoTen}</span>
        <span className={`block truncate text-base ${chon.has(x.mnv) ? 'text-slate-200' : chuyen ? 'text-amber-800' : 'text-slate-600'}`}>
          {x.mnv} · {chuyen ? `${x.trangThai} — chọn = chuyển sang hàng này` : x.trangThai}</span>
      </span>
    </button>
  );
  const bat = (m: string) => onDoi({ chon: chon.has(m) ? nhom.chon.filter(x => x !== m) : [...nhom.chon, m] });
  const tenCd = nhom.ds.find(c => c.id === nhom.cd)?.ten;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base text-slate-600">{nhom.hex}{tenCd ? ` · ${tenCd}` : ''}</p>
          <p className="text-2xl font-semibold text-slate-900">{tenHm(nhom.hex) ?? nhom.hex}</p>
          <p className="mt-1 text-lg text-slate-800">Người khai: <b>{nhom.chinh.hoTen}</b></p>
        </div>
        <span className="text-base tabular-nums text-slate-500">{Math.max(0, Math.ceil((nhom.han - now) / 1000))}s</span>
      </div>
      {nhom.che === 'ra' && nhom.cd ? (() => {
        // Người khai đang ở hàng này: chọn sẵn cả nhóm đang ở, bỏ chọn ai còn ở lại
        const oHang = board.dangO.find(x => x.hex === nhom.hex && x.congDoanId === nhom.cd)?.nguoi ?? [];
        const so = 1 + nhom.chon.filter(m => oHang.some(x => x.mnv === m)).length;
        return (
          <>
            <p className="mt-3 text-lg font-semibold text-slate-900">Đang ở hàng này — ai ra? <span className="font-normal text-slate-600">(bỏ chọn người còn ở lại)</span></p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {oHang.filter(x => x.mnv !== nhom.chinh.mnv).map(x => nutNguoi({ ...x, trangThai: 'đang ở hàng này' }, false))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button className={`${NUT_CHINH} bg-emerald-700`} disabled={!hm || hm.conLam <= 0} onClick={() => onRa(true)}>
                Làm xong hết{hm ? ` ${soSet(hm.conLam, hm.dvt)}` : ''} — cả nhóm ra</button>
              <button className={`${NUT_PHU} h-16 text-lg`} onClick={() => onRa(false)}>Ra hàng, chưa xong — {so} người</button>
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-3">
              <button className="min-h-12 text-base font-medium text-slate-700 underline underline-offset-4" onClick={() => onDoi({ che: 'vao', chon: [] })}>Thêm người vào hàng này</button>
              <button className={NUT_PHU} onClick={onHuy}><XIcon size="1.25em" /> Huỷ</button>
            </div>
          </>
        );
      })() : !nhom.cd ? (
        <>
          <p className="mt-3 text-lg font-semibold text-slate-900">Chọn công đoạn</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {nhom.ds.map(c => <button key={c.id} className={NUT_CHINH} onClick={() => onDoi({ cd: c.id })}>{c.ten}</button>)}
          </div>
        </>
      ) : (
        <>
          {hm && hm.conLam <= 0 && hm.conNhan > 0 && (
            <p className="mt-3 rounded-2xl bg-sky-50 p-3 text-lg text-sky-900">Hàng chưa nhận: bấm "Vào hàng" là <b>Nhận đủ {soSet(hm.conNhan, hm.dvt)}</b> rồi vào hàng.</p>
          )}
          <p className="mt-3 text-lg font-semibold text-slate-900">Ai làm chung? <span className="font-normal text-slate-600">(chạm để chọn, hoặc người đó quét thẻ)</span></p>
          {truocChua.length > 0 && (
            <button className={`${NUT_PHU} mt-2 w-full justify-start text-left`} onClick={() => onDoi({ chon: [...nhom.chon, ...truocChua] })}>
              <span className="min-w-0 truncate">Chọn nhóm lần trước ({truocChua.length}): {truocChua.map(m => congNhan.get(m)?.hoTen ?? m).join(', ')}</span>
            </button>
          )}
          {truocVang.length > 0 && (
            <p className="mt-2 text-base text-amber-700">Chưa quét thẻ vào ca: {truocVang.map(m => congNhan.get(m)?.hoTen ?? m).join(', ')} — tự quét thẻ rồi mới chọn được.</p>
          )}
          <input value={nhom.tim} onChange={e => onDoi({ tim: e.target.value })} placeholder="Tìm tên / mã NV (cả người tổ khác)"
            className="mt-2 h-14 w-full rounded-2xl border border-slate-300 px-4 text-lg" aria-label="Tìm người làm chung" />
          <div className="mt-3 grid max-h-[45dvh] gap-2 overflow-y-auto sm:grid-cols-2">
            {ranh.length === 0 && (
              <p className="rounded-2xl bg-sky-50 p-4 text-lg text-sky-900 sm:col-span-2">
                Không có ai đang rảnh (đã vào ca, chưa ở hàng nào). Người làm chung <b>quét thẻ ngay tại trạm</b> để vào nhóm — hoặc bấm "Vào hàng" nếu làm một mình.
              </p>
            )}
            {ranh.map(x => nutNguoi(x, false))}
            {moKhac && hangKhac.map(x => nutNguoi(x, true))}
          </div>
          {hangKhac.length > 0 && (
            <button className="mt-2 min-h-12 text-base font-medium text-slate-700 underline underline-offset-4" onClick={() => setMoKhac(v => !v)}>
              {moKhac ? 'Ẩn người đang làm hàng khác' : `Chuyển người từ hàng khác (${hangKhac.length})`}
            </button>
          )}
          {chuaVao.length + ngoai.length > 0 && (
            <p className="mt-3 text-base text-slate-600">
              Chưa quét thẻ vào ca ({chuaVao.length + ngoai.length}): {[...chuaVao, ...ngoai].map(x => `${x.hoTen} (${x.mnv})`).slice(0, 12).join(', ')}
              {chuaVao.length + ngoai.length > 12 ? '…' : ''} — quét thẻ tại trạm để được chọn.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr]">
            <button className={NUT_CHINH} onClick={onVao}>Vào hàng — {1 + nhom.chon.length} người</button>
            <button className={`${NUT_PHU} h-16 text-lg`} onClick={onHuy}><XIcon size="1.25em" /> Huỷ</button>
          </div>
          {/* Hàng đã nhận, mọi người đã rời (tạm ngưng) mới biết là xong: ghi Xong hết, không cần vào hàng */}
          {hm && hm.conLam > 0 && !board.dangO.some(x => x.hex === nhom.hex && x.congDoanId === nhom.cd) && (
            <button className="mt-3 min-h-12 text-base font-medium text-emerald-800 underline underline-offset-4" onClick={() => onRa(true)}>
              Hàng này đã làm xong? Ghi Xong hết {soSet(hm.conLam, hm.dvt)} (không vào hàng)
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Áp các lần quét chưa gửi lên bảng của máy chủ (bảng máy chủ chưa có chúng) */
function apDungCho(b: BangTram, cho: SuKienCho[], ten: (mnv: string) => string, tenHm: (hex: string) => string | null): BangTram {
  let x = b;
  for (const e of cho) {
    const mnv = String(e.duLieu?.mnv ?? '');
    if (!mnv) continue;
    const n = { mnv, hoTen: ten(mnv) };
    if (e.loai === 'vao_ca') x = vaoCa(x, n);
    else if (e.loai === 'nguoi_vao' && e.hex && e.congDoanId) x = vaoHang(x, n, { hex: e.hex, congDoanId: e.congDoanId, tenHangMuc: tenHm(e.hex) });
    else if (e.loai === 'nguoi_ra') x = raHang(x, n);
    else if (e.loai === 'ra_ca') x = raCa(x, mnv);
    else if (e.loai === 'hoan_thanh' && e.hex && e.congDoanId) x = xongHang(x, e.hex, e.congDoanId);
  }
  return x;
}

/** Số còn nhận / còn làm sau các lần Nhận đủ / Xong hết chưa gửi */
function hangMucSauCho(ds: HangMucTram[], cho: SuKienCho[]): HangMucTram[] {
  return ds.map(h => {
    let x = h;
    for (const e of cho) {
      if (e.hex !== h.hex || e.congDoanId !== h.congDoanId) continue;
      if (e.loai === 'nhan') x = { ...x, conLam: x.conLam + x.conNhan, conNhan: 0 };
      if (e.loai === 'hoan_thanh') x = { ...x, conLam: 0 };
    }
    return x;
  }).filter(h => h.conLam > 0 || h.conNhan > 0);
}
const soSet = (n: number, dvt: string | null) => `${Number(n.toFixed(3)).toLocaleString('vi-VN')} ${dvt || 'SET'}`;

export default function TramQuet() {
  const [daCoTram, setDaCoTram] = useState(coTram);
  if (!daCoTram) return <DangKyTram onXong={() => setDaCoTram(true)} />;
  return <ManTram onDangKyLai={() => { xoaTram(); setDaCoTram(false); }} />;
}

// ---------------------------------------------------------------------------
// Màn trạm
// ---------------------------------------------------------------------------
function ManTram({ onDangKyLai }: { onDangKyLai: () => void }) {
  const [bang, setBang] = useState<BangTramMayChu | null>(() => docLs<BangTramMayChu>(KHOA_BANG));
  const [cho, setCho] = useState<SuKienCho[]>([]);
  const [congNhan, setCongNhan] = useState<Map<string, CongNhanTram>>(() => new Map((docLs<CongNhanTram[]>(KHOA_CN) ?? []).map(c => [c.mnv, c])));
  const [nguoi, setNguoi] = useState<NguoiDangQuet | null>(null);
  // Quét phiếu trước: chờ người khai quét thẻ
  const [phieuCho, setPhieuCho] = useState<{ hex: string; ds: CongDoanChon[]; han: number } | null>(null);
  // Đã có phiếu + người khai: chọn công đoạn (nếu nhiều) và người làm chung rồi bấm "Vào hàng"
  const [nhom, setNhom] = useState<Nhom | null>(null);
  const [thongBao, setThongBao] = useState<ThongBao>(null);
  const [mang, setMang] = useState<'ok' | 'mat' | 'dang_ky_lai'>('ok');
  const [camera, setCamera] = useState(false);
  const [goMa, setGoMa] = useState(false);
  const [now, setNow] = useState(Date.now());
  const caNguoi = useRef<Record<string, { ngay: string; loaiCa: LoaiCaTram }>>(docLs(KHOA_CA) ?? {});

  const tenCua = useCallback((mnv: string) => congNhan.get(mnv)?.hoTen ?? mnv, [congNhan]);
  // Hàm gửi / tải chạy theo hẹn giờ: đọc tên qua ref để không khởi động lại hẹn giờ mỗi khi danh sách công nhân đổi
  const tenRef = useRef(tenCua);
  tenRef.current = tenCua;
  const tenHm = useCallback((hex: string) => bang?.hangMuc.find(h => h.hex === hex)?.tenHangMuc
    ?? bang?.dangO.find(h => h.hex === hex)?.tenHangMuc ?? null, [bang]);
  const hangMuc = useMemo(() => hangMucSauCho(bang?.hangMuc ?? [], cho), [bang, cho]);
  const hmCua = useCallback((hex: string, cd: string | null) => hangMuc.find(h => h.hex === hex && h.congDoanId === cd) ?? null, [hangMuc]);
  const board: BangTram = useMemo(
    () => apDungCho({ dangO: bang?.dangO ?? [], chuaVaoHang: bang?.chuaVaoHang ?? [] }, cho, tenCua, tenHm),
    [bang, cho, tenCua, tenHm]);

  const baoTin = useCallback((loai: 'ok' | 'loi' | 'info', chu: string) => {
    setThongBao({ loai, chu });
    if (loai !== 'info') bip(loai === 'ok');
  }, []);

  // ---- Tải bảng / danh sách công nhân, gửi hàng đợi ----
  const taiBang = useCallback(async () => {
    const r = await tramApi.bang();
    if (r.ok) { setBang(r.data); ghiLs(KHOA_BANG, r.data); setMang('ok'); }
    else if (r.status === 401) setMang('dang_ky_lai');
    else if (r.status === 0) setMang('mat');
    setCho(await hangDoiTram.danhSachCho().catch(() => []));
  }, []);
  const gui = useCallback(async () => {
    const kq = await hangDoiTram.guiHangDoi();
    for (const x of kq.tuChoi) baoTin('loi', `${tenRef.current(String(x.suKien?.duLieu?.mnv ?? ''))}: ${x.reason}`);
    if (kq.loi === 'dang_nhap_lai') setMang('dang_ky_lai');
    else if (kq.loi === 'mat_mang') setMang('mat');
    if (kq.daGui > 0 || kq.tuChoi.length) await taiBang();
    else setCho(await hangDoiTram.danhSachCho().catch(() => []));
  }, [baoTin, taiBang]);

  useEffect(() => {
    void doLechTram();
    void taiBang().then(gui);
    void tramApi.congNhan().then(r => {
      if (r.ok) { setCongNhan(new Map(r.data.congNhan.map(c => [c.mnv, c]))); ghiLs(KHOA_CN, r.data.congNhan); }
    });
    const t1 = setInterval(() => { void gui().then(taiBang); }, TAI_LAI_MS);
    const t2 = setInterval(() => setNow(Date.now()), 1000);
    const t3 = setInterval(() => void tramApi.congNhan().then(r => {
      if (r.ok) { setCongNhan(new Map(r.data.congNhan.map(c => [c.mnv, c]))); ghiLs(KHOA_CN, r.data.congNhan); }
    }), 30 * 60_000);
    const coMang = () => void gui();
    window.addEventListener('online', coMang);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); window.removeEventListener('online', coMang); };
  }, [gui, taiBang]);

  const ghi = useCallback(async (evs: SuKienNhap[]): Promise<boolean> => {
    try {
      for (const e of evs) await hangDoiTram.themSuKien(e, null);
    } catch (e) {
      baoTin('loi', e instanceof LoiLuuMay ? e.message : 'Chưa lưu được trên máy');
      return false;
    }
    setCho(await hangDoiTram.danhSachCho().catch(() => []));
    void gui();
    return true;
  }, [baoTin, gui]);

  /** Nhóm mới sau khi có phiếu + người khai. Người khai đang ở chính hàng đó → màn ra hàng (chọn sẵn cả nhóm đang ở) */
  const taoNhom = useCallback((hex: string, ds: CongDoanChon[], chinh: NguoiDangQuet): Nhom => {
    const h = hangCua(board, chinh.mnv);
    const base = { hex, ds, chinh, han: Date.now() + CHO_NHOM_MS, tim: '' };
    if (h && h.hex === hex && ds.some(c => c.id === h.congDoanId)) {
      return { ...base, cd: h.congDoanId, che: 'ra', chon: h.nguoi.map(x => x.mnv).filter(m => m !== chinh.mnv) };
    }
    return { ...base, cd: ds.length === 1 ? ds[0].id : null, che: 'vao', chon: [] };
  }, [board]);

  // ---- Quét thẻ ----
  const quetThe = useCallback(async (mnv: string) => {
    if (!bang) { baoTin('loi', 'Trạm chưa tải được dữ liệu tổ — kiểm tra sóng'); return; }
    const cn = congNhan.get(mnv)!;
    const n: NguoiDangQuet = {
      mnv, hoTen: cn.hoTen, tenTo: cn.tenTo, toKhac: cn.toId !== null && cn.toId !== bang.to.id, han: Date.now() + CHO_PHIEU_MS,
    };
    // Đang chọn người làm chung: quét thẻ thêm = chọn thêm người đó
    if (nhom && nhom.han >= Date.now()) {
      // Người đó tự quét thẻ (có mặt thật): chưa vào ca thì ghi vào ca, rồi chọn luôn vào nhóm
      if (!daVaoCa(board, mnv)) {
        const ca = caChoLanQuet(Date.now(), bang.lichCa, bang.tangCa);
        caNguoi.current[mnv] = { ngay: ngayCa(Date.now()), loaiCa: ca.loaiCa };
        ghiLs(KHOA_CA, caNguoi.current);
        if (!(await ghi([{ loai: 'vao_ca', toId: bang.to.id, duLieu: { loaiCa: ca.loaiCa, mnv, nguoi: [{ mnv, luc: ca.luc }], ...(ca.ngoaiCa ? { ngoaiCa: true } : {}) } }]))) return;
      }
      if (mnv !== nhom.chinh.mnv && !nhom.chon.includes(mnv)) setNhom({ ...nhom, chon: [...nhom.chon, mnv], han: Date.now() + CHO_NHOM_MS });
      baoTin('ok', `Thêm ${n.hoTen}`);
      return;
    }
    const coPhieu = phieuCho && phieuCho.han >= Date.now() ? phieuCho : null;
    // Hết ca (từ 15:45 theo lịch ca, không có tăng ca đã khai đang / sắp mở): quét thẻ = ra ca luôn, không cần bấm nút
    if (!coPhieu && daVaoCa(board, mnv) && daHetCa(Date.now(), bang.lichCa, bang.tangCa)) {
      const h = hangCua(board, mnv);
      const daLuu = caNguoi.current[mnv];
      const loaiCa = daLuu && daLuu.ngay === ngayCa(Date.now()) ? daLuu.loaiCa : 'chinh';
      const evs: SuKienNhap[] = [];
      if (h) evs.push({ loai: 'nguoi_ra', toId: bang.to.id, hex: h.hex, congDoanId: h.congDoanId, duLieu: { mnv } });
      evs.push({ loai: 'ra_ca', toId: bang.to.id, duLieu: { loaiCa, mnv, nguoi: [{ mnv }] } });
      if (!(await ghi(evs))) return;
      setNguoi(null);
      baoTin('ok', `${n.hoTen} — ra ca ${hhmm(Date.now())}${h ? ` (rời ${h.tenHangMuc ?? h.hex})` : ''}`);
      return;
    }
    if (coPhieu) {
      setPhieuCho(null); setNguoi(null);
      setNhom(taoNhom(coPhieu.hex, coPhieu.ds, n));
    } else setNguoi(n);
    if (daVaoCa(board, mnv)) {
      const h = hangCua(board, mnv);
      if (coPhieu) baoTin('ok', `${n.hoTen} khai — chọn người làm chung`);
      else baoTin('ok', h ? `${n.hoTen} — đang ở ${h.tenHangMuc ?? h.hex}` : `${n.hoTen} — chưa ở hàng nào. Quét phiếu để vào hàng.`);
      return;
    }
    // Lần quét đầu trong ca = vào ca
    const ca = caChoLanQuet(Date.now(), bang.lichCa, bang.tangCa);
    caNguoi.current[mnv] = { ngay: ngayCa(Date.now()), loaiCa: ca.loaiCa };
    ghiLs(KHOA_CA, caNguoi.current);
    const ok = await ghi([{
      loai: 'vao_ca', toId: bang.to.id,
      duLieu: { loaiCa: ca.loaiCa, mnv, nguoi: [{ mnv, luc: ca.luc }], ...(ca.ngoaiCa ? { ngoaiCa: true } : {}), ...(ca.som ? { quetLuc: Date.now() } : {}) },
    }]);
    if (!ok) return;
    const tiep = coPhieu ? 'Chọn người làm chung.' : 'Quét phiếu để vào hàng.';
    if (ca.ngoaiCa) baoTin('loi', `${n.hoTen} — ngoài giờ ca: báo tổ trưởng khai tăng ca. Đã ghi vào ca. ${tiep}`);
    else baoTin('ok', `${n.hoTen} — vào ca ${ca.som ? `từ ${hhmm(ca.batDau)}` : hhmm(Date.now())}. ${tiep}`);
  }, [bang, board, congNhan, ghi, baoTin, nhom, phieuCho, taoNhom]);

  // ---- Vào hàng theo nhóm: người khai + người làm chung ----

  // ---- Ra hàng theo nhóm (làm xong / tạm rời) ----
  const raHangNhom = useCallback(async (xong: boolean) => {
    if (!bang || !nhom || !nhom.cd) return;
    const { hex, cd, chinh } = nhom;
    if (xong) {
      const hm = hmCua(hex, cd);
      if (!hm || hm.conLam <= 0) { baoTin('loi', 'Hạng mục không còn gì để Xong'); return; }
      if (!(await ghi([{ loai: 'hoan_thanh', toId: bang.to.id, hex, congDoanId: cd, soLuong: hm.conLam, duLieu: { mnv: chinh.mnv, xongHet: true } }]))) return;
      setNhom(null);
      baoTin('ok', `Xong hết ${soSet(hm.conLam, hm.dvt)} · ${tenHm(hex) ?? hex} — cả nhóm ra hàng. Tổ trưởng chỉ còn bấm Giao.`);
      return;
    }
    const h = board.dangO.find(x => x.hex === hex && x.congDoanId === cd);
    const oHang = new Set(h?.nguoi.map(x => x.mnv) ?? []);
    const ds = [chinh.mnv, ...nhom.chon].filter(m => oHang.has(m));
    const evs: SuKienNhap[] = ds.map(mnv => ({
      loai: 'nguoi_ra', toId: bang.to.id, hex, congDoanId: cd,
      duLieu: { mnv, ...(mnv === chinh.mnv ? {} : { khaiBoi: chinh.mnv }) },
    }));
    if (!evs.length || !(await ghi(evs))) return;
    setNhom(null);
    baoTin('ok', `${ds.length} người ra khỏi ${tenHm(hex) ?? hex}`);
  }, [bang, nhom, board, ghi, baoTin, tenHm, hmCua]);

  const vaoHangNhom = useCallback(async () => {
    if (!bang || !nhom || !nhom.cd) return;
    const { hex, cd, chinh } = nhom;
    let b = board;
    const evs: SuKienNhap[] = [];
    const daO: string[] = [];
    const ca = caChoLanQuet(Date.now(), bang.lichCa, bang.tangCa);
    // Hàng chưa nhận (không còn gì đang làm): Nhận đủ số giao tới trước — máy chủ tự tính số, không vượt
    const hm = hmCua(hex, cd);
    const nhanDu = hm && hm.conLam <= 0 && hm.conNhan > 0 ? hm : null;
    if (nhanDu) evs.push({ loai: 'nhan', toId: bang.to.id, hex, congDoanId: cd, soLuong: nhanDu.conNhan, duLieu: { mnv: chinh.mnv, nhanDu: true } });
    for (const mnv of [chinh.mnv, ...nhom.chon]) {
      const n = { mnv, hoTen: tenCua(mnv) };
      // Người khai ghi hộ người làm chung: gắn mã người khai để đối chiếu (máy chấm công hằng tuần — R2)
      const khai = mnv === chinh.mnv ? {} : { khaiBoi: chinh.mnv };
      if (!daVaoCa(b, mnv)) {
        // Mỗi người tự quét thẻ đầu ca: người làm chung chưa vào ca thì không ghi hộ (màn chọn đã khoá người đó)
        if (mnv !== chinh.mnv) continue;
        evs.push({ loai: 'vao_ca', toId: bang.to.id, duLieu: { loaiCa: ca.loaiCa, mnv, nguoi: [{ mnv, luc: ca.luc }], ...(ca.ngoaiCa ? { ngoaiCa: true } : {}) } });
        caNguoi.current[mnv] = { ngay: ngayCa(Date.now()), loaiCa: ca.loaiCa };
        b = vaoCa(b, n);
      }
      const cu = hangCua(b, mnv);
      if (cu && cu.hex === hex && cu.congDoanId === cd) { daO.push(n.hoTen); continue; }
      // Đang ở hàng khác: rời hàng cũ cùng thời điểm
      if (cu) evs.push({ loai: 'nguoi_ra', toId: bang.to.id, hex: cu.hex, congDoanId: cu.congDoanId, duLieu: { mnv, ...khai } });
      evs.push({ loai: 'nguoi_vao', toId: bang.to.id, hex, congDoanId: cd, duLieu: { mnv, ...khai } });
      b = vaoHang(b, n, { hex, congDoanId: cd, tenHangMuc: tenHm(hex) });
    }
    ghiLs(KHOA_CA, caNguoi.current);
    if (evs.length && !(await ghi(evs))) return;
    const ds = docLs<Record<string, string[]>>(KHOA_NHOM) ?? {};
    ds[`${hex}|${cd}`] = [chinh.mnv, ...nhom.chon];
    // Giữ 200 hạng mục gần nhất
    ghiLs(KHOA_NHOM, Object.fromEntries(Object.entries(ds).slice(-200)));
    setNhom(null);
    const soVao = 1 + nhom.chon.length - daO.length;
    baoTin('ok', `${nhanDu ? `Nhận ${soSet(nhanDu.conNhan, nhanDu.dvt)} · ` : ''}${soVao} người → ${tenHm(hex) ?? hex}${daO.length ? ` (${daO.join(', ')} đã ở hàng này)` : ''}`);
  }, [bang, nhom, board, ghi, baoTin, tenHm, tenCua, hmCua]);

  const quetPhieu = useCallback((hex: string) => {
    if (!bang) return;
    const tenCd = new Map(bang.congDoan.map(c => [c.id, c.ten]));
    const lam = hangMuc.filter(h => h.hex === hex);
    // Ưu tiên công đoạn mặc định của trạm
    const uuTien = lam.filter(h => bang.tram.congDoan.includes(h.congDoanId));
    const ds = (uuTien.length ? uuTien : lam).map(h => ({ id: h.congDoanId, ten: tenCd.get(h.congDoanId) ?? h.congDoanId }));
    if (!ds.length) { baoTin('loi', `Hạng mục ${hex} chưa được Nhận (hoặc đã xong hết) — tổ trưởng bấm Nhận trên app MRA rồi quét lại`); return; }
    // Đã quét thẻ trước (cách cũ): mở thẳng màn chọn người làm chung
    if (nguoi && nguoi.han >= Date.now()) {
      setNhom(taoNhom(hex, ds, nguoi));
      setNguoi(null);
      baoTin('ok', `${tenHm(hex) ?? hex} — chọn người làm chung`);
      return;
    }
    setNhom(null);
    setPhieuCho({ hex, ds, han: Date.now() + CHO_THE_MS });
    baoTin('ok', `${tenHm(hex) ?? hex} — người khai quét thẻ`);
  }, [bang, nguoi, baoTin, tenHm, taoNhom, hangMuc]);

  const quet = useCallback((raw: string) => {
    setCamera(false); setGoMa(false);
    const r = docMaQuet(raw, m => congNhan.has(m));
    if (r.loai === 'the' && !r.biet) { if (!nhom) setNguoi(null); baoTin('loi', `Thẻ ${r.mnv} chưa có trong danh sách — báo tổ trưởng`); return; }
    if (r.loai === 'the') { void quetThe(r.mnv); return; }
    if (r.loai === 'phieu') { quetPhieu(r.hex); return; }
    baoTin('loi', 'Không đọc được mã — quét lại thẻ hoặc phiếu');
  }, [congNhan, quetThe, quetPhieu, baoTin, nhom]);

  // ---- Ra khỏi hàng / Ra ca ----
  const raKhoiHang = useCallback(async () => {
    if (!bang || !nguoi) return;
    const h = hangCua(board, nguoi.mnv);
    if (!h) return;
    if (!(await ghi([{ loai: 'nguoi_ra', toId: bang.to.id, hex: h.hex, congDoanId: h.congDoanId, duLieu: { mnv: nguoi.mnv } }]))) return;
    baoTin('ok', `${nguoi.hoTen} ra khỏi ${h.tenHangMuc ?? h.hex}`);
    setNguoi(null);
  }, [bang, nguoi, board, ghi, baoTin]);

  const raCaNguoi = useCallback(async () => {
    if (!bang || !nguoi) return;
    const h = hangCua(board, nguoi.mnv);
    const daLuu = caNguoi.current[nguoi.mnv];
    const loaiCa = daLuu && daLuu.ngay === ngayCa(Date.now()) ? daLuu.loaiCa : caChoLanQuet(Date.now(), bang.lichCa, bang.tangCa).loaiCa;
    const evs: SuKienNhap[] = [];
    if (h) evs.push({ loai: 'nguoi_ra', toId: bang.to.id, hex: h.hex, congDoanId: h.congDoanId, duLieu: { mnv: nguoi.mnv } });
    evs.push({ loai: 'ra_ca', toId: bang.to.id, duLieu: { loaiCa, mnv: nguoi.mnv, nguoi: [{ mnv: nguoi.mnv }] } });
    if (!(await ghi(evs))) return;
    baoTin('ok', `${nguoi.hoTen} ra ca ${hhmm(Date.now())}`);
    setNguoi(null);
  }, [bang, nguoi, board, ghi, baoTin]);

  // ---- Máy quét gõ như bàn phím (kết thúc bằng Enter) ----
  const dem = useRef('');
  const lanCuoiPhim = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const n = Date.now();
      if (n - lanCuoiPhim.current > 300) dem.current = '';
      lanCuoiPhim.current = n;
      if (e.key === 'Enter') { const v = dem.current; dem.current = ''; if (v.trim()) quet(v); return; }
      if (e.key.length === 1) dem.current += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quet]);

  // Hết giờ chờ: bỏ người / phiếu / nhóm đang khai
  useEffect(() => {
    if (nguoi && nguoi.han < now) setNguoi(null);
    if (phieuCho && phieuCho.han < now) setPhieuCho(null);
    if (nhom && nhom.han < now) { setNhom(null); baoTin('info', 'Hết giờ chọn người — quét lại phiếu'); }
  }, [now, nguoi, phieuCho, nhom, baoTin]);
  const giaHanNhom = (doi: Partial<Nhom>) => setNhom(x => (x ? { ...x, ...doi, han: Date.now() + CHO_NHOM_MS } : x));

  if (mang === 'dang_ky_lai') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-white p-6 text-center">
        <LogoAADayDu className="h-24 w-auto" />
        <p className="text-2xl font-semibold text-slate-900">Trạm cần đăng ký lại</p>
        <p className="text-lg text-slate-600">Trạm đã bị thu hồi hoặc lâu không dùng. Nhờ quản lý / tổ trưởng đăng ký lại máy này.</p>
        <button className={`${NUT_CHINH} max-w-sm`} onClick={onDangKyLai}>Đăng ký lại</button>
      </div>
    );
  }

  const hangNguoi = nguoi ? hangCua(board, nguoi.mnv) : null;
  const conGiay = nguoi ? Math.max(0, Math.ceil((nguoi.han - now) / 1000)) : 0;
  const mau = thongBao?.loai === 'ok' ? MAU.chay : thongBao?.loai === 'loi' ? MAU.loi : MAU.cho;

  return (
    <div className="flex min-h-dvh flex-col bg-[#f4f6fa]">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <LogoAANgang co="vua" className="mb-1" />
          <p className="truncate text-xl font-semibold text-slate-900">Trạm {bang?.to.ten ?? '…'}{bang?.tram.ten ? ` · ${bang.tram.ten}` : ''}</p>
          <p className="text-base text-slate-600">{bang?.to.xuong ?? ''} · {hhmm(now)}{cho.length ? ` · ${cho.length} lượt chờ gửi` : ''}</p>
        </div>
        <span className={`flex items-center gap-1 text-base ${mang === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
          {mang === 'ok' ? <Wifi size="1.25em" aria-hidden /> : <WifiOff size="1.25em" aria-hidden />}{mang === 'ok' ? 'Có sóng' : 'Mất sóng — vẫn quét được'}
        </span>
        <button className={NUT_PHU} onClick={() => void gui().then(taiBang)} aria-label="Tải lại"><RefreshCw size="1.25em" /></button>
      </header>

      {bang && bang.cheDo !== 'tram' && (
        <p className={`px-4 py-2 text-base ${bang.cheDo === 'cu' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>
          {bang.cheDo === 'cu'
            ? 'Tổ đang chạy cách cũ: lượt quét được lưu nhưng chưa tính giờ công (quản lý bật chế độ trạm ở Setup).'
            : 'Tuần chạy song song: tổ trưởng vẫn bấm như cũ, số của trạm chỉ dùng để so khớp.'}
        </p>
      )}

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Bên trái: người vừa quét + hành động */}
        <section className="flex flex-col gap-4" aria-label="Quét">
          <div className={`rounded-2xl border p-4 ${mau.nen} ${mau.vien} ${(nhom || phieuCho) && thongBao?.loai !== 'loi' ? 'hidden' : ''}`} aria-live="assertive">
            <p className={`text-xl font-semibold ${mau.chu}`}>{thongBao?.chu ?? 'Quét phiếu hạng mục, rồi quét thẻ của bạn'}</p>
          </div>

          {phieuCho && !nhom && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-base text-slate-600">Phiếu {phieuCho.hex}</p>
              <p className="text-2xl font-semibold text-slate-900">{tenHm(phieuCho.hex) ?? phieuCho.hex}</p>
              {phieuCho.ds.every(c => (hmCua(phieuCho.hex, c.id)?.conLam ?? 0) <= 0) && (
                <p className="mt-2 text-lg text-sky-800">Hàng chưa nhận — vào hàng thì trạm Nhận đủ {soSet(hmCua(phieuCho.hex, phieuCho.ds[0].id)?.conNhan ?? 0, hmCua(phieuCho.hex, phieuCho.ds[0].id)?.dvt ?? null)}</p>
              )}
              <p className="mt-3 text-2xl font-semibold text-emerald-700">Quét thẻ của bạn</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <button className={NUT_CHINH} onClick={() => setCamera(true)}><Camera size="1.25em" /> Quét thẻ bằng camera</button>
                <button className={`${NUT_PHU} h-16 text-lg`} onClick={() => setGoMa(true)}><Keyboard size="1.25em" /> Gõ mã thẻ</button>
                <button className={`${NUT_PHU} h-16 text-lg`} onClick={() => setPhieuCho(null)}><XIcon size="1.25em" /> Huỷ</button>
              </div>
            </div>
          )}
          {nhom && bang && (
            <ChonNguoi nhom={nhom} now={now} board={board} tenHm={tenHm} toId={bang.to.id}
              nhomTruoc={nhom.cd ? (docLs<Record<string, string[]>>(KHOA_NHOM) ?? {})[`${nhom.hex}|${nhom.cd}`] ?? [] : []}
              congNhan={congNhan} onDoi={giaHanNhom} onVao={() => void vaoHangNhom()} onHuy={() => setNhom(null)}
              onRa={x => void raHangNhom(x)} hm={hmCua(nhom.hex, nhom.cd)} />
          )}
          {nhom || phieuCho ? null : nguoi ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <UserRound size="2em" className="shrink-0 text-slate-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-semibold text-slate-900">{nguoi.hoTen}</p>
                  <p className="text-base text-slate-600">{nguoi.mnv}{nguoi.toKhac ? ` · Người tổ ${nguoi.tenTo ?? 'khác'}` : ''}</p>
                  <p className="mt-1 text-lg text-slate-800">{hangNguoi ? <>Đang ở: <b>{hangNguoi.tenHangMuc ?? hangNguoi.hex}</b></> : 'Chưa ở hàng nào'}</p>
                </div>
                <span className="text-base tabular-nums text-slate-500" aria-label={`Còn ${conGiay} giây`}>{conGiay}s</span>
              </div>
              {(
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {hangNguoi && <button className={NUT_CHINH} onClick={() => void raKhoiHang()}><MoveRight size="1.25em" /> Ra khỏi hàng</button>}
                  <button className={`${NUT_PHU} h-16 text-lg`} onClick={() => void raCaNguoi()}><LogOut size="1.25em" /> Ra ca</button>
                  <button className={`${NUT_PHU} h-16 text-lg`} onClick={() => setNguoi(null)}><XIcon size="1.25em" /> Xong</button>
                </div>
              )}
              <p className="mt-3 text-base text-slate-600">Quét phiếu PTHSP để vào hàng (tự rời hàng đang làm).</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button className={NUT_CHINH} onClick={() => setCamera(true)}><Camera size="1.25em" /> Quét bằng camera</button>
              <button className={`${NUT_PHU} h-16 text-lg`} onClick={() => setGoMa(true)}><Keyboard size="1.25em" /> Gõ mã</button>
            </div>
          )}
          {nguoi && !nhom && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button className={`${NUT_PHU} h-16 text-lg`} onClick={() => setCamera(true)}><Camera size="1.25em" /> Quét phiếu bằng camera</button>
              <button className={`${NUT_PHU} h-16 text-lg`} onClick={() => setGoMa(true)}><Keyboard size="1.25em" /> Gõ mã phiếu</button>
            </div>
          )}
        </section>

        {/* Bên phải: ai đang ở hàng nào */}
        <section className="flex flex-col gap-3" aria-label="Ai đang ở hàng nào">
          <h2 className="text-lg font-semibold text-slate-900">Ai đang ở hàng nào</h2>
          {board.dangO.length === 0 && <p className="rounded-2xl bg-white p-4 text-base text-slate-600">Chưa ai ở hàng nào.</p>}
          {board.dangO.map(h => (
            <div key={`${h.hex}|${h.congDoanId}`} className="rounded-2xl bg-white p-4">
              <p className="text-lg font-semibold text-slate-900">{h.tenHangMuc ?? h.hex}</p>
              <p className="text-base text-slate-600">{h.hex} · {bang?.congDoan.find(c => c.id === h.congDoanId)?.ten ?? h.congDoanId} · {h.nguoi.length} người</p>
              <p className="mt-1 text-base text-slate-800">{h.nguoi.map(n => n.hoTen).join(', ')}</p>
            </div>
          ))}
          {board.chuaVaoHang.length > 0 && (
            <div className={`rounded-2xl border p-4 ${MAU.ngung.nen} ${MAU.ngung.vien}`}>
              <p className={`text-base font-semibold ${MAU.ngung.chu}`}>Đã vào ca, chưa ở hàng nào ({board.chuaVaoHang.length})</p>
              <p className="mt-1 text-base text-slate-800">{board.chuaVaoHang.map(n => n.hoTen).join(', ')}</p>
            </div>
          )}
        </section>
      </main>

      {camera && (
        <QuetQr tieuDe={nguoi ? 'Quét phiếu hạng mục' : phieuCho ? 'Quét thẻ người khai' : 'Quét phiếu hoặc thẻ'} onRaw={quet} onHex={h => quet(h)}
          onGoMa={() => { setCamera(false); setGoMa(true); }} onClose={() => setCamera(false)} />
      )}
      {goMa && <GoMa onXong={quet} onDong={() => setGoMa(false)} />}
    </div>
  );
}

function GoMa({ onXong, onDong }: { onXong: (v: string) => void; onDong: () => void }) {
  const [v, setV] = useState('');
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label="Gõ mã">
      <form className="w-full max-w-md rounded-2xl bg-white p-5" onSubmit={e => { e.preventDefault(); if (v.trim()) onXong(v.trim()); }}>
        <label className="block text-lg font-semibold text-slate-900" htmlFor="ma-tram">Mã nhân viên hoặc mã hạng mục (9 số)</label>
        <input id="ma-tram" autoFocus value={v} onChange={e => setV(e.target.value)} autoComplete="off"
          className="mt-3 h-16 w-full rounded-2xl border border-slate-300 px-4 text-2xl tabular-nums" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" className={NUT_PHU} onClick={onDong}>Huỷ</button>
          <button type="submit" className={NUT_CHINH} disabled={!v.trim()}>Xong</button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Đăng ký máy làm trạm (quản lý xưởng / tổ trưởng đăng nhập trên máy trạm, đăng ký xong thì đăng xuất)
// ---------------------------------------------------------------------------
function DangKyTram({ onXong }: { onXong: () => void }) {
  const [coNguoi, setCoNguoi] = useState(() => !!getToken() || !!localStorage.getItem('xuong_token'));
  const [dm, setDm] = useState<{ to: Array<{ id: number; xuong: string; ten: string; congDoan: string[] }>; congDoan: Array<{ id: string; ten: string }> } | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [cds, setCds] = useState<string[]>([]);
  const [ten, setTen] = useState('');
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);

  useEffect(() => {
    if (!coNguoi) return;
    void xuongApi.danhMuc().then(r => {
      if (r.ok && r.data) setDm({ to: r.data.to, congDoan: r.data.congDoan });
      else setLoi(r.message || 'Không tải được danh mục tổ');
    });
  }, [coNguoi]);

  if (!coNguoi) {
    return <DangNhapXuong onSuccess={() => setCoNguoi(true)}
      ghiChu={<p className="text-base text-slate-700">Máy này chưa là trạm quét. Quản lý xưởng hoặc tổ trưởng đăng nhập để đăng ký.</p>} />;
  }
  const to = dm?.to.find(t => t.id === toId) ?? null;
  const tenCd = new Map((dm?.congDoan ?? []).map(c => [c.id, c.ten]));

  const dangKy = async () => {
    if (!toId) return;
    setDang(true); setLoi('');
    const r = await tramApi.dangKy(authXuong, toId, cds, ten.trim());
    setDang(false);
    if (!r.ok) { setLoi(r.message); return; }
    // Máy trạm để chung ở xưởng: bỏ phiên người đăng ký, chỉ giữ token trạm
    try {
      localStorage.removeItem('app_token'); sessionStorage.removeItem('app_token');
      localStorage.removeItem('app_user_persist'); localStorage.removeItem('xuong_token');
    } catch { /* bỏ qua */ }
    onXong();
  };

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col gap-4 bg-white p-6">
      <LogoAADayDu className="mx-auto h-24 w-auto" />
      <h1 className="text-2xl font-semibold text-slate-900">Đăng ký máy này làm trạm quét</h1>
      <p className="text-base text-slate-600">Trạm gắn với một tổ. Đăng ký xong, máy tự đăng xuất tài khoản của bạn — công nhân chỉ quét được thẻ và phiếu.</p>
      <label className="text-base font-semibold text-slate-800" htmlFor="tram-to">Tổ</label>
      <select id="tram-to" className="h-14 rounded-2xl border border-slate-300 px-3 text-lg" value={toId ?? ''}
        onChange={e => { setToId(Number(e.target.value) || null); setCds([]); }}>
        <option value="">— Chọn tổ —</option>
        {(dm?.to ?? []).map(t => <option key={t.id} value={t.id}>{t.xuong} · {t.ten}</option>)}
      </select>
      {to && to.congDoan.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-base font-semibold text-slate-800">Công đoạn mặc định của trạm (không chọn = mọi công đoạn của tổ)</legend>
          {to.congDoan.map(c => (
            <label key={c} className="flex min-h-12 items-center gap-3 text-lg">
              <input type="checkbox" className="h-6 w-6" checked={cds.includes(c)} onChange={e => setCds(s => (e.target.checked ? [...s, c] : s.filter(x => x !== c)))} />
              {tenCd.get(c) ?? c}
            </label>
          ))}
        </fieldset>
      )}
      <label className="text-base font-semibold text-slate-800" htmlFor="tram-ten">Tên trạm (vd "cửa kho")</label>
      <input id="tram-ten" className="h-14 rounded-2xl border border-slate-300 px-3 text-lg" value={ten} maxLength={80} onChange={e => setTen(e.target.value)} />
      {loi && <p className="text-base text-red-700" role="alert">{loi}</p>}
      <button className={NUT_CHINH} disabled={!toId || dang} onClick={() => void dangKy()}>{dang ? 'Đang đăng ký…' : 'Đăng ký trạm'}</button>
    </div>
  );
}
