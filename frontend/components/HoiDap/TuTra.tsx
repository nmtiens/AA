import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Play } from 'lucide-react';
import {
  type BangDM, type CotDM, type Ham, type Loc, type Moc, type Op, type TruyVan,
  OP_THEO_KIEU, TEN_HAM, TEN_MOC, TEN_OP, layGiaTri, cotMoRong,
} from './truyVanApi';

// ============================================================================
// TỰ TRA: chọn bảng · phép tính · nhóm theo · lọc · kỳ (không cần gõ câu). Mở từ nút "Tự tra" hoặc nút "Sửa điều kiện"
// dưới câu trả lời (điền sẵn truy vấn vừa chạy). Danh mục bảng / cột do máy chủ trả theo quyền.
// ============================================================================

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const KY_NHANH: Array<[string, () => [string | undefined, string | undefined]]> = [
  ['Tất cả', () => [undefined, undefined]],
  ['Hôm nay', () => { const h = new Date(); return [iso(h), iso(h)]; }],
  ['7 ngày', () => { const h = new Date(); return [iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 6)), iso(h)]; }],
  ['Tháng này', () => { const h = new Date(); return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)]; }],
  ['Tháng trước', () => { const h = new Date(); return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))]; }],
  ['Quý này', () => { const h = new Date(); return [iso(new Date(h.getFullYear(), Math.floor(h.getMonth() / 3) * 3, 1)), iso(h)]; }],
  ['Năm nay', () => { const h = new Date(); return [iso(new Date(h.getFullYear(), 0, 1)), iso(h)]; }],
  ['Năm trước', () => { const y = new Date().getFullYear() - 1; return [`${y}-01-01`, `${y}-12-31`]; }],
];
const HAM_DS: Ham[] = ['tong', 'dem', 'dem_khac', 'tb', 'max', 'min'];
const cotHopHam = (h: Ham, c: CotDM) =>
  h === 'tong' || h === 'tb' ? c.kieu === 'so' : h === 'max' || h === 'min' ? c.kieu === 'so' || c.kieu === 'ngay' : h === 'dem_khac' ? c.kieu !== 'so' : false;

const O = 'h-8 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:border-slate-500 focus:outline-none';
const NHAN = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';

const moi = (b: BangDM, cu?: TruyVan): TruyVan => ({
  bang: b.id, kieu: 'tong', do: b.mac.map(d => ({ ...d })), nhom: [], loc: [], tu: cu?.tu, den: cu?.den,
});

/** Ô giá trị lọc chữ: gợi ý giá trị hay gặp của cột (máy chủ đếm sẵn) */
const OGiaTri: React.FC<{ bang: string; cot: CotDM; v: string; doi: (v: string) => void }> = ({ bang, cot, v, doi }) => {
  const [ds, setDs] = useState<Array<{ v: string; n: number }>>([]);
  const id = useMemo(() => `gt-${bang}-${cot.id}-${Math.random().toString(36).slice(2, 7)}`, [bang, cot.id]);
  const hen = useRef<ReturnType<typeof setTimeout>>();
  const tai = (q: string) => {
    clearTimeout(hen.current);
    hen.current = setTimeout(() => { layGiaTri(bang, cot.id, q).then(setDs).catch(() => setDs([])); }, 250);
  };
  useEffect(() => () => clearTimeout(hen.current), []);
  return (
    <>
      <input list={id} value={v} onFocus={() => tai(v)} onChange={e => { doi(e.target.value); tai(e.target.value); }}
        placeholder="Giá trị…" className={`${O} flex-1`} />
      <datalist id={id}>{ds.map(x => <option key={x.v} value={x.v}>{`${x.n.toLocaleString('en-US')} dòng`}</option>)}</datalist>
    </>
  );
};

