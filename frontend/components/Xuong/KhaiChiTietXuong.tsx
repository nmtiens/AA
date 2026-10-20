import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Check, Send } from 'lucide-react';
import { xuongSetupApi, type ChoKhaiChiTiet, type CongDoanTk } from '../../services/xuongSetupApi';
import { BTN, BTN_CHINH, KHUNG, TH, TD } from './xuongDesktopUi';
import ChonTuyen, { tenCongDoan } from './ChonTuyen';

// ============================================================================
// QT2 — XƯỞNG PHỤ KHAI CĐ CHI TIẾT: thành phần (Gỗ / Sofa / Kim loại / Kính / Đá) mà xưởng chính giao cho xưởng này lúc
// triển khai (để trống tuyến). Chọn tuyến công đoạn chi tiết (đầu tuyến thuộc xưởng này; có thể kết thúc ở công đoạn
// hợp nhánh của xưởng chính, vd Fitting) => tổ đầu tuyến thấy "Chờ nhận".
// ============================================================================

type Bao = (ok: boolean, msg: string) => void;
const khoa = (c: ChoKhaiChiTiet) => `${c.trienKhaiId}|${c.thanhPhan}`;

export default function KhaiChiTietXuong({ xuong, bao }: { xuong: string; bao: Bao }) {
  const [cho, setCho] = useState<ChoKhaiChiTiet[] | null>(null);
  const [congDoan, setCongDoan] = useState<CongDoanTk[]>([]);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [tuyen, setTuyen] = useState<Record<string, string[]>>({});
  const [mau, setMau] = useState<string[]>([]);
  const [gui, setGui] = useState(false);

  const tai = useCallback(async () => {
    setDang(true);
    const r = await xuongSetupApi.dsKhaiChiTiet(xuong);
    setDang(false);
    if (!r.ok) { setLoi(r.message); return; }
    setLoi(''); setCho(r.data.cho); setCongDoan(r.data.congDoan); setChon(new Set()); setTuyen({});
  }, [xuong]);
  useEffect(() => { tai(); }, [tai]);

  const tenCd = useMemo(() => tenCongDoan(congDoan, xuong), [congDoan, xuong]);
  const xuongCd = useMemo(() => new Map(congDoan.map(c => [c.id, c.xuong])), [congDoan]);
  const hopLe = (t: string[] | undefined) => !!t && t.length > 0 && xuongCd.get(t[0]) === xuong;
  const ds = cho ?? [];
  const dsChon = ds.filter(c => chon.has(khoa(c)));
  const sanSang = ds.filter(c => hopLe(tuyen[khoa(c)]));
  const tatCa = ds.length > 0 && ds.every(c => chon.has(khoa(c)));

  const khai = async () => {
    setGui(true);
    const r = await xuongSetupApi.khaiChiTiet(xuong, sanSang.map(c => ({ trienKhaiId: c.trienKhaiId, thanhPhan: c.thanhPhan, tuyen: tuyen[khoa(c)] })));
    setGui(false);
    if (r.ok) { bao(true, `Đã khai CĐ chi tiết ${r.data.soThanhPhan} thành phần — tổ đầu tuyến đã thấy "Chờ nhận"`); tai(); }
    else bao(false, r.message);
  };

  return (
    <div className="space-y-4">
      <div className={KHUNG}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">Thành phần xưởng chính giao cho xưởng {xuong} — chờ khai CĐ chi tiết</p>
          <button type="button" className={`${BTN} ml-auto`} onClick={tai}><RefreshCw size={13} className={dang ? 'animate-spin' : ''} /> Tải lại</button>
        </div>
        {loi && <p className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full min-w-[36rem] rmd:min-w-0">
            <thead className="sticky top-0 z-[1] bg-slate-50"><tr>
              <th className={`${TH} w-8`}><input type="checkbox" aria-label="Chọn tất cả" checked={tatCa}
                onChange={() => setChon(tatCa ? new Set() : new Set(ds.map(khoa)))} /></th>
              <th className={TH}>Hex</th><th className={TH}>Hạng mục · công trình</th><th className={TH}>Thành phần</th>
              <th className={`${TH} text-right`}>Số bộ</th><th className={TH}>Xưởng chính · lúc triển khai</th><th className={TH}>Tuyến CĐ chi tiết</th>
            </tr></thead>
            <tbody>
              {ds.map(c => {
                const k = khoa(c);
                const t = tuyen[k] ?? [];
                return (
                  <tr key={k} className={`border-t border-slate-100 ${chon.has(k) ? 'bg-wood-50' : ''}`}>
                    <td className={TD}><input type="checkbox" aria-label={`Chọn ${c.hex} ${c.thanhPhan}`} checked={chon.has(k)}
                      onChange={() => setChon(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })} /></td>
                    <td className={`${TD} font-medium tabular-nums text-slate-800`}>{c.hex}</td>
                    <td className={TD}><span className="text-slate-800">{c.ten}</span><br /><span className="text-xs text-slate-500">{c.tenCongTrinh}</span></td>
                    <td className={`${TD} font-semibold`}>{c.thanhPhan}</td>
                    <td className={`${TD} text-right tabular-nums`}>{c.soLuong} {c.dvt ?? ''}</td>
                    <td className={`${TD} text-xs`}>{c.xuongChinh} · {c.luc.split(' ')[0].split('-').reverse().join('/')} {c.luc.split(' ')[1]}</td>
                    <td className={`${TD} text-xs`}>{t.length ? t.map(tenCd).join(' → ') : <span className="text-amber-700">Chưa khai — chọn ở dưới</span>}</td>
                  </tr>
                );
              })}
              {cho && ds.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-sm text-slate-500">Không có thành phần nào đang chờ xưởng {xuong} khai.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${KHUNG} space-y-3 p-4`}>
        <p className="text-sm font-semibold text-slate-800">Tuyến công đoạn chi tiết ({dsChon.length} thành phần đã chọn)</p>
        <ChonTuyen tuyen={mau} onDoi={setMau} congDoan={congDoan} xuong={xuong} xuongGoc={xuong} />
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <button type="button" className={BTN} disabled={!hopLe(mau) || !dsChon.length}
            onClick={() => setTuyen(t => ({ ...t, ...Object.fromEntries(dsChon.map(c => [khoa(c), mau])) }))}>
            <Check size={14} /> Áp tuyến cho {dsChon.length} thành phần đã chọn
          </button>
          <p className="text-sm text-slate-600">{sanSang.length} thành phần sẵn sàng.</p>
          <button type="button" className={`${BTN_CHINH} ml-auto`} disabled={!sanSang.length || gui} onClick={khai}>
            <Send size={14} /> Khai CĐ chi tiết {sanSang.length} thành phần
          </button>
        </div>
      </div>
    </div>
  );
}
