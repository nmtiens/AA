// src/components/Construction/utils/ModalColumnSetupButton.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Settings2, X, Check, GripVertical, Pin } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  ModalColumnDef,
  loadTableColumnConfig,
  isTableColumnConfigLoaded,
  getColumnConfigForTable,
  isTableConfiguredExplicitly,
  setColumnConfigForTable,
} from './tableColumnConfig';

interface Props {
  modalId: string;
  allColumns: ModalColumnDef[]; // các cột PHỤ có thể ẩn/hiện (không gồm 2 cột cố định đầu)
  fixedLabels?: string[]; // nhãn 2 cột cố định đầu, mặc định ['STT', 'Mã Hex']
  onChange?: () => void;
}

const FIXED_COUNT = 2;

export const ModalColumnSetupButton: React.FC<Props> = ({
  modalId,
  allColumns,
  fixedLabels = ['STT', 'Mã Hex'],
  onChange,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  // Tổng số cột ghim từ trái, GỒM cả 2 cột cố định (mặc định 2 = STT + Hex)
  const [frozenTotal, setFrozenTotal] = useState(FIXED_COUNT);
  const [saving, setSaving] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isTableColumnConfigLoaded()) loadTableColumnConfig();
  }, []);

  useEffect(() => {
    if (!open) return;
    const hasConfig = isTableConfiguredExplicitly(modalId);
    const config = getColumnConfigForTable(modalId);
    const validKeys = new Set(allColumns.map((c) => c.key));
    const nextOrder = hasConfig
      ? config.allowedColumns.filter((k) => validKeys.has(k))
      : allColumns.map((c) => c.key);
    setOrder(nextOrder);
    setFrozenTotal(Math.min(config.frozenColumns ?? FIXED_COUNT, nextOrder.length + FIXED_COUNT));
  }, [open, modalId, allColumns]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current && !popRef.current.contains(t) && btnRef.current && !btnRef.current.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (user?.role !== 'ADMIN') return null;

  const byKey = new Map(allColumns.map((c) => [c.key, c]));
  const hiddenCols = allColumns.filter((c) => !order.includes(c.key));

  // Ẩn 1 cột nằm trong vùng ghim -> giảm frozenTotal 1 để không ghim lan sang cột kế tiếp.
  const toggle = (key: string) => {
    const idx = order.indexOf(key);
    if (idx === -1) {
      setOrder([...order, key]);
      return;
    }
    if (idx + FIXED_COUNT < frozenTotal) setFrozenTotal(frozenTotal - 1);
    setOrder(order.filter((k) => k !== key));
  };

  // globalIndex tính cả 2 cột cố định: STT = 0, Hex = 1, cột phụ đầu tiên = 2...
  // Bấm lại đúng cột cuối vùng ghim -> bỏ ghim hết (kể cả STT/Hex).
  const togglePin = (globalIndex: number) =>
    setFrozenTotal((prev) => (prev === globalIndex + 1 ? 0 : globalIndex + 1));

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
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  const handleSave = async () => {
    setSaving(true);
    const ok = await setColumnConfigForTable(modalId, {
      allowedColumns: order,
      defaultVisibleColumns: order,
      frozenColumns: Math.min(frozenTotal, order.length + FIXED_COUNT),
    });
    setSaving(false);
    if (ok) {
      showToast('Đã lưu setup cột', 'success');
      setOpen(false);
      onChange?.();
    } else {
      showToast('Lưu thất bại', 'error');
    }
  };

  const PinButton = ({ globalIndex }: { globalIndex: number }) => {
    const isFrozen = globalIndex < frozenTotal;
    return (
      <button
        type="button"
        onClick={() => togglePin(globalIndex)}
        title={
          frozenTotal === globalIndex + 1
            ? 'Bấm để bỏ ghim'
            : isFrozen
              ? 'Đang được ghim — bấm để ghim tới cột này thôi'
              : 'Ghim (freeze) các cột tới cột này'
        }
        className={`p-0.5 transition-colors ${isFrozen ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}
      >
        <Pin size={13} className={isFrozen ? 'fill-emerald-600' : ''} />
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Setup cột hiển thị (chỉ Admin)"
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
      >
        <Settings2 size={15} />
        <span>Setup cột</span>
      </button>

      {open && (
        <div ref={popRef} className="absolute right-0 z-[10010] mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-bold text-slate-600">Chọn & sắp xếp cột hiển thị</span>
            <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {/* 2 cột cố định đầu: không kéo/ẩn được, chỉ ghim/bỏ ghim */}
            {fixedLabels.map((label, i) => (
              <div
                key={`fixed-${i}`}
                className={`flex items-center gap-2 rounded px-2 py-1.5 ${i < frozenTotal ? 'bg-emerald-50/50' : ''}`}
              >
                <span className="w-[14px]" />
                <span className="flex-1 truncate text-xs font-semibold text-slate-600">{label}</span>
                <PinButton globalIndex={i} />
                <span className="w-[21px]" />
              </div>
            ))}
            <div className="my-1 border-t border-slate-100" />

            {order.map((key, idx) => {
              const isFrozen = idx + FIXED_COUNT < frozenTotal;
              return (
                <div
                  key={key}
                  draggable
                  onDragStart={handleDragStart(idx)}
                  onDragOver={handleDragOver(idx)}
                  onDrop={handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 transition-colors
                    ${dragIndex === idx ? 'opacity-40' : ''}
                    ${dragOverIndex === idx && dragIndex !== null && dragIndex !== idx ? 'bg-emerald-50 border-t-2 border-emerald-400' : isFrozen ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-slate-50'}
                  `}
                >
                  <span className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing" title="Kéo để sắp xếp">
                    <GripVertical size={14} />
                  </span>
                  <span className="flex-1 truncate text-xs text-slate-700">{byKey.get(key)?.label || key}</span>
                  <PinButton globalIndex={idx + FIXED_COUNT} />
                  <button onClick={() => toggle(key)} className="p-0.5 text-red-400 hover:text-red-600" title="Ẩn cột này"><X size={13} /></button>
                </div>
              );
            })}
            {hiddenCols.length > 0 && (
              <>
                <div className="mt-2 border-t border-slate-100 pt-2 text-[0.6875rem] font-semibold text-slate-400">Cột đang ẩn</div>
                {hiddenCols.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50">
                    <input type="checkbox" checked={false} onChange={() => toggle(c.key)} className="h-3.5 w-3.5" />
                    <span className="text-xs text-slate-500">{c.label}</span>
                  </label>
                ))}
              </>
            )}
          </div>
          <div className="space-y-1.5 border-t border-slate-100 p-2">
            <p className="px-1 text-[0.6875rem] text-slate-400">
              {frozenTotal > 0 ? `Đang ghim ${frozenTotal} cột đầu tiên.` : 'Không ghim cột nào.'}
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check size={14} /> {saving ? 'Đang lưu...' : 'Lưu setup'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};