import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { X as XIcon } from 'lucide-react';
import { LOAI_TIEN, UNAUTHORIZED, traGia, type ChiTietTien, type LoaiTien, type TraGiaHex } from '../../services/vuongMacService';
import { LabeledField, inputCls } from '../Mobile/mobileUi';
import {
  LOAI_TIEN_META, tachHex, tomTatMucGia, fmtDong, fmtDongGon, docSoTien, nhapSoTien, hieu, fmtGiaCongNgoai, hexTrungThat,
} from './tienM6';

// ============================================================================
// M6 TIỀN — phần giao diện dùng chung:
//   useTraGia      tra giá các HEX (chờ người gõ xong 400ms, nhớ kết quả trong service)
//   BangTraGia     bảng tên hạng mục / công trình / đơn giá (+ trị giá, tổng vật tư) cạnh từng mã
//   TienM6Fields   phần nhập theo loại trong form báo vướng mắc (nút to dễ bấm trên điện thoại)
//   TienM6View     phần chi tiết tiền trong màn chi tiết (điện thoại + web)
// Tiền đều là VNĐ.
// ============================================================================

export function useTraGia(hexes: string[]) {
  const key = [...new Set(hexes.filter(Boolean))].join(',');
  const [kq, setKq] = useState<Record<string, TraGiaHex>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    // Không còn mã: bỏ cả cờ đang tra (lần tra cũ bị huỷ nên finally của nó không tắt loading)
    if (!key) { setKq({}); setErr(''); setLoading(false); return; }
    let huy = false;
    const t = setTimeout(async () => {
      setLoading(true); setErr('');
      try { const r = await traGia(key.split(',')); if (!huy) setKq(r); }
      catch (e: any) { if (!huy) setErr(e?.message === UNAUTHORIZED ? 'Phiên đăng nhập đã hết hạn' : (e?.message || 'Không tra được giá')); }
      finally { if (!huy) setLoading(false); }
    }, 400);
    return () => { huy = true; clearTimeout(t); };
  }, [key]);
  return { kq, loading, err };
}

type Cot = 'gia' | 'triGia' | 'vatTu';

