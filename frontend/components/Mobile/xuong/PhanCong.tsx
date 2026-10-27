import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { BottomSheet } from '../mobileUi';
import { authXuong } from '../../../services/xuongClock';
import { tramQuanLyApi, type PhanCongData } from '../../../services/xuongTramApi';
import type { SuKienNhap } from '../../../services/xuongQueue';
import { NUT_CHINH, NUT_PHU, MAU } from './xuongUi';

// ============================================================================
// PHÂN CÔNG ĐẦU CA (tổ chế độ trạm — giai đoạn A, docs/designs/xuong-tram-quet.md): tổ trưởng gán người vào hàng một
// lần, công nhân không phải quét phiếu. "Giữ như hôm qua" = mỗi người về hàng làm dở lần trước. Phân công chỉ tính
// khi người đó có mặt (vào ca); ai không được phân / không quét sau 30 phút thì hệ thống tự gán theo hàng hôm trước.
// ============================================================================

const KHONG = '';

export function PhanCongSheet({ toId, onGhi, onClose }: {
  toId: number;
  onGhi: (evs: SuKienNhap[], moTa: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [data, setData] = useState<PhanCongData | null>(null);
  const [loi, setLoi] = useState('');
  const [chon, setChon] = useState<Record<string, string>>({});
  const [dang, setDang] = useState(false);

  useEffect(() => {
    void tramQuanLyApi(authXuong).phanCong(toId).then(r => {
      if (!r.ok) { setLoi(r.status === 0 ? 'Đang mất sóng — phân công cần có sóng.' : r.message); return; }
      setData(r.data);
      // Mặc định: đang ở hàng nào giữ hàng đó; chưa ở hàng thì gợi ý hàng hôm trước
      setChon(Object.fromEntries(r.data.nguoi.map(n => [n.mnv, n.dangO?.key ?? n.homQua?.key ?? KHONG])));
    });
  }, [toId]);

  const hang = useMemo(() => new Map((data?.hangMuc ?? []).map(h => [h.key, h])), [data]);
  // Thay đổi so với hiện tại; giữ nguyên hàng đang "tự gán" cũng ghi lại = xác nhận
  const doi = (data?.nguoi ?? []).filter(n => (chon[n.mnv] ?? KHONG) !== (n.dangO?.key ?? KHONG)
    || (n.dangO?.nguon === 'tu_gan' && chon[n.mnv] === n.dangO.key));
  const giuHomQua = () => setChon(c => ({ ...c, ...Object.fromEntries((data?.nguoi ?? []).filter(n => n.homQua).map(n => [n.mnv, n.homQua!.key])) }));

  const luu = async () => {
    if (!doi.length) { onClose(); return; }
    const evs: SuKienNhap[] = doi.map(n => {
      const k = chon[n.mnv] ?? KHONG;
      const h = hang.get(k);
      return h
        ? { loai: 'nguoi_vao', toId, hex: h.hex, congDoanId: h.congDoanId, duLieu: { mnv: n.mnv, tram: true, phanCong: true } }
        : { loai: 'nguoi_ra', toId, hex: n.dangO?.hex ?? null, congDoanId: n.dangO?.congDoanId ?? null, duLieu: { mnv: n.mnv, tram: true, phanCong: true } };
    });
    setDang(true);
    const ok = await onGhi(evs, `Phân công ${doi.length} người`);
    setDang(false);
    if (ok) onClose();
  };

  const coMat = (data?.nguoi ?? []).filter(n => n.coMat).length;
  return (
    <BottomSheet title="Phân công đầu ca" onClose={onClose}
      footer={data?.suaDuoc ? (
        <div className="grid grid-cols-2 gap-3">
          <button className={NUT_PHU} onClick={giuHomQua}><History size="1.1em" /> Giữ như hôm qua</button>
          <button className={NUT_CHINH} disabled={dang} onClick={() => void luu()}>{doi.length ? `Lưu (${doi.length} thay đổi)` : 'Đóng'}</button>
        </div>
      ) : undefined}>
      {loi && <p className="text-base text-red-700" role="alert">{loi}</p>}
      {data && (
        <>
          <p className="pb-3 text-base text-slate-600">
            {coMat}/{data.nguoi.length} người có mặt. Chọn hàng cho từng người — người chưa vào ca được tính từ lúc họ quét thẻ / có mặt.
            Không chọn thì sau 30 phút hệ thống tự gán theo hàng hôm trước.
          </p>
          {!data.hangMuc.length && <p className="pb-3 text-base text-amber-800">Tổ chưa có hàng nào đang làm được — Nhận hàng trước.</p>}
          <ul className="space-y-2 pb-4">
            {data.nguoi.map(n => {
              const k = chon[n.mnv] ?? KHONG;
              const daDoi = k !== (n.dangO?.key ?? KHONG);
              return (
                <li key={n.mnv} className={`rounded-2xl p-3 ${daDoi ? 'border-2 border-slate-900' : `border ${n.dangO?.nguon === 'tu_gan' ? `${MAU.ngung.vien} ${MAU.ngung.nen}` : 'border-slate-200'}`}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-lg font-semibold text-slate-900">{n.hoTen} <span className="text-base font-normal text-slate-600">{n.mnv}</span></p>
                    <span className={`shrink-0 text-base ${n.coMat ? MAU.chay.chu : 'text-slate-500'}`}>{n.coMat ? 'Có mặt' : 'Chưa vào ca'}</span>
                  </div>
                  <select className="mt-2 h-14 w-full rounded-2xl border border-slate-300 bg-white px-3 text-base focus:border-aa-500 focus:outline-none focus:ring-4 focus:ring-aa-600/10" value={k} disabled={!data.suaDuoc}
                    onChange={e => setChon(c => ({ ...c, [n.mnv]: e.target.value }))} aria-label={`Hàng của ${n.hoTen}`}>
                    <option value={KHONG}>— Chưa phân —</option>
                    {data.hangMuc.map(h => (
                      <option key={h.key} value={h.key}>
                        {h.hex} · {h.tenHangMuc ?? ''}{h.tenCongDoan ? ` · ${h.tenCongDoan}` : ''}{n.homQua?.key === h.key ? ' (hôm qua)' : ''}
                      </option>
                    ))}
                  </select>
                  {n.dangO?.nguon === 'tu_gan' && <p className={`mt-1 text-base ${MAU.ngung.chu}`}>Đang tự gán — chọn lại hoặc giữ để xác nhận.</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </BottomSheet>
  );
}
