import { useEffect, useMemo, useState } from 'react';
import DetailDataModal from '../Dashboards/DetailDataModal';
import { fetchStockItems } from '../../../../services/dataService';
import { fmtInt, fmtDate } from '../../../../utils/format';
import { dongTonKhac0 } from '../../core/chiTietHex';

// ============================================================================
// Chi tiết TỒN KHO (bước "P022. TỒN KHO" của phễu): từng mã tồn kho (mã ID SAP) tại ngày tồn kho đang xem,
// của 1 công trình (projectName) hoặc mọi công trình trong phạm vi lọc (projectName = null).
// ============================================================================

const COLUMNS = ['hex', 'ma_id_sap', 'ten_cong_trinh', 'ten_hang_muc', 'xuong_chinh', 'phan_loai_nhom_san_pham', 'gia_tri'];

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function StockItemsModal({ open, onClose, date, projectName, congTrinh, xuong }: {
  open: boolean;
  onClose: () => void;
  /** Ngày tồn kho đang dùng cho phễu */
  date: Date | null;
  projectName: string | null;
  /** Phạm vi công trình / xưởng đang lọc ở trang (khi xem tất cả công trình) */
  congTrinh: string[];
  xuong: string[];
}) {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);

  // Khoá ổn định (mảng/Date mới mỗi lần render không làm gọi lại API)
  const dateISO = date ? toISO(date) : '';
  const scopeKey = projectName ? '' : congTrinh.join('|');   // đã chọn 1 công trình thì không cần cả danh sách
  const xuongKey = xuong.join('|');

  useEffect(() => {
    if (!open || !dateISO) return;
    const ctrl = new AbortController();
    setLoading(true);
    setRows([]);
    fetchStockItems(dateISO, projectName, {
      congTrinh: scopeKey ? scopeKey.split('|') : [],
      xuong: xuongKey ? xuongKey.split('|') : [],
      signal: ctrl.signal,
    })
      .then(r => { setRows(r.rows); setTruncated(r.truncated); })
      .catch(e => { if (e.name !== 'AbortError') { console.error('Lỗi tải chi tiết tồn kho:', e); setRows([]); } })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [open, dateISO, projectName, scopeKey, xuongKey]);

  const dateLabel = fmtDate(date);
  // Số trên thẻ đếm mã có giá trị khác 0
  const dong = useMemo(() => dongTonKhac0(rows), [rows]);
  // Số trên phễu / bảng (chế độ Số lượng) đếm MÃ ID SAP khác nhau; danh sách gom theo mã (1 mã có thể nhiều HEX / lô)
  const idCount = new Set(dong.map(r => String(r.ma_id_sap ?? ''))).size;
  const countNote = dong.length ? ` · ${fmtInt(idCount)} mã` : '';
  return (
    <DetailDataModal
      open={open}
      onClose={onClose}
      title={`Tồn kho ngày ${dateLabel}${projectName ? ` — ${projectName}` : ''}${countNote}`}
      accentColor="#16a34a"
      rows={dong}
      columns={COLUMNS}
      loading={loading}
      truncated={truncated}
      groupBy={{ col: 'ma_id_sap', label: 'mã' }}
    />
  );
}
