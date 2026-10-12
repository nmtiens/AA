import { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { BottomSheet } from '../mobileUi';
import { xuongSetupApi, type DanhSachTrienKhai } from '../../../services/xuongSetupApi';
import { BoDem } from './XuongSheets';
import { NUT_CHINH, NUT_PHU, CHU_PHU, MAU } from './xuongUi';

// ============================================================================
// TRIỂN KHAI GỌN TRÊN ĐIỆN THOẠI (quyết định 7A): quét / gõ mã → xác nhận tuyến gợi ý + số lượng.
// Không sửa tuyến chi tiết ở đây (làm trên máy tính: Setup dữ liệu → Xưởng → Triển khai hạng mục). Cần có sóng.
// ============================================================================

export default function TrienKhaiGon({ hexBanDau, xuongBanDau, onQuet, onXong, onClose }: {
  hexBanDau: string | null; xuongBanDau: string | null;
  onQuet: () => void; onXong: (msg: string) => void; onClose: () => void;
}) {
  const [dsXuong, setDsXuong] = useState<string[]>(xuongBanDau ? [xuongBanDau] : []);
  const [xuong, setXuong] = useState<string | null>(xuongBanDau);
  const [hex, setHex] = useState(hexBanDau ?? '');
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
          <input inputMode="numeric" pattern="[0-9]*" maxLength={9} value={hex} aria-label="Mã hạng mục 9 số" placeholder="Mã hạng mục 9 số"
            onChange={e => setHex(e.target.value.replace(/\D/g, '').slice(0, 9))}
            className="h-16 min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 text-2xl tabular-nums text-slate-900 outline-none focus:border-slate-500" />
          <button className={`${NUT_PHU} shrink-0`} onClick={onQuet} aria-label="Quét phiếu"><ScanLine size="1.25em" /></button>
        </div>
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