const TuTra: React.FC<{ dm: BangDM[]; ban?: TruyVan; onChay: (tv: TruyVan) => void; onDong: () => void }> = ({ dm, ban, onChay, onDong }) => {
  const [tv, setTv] = useState<TruyVan>(() => (ban && dm.some(b => b.id === ban.bang) ? JSON.parse(JSON.stringify(ban)) : moi(dm[0])));
  const b = dm.find(x => x.id === tv.bang) ?? dm[0];
  const doi = (p: Partial<TruyVan>) => setTv(t => ({ ...t, ...p }));
  // Cột của bảng + thông tin hạng mục từ bảng sản xuất (qua HEX) để lọc / chia
  const cots = cotMoRong(b, dm);
  const cot = (id: string) => cots.find(c => c.id === id);
  const tenCot = (c: CotDM) => (c.sx ? `${c.ten} · hạng mục` : c.ten);
  const cotNgay = cots.filter(c => c.kieu === 'ngay');
  const cotNhom = cots.filter(c => c.kieu !== 'so' && c.kieu !== 'ngay');

  const doiLoc = (i: number, p: Partial<Loc>) => doi({ loc: tv.loc.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const themLoc = () => {
    const c = b.cot.find(x => x.kieu === 'xuong') ?? b.cot.find(x => x.kieu === 'ct') ?? b.cot[0];
    doi({ loc: [...tv.loc, { cot: c.id, op: OP_THEO_KIEU(c.kieu)[0], gt: '' }] });
  };
  const sanSang = tv.kieu === 'dong' || tv.do.every(d => d.ham === 'dem' || d.cot);

  const chay = () => {
    // Bỏ dòng lọc chưa nhập giá trị
    const loc = tv.loc.filter(l => l.op === 'rong' || l.op === 'co' || (Array.isArray(l.gt) ? l.gt.every(v => String(v).trim()) : String(l.gt ?? '').trim()));
    onChay({ ...tv, loc, do: tv.kieu === 'dong' ? [] : tv.do, nhom: tv.kieu === 'dong' ? [] : tv.nhom });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 custom-scrollbar">
        <div>
          <label className={NHAN}>Bảng dữ liệu</label>
          <select value={tv.bang} onChange={e => { const nb = dm.find(x => x.id === e.target.value)!; setTv(moi(nb, tv)); }} className={`${O} w-full`}>
            {dm.map(x => <option key={x.id} value={x.id}>{x.ten}</option>)}
          </select>
        </div>

        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {([['tong', 'Tổng hợp số liệu'], ['dong', 'Liệt kê từng dòng']] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => doi({ kieu: k })}
              className={`flex-1 rounded-md py-1.5 ${tv.kieu === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{t}</button>
          ))}
        </div>

        {tv.kieu === 'tong' ? (
          <>
            <div>
              <label className={NHAN}>Tính</label>
              <div className="space-y-1.5">
                {tv.do.map((d, i) => (
                  <div key={i} className="flex gap-1.5">
                    <select value={d.ham} className={`${O} w-32`}
                      onChange={e => {
                        const h = e.target.value as Ham;
                        const giu = d.cot && cot(d.cot) && cotHopHam(h, cot(d.cot)!) ? d.cot : b.cot.find(c => cotHopHam(h, c))?.id;
                        doi({ do: tv.do.map((x, j) => (j === i ? (h === 'dem' ? { ham: h } : { ham: h, cot: giu }) : x)) });
                      }}>
                      {HAM_DS.map(h => <option key={h} value={h}>{TEN_HAM[h]}</option>)}
                    </select>
                    {d.ham === 'dem' ? <span className="flex flex-1 items-center text-xs text-slate-500">số {b.dong}</span> : (
                      <select value={d.cot ?? ''} onChange={e => doi({ do: tv.do.map((x, j) => (j === i ? { ...x, cot: e.target.value } : x)) })} className={`${O} flex-1`}>
                        <option value="" disabled>Chọn cột…</option>
                        {b.cot.filter(c => cotHopHam(d.ham, c)).map(c => <option key={c.id} value={c.id}>{c.ten}{c.tien ? ' (tỷ)' : ''}</option>)}
                      </select>
                    )}
                    {tv.do.length > 1 && <button type="button" onClick={() => doi({ do: tv.do.filter((_, j) => j !== i) })} className="px-1 text-slate-400 hover:text-slate-700" aria-label="Bỏ"><X size={14} /></button>}
                  </div>
                ))}
                {tv.do.length < 4 && (
                  <button type="button" onClick={() => doi({ do: [...tv.do, { ham: 'dem' }] })} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
                    <Plus size={13} /> Thêm phép tính
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className={NHAN}>Chia theo</label>
              <div className="flex gap-1.5">
                {[0, 1].map(i => (i === 0 || tv.nhom.length >= 1) && (
                  <select key={i} value={tv.nhom[i] ?? ''} className={`${O} flex-1`}
                    onChange={e => { const n = [...tv.nhom]; if (e.target.value) n[i] = e.target.value; else n.splice(i, 1); doi({ nhom: n.filter(Boolean).slice(0, 2) }); }}>
                    <option value="">{i === 0 ? 'Không chia (1 dòng tổng)' : '— thêm cột chia —'}</option>
                    {cotNgay.map(c => (
                      <optgroup key={c.id} label={c.ten}>
                        {(Object.keys(TEN_MOC) as Moc[]).map(m => <option key={m} value={`${c.id}@${m}`}>{tenCot(c)} — theo {TEN_MOC[m]}</option>)}
                      </optgroup>
                    ))}
                    <optgroup label="Cột">{cotNhom.map(c => <option key={c.id} value={c.id}>{tenCot(c)}</option>)}</optgroup>
                  </select>
                ))}
              </div>
              {tv.nhom.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
                  <span>Hiện</span>
                  <select value={tv.gioiHan ?? 50} onChange={e => doi({ gioiHan: +e.target.value })} className={`${O} w-20`}>
                    {[10, 20, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span>nhóm,</span>
                  <select value={tv.sap?.giam === false ? 'tang' : 'giam'} onChange={e => doi({ sap: e.target.value === 'tang' ? { cot: tv.nhom.length, giam: false } : undefined })} className={`${O} w-28`}>
                    <option value="giam">nhiều trước</option>
                    <option value="tang">ít trước</option>
                  </select>
                </div>
              )}
            </div>
          </>
        ) : (
          <div>
            <label className={NHAN}>Cột hiện</label>
            <div className="flex flex-wrap gap-1.5">
              {b.cot.map(c => {
                const chon = (tv.cotXem ?? []).includes(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => doi({ cotXem: chon ? (tv.cotXem ?? []).filter(x => x !== c.id) : [...(tv.cotXem ?? []), c.id].slice(0, 12) })}
                    className={`rounded-full border px-2 py-0.5 text-xs ${chon ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'}`}>{c.ten}</button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Không chọn cột nào = các cột chính của bảng.</p>
          </div>
        )}

        <div>
          <label className={NHAN}>Lọc</label>
          <div className="space-y-1.5">
            {tv.loc.map((l, i) => {
              const c = cot(l.cot) ?? cots[0];
              const ops = OP_THEO_KIEU(c.kieu);
              const ds = Array.isArray(l.gt) ? l.gt : [l.gt ?? ''];
              const hien = (v: unknown) => (v === undefined || v === '' ? '' : c.tien ? String(Number(v) / 1000) : String(v));
              const nhan = (v: string) => (c.kieu === 'so' ? (v === '' ? '' : c.tien ? Number(v) * 1000 : Number(v)) : v);
              const o1 = (j: number) => c.kieu === 'ngay'
                ? <input type="date" value={String(ds[j] ?? '')} onChange={e => { const n = [...ds]; n[j] = e.target.value; doiLoc(i, { gt: l.op === 'trong_khoang' ? n : n[0] }); }} className={`${O} flex-1`} />
                : c.kieu === 'so'
                  ? <input type="number" step="any" value={hien(ds[j])} placeholder={c.tien ? 'tỷ' : 'số'} onChange={e => { const n = [...ds]; n[j] = nhan(e.target.value); doiLoc(i, { gt: l.op === 'trong_khoang' ? n : n[0] }); }} className={`${O} w-0 flex-1`} />
                  : <OGiaTri bang={b.id} cot={c} v={ds.map(String).join(', ')} doi={v => doiLoc(i, { gt: l.op === 'bang' && v.includes(',') ? v.split(',').map(x => x.trim()) : v })} />;
              return (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-1.5">
                  <div className="flex gap-1.5">
                    <select value={l.cot} className={`${O} flex-1`}
                      onChange={e => { const nc = cot(e.target.value)!; doiLoc(i, { cot: nc.id, op: OP_THEO_KIEU(nc.kieu)[0], gt: '' }); }}>
                      {cots.map(x => <option key={x.id} value={x.id}>{tenCot(x)}</option>)}
                    </select>
                    <select value={l.op} onChange={e => doiLoc(i, { op: e.target.value as Op, gt: e.target.value === 'trong_khoang' ? ['', ''] : ds[0] })} className={`${O} w-28`}>
                      {ops.map(o => <option key={o} value={o}>{TEN_OP[o]}</option>)}
                    </select>
                    <button type="button" onClick={() => doi({ loc: tv.loc.filter((_, j) => j !== i) })} className="px-1 text-slate-400 hover:text-slate-700" aria-label="Bỏ điều kiện"><X size={14} /></button>
                  </div>
                  {l.op !== 'rong' && l.op !== 'co' && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {o1(0)}
                      {l.op === 'trong_khoang' && <><span className="text-xs text-slate-400">đến</span>{o1(1)}</>}
                    </div>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={themLoc} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
              <Plus size={13} /> Thêm điều kiện
            </button>
          </div>
        </div>

        <div>
          <label className={NHAN}>Kỳ — theo {b.cot.find(c => c.id === b.ngay)?.ten.toLowerCase()}{b.chot ? ' (tồn kho: lấy ngày chốt mới nhất trong kỳ)' : ''}</label>
          <div className="mb-1.5 flex flex-wrap gap-1">
            {KY_NHANH.map(([t, f]) => {
              const [a, z] = f();
              const dang = (tv.tu ?? '') === (a ?? '') && (tv.den ?? '') === (z ?? '');
              return (
                <button key={t} type="button" onClick={() => doi({ tu: a, den: z })}
                  className={`rounded-full border px-2 py-0.5 text-xs ${dang ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'}`}>{t}</button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={tv.tu ?? ''} onChange={e => doi({ tu: e.target.value || undefined })} className={`${O} flex-1`} />
            <span className="text-xs text-slate-400">đến</span>
            <input type="date" value={tv.den ?? ''} onChange={e => doi({ den: e.target.value || undefined })} className={`${O} flex-1`} />
          </div>
        </div>

        {b.huy && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={!!tv.gomHuy} onChange={e => doi({ gomHuy: e.target.checked || undefined })} className="rounded border-slate-300" />
            Tính cả hạng mục đã HỦY (mặc định bỏ, giống Tổng quan)
          </label>
        )}
      </div>

      <div className="flex gap-2 border-t border-slate-200 p-3">
        <button type="button" onClick={onDong} className="h-9 rounded-xl border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50">Đóng</button>
        <button type="button" disabled={!sanSang} onClick={chay}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400">
          <Play size={14} /> Xem số liệu
        </button>
      </div>
    </div>
  );
};

export default TuTra;
