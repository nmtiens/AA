// src/components/Settings/TableColumnSetup.tsx
//
// Trang setup: chọn 1 bảng dữ liệu, rồi chọn các cột được phép hiển thị
// (kiểu popover Excel filter) + kéo-thả sắp xếp thứ tự cột + tick "mặc định
// hiện" cho từng cột đã chọn.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings2, Search, RefreshCw, Check, ChevronDown, ListFilter,
  GripVertical, X, ListOrdered, Eye, EyeOff,
} from 'lucide-react';
import { ColumnDefinition } from '../../types';
import { useToast } from '../../context/ToastContext';
import {
  CONFIGURABLE_TABLES,
  getColumnConfigForTable,
  setColumnConfigForTable,
  loadTableColumnConfig,
  isTableColumnConfigLoaded,
  isTableConfiguredExplicitly,   // ← thêm import
} from './utils/tableColumnConfig';

interface TableColumnSetupProps {
  // table id -> danh sách cột hiện có (lấy từ dữ liệu thực tế đang tải)
  columnsByTable: Record<string, ColumnDefinition[]>;
}

const TableColumnSetup: React.FC<TableColumnSetupProps> = ({ columnsByTable }) => {
  const { showToast } = useToast();

  const [configReady, setConfigReady] = useState(isTableColumnConfigLoaded());
  useEffect(() => {
    if (configReady) return;
    loadTableColumnConfig().then(() => setConfigReady(true));
  }, [configReady]);

  const [selectedTableId, setSelectedTableId] = useState<string>(CONFIGURABLE_TABLES[0]?.id || '');
  const selectedTable = CONFIGURABLE_TABLES.find((t) => t.id === selectedTableId);
  const allColumns = useMemo(
    () => columnsByTable[selectedTableId] || [],
    [columnsByTable, selectedTableId]
  );
  const columnLabelByKey = useMemo(
    () => new Map(allColumns.map((c) => [c.key, c.label])),
    [allColumns]
  );

  // allowedColumns: mảng có thứ tự (thứ tự = thứ tự hiển thị cột)
  const [allowedColumns, setAllowedColumns] = useState<string[]>([]);
  const [defaultVisible, setDefaultVisible] = useState<Set<string>>(new Set());

  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTableDropdownOpen, setIsTableDropdownOpen] = useState(false);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const allowedSet = useMemo(() => new Set(allowedColumns), [allowedColumns]);

  // Nạp cấu hình đã lưu khi đổi bảng (hoặc khi config vừa load xong)
// Giữ 1 bản snapshot mới nhất của allColumns qua ref, KHÔNG dùng làm dependency
// của effect nạp cấu hình — tránh bị nạp lại (và ghi đè lựa chọn đang dở) mỗi
// khi columnsByTable đổi reference do MainLayout re-render nền (polling...).
// Đánh dấu bảng đã được nạp cấu hình lần đầu (theo tableId), để:
// - Vẫn nạp lại khi dữ liệu cột thật (allColumns) đến TRỄ hơn configReady
//   (trường hợp mở thẳng trang này, MainLayout chưa kịp tải xong bảng đó).
// - KHÔNG ghi đè lựa chọn đang dở của người dùng khi allColumns đổi reference
//   do polling nền (MainLayout tự fetch lại mỗi 60s) một khi đã nạp xong 1 lần.
const loadedForTableRef = useRef<string | null>(null);

