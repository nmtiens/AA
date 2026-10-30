import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X } from 'lucide-react';
import { xuongSetupApi, type CongNhanXuong, type ToSetup } from '../../services/xuongSetupApi';
import { BTN, BTN_CHINH } from './xuongDesktopUi';

// ============================================================================
// IN NHÃN QR MÃ NHÂN VIÊN (trạm quét — docs/designs/xuong-tram-quet.md, T6). Thẻ NV công ty chỉ in chữ mã NV
// (vd AF12345), máy quét không đọc được → in nhãn QR chứa đúng mã NV, dán sau thẻ / lên mũ. Trạm đọc QR = mã NV.
// Khổ A4, 4 nhãn / hàng (~45 × 55 mm), cắt theo viền nét đứt.
// ============================================================================

const ID = 'in-the-qr';
const CSS_IN = `@media print {
  body > *:not(#${ID}) { display: none !important; }
  #${ID} { position: static !important; overflow: visible !important; background: #fff !important; }
  #${ID} .khong-in { display: none !important; }
  @page { size: A4; margin: 8mm; }
}`;

export default function InTheQr({ xuong, dsTo, onClose }: { xuong: string; dsTo: ToSetup[]; onClose: () => void }) {
  const [ds, setDs] = useState<CongNhanXuong[] | null>(null);
  const [loi, setLoi] = useState('');
  // Mặc định cả xưởng: tổ đầu danh sách có thể chưa có ai (vd tổ mới tạo) => trông như mất dữ liệu
  const [toId, setToId] = useState<number | 'tat_ca' | 'chua_to'>('tat_ca');
  const [boChon, setBoChon] = useState<Set<string>>(new Set());

  useEffect(() => {
    void xuongSetupApi.dsCongNhan(xuong).then(r => {
      if (r.ok) setDs(r.data.congNhan.filter(c => c.active));
      else setLoi(r.message || 'Không tải được danh sách công nhân');
    });
  }, [xuong]);

  const soTheoTo = useMemo(() => {
    const m = new Map<number | null, number>();
    for (const c of ds ?? []) m.set(c.toId, (m.get(c.toId) ?? 0) + 1);
    return m;
  }, [ds]);
  const theoTo = useMemo(() => (ds ?? []).filter(c => toId === 'tat_ca' || (toId === 'chua_to' ? c.toId === null : c.toId === toId))
    .sort((a, b) => (a.tenTo ?? '').localeCompare(b.tenTo ?? '') || a.mnv.localeCompare(b.mnv)), [ds, toId]);
  const inRa = theoTo.filter(c => !boChon.has(c.mnv));

  return createPortal(
    <div id={ID} className="fixed inset-0 z-[90] overflow-y-auto bg-slate-100">
      <style>{CSS_IN}</style>
      <div className="khong-in sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">In nhãn QR mã NV · xưởng {xuong}</p>
        <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={toId}
          onChange={e => { const v = e.target.value; setToId(v === 'tat_ca' || v === 'chua_to' ? v : Number(v)); setBoChon(new Set()); }}>
          <option value="tat_ca">Cả xưởng{ds ? ` (${ds.length})` : ''}</option>
          {dsTo.map(t => <option key={t.id} value={t.id}>{t.ten}{ds ? ` (${soTheoTo.get(t.id) ?? 0})` : ''}</option>)}
          {(soTheoTo.get(null) ?? 0) > 0 && <option value="chua_to">Chưa gán tổ ({soTheoTo.get(null)})</option>}
        </select>
        <span className="text-sm text-slate-600">{inRa.length} nhãn · chạm nhãn để bỏ / chọn lại</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className={BTN_CHINH} disabled={!inRa.length} onClick={() => window.print()}><Printer size={14} /> In</button>
          <button type="button" className={BTN} onClick={onClose}><X size={14} /> Đóng</button>
        </div>
      </div>
      {loi && <p className="khong-in p-4 text-sm text-red-700">{loi}</p>}
      {ds && !theoTo.length && (
        <p className="khong-in p-4 text-sm text-slate-600">
          {ds.length ? `Tổ này chưa có công nhân nào (cả xưởng có ${ds.length} người${(soTheoTo.get(null) ?? 0) ? `, ${soTheoTo.get(null)} người chưa gán tổ` : ''}). Chọn "Cả xưởng" hoặc gán tổ ở Báo cáo → Công nhân.`
            : 'Xưởng chưa có công nhân trong danh sách (Báo cáo → Công nhân để nạp / thêm).'}
        </p>
      )}
      <div className="mx-auto grid max-w-[190mm] grid-cols-4 gap-0 bg-white p-2 print:p-0">
        {theoTo.map(c => {
          const bo = boChon.has(c.mnv);
          return (
            <button key={c.mnv} type="button" aria-pressed={!bo}
              onClick={() => setBoChon(s => { const n = new Set(s); if (n.has(c.mnv)) n.delete(c.mnv); else n.add(c.mnv); return n; })}
              className={`flex h-[55mm] flex-col items-center justify-center gap-1 border border-dashed border-slate-400 p-2 text-center ${bo ? 'khong-in opacity-25' : ''}`}>
              <QRCodeSVG value={c.mnv} size={110} level="M" marginSize={1} />
              <span className="text-[15px] font-bold tracking-wide text-black">{c.mnv}</span>
              <span className="line-clamp-1 text-[11px] text-black">{c.hoTen}</span>
              {c.tenTo && <span className="line-clamp-1 text-[10px] text-slate-600">{c.tenTo}</span>}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
