import type { ReactNode } from 'react';
import { Play, Pause, Circle, Inbox, PackageCheck, AlertTriangle, Clock, Check } from 'lucide-react';
import { cauCo, thoiLuong, type DongViec } from '../../../services/xuongModel';
import { CHU_PHU, MAU } from './xuongUi';

// ============================================================================
// MỘT DÒNG HẠNG MỤC (quyết định 4A: dòng trong khối, không phải thẻ riêng; mã hex tabular thẳng cột).
// Trạng thái luôn có icon + chữ (6B). Cờ chỉ hiện loại tổ trưởng tự sửa được (2B).
// ============================================================================

export type TrangThaiGui = 'cho' | 'da_gui' | null;

const META = {
  dang_lam: { ten: 'Đang chạy', icon: Play, mau: MAU.chay },
  tam_ngung: { ten: 'Tạm ngưng', icon: Pause, mau: MAU.ngung },
  da_nhan: { ten: 'Chưa bắt đầu', icon: Circle, mau: MAU.cho },
  cho_nhan: { ten: 'Chờ nhận', icon: Inbox, mau: MAU.cho },
  cho_giao: { ten: 'Chờ giao', icon: PackageCheck, mau: MAU.cho },
  xong: { ten: 'Xong', icon: Check, mau: MAU.cho },
} as const;

export function NhanGui({ gui }: { gui: TrangThaiGui }) {
  if (!gui) return null;
  return gui === 'cho'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-base text-slate-600"><Clock size="0.9em" aria-hidden /> Chờ gửi</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-base text-emerald-700"><Check size="0.9em" aria-hidden /> Đã gửi</span>;
}

export default function XuongDong({ r, now, tenCongDoan, gui, children }: {
  r: DongViec;
  now: number;
  /** Tên công đoạn — chỉ truyền khi tổ phụ trách > 1 công đoạn */
  tenCongDoan?: string | null;
  gui: TrangThaiGui;
  /** Nút thao tác của dòng */
  children?: ReactNode;
}) {
  const m = META[r.trangThai] ?? META.da_nhan;
  const Icon = m.icon;
  const coThay = r.co.map(c => cauCo(c, r)).filter((x): x is string => !!x);
  const dvt = r.dvt ? ` ${r.dvt}` : '';
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold tabular-nums text-slate-900">
            {r.hex}
            {tenCongDoan && <span className="ml-2 text-base font-normal text-slate-600">· {tenCongDoan}</span>}
          </p>
          {r.tenHangMuc && <p className="break-words text-base text-slate-800">{r.tenHangMuc}</p>}
          {r.tenCongTrinh && <p className={`break-words ${CHU_PHU}`}>{r.tenCongTrinh}</p>}
        </div>
        <NhanGui gui={gui} />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
        <span className={`inline-flex items-center gap-1 font-medium ${m.mau.chu}`}><Icon size="1em" aria-hidden /> {m.ten}</span>
        {r.trangThai === 'dang_lam' && (
          <span className="text-slate-700">
            {r.soNguoi ? `${r.soNguoi} người · ` : 'chưa chia người · '}
            {r.dangChayTu ? thoiLuong(now - Date.parse(r.dangChayTu)) : ''}
          </span>
        )}
        <span className="tabular-nums text-slate-600">
          {r.slGiaoDen > r.slNhan && `Giao tới ${r.slGiaoDen} · `}Nhận {r.slNhan} · Xong {r.slHoanThanh} · Giao {r.slGiao}{dvt}
        </span>
      </p>
      {coThay.map(c => (
        <p key={c} className={`flex items-center gap-1.5 text-base font-medium ${MAU.loi.chu}`}><AlertTriangle size="1em" aria-hidden /> {c}</p>
      ))}
      {children && <div className="flex gap-3 pt-1">{children}</div>}
    </li>
  );
}
