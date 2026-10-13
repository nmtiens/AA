import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PackageX, FileClock, AlertOctagon, Zap, Megaphone, MoreHorizontal, Minus, Plus, ChevronRight,
  History, Moon, ClipboardCheck, Users, RefreshCw, LogOut, Rocket, Camera, Image as ImageIcon, Search as SearchIcon,
} from 'lucide-react';
import { BottomSheet } from '../mobileUi';
import { compressImageWebp } from '../PhotoPicker';
import {
  LY_DO_TAM_NGUNG, TEN_CA, LOAI_CA_TANG_CA, moTaSuKien, hhmm, mocTrongNgay, khoaDong, slConLam, slChoGiao, slChoNhan,
  type CongViec, type DongViec, type LoaiCa, type MaLyDo,
} from '../../../services/xuongModel';
import { xuongApi, type DanhMucXuong, type DongLichSu, type GoiYHex } from '../../../services/xuongApi';
import { NUT_CHINH, NUT_PHU, NUT_DEM, SO, SO_LON, CHU_PHU, KHOI, KE, MAU } from './xuongUi';
import XuongHexChiTiet from '../../Xuong/XuongHexChiTiet';

// ============================================================================
// CÁC CỬA SỔ THAO TÁC MÀN XƯỞNG (docs/designs/xuong-checkin.md — Pass 3, quyết định 3A–3H, 7B)
// ============================================================================

const chip = (on: boolean) =>
  `min-h-14 rounded-2xl px-4 text-base font-medium ${on ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-800 active:bg-slate-100'}`;

/** Bộ đếm −/+ 64px; chạm vào số để gõ thẳng (số lớn) */
export function BoDem({ value, onChange, min = 0, max = 100_000, lon, nhan }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; lon?: boolean; nhan: string;
}) {
  const kep = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" className={NUT_DEM} onClick={() => onChange(kep(value - 1))} disabled={value <= min} aria-label={`Bớt ${nhan}`}><Minus size="1em" /></button>
      <input
        inputMode="numeric" pattern="[0-9]*" aria-label={nhan}
        value={String(value)}
        onChange={e => { const n = Number(e.target.value.replace(/\D/g, '')); onChange(kep(Number.isFinite(n) ? n : min)); }}
        onFocus={e => e.target.select()}
        className={`w-full min-w-0 bg-transparent text-center outline-none ${lon ? SO_LON : SO}`}
      />
      <button type="button" className={NUT_DEM} onClick={() => onChange(kep(value + 1))} disabled={value >= max} aria-label={`Thêm ${nhan}`}><Plus size="1em" /></button>
    </div>
  );
}

const tenCd = (dm: DanhMucXuong | null, id: string | null | undefined) =>
  (id && dm?.congDoan.find(c => c.id === id)?.ten) || id || '';

