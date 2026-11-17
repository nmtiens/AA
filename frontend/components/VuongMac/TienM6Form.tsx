import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Maximize2, Search, X as XIcon } from 'lucide-react';
import type { PhotoItem } from '../Mobile/PhotoPicker';
import { ModalShell } from '../shared/ModalShell';
import * as bang from '../shared/bangBaoCao';
import { fmtInt } from '../../utils/format';
import { LOAI_TIEN, UNAUTHORIZED, traGia, fetchVuongMacPhotoUrl, type ChiTietTien, type LoaiTien, type TraGiaHex } from '../../services/vuongMacService';
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

/** Bảng tra giá các mã HEX (mã đang báo + mã trùng): mỗi mã 1 dòng để người báo xem lại trước khi gửi.
 *  Bảng cuộn ngang trên điện thoại; mức giá cao hơn giá thấp nhất tô đỏ. */
/** Ảnh sản phẩm (M6 Một HEX nhiều giá) — 1 ảnh dùng chung cho cả nhóm mã vì cùng 1 sản phẩm:
 *  daCo = id ảnh đã lưu, moi = ảnh vừa chọn chưa lưu. Có onChon / onXoa => chèn / đổi / xoá ngay trong bảng; thiếu => chỉ xem. */
export type AnhSpProps = {
  daCo?: number;
  moi?: PhotoItem | null;
  onChon?: (file: File) => void;
  onXoa?: () => void;
};

/** Xem ảnh lớn (bấm nền hoặc ✕ để đóng) */
function XemAnhLon({ url, ten, onDong }: { url: string; ten: string; onDong: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onDong(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onDong]);
  return createPortal(
    <div className="fixed inset-0 z-[9995] flex flex-col items-center justify-center gap-2 bg-black/90 p-3" onClick={onDong} role="dialog" aria-label={ten}>
      <button type="button" onClick={onDong} aria-label="Đóng" className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><XIcon className="h-6 w-6" /></button>
      <img src={url} alt={ten} className="max-h-[88vh] max-w-full rounded-lg object-contain" onClick={e => e.stopPropagation()} />
      <p className="text-sm text-white/80">{ten}</p>
    </div>,
    document.body,
  );
}

