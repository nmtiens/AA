import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, ArrowUp, ArrowDown, X, Plus, Rocket, Check } from 'lucide-react';
import { xuongSetupApi, type DanhSachTrienKhai, type HangMucTrienKhai } from '../../services/xuongSetupApi';
import { INPUT, BTN, BTN_CHINH, KHUNG, TH, TD } from './xuongDesktopUi';

// ============================================================================
// TRIỂN KHAI HẠNG MỤC (QT1 + QT2 gộp một màn — cải tiến 8, quyết định 7A: máy tính trước).
// Kế hoạch xưởng chính chọn nhiều hạng mục, nhập số triển khai, chọn tuyến công đoạn MỘT lần áp cho cả nhóm
// (gợi ý theo lần triển khai trước của cùng nhóm sản phẩm). Triển khai xong: công đoạn đầu tuyến thấy "Chờ nhận";
// tuyến dùng để gợi ý "giao sang" ở màn tổ trưởng.
// ============================================================================

type Bao = (ok: boolean, msg: string) => void;

export default function TrienKhaiXuong({ xuong, bao }: { xuong: string; bao: Bao }) {
  const [q, setQ] = useState('');
  const [qTim, setQTim] = useState('');
  const [chiChua, setChiChua] = useState(true);
  const [d, setD] = useState<DanhSachTrienKhai | null>(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [sl, setSl] = useState<Record<string, number>>({});
  const [tuyen, setTuyen] = useState<Record<string, string[]>>({});
  const [mau, setMau] = useState<string[]>([]);
  const [them, setThem] = useState('');
  const [gui, setGui] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQTim(q.trim()), 400); return () => clearTimeout(t); }, [q]);

  const tai = useCallback(async () => {
    setDang(true);
    const r = await xuongSetupApi.dsTrienKhai(xuong, { q: qTim || undefined, chua: chiChua });
    setDang(false);
    if (!r.ok) { setLoi(r.message); return; }
    setLoi(''); setD(r.data); setChon(new Set());
    setSl(Object.fromEntries(r.data.hangMuc.map(h => [h.hex, conLai(h)])));
    setTuyen(Object.fromEntries(r.data.hangMuc.map(h => [h.hex, h.goiYTuyen ?? []])));
  }, [xuong, qTim, chiChua]);
  useEffect(() => { tai(); }, [tai]);

  const tenCd = useMemo(() => {
    const m = new Map((d?.congDoan ?? []).map(c => [c.id, c]));
    return (id: string) => { const c = m.get(id); return c ? (c.xuong === xuong ? c.ten : `${c.ten} (${c.xuong})`) : id; };
  }, [d, xuong]);
  const nhomCd = useMemo(() => {
    const g = new Map<string, DanhSachTrienKhai['congDoan']>();
    for (const c of d?.congDoan ?? []) { if (!g.has(c.xuong)) g.set(c.xuong, []); g.get(c.xuong)!.push(c); }
    return [...g.entries()].sort(([a], [b]) => (a === xuong ? -1 : b === xuong ? 1 : a.localeCompare(b)));
  }, [d, xuong]);

  const dsChon = (d?.hangMuc ?? []).filter(h => chon.has(h.hex));
  const sanSang = dsChon.filter(h => (sl[h.hex] ?? 0) > 0 && (tuyen[h.hex] ?? []).length > 0);
  const tatCa = !!d && d.hangMuc.length > 0 && d.hangMuc.every(h => chon.has(h.hex));

  const trienKhai = async () => {
    setGui(true);
    const r = await xuongSetupApi.trienKhai(xuong, sanSang.map(h => ({ hex: h.hex, soLuong: sl[h.hex], tuyen: tuyen[h.hex] })));
    setGui(false);
    if (r.ok) { bao(true, `Đã triển khai ${r.data.soHangMuc} hạng mục — công đoạn đầu tuyến đã thấy "Chờ nhận"`); tai(); }
    else bao(false, r.message);
  };

  return (
    <div className="space-y-4">
      <div className={KHUNG}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative w-72">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className={`${INPUT} pl-8`} value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm hex, hạng mục, công trình" aria-label="Tìm hạng mục" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={chiChua} onChange={e => setChiChua(e.target.checked)} /> Chỉ hạng mục chưa triển khai đủ
          </label>
          <span className="text-xs text-slate-500">Hạng mục có xưởng chính {xuong} trong dữ liệu sản xuất (tối đa 300 dòng mới nhất)</span>
          <button type="button" className={`${BTN} ml-auto`} onClick={tai}><RefreshCw size={13} className={dang ? 'animate-spin' : ''} /> Tải lại</button>
        </div>
        {loi && <p className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[1] bg-slate-50"><tr>
              <th className={`${TH} w-8`}><input type="checkbox" aria-label="Chọn tất cả" checked={tatCa}
                onChange={() => setChon(tatCa ? new Set() : new Set(d?.hangMuc.map(h => h.hex)))} /></th>
              <th className={TH}>Hex</th><th className={TH}>Hạng mục · công trình</th><th className={TH}>Nhóm sản phẩm</th>
              <th className={`${TH} text-right`}>Đơn hàng</th><th className={`${TH} text-right`}>Đã triển khai</th>
              <th className={`${TH} w-28 text-right`}>Triển khai lần này</th><th className={TH}>Tuyến công đoạn</th>
            </tr></thead>
            <tbody>
              {(d?.hangMuc ?? []).map(h => {
                const t = tuyen[h.hex] ?? [];
                const laGoiY = !!h.goiYTuyen && JSON.stringify(h.goiYTuyen) === JSON.stringify(t);
                return (
                  <tr key={h.hex} className={`border-t border-slate-100 ${chon.has(h.hex) ? 'bg-wood-50' : ''}`}>
                    <td className={TD}><input type="checkbox" aria-label={`Chọn ${h.hex}`} checked={chon.has(h.hex)}
                      onChange={() => setChon(s => { const n = new Set(s); if (n.has(h.hex)) n.delete(h.hex); else n.add(h.hex); return n; })} /></td>
                    <td className={`${TD} font-medium tabular-nums text-slate-800`}>{h.hex}</td>
                    <td className={TD}><span className="text-slate-800">{h.ten}</span><br /><span className="text-xs text-slate-500">{h.tenCongTrinh}</span></td>
                    <td className={`${TD} text-xs`}>{h.nhom ?? '—'}</td>
                    <td className={`${TD} text-right tabular-nums`}>{h.soLuongDonHang ?? '—'} {h.dvt ?? ''}</td>
                    <td className={`${TD} text-right tabular-nums`}>{h.daTrienKhai || '—'}</td>
                    <td className={TD}><input type="number" min={0} className={`${INPUT} text-right tabular-nums`} value={sl[h.hex] ?? 0}
                      onChange={e => setSl(s => ({ ...s, [h.hex]: Math.max(0, Number(e.target.value) || 0) }))} aria-label={`Số lượng triển khai ${h.hex}`} /></td>
                    <td className={`${TD} text-xs`}>
                      {t.length ? <>{t.map(tenCd).join(' → ')}{laGoiY && <span className="ml-1 rounded bg-emerald-50 px-1 text-emerald-700">gợi ý</span>}</>
                        : <span className="text-amber-700">Chưa có tuyến — chọn ở dưới</span>}
                    </td>
                  </tr>
                );
              })}
              {d && d.hangMuc.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-sm text-slate-500">Không có hạng mục nào{chiChua ? ' chưa triển khai đủ' : ''}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${KHUNG} space-y-3 p-4`}>
        <p className="text-sm font-semibold text-slate-800">Tuyến công đoạn ({dsChon.length} hạng mục đã chọn)</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {mau.length === 0 && <span className="text-sm text-slate-500">Chưa có công đoạn — thêm theo thứ tự hàng đi qua.</span>}
          {mau.map((id, i) => (
            <span key={`${id}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
              <span className="text-xs text-slate-400">{i + 1}.</span> {tenCd(id)}
              <button type="button" aria-label="Lên" disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                onClick={() => setMau(m => { const n = [...m]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}><ArrowUp size={13} /></button>
              <button type="button" aria-label="Xuống" disabled={i === mau.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                onClick={() => setMau(m => { const n = [...m]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}><ArrowDown size={13} /></button>
              <button type="button" aria-label="Bỏ" className="text-slate-400 hover:text-red-600" onClick={() => setMau(m => m.filter((_, j) => j !== i))}><X size={13} /></button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={them} onChange={e => setThem(e.target.value)} className="min-w-72 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" aria-label="Chọn công đoạn thêm vào tuyến">
            <option value="">— Chọn công đoạn —</option>
            {nhomCd.map(([x, ds]) => (
              <optgroup key={x} label={`Xưởng ${x}${x === xuong ? ' (xưởng chính)' : ' — giao xưởng phụ'}`}>
                {ds.map(c => <option key={c.id} value={c.id}>{c.cdTachMa ? `${c.cdTachMa} · ` : ''}{c.ten}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" className={BTN} disabled={!them} onClick={() => { setMau(m => [...m, them]); setThem(''); }}><Plus size={14} /> Thêm vào tuyến</button>
          {dsChon.length === 1 && (tuyen[dsChon[0].hex] ?? []).length > 0 && (
            <button type="button" className={BTN} onClick={() => setMau(tuyen[dsChon[0].hex])}>Lấy tuyến của {dsChon[0].hex}</button>
          )}
          <button type="button" className={BTN} disabled={!mau.length || !dsChon.length}
            onClick={() => setTuyen(t => ({ ...t, ...Object.fromEntries(dsChon.map(h => [h.hex, mau])) }))}>
            <Check size={14} /> Áp tuyến cho {dsChon.length} hạng mục đã chọn
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <p className="text-sm text-slate-600">
            {sanSang.length} / {dsChon.length} hạng mục sẵn sàng (có số lượng &gt; 0 và tuyến).
            {dsChon.length > sanSang.length && <span className="text-amber-700"> Hạng mục thiếu số lượng hoặc tuyến sẽ không được triển khai.</span>}
          </p>
          <button type="button" className={`${BTN_CHINH} ml-auto`} disabled={!sanSang.length || gui} onClick={trienKhai}>
            <Rocket size={14} /> Triển khai {sanSang.length} hạng mục
          </button>
        </div>
      </div>
    </div>
  );
}

const conLai = (h: HangMucTrienKhai) => (h.soLuongDonHang === null ? 1 : Math.max(0, h.soLuongDonHang - h.daTrienKhai));