// ---------------------------------------------------------------------------
// 3B — Chốt quân số
// ---------------------------------------------------------------------------
export function QuanSoSheet({ ca, macDinh, homQua, sauDo, onChot, onClose }: {
  ca: LoaiCa; macDinh: number; homQua: number | null; sauDo?: string;
  onChot: (n: number) => void; onClose: () => void;
}) {
  const [n, setN] = useState(macDinh);
  return (
    <BottomSheet title={`Chốt quân số ${TEN_CA[ca].toLowerCase()}`} onClose={onClose}
      footer={<button className={NUT_CHINH} onClick={() => onChot(n)}>Chốt {n} người{sauDo ? ` và ${sauDo}` : ''}</button>}>
      <div className="space-y-5 pb-2">
        <p className={CHU_PHU}>Số người của tổ có mặt làm {TEN_CA[ca].toLowerCase()} hôm nay.</p>
        <BoDem value={n} onChange={setN} lon nhan="quân số" max={500} />
        {homQua !== null && homQua !== n && (
          <button className={`${NUT_PHU} w-full`} onClick={() => setN(homQua)}>Giống hôm qua ({homQua})</button>
        )}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// 3E — Tạm ngưng: lưới 2×3, chạm một lần là ghi
// ---------------------------------------------------------------------------
const ICON_LY_DO: Record<MaLyDo, typeof PackageX> = {
  thieu_vat_tu: PackageX, cho_ban_ve_duyet: FileClock, loi_chat_luong: AlertOctagon,
  chuyen_viec_gap: Zap, lenh_cap_tren: Megaphone, khac: MoreHorizontal,
};

export function TamNgungSheet({ r, onChon, onClose }: { r: DongViec; onChon: (ma: MaLyDo) => void; onClose: () => void }) {
  return (
    <BottomSheet title={`Tạm ngưng ${r.hex} — vì sao?`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 pb-2">
        {LY_DO_TAM_NGUNG.map(l => {
          const Icon = ICON_LY_DO[l.ma];
          return (
            <button key={l.ma} onClick={() => onChon(l.ma)}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white p-3 text-base font-medium text-slate-800 active:bg-slate-100">
              <Icon size="1.75em" className={MAU.ngung.chu} aria-hidden />
              {l.ten}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Chọn nơi giao / nơi nhận từ: công đoạn trong xưởng, hoặc xưởng khác
// ---------------------------------------------------------------------------
function ChonCongDoan({ dm, xuong, chon, setChon, boQua, choXuongNgoai }: {
  dm: DanhMucXuong | null; xuong: string | null; chon: string | null; setChon: (id: string, xuongNgoai?: string) => void;
  boQua?: string[]; choXuongNgoai?: boolean;
}) {
  const [xuongKhac, setXuongKhac] = useState<string | null>(null);
  if (!dm) return <p className={`rounded-2xl ${MAU.ngung.nen} p-3 text-base ${MAU.ngung.chu}`}>Cần có sóng để tải danh sách công đoạn.</p>;
  const dsXuong = [...new Set(dm.congDoan.map(c => c.xuong))].filter(x => x !== xuong).sort();
  const xg = xuongKhac ?? xuong;
  const ds = dm.congDoan.filter(c => c.xuong === xg && !(boQua ?? []).includes(c.id));
  return (
    <div className="space-y-3">
      {xuongKhac && <p className="text-base font-medium text-slate-800">Xưởng {xuongKhac}</p>}
      <div className="flex flex-wrap gap-2">
        {ds.map(c => <button key={c.id} className={chip(chon === c.id)} onClick={() => setChon(c.id)}>{c.ten}</button>)}
        {choXuongNgoai && xuongKhac && (
          <button className={chip(chon === `xuong:${xuongKhac}`)} onClick={() => setChon(`xuong:${xuongKhac}`, xuongKhac)}>
            Xưởng {xuongKhac} (chưa dùng app)
          </button>
        )}
      </div>
      <details className="rounded-2xl border border-slate-200 bg-white" open={!!xuongKhac}>
        <summary className="flex min-h-14 cursor-pointer items-center px-4 text-base font-medium text-slate-800">Xưởng khác…</summary>
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {xuongKhac && <button className={chip(false)} onClick={() => setXuongKhac(null)}>Về xưởng {xuong}</button>}
          {dsXuong.map(x => <button key={x} className={chip(xuongKhac === x)} onClick={() => setXuongKhac(x)}>{x}</button>)}
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ảnh chụp kèm thao tác (check-in / xong / cuối ngày): nén WebP trên máy, tối đa 3 ảnh / thao tác
// ---------------------------------------------------------------------------
export interface AnhChup { blob: Blob; kieu: 'image/webp' | 'image/jpeg'; url: string }

/** Giải phóng ảnh xem trước (object URL) khi đóng cửa sổ */
function useGiaiPhongAnh(anh: AnhChup[][]) {
  const ref = useRef(anh);
  ref.current = anh;
  useEffect(() => () => ref.current.flat().forEach(a => URL.revokeObjectURL(a.url)), []);
}

/** Máy cảm ứng (điện thoại / máy tính bảng): nút mở thẳng camera. Máy tính: trình duyệt chỉ mở hộp chọn file. */
const coCamera = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

function ChonAnh({ anh, onDoi, goiY = `Không bắt buộc, tối đa 3 ảnh.`, toiDa = 3 }: {
  anh: AnhChup[]; onDoi: (a: AnhChup[]) => void; goiY?: string; toiDa?: number;
}) {
  const [loi, setLoi] = useState('');
  const them = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoi('');
    try {
      const moi = await Promise.all([...files].slice(0, toiDa - anh.length).map(async f => {
        const n = await compressImageWebp(f);
        return { ...n, url: URL.createObjectURL(n.blob) };
      }));
      onDoi([...anh, ...moi]);
    } catch {
      setLoi('Không đọc được ảnh — chụp lại.');
    }
  };
  return (
    <div className="space-y-2">
      {loi && <p className={`rounded-2xl ${MAU.loi.nen} p-3 text-base ${MAU.loi.chu}`} role="alert">{loi}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {anh.map((a, k) => (
          <button key={a.url} type="button" aria-label="Bỏ ảnh" onClick={() => { URL.revokeObjectURL(a.url); onDoi(anh.filter((_, m) => m !== k)); }}
            className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200">
            <img src={a.url} alt="" className="h-full w-full object-cover" />
            <span className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1 text-xs text-white">✕</span>
          </button>
        ))}
        {anh.length < toiDa && (<>
          {/* Điện thoại: Chụp ảnh (mở thẳng camera sau) + Chọn ảnh (thư viện). Máy tính: chỉ Chọn ảnh. */}
          {coCamera() && (
            <label className={`${NUT_PHU} cursor-pointer`}>
              <Camera size="1.25em" aria-hidden /> Chụp ảnh
              <input type="file" accept="image/*" capture="environment" className="sr-only"
                onChange={e => { them(e.target.files); e.target.value = ''; }} />
            </label>
          )}
          <label className={`${NUT_PHU} cursor-pointer`}>
            <ImageIcon size="1.25em" aria-hidden /> Chọn ảnh
            <input type="file" accept="image/*" multiple className="sr-only"
              onChange={e => { them(e.target.files); e.target.value = ''; }} />
          </label>
        </>)}
      </div>
      {!anh.length && <p className={CHU_PHU}>{goiY}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3F — Xong — giao / Giao
// ---------------------------------------------------------------------------
export function GiaoSheet({ r, cheDo, dm, xuong, anhBat, onXacNhan, onClose }: {
  r: DongViec; cheDo: 'xong' | 'giao'; dm: DanhMucXuong | null; xuong: string | null; anhBat: boolean;
  onXacNhan: (p: { soLuong: number; den: string | null; anh: AnhChup[] }) => void; onClose: () => void;
}) {
  const [anh, setAnh] = useState<AnhChup[]>([]);
  useGiaiPhongAnh([anh]);
  const toiDa = cheDo === 'xong' ? Math.max(1, slConLam(r)) : Math.max(1, slChoGiao(r));
  const [sl, setSl] = useState(toiDa);
  const [den, setDen] = useState<string | null>(r.goiYKe.length === 1 ? r.goiYKe[0] : null);
  const [doiCho, setDoiCho] = useState(r.goiYKe.length === 0);
  const ten = den ? tenCd(dm, den) : '…';
  const tieuDe = cheDo === 'xong' ? `Xong ${sl} cái — giao sang ${ten}` : `Giao ${sl} cái sang ${ten}`;
  return (
    <BottomSheet title={tieuDe} onClose={onClose}
      footer={
        <div className="space-y-3">
          <button className={NUT_CHINH} disabled={!den} onClick={() => onXacNhan({ soLuong: sl, den, anh })}>
            {cheDo === 'xong' ? 'Xong — giao' : 'Giao'}{den ? '' : ' (chọn nơi giao)'}
          </button>
          {cheDo === 'xong' && (
            <button className={`${NUT_PHU} w-full`} onClick={() => onXacNhan({ soLuong: sl, den: null, anh })}>Xong, hàng chưa chuyển — giao sau</button>
          )}
        </div>
      }>
      <div className="space-y-5 pb-2">
        <div className="space-y-2">
          <p className="text-base font-medium text-slate-800">Số lượng {cheDo === 'xong' ? 'xong' : 'giao'}{r.dvt ? ` (${r.dvt})` : ''}</p>
          <BoDem value={sl} onChange={setSl} min={1} max={toiDa} nhan="số lượng" />
          {sl < toiDa && <p className={CHU_PHU}>Còn {toiDa - sl} ở lại tổ.</p>}
        </div>
        <div className="space-y-2">
          <p className="text-base font-medium text-slate-800">Giao sang</p>
          {r.goiYKe.length === 0 && <p className={`text-base ${MAU.ngung.chu}`}>Hạng mục chưa có tuyến — chọn nơi giao.</p>}
          {!doiCho && r.goiYKe.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.goiYKe.map(id => <button key={id} className={chip(den === id)} onClick={() => setDen(id)}>{tenCd(dm, id)}</button>)}
              <button className="min-h-14 px-2 text-base font-medium text-slate-700 underline underline-offset-4" onClick={() => setDoiCho(true)}>Giao chỗ khác</button>
            </div>
          )}
          {doiCho && <ChonCongDoan dm={dm} xuong={xuong} chon={den} setChon={id => setDen(id)} boQua={[r.congDoanId]} />}
        </div>
        {anhBat && (
          <div className="space-y-2">
            <p className="text-base font-medium text-slate-800">Ảnh hàng lúc giao</p>
            <ChonAnh anh={anh} onDoi={setAnh} />
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Nhận (R10: nhận hàng không có sự kiện giao thì bắt chọn nguồn)
// ---------------------------------------------------------------------------
export interface NhanKetQua { congDoanId: string; soLuong: number; congDoanNguonId?: string; xuongNguon?: string; anh: AnhChup[] }

export function NhanSheet({ hex, ten, cv, dm, onNhan, onClose }: {
  hex: string; ten: string | null; cv: CongViec; dm: DanhMucXuong | null;
  onNhan: (p: NhanKetQua) => void; onClose: () => void;
}) {
  const [anh, setAnh] = useState<AnhChup[]>([]);
  const [xemTruoc, setXemTruoc] = useState(false);
  useGiaiPhongAnh([anh]);
  const choNhanCuaHex = cv.choNhan.filter(r => r.hex === hex);
  const [cd, setCd] = useState<string>(choNhanCuaHex[0]?.congDoanId ?? cv.congDoan[0]?.id ?? '');
  const dongCho = choNhanCuaHex.find(r => r.congDoanId === cd);
  const [sl, setSl] = useState(dongCho ? Math.max(1, slChoNhan(dongCho)) : 1);
  const [nguon, setNguon] = useState<string | null>(null);
  useEffect(() => { if (dongCho) setSl(Math.max(1, slChoNhan(dongCho))); }, [cd]); // eslint-disable-line react-hooks/exhaustive-deps
  const canNguon = !dongCho;
  const xong = () => onNhan({
    congDoanId: cd, soLuong: sl, anh,
    ...(canNguon && nguon ? (nguon.startsWith('xuong:') ? { xuongNguon: nguon.slice(6) } : { congDoanNguonId: nguon }) : {}),
  });
  return (
    <BottomSheet title={`Nhận ${hex}`} onClose={onClose}
      footer={<button className={NUT_CHINH} disabled={!cd || (canNguon && !nguon)} onClick={xong}>Nhận {sl} cái{canNguon && !nguon ? ' (chọn nơi giao tới)' : ''}</button>}>
      <div className="space-y-5 pb-2">
        {ten && <p className="text-base text-slate-800">{ten}</p>}
        <details className="rounded-2xl border border-slate-200 bg-white" onToggle={e => setXemTruoc((e.target as HTMLDetailsElement).open)}>
          <summary className="flex min-h-14 cursor-pointer items-center px-4 text-base font-medium text-slate-800">Xem tình trạng & ảnh ở công đoạn trước</summary>
          {xemTruoc && <div className="px-2 pb-3"><XuongHexChiTiet hex={hex} /></div>}
        </details>
        {cv.congDoan.length > 1 && (
          <div className="space-y-2">
            <p className="text-base font-medium text-slate-800">Nhận vào công đoạn</p>
            <div className="flex flex-wrap gap-2">
              {cv.congDoan.map(c => <button key={c.id} className={chip(cd === c.id)} onClick={() => setCd(c.id)}>{c.ten}</button>)}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <p className="text-base font-medium text-slate-800">Số lượng nhận</p>
          <BoDem value={sl} onChange={setSl} min={1} nhan="số lượng" />
          {dongCho && <p className={CHU_PHU}>Tổ trước đã giao {dongCho.slGiaoDen}, tổ đã nhận {dongCho.slNhan}.</p>}
        </div>
        {canNguon && (
          <div className="space-y-2">
            <p className="text-base font-medium text-slate-800">Hàng từ đâu tới?</p>
            <p className={CHU_PHU}>Chưa có ai bấm giao hạng mục này cho tổ — chọn công đoạn hoặc xưởng giao tới.</p>
            <ChonCongDoan dm={dm} xuong={cv.to.xuong} chon={nguon} setChon={id => setNguon(id)} boQua={cv.congDoan.map(c => c.id)} choXuongNgoai />
          </div>
        )}
        {cv.anhBat && (
          <div className="space-y-2">
            <p className="text-base font-medium text-slate-800">Ảnh hàng lúc nhận</p>
            <p className={CHU_PHU}>Chụp tình trạng hàng khi về tới tổ — nơi khác xem được ở Tra cứu.</p>
            <ChonAnh anh={anh} onDoi={setAnh} />
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// 3H — Khai tăng ca của tổ: một màn
// ---------------------------------------------------------------------------
export function TangCaSheet({ cv, dangChay, onKhai, onClose }: {
  cv: CongViec; dangChay: DongViec[];
  onKhai: (p: { loaiCa: LoaiCa; soNguoi: number; boChon: string[] }) => void; onClose: () => void;
}) {
  const [ca, setCa] = useState<LoaiCa | null>(null);
  const [n, setN] = useState(cv.soNguoiTangCaTruoc ?? cv.quanSo.chinh ?? 0);
  const [bo, setBo] = useState<Set<string>>(new Set());
  const gio = (l: LoaiCa) => { const c = cv.lichCa.find(x => x.loaiCa === l); return c ? `${c.gioBatDau}–${c.gioKetThuc}` : ''; };
  return (
    <BottomSheet title="Khai tăng ca của tổ" onClose={onClose}
      footer={<button className={NUT_CHINH} disabled={!ca} onClick={() => ca && onKhai({ loaiCa: ca, soNguoi: n, boChon: [...bo] })}>
        {ca ? `Khai tăng ca ${TEN_CA[ca].toLowerCase()} · ${n} người` : 'Chọn ca tăng ca'}</button>}>
      <div className="space-y-5 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {LOAI_CA_TANG_CA.map(l => (
            <button key={l} aria-pressed={ca === l} aria-label={`${TEN_CA[l]} ${gio(l)}${cv.tangCa.includes(l) ? ', đã khai' : ''}`}
              className={`${chip(ca === l)} flex flex-col items-center justify-center py-2`} onClick={() => setCa(l)}>
              <span>{TEN_CA[l]}{cv.tangCa.includes(l) ? ' (đã khai)' : ''}</span>
              <span className="text-base font-normal tabular-nums opacity-80">{gio(l)}</span>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-base font-medium text-slate-800">Số người tăng ca</p>
          <BoDem value={n} onChange={setN} nhan="số người tăng ca" max={500} />
        </div>
        {dangChay.length > 0 && (
          <div className="space-y-2">
            <p className="text-base font-medium text-slate-800">Hạng mục làm tăng ca <span className="font-normal text-slate-600">(chạm để bỏ)</span></p>
            <ul className={`${KHOI} ${KE} border border-slate-200`}>
              {dangChay.map(r => {
                const k = khoaDong(r);
                const on = !bo.has(k);
                return (
                  <li key={k}>
                    <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2">
                      <input type="checkbox" className="h-6 w-6 shrink-0 accent-slate-900" checked={on} aria-label={`Làm tăng ca ${r.hex}`}
                        onChange={() => setBo(s => { const t = new Set(s); if (on) t.add(k); else t.delete(k); return t; })} />
                      <span className="min-w-0 text-base"><span className="font-semibold tabular-nums">{r.hex}</span> {r.tenHangMuc ?? ''}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// 3C — Xác nhận cuối ngày
// ---------------------------------------------------------------------------
export interface XacNhanDong {
  r: DongViec; vanLam: boolean; dungLuc: number | null; tienDo: number | null;
  /** Ảnh tiến độ đã nén (tuỳ chọn, tối đa 3 / hạng mục) */
  anh: AnhChup[];
}

export function XacNhanSheet({ cv, dangChay, anhBat, onXacNhan, onClose }: {
  cv: CongViec; dangChay: DongViec[]; anhBat: boolean; onXacNhan: (ds: XacNhanDong[]) => void; onClose: () => void;
}) {
  const [ds, setDs] = useState<XacNhanDong[]>(() => dangChay.map(r => ({ r, vanLam: true, dungLuc: null, tienDo: null, anh: [] })));
  useGiaiPhongAnh(ds.map(x => x.anh));
  const sua = (i: number, p: Partial<XacNhanDong>) => setDs(a => a.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const mocs = (r: DongViec) => {
    const out: Array<{ ten: string; luc: number }> = [];
    if (r.suKienCuoi) out.push({ ten: `Thao tác cuối ${hhmm(Date.parse(r.suKienCuoi))}`, luc: Date.parse(r.suKienCuoi) });
    const chinh = cv.lichCa.find(x => x.loaiCa === 'chinh');
    if (chinh) out.push({ ten: `Hết ca chính ${chinh.gioKetThuc}`, luc: mocTrongNgay(cv.ngay, chinh.gioKetThuc) });
    for (const l of cv.tangCa) {
      const c = cv.lichCa.find(x => x.loaiCa === l);
      if (c) {
        let luc = mocTrongNgay(cv.ngay, c.gioKetThuc);
        if (luc <= mocTrongNgay(cv.ngay, c.gioBatDau)) luc += 86_400_000;
        out.push({ ten: `Hết ${TEN_CA[l].toLowerCase()} ${c.gioKetThuc}`, luc });
      }
    }
    return out.filter(m => m.luc <= Date.now());
  };
  const thieu = ds.some(x => !x.vanLam && x.dungLuc === null);
  return (
    <BottomSheet title="Xác nhận cuối ngày" onClose={onClose}
      footer={<button className={NUT_CHINH} disabled={thieu} onClick={() => onXacNhan(ds)}>{thieu ? 'Chọn giờ đã dừng' : 'Xác nhận'}</button>}>
      <div className="space-y-4 pb-2">
        <button className={`${NUT_PHU} w-full border-emerald-300 ${MAU.chay.chu}`}
          onClick={() => onXacNhan(ds.map(x => ({ ...x, vanLam: true, dungLuc: null })))}>
          <ClipboardCheck size="1.25em" aria-hidden /> Tất cả vẫn đang làm
        </button>
        <ul className={`${KHOI} ${KE} border border-slate-200`}>
          {ds.map((x, i) => (
            <li key={khoaDong(x.r)} className="space-y-3 px-4 py-3">
              <p className="text-base"><span className="text-lg font-semibold tabular-nums">{x.r.hex}</span> {x.r.tenHangMuc ?? ''}</p>
              <div className="grid grid-cols-2 gap-3">
                <button className={chip(x.vanLam)} onClick={() => sua(i, { vanLam: true, dungLuc: null })}>Vẫn làm</button>
                <button className={chip(!x.vanLam)} onClick={() => sua(i, { vanLam: false })}>Đã dừng</button>
              </div>
              {!x.vanLam && (
                <div className="space-y-2">
                  <p className="text-base text-slate-700">Đã dừng lúc</p>
                  <div className="flex flex-wrap gap-2">
                    {mocs(x.r).map(m => <button key={m.ten} className={chip(x.dungLuc === m.luc)} onClick={() => sua(i, { dungLuc: m.luc })}>{m.ten}</button>)}
                  </div>
                </div>
              )}
              {anhBat && <ChonAnh anh={x.anh} onDoi={a => sua(i, { anh: a })} />}
              <div className="space-y-2">
                <p className="text-base text-slate-700">Tiến độ (không bắt buộc)</p>
                <div className="grid grid-cols-4 gap-2">
                  {[25, 50, 75, 100].map(p => (
                    <button key={p} className={chip(x.tienDo === p)} onClick={() => sua(i, { tienDo: x.tienDo === p ? null : p })}>{p}%</button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// 3D — Chọn số người cho từng hạng mục đang chạy
// ---------------------------------------------------------------------------
export function ChiaNguoiSheet({ dangChay, quanSo, onLuu, onClose }: {
  dangChay: DongViec[]; quanSo: number; onLuu: (m: Record<string, number>) => void; onClose: () => void;
}) {
  const [m, setM] = useState<Record<string, number>>(() => Object.fromEntries(dangChay.map(r => [khoaDong(r), r.soNguoi ?? 0])));
  const tong = Object.values(m).reduce((a, b) => a + b, 0);
  return (
    <BottomSheet title="Chia người cho hạng mục" onClose={onClose}
      footer={<button className={NUT_CHINH} onClick={() => onLuu(m)}>Lưu</button>}>
      <div className="space-y-4 pb-2">
        <p className={`text-base font-medium ${tong > quanSo ? MAU.loi.chu : 'text-slate-700'}`}>
          {tong > quanSo ? `Khai ${tong} người — nhiều hơn quân số ${quanSo}` : `Còn rảnh ${quanSo - tong} / ${quanSo} người`}
        </p>
        {dangChay.map(r => {
          const k = khoaDong(r);
          return (
            <div key={k} className="space-y-2">
              <p className="text-base"><span className="font-semibold tabular-nums">{r.hex}</span> {r.tenHangMuc ?? ''}</p>
              <BoDem value={m[k] ?? 0} onChange={n => setM(x => ({ ...x, [k]: n }))} nhan={`số người ${r.hex}`} max={500} />
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// 3G — Lịch sử hôm nay
// ---------------------------------------------------------------------------
export function LichSuSheet({ toId, onHuy, onClose }: { toId: number; onHuy: (id: string, moTa: string) => Promise<void>; onClose: () => void }) {
  const [ds, setDs] = useState<DongLichSu[] | null>(null);
  const [loi, setLoi] = useState('');
  const [dangHuy, setDangHuy] = useState<string | null>(null);
  const tai = () => {
    setLoi('');
    xuongApi.lichSu(toId).then(r => {
      if (r.ok && r.data) setDs(r.data.suKien ?? []);
      else setLoi(r.status === 0 ? 'Đang mất sóng — lịch sử cần có sóng để xem.' : (r.message || 'Không tải được lịch sử'));
    });
  };
  useEffect(tai, [toId]);
  return (
    <BottomSheet title="Lịch sử hôm nay" onClose={onClose}>
      <div className="space-y-3 pb-2">
        <p className={CHU_PHU}>Thao tác 24 giờ qua của tổ. Bấm nhầm thì Huỷ — người bấm huỷ được trong 24 giờ.</p>
        {loi && <p className={`rounded-2xl ${MAU.ngung.nen} p-3 text-base ${MAU.ngung.chu}`}>{loi}</p>}
        {!ds && !loi && [0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}
        {ds && ds.length === 0 && <p className="py-6 text-center text-base text-slate-600">Chưa có thao tác nào trong 24 giờ qua.</p>}
        {ds && ds.length > 0 && (
          <ul className={`${KHOI} ${KE} border border-slate-200`}>
            {ds.map(x => (
              <li key={x.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`min-w-0 flex-1 ${x.daHuy ? 'line-through opacity-60' : ''}`}>
                  <p className="text-base font-medium text-slate-900">
                    <span className="tabular-nums">{hhmm(Date.parse(x.luc))}</span> · {moTaSuKien(x)}
                  </p>
                  <p className={CHU_PHU}>
                    {x.hex ? <span className="tabular-nums">{x.hex}</span> : 'Cả tổ'}
                    {x.tenCongDoan ? ` · ${x.tenCongDoan}` : ''}{x.nguoi ? ` · ${x.nguoi}` : ''}
                  </p>
                </div>
                {x.daHuy && <span className="text-base text-slate-600">Đã huỷ</span>}
                {x.huyDuoc && (
                  <button className={NUT_PHU} disabled={dangHuy === x.id}
                    onClick={async () => { setDangHuy(x.id); await onHuy(x.id, moTaSuKien(x)); setDangHuy(null); tai(); }}>Huỷ</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// 7B — Gõ mã: bàn phím số + gợi ý (việc của tổ trước)
// ---------------------------------------------------------------------------
export function GoMaSheet({ toId, cv, onHex, onClose }: {
  toId: number; cv: CongViec | null; onHex: (hex: string, ten?: string | null) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [xa, setXa] = useState<GoiYHex[] | null>(null);
  const [matSong, setMatSong] = useState(false);
  const cuaTo = useMemo(() => {
    if (!cv || q.length < 3) return [];
    const m = new Map<string, DongViec>();
    for (const r of [...cv.choNhan, ...cv.dangLam, ...cv.choGiao]) if (r.hex.includes(q) && !m.has(r.hex)) m.set(r.hex, r);
    return [...m.values()].map(r => ({ hex: r.hex, cuaTo: true, tenHangMuc: r.tenHangMuc, tenCongTrinh: r.tenCongTrinh }));
  }, [cv, q]);
  useEffect(() => {
    setXa(null);
    if (q.length < 3) return;
    const t = setTimeout(() => {
      xuongApi.timHex(q, toId).then(r => {
        setMatSong(r.status === 0);
        setXa(r.ok && r.data ? r.data.ketQua : []);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [q, toId]);
  const ds = [...cuaTo, ...(xa ?? []).filter(x => !cuaTo.some(c => c.hex === x.hex))];
  const khongCo = q.length === 9 && xa !== null && !matSong && !ds.some(x => x.hex === q);
  return (
    <BottomSheet title="Gõ mã hạng mục" onClose={onClose}>
      <div className="space-y-3 pb-2">
        <div className="relative">
          <SearchIcon size="1.25em" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
          <input autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={9} value={q} aria-label="Mã hạng mục 9 số"
            onChange={e => setQ(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="Gõ 3 số trở lên"
            className="h-16 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-4 text-2xl tabular-nums tracking-wider text-slate-900 outline-none focus:border-slate-500" />
        </div>
        {q.length > 0 && q.length < 3 && <p className={CHU_PHU}>Gõ thêm {3 - q.length} số để xem gợi ý.</p>}
        {khongCo && <p className={`rounded-2xl ${MAU.loi.nen} p-3 text-base font-medium ${MAU.loi.chu}`} role="alert">Không có hạng mục mã {q}. Kiểm tra lại số trên phiếu.</p>}
        {matSong && q.length >= 3 && (
          <p className={`rounded-2xl ${MAU.ngung.nen} p-3 text-base ${MAU.ngung.chu}`}>Đang mất sóng — chỉ gợi ý từ việc của tổ.</p>
        )}
        {ds.length > 0 && (
          <ul className={`${KHOI} ${KE} border border-slate-200`}>
            {ds.map(x => (
              <li key={x.hex}>
                <button className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-slate-50" onClick={() => onHex(x.hex, x.tenHangMuc)}>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{x.hex}{x.cuaTo && <span className="ml-2 text-base font-normal text-emerald-700">việc của tổ</span>}</p>
                    {x.tenHangMuc && <p className="break-words text-base text-slate-800">{x.tenHangMuc}</p>}
                    {x.tenCongTrinh && <p className={`break-words ${CHU_PHU}`}>{x.tenCongTrinh}</p>}
                  </div>
                  <ChevronRight size="1.25em" className="shrink-0 text-slate-500" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {matSong && q.length === 9 && !ds.some(x => x.hex === q) && (
          <button className={`${NUT_PHU} w-full`} onClick={() => onHex(q)}>Dùng mã {q}</button>
        )}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Chọn tổ (1C) và menu
// ---------------------------------------------------------------------------
export function ChonToSheet({ ds, toId, onChon, onClose }: {
  ds: Array<{ id: number; xuong: string; ten: string }>; toId: number | null; onChon: (id: number) => void; onClose: () => void;
}) {
  return (
    <BottomSheet title="Chọn tổ" onClose={onClose}>
      <ul className={`${KHOI} ${KE} mb-2 border border-slate-200`}>
        {ds.map(t => (
          <li key={t.id}>
            <button className={`flex min-h-14 w-full items-center justify-between px-4 text-left text-base ${t.id === toId ? 'font-semibold text-slate-900' : 'text-slate-800'}`} onClick={() => onChon(t.id)}>
              <span>{t.ten} <span className="text-slate-600">· xưởng {t.xuong}</span></span>
              {t.id === toId && <span className="text-emerald-700">Đang chọn</span>}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}

export function MenuSheet({ muc, onClose }: {
  muc: Array<{ ten: string; icon: 'lichsu' | 'tangca' | 'xacnhan' | 'quanso' | 'lammoi' | 'thoat' | 'trienkhai'; onClick: () => void; phu?: string }>;
  onClose: () => void;
}) {
  const ICON: Record<string, ReactNode> = {
    lichsu: <History size="1.25em" />, tangca: <Moon size="1.25em" />, xacnhan: <ClipboardCheck size="1.25em" />,
    quanso: <Users size="1.25em" />, lammoi: <RefreshCw size="1.25em" />, thoat: <LogOut size="1.25em" />,
    trienkhai: <Rocket size="1.25em" />,
  };
  return (
    <BottomSheet title="Việc khác" onClose={onClose}>
      <ul className={`${KHOI} ${KE} mb-2 border border-slate-200`}>
        {muc.map(m => (
          <li key={m.ten}>
            <button className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-base text-slate-900 active:bg-slate-50" onClick={m.onClick}>
              <span className="text-slate-700" aria-hidden>{ICON[m.icon]}</span>
              <span className="flex-1">{m.ten}</span>
              {m.phu && <span className="text-slate-600">{m.phu}</span>}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
