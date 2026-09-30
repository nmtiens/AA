import { useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react'; // npm i qrcode.react
import { X, Copy, Check, Smartphone } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Trang mobile nằm ở /m/ (khớp start_url trong manifest và sw.js)
const mobileUrl = () => `${window.location.origin}/m/`;

export const InstallMobileAppModal = ({ isOpen, onClose }: Props) => {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const url = mobileUrl();
  const isLocal = /^(localhost|127\.|192\.168\.|10\.)/.test(window.location.hostname);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* trình duyệt chặn clipboard: người dùng tự chép link */ }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Smartphone size={18} className="text-red-700" />
            <div>
              <h3 className="text-base font-semibold text-slate-800">Cài ứng dụng Vướng mắc lên điện thoại</h3>
              <p className="mt-0.5 text-xs text-slate-500">Xem vướng mắc, tra cứu hex và nhận thông báo nhắc hạn BOT</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-6 p-5 sm:grid-cols-[200px_1fr]">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <QRCodeSVG value={url} size={168} />
            </div>
            <p className="text-center text-xs text-slate-500">Quét bằng camera điện thoại</p>
            <button
              type="button"
              onClick={copy}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {copied ? 'Đã sao chép' : 'Sao chép liên kết'}
            </button>
          </div>

          <div className="space-y-4 text-sm text-slate-700">
            {isLocal && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                Bạn đang mở bằng địa chỉ nội bộ ({window.location.host}). Điện thoại sẽ không truy cập được mã QR này.
                Hãy mở trang từ tên miền chính thức rồi quét lại.
              </p>
            )}

            <div>
              <p className="font-semibold text-slate-800">Android (Chrome)</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-slate-600">
                <li>Quét mã QR, đăng nhập.</li>
                <li>Bấm menu ⋮ ở góc trên, chọn "Cài đặt ứng dụng" (hoặc "Thêm vào màn hình chính").</li>
                <li>Mở ứng dụng từ màn hình chính, bấm biểu tượng 🔔 để bật thông báo.</li>
              </ol>
            </div>

            <div>
              <p className="font-semibold text-slate-800">iPhone (Safari)</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-slate-600">
                <li>Mở liên kết bằng Safari (không dùng Chrome), đăng nhập.</li>
                <li>Bấm nút Chia sẻ, chọn "Thêm vào Màn hình chính".</li>
                <li>Mở ứng dụng từ màn hình chính rồi bấm 🔔. iPhone chỉ nhận thông báo khi đã thêm vào màn hình chính (iOS 16.4 trở lên).</li>
              </ol>
            </div>

            <p className="break-all rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">{url}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};