/** Bảng tra giá: mỗi mã 1 dòng (dạng thẻ — đọc được trên điện thoại) */
export function BangTraGia({ hexes, mainHex, kq, loading, err, cot = ['gia'], onRemove, dense }: {
  hexes: string[];
  mainHex?: string;
  kq: Record<string, TraGiaHex>;
  loading?: boolean;
  err?: string;
  cot?: Cot[];
  onRemove?: (hex: string) => void;
  dense?: boolean;
}) {
  const giaMin = useMemo(() => {
    const g = hexes.map(h => kq[h]?.donGia).filter((x): x is number => typeof x === 'number');
    return g.length >= 2 && new Set(g).size >= 2 ? Math.min(...g) : null;
  }, [hexes, kq]);
  const txt = dense ? 'text-sm' : 'text-base';
  return (
    <div className="space-y-1.5">
      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {hexes.map(h => {
          const g = kq[h];
          const chenh = giaMin !== null && typeof g?.donGia === 'number' ? g.donGia - giaMin : null;
          return (
            <li key={h} className={`flex items-start gap-2 px-3 py-2.5 ${txt}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  HEX {h}{h === mainHex && <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">đang báo</span>}
                </p>
                {g ? (
                  <>
                    <p className="truncate text-slate-700" title={g.tenHangMuc ?? ''}>{g.tenHangMuc || '—'}</p>
                    <p className="truncate text-sm text-slate-500" title={g.tenCongTrinh ?? ''}>{[g.maCongTrinh, g.tenCongTrinh].filter(Boolean).join(' · ') || '—'}</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">{loading ? 'Đang tra…' : err ? 'Chưa tra được' : 'Không có trong dữ liệu'}</p>
                )}
              </div>
              {g && (
                <div className="shrink-0 text-right tabular-nums">
                  {cot.includes('gia') && (
                    <p className="font-semibold text-slate-900">{fmtDong(g.donGia)}{g.dvt ? <span className="text-sm font-normal text-slate-500">/{g.dvt}</span> : null}</p>
                  )}
                  {cot.includes('gia') && chenh !== null && chenh > 0 && <p className="text-sm font-medium text-red-600">+{fmtDongGon(chenh)}</p>}
                  {cot.includes('triGia') && <p className="text-sm text-slate-600">Trị giá {fmtDong(g.triGia)}</p>}
                  {cot.includes('vatTu') && <p className="text-sm text-slate-600">Vật tư {g.coGiaVatTu === false ? '(không có quyền xem)' : fmtDong(g.tongVatTu)}</p>}
                </div>
              )}
              {onRemove && h !== mainHex && (
                <button type="button" onClick={() => onRemove(h)} aria-label={`Bỏ mã ${h}`}
                  className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100">
                  <XIcon size="1.125em" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Dòng số: nhãn trái, số phải */
function Dong({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'font-semibold' : ''} ${tone ?? 'text-slate-800'}`}>{value}</dd>
    </div>
  );
}

const chenhTone = (v: number | null) => (v === null ? 'text-slate-500' : v > 0 ? 'text-red-600' : 'text-emerald-700');
const fmtChenh = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${fmtDong(v)}`);

/** Số liệu tiền của HEX chính theo loại (dùng ở form và chi tiết) */
function SoLieuTien({ hex, ct, kq, loading, err, dense }: { hex: string; ct: Partial<ChiTietTien>; kq: Record<string, TraGiaHex>; loading?: boolean; err?: string; dense?: boolean }) {
  const g = kq[hex];
  const txt = dense ? 'text-sm' : 'text-base';
  if (!g) {
    return (
      <p className={`rounded-2xl bg-slate-50 px-3 py-2 ${txt} text-slate-400`}>
        {loading ? 'Đang tra giá HEX…' : err ? `HEX ${hex}: chưa tra được giá` : `HEX ${hex}: chưa có giá trong dữ liệu`}
      </p>
    );
  }
  if (ct.loai === 'gia_thap_gcvt') {
    const chenhDg = hieu(ct.chiPhiGcvt, g.donGia);
    const chenhTg = g.triGia !== g.donGia ? hieu(ct.chiPhiGcvt, g.triGia) : null;
    return (
      <dl className={`space-y-1 rounded-2xl bg-slate-50 px-3 py-2.5 ${txt}`}>
        <Dong label="Đơn giá sản phẩm" value={`${fmtDong(g.donGia)}${g.dvt ? ` / ${g.dvt}` : ''}`} />
        <Dong label="Trị giá đơn hàng" value={fmtDong(g.triGia)} />
        <Dong label="Có gia công ngoài" value={fmtGiaCongNgoai(g.coGiaCongNgoai)} />
        <Dong label="Chi phí GCVT báo giá" value={fmtDong(ct.chiPhiGcvt ?? null)} strong />
        <Dong label="Chi phí GCVT − đơn giá SP" value={fmtChenh(chenhDg)} tone={chenhTone(chenhDg)} strong />
        {chenhTg !== null && <Dong label="Chi phí GCVT − trị giá đơn hàng" value={fmtChenh(chenhTg)} tone={chenhTone(chenhTg)} />}
      </dl>
    );
  }
  if (ct.loai === 'vat_tu_vuot_gia') {
    const khongQuyen = g.coGiaVatTu === false;
    const chenh = hieu(g.tongVatTu, g.triGia);
    return (
      <dl className={`space-y-1 rounded-2xl bg-slate-50 px-3 py-2.5 ${txt}`}>
        {khongQuyen
          ? <p className="text-slate-500">Không có quyền xem tiền vật tư — admin sẽ kiểm số vật tư.</p>
          : <Dong label="Tổng tiền vật tư" value={g.tongVatTu === null ? 'Chưa có trong dữ liệu vật tư' : fmtDong(g.tongVatTu)} strong />}
        <Dong label="Trị giá sản phẩm" value={fmtDong(g.triGia)} />
        <Dong label="Đơn giá" value={`${fmtDong(g.donGia)}${g.dvt ? ` / ${g.dvt}` : ''}`} />
        {!khongQuyen && <Dong label="Vật tư − trị giá" value={fmtChenh(chenh)} tone={chenhTone(chenh)} strong />}
        {!khongQuyen && g.tongVatTu !== null && (
          <p className="text-sm text-slate-500">Dòng vật tư mua chung cho nhiều HEX đã chia đều cho các HEX đó.</p>
        )}
        {chenh !== null && chenh <= 0 && <p className="text-sm text-amber-700">Theo dữ liệu, tiền vật tư chưa vượt trị giá — kiểm tra lại trước khi gửi.</p>}
      </dl>
    );
  }
  return null;
}

/** Phần nhập M6 trong form báo vướng mắc */
export function TienM6Fields({ mainHex, value, onChange, batBuocLoai, scanButton }: {
  mainHex?: string;
  value: Partial<ChiTietTien>;
  onChange: (v: Partial<ChiTietTien>) => void;
  /** Báo mới: bắt buộc chọn loại vấn đề (sửa bản cũ chưa phân loại thì không) */
  batBuocLoai?: boolean;
  /** Nút quét mã (form cha giữ camera): gọi `them(code)` khi quét được */
  scanButton?: (them: (code: string) => void) => ReactNode;
}) {
  const set = (p: Partial<ChiTietTien>) => onChange({ ...value, ...p });
  // Bỏ HEX chính khỏi danh sách trùng (đổi HEX chính đúng bằng 1 mã đã thêm) — máy chủ cũng bỏ
  const hexTrung = useMemo(() => hexTrungThat(value.hexTrung, mainHex), [value.hexTrung, mainHex]);
  const [hexInput, setHexInput] = useState('');
  const [hexLoi, setHexLoi] = useState('');
  const [tienInput, setTienInput] = useState(value.chiPhiGcvt != null ? nhapSoTien(String(value.chiPhiGcvt)) : '');

  const traDs = useMemo(() => [...new Set([...(mainHex ? [mainHex] : []), ...(value.loai === 'nhieu_gia' ? hexTrung : [])])], [mainHex, value.loai, hexTrung]);
  const { kq, loading, err } = useTraGia(value.loai ? traDs : []);
  const tomTat = useMemo(() => tomTatMucGia(traDs, kq), [traDs, kq]);

  const themHex = (chuoi: string) => {
    const { hop, loi } = tachHex(chuoi, [...(mainHex ? [mainHex] : []), ...hexTrung]);
    if (hop.length) set({ hexTrung: [...hexTrung, ...hop] });
    setHexLoi(loi.length ? `Bỏ qua (không phải mã 9 số): ${loi.slice(0, 5).join(', ')}${loi.length > 5 ? '…' : ''}` : '');
    setHexInput('');
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-base font-medium text-slate-700">💰 Vấn đề tiền{batBuocLoai && <span className="text-red-500"> *</span>}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {LOAI_TIEN.map(l => {
            const m = LOAI_TIEN_META[l];
            const on = value.loai === l;
            return (
              <button type="button" key={l} onClick={() => set({ loai: l as LoaiTien })} aria-pressed={on}
                className={`flex min-h-[64px] items-start gap-3 rounded-2xl px-3 py-3 text-left ${on ? 'bg-[#d3e3fd] ring-2 ring-[#8ab4f8]' : 'border border-slate-200 bg-white active:bg-slate-50'}`}>
                <span className="text-2xl leading-none">{m.icon}</span>
                <span className="min-w-0">
                  <span className={`block text-base leading-snug ${on ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>{m.label}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-slate-500">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {value.loai === 'nhieu_gia' && (
        <div className="space-y-2">
          <p className="text-base font-medium text-slate-700">Các mã HEX cùng sản phẩm<span className="text-red-500"> *</span></p>
          <div className="flex gap-2">
            <input value={hexInput} inputMode="numeric" enterKeyHint="done"
              onChange={e => {
                const v = e.target.value;
                // Dán nhiều mã (có dấu phân cách) => thêm luôn
                if (/[\s,;|]/.test(v.trim()) || /[\s,;|]$/.test(v)) themHex(v); else setHexInput(v);
              }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (hexInput.trim()) themHex(hexInput); } }}
              placeholder="Gõ / dán mã 9 số, nhiều mã cách nhau dấu phẩy" className={`${inputCls} min-w-0 flex-1`} />
            <button type="button" disabled={!hexInput.trim()} onClick={() => themHex(hexInput)}
              className="shrink-0 rounded-2xl bg-slate-900 px-4 text-base font-medium text-white active:opacity-80 disabled:opacity-40">Thêm</button>
            {scanButton?.(themHex)}
          </div>
          {hexLoi && <p className="text-sm text-amber-700">{hexLoi}</p>}
          {traDs.length > 0 && (
            <BangTraGia hexes={traDs} mainHex={mainHex} kq={kq} loading={loading} err={err}
              onRemove={h => set({ hexTrung: hexTrung.filter(x => x !== h) })} />
          )}
          {hexTrung.length > 0 && !err && (
            <p className={`rounded-2xl px-3 py-2 text-base font-medium ${tomTat.mucGia.length >= 2 ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'}`}>{tomTat.text}</p>
          )}
          {hexTrung.length === 0 && <p className="text-sm text-slate-500">Thêm các mã HEX khác mà bạn thấy là cùng sản phẩm với HEX {mainHex || 'đang báo'}.</p>}
        </div>
      )}

      {value.loai === 'gia_thap_gcvt' && mainHex && (
        <>
          <LabeledField label="Chi phí GCVT báo giá (đồng)">
            <div className="relative">
              <input value={tienInput} inputMode="numeric" placeholder="Vd: 12,500,000"
                onChange={e => {
                  setTienInput(nhapSoTien(e.target.value));
                  set({ chiPhiGcvt: docSoTien(e.target.value) ?? undefined });
                }}
                className={`${inputCls} !pr-10 text-right tabular-nums`} />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base text-slate-400">đ</span>
            </div>
          </LabeledField>
          <SoLieuTien hex={mainHex} ct={value} kq={kq} loading={loading} err={err} />
          <LabeledField label="Giải trình" required>
            <textarea value={value.giaiTrinh ?? ''} onChange={e => set({ giaiTrinh: e.target.value })} rows={3} maxLength={2000}
              placeholder="Vì sao không gia công vệ tinh được: kích thước, khối lượng, đơn vị GCVT báo giá…" className={inputCls} />
          </LabeledField>
        </>
      )}

      {value.loai === 'vat_tu_vuot_gia' && mainHex && <SoLieuTien hex={mainHex} ct={value} kq={kq} loading={loading} err={err} />}
      {err && value.loai !== 'nhieu_gia' && <p className="text-sm text-red-600">{err}</p>}

      {value.loai && (
        <LabeledField label="📝 Ghi chú về tiền">
          <textarea value={value.ghiChu ?? ''} onChange={e => set({ ghiChu: e.target.value })} rows={2} maxLength={2000}
            placeholder="Không bắt buộc" className={inputCls} />
        </LabeledField>
      )}
    </div>
  );
}