/** Ô ảnh sản phẩm: ảnh nhỏ (bấm xem lớn) + nút Thêm / Đổi / Xoá ảnh */
export function AnhO({ anh, lon }: { anh?: AnhSpProps; lon?: boolean }) {
  const moi = anh?.moi;
  const id = moi ? undefined : anh?.daCo;
  const [urlDb, setUrlDb] = useState('');
  const [loi, setLoi] = useState(false);
  const [xem, setXem] = useState(false);
  const oFile = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setUrlDb(''); setLoi(false);
    if (!id) return;
    let huy = false;
    fetchVuongMacPhotoUrl(id).then(u => { if (!huy) setUrlDb(u); }).catch(() => { if (!huy) setLoi(true); });
    return () => { huy = true; };
  }, [id]);
  if (!anh) return null;
  const url = moi?.url || urlDb;
  const sua = !!anh.onChon;
  const co = !!(moi || id);
  const kt = lon ? 'h-20 w-20' : 'h-12 w-12';
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${lon ? '' : 'mt-1'}`}>
      {co && (
        url
          ? <button type="button" onClick={() => setXem(true)} title="Xem ảnh lớn" className={`${kt} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100`}>
              <img src={url} alt="Ảnh sản phẩm" className="h-full w-full object-cover" />
            </button>
          : <span className={`${kt} flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[0.6875rem] text-slate-400`}>{loi ? 'Lỗi ảnh' : '…'}</span>
      )}
      {sua && (
        <div className="flex flex-col items-start gap-0.5">
          <input ref={oFile} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) anh.onChon!(f); e.target.value = ''; }} />
          <button type="button" onClick={() => oFile.current?.click()}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100">
            <Camera size="0.95em" aria-hidden /> {co ? 'Đổi ảnh' : 'Thêm ảnh'}
          </button>
          {co && anh.onXoa && (
            <button type="button" onClick={() => anh.onXoa!()} className="whitespace-nowrap px-2 text-xs text-slate-500 hover:text-red-600">Xoá ảnh</button>
          )}
          {moi && <span className="px-2 text-[0.6875rem] text-amber-700">chưa lưu</span>}
        </div>
      )}
      {!co && !sua && <span className="text-xs text-slate-400">—</span>}
      {xem && url && <XemAnhLon url={url} ten="Ảnh sản phẩm (dùng chung cho các mã)" onDong={() => setXem(false)} />}
    </div>
  );
}

export function BangTraGia({ hexes, mainHex, kq, loading, err, cot = ['gia'], onRemove, dense, anh }: {
  hexes: string[];
  mainHex?: string;
  kq: Record<string, TraGiaHex>;
  loading?: boolean;
  err?: string;
  cot?: Cot[];
  onRemove?: (hex: string) => void;
  dense?: boolean;
  /** Ảnh sản phẩm chung (M6 Một HEX nhiều giá) — có thì hiện ô ảnh trên bảng */
  anh?: AnhSpProps;
}) {
  const giaMin = useMemo(() => {
    const g = hexes.map(h => kq[h]?.donGia).filter((x): x is number => typeof x === 'number');
    return g.length >= 2 && new Set(g).size >= 2 ? Math.min(...g) : null;
  }, [hexes, kq]);
  const txt = dense ? 'text-sm' : 'text-[0.9375rem]';
  const th = 'whitespace-nowrap border-b border-slate-200 px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
  const td = 'border-b border-slate-100 px-2.5 py-2 align-top';
  const coXoa = !!onRemove && hexes.some(h => h !== mainHex);
  const [moChiTiet, setMoChiTiet] = useState(false);
  return (
    <div className="space-y-1.5">
      {moChiTiet && <BangChiTietHex hexes={hexes} mainHex={mainHex} kq={kq} loading={loading} err={err} giaMin={giaMin} anh={anh} coVatTu={cot.includes('vatTu')} onRemove={onRemove} onDong={() => setMoChiTiet(false)} />}
      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className={`w-full border-collapse ${txt}`}>
          <thead className="bg-slate-50">
            <tr>
              <th className={`${th} hidden w-10 text-center sm:table-cell`}>#</th>
              <th className={th}>HEX</th>
              <th className={`${th} !whitespace-normal`}>Hạng mục · công trình</th>
              {cot.includes('gia') && <th className={`${th} hidden text-right sm:table-cell`} title="Số đỏ dưới đơn giá = cao hơn giá thấp nhất">Đơn giá</th>}
              {cot.includes('triGia') && <th className={`${th} text-right`}>Trị giá</th>}
              {cot.includes('vatTu') && <th className={`${th} text-right`}>Vật tư</th>}
              {coXoa && <th className="w-9 border-b border-slate-200" aria-label="Xoá mã khỏi danh sách" />}
            </tr>
          </thead>
          <tbody>
            {hexes.map((h, i) => {
              const g = kq[h];
              const chenh = giaMin !== null && typeof g?.donGia === 'number' ? g.donGia - giaMin : null;
              // Đơn giá: cột riêng từ màn rộng; điện thoại nằm dưới tên hạng mục (không phải kéo ngang)
              const gia = g && (
                <>
                  <span className={`whitespace-nowrap font-semibold ${chenh ? 'text-red-600' : 'text-slate-900'}`}>{fmtDong(g.donGia)}</span>
                  {g.dvt ? <span className="whitespace-nowrap text-xs text-slate-500"> /{g.dvt}</span> : null}
                  {chenh !== null && (
                    <span className={`block text-xs ${chenh ? 'font-medium text-red-600' : 'text-emerald-700'}`}>{chenh ? `+${fmtDongGon(chenh)}` : 'thấp nhất'}</span>
                  )}
                </>
              );
              return (
                <tr key={h} className={h === mainHex ? 'bg-blue-50/60' : ''}>
                  <td className={`${td} hidden text-center tabular-nums text-slate-500 sm:table-cell`}>{i + 1}</td>
                  <td className={`${td} whitespace-nowrap !pr-1 font-semibold tabular-nums text-slate-900`}>
                    {h}{h === mainHex && <span className="mt-0.5 block w-max rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 sm:ml-1.5 sm:mt-0 sm:inline">đang báo</span>}
                    {/* Ảnh sản phẩm: 1 ảnh chung, hiện ở MỖI dòng (thêm / đổi ở dòng nào cũng áp cho cả nhóm mã) */}
                    {anh && <AnhO anh={anh} />}
                  </td>
                  {g ? (
                    <>
                      <td className={`${td} w-full break-words text-slate-800`}>
                        <span className="block">{g.tenHangMuc || '—'}</span>
                        <span className="block text-xs text-slate-500">{[g.maCongTrinh, g.tenCongTrinh].filter(Boolean).join(' · ') || '—'}</span>
                        {cot.includes('gia') && <span className="mt-1 block tabular-nums sm:hidden">{gia}</span>}
                      </td>
                      {cot.includes('gia') && (
                        <td className={`${td} hidden whitespace-nowrap text-right tabular-nums sm:table-cell`}>{gia}</td>
                      )}
                      {cot.includes('triGia') && <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{fmtDong(g.triGia)}</td>}
                      {cot.includes('vatTu') && <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{g.coGiaVatTu === false ? 'không có quyền xem' : fmtDong(g.tongVatTu)}</td>}
                    </>
                  ) : (
                    <>
                      <td className={`${td} text-slate-400`}>{loading ? 'Đang tra…' : err ? 'Chưa tra được' : 'Không có trong dữ liệu'}</td>
                      {cot.includes('gia') && <td className={`${td} hidden sm:table-cell`} />}
                      {cot.includes('triGia') && <td className={td} />}
                      {cot.includes('vatTu') && <td className={td} />}
                    </>
                  )}
                  {coXoa && (
                    <td className="w-9 border-b border-slate-100 py-1 pr-1 text-center align-top">
                      {h !== mainHex && (
                        <button type="button" onClick={() => onRemove!(h)} aria-label={`Xoá mã ${h} khỏi danh sách`} title="Xoá mã này khỏi danh sách mã trùng (nhập nhầm)"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-600 active:bg-slate-100">
                          <XIcon size="1.0625em" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hexes.length > 1 ? <p className="text-xs text-slate-500">{hexes.length} mã — xem lại trước khi gửi{onRemove ? '; ✕ = xoá mã nhập nhầm khỏi danh sách' : ''}</p> : <span />}
        <button type="button" onClick={() => setMoChiTiet(true)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100">
          <Maximize2 size="1em" aria-hidden /> Xem bảng chi tiết
        </button>
      </div>
    </div>
  );
}

type CotCt = [string, (h: string, g: TraGiaHex | undefined) => ReactNode, ('so' | 'giua')?];

/** Cửa sổ riêng: bảng chi tiết các mã HEX (đủ cột: mã nhà máy, mô tả, nhóm SP, xưởng, BOP, IPO, số lượng, đơn giá,
 *  chênh, trị giá…) — để người báo / admin so kỹ các mã cùng sản phẩm. Cùng kiểu bảng báo cáo của app (tiêu đề xanh, TỔNG vàng). */
function BangChiTietHex({ hexes, mainHex, kq, loading, err, giaMin, coVatTu, onRemove, onDong, anh }: {
  hexes: string[]; mainHex?: string; kq: Record<string, TraGiaHex>; loading?: boolean; err?: string; giaMin: number | null; coVatTu: boolean;
  anh?: AnhSpProps;
  onRemove?: (hex: string) => void; onDong: () => void;
}) {
  const [tim, setTim] = useState('');
  // Số lượng (M2, M…) có số lẻ: giữ tới 3 số lẻ như file
  const fmtSl = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 3 });
  const chenhCua = (g: TraGiaHex | undefined) => (giaMin !== null && typeof g?.donGia === 'number' ? g.donGia - giaMin : null);
  const cot: CotCt[] = [
    ['HEX', h => <span className="font-semibold">{h}{h === mainHex && <span className="ml-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">đang báo</span>}</span>],
    // Hình ảnh: 1 ảnh chung của nhóm mã (cùng 1 sản phẩm), hiện ở mỗi dòng
    ...(anh ? [['HÌNH ẢNH', () => <AnhO anh={anh} lon />] as CotCt] : []),
    ['TÊN HẠNG MỤC', (_, g) => g?.tenHangMuc ?? ''],
    ['ĐVT', (_, g) => g?.dvt ?? '', 'giua'],
    ['SỐ LƯỢNG', (_, g) => (g?.soLuong != null ? fmtSl(g.soLuong) : ''), 'so'],
    ['ĐƠN GIÁ', (_, g) => (g ? <span className={`font-semibold ${chenhCua(g) ? 'text-red-600' : ''}`}>{fmtDong(g.donGia)}</span> : ''), 'so'],
    ['CHÊNH GIÁ THẤP NHẤT', (_, g) => {
      const c = chenhCua(g);
      return c === null ? '' : c ? <span className="font-medium text-red-600">+{fmtDong(c)}</span> : <span className="text-emerald-700">thấp nhất</span>;
    }, 'so'],
    ['TRỊ GIÁ ĐƠN HÀNG', (_, g) => (g ? fmtDong(g.triGia) : ''), 'so'],
    ['CÔNG TRÌNH', (_, g) => [g?.maCongTrinh, g?.tenCongTrinh].filter(Boolean).join(' · ')],
    ['NHÓM SẢN PHẨM', (_, g) => g?.nhomSp ?? ''],
    ['XƯỞNG', (_, g) => g?.xuong ?? '', 'giua'],
    ['BOP', (_, g) => g?.bop ?? '', 'giua'],
    ['TÌNH TRẠNG IPO', (_, g) => g?.ipo ?? ''],
    ['PM / PC', (_, g) => [g?.pm, g?.pc].filter(Boolean).join(' / ')],
    ['MÃ NHÀ MÁY', (_, g) => g?.maNhaMay ?? ''],
    ['MÔ TẢ SẢN PHẨM', (_, g) => g?.moTa ?? ''],
    ['GIA CÔNG NGOÀI', (_, g) => (g ? fmtGiaCongNgoai(g.coGiaCongNgoai) : ''), 'giua'],
    ...(coVatTu ? [['TỔNG VẬT TƯ', (_: string, g: TraGiaHex | undefined) => (g ? (g.coGiaVatTu === false ? 'không có quyền xem' : fmtDong(g.tongVatTu)) : ''), 'so'] as CotCt] : []),
  ];
  const ds = useMemo(() => {
    const t = tim.trim().toUpperCase();
    if (!t) return hexes;
    return hexes.filter(h => {
      const g = kq[h];
      return [h, g?.maNhaMay, g?.tenHangMuc, g?.moTa, g?.tenCongTrinh, g?.maCongTrinh, g?.xuong].some(v => String(v ?? '').toUpperCase().includes(t));
    });
  }, [hexes, kq, tim]);
  const tongTriGia = ds.reduce((a, h) => a + (kq[h]?.triGia ?? 0), 0);
  const tongSl = ds.reduce((a, h) => a + (kq[h]?.soLuong ?? 0), 0);
  const tomTat = tomTatMucGia(hexes, kq);
  return (
    <ModalShell open onClose={onDong} labelledBy="m6-bang-ct" closeOnEsc closeOnBackdrop overlayClassName={bang.cuaSoNen} panelClassName={bang.cuaSoKhung}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="m6-bang-ct" className="text-xl font-bold text-slate-900">Các mã HEX cùng sản phẩm — bảng chi tiết</h3>
          <p className={`text-base ${tomTat.mucGia.length >= 2 ? 'font-medium text-red-700' : 'text-slate-600'}`}>{tomTat.text}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm trong bảng" className="w-44 outline-none" />
          </label>
          <button type="button" onClick={onDong} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><XIcon className="h-5 w-5" /></button>
        </div>
      </div>
      <div className={`${bang.khung} min-h-0 flex-1`}>
        <table className={`${bang.table} ${bang.cuaSoBang}`}>
          <thead className={bang.thead}>
            <tr>
              <th className={`${bang.thC} w-14`}>STT</th>
              {cot.map(([t]) => <th key={t} className={`${bang.thC} whitespace-nowrap`}>{t}</th>)}
              {onRemove && <th className={`${bang.thC} w-20 whitespace-nowrap`} title="Xoá mã khỏi danh sách mã trùng (nhập nhầm)">XOÁ MÃ</th>}
            </tr>
          </thead>
          <tbody>
            {ds.map((h, i) => {
              const g = kq[h];
              return (
                <tr key={h} className={`align-top hover:bg-slate-50 ${h === mainHex ? 'bg-blue-50/60' : ''}`}>
                  <td className={bang.tdSo}>{i + 1}</td>
                  {cot.map(([t, f, kieu]) => (
                    <td key={t} className={`${bang.tdB} ${kieu === 'so' ? 'whitespace-nowrap text-right tabular-nums' : kieu === 'giua' ? 'whitespace-nowrap text-center' : 'min-w-[9rem] max-w-[28rem] whitespace-pre-line'}`}>
                      {!g && t === 'TÊN HẠNG MỤC' ? <span className="text-slate-400">{loading ? 'Đang tra…' : err ? 'Chưa tra được' : 'Không có trong dữ liệu'}</span> : f(h, g)}
                    </td>
                  ))}
                  {onRemove && (
                    <td className={`${bang.tdB} text-center`}>
                      {h !== mainHex && (
                        <button type="button" onClick={() => onRemove(h)} aria-label={`Xoá mã ${h} khỏi danh sách`} title="Xoá mã này khỏi danh sách mã trùng (nhập nhầm)"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-600"><XIcon size="1em" /></button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!ds.length && <tr><td colSpan={cot.length + 2} className={`${bang.tdB} py-6 text-center text-slate-500`}>Không có mã nào khớp ô tìm.</td></tr>}
          </tbody>
          {ds.length > 0 && (
            <tfoot className={bang.tfoot}>
              <tr>
                <td className={`${bang.tdB} text-center`}>TỔNG</td>
                {cot.map(([t]) => (
                  <td key={t} className={`${bang.tdB} whitespace-nowrap ${t === 'SỐ LƯỢNG' || t === 'TRỊ GIÁ ĐƠN HÀNG' ? 'text-right tabular-nums' : ''}`}>
                    {t === 'HEX' ? `${fmtInt(ds.length)} mã` : t === 'SỐ LƯỢNG' ? (tongSl ? fmtSl(tongSl) : '') : t === 'TRỊ GIÁ ĐƠN HÀNG' ? fmtDong(tongTriGia) : ''}
                  </td>
                ))}
                {onRemove && <td className={bang.tdB} />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ModalShell>
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
export function TienM6Fields({ mainHex, value, onChange, batBuocLoai, scanButton, anh }: {
  mainHex?: string;
  value: Partial<ChiTietTien>;
  onChange: (v: Partial<ChiTietTien>) => void;
  /** Báo mới: bắt buộc chọn loại vấn đề (sửa bản cũ chưa phân loại thì không) */
  batBuocLoai?: boolean;
  /** Nút quét mã (form cha giữ camera): gọi `them(code)` khi quét được */
  scanButton?: (them: (code: string) => void) => ReactNode;
  /** Ảnh sản phẩm chung (form cha giữ ảnh chưa lưu, tải lên sau khi lưu vướng mắc) */
  anh?: AnhSpProps;
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
            <BangTraGia hexes={traDs} mainHex={mainHex} kq={kq} loading={loading} err={err} anh={anh}
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
          <BangTraGia hexes={ds} mainHex={hex} kq={kq} loading={loading} err={err} dense={dense}
            anh={ct.anhSp ? { daCo: ct.anhSp } : undefined} />
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
