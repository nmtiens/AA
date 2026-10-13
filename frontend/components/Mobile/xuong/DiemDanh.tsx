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

const phut = (ms: number) => { const d = new Date(ms + 7 * 3_600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hhmmTuPhut = (p: number) => `${String(Math.floor(p / 60)).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`;

function chipNguoi(on: boolean, ban = false) {
  return `flex min-h-14 min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-base ${
    on ? 'border-slate-900 bg-slate-900 text-white' : ban ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-300 bg-white text-slate-800'
  } active:opacity-80`;
}

/** Tìm người (mượn tổ khác) hoặc thêm người mới vào tổ — cần có sóng */
function ThemNguoi({ toId, xuong, daCo, onChon }: {
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
    return goc;
  });
  const [nguoiMoi, setNguoiMoi] = useState<CongNhanTo[]>([]);
  // Lần đầu trong ca: mặc định cả tổ có mặt (bỏ tick người vắng nhanh hơn tick từng người)
  const [chon, setChon] = useState<Set<string>>(() => new Set(lanDau ? ds.filter(x => !x.toKhac).map(x => x.mnv) : coMatTruoc));
  // Giờ cho người vừa tick / bỏ tick: điểm danh trong 30 phút đầu ca = đúng giờ ca
  const [gio, setGio] = useState(() => hhmmTuPhut(now < batDauCa + 30 * 60_000 ? phut(batDauCa) : phut(now)));
  const [lyDo, setLyDo] = useState<string>('ve_som');
  const [them, setThem] = useState(false);

  const vaoMoi = [...chon].filter(m => !coMatTruoc.has(m));
  const raMoi = [...coMatTruoc].filter(m => !chon.has(m));
  const doi = vaoMoi.length > 0 || raMoi.length > 0;
  const lucChon = mocTrongNgay(cv.ngay, gio);
  const tenMuon = ds.filter(x => x.toKhac);
  const cuaTo = ds.filter(x => !x.toKhac);

  const bat = (m: string) => setChon(s => { const t = new Set(s); if (t.has(m)) t.delete(m); else t.add(m); return t; });
  const luu = () => {
    const vao = vaoMoi.map(mnv => ({ mnv, luc: lucChon }));
    const ra = raMoi.map(mnv => {
      // Vắng (tick nhầm): rời đúng lúc vào => khoảng rỗng, không tính giờ
      const vaoLuc = cv.coMat?.[ca]?.find(x => x.mnv === mnv && x.ra === null)?.vao ?? lucChon;
      return { mnv, luc: lyDo === 'vang' ? vaoLuc : lucChon, lyDo };
    });
    onLuu({ vao, ra, soCoMat: chon.size }, nguoiMoi);
  };

  const dong = (c: CongNhanTo) => {
    const on = chon.has(c.mnv);
    const vao = cv.coMat?.[ca]?.find(x => x.mnv === c.mnv && x.ra === null)?.vao;
    return (
      <li key={c.mnv}>
        <button type="button" onClick={() => bat(c.mnv)} aria-pressed={on} aria-label={`${c.hoTen} (${c.mnv}) — ${on ? 'có mặt' : 'vắng'}`}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left active:bg-slate-50">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`} aria-hidden>
            {on && <Check size="1.1em" strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium text-slate-900">{c.hoTen}</span>
            <span className={CHU_PHU}>{c.mnv}{c.toKhac ? ` · mượn từ ${c.toKhac}` : ''}{vao ? ` · vào ${hhmm(vao)}` : ''}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <BottomSheet title={`Điểm danh ${TEN_CA[ca].toLowerCase()}`} onClose={onClose}
      footer={
        <button className={NUT_CHINH} disabled={!doi && !lanDau} onClick={luu}>
          {lanDau ? `Lưu điểm danh · ${chon.size} có mặt` : doi ? `Lưu thay đổi · ${chon.size} có mặt` : `${chon.size} người có mặt`}
        </button>
      }>
      <div className="space-y-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-semibold text-slate-900"><span className="tabular-nums">{chon.size}</span> / {ds.length} có mặt</p>
          <div className="flex gap-2">
            <button type="button" className={NUT_PHU} onClick={() => setChon(new Set(ds.map(x => x.mnv)))}>Tất cả</button>
            <button type="button" className={NUT_PHU} onClick={() => setChon(new Set())}>Bỏ hết</button>
          </div>
        </div>

        {ds.length === 0 && (
          <p className={`rounded-2xl ${MAU.ngung.nen} p-3 text-base ${MAU.ngung.chu}`}>
            Tổ chưa có danh sách công nhân. Bấm <b>Thêm người</b> để thêm từng người (lần sau app nhớ), hoặc chỉ nhập số người.
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

        {(vaoMoi.length > 0 || raMoi.length > 0) && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-base font-medium text-slate-800">
                {vaoMoi.length > 0 && raMoi.length === 0 ? `Giờ vào (${vaoMoi.length} người)` : raMoi.length > 0 && vaoMoi.length === 0 ? `Giờ ra (${raMoi.length} người)` : 'Giờ vào / ra'}
              </span>
              <input type="time" value={gio} onChange={e => e.target.value && setGio(e.target.value)} aria-label="Giờ vào / ra"
                className="h-14 rounded-2xl border border-slate-300 bg-white px-3 text-lg tabular-nums text-slate-900" />
            </label>
            {raMoi.length > 0 && (
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Lý do ra">
                {LY_DO_RA.map(l => (
                  <button key={l.ma} type="button" role="radio" aria-checked={lyDo === l.ma} onClick={() => setLyDo(l.ma)}
                    className={chipNguoi(lyDo === l.ma)}>{l.ten}</button>
                ))}
              </div>
            )}
            {lanDau && now < batDauCa + 30 * 60_000 && <p className={CHU_PHU}>Điểm danh trong 30 phút đầu ca thì tính vào đúng giờ ca. Người đến trễ thì tick sau, kèm giờ đến.</p>}
          </div>
        )}

        <button type="button" className="text-base font-medium text-slate-600 underline underline-offset-4" onClick={onChiNhapSo}>
          Không điểm danh tên — chỉ nhập số người
        </button>
      </div>
    </BottomSheet>
  );
}

/** Lưới chip chọn người; `ban` = người đang ở hạng mục khác (chọn thì chuyển sang) */
export function ChonNguoi({ coMat, ds, chon, onDoi, ban }: {
  coMat: string[]; ds: CongNhanTo[]; chon: Set<string>; onDoi: (s: Set<string>) => void; ban?: Map<string, string>;
}) {
  if (!coMat.length) return <p className={CHU_PHU}>Chưa có ai điểm danh có mặt.</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {coMat.map(m => {
        const on = chon.has(m);
        const o = ban?.get(m);
        return (
          <button key={m} type="button" aria-pressed={on} className={chipNguoi(on, !!o && !on)}
            onClick={() => { const t = new Set(chon); if (on) t.delete(m); else t.add(m); onDoi(t); }}>
            <span className="min-w-0 flex-1 truncate">{tenGon(m, ds)}</span>
            {on ? <Check size="1em" aria-hidden /> : o ? <span className="shrink-0 text-xs tabular-nums">…{o.slice(-4)}</span> : null}
          </button>
        );
      })}
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
