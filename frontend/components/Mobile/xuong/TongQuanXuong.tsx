import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ChevronRight, AlertTriangle, Users, Play, Pause, Inbox, PackageCheck, Rocket } from 'lucide-react';
import { BottomSheet, Toast } from '../mobileUi';
import TrienKhaiGon from './TrienKhaiGon';
import QuetQr from './QuetQr';
import { xuongSetupApi, type TongQuanTo } from '../../../services/xuongSetupApi';
import { hhmm, tenCo, moTaSuKien } from '../../../services/xuongModel';
import { NUT_PHU, CHU_PHU, KHOI, KE, MAU } from './xuongUi';

// ============================================================================
// TỔNG QUAN XƯỞNG — mục "Tổng quan" của app Xưởng (D25), cho admin / quản lý xưởng.
// Chọn xưởng → mỗi tổ: quân số hôm nay, đang chạy, tạm ngưng, chờ nhận, chờ giao, cần xem; bấm tổ → mở màn tổ trưởng
// của tổ đó (xem / thao tác hộ — server gắn cờ "quản lý ghi hộ"). Cấu hình vẫn ở máy tính (Setup → Xưởng).
// ============================================================================

const KHOA_XUONG = 'xuong_tong_quan_xuong';

function CanXemSheet({ xuong, onClose }: { xuong: string; onClose: () => void }) {
  const [ds, setDs] = useState<Array<Record<string, unknown>> | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState<string | null>(null);
  const tai = useCallback(() => {
    xuongSetupApi.canXem(xuong).then(r => (r.ok ? setDs(r.data.suKien) : setLoi(r.message)));
  }, [xuong]);
  useEffect(() => { tai(); }, [tai]);
  return (
    <BottomSheet title={`Cần xem — xưởng ${xuong}`} onClose={onClose}>
      <div className="space-y-3 pb-2">
        {loi && <p className={`rounded-2xl ${MAU.loi.nen} p-3 text-base ${MAU.loi.chu}`} role="alert">{loi}</p>}
        {!ds && !loi && <p className={CHU_PHU}>Đang tải…</p>}
        {ds && ds.length === 0 && <p className="py-6 text-center text-base text-slate-600">Không có thao tác nào cần xem trong 30 ngày.</p>}
        {ds && ds.length > 0 && (
          <ul className={`${KHOI} ${KE} border border-slate-200`}>
            {ds.slice(0, 100).map(x => (
              <li key={String(x.id)} className="space-y-2 px-4 py-3">
                <p className="text-base text-slate-900">
                  <span className="tabular-nums">{hhmm(Date.parse(String(x.device_ts_hieu_chinh)))}</span> · {moTaSuKien({ loai: String(x.loai) })}
                  {x.hex ? <span className="tabular-nums"> · {String(x.hex)}</span> : null}
                </p>
                <p className={`text-base ${MAU.ngung.chu}`}>{((x.co as string[]) ?? []).map(tenCo).join(' · ')}</p>
                <button className={NUT_PHU} disabled={dang === x.id} onClick={async () => {
                  if (!window.confirm('Huỷ thao tác này?')) return;
                  setDang(String(x.id));
                  const r = await xuongSetupApi.huy(String(x.id));
                  setDang(null);
                  if (r.ok) tai(); else setLoi(r.message);
                }}>Huỷ thao tác</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

export default function TongQuanXuong({ onChonTo }: {
  onChonTo: (to: { id: number; ten: string; xuong: string }) => void;
}) {
  const [xuong, setXuong] = useState<string | undefined>(() => { try { return localStorage.getItem(KHOA_XUONG) || undefined; } catch { return undefined; } });
  const [d, setD] = useState<{ dsXuong: string[]; xuong: string | null; to: TongQuanTo[] } | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const [canXem, setCanXem] = useState(false);
  // Triển khai gọn: hex = null khi gõ mã; quet = đang mở camera
  const [trienKhai, setTrienKhai] = useState<{ hex: string | null } | null>(null);
  const [quet, setQuet] = useState(false);
  const [toast, setToast] = useState('');

  const tai = useCallback(async () => {
    setDang(true);
    const r = await xuongSetupApi.tongQuan(xuong);
    setDang(false);
    if (!r.ok) { setLoi(r.status === 0 ? 'Đang mất sóng — tổng quan cần có sóng.' : r.message); return; }
    setLoi(''); setD(r.data);
    if (r.data.xuong && r.data.xuong !== xuong) setXuong(r.data.xuong);
  }, [xuong]);
  useEffect(() => { tai(); }, [tai]);
  useEffect(() => { if (xuong) try { localStorage.setItem(KHOA_XUONG, xuong); } catch { /* bỏ qua */ } }, [xuong]);

  const tong = (d?.to ?? []).reduce((a, t) => ({
    chuaChot: a.chuaChot + (t.quanSo === null && (t.dangChay + t.tamNgung + t.choNhan) > 0 ? 1 : 0),
    dangChay: a.dangChay + t.dangChay, choNhan: a.choNhan + t.choNhan, canXem: a.canXem + t.canXem,
  }), { chuaChot: 0, dangChay: 0, choNhan: 0, canXem: 0 });

  return (
    <div className="min-h-full bg-[#f4f6fa] pb-[calc(env(safe-area-inset-bottom)+6rem)] md:pb-8">
      <header className="sticky top-0 z-10 mx-auto max-w-5xl space-y-3 bg-[#f4f6fa]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Tổng quan xưởng</h1>
          <button className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-700 active:bg-slate-100" aria-label="Tải lại" onClick={tai}>
            <RefreshCw size="1.25em" className={dang ? 'animate-spin motion-reduce:animate-none' : ''} />
          </button>
        </div>
        {d && d.dsXuong.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chọn xưởng">
            {d.dsXuong.map(x => (
              <button key={x} role="tab" aria-selected={x === d.xuong} onClick={() => setXuong(x)}
                className={`min-h-12 rounded-2xl px-4 text-base font-medium ${x === d.xuong ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-800'}`}>{x}</button>
            ))}
          </div>
        )}
        {d?.xuong && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-base text-slate-700">
            <span className={tong.chuaChot ? `font-semibold ${MAU.loi.chu}` : ''}>{tong.chuaChot} tổ chưa chốt quân số</span>
            <span>{tong.dangChay} hạng mục đang chạy</span>
            <span>{tong.choNhan} chờ nhận</span>
          </p>
        )}
      </header>

      <main className="mx-auto max-w-5xl space-y-3 px-4">
        {loi && <p className={`rounded-2xl ${MAU.loi.nen} p-3 text-base ${MAU.loi.chu}`} role="alert">{loi}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button className={NUT_PHU} onClick={() => setTrienKhai({ hex: null })}><Rocket size="1.25em" aria-hidden /> Triển khai</button>
          <button className={NUT_PHU} disabled={!d?.xuong} onClick={() => setCanXem(true)}>
            <AlertTriangle size="1.25em" aria-hidden /> Cần xem{tong.canXem ? ` (${tong.canXem})` : ''}
          </button>
        </div>
        {!d && !loi && <p className={`py-6 text-center ${CHU_PHU}`}>Đang tải…</p>}
        {d && d.to.length === 0 &&<p className="py-6 text-center text-base text-slate-600">Xưởng chưa có tổ đang hoạt động.</p>}
        {d && d.to.length > 0 && (
          <ul className={`${KHOI} ${KE} md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-slate-100`}>
            {d.to.map(t => {
              const coViec = t.dangChay + t.tamNgung + t.choNhan > 0;
              return (
                <li key={t.id} className="bg-white">
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50" onClick={() => onChonTo({ id: t.id, ten: t.ten, xuong: d.xuong! })}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-lg font-semibold text-slate-900">{t.ten}</p>
                      <p className={CHU_PHU}>{t.toTruong ?? 'Chưa có tổ trưởng'}{t.thaoTacCuoi ? ` · thao tác cuối ${hhmm(Date.parse(t.thaoTacCuoi))}` : ''}</p>
                      <p className="flex flex-wrap gap-x-3 gap-y-1 text-base">
                        {t.quanSo !== null
                          ? <span className="inline-flex items-center gap-1 text-slate-700"><Users size="1em" aria-hidden /> {t.quanSo} người</span>
                          : coViec && <span className={`inline-flex items-center gap-1 font-medium ${MAU.loi.chu}`}><Users size="1em" aria-hidden /> Chưa chốt quân số</span>}
                        {t.dangChay > 0 && <span className={`inline-flex items-center gap-1 ${MAU.chay.chu}`}><Play size="1em" aria-hidden /> {t.dangChay} đang chạy</span>}
                        {t.tamNgung > 0 && <span className={`inline-flex items-center gap-1 ${MAU.ngung.chu}`}><Pause size="1em" aria-hidden /> {t.tamNgung} tạm ngưng</span>}
                        {t.choNhan > 0 && <span className="inline-flex items-center gap-1 text-slate-700"><Inbox size="1em" aria-hidden /> {t.choNhan} chờ nhận</span>}
                        {t.choGiao > 0 && <span className="inline-flex items-center gap-1 text-slate-700"><PackageCheck size="1em" aria-hidden /> {t.choGiao} chờ giao</span>}
                        {t.canXem > 0 && <span className={`inline-flex items-center gap-1 font-medium ${MAU.loi.chu}`}><AlertTriangle size="1em" aria-hidden /> {t.canXem} cần xem</span>}
                        {!coViec && t.choGiao === 0 && <span className="text-slate-600">Chưa có việc</span>}
                      </p>
                    </div>
                    <ChevronRight size="1.25em" className="shrink-0 text-slate-500" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {canXem && d?.xuong && <CanXemSheet xuong={d.xuong} onClose={() => { setCanXem(false); tai(); }} />}
      {trienKhai && !quet && (
        <TrienKhaiGon hexBanDau={trienKhai.hex} xuongBanDau={d?.xuong ?? null}
          onQuet={() => setQuet(true)}
          onXong={m => { setTrienKhai(null); setToast(m); setTimeout(() => setToast(''), 3000); tai(); }}
          onClose={() => setTrienKhai(null)} />
      )}
      {trienKhai && quet && (
        <QuetQr onHex={h => { setQuet(false); setTrienKhai({ hex: h }); }}
          onGoMa={() => setQuet(false)} onClose={() => setQuet(false)} />
      )}
      <Toast text={toast} />
    </div>
  );
}
