import { useEffect, useMemo, useRef, useState } from 'react';
import { AnalysisItem } from '../../types';
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Search, AlertCircle } from 'lucide-react';

export const DetailModalTable = ({
  data,
  title,
  icon: Icon,
  dateLabel,
  mtdLabel,
  unitLabel,
  primaryColorClass,
  secondaryColorClass,
  defaultExcludedKeys = []
}: {
  data: AnalysisItem[];
  title: string;
  icon: React.ElementType;
  dateLabel: string;
  mtdLabel: string;
  unitLabel: string;
  primaryColorClass: string;
  secondaryColorClass: string;
  defaultExcludedKeys?: string[];
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'daily' | 'mtd'; direction: 'asc' | 'desc' }>({ key: 'mtd', direction: 'desc' });
  
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
const lastDataSignatureRef = useRef<string>(
  data && data.length > 0 ? data.map(i => i.name).sort().join('|') : ''
);

// 👇 Thêm mới: khi data thay đổi (ví dụ fetch async xong sau khi mount),
// đồng bộ lại selectedKeys nếu tập tên khác với lần khởi tạo trước —
// tránh trường hợp selectedKeys "đóng băng" ở giá trị rỗng ban đầu.
useEffect(() => {
  if (!data || data.length === 0) return; // vẫn đang loading, chưa có gì để đồng bộ
  const currentSignature = data.map(i => i.name).sort().join('|');
  if (currentSignature !== lastDataSignatureRef.current) {
    lastDataSignatureRef.current = currentSignature;
    setSelectedKeys(
      new Set(data.map(item => item.name).filter(name => !defaultExcludedKeys.includes(name)))
    );
  }
  // defaultExcludedKeys thường là literal [] mới mỗi lần render ở component cha,
  // nên KHÔNG đưa vào dependency array để tránh so sánh sai lệch không cần thiết —
  // logic so khớp currentSignature đã đủ để quyết định khi nào cần reset.
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
    let sortableItems = [...filteredData];
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
    if (sortConfig.key !== columnKey) return <ArrowUpDown size={12} className="text-slate-300 ml-1 inline opacity-50" />;
    return sortConfig.direction === 'asc'
      ? <ArrowUp size={12} className="text-slate-600 ml-1 inline" />
      : <ArrowDown size={12} className="text-slate-600 ml-1 inline" />;
  };

  if (data.length === 0) {
    return (
      <div className="mb-8">
        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
          <Icon size={16} className="text-wood-600" /> {title}
        </h4>
        <div className="flex flex-col items-center justify-center text-slate-400 p-8 bg-white rounded-lg border border-slate-200 border-dashed">
          <AlertCircle size={32} className="mb-2 opacity-50" />
          <p>Không có dữ liệu phân tích.</p>
        </div>
      </div>
    );
  }

  const totalDaily = filteredData.reduce((a, b) => a + b.daily, 0);
  const totalMtd = filteredData.reduce((a, b) => a + b.mtd, 0);

  return (
    <div className="mb-8">
      <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
        <Icon size={16} className="text-wood-600" /> {title}
      </h4>
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col max-h-[500px]">
        <div className="overflow-y-auto custom-scrollbar flex-1 relative">
          <table className="w-full text-sm text-right relative border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-xs sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-left border-b border-slate-200 bg-slate-100 min-w-[200px] z-30">
                  <div className="flex items-center justify-between">
                    <span
                      className="cursor-pointer hover:text-slate-900 flex items-center"
                      onClick={() => requestSort('name')}
                    >
                      Tên (Name) <SortIcon columnKey="name" />
                    </span>
                    <div className="relative" ref={filterRef}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); }}
                        className={`p-1 rounded hover:bg-slate-200 transition-colors ${selectedKeys.size !== data.length ? 'text-wood-600 bg-wood-50' : 'text-slate-400'}`}
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
                          <div className="p-2 border-t border-slate-100 bg-slate-50 rounded-b-lg flex justify-between items-center text-[10px] text-slate-500">
                            <span>{selectedKeys.size} đã chọn</span>
                            <button onClick={() => setIsFilterOpen(false)} className="text-wood-600 font-bold hover:underline">Đóng</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </th>
                <th
                  className={`px-4 py-3 border-b border-slate-200 bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors ${primaryColorClass.replace('text-', 'text-opacity-70 text-')}`}
                  onClick={() => requestSort('daily')}
                >
                  {dateLabel} <br /> {unitLabel} <SortIcon columnKey="daily" />
                </th>
                <th
                  className={`px-4 py-3 border-b border-slate-200 bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors ${secondaryColorClass.replace('text-', 'text-opacity-70 text-')}`}
                  onClick={() => requestSort('mtd')}
                >
                  {mtdLabel} <br /> {unitLabel} <SortIcon columnKey="mtd" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedData.length > 0 ? sortedData.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-left font-medium text-slate-700">{item.name}</td>
                  <td className={`px-4 py-3 ${item.daily > 0 ? `${primaryColorClass} font-bold` : 'text-slate-300'}`}>
                    {item.daily > 0 ? item.daily.toLocaleString('en-US') : '-'}
                  </td>
                  <td className={`px-4 py-3 ${item.mtd > 0 ? `${secondaryColorClass} font-bold` : 'text-slate-300'}`}>
                    {item.mtd > 0 ? item.mtd.toLocaleString('en-US') : '-'}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="p-8 text-center text-slate-400">Đã lọc hết dữ liệu.</td></tr>
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-slate-800 border-t border-slate-300 sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
              <tr>
                <td className="px-4 py-3 text-left bg-slate-100">TỔNG CỘNG</td>
                <td className={`px-4 py-3 bg-slate-100 ${primaryColorClass}`}>
                  {totalDaily.toLocaleString('en-US')}
                </td>
                <td className={`px-4 py-3 bg-slate-100 ${secondaryColorClass}`}>
                  {totalMtd.toLocaleString('en-US')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};