import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Filter, FilterX, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { layTenVatTu, LoiTonKhoVt, type TenVatTu } from '../../../services/tonKhoVtApi';
import { dinhDangSo } from './xuLy';
import {
  boLocTuDieuKien, boLocTuKhoa, DS_TOAN_TU, dungDanhSachMuc, khoaDangChon, khopTimKiem, MENU_BO_LOC_VAN_BAN,
  type DieuKienTen, type LocTen, type MucTen, type ToanTu,
} from './locTenExcel';

// ============================================================================
// BỘ LỌC TÊN VẬT TƯ CỦA 1 BIỂU ĐỒ — làm theo đúng hộp lọc cột của Excel (AutoFilter):
//   Xóa Bộ lọc · Bộ lọc Văn bản ▸ (Bằng / Chứa / Bắt đầu với… → hộp Tự Lọc Tùy chỉnh, 2 điều kiện Và/Hoặc)
//   · Tìm kiếm (chứa, có * ?, phân biệt dấu) · (Chọn Tất cả) / (Chọn Tất cả Kết quả Tìm kiếm)
//   · Thêm vùng chọn hiện tại vào bộ lọc · danh sách tên có ô kiểm · OK / Hủy bỏ.
// Đang tìm mà bấm OK: bộ lọc = ĐÚNG các kết quả tìm đang đánh dấu (tên ngoài kết quả bị bỏ), trừ khi đánh dấu
// "Thêm vùng chọn hiện tại vào bộ lọc". Chọn hết = bỏ lọc. Mỗi thẻ nhóm 1 bộ lọc riêng.
// ============================================================================

/** Danh sách tên mỗi nhóm tải 1 lần cho mỗi phiên bản bảng (ETL nạp lần chốt mới => phiên bản đổi => tải lại) */
const boNhoTen = new Map<string, Promise<TenVatTu[]>>();
const napTen = (nhom: string, phienBan: string): Promise<TenVatTu[]> => {
  const khoa = `${phienBan}|${nhom}`;
  let p = boNhoTen.get(khoa);
  if (!p) {
    for (const k of boNhoTen.keys()) if (!k.startsWith(`${phienBan}|`)) boNhoTen.delete(k);
    p = layTenVatTu(nhom);
    boNhoTen.set(khoa, p);
    p.catch(() => boNhoTen.delete(khoa));
  }
  return p;
};

/** Chữ trên nút khi đang lọc: "Lọc: 3 tên" / "Lọc: chứa “vải”" (rút gọn) */
const chuNut = (l: LocTen) => {
  if (l.boLoc.kieu === 'ds') return `Lọc: ${dinhDangSo(l.ten.length)} tên`;
  const t = l.moTa.replace(/^tên /, '');
  return `Lọc: ${t.length > 30 ? `${t.slice(0, 29)}…` : t}`;
};

