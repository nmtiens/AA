import { useState, type ReactNode } from 'react';
import { Stethoscope } from 'lucide-react';
import { fetchNotifyDiagnose, sendTestNotification, type NotifyDiagnose } from '../../services/notificationService';
import { pushSupported, isPushOn } from '../../services/vuongMacMobileApi';
import { CARD, fmtAgo } from './mobileUi';

// ============================================================================
// "Kiểm tra thông báo": chỉ ra khâu nào đang làm thông báo không tới (máy chủ / thiết bị / cài đặt)
// và cho gửi thử 1 thông báo cho chính mình.
// ============================================================================

interface Check { ok: boolean | null; label: string; fix?: ReactNode }

export default function NotifyDiagnostics() {
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [info, setInfo] = useState<NotifyDiagnose | null>(null);
  const [testMsg, setTestMsg] = useState('');
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true); setError(''); setTestMsg('');
    try {
      const d = await fetchNotifyDiagnose();
      setInfo(d);
      const supported = pushSupported();
      const perm = supported ? Notification.permission : 'unsupported';
      const subscribed = supported ? await isPushOn() : false;
      const hasKey = !!import.meta.env.VITE_VAPID_PUBLIC_KEY;
      setChecks([
        { ok: d.server.inboxTable, label: 'Máy chủ: đã có bảng hộp thông báo',
          fix: 'Chạy file backend/sql/2026-10-03_notifications.sql trên database.' },
        { ok: d.server.prefsColumn, label: 'Máy chủ: đã có cột cài đặt thông báo',
          fix: 'Chạy file backend/sql/2026-10-03_notifications.sql trên database.' },
        { ok: d.server.vapid, label: 'Máy chủ: có khoá gửi thông báo đẩy (VAPID)',
          fix: 'Thêm VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT vào Environment Variables trên Vercel rồi Redeploy.' },
        { ok: hasKey, label: 'App: có khoá công khai VITE_VAPID_PUBLIC_KEY',
          fix: 'Thêm VITE_VAPID_PUBLIC_KEY (giống VAPID_PUBLIC_KEY) vào Vercel rồi Redeploy — biến này được gắn vào app lúc build.' },
        { ok: d.server.cronSecret, label: 'Máy chủ: có CRON_SECRET (nhắc hạn BOT)',
          fix: 'Thêm CRON_SECRET trên Vercel và đặt lịch gọi /api/cron/vuong-mac-bot mỗi 5 phút.' },
        { ok: d.system.lastBotScan ? true : null,
          label: d.system.lastBotScan ? `Nhắc hạn BOT: lần gửi gần nhất ${fmtAgo(d.system.lastBotScan)}` : 'Nhắc hạn BOT: chưa thấy lần gửi nào',
          fix: d.system.lastBotScan ? undefined : 'Nếu đã có vướng mắc sắp/quá hạn mà vẫn chưa có: kiểm tra lịch gọi cron /api/cron/vuong-mac-bot.' },
        { ok: supported, label: 'Thiết bị: trình duyệt hỗ trợ thông báo',
          fix: 'iPhone: phải "Thêm vào Màn hình chính" rồi mở app từ đó (iOS 16.4+). Không mở trong Zalo/Messenger.' },
        { ok: perm === 'granted', label: `Thiết bị: đã cho phép thông báo (${perm === 'granted' ? 'đã cho phép' : perm === 'denied' ? 'đã CHẶN' : 'chưa hỏi'})`,
          fix: perm === 'denied' ? 'Vào Cài đặt của trình duyệt / điện thoại, cho phép thông báo cho trang này.' : 'Bật công tắc "Thông báo trên điện thoại" ở trên.' },
        { ok: subscribed && d.me.devices > 0, label: `Thiết bị: đã đăng ký nhận (${d.me.devices} thiết bị của bạn trên máy chủ)`,
          fix: 'Tắt rồi bật lại công tắc "Thông báo trên điện thoại" ở trên.' },
        { ok: !!d.me.fullName, label: `Tài khoản có họ tên: ${d.me.fullName || '—'}`,
          fix: 'Nhờ quản trị điền họ tên (full_name) — tag tên và "người xử lý" dựa vào họ tên này.' },
      ]);
    } catch (e: any) {
      setError(e.message || 'Không kiểm tra được');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true); setTestMsg(''); setError('');
    try {
      const r = await sendTestNotification();
      const parts = [
        r.savedToInbox ? '✓ Đã lưu vào hộp thông báo (xem ở chuông)' : '✗ Chưa lưu được vào hộp thông báo (chưa chạy SQL)',
        !r.pushEnabled ? '✗ Máy chủ chưa bật thông báo đẩy (thiếu VAPID)'
          : r.devices === 0 ? '✗ Bạn chưa có thiết bị nào bật thông báo đẩy'
          : `✓ Đã đẩy tới ${r.sent}/${r.devices} thiết bị${r.failed ? ` (${r.failed} lỗi)` : ''}`,
      ];
      setTestMsg(parts.join('\n'));
    } catch (e: any) {
      setError(e.message || 'Không gửi thử được');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${CARD} p-4`}>
      <p className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-800"><Stethoscope size="1em" /> Kiểm tra thông báo</p>
      <p className="mb-3 text-sm text-slate-500">
        Không nhận được thông báo? Bấm kiểm tra để biết khâu nào chưa sẵn sàng. Lưu ý: hệ thống không báo cho
        chính người thao tác — tự tag tên mình sẽ không có thông báo, hãy nhờ người khác tag để thử.
      </p>
      <div className="flex gap-2">
        <button onClick={run} disabled={busy} className="flex-1 rounded-full border border-slate-300 py-2.5 text-base text-slate-700 active:bg-slate-100 disabled:opacity-50">
          {busy && !testMsg ? 'Đang kiểm tra...' : 'Kiểm tra'}
        </button>
        <button onClick={test} disabled={busy} className="flex-1 rounded-full bg-slate-900 py-2.5 text-base font-medium text-white active:opacity-80 disabled:opacity-50">
          Gửi thử cho tôi
        </button>
      </div>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-base text-red-700">⚠️ {error}</p>}
      {testMsg && <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-base text-slate-700">{testMsg}</p>}

      {checks && (
        <ul className="mt-3 space-y-2">
          {checks.map(c => (
            <li key={c.label} className="text-base">
              <p className={c.ok ? 'text-emerald-700' : c.ok === null ? 'text-slate-500' : 'text-red-700'}>
                {c.ok ? '✓' : c.ok === null ? '•' : '✗'} {c.label}
              </p>
              {!c.ok && c.fix && <p className="ml-4 text-sm text-slate-500">{c.fix}</p>}
            </li>
          ))}
          {info?.system.notifications7d !== null && info && (
            <li className="text-sm text-slate-400">Toàn hệ thống đã tạo {info.system.notifications7d} thông báo trong 7 ngày qua.</li>
          )}
        </ul>
      )}
    </section>
  );
}
