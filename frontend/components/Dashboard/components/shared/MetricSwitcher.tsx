import React from 'react';
import { Hash, Calculator } from 'lucide-react';
import { MetricType } from '../../types';

interface MetricSwitcherProps {
  current: MetricType;
  onChange: (m: MetricType) => void;
}

export const MetricSwitcher = ({ current, onChange }: MetricSwitcherProps) => (
  <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
    <button
      onClick={() => onChange('COUNT_HEX')}
      className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${current === 'COUNT_HEX' ? 'bg-white text-wood-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      title="Đếm số lượng HEX"
    >
      <Hash size={12} /> Số lượng hạng mục
    </button>
    <div className="w-px h-3 bg-slate-300 mx-1"></div>
    <button
      onClick={() => onChange('SUM_GT_CON_LAI')}
      className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${current === 'SUM_GT_CON_LAI' ? 'bg-white text-wood-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      title="Tổng Giá Trị Còn Lại"
    >
      <Calculator size={12} /> Tổng GT còn lại (theo PTHSP)
    </button>
    <div className="w-px h-3 bg-slate-300 mx-1"></div>
    <button
      onClick={() => onChange('SUM_GT_DON_HANG')}
      className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${current === 'SUM_GT_DON_HANG' ? 'bg-white text-wood-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      title="Tổng Giá Trị Đơn hàng còn lại"
    >
      <Calculator size={12} /> Tổng GT Đơn hàng còn lại
    </button>
  </div>
);