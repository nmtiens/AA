import { useEffect, useState } from 'react';
import { fetchHandlerNames } from '../../services/vuongMacService';

// Bỏ dấu tiếng Việt + viết thường để tìm tên không cần gõ dấu ("ngoc yen" khớp "NGUYỄN NGỌC YẾN")
const foldVi = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/**
 * Ô "Người xử lý": gõ để lọc trong danh sách họ tên tài khoản (users.full_name), bấm để chọn.
 * Vẫn cho gõ tên ngoài danh sách (người xử lý không có tài khoản).
 * Không đặt trong <label>: bấm vào gợi ý không được làm focus nhảy về ô nhập.
 */
export default function HandlerPicker({ value, onChange, inputClassName, optionClassName = 'text-base' }: {
  value: string;
  onChange: (v: string) => void;
  inputClassName: string;
  /** Cỡ chữ dòng gợi ý */
  optionClassName?: string;
}) {
  const [names, setNames] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchHandlerNames().then(n => alive && setNames(n)).catch(() => alive && setLoadErr(true));
    return () => { alive = false; };
  }, []);

  const q = foldVi(value.trim());
  const matches = (q ? names.filter(n => foldVi(n).includes(q)) : names).slice(0, 30);
  const exact = names.some(n => n === value.trim());

  return (
    <div className="relative">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        // Trễ 1 nhịp để kịp nhận lần bấm vào gợi ý trước khi danh sách đóng
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        maxLength={200}
        autoComplete="off"
        placeholder={names.length ? 'Gõ để tìm theo họ tên...' : 'Nhập tên người xử lý...'}
        className={`${inputClassName} ${value ? 'pr-11' : ''}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Xóa người xử lý"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
        >
          ✕
        </button>
      )}
      {open && matches.length > 0 && !(exact && matches.length === 1) && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map(n => (
            <li key={n}>
              <button
                type="button"
                // onMouseDown + preventDefault: chọn được trước khi ô nhập mất focus
                onMouseDown={e => { e.preventDefault(); onChange(n); setOpen(false); }}
                className={`block w-full px-4 py-2.5 text-left active:bg-slate-100 ${optionClassName} ${n === value ? 'font-medium text-slate-900' : 'text-slate-700'}`}
              >
                👤 {n}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loadErr && <p className="mt-1 text-sm text-slate-400">Không tải được danh sách tài khoản — có thể nhập tên trực tiếp.</p>}
    </div>
  );
}
