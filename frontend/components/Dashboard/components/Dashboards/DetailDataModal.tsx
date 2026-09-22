import { useEffect, useMemo, useState } from 'react';
import { Eye, X, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Download } from 'lucide-react';
import { exportDetailRowsToCsv } from '../../utils/csvExport';

const ROWS_PER_PAGE = 200;

// Cột dùng để gom nhóm — nếu tồn tại trong danh sách columns thì bật chế độ group,
// nếu không có (một số bảng chi tiết khác không có HEX) thì fallback về hiển thị phẳng như cũ.
const GROUP_BY_COLUMN = 'hex';

// Các cột số lượng cần CỘNG DỒN khi gom nhóm (chỉnh lại theo tên cột thật của bạn nếu cần thêm).
const SUM_COLUMNS = new Set(['so_luong_xuat_kho', 'so_luong']);

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

interface GroupedRow {
  key: string;
  rows: Record<string, any>[]; // các dòng gốc thuộc nhóm này
  merged: Record<string, any>; // dòng đại diện đã gộp, dùng để hiển thị ở hàng cha
}

const formatColumnLabel = (col: string) => col.toUpperCase().replace(/_/g, ' ');
const formatCellValue = (v: any) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return String(v);
};

// Gộp nhiều dòng có cùng giá trị GROUP_BY_COLUMN thành 1 dòng đại diện:
// - Cột nằm trong SUM_COLUMNS => cộng dồn (số lượng)
// - Cột khác: nếu tất cả dòng con giống nhau thì giữ nguyên giá trị đó,
//   nếu khác nhau thì hiển thị "Nhiều giá trị" để không đánh lừa người xem.
function buildGroups(rows: Record<string, any>[], columns: string[]): GroupedRow[] {
  const map = new Map<string, Record<string, any>[]>();
  const order: string[] = [];

  for (const row of rows) {
    const key = String(row[GROUP_BY_COLUMN] ?? '');
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(row);
  }

  return order.map((key) => {
    const groupRows = map.get(key)!;
    const merged: Record<string, any> = {};

    for (const col of columns) {
      if (col === GROUP_BY_COLUMN) {
        merged[col] = key;
        continue;
      }
      if (SUM_COLUMNS.has(col)) {
        merged[col] = groupRows.reduce((sum, r) => sum + (Number(r[col]) || 0), 0);
        continue;
      }
      const firstVal = groupRows[0][col];
      const allSame = groupRows.every((r) => r[col] === firstVal);
      merged[col] = allSame ? firstVal : '— Nhiều giá trị —';
    }

    return { key, rows: groupRows, merged };
  });
}

export default function DetailDataModal({
  open, onClose, title, accentColor, rows, columns, loading, truncated, fileName,
}: DetailDataModalProps) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const canGroup = columns.includes(GROUP_BY_COLUMN);

  // Reset về trang 1 + đóng hết các nhóm đang mở mỗi khi mở modal hoặc dữ liệu (rows) đổi —
  // tránh trường hợp đang đứng ở trang 3 của dữ liệu cũ khi xem dữ liệu mới.
  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [rows, open]);

  const groups = useMemo(
    () => (canGroup ? buildGroups(rows, columns) : []),
    [rows, columns, canGroup]
  );

  // Khi có group: phân trang theo SỐ NHÓM (khớp với số lượng HEX hiển thị ngoài biểu đồ).
  // Khi không group: giữ nguyên hành vi cũ, phân trang theo số dòng gốc.
  const totalUnits = canGroup ? groups.length : rows.length;
  const totalPages = Math.max(1, Math.ceil(totalUnits / ROWS_PER_PAGE));

  const pagedGroups = useMemo(() => {
    if (!canGroup) return [];
    const start = (page - 1) * ROWS_PER_PAGE;
    return groups.slice(start, start + ROWS_PER_PAGE);
  }, [groups, page, canGroup]);

  const pagedRows = useMemo(() => {
    if (canGroup) return [];
    const start = (page - 1) * ROWS_PER_PAGE;
    return rows.slice(start, start + ROWS_PER_PAGE);
  }, [rows, page, canGroup]);

  if (!open) return null;

  const startIdx = totalUnits === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1;
  const endIdx = Math.min(page * ROWS_PER_PAGE, totalUnits);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
            {canGroup && (
              <span className="text-[11px] font-normal text-slate-400">
                ({groups.length.toLocaleString('vi-VN')} {GROUP_BY_COLUMN.toUpperCase()} · {rows.length.toLocaleString('vi-VN')} dòng)
              </span>
            )}
          </h3>
          <div className="flex items-center gap-3">
            {/* Xuất toàn bộ rows GỐC đang có (không group, không chỉ trang hiện tại) */}
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
                  {canGroup && <th className="w-6 border-b border-slate-200" />}
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
                {canGroup
                  ? pagedGroups.map((g) => {
                      const isMulti = g.rows.length > 1;
                      const isOpen = expanded.has(g.key);
                      return (
                        <>
                          <tr
                            key={g.key}
                            className={
                              isMulti
                                ? 'bg-indigo-50/70 hover:bg-indigo-100/70 cursor-pointer'
                                : 'odd:bg-white even:bg-slate-50/50 hover:bg-indigo-50/40'
                            }
                            onClick={() => isMulti && toggleGroup(g.key)}
                          >
                            <td className="px-1 py-1 border-b border-slate-100 text-slate-600">
                              {isMulti && (isOpen ? <ChevronDown size={14} strokeWidth={2.75} /> : <ChevronRightIcon size={14} strokeWidth={2.75} />)}
                            </td>
                            {columns.map(col => (
                              <td
                                key={col}
                                className={`px-2 py-1 border-b border-slate-100 whitespace-nowrap ${isMulti ? 'font-bold text-slate-800' : ''}`}
                              >
                                {formatCellValue(g.merged[col])}
                                {col === GROUP_BY_COLUMN && isMulti && (
                                  <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-600 text-white shadow-sm">
                                    x{g.rows.length}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                          {isMulti && isOpen && g.rows.map((row, i) => (
                            <tr key={`${g.key}-${i}`} className="bg-indigo-50/20 text-slate-500">
                              <td className="border-b border-slate-100" />
                              {columns.map(col => (
                                <td key={col} className="px-2 py-1 pl-4 border-b border-slate-100 whitespace-nowrap">
                                  {formatCellValue(row[col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </>
                      );
                    })
                  : pagedRows.map((row, i) => (
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
              {canGroup
                ? <>Hiển thị {startIdx.toLocaleString('vi-VN')}–{endIdx.toLocaleString('vi-VN')} / {totalUnits.toLocaleString('vi-VN')} {GROUP_BY_COLUMN.toUpperCase()} ({rows.length.toLocaleString('vi-VN')} dòng gốc)</>
                : <>Hiển thị {startIdx.toLocaleString('vi-VN')}–{endIdx.toLocaleString('vi-VN')} / {totalUnits.toLocaleString('vi-VN')} dòng</>
              }
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