import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Rocket, Check } from 'lucide-react';
import { xuongSetupApi, type DanhSachTrienKhai, type HangMucTrienKhai, type ThanhPhanTrienKhai } from '../../services/xuongSetupApi';
import { INPUT, BTN, BTN_CHINH, KHUNG } from './xuongDesktopUi';
import { khung, table, thead, thC, tdB, tdSo, trong0 } from '../shared/bangBaoCao';
import { fmtQty } from '../../utils/format';
import { tenCongDoan } from './ChonTuyen';
import KhaiThanhPhan, { loiThanhPhan } from './KhaiThanhPhan';

// ============================================================================
// TRIỂN KHAI HẠNG MỤC (QT1 + QT2 gộp một màn — cải tiến 8, quyết định 7A: máy tính trước).
// Kế hoạch xưởng chính chọn nhiều hạng mục, nhập số triển khai, khai CÔNG ĐOẠN THÀNH PHẦN (Gỗ / Sofa / Kim loại / Kính /
// Đá — trường hợp "song song") MỘT lần áp cho cả nhóm: mỗi thành phần một xưởng thực hiện + tuyến CĐ chi tiết (gợi ý
// theo lần triển khai trước của cùng nhóm sản phẩm). Thành phần giao xưởng phụ để trống tuyến => xưởng phụ tự khai CĐ
// chi tiết (QT2, mục "Khai CĐ chi tiết"). Triển khai xong: công đoạn đầu tuyến từng thành phần thấy "Chờ nhận"; công
// đoạn hợp nhánh (vd Fitting) chỉ nhận được số bộ đã về đủ thành phần.
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
  const [tp, setTp] = useState<Record<string, ThanhPhanTrienKhai[]>>({});
  const [mau, setMau] = useState<ThanhPhanTrienKhai[]>([]);
  const [gui, setGui] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQTim(q.trim()), 400); return () => clearTimeout(t); }, [q]);

  const tai = useCallback(async () => {
    setDang(true);
    const r = await xuongSetupApi.dsTrienKhai(xuong, { q: qTim || undefined, chua: chiChua });
    setDang(false);
    if (!r.ok) { setLoi(r.message); return; }
    setLoi(''); setD(r.data); setChon(new Set());
    setSl(Object.fromEntries(r.data.hangMuc.map(h => [h.hex, conLai(h)])));
    setTp(Object.fromEntries(r.data.hangMuc.map(h => [h.hex, h.goiYThanhPhan ?? []])));
  }, [xuong, qTim, chiChua]);
  useEffect(() => { tai(); }, [tai]);

  const tenCd = useMemo(() => tenCongDoan(d?.congDoan ?? [], xuong), [d, xuong]);
  const xuongCd = useMemo(() => new Map((d?.congDoan ?? []).map(c => [c.id, c.xuong])), [d]);
  // Hợp lệ: có thành phần; thành phần xưởng chính có tuyến; đầu tuyến thuộc xưởng thực hiện
  const loiTp = (ds: ThanhPhanTrienKhai[]) => loiThanhPhan(ds, xuong, xuongCd);

  const dsChon = (d?.hangMuc ?? []).filter(h => chon.has(h.hex));
  // Thành phần dùng khi triển khai: của riêng hạng mục nếu hợp lệ; chưa hợp lệ mà mẫu đang soạn hợp lệ => dùng mẫu
  // (khỏi phải bấm "Áp cho … hạng mục đã chọn" — bước hay bị sót)
  const tpDung = (hex: string): ThanhPhanTrienKhai[] => {
    const rieng = tp[hex] ?? [];
    return loiTp(rieng) && mau.length && !loiTp(mau) ? mau : rieng;
  };
  const sanSang = dsChon.filter(h => (sl[h.hex] ?? 0) > 0 && !loiTp(tpDung(h.hex)));
  const tatCa = !!d && d.hangMuc.length > 0 && d.hangMuc.every(h => chon.has(h.hex));

  const trienKhai = async () => {
    setGui(true);
    const r = await xuongSetupApi.trienKhai(xuong, sanSang.map(h => ({ hex: h.hex, soLuong: sl[h.hex], thanhPhan: tpDung(h.hex) })));
    setGui(false);
    if (r.ok) { bao(true, `Đã triển khai ${r.data.soHangMuc} hạng mục — công đoạn đầu tuyến từng thành phần đã thấy "Chờ nhận"; thành phần giao xưởng phụ chờ xưởng phụ khai CĐ chi tiết`); tai(); }
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
        <div className={`${khung} max-h-[55vh]`}>
          <table className={`${table} min-w-[36rem] rmd:min-w-0`}>
            <thead className={thead}><tr>
              <th className={`${thC} w-8`}><input type="checkbox" aria-label="Chọn tất cả" checked={tatCa}
                onChange={() => setChon(tatCa ? new Set() : new Set(d?.hangMuc.map(h => h.hex)))} /></th>
              <th className={thC}>Hex</th><th className={thC}>Hạng mục · công trình</th><th className={thC}>Nhóm sản phẩm</th>
              <th className={thC}>Đơn hàng</th><th className={thC}>Đã triển khai</th>
              <th className={`${thC} w-28`}>Triển khai lần này</th><th className={thC}>Thành phần · tuyến công đoạn</th>
            </tr></thead>
            <tbody>
              {(d?.hangMuc ?? []).map(h => {
                const t = tp[h.hex] ?? [];
                const laGoiY = !!h.goiYThanhPhan && JSON.stringify(h.goiYThanhPhan) === JSON.stringify(t);
                const loi = loiTp(t);
                return (
                  <tr key={h.hex} className={chon.has(h.hex) ? 'bg-slate-50' : 'hover:bg-slate-50'}>
                    <td className={`${tdB} text-center`}><input type="checkbox" aria-label={`Chọn ${h.hex}`} checked={chon.has(h.hex)}
                      onChange={() => setChon(s => { const n = new Set(s); if (n.has(h.hex)) n.delete(h.hex); else n.add(h.hex); return n; })} /></td>
                    <td className={`${tdB} whitespace-nowrap tabular-nums`}>{h.hex}</td>
                    <td className={tdB}>{h.ten}<br /><span className="text-sm font-normal text-slate-500">{h.tenCongTrinh}</span></td>
                    <td className={tdB}>{h.nhom ?? '—'}</td>
                    <td className={tdSo}>{fmtQty(h.soLuongDonHang)} {h.dvt ?? ''}</td>
                    <td className={tdSo}>{trong0(h.daTrienKhai, fmtQty)}</td>
                    <td className={tdB}><input type="number" min={0} className={`${INPUT} min-w-[4.5rem] text-center tabular-nums`} value={sl[h.hex] ?? 0}
                      onChange={e => setSl(s => ({ ...s, [h.hex]: Math.max(0, Number(e.target.value) || 0) }))} aria-label={`Số lượng triển khai ${h.hex}`} /></td>
                    <td className={`${tdB} text-sm`}>
                      {t.map(x => (
                        <div key={x.ten}><b>{x.ten}</b>{x.xuong !== xuong ? ` (${x.xuong})` : ''}: {x.tuyen.length ? x.tuyen.map(tenCd).join(' → ') : <i className="text-slate-500">xưởng {x.xuong} tự khai CĐ chi tiết</i>}</div>
                      ))}
                      {laGoiY && t.length > 0 && <span className="rounded bg-emerald-50 px-1 text-emerald-700">{h.goiYNguon === 'mac_dinh' ? 'mặc định' : 'gợi ý'}</span>}
                      {loi && <span className="text-amber-700">{t.length ? loi : 'Chưa có thành phần — khai ở dưới'}</span>}
                    </td>
                  </tr>
                );
              })}
              {d && d.hangMuc.length === 0 && <tr><td colSpan={8} className={`${tdB} py-6 text-center font-normal text-slate-500`}>Không có hạng mục nào{chiChua ? ' chưa triển khai đủ' : ''}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${KHUNG} space-y-3 p-4`}>
        <p className="text-base font-semibold text-slate-900">Công đoạn thành phần ({dsChon.length} hạng mục đã chọn)</p>
        <p className="text-xs text-slate-500">
          Mỗi thành phần đi tuyến công đoạn chi tiết riêng (song song), hợp lại ở công đoạn chung (vd Fitting). Thành phần giao
          xưởng phụ có thể để trống tuyến — xưởng phụ tự khai CĐ chi tiết.
        </p>
        {mau.length === 0 && <p className="text-sm text-slate-500">Chưa có thành phần — thêm ít nhất một (hạng mục một khối: chỉ GỖ).</p>}
        <KhaiThanhPhan ds={mau} onDoi={setMau} tenThanhPhan={d?.thanhPhan ?? []} congDoan={d?.congDoan ?? []} xuong={xuong} />
        <div className="flex flex-wrap items-center gap-2">
          {dsChon.length === 1 && (tp[dsChon[0].hex] ?? []).length > 0 && (
            <button type="button" className={BTN} onClick={() => setMau(tp[dsChon[0].hex])}>Lấy thành phần của {dsChon[0].hex}</button>
          )}
          <button type="button" className={BTN} disabled={!mau.length || !dsChon.length || !!loiTp(mau)}
            onClick={() => setTp(x => ({ ...x, ...Object.fromEntries(dsChon.map(h => [h.hex, mau])) }))}>
            <Check size={14} /> Áp cho {dsChon.length} hạng mục đã chọn
          </button>
          {mau.length > 0 && loiTp(mau) && <span className="text-xs text-amber-700">{loiTp(mau)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <p className="text-sm text-slate-600">
            {sanSang.length} / {dsChon.length} hạng mục sẵn sàng (có số lượng &gt; 0 và thành phần hợp lệ).
            {dsChon.length > sanSang.length && <span className="text-amber-700"> Hạng mục thiếu số lượng hoặc thành phần / tuyến sẽ không được triển khai.</span>}
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
