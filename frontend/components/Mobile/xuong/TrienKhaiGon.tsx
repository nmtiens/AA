import { useEffect, useRef, useState } from 'react';
import { ScanLine, Loader2 } from 'lucide-react';
import { BottomSheet } from '../mobileUi';
import { xuongSetupApi, type DanhSachTrienKhai } from '../../../services/xuongSetupApi';
import { BoDem } from './XuongSheets';
import { NUT_CHINH, NUT_PHU, CHU_PHU, MAU } from './xuongUi';

// ============================================================================
// TRIỂN KHAI GỌN TRÊN ĐIỆN THOẠI (quyết định 7A): quét / gõ mã → xác nhận tuyến gợi ý + số lượng.
// Gõ vài số của mã (≥ 3) hoặc tên hạng mục / công trình (≥ 2 chữ) → danh sách hạng mục của xưởng để chọn.
// Không sửa tuyến chi tiết ở đây (làm trên máy tính: Setup dữ liệu → Xưởng → Triển khai hạng mục). Cần có sóng.
// ============================================================================

export default function TrienKhaiGon({ hexBanDau, xuongBanDau, onQuet, onXong, onClose }: {
  hexBanDau: string | null; xuongBanDau: string | null;
  onQuet: () => void; onXong: (msg: string) => void; onClose: () => void;
}) {
  const [dsXuong, setDsXuong] = useState<string[]>(xuongBanDau ? [xuongBanDau] : []);
  const [xuong, setXuong] = useState<string | null>(xuongBanDau);
  const [q, setQ] = useState(hexBanDau ?? '');
  const hex = /^\d{9}$/.test(q.trim()) ? q.trim() : '';
  const [banPhimChu, setBanPhimChu] = useState(false);
  const [goiY, setGoiY] = useState<DanhSachTrienKhai['hangMuc'] | null>(null);
  const [dangTim, setDangTim] = useState(false);
  const lan = useRef(0);
  const oNhap = useRef<HTMLInputElement>(null);
  const [d, setD] = useState<DanhSachTrienKhai | null>(null);
  const [loi, setLoi] = useState('');
  const [sl, setSl] = useState(1);
  const [gui, setGui] = useState(false);

  useEffect(() => {
    xuongSetupApi.setup().then(r => {
      if (!r.ok) { setLoi(r.status === 0 ? 'Cần có sóng để triển khai.' : r.message); return; }
      setDsXuong(r.data.dsXuong);
      setXuong(x => (x && r.data.dsXuong.includes(x) ? x : r.data.dsXuong[0] ?? null));
    });
  }, []);

  useEffect(() => {
    setD(null);
    if (!xuong || !/^\d{9}$/.test(hex)) return;
    xuongSetupApi.dsTrienKhai(xuong, { hex }).then(r => {
      if (!r.ok) { setLoi(r.message); return; }
      setLoi(''); setD(r.data);
      const h = r.data.hangMuc[0];
      if (h) setSl(Math.max(1, h.soLuongDonHang === null ? 1 : h.soLuongDonHang - h.daTrienKhai));
    });
  }, [xuong, hex]);

  // Gợi ý khi chưa đủ mã 9 số (chờ 300 ms sau phím cuối)
  useEffect(() => {
    const t = q.trim();
    const du = /\p{L}/u.test(t) ? t.length >= 2 : t.replace(/\D/g, '').length >= 3;
    if (!xuong || hex || !du) { setGoiY(null); setDangTim(false); return; }
    const id = ++lan.current;
    setDangTim(true);
    const hen = setTimeout(async () => {
      const r = await xuongSetupApi.dsTrienKhai(xuong, { q: t });
      if (id !== lan.current) return;
      setDangTim(false);
      if (r.ok) { setGoiY(r.data.hangMuc.slice(0, 12)); setLoi(''); }
      else setLoi(r.status === 0 ? 'Cần có sóng để triển khai.' : r.message);
    }, 300);
    return () => clearTimeout(hen);
  }, [q, hex, xuong]);
  const doiBanPhim = () => {
    setBanPhimChu(v => !v);
    setTimeout(() => { oNhap.current?.blur(); oNhap.current?.focus(); }, 0);
  };

  const h = d?.hangMuc[0];
  const tenCd = (id: string) => d?.congDoan.find(c => c.id === id)?.ten ?? id;
  const tuyen = h?.goiYTuyen ?? [];
  const trienKhai = async () => {
    if (!xuong || !h) return;
    setGui(true);
    const r = await xuongSetupApi.trienKhai(xuong, [{ hex: h.hex, soLuong: sl, tuyen }]);
    setGui(false);
    if (r.ok) onXong(`Đã triển khai ${sl} cái ${h.hex} — ${tenCd(tuyen[0])} thấy "Chờ nhận"`);
    else setLoi(r.message);
  };

  return (
    <BottomSheet title="Triển khai hạng mục" onClose={onClose}
      footer={<button className={NUT_CHINH} disabled={!h || !tuyen.length || gui} onClick={trienKhai}>Triển khai {sl} cái</button>}>
      <div className="space-y-4 pb-2">
        {dsXuong.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {dsXuong.map(x => (
              <button key={x} onClick={() => setXuong(x)}
                className={`min-h-14 rounded-2xl px-4 text-base font-medium ${xuong === x ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-800'}`}>
                Xưởng {x}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <div className="relative min-w-0 flex-1">
            <input ref={oNhap} inputMode={banPhimChu ? 'text' : 'numeric'} value={q} autoComplete="off"
              aria-label="Mã hạng mục hoặc tên" placeholder={banPhimChu ? 'Tên hạng mục / công trình' : 'Mã hạng mục (gõ vài số)'}
              onChange={e => setQ(banPhimChu ? e.target.value.slice(0, 80) : e.target.value.replace(/\D/g, '').slice(0, 9))}
              className="h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 pr-12 text-2xl tabular-nums text-slate-900 outline-none focus:border-slate-500" />
            {dangTim && <Loader2 size="1.2em" className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-slate-400 motion-reduce:animate-none" aria-hidden />}
          </div>
          <button className={`${NUT_PHU} shrink-0`} onClick={onQuet} aria-label="Quét phiếu"><ScanLine size="1.25em" /></button>
        </div>
        <button type="button" onClick={doiBanPhim} className="text-base font-medium text-slate-600 underline underline-offset-4">
          {banPhimChu ? 'Gõ mã số' : 'Tìm theo tên hạng mục / công trình'}
        </button>
        {goiY && !hex && (
          goiY.length === 0
            ? <p className={`rounded-2xl ${MAU.ngung.nen} p-3 text-base ${MAU.ngung.chu}`}>Không thấy hạng mục khớp “{q.trim()}” có xưởng chính {xuong}.</p>
            : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Hạng mục khớp">
                {goiY.map(g => (
                  <li key={g.hex}>
                    <button type="button" onClick={() => { setQ(g.hex); setBanPhimChu(false); }} className="w-full px-4 py-3 text-left active:bg-slate-50">
                      <p className="text-lg font-semibold tabular-nums text-slate-900">{g.hex}</p>
                      {g.ten && <p className="text-base text-slate-700">{g.ten}</p>}
                      <p className={CHU_PHU}>
                        {g.tenCongTrinh ?? ''}{g.tenCongTrinh ? ' · ' : ''}đã triển khai {g.daTrienKhai}{g.soLuongDonHang !== null ? ` / ${g.soLuongDonHang}` : ''} {g.dvt ?? ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )
        )}
        {loi && <p className={`rounded-2xl ${MAU.loi.nen} p-3 text-base ${MAU.loi.chu}`} role="alert">{loi}</p>}
        {d && !h && <p className={`rounded-2xl ${MAU.ngung.nen} p-3 text-base ${MAU.ngung.chu}`}>Không thấy hạng mục {hex} có xưởng chính {xuong}.</p>}
        {h && (
          <div className="space-y-3">
            <div>
              <p className="text-base font-semibold text-slate-900">{h.ten}</p>
              <p className={CHU_PHU}>{h.tenCongTrinh}</p>
              <p className="text-base tabular-nums text-slate-700">Đơn hàng {h.soLuongDonHang ?? '—'} {h.dvt ?? ''} · đã triển khai {h.daTrienKhai}</p>
            </div>
            <div className="space-y-2">
              <p className="text-base font-medium text-slate-800">Số lượng triển khai</p>
              <BoDem value={sl} onChange={setSl} min={1} nhan="số lượng triển khai" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium text-slate-800">Tuyến (gợi ý theo nhóm sản phẩm {h.nhom ?? '—'})</p>
              {tuyen.length
                ? <p className="text-base text-slate-800">{tuyen.map(tenCd).join(' → ')}</p>
                : <p className={`text-base ${MAU.ngung.chu}`}>Chưa có tuyến gợi ý cho nhóm này — triển khai trên máy tính (Setup dữ liệu → Xưởng) để chọn tuyến.</p>}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
