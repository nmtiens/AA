import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { API_BASE_URL } from '../../services/dataService';
import { fmtInt } from '../../utils/format';
import type { FileLoiBot } from '../Construction/core/baoCaoBot';
import { DanhSachLoi, moTaLoi } from '../Construction/DanhSachFileLoi';

// Thanh cảnh báo cho ADMIN ở đầu mọi trang: file công trình (05_PRODUCTION STATUS) đọc lỗi / thiếu cột.
// Số của các file này trên app vẫn là của lần đọc tốt gần nhất (tool giữ dữ liệu cũ trong DB).
// Không hẹn giờ nền (DB phải ngủ): tải lúc mở app và khi quay lại tab sau ≥ 5 phút.
// Bấm × ẩn đến khi danh sách lỗi đổi (lưu trong phiên trình duyệt).

const KHOA_AN = 'canh-bao-file-loi-an';
const PHUT_TAI_LAI = 5;
const dauHieu = (ds: FileLoiBot[]) => ds.map(f => `${f.nguon}|${f.loi}`).sort().join('\n');

export const CanhBaoFileLoi = () => {
  const [ds, setDs] = useState<FileLoiBot[]>([]);
  const [an, setAn] = useState<string | null>(() => { try { return sessionStorage.getItem(KHOA_AN); } catch { return null; } });
  const [xem, setXem] = useState(false);

  const tai = useCallback(() => {
    fetch(`${API_BASE_URL}/bot-tong-hop/loi`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { fileLoi?: FileLoiBot[] } | null) => { if (d && Array.isArray(d.fileLoi)) setDs(d.fileLoi); })
      .catch(() => { /* mất mạng / chưa có bảng: không báo gì */ });
  }, []);
  useEffect(() => {
    tai();
    let lanCuoi = Date.now();
    const khiHien = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lanCuoi < PHUT_TAI_LAI * 60_000) return;
      lanCuoi = Date.now();
      tai();
    };
    document.addEventListener('visibilitychange', khiHien);
    return () => document.removeEventListener('visibilitychange', khiHien);
  }, [tai]);

  if (!ds.length) return null;
  const dau = dauHieu(ds);
  const choDau = an === dau;
  const anDi = () => { setAn(dau); try { sessionStorage.setItem(KHOA_AN, dau); } catch { /* bỏ qua */ } };
  const chuaCoSo = ds.filter(f => f.kieu === 'doc' && !f.luuTot && !f.dungSoCua).length;

  return (
    <>
      {!choDau && (
        <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-sm text-amber-950"
          title={ds.map(moTaLoi).join('\n')}>
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <b>{fmtInt(ds.length)} file công trình lỗi</b> · số của các file này đang giữ bản đọc tốt gần nhất
            {chuaCoSo > 0 && <> · <b className="text-red-700">{fmtInt(chuaCoSo)} file chưa có số</b></>}
          </span>
          <button type="button" onClick={() => setXem(true)} className="shrink-0 rounded-md bg-white px-2.5 py-0.5 font-semibold text-amber-900 hover:bg-amber-50">
            Xem danh sách
          </button>
          <button type="button" onClick={anDi} aria-label="Ẩn cảnh báo" title="Ẩn đến khi có lỗi mới" className="shrink-0 rounded p-0.5 hover:bg-amber-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {xem && <DanhSachLoi ds={ds} onClose={() => setXem(false)} />}
    </>
  );
};
