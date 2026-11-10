import { useEffect, useMemo, useRef, useState } from 'react';
import { AnalysisItem } from '../../types';
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Search, AlertCircle } from 'lucide-react';
import { table, tdB, tdSo, tfoot, thB, thead } from '../../../shared/bangBaoCao';
import { fmtInt } from '../../../../utils/format';

const defaultFormatValue = fmtInt;
// Ô coi như 0 (dư số thực vd. -1e-12 không được hiện "-0,00" đỏ)
const isZeroCell = (v: number) => !Number.isFinite(v) || Math.abs(v) < 0.005;
// Cùng mẫu bảng tab BOT (BangCayBot)

export const DetailModalTable = ({
  data,
  title,
  icon: Icon,
  dateLabel,
  mtdLabel,
  unitLabel,
  formatValue = defaultFormatValue,
  defaultExcludedKeys = [],
  onValueClick,
}: {
  data: AnalysisItem[];
  title: string;
  icon: React.ElementType;
  dateLabel: string;
  /** Bỏ trống => bảng chỉ có 1 cột số (daily) */
  mtdLabel?: string;
  unitLabel: string;
  /** Định dạng ô số (mặc định: số đếm). Tiền truyền formatTrieuAsTy */
  formatValue?: (value: number) => string;
  /** Không còn dùng: số theo mẫu một màu */
  primaryColorClass?: string;
  secondaryColorClass?: string;
  defaultExcludedKeys?: string[];
  /** Bấm 1 ô số => danh sách hạng mục tạo nên số đó (tên nhóm, cột trong ngày / lũy kế) — như OnLineStageDetailModal */
  onValueClick?: (name: string, kind: 'daily' | 'mtd') => void;
}) => {
  const coMtd = mtdLabel !== undefined;
  // Ô có số + có onValueClick: hiện thành nút gạch chấm; ô 0 để trống
  const oSo = (name: string, kind: 'daily' | 'mtd', v: number) => (isZeroCell(v) ? '' : !onValueClick ? formatValue(v) : (
    <button type="button" onClick={() => onValueClick(name, kind)} title="Bấm để xem danh sách"
            className="cursor-pointer underline decoration-slate-300 decoration-dotted underline-offset-2 focus:outline-none focus-visible:decoration-solid">
      {formatValue(v)}
    </button>
  ));
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'daily' | 'mtd'; direction: 'asc' | 'desc' }>({ key: coMtd ? 'mtd' : 'daily', direction: 'desc' });
  
  // ✅ Đã sửa: Khởi tạo giá trị ban đầu trực tiếp trong useState để tránh lặp vô tận
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => {
    if (!data || data.length === 0) return new Set();
    return new Set(
      data
        .map(item => item.name)
        .filter(name => !defaultExcludedKeys.includes(name))
    );
  });

  // 👇 Thêm mới: theo dõi tập "name" đã dùng để khởi tạo selectedKeys lần gần nhất
// Tích lũy MỌI tên đã từng xuất hiện qua các lần fetch (không reset theo signature),
// để phát hiện đúng "tên hoàn toàn mới" mà không đụng vào lựa chọn filter người dùng đã tự tắt.
const allSeenNamesRef = useRef<Set<string>>(
  new Set(data && data.length > 0 ? data.map(i => i.name) : [])
);

