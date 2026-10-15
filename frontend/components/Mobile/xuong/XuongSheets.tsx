import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PackageX, FileClock, AlertOctagon, Zap, Megaphone, MoreHorizontal, Minus, Plus, ChevronRight,
  History, Moon, ClipboardCheck, Users, Rocket, Camera, Image as ImageIcon, Search as SearchIcon,
} from 'lucide-react';
import { BottomSheet, NO_SCROLLBAR } from '../mobileUi';
import { compressImageWebp } from '../PhotoPicker';
import {
  LY_DO_TAM_NGUNG, TEN_CA, LOAI_CA_TANG_CA, moTaSuKien, hhmm, mocTrongNgay, khoaDong, slConLam, slChoGiao, slChoNhan,
  choSoLe, lamTronSl, hienSl, coMatLuc, daDiemDanh, nguoiDangBan, tenGon,
  type CongViec, type DongViec, type LoaiCa, type MaLyDo, type CongNhanTo,
} from '../../../services/xuongModel';
import { xuongApi, type DanhMucXuong, type DongLichSu, type GoiYHex } from '../../../services/xuongApi';
import { NUT_CHINH, NUT_PHU, NUT_DEM, SO, SO_LON, CHU_PHU, KHOI, KE, MAU } from './xuongUi';
import XuongHexChiTiet from '../../Xuong/XuongHexChiTiet';
import { ChonNguoi, ThemNguoi, boDau } from './DiemDanh';

// ============================================================================
// CÁC CỬA SỔ THAO TÁC MÀN XƯỞNG (docs/designs/xuong-checkin.md — Pass 3, quyết định 3A–3H, 7B)
// ============================================================================

const chip = (on: boolean) =>
  `min-h-14 rounded-2xl px-4 text-base font-medium ${on ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-800 active:bg-slate-100'}`;

/**
 * Bộ đếm −/+ 64px; chạm vào số để gõ thẳng (số lớn). soLe = số lượng theo đơn vị đo (m², m³, mét dài…): gõ được số lẻ
 * (dấu phẩy hoặc dấu chấm, tối đa 3 chữ số sau dấu phẩy); không thì số nguyên.
 */