export function LocTenVatTu({ nhom, phienBan, loc, onApDung, tat }: {
  nhom: string;
  /** Phiên bản bảng (thời điểm cập nhật) — đổi thì tải lại danh sách tên */
  phienBan: string;
  /** Bộ lọc đang áp dụng; null = không lọc */
  loc: LocTen | null;
  onApDung: (loc: LocTen | null) => void;
  /** Khoá nút (đang xuất báo cáo) */
  tat?: boolean;
}) {
  const [mo, setMo] = useState(false);
  const khungRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mo) return;
    const ngoai = (e: MouseEvent) => { if (!khungRef.current?.contains(e.target as Node)) setMo(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMo(false); } };
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', ngoai); document.removeEventListener('keydown', esc); };
  }, [mo]);

  return (
    <div className="relative" ref={khungRef}>
      <div className="flex items-center">
        <button type="button" onClick={() => setMo(v => !v)} aria-haspopup="dialog" aria-expanded={mo} disabled={tat}
          title={loc ? `Đang lọc: ${loc.moTa} (${dinhDangSo(loc.ten.length)} tên vật tư)` : 'Lọc biểu đồ này theo tên vật tư (như bộ lọc cột của Excel)'}
          className={`inline-flex max-w-[260px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${loc
            ? 'rounded-r-none border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
          <Filter size={13} className="shrink-0" />
          <span className="truncate">{loc ? chuNut(loc) : 'Lọc tên vật tư'}</span>
          <ChevronDown size={12} className="shrink-0 opacity-70" />
        </button>
        {loc && (
          <button type="button" onClick={() => onApDung(null)} disabled={tat} aria-label="Xóa bộ lọc tên vật tư" title="Xóa bộ lọc"
            className="rounded-r-lg border border-l-0 border-slate-900 bg-slate-900 px-1.5 py-1 text-white hover:bg-slate-700">
            <X size={13} />
          </button>
        )}
      </div>
      {mo && !tat && (
        <HopLoc nhom={nhom} phienBan={phienBan} loc={loc} onDong={() => setMo(false)}
          onApDung={l => { setMo(false); onApDung(l); }} />
      )}
    </div>
  );
}

/** 1 dòng ô kiểm (memo: bấm 1 ô chỉ vẽ lại dòng đó, danh sách tới ~2.300 tên) */
const DongMuc = React.memo(function DongMuc({ m, chon, onDoi }: { m: MucTen; chon: boolean; onDoi: (khoa: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 px-3 py-[3px] hover:bg-slate-50"
      title={`${m.hien}${m.ten.length > 1 ? ` (gồm ${m.ten.length} cách viết hoa / thường)` : ''} — ${dinhDangSo(m.soMa)} mã${m.conTon ? '' : ' · không còn ở lần chốt mới nhất'}`}>
      <input type="checkbox" checked={chon} onChange={() => onDoi(m.khoa)} className="h-3.5 w-3.5 shrink-0 accent-slate-900" />
      <span className={`min-w-0 flex-1 truncate ${m.conTon ? 'text-slate-700' : 'text-slate-400'}`}>{m.hien}</span>
      {!m.conTon && <span className="shrink-0 rounded bg-slate-100 px-1 text-[0.625rem] font-semibold text-slate-500">đã hết</span>}
    </label>
  );
});

/** Ô kiểm 3 trạng thái (đánh dấu / không / một phần) */
function OKiem3({ trangThai, onDoi, children }: { trangThai: 'het' | 'khong' | 'mot_phan'; onDoi: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = trangThai === 'mot_phan'; }, [trangThai]);
  return (
    <label className="flex cursor-pointer items-center gap-2 px-3 py-[3px] font-medium text-slate-800 hover:bg-slate-50">
      <input ref={ref} type="checkbox" checked={trangThai === 'het'} onChange={onDoi} className="h-3.5 w-3.5 shrink-0 accent-slate-900" />
      {children}
    </label>
  );
}

const trangThaiChon = (so: number, tong: number): 'het' | 'khong' | 'mot_phan' =>
  so === 0 ? 'khong' : so >= tong ? 'het' : 'mot_phan';

// Gắn mới mỗi lần mở => ô tìm trống, ô kiểm lấy lại đúng bộ lọc đang áp dụng
function HopLoc({ nhom, phienBan, loc, onDong, onApDung }: {
  nhom: string; phienBan: string; loc: LocTen | null; onDong: () => void; onApDung: (loc: LocTen | null) => void;
}) {
  const [ds, setDs] = useState<TenVatTu[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [lanTai, setLanTai] = useState(0);
  /** Ô kiểm của danh sách đầy đủ (khoá mục) */
  const [chon, setChon] = useState<Set<string> | null>(null);
  const [tim, setTim] = useState('');
  const timHoan = useDeferredValue(tim);
  /** Ô kiểm của kết quả tìm; null = mọi kết quả đều đánh dấu (Excel đánh dấu lại hết mỗi lần đổi chữ tìm) */
  const [chonTim, setChonTim] = useState<Set<string> | null>(null);
  const [themVao, setThemVao] = useState(false);
  const [moVanBan, setMoVanBan] = useState(false);
  /** Đang ở hộp "Tự Lọc Tùy chỉnh" (đặt sẵn phép so của điều kiện 1) */
  const [tuyChinh, setTuyChinh] = useState<ToanTu | 'giu' | null>(null);
  const oTimRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let huy = false;
    setLoi(null);
    napTen(nhom, phienBan)
      .then(d => { if (!huy) setDs(d); })
      .catch((e: unknown) => {
        if (huy) return;
        console.error('Lỗi tải tên vật tư:', e);
        setLoi(e instanceof LoiTonKhoVt ? e.message : 'Lỗi không xác định, hãy thử lại');
      });
    return () => { huy = true; };
  }, [nhom, phienBan, lanTai]);

  const muc = useMemo(() => (ds ? dungDanhSachMuc(ds) : []), [ds]);
  const tatCaTen = useMemo(() => (ds ? ds.map(t => t.ten) : []), [ds]);
  // Ô kiểm ban đầu = các mục bộ lọc hiện tại đang giữ (không lọc => tất cả)
  useEffect(() => { if (ds) setChon(khoaDangChon(muc, loc?.boLoc ?? null)); }, [ds, muc, loc]);
  useEffect(() => { if (ds && !tuyChinh) oTimRef.current?.focus(); }, [ds, tuyChinh]);

  const coTim = timHoan !== '';
  const khop = useMemo(() => (coTim ? muc.filter(m => m.ten.some(t => khopTimKiem(t, timHoan))) : muc), [muc, timHoan, coTim]);
  const daChonTim = useCallback((k: string) => (chonTim ? chonTim.has(k) : true), [chonTim]);
  const soChonTim = useMemo(() => (chonTim ? khop.reduce((n, m) => n + (chonTim.has(m.khoa) ? 1 : 0), 0) : khop.length), [khop, chonTim]);
  const soChon = chon?.size ?? 0;

  const doi = useCallback((k: string) => setChon(c => {
    const s = new Set(c);
    if (s.has(k)) s.delete(k); else s.add(k);
    return s;
  }), []);
  const doiTim = useCallback((k: string) => setChonTim(c => {
    const s = new Set(c ?? khop.map(m => m.khoa));
    if (s.has(k)) s.delete(k); else s.add(k);
    return s;
  }), [khop]);

  /**
   * Tập mục sẽ giữ khi bấm OK (Excel: đang tìm => đúng các kết quả đánh dấu [+ bộ lọc cũ nếu "Thêm vùng chọn…"]).
   * Tính theo chữ tìm ĐANG GÕ (`tim`), không theo giá trị hoãn: Enter ngay sau khi gõ phải lọc đúng chữ vừa gõ.
   * null = không có gì để giữ (OK không làm gì, như nút OK mờ của Excel).
   */
  const ketQua = (): Set<string> | null => {
    if (!ds || !chon) return null;
    if (tim === '') return chon.size ? new Set(chon) : null;
    const dsKhop = tim === timHoan ? khop : muc.filter(m => m.ten.some(t => khopTimKiem(t, tim)));
    if (!dsKhop.length) return null;
    // Chữ tìm vừa đổi => chonTim đã về null (mọi kết quả mới đều đánh dấu)
    const s = new Set(dsKhop.filter(m => (chonTim ? chonTim.has(m.khoa) : true)).map(m => m.khoa));
    if (themVao) for (const k of khoaDangChon(muc, loc?.boLoc ?? null)) s.add(k);
    return s.size ? s : null;
  };
  const choOk = !!ds && !!chon && (coTim ? khop.length > 0 && (soChonTim > 0 || themVao) : soChon > 0);
  const ok = () => {
    const kq = ketQua();
    if (kq) onApDung(boLocTuKhoa(muc, kq));
  };

  if (tuyChinh) {
    return (
      <HopTuyChinh nhom={nhom} loc={loc} toanTuDau={tuyChinh === 'giu' ? null : tuyChinh} tatCaTen={tatCaTen}
        onHuy={onDong} onOk={onApDung} />
    );
  }

  return (
    <div role="dialog" aria-label={`Lọc tên vật tư — ${nhom}`}
      className="absolute right-0 top-full z-30 mt-1 flex w-[min(380px,calc(100vw-2rem))] flex-col rounded-lg border border-slate-300 bg-white text-[0.8125rem] shadow-xl">
      <div className="border-b border-slate-200 py-1">
        <button type="button" disabled={!loc} onClick={() => onApDung(null)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent">
          <FilterX size={14} className="shrink-0" /> Xóa Bộ lọc Khỏi “Tên vật tư”
        </button>
        <button type="button" onClick={() => setMoVanBan(v => !v)} aria-expanded={moVanBan} disabled={!ds}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:text-slate-300">
          <span className="flex w-[14px] shrink-0 justify-center">{loc?.boLoc.kieu === 'dk' && <Check size={14} />}</span>
          <span className="flex-1">Bộ lọc Văn bản</span>
          {moVanBan ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {moVanBan && (
          <div className="ml-7 border-l border-slate-200 pb-1" role="menu" aria-label="Bộ lọc Văn bản">
            {MENU_BO_LOC_VAN_BAN.map(([k, nhan]) => (
              <button key={k} type="button" role="menuitem" onClick={() => setTuyChinh(k)}
                className="block w-full px-3 py-1 text-left text-slate-700 hover:bg-slate-50">{nhan}</button>
            ))}
            <button type="button" role="menuitem" onClick={() => setTuyChinh('giu')}
              className="block w-full border-t border-slate-100 px-3 py-1 text-left text-slate-700 hover:bg-slate-50">Bộ lọc Tùy chỉnh…</button>
          </div>
        )}
      </div>

      <div className="p-2.5">
        <label className="relative block">
          <span className="sr-only">Tìm kiếm tên vật tư</span>
          <input ref={oTimRef} value={tim} disabled={!ds}
            onChange={e => { setTim(e.target.value); setChonTim(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }}
            placeholder="Tìm kiếm"
            className="w-full rounded border border-slate-300 py-1 pl-2 pr-7 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300" />
          {tim
            ? <button type="button" onClick={() => { setTim(''); setChonTim(null); oTimRef.current?.focus(); }} aria-label="Xóa chữ tìm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"><X size={13} /></button>
            : <Search size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />}
        </label>
        <p className="mt-1 text-[0.6875rem] text-slate-400">Như Excel: phân biệt dấu (“vải” khác “vai”); * = chuỗi bất kỳ, ? = 1 ký tự, ~ đứng trước = lấy nguyên ký tự đó</p>

        <div className="mt-1.5 h-[260px] overflow-y-auto rounded border border-slate-300 py-1 custom-scrollbar">
          {loi ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-slate-500">
              <p>Không tải được danh sách tên: {loi}</p>
              <button type="button" onClick={() => setLanTai(n => n + 1)}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50">
                <RefreshCw size={13} /> Thử lại
              </button>
            </div>
          ) : !ds || !chon ? (
            <p className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-slate-500" aria-busy="true">
              <Loader2 size={14} className="animate-spin" /> Đang tải danh sách tên…
            </p>
          ) : coTim ? (
            <>
              {khop.length > 0 && (
                <>
                  <OKiem3 trangThai={trangThaiChon(soChonTim, khop.length)}
                    onDoi={() => setChonTim(soChonTim === khop.length ? new Set() : null)}>
                    (Chọn Tất cả Kết quả Tìm kiếm)
                  </OKiem3>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-[3px] text-slate-700 hover:bg-slate-50">
                    <input type="checkbox" checked={themVao} onChange={() => setThemVao(v => !v)} className="h-3.5 w-3.5 shrink-0 accent-slate-900" />
                    Thêm vùng chọn hiện tại vào bộ lọc
                  </label>
                </>
              )}
              {khop.map(m => <DongMuc key={m.khoa} m={m} chon={daChonTim(m.khoa)} onDoi={doiTim} />)}
              {khop.length === 0 && <p className="px-3 py-8 text-center text-xs text-slate-400">Không tìm thấy kết quả khớp</p>}
            </>
          ) : (
            <>
              <OKiem3 trangThai={trangThaiChon(soChon, muc.length)}
                onDoi={() => setChon(soChon === muc.length ? new Set() : new Set(muc.map(m => m.khoa)))}>
                (Chọn Tất cả)
              </OKiem3>
              {muc.map(m => <DongMuc key={m.khoa} m={m} chon={chon.has(m.khoa)} onDoi={doi} />)}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-2.5 py-2">
        <span className="text-[0.6875rem] text-slate-500">
          {ds && chon ? (coTim
            ? `${dinhDangSo(soChonTim)} / ${dinhDangSo(khop.length)} kết quả được chọn`
            : `${dinhDangSo(soChon)} / ${dinhDangSo(muc.length)} tên được chọn`) : ''}
        </span>
        <div className="flex gap-2">
          <button type="button" disabled={!choOk} onClick={ok}
            className="min-w-[64px] rounded border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40">
            OK
          </button>
          <button type="button" onClick={onDong}
            className="min-w-[64px] rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Hủy bỏ
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hộp "Tự Lọc Tùy chỉnh" (Bộ lọc Văn bản): 2 điều kiện, Và / Hoặc, ký tự đại diện * ?
// ---------------------------------------------------------------------------
function HopTuyChinh({ nhom, loc, toanTuDau, tatCaTen, onHuy, onOk }: {
  nhom: string; loc: LocTen | null;
  /** Phép so chọn từ menu (null = "Bộ lọc Tùy chỉnh…": giữ nguyên điều kiện đang lọc) */
  toanTuDau: ToanTu | null;
  tatCaTen: string[];
  onHuy: () => void; onOk: (loc: LocTen) => void;
}) {
  const cu = loc?.boLoc.kieu === 'dk' ? loc.boLoc : null;
  const [dk1, setDk1] = useState<DieuKienTen>({ toanTu: toanTuDau ?? cu?.dk1.toanTu ?? 'bang', giaTri: cu?.dk1.giaTri ?? '' });
  const [noi, setNoi] = useState<'va' | 'hoac'>(cu?.noi ?? 'va');
  const [dk2, setDk2] = useState<DieuKienTen | null>(cu?.dk2 ?? null);
  const oDauRef = useRef<HTMLInputElement>(null);
  useEffect(() => { oDauRef.current?.focus(); oDauRef.current?.select(); }, []);

  // Như Excel: OK luôn áp dụng được — "bằng" để trống = tên trống; không tên nào thoả => biểu đồ về 0
  const thu = useMemo(() => boLocTuDieuKien(tatCaTen, dk1, noi, dk2), [tatCaTen, dk1, noi, dk2]);
  const choOk = tatCaTen.length > 0;
  const ok = () => { if (choOk) onOk(thu); };

  const oDieuKien = (dk: DieuKienTen | null, dat: (d: DieuKienTen | null) => void, laDau: boolean) => (
    <div className="flex gap-2">
      <select value={dk?.toanTu ?? ''} aria-label={laDau ? 'Phép so điều kiện 1' : 'Phép so điều kiện 2'}
        onChange={e => {
          const v = e.target.value as ToanTu | '';
          if (!v) { dat(null); return; }
          dat({ toanTu: v, giaTri: dk?.giaTri ?? '' });
        }}
        className="w-[150px] shrink-0 rounded border border-slate-300 bg-white px-1.5 py-1 outline-none focus:border-slate-500">
        {!laDau && <option value="" />}
        {DS_TOAN_TU.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
      <input ref={laDau ? oDauRef : undefined} value={dk?.giaTri ?? ''} disabled={!dk}
        aria-label={laDau ? 'Giá trị điều kiện 1' : 'Giá trị điều kiện 2'}
        onChange={e => dk && dat({ ...dk, giaTri: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }}
        className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 outline-none focus:border-slate-500 disabled:bg-slate-50" />
    </div>
  );

  return (
    <div role="dialog" aria-label={`Tự Lọc Tùy chỉnh — ${nhom}`}
      className="absolute right-0 top-full z-30 mt-1 w-[min(440px,calc(100vw-2rem))] rounded-lg border border-slate-300 bg-white p-3 text-[0.8125rem] shadow-xl">
      <p className="font-semibold text-slate-900">Tự Lọc Tùy chỉnh</p>
      <p className="mt-2 text-slate-700">Hiện hàng khi: <span className="font-medium">Tên vật tư</span></p>
      <div className="mt-2 space-y-2">
        {oDieuKien(dk1, d => d && setDk1(d), true)}
        <div className="flex gap-4 pl-1" role="radiogroup" aria-label="Nối 2 điều kiện">
          {([['va', 'Và'], ['hoac', 'Hoặc']] as const).map(([k, n]) => (
            <label key={k} className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700">
              <input type="radio" name={`noi-${nhom}`} checked={noi === k} onChange={() => setNoi(k)} className="accent-slate-900" /> {n}
            </label>
          ))}
        </div>
        {oDieuKien(dk2, setDk2, false)}
      </div>
      <p className="mt-3 text-xs text-slate-500">Dùng ? để đại diện cho bất kỳ ký tự đơn nào<br />Dùng * để đại diện cho bất kỳ chuỗi ký tự nào</p>
      <p className={`mt-2 text-xs ${thu.ten.length === 0 ? 'text-amber-700' : 'text-slate-500'}`} aria-live="polite">
        {thu.ten.length === 0
          ? 'Không có tên vật tư nào thoả điều kiện — bấm OK thì biểu đồ về 0 (như Excel)'
          : `${dinhDangSo(thu.ten.length)} / ${dinhDangSo(tatCaTen.length)} tên vật tư thoả điều kiện`}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" disabled={!choOk} onClick={ok}
          className="min-w-[64px] rounded border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40">
          OK
        </button>
        <button type="button" onClick={onHuy}
          className="min-w-[64px] rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
          Hủy bỏ
        </button>
      </div>
    </div>
  );
}