// 👇 Thêm mới: khi data thay đổi (ví dụ fetch async xong sau khi mount),
// đồng bộ lại selectedKeys nếu tập tên khác với lần khởi tạo trước —
// tránh trường hợp selectedKeys "đóng băng" ở giá trị rỗng ban đầu.
useEffect(() => {
  if (!data || data.length === 0) return;
  setSelectedKeys(prev => {
    const newSet = new Set(prev);
    let changed = false;
    data.forEach(item => {
      // Nếu tên này CHƯA từng xuất hiện trong bất kỳ lần fetch trước & không nằm trong defaultExcludedKeys
      // -> tự động thêm vào (mặc định hiển thị)
      if (!allSeenNamesRef.current.has(item.name)) {
        allSeenNamesRef.current.add(item.name);
        if (!defaultExcludedKeys.includes(item.name)) {
          newSet.add(item.name);
          changed = true;
        }
      }
    });
    return changed ? newSet : prev;
  });
  // defaultExcludedKeys thường là literal [] mới mỗi lần render ở component cha,
  // nên KHÔNG đưa vào dependency array để tránh so sánh sai lệch không cần thiết.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [data]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);

  // Xử lý click ra ngoài menu Lọc
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleKey = (key: string) => {
    const newSet = new Set(selectedKeys);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedKeys(newSet);
  };

  const toggleSelectAll = (filteredOptions: string[]) => {
    const allSelected = filteredOptions.every(k => selectedKeys.has(k));
    const newSet = new Set(selectedKeys);
    if (allSelected) {
      filteredOptions.forEach(k => newSet.delete(k));
    } else {
      filteredOptions.forEach(k => newSet.add(k));
    }
    setSelectedKeys(newSet);
  };

  const filteredData = useMemo(() => {
    return data.filter(item => selectedKeys.has(item.name));
  }, [data, selectedKeys]);

  const sortedData = useMemo(() => {
    const sortableItems = [...filteredData];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  const allOptions = useMemo(() => data.map(i => i.name).sort(), [data]);
  const visibleOptions = allOptions.filter(opt => opt.toLowerCase().includes(filterSearch.toLowerCase()));

  const requestSort = (key: 'name' | 'daily' | 'mtd') => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown size={12} className="text-emerald-800 ml-1 inline opacity-60" />;
    return sortConfig.direction === 'asc'
      ? <ArrowUp size={12} className="text-slate-900 ml-1 inline" />
      : <ArrowDown size={12} className="text-slate-900 ml-1 inline" />;
  };

  if (data.length === 0) {
    return (
      <div className="mb-8">
        <h4 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-3">
          <Icon size={16} className="text-wood-600" /> {title}
        </h4>
        <div className="flex flex-col items-center justify-center text-slate-400 p-8 bg-white rounded-lg border border-slate-200 border-dashed">
          <AlertCircle size={32} className="mb-2 opacity-50" />
          <p>Không có dữ liệu</p>
        </div>
      </div>
    );
  }

  const totalDaily = filteredData.reduce((a, b) => a + b.daily, 0);
  const totalMtd = filteredData.reduce((a, b) => a + b.mtd, 0);

  return (
    <div className="mb-8">
      <h4 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-3">
        <Icon size={16} className="text-wood-600" /> {title}
      </h4>
      <div className="bg-white border-l border-t border-slate-300 overflow-hidden flex flex-col max-h-[500px]">
        <div className="overflow-auto custom-scrollbar flex-1 relative">
          <table className={`${table} relative`}>
            <thead className={thead}>
              <tr>
                <th className={`${thB} w-12 text-center`}>STT</th>
                <th className={`${thB} min-w-[200px] z-30 text-left`}>
                  <div className="flex items-center justify-between">
                    <span
                      className="cursor-pointer flex items-center"
                      onClick={() => requestSort('name')}
                    >
                      Tên <SortIcon columnKey="name" />
                    </span>
                    <div className="relative" ref={filterRef}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); }}
                        className={`p-1 rounded hover:bg-emerald-400 transition-colors ${selectedKeys.size !== data.length ? 'text-wood-600 bg-wood-50' : 'text-slate-700'}`}
                        title="Lọc dữ liệu"
                      >
                        <Filter size={14} fill={selectedKeys.size !== data.length ? "currentColor" : "none"} />
                      </button>
                      {isFilterOpen && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl w-64 z-50 text-left normal-case font-normal flex flex-col animate-in fade-in zoom-in-95 duration-200">
                          <div className="p-2 border-b border-slate-100 bg-slate-50 rounded-t-lg">
                            <div className="relative">
                              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-300 rounded focus:border-wood-500 focus:outline-none"
                                placeholder="Tìm kiếm..."
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={visibleOptions.every(k => selectedKeys.has(k)) && visibleOptions.length > 0}
                              onChange={() => toggleSelectAll(visibleOptions)}
                              className="rounded border-slate-300 text-wood-600 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-xs text-slate-700 font-medium">(Chọn tất cả)</span>
                          </div>
                          <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                            {visibleOptions.length > 0 ? visibleOptions.map(opt => (
                              <label key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-wood-50 cursor-pointer rounded">
                                <input
                                  type="checkbox"
                                  checked={selectedKeys.has(opt)}
                                  onChange={() => toggleKey(opt)}
                                  className="rounded border-slate-300 text-wood-600 w-3.5 h-3.5"
                                />
                                <span className="text-xs text-slate-700 truncate">{opt}</span>
                              </label>
                            )) : <div className="p-2 text-xs text-slate-400 text-center">Không tìm thấy</div>}
                          </div>
                          <div className="p-2 border-t border-slate-100 bg-slate-50 rounded-b-lg flex justify-between items-center text-xs text-slate-600">
                            <span>{selectedKeys.size} đã chọn</span>
                            <button onClick={() => setIsFilterOpen(false)} className="text-wood-600 font-bold hover:underline">Đóng</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </th>
                <th
                  className={`${thB} cursor-pointer text-center transition-colors hover:bg-emerald-400`}
                  onClick={() => requestSort('daily')}
                >
                  {dateLabel} <br /> {unitLabel} <SortIcon columnKey="daily" />
                </th>
                {coMtd && (
                  <th
                    className={`${thB} cursor-pointer text-center transition-colors hover:bg-emerald-400`}
                    onClick={() => requestSort('mtd')}
                  >
                    {mtdLabel} <br /> {unitLabel} <SortIcon columnKey="mtd" />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedData.length > 0 ? sortedData.map((item, idx) => (
                <tr key={idx} className="transition-colors hover:bg-amber-50">
                  <td className={tdSo}>{fmtInt(idx + 1)}</td>
                  <td className={`${tdB} text-left font-bold`}>{item.name}</td>
                  {/* Chỉ ô ≈ 0 (dưới 0,005 — dư số thực) để trống; ô âm (vd. nhập kho điều chỉnh) vẫn hiện số vì đã cộng vào tổng */}
                  <td className={`${tdSo} ${!isZeroCell(item.daily) && item.daily < 0 ? 'font-bold text-red-600' : ''}`}>
                    {oSo(item.name, 'daily', item.daily)}
                  </td>
                  {coMtd && (
                    <td className={`${tdSo} ${!isZeroCell(item.mtd) && item.mtd < 0 ? 'font-bold text-red-600' : ''}`}>
                      {oSo(item.name, 'mtd', item.mtd)}
                    </td>
                  )}
                </tr>
              )) : (
                <tr><td colSpan={coMtd ? 4 : 3} className="p-8 text-center text-slate-400">Không có dòng nào</td></tr>
              )}
            </tbody>
            <tfoot className={tfoot}>
              <tr>
                <td
                  colSpan={2}
                  className={`${tdB} text-center`}
                  title="Cộng các dòng nhóm. Khi đếm hạng mục, 1 HEX ở nhiều nhóm (nhiều xưởng / nhiều cách ghi tên công trình) được đếm ở mỗi nhóm nên tổng có thể lớn hơn số trên thẻ; tổng giá trị luôn khớp."
                >
                  TỔNG
                </td>
                <td className={tdSo}>
                  {isZeroCell(totalDaily) ? '' : formatValue(totalDaily)}
                </td>
                {coMtd && (
                  <td className={tdSo}>
                    {isZeroCell(totalMtd) ? '' : formatValue(totalMtd)}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};