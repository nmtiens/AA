import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ScanLine, Search, X, Loader2 } from 'lucide-react';
import XuongHexChiTiet from '../../Xuong/XuongHexChiTiet';
import { trichHex } from '../../../services/xuongModel';
import { xuongApi, type GoiYHex } from '../../../services/xuongApi';
import QuetQr from './QuetQr';
import { NUT_PHU, CHU_PHU, MAU } from './xuongUi';

// ============================================================================
// TRA CỨU HẠNG MỤC — mục "Tra cứu" của app Xưởng: quét / gõ mã HEX → tiến độ qua các tổ, thời gian trong xưởng,
// giờ công, dòng thời gian, ảnh tiến độ, lịch sử MRA (dùng chung XuongHexChiTiet với máy tính).
// Gõ một phần mã (≥ 3 số) hoặc tên hạng mục / công trình (≥ 2 chữ) → gợi ý ngay bên dưới (GET /api/xuong/tim-hex).
// ============================================================================

const KHOA_GAN_DAY = 'xuong_tra_cuu_gan_day';
const docGanDay = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(KHOA_GAN_DAY) || '[]'); return Array.isArray(v) ? v.slice(0, 8) : []; } catch { return []; }
};
const duDeTim = (q: string) => (/\p{L}/u.test(q) ? q.trim().length >= 2 : q.replace(/\D/g, '').length >= 3);

