import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, UserPlus, Search as SearchIcon, Loader2, X } from 'lucide-react';
import { BottomSheet } from '../mobileUi';
import {
  TEN_CA, hhmm, mocTrongNgay, coMatLuc, tenGon,
  type CongViec, type CongNhanTo, type LoaiCa,
} from '../../../services/xuongModel';
import { xuongApi, type CongNhanTim } from '../../../services/xuongApi';
import { NUT_CHINH, NUT_PHU, CHU_PHU, MAU } from './xuongUi';

// ============================================================================
// CHẤM CÔNG THEO NGƯỜI (docs/designs/xuong-cham-cong.md)
// - DiemDanhSheet: đầu ca tick người có mặt ("Tất cả có mặt" là mặc định), đến trễ / về sớm, mượn người tổ khác,
//   thêm người mới vào tổ. Lưu = sự kiện vao_ca / ra_ca + quan_so (quân số = số người có mặt).
// - ChonNguoi: lưới chip tên để chọn người làm hạng mục (Bắt đầu, Chia người, Tăng ca).
// ============================================================================

export interface KetQuaDiemDanh {
  vao: Array<{ mnv: string; luc: number }>;
  ra: Array<{ mnv: string; luc: number; lyDo: string }>;
  /** Số người có mặt sau khi lưu = quân số */
  soCoMat: number;
}

const LY_DO_RA = [
  { ma: 've_som', ten: 'Về sớm' },
  { ma: 'nghi_giua_ca', ten: 'Nghỉ giữa ca' },
  { ma: 'chuyen_to', ten: 'Sang tổ khác' },
  { ma: 'vang', ten: 'Vắng (tick nhầm)' },
] as const;

/** Xếp theo tên (chữ cuối của họ tên), rồi họ */
const theoTen = (a: CongNhanTo, b: CongNhanTo) => {
  const t = (x: CongNhanTo) => { const p = x.hoTen.trim().split(/\s+/); return `${p[p.length - 1]} ${x.hoTen}`; };
  return t(a).localeCompare(t(b), 'vi');
};

