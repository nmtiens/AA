import React from 'react';
import { Minus, Plus } from 'lucide-react';

// ============================================================================
// Bộ chọn số lượng − [ô] + dùng chung cho cửa sổ chi tiết và giỏ yêu cầu (cùng chiều cao, cùng kiểu).
// Chữ ô 16px: iOS Safari / Zalo không tự phóng to khi chạm.
// ============================================================================

export function SoLuongChon({ id, value, onChange, onGiam, onTang, onBlur, onKeyDown, nhan, coGiam = true, coTang = true, cao = 'h-11' }: {
  id?: string;
  value: string;
  onChange: (s: string) => void;
  onGiam: () => void;
  onTang: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** aria-label cho ô (khi không có <label htmlFor>) */
  nhan?: string;
  coGiam?: boolean;
  coTang?: boolean;
  /** Lớp chiều cao (chi tiết: h-12, giỏ: h-11) */
  cao?: string;
}) {
  const nut = 'inline-flex w-10 shrink-0 items-center justify-center text-stone-700 transition-colors hover:bg-stone-100 focus-visible:bg-stone-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent';
  return (
    <div className={`flex ${cao} shrink-0 items-stretch overflow-hidden rounded-md border border-stone-300 bg-white focus-within:border-stone-900 focus-within:ring-4 focus-within:ring-stone-900/10`}>
      <button type="button" aria-label="Giảm" onClick={onGiam} disabled={!coGiam} className={nut}><Minus size={16} /></button>
      <input id={id} inputMode="decimal" value={value} aria-label={nhan} onChange={e => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown}
        className="w-14 min-w-0 border-x border-stone-200 px-1 text-center text-base tabular-nums text-stone-900 outline-none md:w-16" />
      <button type="button" aria-label="Tăng" onClick={onTang} disabled={!coTang} className={nut}><Plus size={16} /></button>
    </div>
  );
}
