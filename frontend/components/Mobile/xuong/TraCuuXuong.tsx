import { useState, type FormEvent } from 'react';
import { ScanLine, Search, X } from 'lucide-react';
import XuongHexChiTiet from '../../Xuong/XuongHexChiTiet';
import { trichHex } from '../../../services/xuongModel';
import QuetQr from './QuetQr';
import { NUT_PHU, CHU_PHU, MAU } from './xuongUi';

// ============================================================================
// TRA CỨU HẠNG MỤC — mục "Tra cứu" của app Xưởng: quét / gõ mã HEX → tiến độ qua các tổ, thời gian trong xưởng,
// giờ công, dòng thời gian, ảnh tiến độ, lịch sử MRA (dùng chung XuongHexChiTiet với máy tính).
// ============================================================================

const KHOA_GAN_DAY = 'xuong_tra_cuu_gan_day';
const docGanDay = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(KHOA_GAN_DAY) || '[]'); return Array.isArray(v) ? v.slice(0, 8) : []; } catch { return []; }
};

export default function TraCuuXuong() {
  const [q, setQ] = useState('');
  const [hex, setHex] = useState<string | null>(null);
  const [loi, setLoi] = useState('');
  const [quet, setQuet] = useState(false);
  const [ganDay, setGanDay] = useState<string[]>(docGanDay);

  const mo = (h: string) => {
    setHex(h); setQ(h); setLoi('');
    const ds = [h, ...ganDay.filter(x => x !== h)].slice(0, 8);
    setGanDay(ds);
    try { localStorage.setItem(KHOA_GAN_DAY, JSON.stringify(ds)); } catch { /* bỏ qua */ }
  };
  const tim = (e: FormEvent) => {
    e.preventDefault();
    const h = trichHex(q.trim());
    if (!h) { setLoi('Mã HEX gồm 9 chữ số (vd 250301895).'); return; }
    mo(h);
  };

  return (
    <div className="min-h-full bg-[#f4f6fa] pb-[calc(env(safe-area-inset-bottom)+6rem)] rmd:pb-8">
      <header className="sticky top-0 z-10 mx-auto max-w-5xl space-y-3 bg-[#f4f6fa]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur">
        <h1 className="text-2xl font-semibold text-slate-900">Tra cứu hạng mục</h1>
        <form onSubmit={tim} className="flex gap-2" role="search">
          <div className="relative min-w-0 flex-1">
            <input value={q} onChange={e => setQ(e.target.value)} inputMode="numeric" enterKeyHint="search" autoComplete="off"
              placeholder="Gõ mã HEX" aria-label="Mã HEX"
              className="h-14 w-full rounded-2xl border border-slate-300 bg-white pl-4 pr-11 text-lg tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400" />
            {q && (
              <button type="button" aria-label="Xoá" onClick={() => { setQ(''); setHex(null); setLoi(''); }}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 active:bg-slate-100">
                <X size="1.1em" />
              </button>
            )}
          </div>
          <button type="submit" aria-label="Tìm" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white active:opacity-80">
            <Search size="1.3em" />
          </button>
          <button type="button" aria-label="Quét phiếu" onClick={() => setQuet(true)}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-800 active:bg-slate-100">
            <ScanLine size="1.3em" />
          </button>
        </form>
        {loi && <p className={`rounded-2xl ${MAU.loi.nen} p-3 text-base ${MAU.loi.chu}`} role="alert">{loi}</p>}
      </header>

      <main className="mx-auto max-w-5xl space-y-3 px-4">
        {hex ? (
          <section className="space-y-2 rounded-2xl bg-white p-3 rmd:p-4" aria-label={`Hạng mục ${hex}`}>
            <p className="text-lg font-semibold text-slate-900">Hạng mục <span className="tabular-nums">{hex}</span></p>
            <XuongHexChiTiet key={hex} hex={hex} />
          </section>
        ) : (
          <div className="space-y-3 rounded-2xl bg-white p-5">
            <p className={CHU_PHU}>Quét phiếu hoặc gõ mã HEX để xem hạng mục đang ở tổ nào, đã nhận / xong / giao bao nhiêu, thời gian trong xưởng, giờ công và ảnh tiến độ.</p>
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
