import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface FilterOption { code: string; name: string; }

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  allLabel: string;
  icon?: React.ReactNode;
  className?: string;
  /** Bề rộng tối đa của nút hiển thị + panel dropdown (tailwind class, ví dụ 'max-w-[220px]') */
  widthClass?: string;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  allLabel,
  icon,
  className = '',
  widthClass = 'max-w-[220px]',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = value
    ? (options.find(o => o.code === value)?.name ?? value)
    : allLabel;

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Tự động focus ô tìm kiếm khi mở dropdown
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // bỏ dấu tiếng Việt để tìm không dấu cũng ra kết quả

  const filteredOptions = query.trim()
    ? options.filter(o => normalize(o.name).includes(normalize(query.trim())))
    : options;

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={`relative shrink-0 ${widthClass} ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-2 py-1 border border-slate-300 rounded-md outline-none bg-white text-slate-700 text-left"
      >
        {icon}
        <span className="flex-1 truncate">{selectedLabel}</span>
        <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full min-w-[260px] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-100">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm kiếm..."
              className="flex-1 outline-none text-sm text-slate-700 placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-300 hover:text-slate-500 shrink-0"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                !value ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-600'
              }`}
            >
              {allLabel}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-400 text-center">Không tìm thấy kết quả</div>
            ) : (
              filteredOptions.map(opt => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => handleSelect(opt.code)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                    value === opt.code ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700'
                  }`}
                >
                  {opt.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
