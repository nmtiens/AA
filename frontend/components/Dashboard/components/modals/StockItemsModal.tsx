import { useEffect, useState } from 'react';
import DetailDataModal from '../Dashboards/DetailDataModal';
import { fetchStockItems } from '../../../../services/dataService';

// ============================================================================
// Chi tiết TỒN KHO (bước "P022. TỒN KHO" của phễu): từng mã tồn kho tại ngày tồn kho đang xem,
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

  const dateLabel = date ? date.toLocaleDateString('vi-VN') : '';
  // Số trên phễu (chế độ Hạng mục) đếm MÃ ID SAP khác nhau; danh sách liệt kê từng DÒNG tồn (1 mã có thể nhiều lô)
  const idCount = new Set(rows.map(r => String(r.ma_id_sap ?? ''))).size;
  const countNote = rows.length ? ` · ${rows.length.toLocaleString('vi-VN')} dòng / ${idCount.toLocaleString('vi-VN')} mã` : '';
  return (
    <DetailDataModal
      open={open}
      onClose={onClose}
      title={`Tồn kho ngày ${dateLabel}${projectName ? ` — ${projectName}` : ''}${countNote} · Đơn vị: Tỷ đồng`}
      accentColor="#16a34a"
      rows={rows}
      columns={COLUMNS}
      loading={loading}
      truncated={truncated}
    />
  );
}
