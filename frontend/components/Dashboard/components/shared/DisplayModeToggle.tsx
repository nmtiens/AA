import React from 'react';

interface DisplayModeToggleProps {
  current: 'COUNT' | 'SUM';
  onChange: (m: 'COUNT' | 'SUM') => void;
  light?: boolean;
}

export const DisplayModeToggle = ({
  current,
  onChange,
  light = false
}: DisplayModeToggleProps) => (
  <div className="flex flex-col items-end">
    <span className={`text-[10px] font-bold uppercase ${light ? 'text-white/80' : 'text-slate-500'}`}>
      Chế độ hiển thị:
    </span>
    <div className={`flex items-center p-0.5 rounded border shadow-sm mt-0.5 ${light ? 'bg-white/10 border-white/30' : 'bg-white border-slate-200'}`}>
      <button
        onClick={() => onChange('COUNT')}
        className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-all ${
          current === 'COUNT'
            ? (light ? 'bg-white text-slate-800 shadow-sm' : 'bg-indigo-100 text-indigo-700 shadow-sm')
            : (light ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-slate-600')
        }`}
      >
        Số lượng
      </button>
      <div className={`w-px h-2.5 mx-0.5 ${light ? 'bg-white/30' : 'bg-slate-200'}`}></div>
      <button
        onClick={() => onChange('SUM')}
        className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-all ${
          current === 'SUM'
            ? (light ? 'bg-white text-slate-800 shadow-sm' : 'bg-indigo-100 text-indigo-700 shadow-sm')
            : (light ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-slate-600')
        }`}
      >
        Giá trị
      </button>
    </div>
  </div>
);