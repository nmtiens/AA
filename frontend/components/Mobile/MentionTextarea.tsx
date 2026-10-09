import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchHandlerNames } from '../../services/vuongMacService';

// Bỏ dấu + viết thường để gõ "@ngoc" vẫn ra "NGUYỄN NGỌC YẾN"
const foldVi = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/**
 * Ô nhập nhiều dòng có TAG TÊN: gõ "@" rồi vài chữ của họ tên -> hiện danh sách tài khoản,
 * chọn 1 người -> chèn "@Họ Tên ". Máy chủ tự nhận ra "@Họ Tên" và gửi thông báo cho người đó.
 */
export default function MentionTextarea({ value, onChange, className, rows = 3, maxLength, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [names, setNames] = useState<string[]>([]);
  // Đoạn "@abc" đang gõ ngay trước con trỏ: vị trí bắt đầu + chữ đã gõ
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchHandlerNames().then(n => alive && setNames(n)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) return setQuery(null);
    const prev = before[at - 1];
    const typed = before.slice(at + 1);
    // "@" phải đứng đầu dòng / sau khoảng trắng; đoạn gõ không xuống dòng và không quá dài
    if ((prev && !/\s/.test(prev)) || typed.includes('\n') || typed.length > 30) return setQuery(null);
    setQuery({ start: at, text: typed });
  };

  const q = query ? foldVi(query.text.trim()) : '';
  const matches = query ? names.filter(n => !q || foldVi(n).includes(q)).slice(0, 6) : [];

  // Vị trí danh sách gợi ý: dùng position fixed theo toạ độ ô nhập để không bị khung cuộn / cửa sổ cắt mất
  // (ô chat nằm sát đáy khung — trước danh sách mở xuống dưới nên bị cắt, trông như không tag được). Gần đáy
  // màn hình thì mở lên trên.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  // Đang gõ "@..." mà không có tên khớp: vẫn mở để báo, tránh trông như không tag được
  const open = !!query && names.length > 0;
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      setPos(below < 260 && r.top > below
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 }
        : { left: r.left, width: r.width, top: r.bottom + 4 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, value]);

  const pick = (name: string) => {
    if (!query) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, query.start)}@${name} ${value.slice(caret)}`;
    onChange(maxLength ? next.slice(0, maxLength) : next);
    setQuery(null);
    const pos = query.start + name.length + 2;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos); });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onClick={e => detect(value, (e.target as HTMLTextAreaElement).selectionStart)}
        onKeyUp={e => { if (e.key.startsWith('Arrow')) detect(value, (e.target as HTMLTextAreaElement).selectionStart); }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className={className}
      />
      {open && pos && createPortal(
        <ul
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className="z-[10050] max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <li className="px-4 pb-1 pt-1.5 text-sm text-slate-400">Tag tên — người được tag sẽ nhận thông báo</li>
          {matches.length === 0 && (
            <li className="px-4 py-2 text-sm text-slate-500">Không có tên khớp "{query?.text}" — gõ một phần họ tên, không cần dấu</li>
          )}
          {matches.map(n => (
            <li key={n}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); pick(n); }}
                className="block w-full px-4 py-2.5 text-left text-base text-slate-800 active:bg-slate-100"
              >
                @{n}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