/** Phần chi tiết tiền của 1 vướng mắc M6 (chỉ đọc) */
export function TienM6View({ hex, ct, dense }: { hex: string; ct?: ChiTietTien | null; dense?: boolean }) {
  const loai = ct?.loai;
  const ds = useMemo(() => (loai ? [hex, ...(loai === 'nhieu_gia' ? (ct?.hexTrung ?? []) : [])] : []), [hex, loai, ct?.hexTrung]);
  const { kq, loading, err } = useTraGia(ds);
  const tomTat = useMemo(() => tomTatMucGia(ds, kq), [ds, kq]);
  if (!ct?.loai) return null;
  const m = LOAI_TIEN_META[ct.loai];
  const txt = dense ? 'text-sm' : 'text-base';
  const tieuDe = dense ? 'text-xs font-semibold text-slate-600' : 'text-sm font-semibold uppercase tracking-wide text-slate-400';
  return (
    <div className={`space-y-2 ${txt}`}>
      <p className={tieuDe}>💰 Vấn đề tiền</p>
      <p className="font-semibold text-slate-900">{m.icon} {m.label}</p>
      {ct.loai === 'nhieu_gia' && (
        <>
          <BangTraGia hexes={ds} mainHex={hex} kq={kq} loading={loading} err={err} dense={dense} />
          {!err && <p className={`rounded-2xl px-3 py-2 font-medium ${tomTat.mucGia.length >= 2 ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'}`}>{tomTat.text}</p>}
        </>
      )}
      {ct.loai !== 'nhieu_gia' && <SoLieuTien hex={hex} ct={ct} kq={kq} loading={loading} err={err} dense={dense} />}
      {ct.loai !== 'nhieu_gia' && err && <p className="text-sm text-red-600">{err}</p>}
      {ct.giaiTrinh && (
        <div>
          <p className="text-sm text-slate-500">Giải trình</p>
          <p className="whitespace-pre-line break-words text-slate-800">{ct.giaiTrinh}</p>
        </div>
      )}
      {ct.ghiChu && (
        <div>
          <p className="text-sm text-slate-500">Ghi chú</p>
          <p className="whitespace-pre-line break-words text-slate-800">{ct.ghiChu}</p>
        </div>
      )}
    </div>
  );
}
