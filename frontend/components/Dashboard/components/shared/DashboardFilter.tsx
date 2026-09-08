import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface DashboardFilterProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  singleSelect?: boolean;
}

export const DashboardFilter = ({
  label,
  options,
  selectedValues,
  onChange,
  singleSelect
}: DashboardFilterProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleValue = (val: string) => {
    let newSelected: string[];
    if (singleSelect) {
      newSelected = selectedValues.includes(val) ? [] : [val];
    } else {
      newSelected = selectedValues.includes(val)
        ? selectedValues.filter(v => v !== val)
        : [...selectedValues, val];
    }
    onChange(newSelected);
  };

  const activeCount = selectedValues.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full min-w-[150px] px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm ${activeCount > 0 ? 'border-wood-500 ring-1 ring-wood-200' : 'border-slate-200'}`}
      >
        <div className="flex flex-col items-start truncate mr-2">
          <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{label}</span>
          <span className="truncate font-medium text-slate-700 w-full text-left">
            {activeCount === 0 ? 'Tất cả' : `${activeCount} đã chọn`}
          </span>
        </div>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex flex-col max-h-[300px]">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              placeholder="Tìm kiếm..."
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:border-wood-400 bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
            {filteredOptions.length === 0 ? (
              <div className="p-2 text-xs text-slate-400 text-center">Không tìm thấy</div>
            ) : (
              filteredOptions.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-wood-50 rounded text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(opt)}
                    onChange={() => toggleValue(opt)}
                    className="rounded border-slate-300 text-wood-600 focus:ring-wood-500 w-3.5 h-3.5"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};