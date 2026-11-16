import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, LogOut, Monitor, Type, Smartphone } from 'lucide-react';
import {
  fetchNotifyPrefs, saveNotifyPrefs, PREF_LABELS, type NotifyPrefs, type PrefKey,
} from '../../services/notificationService';
import { useAuth } from '../../context/AuthContext';
import { pushSupported, isPushOn, enablePush, disablePush } from '../../services/vuongMacMobileApi';
import { BG, CARD, InstallBanner, initials, BottomSheet, btnPrimary, btnSecondary } from './mobileUi';
import NotifyDiagnostics from './NotifyDiagnostics';
import { docBoCuc, luuBoCuc, type BoCuc } from './xuong/cheDoDienThoai';
import { tinhTrangHangDoi, guiLaiNgay } from '../../services/xuongQueue';
import { moTaSuKien } from '../../services/xuongModel';

// ============================================================================
// Màn "Tài khoản": thông tin người dùng, cỡ chữ, thông báo nhắc hạn BOT, cài app,
// mở bản máy tính, đăng xuất.
// ============================================================================

export default function MobileAccount({ sizeIdx, sizeLabels, onSizeChange, onLoggedOut, flash, appXuong = false, tenDuPhong }: {
  sizeIdx: number;
  sizeLabels: string[];
  onSizeChange: (i: number) => void;
  onLoggedOut: () => void;
  flash: (msg: string) => void;
  /** Dùng trong app Xưởng (/xuong): chỉ loại thông báo Xưởng, mời cài app Xưởng (2 app riêng, không dẫn qua lại) */
  appXuong?: boolean;
  /** Phiên app đã hết nhưng còn phiên Xưởng: tên / tài khoản lấy từ phiên Xưởng */
  tenDuPhong?: { ten: string; username: string };
}) {
  const { user, logout } = useAuth();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => { isPushOn().then(setPushOn); }, []);

  // Cài đặt từng loại thông báo (lưu trên máy chủ, áp cho cả hộp thông báo lẫn thông báo đẩy)
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [prefsAvailable, setPrefsAvailable] = useState(true);
  useEffect(() => {
    fetchNotifyPrefs()
      .then(r => { setPrefs(r.prefs); setPrefsAvailable(r.available); })
      .catch(() => setPrefsAvailable(false));
  }, []);
  const togglePref = async (k: PrefKey) => {
    if (!prefs) return;
    const before = prefs;
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next); // đổi ngay trên giao diện, lỗi thì trả lại
    try {
      setPrefs((await saveNotifyPrefs({ [k]: next[k] })).prefs);
    } catch (e: any) {
      setPrefs(before);
      flash(e.message || 'Không lưu được cài đặt');
    }
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushOn) { await disablePush(); setPushOn(false); flash('Đã tắt thông báo'); }
      else { await enablePush(); setPushOn(true); flash('Đã bật thông báo'); }
    } catch (e: any) {
      flash(e.message || 'Không bật được thông báo');
    } finally {
      setPushBusy(false);
    }
  };

  const dangXuat = () => { setHoiDangXuat(null); logout(); onLoggedOut(); };

  // App Xưởng: còn thao tác chưa gửi của mình thì hỏi trước (gửi ngay / vẫn đăng xuất, giữ lại chờ gửi / huỷ)
  // tuChoi: thao tác máy chủ không ghi được sau lần Gửi ngay — hiện để người làm ghi lại, chưa tự đăng xuất
  const [hoiDangXuat, setHoiDangXuat] = useState<{
    so: number; dangGui: boolean; loi: string; tuChoi?: Array<{ id: string; reason: string; hex: string | null; moTa: string }>;
  } | null>(null);
  const doLogout = async () => {
    if (appXuong) {
      let so = 0;
      try { so = (await tinhTrangHangDoi()).soCho; } catch { /* không đọc được hàng đợi: hỏi như thường */ }
      if (so > 0) { setHoiDangXuat({ so, dangGui: false, loi: '' }); return; }
    }
    if (!window.confirm('Đăng xuất khỏi ứng dụng?')) return;
    dangXuat();
  };
  const guiRoiDangXuat = async () => {
    setHoiDangXuat(h => h && { ...h, dangGui: true, loi: '' });
    try {
      const kq = await guiLaiNgay();
      if (kq.conLai === 0 && kq.tuChoi.length) {
        // Hàng đợi đã bỏ các thao tác này: liệt kê để ghi lại, đăng xuất khi người dùng đã xem
        setHoiDangXuat({
          so: 0, dangGui: false, loi: '',
          tuChoi: kq.tuChoi.map(x => ({
            id: x.id, reason: x.reason, hex: x.suKien?.hex ?? null,
            moTa: x.suKien ? moTaSuKien({ loai: x.suKien.loai, soLuong: x.suKien.soLuong }) : '',
          })),
        });
        return;
      }
      if (kq.conLai === 0) {
        flash('Đã gửi hết thao tác');
        dangXuat();
        return;
      }
      const loi = kq.loi === 'mat_quyen' ? 'Tài khoản chưa được cấp quyền Xưởng — báo quản lý.'
        : kq.loi === 'dang_nhap_lai' ? 'Phiên đăng nhập đã hết — chưa gửi được.'
        : 'Chưa gửi được (mất sóng hoặc máy chủ bận).';
      setHoiDangXuat({ so: kq.conLai, dangGui: false, loi });
    } catch {
      setHoiDangXuat(h => h && { ...h, dangGui: false, loi: 'Chưa gửi được.' });
    }
  };

  const name = user?.fullName || user?.username || tenDuPhong?.ten || '';

  return (
    <div className={`min-h-[100dvh] ${BG} space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-[calc(env(safe-area-inset-top)+16px)]`}>
      <h1 className="text-2xl font-semibold text-slate-900">Tài khoản</h1>

      {/* Người dùng */}
      <section className={`${CARD} flex items-center gap-4 p-4`}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-slate-900">{name || '—'}</p>
          <p className="truncate text-base text-slate-500">
            {user?.username ?? tenDuPhong?.username}{user?.department ? ` · ${user.department}` : ''}{user?.role === 'ADMIN' ? ' · Quản trị' : ''}
          </p>
        </div>
      </section>


      {/* Cỡ chữ */}
      <section className={`${CARD} p-4`}>
        <p className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800"><Type size="1em" /> Cỡ chữ</p>
        <div className="grid grid-cols-4 gap-1 rounded-full bg-slate-100 p-1">
          {sizeLabels.map((l, i) => (
            <button
              key={l}
              onClick={() => onSizeChange(i)}
              className={`min-h-11 rounded-full text-base ${sizeIdx === i ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-700'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </section>

      {/* Bố cục (app Xưởng): tự động / luôn điện thoại / luôn máy tính — khi máy bị nhận nhầm */}
      {appXuong && (
        <section className={`${CARD} p-4`}>
          <p className="mb-1 text-base font-semibold text-slate-800">Bố cục màn hình</p>
          <p className="mb-3 text-sm text-slate-500">Tự động là đúng với hầu hết máy. Chọn lại nếu app hiện sai (vd máy tính mà hiện dạng điện thoại).</p>
          <div className="grid grid-cols-3 gap-1 rounded-full bg-slate-100 p-1">
            {([['tu_dong', 'Tự động'], ['dien_thoai', 'Điện thoại'], ['may_tinh', 'Máy tính']] as Array<[BoCuc, string]>).map(([k, l]) => (
              <button key={k} aria-pressed={docBoCuc() === k}
                onClick={() => { luuBoCuc(k); location.reload(); }}
                className={`min-h-11 rounded-full text-base ${docBoCuc() === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Thông báo */}
      <section className={`${CARD} p-4`}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            {pushOn ? <Bell size="1.125em" /> : <BellOff size="1.125em" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-slate-800">Thông báo trên điện thoại</p>
            <p className="text-sm text-slate-500">
              {pushSupported() ? 'Hiện thông báo kể cả khi đang không mở app' : 'Thiết bị / trình duyệt này chưa hỗ trợ thông báo'}
            </p>
          </div>
          {pushSupported() && <Switch on={pushOn} disabled={pushBusy} onClick={togglePush} label="Thông báo trên điện thoại" />}
        </div>
      </section>

      {/* Loại thông báo muốn nhận */}
      <section className={`${CARD} p-4`}>
        <p className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-800"><BellRing size="1em" /> Nhận thông báo khi</p>
        {!prefsAvailable ? (
          <p className="text-sm text-amber-700">Máy chủ chưa bật cài đặt thông báo (cần chạy file SQL). Hiện đang dùng mặc định.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {/* 2 app riêng: app Xưởng chỉ loại Xưởng, app Vướng mắc không có loại Xưởng */}
            {(Object.keys(PREF_LABELS) as PrefKey[]).filter(k => (appXuong ? k === 'xuong' : k !== 'xuong')).map(k => (
              <li key={k} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-base text-slate-800">{PREF_LABELS[k].label}</p>
                  <p className="text-sm text-slate-500">{PREF_LABELS[k].hint}</p>
                </div>
                <Switch on={!!prefs?.[k]} disabled={!prefs} onClick={() => togglePref(k)} label={PREF_LABELS[k].label} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <NotifyDiagnostics appXuong={appXuong} />

      {/* Cài app */}
      <section className={`${CARD} p-4`}>
        <p className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800"><Smartphone size="1em" /> Ứng dụng</p>
        {appXuong
          ? <InstallBanner force tieuDe="Cài app MRA lên điện thoại" moTa="Mở thẳng màn tổ, dùng được khi mất sóng" khoaAn="xuong_install_hidden" />
          : <InstallBanner force />}
      </section>

      {/* Bản máy tính + đăng xuất */}
      <section className={`${CARD} divide-y divide-slate-100`}>
        <a href="/" className="flex items-center gap-3 p-4 text-base text-slate-800 active:bg-slate-50">
          <Monitor size="1.125em" className="text-slate-500" /> Mở bản đầy đủ (máy tính)
        </a>
        <button onClick={doLogout} className="flex w-full items-center gap-3 p-4 text-left text-base text-red-600 active:bg-red-50">
          <LogOut size="1.125em" /> Đăng xuất
        </button>
      </section>

      {hoiDangXuat?.tuChoi && (
        <BottomSheet title="Có thao tác không ghi được" onClose={dangXuat}
          footer={<button className={btnPrimary} onClick={dangXuat}>Đã xem — đăng xuất</button>}>
          <p className="text-base text-slate-800">Đã gửi xong, nhưng máy chủ không ghi <b>{hoiDangXuat.tuChoi.length}</b> thao tác dưới đây. Ghi lại các việc này sau khi đăng nhập.</p>
          <ul className="mt-2 space-y-2">
            {hoiDangXuat.tuChoi.map(x => (
              <li key={x.id} className="rounded-xl bg-red-50 p-3 text-base text-red-700">
                {x.hex ? `${x.hex}` : 'Thao tác'}{x.moTa ? ` (${x.moTa})` : ''}: {x.reason}
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}
      {hoiDangXuat && !hoiDangXuat.tuChoi && (
        <BottomSheet title="Còn thao tác chưa gửi" onClose={() => setHoiDangXuat(null)}
          footer={(
            <div className="space-y-2">
              <button className={btnPrimary} disabled={hoiDangXuat.dangGui} onClick={guiRoiDangXuat}>
                {hoiDangXuat.dangGui ? 'Đang gửi…' : 'Gửi ngay'}
              </button>
              <button className={`${btnSecondary} w-full`} disabled={hoiDangXuat.dangGui} onClick={dangXuat}>
                Vẫn đăng xuất — giữ lại chờ gửi
              </button>
              <button className={`${btnSecondary} w-full`} disabled={hoiDangXuat.dangGui} onClick={() => setHoiDangXuat(null)}>
                Huỷ
              </button>
            </div>
          )}>
          <p className="text-base text-slate-800">
            Máy còn <b>{hoiDangXuat.so}</b> thao tác của bạn chưa gửi lên máy chủ.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Nếu vẫn đăng xuất, thao tác được giữ trên máy và chỉ gửi khi bạn đăng nhập lại trên máy này.
          </p>
          {hoiDangXuat.loi && <p className="mt-2 text-base text-red-600" role="alert">{hoiDangXuat.loi}</p>}
        </BottomSheet>
      )}
    </div>
  );
}

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  // Vùng chạm 48×56 (công tắc nhìn thấy 28×48 ở giữa)
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="-mr-1 flex h-12 w-14 shrink-0 items-center justify-center disabled:opacity-50"
    >
      <span className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