export default function TraCuuXuong() {
  const [q, setQ] = useState('');
  const [hex, setHex] = useState<string | null>(null);
  const [loi, setLoi] = useState('');
  const [quet, setQuet] = useState(false);
  const [ganDay, setGanDay] = useState<string[]>(docGanDay);
  const [banPhimChu, setBanPhimChu] = useState(false);
  const [goiY, setGoiY] = useState<GoiYHex[] | null>(null);
  const [dangTim, setDangTim] = useState(false);
  const lan = useRef(0);
  const oNhap = useRef<HTMLInputElement>(null);

  const mo = (h: string) => {
    setHex(h); setQ(h); setLoi(''); setGoiY(null);
    const ds = [h, ...ganDay.filter(x => x !== h)].slice(0, 8);
    setGanDay(ds);
    try { localStorage.setItem(KHOA_GAN_DAY, JSON.stringify(ds)); } catch { /* bỏ qua */ }
  };

  // Gợi ý khi gõ (chờ 300 ms sau phím cuối); đang xem đúng mã vừa chọn thì không tìm lại
  useEffect(() => {
    const t = q.trim();
    if (t === hex || !duDeTim(t)) { setGoiY(null); setDangTim(false); return; }
    const id = ++lan.current;
    setDangTim(true);
    const hen = setTimeout(async () => {
      const r = await xuongApi.timHex(t, 0);
      if (id !== lan.current) return;
      setDangTim(false);
      if (r.ok && r.data) { setGoiY(r.data.ketQua ?? []); setLoi(''); }
      else setLoi(r.status === 0 ? 'Đang mất sóng — tra cứu cần có sóng.' : (r.message || 'Không tìm được'));
    }, 300);
    return () => clearTimeout(hen);
  }, [q, hex]);

  const tim = (e: FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    const h = trichHex(t);
    if (h) { mo(h); return; }
    if (goiY?.length === 1) { mo(goiY[0].hex); return; }
    if (goiY && goiY.length > 1) { setLoi('Chọn một hạng mục trong danh sách bên dưới.'); return; }
    setLoi(duDeTim(t) ? 'Không thấy hạng mục khớp.' : 'Gõ ít nhất 3 số của mã HEX, hoặc 2 chữ của tên hạng mục / công trình.');
  };

  const doiBanPhim = () => {
    setBanPhimChu(v => !v);
    // Bàn phím điện thoại chỉ đổi khi ô nhập lấy lại tiêu điểm
    setTimeout(() => { oNhap.current?.blur(); oNhap.current?.focus(); }, 0);
  };

  return (
    <div className="min-h-full bg-[#f4f6fa] pb-[calc(env(safe-area-inset-bottom)+6rem)] rmd:pb-8">
      <header className="sticky top-0 z-10 mx-auto max-w-5xl space-y-3 bg-[#f4f6fa]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur">
        <h1 className="text-2xl font-semibold text-slate-900">Tra cứu hạng mục</h1>
        <form onSubmit={tim} className="flex gap-2" role="search">
          <div className="relative min-w-0 flex-1">
            <input ref={oNhap} value={q} onChange={e => { setQ(e.target.value); setLoi(''); if (hex && e.target.value.trim() !== hex) setHex(null); }}
              inputMode={banPhimChu ? 'text' : 'numeric'} enterKeyHint="search" autoComplete="off"
              placeholder={banPhimChu ? 'Tên hạng mục / công trình' : 'Mã HEX (gõ vài số)'} aria-label="Mã HEX hoặc tên hạng mục"
              className="h-14 w-full rounded-2xl border border-slate-300 bg-white pl-4 pr-11 text-lg tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400" />
            {q && (
              <button type="button" aria-label="Xoá" onClick={() => { setQ(''); setHex(null); setLoi(''); setGoiY(null); }}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 active:bg-slate-100">
                <X size="1.1em" />
              </button>
            )}
          </div>
          <button type="submit" aria-label="Tìm" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white active:opacity-80">
            {dangTim ? <Loader2 size="1.3em" className="animate-spin motion-reduce:animate-none" /> : <Search size="1.3em" />}
          </button>
          <button type="button" aria-label="Quét phiếu" onClick={() => setQuet(true)}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-800 active:bg-slate-100">
            <ScanLine size="1.3em" />
          </button>
        </form>
        <button type="button" onClick={doiBanPhim} className="text-base font-medium text-slate-600 underline underline-offset-4">
          {banPhimChu ? 'Gõ mã số' : 'Tìm theo tên hạng mục / công trình'}
        </button>
        {loi && <p className={`rounded-2xl ${MAU.loi.nen} p-3 text-base ${MAU.loi.chu}`} role="alert">{loi}</p>}
      </header>

      <main className="mx-auto max-w-5xl space-y-3 px-4">
        {goiY !== null && !hex ? (
          <section className="overflow-hidden rounded-2xl bg-white" aria-label="Kết quả tìm" aria-live="polite">
            {goiY.length === 0
              ? <p className="p-4 text-base text-slate-600">Không thấy hạng mục khớp “{q.trim()}”.</p>
              : (
                <ul className="divide-y divide-slate-100">
                  {goiY.map(g => (
                    <li key={g.hex}>
                      <button type="button" onClick={() => mo(g.hex)} className="w-full px-4 py-3 text-left active:bg-slate-50">
                        <p className="text-lg font-semibold tabular-nums text-slate-900">{g.hex}</p>
                        {g.tenHangMuc && <p className="text-base text-slate-700">{g.tenHangMuc}</p>}
                        {g.tenCongTrinh && <p className={CHU_PHU}>{g.tenCongTrinh}</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        ) : hex ? (
          <section className="space-y-2 rounded-2xl bg-white p-3 rmd:p-4" aria-label={`Hạng mục ${hex}`}>
            <p className="text-lg font-semibold text-slate-900">Hạng mục <span className="tabular-nums">{hex}</span></p>
            <XuongHexChiTiet key={hex} hex={hex} />
          </section>
        ) : (
          <div className="space-y-3 rounded-2xl bg-white p-5">
            <p className={CHU_PHU}>
              Quét phiếu, gõ vài số của mã HEX hoặc tìm theo tên hạng mục / công trình để xem hạng mục đang ở tổ nào, đã nhận / xong / giao bao nhiêu,
              thời gian trong xưởng, giờ công sản phẩm và ảnh tiến độ.
            </p>
            {ganDay.length > 0 && (
              <div className="space-y-2">
                <p className="text-base font-semibold text-slate-800">Tra gần đây</p>
                <div className="flex flex-wrap gap-2">
                  {ganDay.map(h => <button key={h} className={`${NUT_PHU} tabular-nums`} onClick={() => mo(h)}>{h}</button>)}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      {quet && <QuetQr onHex={h => { setQuet(false); mo(h); }} onGoMa={() => setQuet(false)} onClose={() => setQuet(false)} />}
    </div>
  );
}
