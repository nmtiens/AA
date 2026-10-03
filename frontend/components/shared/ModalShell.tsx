import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Khung modal dùng chung, lo phần hỗ trợ bàn phím / trình đọc màn hình mà các modal tự viết
// trước đây còn thiếu:
// - role="dialog" + aria-modal + aria-labelledby (trình đọc màn hình đọc đúng tiêu đề)
// - Esc để đóng
// - Tab / Shift+Tab chỉ chạy vòng trong modal (không lọt ra trang phía sau)
// - Mở: focus vào ô [data-autofocus] hoặc ô nhập đầu tiên; đóng: trả focus về chỗ cũ
// Phần giao diện (nền mờ, khung) do nơi dùng quyết định qua overlayClassName / panelClassName.

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** id của phần tử tiêu đề bên trong modal */
  labelledBy?: string;
  /** Nhãn cho trình đọc màn hình khi không có tiêu đề hiển thị */
  label?: string;
  /** Lớp CSS của lớp nền (vị trí, z-index, màu nền mờ) */
  overlayClassName: string;
  /** Lớp CSS của khung modal */
  panelClassName: string;
  /** Bấm ra ngoài khung để đóng (mặc định có) */
  closeOnBackdrop?: boolean;
  /**
   * Nhấn Esc để đóng (mặc định có). Tắt khi modal này có thể mở thêm 1 modal KHÁC đè lên
   * mà modal kia tự xử lý Esc — nếu không 1 lần nhấn Esc sẽ đóng cả 2.
   */
  closeOnEsc?: boolean;
}

export function ModalShell({
  open, onClose, children, labelledBy, label, overlayClassName, panelClassName,
  closeOnBackdrop = true, closeOnEsc = true,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const initial =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled])') ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!closeOnEsc) return;
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, closeOnEsc]);

  if (!open) return null;

  return createPortal(
    <div
      className={overlayClassName}
      // mousedown thay vì click: kéo bôi chữ từ trong modal ra ngoài không làm đóng modal
      onMouseDown={closeOnBackdrop ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
