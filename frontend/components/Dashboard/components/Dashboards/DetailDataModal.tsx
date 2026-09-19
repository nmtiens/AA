import { useEffect, useMemo, useState } from 'react';
import { Eye, X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { exportDetailRowsToCsv } from '../../utils/csvExport';

const ROWS_PER_PAGE = 200;

interface DetailDataModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  accentColor: string; // mã màu hex dùng cho icon + nút xuất CSV (theme.bar)
  rows: Record<string, any>[];
  columns: string[];
  loading: boolean;
  truncated: boolean;
  fileName?: string; // tên file CSV khi xuất
}

const formatColumnLabel = (col: string) => col.toUpperCase().replace(/_/g, ' ');
const formatCellValue = (v: any) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return String(v);
};

export default function DetailDataModal({
  open, onClose, title, accentColor, rows, columns, loading, truncated, fileName,
}: DetailDataModalProps) {
  const [page, setPage] = useState(1);

  // Reset về trang 1 mỗi khi mở modal hoặc dữ liệu (rows) đổi —
  // tránh trường hợp đang đứng ở trang 3 của dữ liệu cũ khi xem dữ liệu mới.
  useEffect(() => {
    setPage(1);
  }, [rows, open]);

  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return rows.slice(start, start + ROWS_PER_PAGE);
  }, [rows, page]);

  if (!open) return null;

  const startIdx = rows.length === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1;
  const endIdx = Math.min(page * ROWS_PER_PAGE, rows.length);

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Cửa sổ to hơn: chiếm gần hết màn hình thay vì max-w-6xl cố định */}
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-[95vw] xl:max-w-[1600px] h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Eye size={16} style={{ color: accentColor }} />
            {title}
          </h3>
          <div className="flex items-center gap-3">
            {/* Xuất toàn bộ rows đang có (không chỉ trang hiện tại) */}
            <button
              onClick={() => exportDetailRowsToCsv(fileName ?? 'chi_tiet', columns, rows)}
              disabled={loading || rows.length === 0}
              title={
                truncated
                  ? 'Server đã giới hạn số dòng, file chỉ chứa các dòng đã tải về'
                  : 'Xuất dữ liệu đang hiển thị ra file .CSV'
              }
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold border shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{
                color: accentColor,
                borderColor: accentColor,
                backgroundColor: `${accentColor}1A`,
              }}
            >
              <Download size={15} />
              <span>Xuất CSV</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-auto flex-1 p-4">
          {loading ? (
            <div className="text-center text-slate-400 py-10 text-sm">Đang tải...</div>
          ) : rows.length === 0 ? (
            <div className="text-center text-slate-400 py-10 text-sm">Không có dữ liệu chi tiết cho bộ lọc hiện tại</div>
          ) : (
            <table className="min-w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  {columns.map(col => (
                    <th
                      key={col}
                      className="px-2 py-1.5 text-left border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap"
                    >
                      {formatColumnLabel(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, i) => (
                  <tr key={i} className="odd:bg-white even:bg-slate-50/50 hover:bg-indigo-50/40">
                    {columns.map(col => (
                      <td key={col} className="px-2 py-1 border-b border-slate-100 whitespace-nowrap">
                        {formatCellValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Thanh phân trang — chỉ hiện khi có dữ liệu */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 shrink-0 bg-white">
            <span className="text-[11px] text-slate-500">
              Hiển thị {startIdx.toLocaleString('vi-VN')}–{endIdx.toLocaleString('vi-VN')} / {rows.length.toLocaleString('vi-VN')} dòng
              {truncated ? ' (server đã giới hạn số dòng trả về)' : ''}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-semibold text-slate-600 min-w-[70px] text-center">
                  Trang {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {truncated && (
          <div className="px-5 py-2 text-[11px] text-amber-600 bg-amber-50 border-t border-amber-100 shrink-0">
            Dữ liệu server đã bị giới hạn số dòng — vui lòng thu hẹp bộ lọc (khoảng ngày, xưởng, công trình...) để xem đầy đủ hơn.
          </div>
        )}
      </div>
    </div>
  );
}