/** Bỏ dấu tiếng Việt để tìm không cần gõ dấu ("hung" ra "Hùng") */
export const boDau = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const phut = (ms: number) => { const d = new Date(ms + 7 * 3_600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hhmmTuPhut = (p: number) => `${String(Math.floor(p / 60)).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`;

function chipNguoi(on: boolean, ban = false) {
  return `flex min-h-14 min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-base ${
    on ? 'border-slate-900 bg-slate-900 text-white' : ban ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-300 bg-white text-slate-800'
  } active:opacity-80`;
}

/** Tìm người (mượn tổ khác) hoặc thêm người mới vào tổ — cần có sóng */
export function ThemNguoi({ toId, xuong, daCo, onChon }: {
  toId: number; xuong: string | null; daCo: Set<string>;
  onChon: (c: CongNhanTo, laNguoiMoiCuaTo: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [kq, setKq] = useState<CongNhanTim[] | null>(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [moi, setMoi] = useState<{ mnv: string; hoTen: string } | null>(null);
  const lan = useRef(0);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setKq(null); return; }
    const id = ++lan.current;
    setDang(true);
    const hen = setTimeout(async () => {
      const r = await xuongApi.timCongNhan(t, xuong);
      if (id !== lan.current) return;
      setDang(false);
      if (r.ok && r.data) { setKq(r.data.ketQua ?? []); setLoi(''); }
      else setLoi(r.status === 0 ? 'Đang mất sóng — tìm / thêm người cần có sóng.' : (r.message || 'Không tìm được'));
    }, 300);
    return () => clearTimeout(hen);
  }, [q, xuong]);

  const luuMoi = async () => {
    if (!moi) return;
    setDang(true); setLoi('');
    const r = await xuongApi.themCongNhan(toId, moi.mnv.trim(), moi.hoTen.trim());
    setDang(false);
    if (r.ok && r.data) { onChon({ mnv: r.data.congNhan.mnv, hoTen: r.data.congNhan.hoTen, toKhac: null }, true); setMoi(null); setQ(''); }
    else setLoi(r.status === 0 ? 'Đang mất sóng — thêm người cần có sóng.' : (r.message || 'Không thêm được'));
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <label className="relative block">
        <SearchIcon size="1.1em" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên hoặc mã NV" aria-label="Tìm người"
          className="h-14 w-full rounded-2xl border border-slate-300 bg-white pl-10 pr-10 text-lg text-slate-900 outline-none focus:border-slate-500" />
        {dang && <Loader2 size="1.1em" className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" aria-hidden />}
      </label>
      {loi && <p className={`rounded-xl ${MAU.loi.nen} p-2 text-base ${MAU.loi.chu}`} role="alert">{loi}</p>}
      {kq && kq.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {kq.map(c => {
            const co = daCo.has(c.mnv);
            const cuaTo = c.toId === toId;
            return (
              <li key={c.mnv}>
                <button type="button" disabled={co} onClick={() => onChon({ mnv: c.mnv, hoTen: c.hoTen, toKhac: cuaTo ? null : (c.tenTo ?? 'chưa xếp tổ') }, false)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50 disabled:opacity-50">
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-slate-900">{c.hoTen}</span>
                    <span className={CHU_PHU}>{c.mnv}{c.tenTo ? ` · ${c.tenTo}` : ' · chưa xếp tổ'}</span>
                  </span>
                  <span className="shrink-0 text-base text-slate-600">{co ? 'Đã có' : cuaTo ? 'Thêm' : 'Mượn'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {kq && kq.length === 0 && !moi && (
        <button type="button" className={`${NUT_PHU} w-full`}
          onClick={() => setMoi(/^[a-z0-9]+$/i.test(q.trim()) ? { mnv: q.trim().toUpperCase(), hoTen: '' } : { mnv: '', hoTen: q.trim() })}>
          <UserPlus size="1.1em" aria-hidden /> Thêm người mới vào tổ
        </button>
      )}
      {moi && (
        <div className="space-y-2">
          <input value={moi.mnv} onChange={e => setMoi({ ...moi, mnv: e.target.value.toUpperCase() })} placeholder="Mã NV (vd AAF7615)" aria-label="Mã nhân viên"
            className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg uppercase text-slate-900 outline-none focus:border-slate-500" />
          <input value={moi.hoTen} onChange={e => setMoi({ ...moi, hoTen: e.target.value })} placeholder="Họ tên" aria-label="Họ tên"
            className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg text-slate-900 outline-none focus:border-slate-500" />
          <div className="flex gap-2">
            <button type="button" className={`${NUT_PHU} flex-1`} onClick={() => setMoi(null)}>Huỷ</button>
            <button type="button" className={`${NUT_PHU} flex-1 !border-slate-900`} disabled={dang || moi.mnv.trim().length < 2 || !moi.hoTen.trim()} onClick={luuMoi}>Thêm vào tổ</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DiemDanhSheet({ ca, cv, now, onLuu, onChiNhapSo, onClose }: {
  ca: LoaiCa; cv: CongViec; now: number;
  onLuu: (kq: KetQuaDiemDanh, nguoiMoi: CongNhanTo[]) => void;
  /** Bỏ qua điểm danh tên, chỉ nhập số người (cách cũ) */
  onChiNhapSo: () => void;
  onClose: () => void;
}) {
  const lich = cv.lichCa.find(x => x.loaiCa === ca);
  const batDauCa = lich ? mocTrongNgay(cv.ngay, lich.gioBatDau) : now;
  const coMatTruoc = useMemo(() => new Set(coMatLuc(cv, ca, now)), [cv, ca, now]);
  const lanDau = (cv.coMat?.[ca]?.length ?? 0) === 0;
  const [ds, setDs] = useState<CongNhanTo[]>(() => {
    const goc = [...(cv.congNhan ?? [])];
    // Người có mặt (mượn) chưa có trong danh sách
    for (const m of coMatTruoc) if (!goc.some(x => x.mnv === m)) goc.push({ mnv: m, hoTen: m, toKhac: null });
    return goc.sort(theoTen);
  });
  const [tim, setTim] = useState('');
  const [nguoiMoi, setNguoiMoi] = useState<CongNhanTo[]>([]);
  // Lần đầu trong ca: mặc định cả tổ có mặt (bỏ tick người vắng nhanh hơn tick từng người)
  const [chon, setChon] = useState<Set<string>>(() => new Set(lanDau ? ds.filter(x => !x.toKhac).map(x => x.mnv) : coMatTruoc));
  // Giờ cho người vừa tick / bỏ tick: lần điểm danh đầu (hoặc trong 30 phút đầu ca) = đúng giờ đầu ca — tổ trưởng
  // điểm danh muộn thì cả tổ không bị tính trễ; sau đó (đến trễ / về sớm) = giờ hiện tại
  const [gio, setGio] = useState(() => hhmmTuPhut(lanDau || now < batDauCa + 30 * 60_000 ? phut(batDauCa) : phut(now)));
  const [lyDo, setLyDo] = useState<string>('ve_som');
  // Đến trễ theo từng người: mã NV → giờ đến 'HH:MM' (bấm "Trễ" cạnh tên)
  const [tre, setTre] = useState<Record<string, string>>({});
  // Về sớm theo từng người (người đang có mặt): mã NV → giờ ra + lý do (bấm "Về sớm" cạnh tên)
  const [ve, setVe] = useState<Record<string, { gio: string; lyDo: string }>>({});
  const [them, setThem] = useState(false);
  // Tổ đông: dòng gọn hơn (mã NV cùng dòng với tên), thanh trên dính (đếm, tìm, lọc) khi cuộn
  const gon = ds.length > 12;
  const [loc, setLoc] = useState<'tat_ca' | 'vang' | 'tre_ve'>('tat_ca');
  // Đổi lọc / tìm: cuộn danh sách về đầu (không thì danh sách ngắn lại bị khuất dưới thanh dính)
  const thanhTren = useRef<HTMLDivElement>(null);
  useEffect(() => { thanhTren.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0 }); }, [loc, tim]);

  const vaoMoi = [...chon].filter(m => !coMatTruoc.has(m));
  const vaoDungGio = vaoMoi.filter(m => !tre[m]);
  const raMoi = [...coMatTruoc].filter(m => !chon.has(m));
  const raChung = raMoi.filter(m => !ve[m]);
  const doi = vaoMoi.length > 0 || raMoi.length > 0;
  const lucChon = mocTrongNgay(cv.ngay, gio);
  const tu = boDau(tim.trim());
  const soVang = ds.filter(x => !chon.has(x.mnv)).length;
  const soTreVe = ds.filter(x => tre[x.mnv] || ve[x.mnv]).length;
  const hop = (x: CongNhanTo) => (!tu || boDau(`${x.hoTen} ${x.mnv}`).includes(tu))
    && (loc === 'tat_ca' || (loc === 'vang' ? !chon.has(x.mnv) : !!(tre[x.mnv] || ve[x.mnv])));
  const tenMuon = ds.filter(x => x.toKhac && hop(x));
  const cuaTo = ds.filter(x => !x.toKhac && hop(x));

  const xoa = <T,>(o: Record<string, T>, m: string) => { if (!(m in o)) return o; const x = { ...o }; delete x[m]; return x; };
  const bat = (m: string) => {
    setChon(s => { const t = new Set(s); if (t.has(m)) t.delete(m); else t.add(m); return t; });
    setTre(t => xoa(t, m));
    setVe(t => xoa(t, m));
  };
  /** Bấm "Về sớm": bỏ tick + giờ ra / lý do riêng (mặc định bây giờ, về sớm) */
  const datVe = (m: string) => {
    setChon(s => { const t = new Set(s); t.delete(m); return t; });
    setVe(t => ({ ...t, [m]: { gio: hhmmTuPhut(phut(now)), lyDo: 've_som' } }));
  };
  const boVe = (m: string) => { setVe(t => xoa(t, m)); setChon(s => new Set([...s, m])); };
  /** Bấm "Trễ": tick có mặt + giờ đến riêng (mặc định bây giờ) */
  const datTre = (m: string) => {
    setChon(s => new Set([...s, m]));
    setTre(t => ({ ...t, [m]: hhmmTuPhut(phut(Math.max(now, batDauCa))) }));
  };
  const boTre = (m: string) => setTre(t => { const x = { ...t }; delete x[m]; return x; });
  const luu = () => {
    const vao = vaoMoi.map(mnv => ({ mnv, luc: tre[mnv] ? mocTrongNgay(cv.ngay, tre[mnv]) : lucChon }));
    const ra = raMoi.map(mnv => {
      // Vắng (tick nhầm): rời đúng lúc vào => khoảng rỗng, không tính giờ
      const vaoLuc = cv.coMat?.[ca]?.find(x => x.mnv === mnv && x.ra === null)?.vao ?? lucChon;
      const rieng = ve[mnv];
      const ly = rieng?.lyDo ?? lyDo;
      const luc = rieng ? mocTrongNgay(cv.ngay, rieng.gio) : lucChon;
      return { mnv, luc: ly === 'vang' ? vaoLuc : luc, lyDo: ly };
    });
    onLuu({ vao, ra, soCoMat: chon.size }, nguoiMoi);
  };

  const dong = (c: CongNhanTo) => {
    const on = chon.has(c.mnv);
    const vao = cv.coMat?.[ca]?.find(x => x.mnv === c.mnv && x.ra === null)?.vao;
    // Người chưa có mặt: nút Trễ (vào kèm giờ đến). Người đang có mặt: nút Về sớm (ra kèm giờ / lý do riêng)
    const dangCo = coMatTruoc.has(c.mnv);
    const gioTre = tre[c.mnv];
    const veRieng = ve[c.mnv];
    const nutPhu = (bat2: boolean, chu: string, onClick: () => void, nhan: string) => (
      <button type="button" onClick={onClick} aria-pressed={bat2} aria-label={nhan}
        className={`${gon ? 'h-10 px-2.5' : 'h-12 px-3'} shrink-0 rounded-xl border text-base font-medium active:opacity-80 ${bat2 ? `${MAU.ngung.vien} ${MAU.ngung.nen} ${MAU.ngung.chu}` : 'border-slate-300 bg-white text-slate-700'}`}>
        {chu}
      </button>
    );
    const oGio = `h-12 min-w-0 rounded-xl border ${MAU.ngung.vien} bg-white px-3 text-lg tabular-nums text-slate-900`;
    const tt = on ? (gioTre ? `đến trễ ${gioTre}` : 'có mặt') : veRieng ? `về sớm ${veRieng.gio}` : 'vắng';
    return (
      <li key={c.mnv}>
        <div className="flex items-center gap-2 pr-3">
          <button type="button" onClick={() => bat(c.mnv)} aria-pressed={on} aria-label={`${c.hoTen} (${c.mnv}) — ${tt}`}
            className={`flex ${gon ? 'min-h-12 py-1' : 'min-h-16 py-2'} min-w-0 flex-1 items-center gap-3 pl-4 text-left active:bg-slate-50`}>
            <span className={`flex ${gon ? 'h-7 w-7' : 'h-8 w-8'} shrink-0 items-center justify-center rounded-lg border-2 ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`} aria-hidden>
              {on && <Check size="1.1em" strokeWidth={3} />}
            </span>
            {gon ? (
              <span className="min-w-0 flex-1 truncate text-base">
                <span className="font-medium text-slate-900">{c.hoTen}</span>
                <span className="text-slate-500"> · {c.mnv.slice(-4)}{c.toKhac ? ` · ${c.toKhac}` : ''}{vao ? ` · ${hhmm(vao)}` : ''}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium text-slate-900">{c.hoTen}</span>
                <span className={CHU_PHU}>{c.mnv}{c.toKhac ? ` · mượn từ ${c.toKhac}` : ''}{vao ? ` · vào ${hhmm(vao)}` : ''}</span>
              </span>
            )}
          </button>
          {!dangCo && nutPhu(!!gioTre, 'Trễ', () => (gioTre ? boTre(c.mnv) : datTre(c.mnv)), gioTre ? `Bỏ trễ ${c.hoTen}` : `${c.hoTen} đến trễ`)}
          {dangCo && nutPhu(!!veRieng, 'Về sớm', () => (veRieng ? boVe(c.mnv) : datVe(c.mnv)), veRieng ? `Bỏ về sớm ${c.hoTen}` : `${c.hoTen} về sớm`)}
        </div>
        {gioTre && (
          <label className="flex items-center gap-3 pb-3 pl-[3.75rem] pr-3">
            <span className={`text-base font-medium ${MAU.ngung.chu}`}>Đến lúc</span>
            <input type="time" value={gioTre} aria-label={`Giờ đến của ${c.hoTen}`}
              onChange={e => e.target.value && setTre(t => ({ ...t, [c.mnv]: e.target.value }))} className={`${oGio} flex-1`} />
          </label>
        )}
        {veRieng && (
          <div className="flex flex-wrap items-center gap-2 pb-3 pl-[3.75rem] pr-3">
            <span className={`text-base font-medium ${MAU.ngung.chu}`}>Ra lúc</span>
            <input type="time" value={veRieng.gio} aria-label={`Giờ ra của ${c.hoTen}`}
              onChange={e => e.target.value && setVe(t => ({ ...t, [c.mnv]: { ...t[c.mnv], gio: e.target.value } }))} className={`${oGio} flex-1`} />
            <select value={veRieng.lyDo} aria-label={`Lý do ra của ${c.hoTen}`}
              onChange={e => setVe(t => ({ ...t, [c.mnv]: { ...t[c.mnv], lyDo: e.target.value } }))}
              className={`h-12 w-full rounded-xl border ${MAU.ngung.vien} bg-white px-3 text-base text-slate-900`}>
              {LY_DO_RA.map(l => <option key={l.ma} value={l.ma}>{l.ten}</option>)}
            </select>
          </div>
        )}
      </li>
    );
  };

  return (
    <BottomSheet title={`Điểm danh ${TEN_CA[ca].toLowerCase()}`} onClose={onClose}
      footer={<div className="space-y-2">
        {/* Giờ vào / ra chung + lý do: ngay trên nút Lưu — tổ đông không phải cuộn xuống cuối danh sách */}
        {(vaoDungGio.length > 0 || raChung.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-base font-medium text-slate-800">
              {vaoDungGio.length > 0 && raChung.length === 0 ? `Giờ vào (${vaoDungGio.length})` : raChung.length > 0 && vaoDungGio.length === 0 ? `Giờ ra (${raChung.length})` : 'Giờ vào / ra'}
            </span>
            <input type="time" value={gio} onChange={e => e.target.value && setGio(e.target.value)} aria-label="Giờ vào / ra"
              className="h-12 w-40 shrink-0 rounded-xl border border-slate-300 bg-white px-2 text-lg tabular-nums text-slate-900" />
            {raChung.length > 0 && (
              <select value={lyDo} onChange={e => setLyDo(e.target.value)} aria-label="Lý do ra"
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-2 text-base text-slate-900">
                {LY_DO_RA.map(l => <option key={l.ma} value={l.ma}>{l.ten}</option>)}
              </select>
            )}
          </div>
        )}
        <button className={NUT_CHINH} disabled={!doi && !lanDau} onClick={luu}>
          {/* Có người vắng thì chữ ngắn lại cho vừa 1 dòng */}
          {!lanDau && !doi ? `${chon.size} người có mặt`
            : soVang > 0 ? `Lưu · ${chon.size} có mặt, ${soVang} vắng`
              : `${lanDau ? 'Lưu điểm danh' : 'Lưu thay đổi'} · ${chon.size} có mặt`}
        </button>
      </div>}>
      <div className="space-y-4 pb-2">
        <div ref={thanhTren} className={gon ? 'sticky top-0 z-10 -mx-5 space-y-2 border-b border-slate-100 bg-white px-5 pb-3 pt-1' : 'space-y-4'}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-semibold text-slate-900"><span className="tabular-nums">{chon.size}</span> / {ds.length} có mặt</p>
            <div className="flex gap-2">
              <button type="button" className={`${NUT_PHU} ${gon ? '!min-h-12' : ''}`} onClick={() => setChon(new Set(ds.map(x => x.mnv)))}>Tất cả</button>
              <button type="button" className={`${NUT_PHU} ${gon ? '!min-h-12' : ''}`} onClick={() => setChon(new Set())}>Bỏ hết</button>
            </div>
          </div>
          {gon && (<>
            <label className="relative block">
              <SearchIcon size="1.1em" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
              <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm tên / mã NV trong tổ" aria-label="Tìm trong tổ"
                className="h-12 w-full rounded-2xl border border-slate-300 bg-white pl-10 pr-12 text-lg text-slate-900 outline-none focus:border-slate-500" />
              {tim && (
                <button type="button" aria-label="Xoá tìm" onClick={() => setTim('')}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 active:bg-slate-100">
                  <X size="1.1em" />
                </button>
              )}
            </label>
            {/* Lọc nhanh: soát lại người vắng / người trễ – về sớm mà không phải cuộn cả tổ */}
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="Lọc danh sách">
              {([['tat_ca', `Cả tổ ${ds.length}`], ['vang', `Vắng ${soVang}`], ['tre_ve', `Trễ, về sớm ${soTreVe}`]] as const).map(([k, ten]) => (
                <button key={k} type="button" role="radio" aria-checked={loc === k} onClick={() => setLoc(k)}
                  className={`h-10 shrink-0 whitespace-nowrap rounded-full border px-3 text-base tabular-nums ${loc === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                  {ten}
                </button>
              ))}
            </div>
          </>)}
        </div>

        {ds.length === 0 && (
          <p className={`rounded-2xl ${MAU.ngung.nen} p-3 text-base ${MAU.ngung.chu}`}>
            Tổ chưa có danh sách công nhân. Bấm <b>Thêm người</b> để thêm từng người (lần sau app nhớ), hoặc chỉ nhập số người.
          </p>
        )}

        {ds.length > 0 && !cuaTo.length && !tenMuon.length && (
          <p className={`rounded-2xl bg-slate-50 p-4 text-center ${CHU_PHU}`}>
            {tu ? `Không có ai khớp "${tim.trim()}".` : loc === 'vang' ? 'Không ai vắng.' : 'Không ai trễ / về sớm.'}
          </p>
        )}
        {cuaTo.length > 0 && <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">{cuaTo.map(dong)}</ul>}
        {tenMuon.length > 0 && (
          <div className="space-y-2">
            <p className="text-base font-semibold text-slate-700">Người tổ khác</p>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">{tenMuon.map(dong)}</ul>
          </div>
        )}

        {them
          ? <ThemNguoi toId={cv.to.id} xuong={cv.to.xuong} daCo={new Set(ds.map(x => x.mnv))}
              onChon={(c, moi) => {
                setDs(d => (d.some(x => x.mnv === c.mnv) ? d : [...d, c]));
                if (moi) setNguoiMoi(n => [...n, c]);
                setChon(s => new Set([...s, c.mnv]));
                setThem(false);
              }} />
          : <button type="button" className={`${NUT_PHU} w-full`} onClick={() => setThem(true)}><UserPlus size="1.1em" aria-hidden /> Thêm người / mượn người tổ khác</button>}

        {lanDau && <p className={CHU_PHU}>Lần điểm danh đầu tính mọi người vào đúng giờ đầu ca. Ai đến trễ: bấm <b>Trễ</b> cạnh tên và chỉnh giờ đến.</p>}

        <button type="button" className="min-h-11 w-full text-left text-base font-medium text-slate-600 underline underline-offset-4" onClick={onChiNhapSo}>
          Không điểm danh tên — chỉ nhập số người
        </button>
      </div>
    </BottomSheet>
  );
}

/**
 * Lưới chip chọn người; `ban` = người đang ở hạng mục khác (chọn thì chuyển sang).
 * Tổ đông (> 12 người): thanh dính trên cùng — đếm, lọc (Cả tổ / Đã chọn / Rảnh), tìm không dấu, Chọn hết / Bỏ hết
 * (áp cho những người đang hiện). Tên xếp theo ABC.
 */
export function ChonNguoi({ coMat, ds, chon, onDoi, ban, rong }: {
  coMat: string[]; ds: CongNhanTo[]; chon: Set<string>; onDoi: (s: Set<string>) => void; ban?: Map<string, string>;
  /** Câu khi danh sách trống */
  rong?: string;
}) {
  const [tim, setTim] = useState('');
  const [loc, setLoc] = useState<'tat_ca' | 'chon' | 'ranh'>('tat_ca');
  if (!coMat.length) return <p className={CHU_PHU}>{rong ?? 'Chưa có ai điểm danh có mặt.'}</p>;
  const gon = coMat.length > 12;
  const tu = boDau(tim.trim());
  const ten = (m: string) => ds.find(c => c.mnv === m)?.hoTen ?? m;
  const soRanh = ban ? coMat.filter(m => !ban.has(m)).length : 0;
  const hien = [...coMat]
    .filter(m => (loc === 'tat_ca' || (loc === 'chon' ? chon.has(m) : !ban?.has(m)))
      && (!tu || boDau(`${ten(m)} ${m}`).includes(tu)))
    .sort((x, y) => tenGon(x, ds).localeCompare(tenGon(y, ds), 'vi'));
  const nutLoc = (k: typeof loc, chu: string) => (
    <button key={k} type="button" aria-pressed={loc === k} onClick={() => setLoc(k)}
      className={`h-10 shrink-0 whitespace-nowrap rounded-full border px-3 text-base tabular-nums ${loc === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{chu}</button>
  );
  return (
    <div className="space-y-2">
      {gon && (
        <div className="sticky top-0 z-10 -mx-5 space-y-2 border-b border-slate-100 bg-white px-5 pb-2 pt-1">
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
            {nutLoc('tat_ca', `Cả tổ ${coMat.length}`)}
            {nutLoc('chon', `Đã chọn ${chon.size}`)}
            {ban && ban.size > 0 && nutLoc('ranh', `Rảnh ${soRanh}`)}
          </div>
          <div className="flex gap-2">
            <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm tên" aria-label="Tìm người"
              className="h-10 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-slate-500" />
            <button type="button" onClick={() => onDoi(new Set([...chon, ...hien]))}
              className="h-10 shrink-0 rounded-full border border-slate-300 bg-white px-3 text-base text-slate-700">Chọn hết</button>
            <button type="button" onClick={() => { const bo = new Set(hien); onDoi(new Set([...chon].filter(m => !bo.has(m)))); }}
              className="h-10 shrink-0 rounded-full border border-slate-300 bg-white px-3 text-base text-slate-700">Bỏ hết</button>
          </div>
        </div>
      )}
      {!hien.length && <p className={`rounded-2xl bg-slate-50 p-4 text-center ${CHU_PHU}`}>{tu ? 'Không ai khớp.' : 'Không có ai.'}</p>}
      <div className="grid grid-cols-2 gap-2">
        {hien.map(m => {
          const on = chon.has(m);
          const o = ban?.get(m);
          return (
            <button key={m} type="button" aria-pressed={on} className={`${chipNguoi(on, !!o && !on)} ${gon ? '!min-h-12 !py-1.5' : ''}`}
              onClick={() => { const t = new Set(chon); if (on) t.delete(m); else t.add(m); onDoi(t); }}>
              <span className="min-w-0 flex-1 truncate">{tenGon(m, ds)}</span>
              {on ? <Check size="1em" aria-hidden /> : o ? <span className="shrink-0 text-base tabular-nums">…{o.slice(-4)}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Dòng tên người làm một hạng mục (gọn) */
export function TenNguoiLam({ nguoi, ds, onBo }: { nguoi: string[]; ds: CongNhanTo[]; onBo?: (m: string) => void }) {
  return (
    <span className="flex flex-wrap gap-1">
      {nguoi.map(m => (
        <span key={m} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-base text-slate-700">
          {tenGon(m, ds)}
          {onBo && <button type="button" aria-label={`Bỏ ${m}`} onClick={() => onBo(m)}><X size="0.9em" /></button>}
        </span>
      ))}
    </span>
  );
}