useEffect(() => {
  if (!configReady || !selectedTableId) return;
  if (allColumns.length === 0) return;
  if (loadedForTableRef.current === selectedTableId) return;

  const saved = getColumnConfigForTable(selectedTableId);
  const validKeys = new Set(allColumns.map((c) => c.key));
  const hasConfig = isTableConfiguredExplicitly(selectedTableId);

  const cleanedAllowed = hasConfig
    ? saved.allowedColumns.filter((k) => validKeys.has(k))
    : allColumns.map((c) => c.key);

  const cleanedDefault = new Set(saved.defaultVisibleColumns.filter((k) => cleanedAllowed.includes(k)));

  setAllowedColumns(cleanedAllowed);
  setDefaultVisible(cleanedDefault);
  loadedForTableRef.current = selectedTableId;
}, [configReady, selectedTableId, allColumns]);

  useEffect(() => {
    if (!isFilterOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        filterPopoverRef.current && !filterPopoverRef.current.contains(target) &&
        filterButtonRef.current && !filterButtonRef.current.contains(target)
      ) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  const toggleColumn = (key: string) => {
    setAllowedColumns((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
    setDefaultVisible((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const removeColumn = (key: string) => {
    setAllowedColumns((prev) => prev.filter((k) => k !== key));
    setDefaultVisible((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const toggleDefaultVisible = (key: string) => {
    setDefaultVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setAllowedColumns((prev) => {
      const existing = new Set(prev);
      const toAdd = filteredColumns.filter((c) => !existing.has(c.key)).map((c) => c.key);
      return [...prev, ...toAdd];
    });
  };

  const handleClearAllFiltered = () => {
    if (!searchTerm.trim()) {
      setAllowedColumns([]);
      setDefaultVisible(new Set());
      return;
    }
    const filteredKeys = new Set(filteredColumns.map((c) => c.key));
    setAllowedColumns((prev) => prev.filter((k) => !filteredKeys.has(k)));
    setDefaultVisible((prev) => {
      const next = new Set(prev);
      filteredKeys.forEach((k) => next.delete(k));
      return next;
    });
  };

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };
  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (dragIndex === null || dragIndex === index) { setDragIndex(null); return; }
    setAllowedColumns((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  const moveColumn = (index: number, direction: -1 | 1) => {
    setAllowedColumns((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedTableId) return;
    setIsSaving(true);
    try {
      const ok = await setColumnConfigForTable(selectedTableId, {
        allowedColumns,
        defaultVisibleColumns: Array.from(defaultVisible),
      });
      if (ok) {
        showToast(`Đã lưu setup cột cho "${selectedTable?.label}"`, 'success');
      } else {
        showToast('Lưu setup thất bại — vui lòng mở Console (F12) để xem lỗi chi tiết', 'error');
      }
    } catch {
      showToast('Lưu setup thất bại', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredColumns = allColumns.filter((c) =>
    c.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-wood-50">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-wood-600 flex items-center justify-center text-white shadow-sm">
            <Settings2 size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Setup cột dữ liệu</h1>
            <p className="text-xs text-slate-500">Chọn cột được phép hiển thị, sắp xếp thứ tự & chọn cột mặc định hiện</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !selectedTableId}
          className={`flex items-center gap-2 px-5 py-2.5 bg-wood-600 text-white rounded-lg font-medium hover:bg-wood-700 transition-colors ${(isSaving || !selectedTableId) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
          {isSaving ? 'Đang lưu...' : 'Lưu setup'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-5">

          {/* Chọn bảng */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <label className="text-xs font-bold text-slate-500 block mb-2">Chọn bảng cần setup cột</label>
            <div className="relative">
              <button
                onClick={() => setIsTableDropdownOpen(!isTableDropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:border-wood-400 transition-colors"
              >
                <span>{selectedTable?.label || 'Chọn bảng'}</span>
                <ChevronDown size={16} className={`transition-transform ${isTableDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isTableDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {CONFIGURABLE_TABLES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTableId(t.id); setIsTableDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-wood-50 transition-colors
                        ${t.id === selectedTableId ? 'bg-wood-50 text-wood-700 font-semibold' : 'text-slate-700'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Cho phép <span className="font-semibold text-wood-600">{allowedColumns.length}</span> / {allColumns.length} cột ·
              Mặc định hiện <span className="font-semibold text-wood-600">{defaultVisible.size}</span> cột
            </p>
          </div>

          {/* Popover chọn cột kiểu Excel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-500">Chọn cột được phép hiển thị</label>
              {allColumns.length === 0 && (
                <span className="text-xs text-slate-400">Bảng này chưa có dữ liệu/cột để chọn</span>
              )}
            </div>
            <div className="relative inline-block">
              <button
                ref={filterButtonRef}
                onClick={() => setIsFilterOpen((v) => !v)}
                disabled={allColumns.length === 0}
                className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-colors
                  ${isFilterOpen ? 'border-wood-500 text-wood-700 bg-wood-50' : 'border-slate-300 text-slate-700 hover:border-wood-400'}
                  ${allColumns.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ListFilter size={16} />
                Chọn cột
                <span className="px-1.5 py-0.5 rounded bg-wood-600 text-white text-[11px] font-bold">
                  {allowedColumns.length}
                </span>
                <ChevronDown size={14} className={`transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
              </button>

              {isFilterOpen && (
                <div
                  ref={filterPopoverRef}
                  className="absolute z-20 mt-1 w-96 bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col overflow-hidden"
                >
                  <div className="p-3 border-b border-slate-100 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Tìm cột..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none"
                      />
                    </div>
                    <button onClick={() => setIsFilterOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100" title="Đóng">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="px-3 py-2 border-b border-slate-100 flex gap-2 bg-slate-50">
                    <button onClick={handleSelectAllFiltered} className="flex-1 px-2 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-600 hover:bg-wood-50">
                      Chọn tất cả{searchTerm.trim() ? ' (đang lọc)' : ''}
                    </button>
                    <button onClick={handleClearAllFiltered} className="flex-1 px-2 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-600 hover:bg-red-50 hover:text-red-600">
                      Bỏ chọn hết
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {filteredColumns.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-sm">Không tìm thấy cột phù hợp.</div>
                    ) : (
                      filteredColumns.map((col) => {
                        const checked = allowedSet.has(col.key);
                        return (
                          <label key={col.key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-wood-50/40 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleColumn(col.key)}
                              className="w-4 h-4 rounded border-slate-300 text-wood-600 focus:ring-wood-500/30"
                            />
                            <span className={`text-sm truncate ${checked ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                              {col.label}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Danh sách cột được phép — kéo-thả sắp xếp + tick mặc định hiện */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <ListOrdered size={16} className="text-wood-600" />
              <h2 className="text-sm font-bold text-slate-700">Cột được phép hiển thị</h2>
              <span className="text-xs text-slate-400 ml-auto">
                Kéo (⠿) để sắp xếp · bấm biểu tượng mắt để chọn cột mặc định hiện
              </span>
            </div>

            {allowedColumns.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                Chưa có cột nào được chọn. Nhấn "Chọn cột" ở trên để thêm.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {allowedColumns.map((key, index) => {
                  const isDefault = defaultVisible.has(key);
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={handleDragStart(index)}
                      onDragOver={handleDragOver(index)}
                      onDrop={handleDrop(index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-3 px-4 py-2.5 bg-white transition-colors
                        ${dragIndex === index ? 'opacity-40' : ''}
                        ${dragOverIndex === index && dragIndex !== null && dragIndex !== index ? 'bg-wood-50 border-t-2 border-wood-400' : ''}
                      `}
                    >
                      <span className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600" title="Kéo để sắp xếp">
                        <GripVertical size={16} />
                      </span>
                      <span className="w-7 h-7 shrink-0 rounded-full bg-wood-100 text-wood-700 text-xs font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-sm text-slate-800 font-medium flex-1 truncate">
                        {columnLabelByKey.get(key) || key}
                      </span>
                      <button
                        onClick={() => toggleDefaultVisible(key)}
                        title={isDefault ? 'Đang mặc định hiện — bấm để bỏ' : 'Bấm để đặt hiện mặc định'}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors
                          ${isDefault ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:bg-slate-100'}`}
                      >
                        {isDefault ? <Eye size={14} /> : <EyeOff size={14} />}
                        Mặc định
                      </button>
                      <button onClick={() => moveColumn(index, -1)} disabled={index === 0} className="p-1 text-slate-400 hover:text-wood-600 disabled:opacity-25 disabled:cursor-not-allowed" title="Lên">
                        <ChevronDown size={14} className="rotate-180" />
                      </button>
                      <button onClick={() => moveColumn(index, 1)} disabled={index === allowedColumns.length - 1} className="p-1 text-slate-400 hover:text-wood-600 disabled:opacity-25 disabled:cursor-not-allowed" title="Xuống">
                        <ChevronDown size={14} />
                      </button>
                      <button onClick={() => removeColumn(key)} className="p-1 text-slate-400 hover:text-red-600" title="Bỏ chọn">
                        <X size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableColumnSetup;