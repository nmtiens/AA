import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ChevronRight, AlertTriangle, Users, Play, Pause, Inbox, PackageCheck, Rocket } from 'lucide-react';
import { BottomSheet, Toast } from '../mobileUi';
import TrienKhaiGon from './TrienKhaiGon';
import QuetQr from './QuetQr';
import { xuongSetupApi, type TongQuanTo } from '../../../services/xuongSetupApi';
import { hhmm, tenCo, moTaSuKien, gioVN } from '../../../services/xuongModel';
import { tuanISO, tinhTrang, tuanDaChot } from '../../Xuong/KeHoachTuan';
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

export default function TongQuanXuong({ onChonTo, onMoKeHoach }: {
  onChonTo: (to: { id: number; ten: string; xuong: string }) => void;
  /** Mở Quản lý → Báo cáo → Kế hoạch tuần của xưởng */
  onMoKeHoach?: (xuong: string) => void;
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

  // Kế hoạch tuần này của xưởng: đếm hạng mục cần xử lý (cùng cách tính tab Báo cáo → Kế hoạch tuần)
  const [khTuan, setKhTuan] = useState<{ tuan: number; nhom: Array<[string, number]>; tong: number } | null>(null);
  const xuongDangXem = d?.xuong ?? null;
  useEffect(() => {
    setKhTuan(null);
    if (!xuongDangXem) return;
    const homNay = gioVN(Date.now()).ngay;
    const t = tuanISO(homNay);
    let huy = false;
    xuongSetupApi.keHoachTuan(xuongDangXem, t.nam, t.tuan).then(r => {
      if (huy || !r.ok || !r.data.keHoach.length) return;
      const tt = r.data.keHoach.map(k => tinhTrang(k, tuanDaChot(r.data, homNay), homNay)).filter(z => z.muc >= 2);
      const dem = new Map<string, number>();
      for (const z of tt) dem.set(z.ten, (dem.get(z.ten) ?? 0) + 1);
      setKhTuan({ tuan: t.tuan, nhom: [...dem.entries()].sort((a, b) => b[1] - a[1]), tong: r.data.keHoach.length });
    });
    return () => { huy = true; };
  }, [xuongDangXem]);

  const [moVang, setMoVang] = useState(false);
  // Lọc "cần chú ý": tổ có việc mà chưa điểm danh / chốt quân số, có thao tác cần xem, hoặc hạng mục tạm ngưng
  const [chuY, setChuY] = useState(false);
  const canChuY = (t: TongQuanTo) => (t.quanSo === null && !t.diemDanh?.daDiemDanh && (t.dangChay + t.tamNgung + t.choNhan) > 0)
    || t.canXem > 0 || t.tamNgung > 0;
  const coDd = (d?.to ?? []).filter(t => t.diemDanh?.daDiemDanh);
  const dd = coDd.reduce((a, t) => ({
    coMat: a.coMat + t.diemDanh!.coMat, tong: a.tong + t.diemDanh!.tong,
    vang: a.vang + t.diemDanh!.vang.length, tre: a.tre + t.diemDanh!.tre.length, veSom: a.veSom + t.diemDanh!.veSom.length,
  }), { coMat: 0, tong: 0, vang: 0, tre: 0, veSom: 0 });

  const tong = (d?.to ?? []).reduce((a, t) => ({
    chuaChot: a.chuaChot + (t.quanSo === null && (t.dangChay + t.tamNgung + t.choNhan) > 0 ? 1 : 0),
    dangChay: a.dangChay + t.dangChay, choNhan: a.choNhan + t.choNhan, canXem: a.canXem + t.canXem,
  }), { chuaChot: 0, dangChay: 0, choNhan: 0, canXem: 0 });

  return (
    <div className="min-h-full bg-[#f4f6fa] pb-[calc(env(safe-area-inset-bottom)+6rem)] rmd:pb-8">
      <header className="sticky top-0 z-10 mx-auto max-w-5xl space-y-3 bg-[#f4f6fa]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Tổng quan xưởng</h1>
          <button className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-700 active:bg-slate-100" aria-label="Tải lại" onClick={tai}>
            <RefreshCw size="1.25em" className={dang ? 'animate-spin motion-reduce:animate-none' : ''} />
          </button>
        </div>
        {d && d.dsXuong.length > 1 && (
          // 1 hàng vuốt ngang (trước xuống 2 hàng — phần dính trên cùng cao quá trên điện thoại); máy tính thì xuống hàng
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] rmd:mx-0 rmd:flex-wrap rmd:overflow-visible rmd:px-0" role="tablist" aria-label="Chọn xưởng">
            {d.dsXuong.map(x => (
              <button key={x} role="tab" aria-selected={x === d.xuong} onClick={() => setXuong(x)}
                className={`min-h-12 shrink-0 rounded-2xl px-4 text-base font-medium ${x === d.xuong ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-800'}`}>{x}</button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl space-y-3 px-4">
        {/* Tóm tắt xưởng: cuộn theo trang (không dính) */}
        {d?.xuong && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-base text-slate-700">
            {/* Chỉ đếm tổ có việc mà chưa điểm danh — 0 thì không hiện */}
            {tong.chuaChot > 0 && (
              // Bấm để chỉ xem các tổ cần chú ý
              <button type="button" aria-pressed={chuY} onClick={() => setChuY(v => !v)}
                className={`font-semibold underline underline-offset-4 ${MAU.loi.chu}`}>
                {tong.chuaChot} tổ chưa {d.to.some(t => t.diemDanh !== undefined && t.diemDanh !== null) ? 'điểm danh' : 'chốt quân số'}
              </button>
            )}
            <span>{tong.dangChay} hạng mục đang chạy</span>
            {tong.choNhan > 0 && <span>{tong.choNhan} chờ nhận</span>}
          </p>
        )}
        {/* Chấm công hôm nay: có mặt / vắng / trễ / về sớm của cả xưởng, mở ra xem tên theo tổ */}
        {coDd.length > 0 && (
          <div className={`${KHOI} border border-slate-200`}>
            <button className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-base active:bg-slate-50" aria-expanded={moVang} onClick={() => setMoVang(v => !v)}>
              <span className="font-semibold text-slate-900"><Users size="1em" className="mr-1 inline" aria-hidden />{dd.coMat}{dd.tong ? `/${dd.tong}` : ''} có mặt</span>
              {dd.vang > 0 && <span className={`font-medium ${MAU.loi.chu}`}>{dd.vang} vắng</span>}
              {dd.tre > 0 && <span className={`font-medium ${MAU.ngung.chu}`}>{dd.tre} trễ</span>}
              {dd.veSom > 0 && <span className={`font-medium ${MAU.ngung.chu}`}>{dd.veSom} về sớm</span>}
              {!dd.vang && !dd.tre && !dd.veSom && <span className="text-slate-600">không ai vắng, trễ, về sớm</span>}
              {(d?.to.length ?? 0) > coDd.length && <span className="text-slate-600">· {coDd.length}/{d!.to.length} tổ đã điểm danh</span>}
              <ChevronRight size="1.1em" className={`ml-auto text-slate-500 transition-transform ${moVang ? 'rotate-90' : ''}`} aria-hidden />
            </button>
            {moVang && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {coDd.filter(t => t.diemDanh!.vang.length || t.diemDanh!.tre.length || t.diemDanh!.veSom.length).map(t => (
                  <li key={t.id} className="space-y-1 px-4 py-2.5 text-base">
                    <p className="font-semibold text-slate-900">{t.ten} <span className="font-normal text-slate-600">· {t.diemDanh!.coMat}/{t.diemDanh!.tong} có mặt</span></p>
                    {t.diemDanh!.vang.length > 0 && <p className={MAU.loi.chu}>Vắng: {t.diemDanh!.vang.map(x => x.hoTen).join(', ')}</p>}
                    {t.diemDanh!.tre.length > 0 && <p className={MAU.ngung.chu}>Trễ: {t.diemDanh!.tre.map(x => `${x.hoTen} (${x.phut} phút)`).join(', ')}</p>}
                    {t.diemDanh!.veSom.length > 0 && <p className={MAU.ngung.chu}>Về sớm: {t.diemDanh!.veSom.map(x => `${x.hoTen} (${hhmm(x.luc)})`).join(', ')}</p>}
                  </li>
                ))}
                {!dd.vang && !dd.tre && !dd.veSom && <li className="px-4 py-2.5 text-base text-slate-600">Hôm nay chưa có ai vắng, trễ hay về sớm.</li>}
              </ul>
            )}
          </div>
        )}
        {/* Cảnh báo kế hoạch tuần — bấm để mở chi tiết ở Báo cáo */}
        {khTuan && khTuan.nhom.length > 0 && xuongDangXem && (
          <button type="button" onClick={() => onMoKeHoach?.(xuongDangXem)}
            className={`flex w-full items-start gap-3 rounded-2xl border ${MAU.loi.vien} ${MAU.loi.nen} p-3 text-left active:opacity-80`}>
            <AlertTriangle size="1.2em" className={`mt-0.5 shrink-0 ${MAU.loi.chu}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={`block text-base font-semibold ${MAU.loi.chu}`}>Kế hoạch tuần {khTuan.tuan}: {khTuan.nhom.reduce((a, x) => a + x[1], 0)}/{khTuan.tong} hạng mục cần xử lý</span>
              <span className="block text-base text-slate-800">{khTuan.nhom.map(([ten, n]) => `${n} ${ten.toLowerCase()}`).join(' · ')}</span>
            </span>
            {onMoKeHoach && <ChevronRight size="1.2em" className="mt-0.5 shrink-0 text-slate-500" aria-hidden />}
          </button>
        )}
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
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Lọc tổ">
            {([[false, `Tất cả ${d.to.length} tổ`], [true, `Cần chú ý ${d.to.filter(canChuY).length}`]] as const).map(([k, ten]) => (
              <button key={String(k)} type="button" role="radio" aria-checked={chuY === k} onClick={() => setChuY(k)}
                className={`min-h-11 rounded-full border px-4 text-base ${chuY === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{ten}</button>
            ))}
          </div>
        )}
        {d && chuY && !d.to.some(canChuY) && <p className="py-6 text-center text-base text-slate-600">Không có tổ nào cần chú ý.</p>}
        {d && d.to.length > 0 && (
          <ul className={`${KHOI} ${KE} rmd:grid rmd:grid-cols-2 rmd:gap-px rmd:divide-y-0 rmd:bg-slate-100`}>
            {d.to.filter(t => !chuY || canChuY(t)).map(t => {
              const coViec = t.dangChay + t.tamNgung + t.choNhan > 0;
              return (
                <li key={t.id} className="bg-white">
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50" onClick={() => onChonTo({ id: t.id, ten: t.ten, xuong: d.xuong! })}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-lg font-semibold text-slate-900">{t.ten}</p>
                      <p className={CHU_PHU}>{t.toTruong ?? 'Chưa có tổ trưởng'}{t.thaoTacCuoi ? ` · thao tác cuối ${hhmm(Date.parse(t.thaoTacCuoi))}` : ''}</p>
                      <p className="flex flex-wrap gap-x-3 gap-y-1 text-base">
                        {t.diemDanh?.daDiemDanh
                          ? <span className="inline-flex items-center gap-1 text-slate-700"><Users size="1em" aria-hidden /> {t.diemDanh.coMat}{t.diemDanh.tong ? `/${t.diemDanh.tong}` : ''} có mặt
                              {t.diemDanh.vang.length > 0 && <span className={MAU.loi.chu}> · {t.diemDanh.vang.length} vắng</span>}
                              {t.diemDanh.tre.length > 0 && <span className={MAU.ngung.chu}> · {t.diemDanh.tre.length} trễ</span>}</span>
                          : t.quanSo !== null
                          ? <span className="inline-flex items-center gap-1 text-slate-700"><Users size="1em" aria-hidden /> {t.quanSo} người</span>
                          : coViec && <span className={`inline-flex items-center gap-1 font-medium ${MAU.loi.chu}`}><Users size="1em" aria-hidden /> {t.diemDanh ? 'Chưa điểm danh' : 'Chưa chốt quân số'}</span>}
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
