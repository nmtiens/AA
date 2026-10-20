// src/components/Settings/TableColumnSetup.tsx
//
// Trang setup: chọn 1 bảng dữ liệu, rồi chọn các cột được phép hiển thị
// (kiểu popover Excel filter) + kéo-thả sắp xếp thứ tự cột + tick "mặc định
// hiện" cho từng cột đã chọn.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, RefreshCw, Check, ChevronDown,
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
  /** Nằm trong trang chung Setup dữ liệu (thẻ): tiêu đề gọn, không icon lớn */
  embedded?: boolean;
  // table id -> danh sách cột hiện có (lấy từ dữ liệu thực tế đang tải)
  columnsByTable: Record<string, ColumnDefinition[]>;
}

const TableColumnSetup: React.FC<TableColumnSetupProps> = ({ columnsByTable, embedded = false }) => {
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
  // Bản đã lưu (lúc nạp / lần lưu gần nhất) — so để báo "có thay đổi chưa lưu"
  const [daLuu, setDaLuu] = useState<{ allowed: string[]; def: string[] }>({ allowed: [], def: [] });
  const khoaLuu = (a: string[], d: Iterable<string>) => `${a.join('\u0001')}#${[...d].sort().join('\u0001')}`;
  const chuaLuu = khoaLuu(allowedColumns, defaultVisible) !== khoaLuu(daLuu.allowed, daLuu.def);
  const [chiChuaChon, setChiChuaChon] = useState(false);

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
  setDaLuu({ allowed: cleanedAllowed, def: [...cleanedDefault] });
  loadedForTableRef.current = selectedTableId;
}, [configReady, selectedTableId, allColumns]);

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
        setDaLuu({ allowed: allowedColumns, def: [...defaultVisible] });
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
    (c.label.toLowerCase().includes(searchTerm.toLowerCase()) || c.key.toLowerCase().includes(searchTerm.toLowerCase()))
    && (!chiChuaChon || !allowedSet.has(c.key))
  );
  // Đổi bảng khi đang có thay đổi chưa lưu => hỏi trước (trước đổi bảng là mất lựa chọn đang dở)
  const doiBang = (id: string) => {
    if (id === selectedTableId) return;
    if (chuaLuu && !window.confirm('Bảng này có thay đổi chưa lưu. Đổi sang bảng khác sẽ bỏ các thay đổi đó?')) return;
    loadedForTableRef.current = null;
    setSearchTerm('');
    setSelectedTableId(id);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Thanh trên: chọn bảng + số cột + Lưu (báo khi có thay đổi chưa lưu) */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        {!embedded && <h1 className="page-title mr-2">Setup cột dữ liệu</h1>}
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Bảng
          <select value={selectedTableId} onChange={e => doiBang(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-slate-500 focus:outline-none">
            {CONFIGURABLE_TABLES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <span className="text-sm text-slate-500">
          cho phép <b className="font-semibold text-slate-900">{allowedColumns.length}</b> / {allColumns.length} cột ·
          mặc định hiện <b className="font-semibold text-slate-900">{defaultVisible.size}</b>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {chuaLuu && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Có thay đổi chưa lưu</span>}
          {chuaLuu && (
            <button type="button" onClick={() => { setAllowedColumns(daLuu.allowed); setDefaultVisible(new Set(daLuu.def)); }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">Huỷ thay đổi</button>
          )}
          <button onClick={handleSave} disabled={isSaving || !selectedTableId || !chuaLuu}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400">
            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
            {isSaving ? 'Đang lưu...' : 'Lưu setup'}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-6 lg:grid-cols-2">
        {/* Trái: mọi cột của bảng — tìm + tick để cho phép hiện */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-900">Tất cả cột</h2>
            <span className="text-sm text-slate-400">({allColumns.length})</span>
            <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={chiChuaChon} onChange={e => setChiChuaChon(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />
              Chỉ hiện chưa chọn
            </label>
          </div>
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Tìm cột..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 pl-8 pr-3 text-sm focus:border-slate-500 focus:outline-none" />
            </div>
            <button onClick={handleSelectAllFiltered} disabled={filteredColumns.length === 0}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              Chọn {searchTerm.trim() ? 'kết quả' : 'tất cả'}
            </button>
            <button onClick={handleClearAllFiltered}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-red-50 hover:text-red-600">
              Bỏ chọn {searchTerm.trim() ? 'kết quả' : 'hết'}
            </button>
          </div>
          <div className="min-h-[16rem] flex-1 overflow-y-auto custom-scrollbar">
            {allColumns.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">Bảng này chưa có dữ liệu / cột để chọn (bảng chưa tải xong?)</div>
            ) : filteredColumns.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">Không tìm thấy cột phù hợp.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredColumns.map(col => {
                  const checked = allowedSet.has(col.key);
                  const thu = checked ? allowedColumns.indexOf(col.key) + 1 : 0;
                  return (
                    <li key={col.key}>
                      <label className={`flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-slate-50 ${checked ? 'bg-slate-50/60' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleColumn(col.key)} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />
                        <span className={`flex-1 truncate text-sm ${checked ? 'font-medium text-slate-900' : 'text-slate-600'}`} title={col.key}>{col.label}</span>
                        {checked && <span className="shrink-0 text-xs text-slate-400">#{thu}{defaultVisible.has(col.key) ? ' · hiện' : ''}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Phải: cột được phép — thứ tự hiển thị + bật "mặc định hiện" */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <ListOrdered size={16} className="text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">Cột được phép · thứ tự hiển thị</h2>
            <span className="text-sm text-slate-400">({allowedColumns.length})</span>
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => setDefaultVisible(new Set(allowedColumns))} disabled={!allowedColumns.length}
                className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40">Hiện tất cả</button>
              <button type="button" onClick={() => setDefaultVisible(new Set())} disabled={!defaultVisible.size}
                className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40">Ẩn tất cả</button>
            </span>
          </div>
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            Kéo (⠿) hoặc mũi tên để đổi thứ tự cột · <Eye size={12} className="inline" /> = cột hiện sẵn khi mở bảng (các cột khác người dùng tự bật)
          </p>
          <div className="min-h-[16rem] flex-1 overflow-y-auto custom-scrollbar">
            {allowedColumns.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">Chưa cho phép cột nào. Tick cột ở cột bên trái để thêm.</div>
            ) : (
              <ol className="divide-y divide-slate-100">
                {allowedColumns.map((key, index) => {
                  const isDefault = defaultVisible.has(key);
                  return (
                    <li
                      key={key}
                      draggable
                      onDragStart={handleDragStart(index)}
                      onDragOver={handleDragOver(index)}
                      onDrop={handleDrop(index)}
                      onDragEnd={handleDragEnd}
                      className={`group flex items-center gap-3 px-3 py-2 transition-colors
                        ${dragIndex === index ? 'opacity-40' : ''}
                        ${dragOverIndex === index && dragIndex !== null && dragIndex !== index ? 'border-t-2 border-slate-900 bg-slate-50' : 'hover:bg-slate-50'}`}
                    >
                      <span className="cursor-grab text-slate-300 group-hover:text-slate-500 active:cursor-grabbing" title="Kéo để sắp xếp"><GripVertical size={16} /></span>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{index + 1}</span>
                      <span className={`flex-1 truncate text-sm ${isDefault ? 'font-medium text-slate-900' : 'text-slate-500'}`}>{columnLabelByKey.get(key) || key}</span>
                      <button onClick={() => toggleDefaultVisible(key)} aria-pressed={isDefault}
                        title={isDefault ? 'Đang hiện sẵn — bấm để ẩn mặc định' : 'Bấm để hiện sẵn khi mở bảng'}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition ${isDefault ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400 hover:bg-slate-100'}`}>
                        {isDefault ? <Eye size={13} /> : <EyeOff size={13} />}
                        {isDefault ? 'Hiện sẵn' : 'Ẩn'}
                      </button>
                      <span className="flex shrink-0 items-center opacity-40 transition group-hover:opacity-100">
                        <button onClick={() => moveColumn(index, -1)} disabled={index === 0} title="Lên"
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-25"><ChevronDown size={15} className="rotate-180" /></button>
                        <button onClick={() => moveColumn(index, 1)} disabled={index === allowedColumns.length - 1} title="Xuống"
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-25"><ChevronDown size={15} /></button>
                        <button onClick={() => removeColumn(key)} title="Bỏ cho phép cột này"
                          className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"><X size={15} /></button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default TableColumnSetup;
