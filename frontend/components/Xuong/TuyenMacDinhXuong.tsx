import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Trash2, Pencil } from 'lucide-react';
import { xuongSetupApi, type DsTuyenMacDinh, type ThanhPhanTrienKhai } from '../../services/xuongSetupApi';
import { BTN, BTN_CHINH, KHUNG } from './xuongDesktopUi';
import { tenCongDoan } from './ChonTuyen';
import KhaiThanhPhan, { loiThanhPhan } from './KhaiThanhPhan';

// ============================================================================
// TUYẾN MẶC ĐỊNH THEO NHÓM SẢN PHẨM của xưởng: triển khai (nhất là trên điện thoại, nơi không chọn được tuyến) dùng tuyến
// này; nhóm chưa khai thì dùng tuyến lần triển khai gần nhất của cùng nhóm.
// ============================================================================

type Bao = (ok: boolean, msg: string) => void;

export default function TuyenMacDinhXuong({ xuong, bao }: { xuong: string; bao: Bao }) {
  const [d, setD] = useState<DsTuyenMacDinh | null>(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [sua, setSua] = useState<{ nhom: string; ds: ThanhPhanTrienKhai[] } | null>(null);
  const [gui, setGui] = useState(false);

  const tai = useCallback(async () => {
    setDang(true);
    const r = await xuongSetupApi.dsTuyenMacDinh(xuong);
    setDang(false);
    if (r.ok) { setD(r.data); setLoi(''); } else setLoi(r.message);
  }, [xuong]);
  useEffect(() => { setSua(null); tai(); }, [tai]);

  const tenCd = useMemo(() => tenCongDoan(d?.congDoan ?? [], xuong), [d, xuong]);
  const xuongCd = useMemo(() => new Map((d?.congDoan ?? []).map(c => [c.id, c.xuong])), [d]);
  const tomTat = (ds: ThanhPhanTrienKhai[]) => ds.map(t => (
    <div key={t.ten}><b>{t.ten}</b>{t.xuong !== xuong ? ` (${t.xuong})` : ''}: {t.tuyen.length ? t.tuyen.map(tenCd).join(' → ') : <i className="text-slate-500">xưởng {t.xuong} tự khai CĐ chi tiết</i>}</div>
  ));
  const loiSua = sua ? loiThanhPhan(sua.ds, xuong, xuongCd) : null;

  const luu = async () => {
    if (!sua) return;
    setGui(true);
    const r = await xuongSetupApi.luuTuyenMacDinh(xuong, sua.nhom, sua.ds);
    setGui(false);
    bao(r.ok, r.ok ? `Đã lưu tuyến mặc định nhóm ${sua.nhom}` : r.message);
    if (r.ok) { setSua(null); tai(); }
  };
  const bo = async (nhom: string) => {
    setGui(true);
    const r = await xuongSetupApi.boTuyenMacDinh(xuong, nhom);
    setGui(false);
    bao(r.ok, r.ok ? `Đã bỏ tuyến mặc định nhóm ${nhom}` : r.message);
    if (r.ok) { setSua(null); tai(); }
  };

  return (
    <div className={KHUNG}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <p className="text-sm text-slate-600">Triển khai trên điện thoại dùng tuyến mặc định của nhóm sản phẩm; nhóm chưa khai thì dùng tuyến lần triển khai gần nhất của nhóm đó.</p>
        <button type="button" className={`${BTN} ml-auto`} onClick={tai}><RefreshCw size={13} className={dang ? 'animate-spin' : ''} /> Tải lại</button>
      </div>
      {loi && <p className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
      {d && !d.coBang && <p className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Chưa lưu được tuyến mặc định: máy chủ chưa tạo bảng (chạy file SQL 2026-11-04_xuong_tuyen_mac_dinh.sql).</p>}
      {d && d.nhom.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Xưởng {xuong} chưa có nhóm sản phẩm nào trong dữ liệu sản xuất.</p>}
      <ul className="divide-y divide-slate-100">
        {(d?.nhom ?? []).map(n => {
          const dangSua = sua?.nhom === n.nhom;
          const hieuLuc = n.macDinh ?? n.lanTruoc;
          return (
            <li key={n.nhom} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="w-44 shrink-0">
                  <p className="text-sm font-semibold text-slate-900">{n.nhom}</p>
                  <p className="text-xs text-slate-500">{n.soHangMuc.toLocaleString('en-US')} hạng mục</p>
                </div>
                <div className="min-w-0 flex-1 text-xs text-slate-700">
                  {n.macDinh
                    ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">Mặc định</span>
                    : n.lanTruoc
                      ? <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">Theo lần triển khai trước</span>
                      : <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">Chưa có tuyến: điện thoại chưa triển khai được</span>}
                  {hieuLuc && <div className="mt-1 space-y-0.5">{tomTat(hieuLuc)}</div>}
                  {n.macDinh && loiThanhPhan(n.macDinh, xuong, xuongCd) && <p className="mt-1 text-amber-700">Tuyến mặc định đang lỗi ({loiThanhPhan(n.macDinh, xuong, xuongCd)}): cần sửa lại.</p>}
                </div>
                {!dangSua && (
                  <button type="button" className={BTN} disabled={!d?.coBang}
                    onClick={() => setSua({ nhom: n.nhom, ds: hieuLuc ?? [{ ten: d?.thanhPhan[0] ?? 'GỖ', xuong, tuyen: [] }] })}>
                    <Pencil size={13} /> {n.macDinh ? 'Sửa' : 'Khai mặc định'}
                  </button>
                )}
              </div>
              {dangSua && sua && (
                <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                  <KhaiThanhPhan ds={sua.ds} onDoi={ds => setSua({ nhom: n.nhom, ds })} tenThanhPhan={d?.thanhPhan ?? []} congDoan={d?.congDoan ?? []} xuong={xuong} />
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                    {loiSua && <span className="text-xs text-amber-700">{loiSua}</span>}
                    <button type="button" className={`${BTN_CHINH} ml-auto`} disabled={!!loiSua || gui} onClick={luu}><Save size={14} /> Lưu mặc định</button>
                    {n.macDinh && <button type="button" className={BTN} disabled={gui} onClick={() => bo(n.nhom)}><Trash2 size={13} /> Bỏ mặc định</button>}
                    <button type="button" className={BTN} onClick={() => setSua(null)}>Huỷ</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