export function BoDem({ value, onChange, min = 0, max = 100_000, lon, nhan, soLe = false }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; lon?: boolean; nhan: string; soLe?: boolean;
}) {
  const kep = (n: number) => Math.min(max, Math.max(min, soLe ? lamTronSl(n) : Math.round(n)));
  // Chữ đang gõ (vd "74," chưa xong) — giữ nguyên tới khi rời ô; null = hiện theo value
  const [dangGo, setDangGo] = useState<string | null>(null);
  const hien = soLe ? String(lamTronSl(value)).replace('.', ',') : String(value);
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" className={NUT_DEM} onClick={() => { setDangGo(null); onChange(kep(value - 1)); }} disabled={value <= min} aria-label={`Bớt ${nhan}`}><Minus size="1em" /></button>
      <input
        inputMode={soLe ? 'decimal' : 'numeric'} pattern={soLe ? undefined : '[0-9]*'} aria-label={nhan}
        value={dangGo ?? hien}
        onChange={e => {
          if (!soLe) { const n = Number(e.target.value.replace(/\D/g, '')); onChange(kep(Number.isFinite(n) ? n : min)); return; }
          const t = e.target.value.replace(/[^\d.,]/g, '').replace('.', ',');
          setDangGo(t);
          const n = Number(t.replace(',', '.'));
          if (t && Number.isFinite(n)) {
            const k = kep(n);
            onChange(k);
            if (k !== lamTronSl(n)) setDangGo(String(k).replace('.', ',')); // vượt giới hạn => hiện số đã kẹp
          }
        }}
        onBlur={() => setDangGo(null)}
        onFocus={e => e.target.select()}
        // Có khung rõ ràng: thấy ngay là ô gõ số được (không chỉ bấm −/+)
        className={`h-16 w-full min-w-0 rounded-2xl border border-slate-300 bg-white text-center outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 ${lon ? SO_LON : SO}`}
      />
      <button type="button" className={NUT_DEM} onClick={() => { setDangGo(null); onChange(kep(value + 1)); }} disabled={value >= max} aria-label={`Thêm ${nhan}`}><Plus size="1em" /></button>
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
// Bắt đầu / Tiếp tục — bắt buộc khai số người làm hạng mục (giờ công chia theo số người khai)
// ---------------------------------------------------------------------------
export function BatDauSheet({ r, tiepTuc, quanSo, dangChayKhac, cv, ca = null, now = Date.now(), onBatDau, onClose }: {
  r: DongViec; tiepTuc: boolean; quanSo: number | null; dangChayKhac: DongViec[];
  /** Tổ chấm công theo tên thì chọn người làm bằng tên */
  cv?: CongViec | null; ca?: LoaiCa | null; now?: number;
  /** them: người tổ khác (mượn) / người mới thêm vào tổ ngay lúc chọn */
  onBatDau: (soNguoi: number, nguoi: string[] | null, them: CongNhanTo[]) => void; onClose: () => void;
}) {
  const dangLamKhac = dangChayKhac.reduce((a, x) => a + (x.soNguoi ?? 0), 0);
  const ranh = quanSo === null ? null : Math.max(0, quanSo - dangLamKhac);
  const goiY = tiepTuc && r.soNguoi && (ranh === null || r.soNguoi <= ranh) ? r.soNguoi : (ranh || r.soNguoi || 1);
  const [n, setN] = useState(Math.max(1, goiY));
  // "Ai làm?" KHÔNG phụ thuộc điểm danh: chọn trong cả tổ (+ người mượn tổ khác). Tiếp tục: chọn sẵn người lần trước.
  const theoTen = !!cv?.chamCong;
  const [them, setThem] = useState<CongNhanTo[]>([]);
  const dsNguoi = [...(cv?.congNhan ?? []), ...them.filter(t => !(cv?.congNhan ?? []).some(c => c.mnv === t.mnv))];
  const caTo = dsNguoi.map(c => c.mnv);
  const ban = nguoiDangBan(dangChayKhac);
  const [chon, setChon] = useState<Set<string>>(() => new Set(tiepTuc && r.nguoi?.length ? r.nguoi : []));
  const [moThem, setMoThem] = useState(false);
  const soLam = theoTen ? chon.size : n;
  const chuyen = [...chon].filter(m => ban.has(m)).length;
  const vuot = !theoTen && ranh !== null && n > ranh;
  // Chọn nhanh 1 chạm: người đã điểm danh có mặt và chưa làm hạng mục khác (vẫn chạm sửa từng tên được)
  const ranhCoMat = cv && theoTen ? coMatLuc(cv, ca, now).filter(m => !ban.has(m)) : [];
  const daChonHetRanh = ranhCoMat.length > 0 && ranhCoMat.every(m => chon.has(m));
  const dongTu = tiepTuc ? 'Tiếp tục' : 'Bắt đầu';
  return (
    <BottomSheet title={`${dongTu} ${r.hex} — ${theoTen ? 'ai làm?' : 'mấy người làm?'}`} onClose={onClose}
      footer={<button className={NUT_CHINH} disabled={soLam < 1} onClick={() => onBatDau(soLam, theoTen ? [...chon] : null, them)}>{dongTu} với {soLam} người</button>}>
      <div className="space-y-5 pb-2">
        {r.tenHangMuc && <p className="text-base text-slate-700">{r.tenHangMuc}</p>}
        {theoTen && (<>
          <p className={chuyen ? `text-base font-medium ${MAU.ngung.chu}` : CHU_PHU}>
            {chuyen ? `${chuyen} người đang làm hạng mục khác sẽ chuyển sang ${r.hex}.`
              : 'Chạm tên người làm hạng mục này. Tên mờ là người đang làm hạng mục khác (chọn thì chuyển sang).'}
          </p>
          {ranhCoMat.length > 0 && !daChonHetRanh && (
            <button className={`${NUT_PHU} w-full`} onClick={() => setChon(s => new Set([...s, ...ranhCoMat]))}>
              <Users size="1.1em" aria-hidden /> Chọn {ranhCoMat.length} người có mặt đang rảnh
            </button>
          )}
          <ChonNguoi coMat={caTo} ds={dsNguoi} chon={chon} onDoi={setChon} ban={ban} rong="Tổ chưa có danh sách người — thêm ở dưới." />
          {!moThem && <button className={`${NUT_PHU} w-full`} onClick={() => setMoThem(true)}>+ Thêm người tổ khác / người mới</button>}
          {moThem && cv?.to && (
            <ThemNguoi toId={cv.to.id} xuong={cv.to.xuong} daCo={new Set(caTo)}
              onChon={c => { setThem(t => [...t, c]); setChon(s => new Set([...s, c.mnv])); setMoThem(false); }} />
          )}
        </>)}
        {!theoTen && (<>
        <BoDem value={n} onChange={setN} lon min={1} max={500} nhan="số người làm hạng mục" />
        {quanSo !== null && (
          <p className={`text-base ${vuot ? `font-semibold ${MAU.loi.chu}` : 'text-slate-700'}`}>
            {vuot
              ? `Nhiều hơn số người đang rảnh (${ranh}) — tổ có ${quanSo} người, ${dangLamKhac} người đang làm hạng mục khác. Nên chia lại người.`
              : `Tổ có ${quanSo} người · ${dangLamKhac} đang làm hạng mục khác · còn rảnh ${ranh}.`}
          </p>
        )}
        {ranh !== null && ranh > 0 && ranh !== n && (
          <button className={`${NUT_PHU} w-full`} onClick={() => setN(ranh)}>Tất cả người đang rảnh ({ranh})</button>
        )}
        </>)}
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

export function TamNgungSheet({ r, onChon, onClose }: { r: DongViec; onChon: (ma: MaLyDo, tienDo: number | null) => void; onClose: () => void }) {
  // Tạm ngưng kèm cập nhật tiến độ % (MRA: "Cập nhật tiến độ" bật khi chọn Tạm ngưng) — không bắt buộc
  const [tienDo, setTienDo] = useState<number | null>(null);
  return (
    <BottomSheet title={`Tạm ngưng ${r.hex} — vì sao?`} onClose={onClose}>
      <div className="mb-4 space-y-2">
        <p className="text-base font-medium text-slate-800">Tiến độ đến lúc ngưng</p>
        <ChonTienDo value={tienDo} onChange={setTienDo} />
      </div>
      <div className="grid grid-cols-2 gap-3 pb-2">
        {LY_DO_TAM_NGUNG.map(l => {
          const Icon = ICON_LY_DO[l.ma];
          return (
            <button key={l.ma} onClick={() => onChon(l.ma, tienDo)}
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
// Tiến độ % (QT3 / QT4 "Cập nhật tiến độ") và ngày thực hiện (nhận / giao khai bù)
// ---------------------------------------------------------------------------
export const MUC_TIEN_DO = [25, 50, 75, 100] as const;
export function ChonTienDo({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tiến độ">
      {MUC_TIEN_DO.map(p => <button key={p} className={chip(value === p)} onClick={() => onChange(value === p ? null : p)}>{p}%</button>)}
    </div>
  );
}

export function TienDoSheet({ r, onLuu, onClose }: { r: DongViec; onLuu: (tienDo: number) => void; onClose: () => void }) {
  const [tienDo, setTienDo] = useState<number | null>(null);
  return (
    <BottomSheet title={`Cập nhật tiến độ ${r.hex}`} onClose={onClose}
      footer={<button className={NUT_CHINH} disabled={tienDo === null} onClick={() => tienDo !== null && onLuu(tienDo)}>
        {tienDo === null ? 'Chọn tiến độ' : `Lưu tiến độ ${tienDo}%`}</button>}>
      <div className="space-y-2 pb-2">
        {r.tenHangMuc && <p className="text-base text-slate-800">{r.tenHangMuc}</p>}
        <p className="text-base font-medium text-slate-800">Hạng mục đã làm được bao nhiêu?</p>
        <ChonTienDo value={tienDo} onChange={setTienDo} />
      </div>
    </BottomSheet>
  );
}

const ngayVN = (t: number) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
/** Mốc giờ của ngày thực hiện: hôm nay => undefined (giờ bấm); ngày trước => 12:00 giờ VN ngày đó (khai bù) */
export const lucCuaNgay = (ngay: string): number | undefined =>
  ngay === ngayVN(Date.now()) ? undefined : Date.parse(`${ngay}T12:00:00+07:00`);
/** Khai bù tối đa 7 ngày trước */
export function ChonNgayThucHien({ value, onChange }: { value: string; onChange: (ngay: string) => void }) {
  const homNay = ngayVN(Date.now());
  const homQua = ngayVN(Date.now() - 86_400_000);
  const toiThieu = ngayVN(Date.now() - 7 * 86_400_000);
  return (
    <div className="space-y-2">
      <p className="text-base font-medium text-slate-800">Ngày thực hiện</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className={chip(value === homNay)} onClick={() => onChange(homNay)}>Hôm nay</button>
        <button className={chip(value === homQua)} onClick={() => onChange(homQua)}>Hôm qua</button>
        <input type="date" className="min-h-14 rounded-2xl border border-slate-300 bg-white px-3 text-base" value={value}
          min={toiThieu} max={homNay} aria-label="Chọn ngày thực hiện"
          onChange={e => { const v = e.target.value; if (v && v >= toiThieu && v <= homNay) onChange(v); }} />
      </div>
      {value !== homNay && <p className={CHU_PHU}>Khai bù ngày {value.split('-').reverse().join('/')} — ghi lúc 12:00 ngày đó, quản lý thấy cờ "khai bù".</p>}
    </div>
  );
}
export const ngayHomNay = () => ngayVN(Date.now());

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
  onXacNhan: (p: { soLuong: number; den: string | null; anh: AnhChup[]; lucXayRa?: number }) => void; onClose: () => void;
}) {
  const [anh, setAnh] = useState<AnhChup[]>([]);
  const [ngay, setNgay] = useState(ngayHomNay);
  useGiaiPhongAnh([anh]);
  // Theo đơn vị của hạng mục: đơn vị đo / số lẻ => nhập số lẻ, giới hạn đúng số còn lại (không làm tròn)
  const soLe = choSoLe(r.dvt, r.slNhan, r.slHoanThanh, r.slGiao);
  const duoi = soLe ? 0.001 : 1;
  const conLai = lamTronSl(cheDo === 'xong' ? slConLam(r) : slChoGiao(r));
  const toiDa = Math.max(duoi, conLai);
  const [sl, setSl] = useState(toiDa);
  // Công đoạn cuối tuyến: Xong là hết (không có nơi giao tiếp); vẫn cho "Giao chỗ khác" nếu thật sự chuyển hàng đi
  const hetTuyen = cheDo === 'xong' && !!r.cuoiTuyen;
  const [den, setDen] = useState<string | null>(r.goiYKe.length === 1 ? r.goiYKe[0] : null);
  const [doiCho, setDoiCho] = useState(r.goiYKe.length === 0 && !r.cuoiTuyen);
  const ten = den ? tenCd(dm, den) : '…';
  const dv = r.dvt?.trim() || 'cái';
  const tieuDe = hetTuyen && !den ? `Xong ${hienSl(sl)} ${dv} — hết tuyến`
    : cheDo === 'xong' ? `Xong ${hienSl(sl)} ${dv} — giao sang ${ten}` : `Giao ${hienSl(sl)} ${dv} sang ${ten}`;
  return (
    <BottomSheet title={tieuDe} onClose={onClose}
      footer={
        <div className="space-y-3">
          {hetTuyen && !den ? (
            <button className={NUT_CHINH} onClick={() => onXacNhan({ soLuong: sl, den: null, anh, lucXayRa: lucCuaNgay(ngay) })}>Xong — hết tuyến</button>
          ) : (
          <button className={NUT_CHINH} disabled={!den} onClick={() => onXacNhan({ soLuong: sl, den, anh, lucXayRa: lucCuaNgay(ngay) })}>
            {cheDo === 'xong' ? 'Xong — giao' : 'Giao'}{den ? '' : ' (chọn nơi giao)'}
          </button>
          )}
          {cheDo === 'xong' && !hetTuyen && (
            <button className={`${NUT_PHU} w-full`} onClick={() => onXacNhan({ soLuong: sl, den: null, anh, lucXayRa: lucCuaNgay(ngay) })}>Xong, hàng chưa chuyển — giao sau</button>
          )}
        </div>
      }>
      <div className="space-y-5 pb-2">
        <div className="space-y-2">
          <p className="text-base font-medium text-slate-800">Số lượng {cheDo === 'xong' ? 'xong' : 'giao'}{r.dvt ? ` (${r.dvt})` : ''}</p>
          <BoDem value={sl} onChange={setSl} min={duoi} max={toiDa} soLe={soLe} nhan="số lượng" />
          {sl < toiDa && <p className={CHU_PHU}>Còn {hienSl(toiDa - sl)} {dv} ở lại tổ.</p>}
        </div>
        <div className="space-y-2">
          {!(hetTuyen && !doiCho) && <p className="text-base font-medium text-slate-800">Giao sang</p>}
          {hetTuyen && !doiCho && (
            <p className="flex flex-wrap items-center gap-x-2 text-base text-slate-700">
              Công đoạn cuối tuyến — xong là hạng mục xong ở xưởng, không cần giao.
              <button className="min-h-11 font-medium underline underline-offset-4" onClick={() => setDoiCho(true)}>Giao chỗ khác</button>
            </p>
          )}
          {r.goiYKe.length === 0 && !r.cuoiTuyen && <p className={`text-base ${MAU.ngung.chu}`}>Hạng mục chưa có tuyến — chọn nơi giao.</p>}
          {!doiCho && r.goiYKe.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.goiYKe.map(id => <button key={id} className={chip(den === id)} onClick={() => setDen(id)}>{tenCd(dm, id)}</button>)}
              <button className="min-h-14 px-2 text-base font-medium text-slate-700 underline underline-offset-4" onClick={() => setDoiCho(true)}>Giao chỗ khác</button>
            </div>
          )}
          {doiCho && <ChonCongDoan dm={dm} xuong={xuong} chon={den} setChon={id => setDen(id)} boQua={[r.congDoanId]} />}
        </div>
        <ChonNgayThucHien value={ngay} onChange={setNgay} />
        {anhBat && (
          <div className="space-y-2">
            <p className="text-base font-medium text-slate-800">{hetTuyen && !den ? 'Ảnh hàng lúc xong' : 'Ảnh hàng lúc giao'}</p>
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
export interface NhanKetQua { congDoanId: string; soLuong: number; congDoanNguonId?: string; xuongNguon?: string; anh: AnhChup[]; lucXayRa?: number }

export function NhanSheet({ hex, ten, cv, dm, onNhan, onClose }: {
  hex: string; ten: string | null; cv: CongViec; dm: DanhMucXuong | null;
  onNhan: (p: NhanKetQua) => void; onClose: () => void;
}) {
  // Giới hạn nhận theo số đã triển khai (chưa triển khai: SL đơn hàng) trừ số đã nhận — hỏi máy chủ; mất sóng thì
  // không chặn (máy chủ gắn cờ "Nhận vượt số lượng triển khai" để quản lý xem)
  const [gioiHan, setGioiHan] = useState<Record<string, { moc: number | null; loai: 'trien_khai' | 'don_hang' | null; daNhan: number; dvt: string | null }> | null>(null);
  useEffect(() => {
    let on = true;
    xuongApi.gioiHanNhan(hex, cv.to.id).then(r => {
      if (on && r.ok && r.data?.congDoan) setGioiHan(Object.fromEntries(r.data.congDoan.map(x => [x.congDoanId, x])));
    }).catch(() => { /* mất sóng: không chặn */ });
    return () => { on = false; };
  }, [hex, cv.to.id]);
  const [anh, setAnh] = useState<AnhChup[]>([]);
  const [xemTruoc, setXemTruoc] = useState(false);
  useGiaiPhongAnh([anh]);
  const choNhanCuaHex = cv.choNhan.filter(r => r.hex === hex);
  const [cd, setCd] = useState<string>(choNhanCuaHex[0]?.congDoanId ?? cv.congDoan[0]?.id ?? '');
  const dongCho = choNhanCuaHex.find(r => r.congDoanId === cd);
  const gh = gioiHan?.[cd];
  // Theo đơn vị của hạng mục (bảng sản xuất): đơn vị đo / số lẻ => nhập số lẻ; giới hạn = đúng số còn lại
  const dvt = gh?.dvt ?? dongCho?.dvt ?? null;
  const dv = dvt?.trim() || 'cái';
  const soLe = choSoLe(dvt, gh?.moc, gh?.daNhan, dongCho?.slGiaoDen, dongCho?.slNhan);
  const duoi = soLe ? 0.001 : 1;
  // Số lượng chỉ có đủ, không có vượt: tối đa = đã triển khai (đơn hàng) − đã nhận
  const toiDa = gh && gh.moc !== null ? Math.max(0, lamTronSl(gh.moc - gh.daNhan)) : null;
  const hetHan = toiDa !== null && toiDa < duoi;
  const [sl, setSl] = useState(dongCho ? Math.max(1, slChoNhan(dongCho)) : 1);
  const [nguon, setNguon] = useState<string | null>(null);
  // Mặc định = số còn phải nhận (tổ trước đã giao; chưa giao thì số còn lại theo triển khai / đơn hàng), không quá giới hạn
  useEffect(() => {
    const goiY = dongCho ? lamTronSl(slChoNhan(dongCho)) : toiDa;
    if (goiY === null || goiY === undefined) return;
    setSl(Math.max(duoi, toiDa !== null ? Math.min(goiY, toiDa) : goiY));
  }, [cd, toiDa]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ngay, setNgay] = useState(ngayHomNay);
  const canNguon = !dongCho;
  const xong = () => onNhan({
    congDoanId: cd, soLuong: sl, anh, lucXayRa: lucCuaNgay(ngay),
    ...(canNguon && nguon ? (nguon.startsWith('xuong:') ? { xuongNguon: nguon.slice(6) } : { congDoanNguonId: nguon }) : {}),
  });
  return (
    <BottomSheet title={`Nhận ${hex}`} onClose={onClose}
      footer={<button className={NUT_CHINH} disabled={!cd || hetHan || (canNguon && !nguon)} onClick={xong}>
        {hetHan ? 'Đã nhận đủ số triển khai' : `Nhận ${hienSl(sl)} ${dv}${canNguon && !nguon ? ' (chọn nơi giao tới)' : ''}`}
      </button>}>
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
          <p className="text-base font-medium text-slate-800">Số lượng nhận ({dv})</p>
          <BoDem value={sl} onChange={setSl} min={duoi} max={toiDa !== null && !hetHan ? toiDa : undefined} soLe={soLe} nhan="số lượng" />
          {gh && gh.moc !== null && (
            <p className={`text-base ${hetHan ? `font-semibold ${MAU.loi.chu}` : 'text-slate-700'}`}>
              {hetHan ? `Công đoạn đã nhận đủ ${hienSl(gh.moc)} ${dv} — ` : `Tối đa ${hienSl(toiDa!)} ${dv} — `}
              {gh.loai === 'trien_khai' ? `đã triển khai ${hienSl(gh.moc)}` : `số lượng đơn hàng ${hienSl(gh.moc)}`}{gh.daNhan > 0 && !hetHan ? `, đã nhận ${hienSl(gh.daNhan)}` : ''}
            </p>
          )}
          {dongCho && <p className={CHU_PHU}>Tổ trước đã giao {hienSl(dongCho.slGiaoDen)} {dv}, tổ đã nhận {hienSl(dongCho.slNhan)}.</p>}
        </div>
        <ChonNgayThucHien value={ngay} onChange={setNgay} />
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
  onKhai: (p: { loaiCa: LoaiCa; soNguoi: number; boChon: string[]; nguoi: string[] | null }) => void; onClose: () => void;
}) {
  const [ca, setCa] = useState<LoaiCa | null>(null);
  const [n0, setN] = useState(cv.soNguoiTangCaTruoc ?? cv.quanSo.chinh ?? 0);
  // Theo tên: chọn người tăng ca trong tổ (mặc định người đang có mặt ca chính)
  const theoTen = !!cv.chamCong && (cv.congNhan?.length ?? 0) > 0;
  const coMatChinh = theoTen ? coMatLuc(cv, 'chinh', Date.now()) : [];
  const dsTen = theoTen ? [...new Set([...coMatChinh, ...(cv.congNhan ?? []).filter(x => !x.toKhac).map(x => x.mnv)])] : [];
  const [chonTen, setChonTen] = useState<Set<string>>(() => new Set(coMatChinh));
  const n = theoTen ? chonTen.size : n0;
  const [bo, setBo] = useState<Set<string>>(new Set());
  const gio = (l: LoaiCa) => { const c = cv.lichCa.find(x => x.loaiCa === l); return c ? `${c.gioBatDau}–${c.gioKetThuc}` : ''; };
  return (
    <BottomSheet title="Khai tăng ca của tổ" onClose={onClose}
      footer={<button className={NUT_CHINH} disabled={!ca || n < 1} onClick={() => ca && onKhai({ loaiCa: ca, soNguoi: n, boChon: [...bo], nguoi: theoTen ? [...chonTen] : null })}>
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
        {theoTen ? (
          <div className="space-y-2">
            <p className="text-base font-medium text-slate-800">Người tăng ca · <span className="tabular-nums">{n}</span>
              <span className="font-normal text-slate-600"> (sẵn chọn người có mặt ca chính)</span></p>
            <ChonNguoi coMat={dsTen} ds={cv.congNhan ?? []} chon={chonTen} onDoi={setChonTen} />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-base font-medium text-slate-800">Số người tăng ca</p>
            <BoDem value={n} onChange={setN} nhan="số người tăng ca" max={500} />
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
  // Ảnh / tiến độ (không bắt buộc) gập lại — tổ nhiều hạng mục không phải cuộn qua từng ô ảnh
  const [mo, setMo] = useState<Set<string>>(new Set());
  return (
    <BottomSheet title="Xác nhận cuối ngày" onClose={onClose}
      footer={<button className={NUT_CHINH} disabled={thieu} onClick={() => onXacNhan(ds)}>{thieu ? 'Chọn giờ đã dừng' : 'Xác nhận'}</button>}>
      <div className="space-y-4 pb-2">
        <button className={`${NUT_PHU} w-full border-emerald-300 ${MAU.chay.chu}`}
          onClick={() => onXacNhan(ds.map(x => ({ ...x, vanLam: true, dungLuc: null })))}>
          <ClipboardCheck size="1.25em" aria-hidden /> Tất cả {ds.length} hạng mục vẫn đang làm — xác nhận luôn
        </button>
        {ds.length > 0 && <p className={CHU_PHU}>Hoặc chọn từng hạng mục bên dưới rồi bấm Xác nhận.</p>}
        <ul className={`${KHOI} ${KE} border border-slate-200`}>
          {ds.map((x, i) => (
            <li key={khoaDong(x.r)} className="space-y-2 px-4 py-3">
              <p className="truncate text-base" title={x.r.tenHangMuc ?? ''}><span className="font-semibold tabular-nums">{x.r.hex}</span> {x.r.tenHangMuc ?? ''}</p>
              <div className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1" role="radiogroup" aria-label={`${x.r.hex} cuối ngày`}>
                  <button role="radio" aria-checked={x.vanLam} onClick={() => sua(i, { vanLam: true, dungLuc: null })}
                    className={`min-h-11 whitespace-nowrap rounded-xl text-base ${x.vanLam ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600'}`}>Vẫn làm</button>
                  <button role="radio" aria-checked={!x.vanLam} onClick={() => sua(i, { vanLam: false })}
                    className={`min-h-11 whitespace-nowrap rounded-xl text-base ${!x.vanLam ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600'}`}>Đã dừng</button>
                </div>
                {(() => {
                  const k = khoaDong(x.r);
                  const daCo = x.anh.length > 0 || x.tienDo !== null;
                  return (
                    <button type="button" aria-expanded={mo.has(k)} aria-label={`Ảnh, tiến độ ${x.r.hex}`} onClick={() => setMo(s2 => { const t = new Set(s2); if (t.has(k)) t.delete(k); else t.add(k); return t; })}
                      className={`min-h-11 shrink-0 rounded-xl border px-3 text-base ${daCo ? `${MAU.chay.vien} ${MAU.chay.nen} ${MAU.chay.chu}` : 'border-slate-300 bg-white text-slate-700'}`}>
                      {daCo ? `${x.tienDo !== null ? `${x.tienDo}%` : ''}${x.tienDo !== null && x.anh.length ? ' · ' : ''}${x.anh.length ? `${x.anh.length} ảnh` : ''}` : <span className="flex items-center gap-1"><Camera size="1em" aria-hidden /> Thêm</span>}
                    </button>
                  );
                })()}
              </div>
              {!x.vanLam && (
                <div className="space-y-2">
                  <p className="text-base text-slate-700">Đã dừng lúc</p>
                  <div className="flex flex-wrap gap-2">
                    {mocs(x.r).map(m => <button key={m.ten} className={chip(x.dungLuc === m.luc)} onClick={() => sua(i, { dungLuc: m.luc })}>{m.ten}</button>)}
                  </div>
                </div>
              )}
              {mo.has(khoaDong(x.r)) && (<>
                {anhBat && <ChonAnh anh={x.anh} onDoi={a2 => sua(i, { anh: a2 })} />}
                <div className="space-y-2">
                  <p className="text-base text-slate-700">Tiến độ</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 75, 100].map(p2 => (
                      <button key={p2} className={chip(x.tienDo === p2)} onClick={() => sua(i, { tienDo: x.tienDo === p2 ? null : p2 })}>{p2}%</button>
                    ))}
                  </div>
                </div>
              </>)}
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
export function ChiaNguoiSheet({ dangChay, quanSo, cv, ca, now, onLuu, onClose }: {
  dangChay: DongViec[]; quanSo: number;
  cv?: CongViec | null; ca?: LoaiCa | null; now?: number;
  /** soNguoi theo khoá; tên người theo khoá khi chia theo tên */
  onLuu: (m: Record<string, number>, ten: Record<string, string[]> | null) => void; onClose: () => void;
}) {
  const [m, setM] = useState<Record<string, number>>(() => Object.fromEntries(dangChay.map(r => [khoaDong(r), r.soNguoi ?? 0])));
  const tong = Object.values(m).reduce((a, b) => a + b, 0);
  const theoTen = !!cv?.chamCong && daDiemDanh(cv, ca ?? null);
  const coMat = theoTen ? coMatLuc(cv!, ca ?? null, now ?? Date.now()) : [];
  const [ten, setTen] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(dangChay.map(r => [khoaDong(r), (r.nguoi ?? []).filter(x => coMat.includes(x))])));
  if (theoTen) return <ChiaTheoTen dangChay={dangChay} coMat={coMat} cv={cv!} ten={ten} setTen={setTen} onLuu={onLuu} onClose={onClose} />;
  return (
    <BottomSheet title="Chia người cho hạng mục" onClose={onClose}
      footer={<button className={NUT_CHINH} onClick={() => onLuu(m, null)}>Lưu</button>}>
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

/**
 * Chia người theo tên — tổ đông vẫn gọn: chọn hạng mục ở trên (A, B, C…), MỘT lưới người ở dưới; chạm tên = gắn vào
 * hạng mục đang chọn (đang ở hạng mục khác thì chuyển sang), chạm lại = bỏ. Trước: mỗi hạng mục một lưới đủ cả tổ
 * (40 người × 3 hạng mục = 120 ô).
 */
function ChiaTheoTen({ dangChay, coMat, cv, ten, setTen, onLuu, onClose }: {
  dangChay: DongViec[]; coMat: string[]; cv: CongViec;
  ten: Record<string, string[]>; setTen: (f: (t: Record<string, string[]>) => Record<string, string[]>) => void;
  onLuu: (m: Record<string, number>, ten: Record<string, string[]> | null) => void; onClose: () => void;
}) {
  const ds = cv.congNhan ?? [];
  const khoa = dangChay.map(khoaDong);
  const chu = (i: number) => String.fromCharCode(65 + (i % 26));
  const [dich, setDich] = useState(() => khoa[0]);
  const [loc, setLoc] = useState<'tat_ca' | 'chua_gan'>('tat_ca');
  const [tim, setTim] = useState('');
  const daGan = new Map<string, string>();
  for (const [k, v] of Object.entries(ten)) for (const x of v) daGan.set(x, k);
  const chuaGan = coMat.filter(x => !daGan.has(x));
  const tu = boDau(tim.trim());
  const hien = coMat.filter(x => (loc === 'tat_ca' || !daGan.has(x))
    && (!tu || boDau(`${ds.find(c => c.mnv === x)?.hoTen ?? ''} ${x}`).includes(tu)))
    .sort((x, y) => tenGon(x, ds).localeCompare(tenGon(y, ds), 'vi'));
  const ganVao = (ms: string[], k: string | null) => setTen(t => {
    const bo = new Set(ms);
    const out: Record<string, string[]> = {};
    for (const kk of Object.keys(t)) out[kk] = t[kk].filter(x => !bo.has(x));
    if (k) out[k] = [...(out[k] ?? []), ...ms];
    return out;
  });
  const cham = (x: string) => ganVao([x], daGan.get(x) === dich ? null : dich);
  /** Người chưa gắn: chia lần lượt vào hạng mục đang ít người nhất */
  const chiaDeu = () => setTen(t => {
    const out = Object.fromEntries(khoa.map(k => [k, [...(t[k] ?? [])]]));
    for (const x of chuaGan) {
      const k = khoa.reduce((a, b) => (out[b].length < out[a].length ? b : a));
      out[k].push(x);
    }
    return out;
  });
  const gon = coMat.length > 12;
  return (
    <BottomSheet title="Chia người cho hạng mục" onClose={onClose}
      footer={<button className={NUT_CHINH} onClick={() => onLuu(Object.fromEntries(khoa.map(k => [k, (ten[k] ?? []).length])), ten)}>
        Lưu{chuaGan.length ? ` · còn ${chuaGan.length} chưa gắn` : ''}</button>}>
      <div className="space-y-3 pb-2">
        {/* Dính trên: chọn hạng mục đích + lọc / tìm */}
        <div className="sticky top-0 z-10 -mx-5 space-y-2 border-b border-slate-100 bg-white px-5 pb-3 pt-1">
          {!gon && <p className={CHU_PHU}>Chọn hạng mục, rồi chạm tên người làm hạng mục đó.</p>}
          <div className="max-h-40 space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="Hạng mục">
            {dangChay.map((r, i) => {
              const k = khoa[i];
              const on = k === dich;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setDich(k)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3 py-1 text-left ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-800'}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${on ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'}`}>{chu(i)}</span>
                  <span className="min-w-0 flex-1 truncate text-base"><b className="tabular-nums">{r.hex}</b> {r.tenHangMuc ?? ''}</span>
                  <span className="shrink-0 text-base font-semibold tabular-nums">{(ten[k] ?? []).length} người</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {([['tat_ca', `Cả tổ ${coMat.length}`], ['chua_gan', `Chưa gắn ${chuaGan.length}`]] as const).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={loc === k} onClick={() => setLoc(k)}
                className={`h-10 shrink-0 whitespace-nowrap rounded-full border px-3 text-base tabular-nums ${loc === k ? 'border-slate-900 bg-slate-900 text-white' : chuaGan.length && k === 'chua_gan' ? `${MAU.ngung.vien} ${MAU.ngung.nen} ${MAU.ngung.chu}` : 'border-slate-300 bg-white text-slate-700'}`}>{t}</button>
            ))}
            {gon && (
              <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm tên" aria-label="Tìm người"
                className="h-10 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-slate-500" />
            )}
          </div>
          {chuaGan.length > 0 && (
            <div className="flex gap-2">
              {khoa.length > 1 && (
                <button type="button" onClick={chiaDeu} className={`${NUT_PHU} !min-h-11 flex-1`}>Chia đều {chuaGan.length}</button>
              )}
              <button type="button" onClick={() => ganVao(chuaGan, dich)} className={`${NUT_PHU} !min-h-11 flex-1`}>
                Gắn {chuaGan.length} vào {chu(khoa.indexOf(dich))}</button>
            </div>
          )}
        </div>
        {!coMat.length && <p className={CHU_PHU}>Chưa có ai điểm danh có mặt.</p>}
        {coMat.length > 0 && !hien.length && <p className={`rounded-2xl bg-slate-50 p-4 text-center ${CHU_PHU}`}>{tu ? 'Không ai khớp.' : 'Đã gắn hết người có mặt.'}</p>}
        <div className="grid grid-cols-2 gap-2">
          {hien.map(x => {
            const k = daGan.get(x);
            const on = k === dich;
            const i = k ? khoa.indexOf(k) : -1;
            return (
              <button key={x} type="button" aria-pressed={on} onClick={() => cham(x)}
                aria-label={`${tenGon(x, ds)}${k ? ` — đang ở ${dangChay[i]?.hex}` : ' — chưa gắn'}`}
                className={`flex min-h-12 min-w-0 items-center gap-2 rounded-2xl border px-3 py-1.5 text-left text-base active:opacity-80 ${
                  on ? 'border-slate-900 bg-slate-900 text-white' : k ? 'border-slate-200 bg-slate-50 text-slate-600' : `border-dashed ${MAU.ngung.vien} bg-white text-slate-900`}`}>
                <span className="min-w-0 flex-1 truncate">{tenGon(x, ds)}</span>
                {/* Chữ hạng mục người này đang làm; chưa gắn thì không có */}
                {i >= 0 && <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${on ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'}`}>{chu(i)}</span>}
              </button>
            );
          })}
        </div>
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

/**
 * Thanh việc của tổ — hiện thẳng ra ngoài (không menu "⋯").
 * Điện thoại: 1 hàng vuốt ngang (trước lưới 2 hàng đẩy danh sách việc xuống dưới thanh Quét phiếu);
 * màn rộng: tự xuống hàng.
 */
export function ThanhViec({ muc }: {
  muc: Array<{ ten: string; icon: 'lichsu' | 'tangca' | 'xacnhan' | 'quanso' | 'trienkhai'; onClick: () => void; phu?: string; noi?: boolean }>;
}) {
  const ICON: Record<string, ReactNode> = {
    lichsu: <History size="1.1em" />, tangca: <Moon size="1.1em" />, xacnhan: <ClipboardCheck size="1.1em" />,
    quanso: <Users size="1.1em" />, trienkhai: <Rocket size="1.1em" />,
  };
  return (
    <nav aria-label="Việc của tổ" className={`-mx-4 flex gap-2 overflow-x-auto px-4 ${NO_SCROLLBAR} rmd:mx-0 rmd:flex-wrap rmd:overflow-visible rmd:px-0`}>
      {muc.map(m => (
        <button key={m.ten} type="button" onClick={m.onClick}
          className={`flex min-h-12 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-base active:opacity-80 ${
            m.noi ? `${MAU.ngung.vien} ${MAU.ngung.nen} ${MAU.ngung.chu} font-medium` : 'border-slate-200 bg-white text-slate-800'}`}>
          <span className={m.noi ? '' : 'text-slate-600'} aria-hidden>{ICON[m.icon]}</span>
          <span>{m.ten}{m.phu && <span className={m.noi ? '' : 'text-slate-600'}> · {m.phu}</span>}</span>
        </button>
      ))}
    </nav>
  );
}
