import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus, Pencil, X, Check, AlertTriangle, Trash2, RefreshCw, Search, QrCode } from 'lucide-react';
import InTheQr from './InTheQr';
import {
  xuongSetupApi, type SetupXuong, type ToSetup, type NguoiDung, type CongDoanSetup, type LichCaSetup,
} from '../../services/xuongSetupApi';
import { TEN_CA, LOAI_CA_TANG_CA, tenCo, moTaSuKien, hhmm, gioVN, type LoaiCa } from '../../services/xuongModel';
import { INPUT, BTN, BTN_CHINH, KHUNG, TH, TD } from './xuongDesktopUi';
import { authXuong } from '../../services/xuongClock';
import { tramQuanLyApi, type TramDs } from '../../services/xuongTramApi';
import type { CheDoCham } from '../../services/xuongSetupApi';

const TEN_CHE_DO: Record<CheDoCham, string> = { cu: 'Bấm tay (cũ)', song_song: 'Song song', tram: 'Trạm quét' };
const MAU_CHE_DO: Record<CheDoCham, string> = {
  cu: 'border-slate-200 bg-slate-50 text-slate-700', song_song: 'border-sky-200 bg-sky-50 text-sky-800', tram: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};
const ngayVN = (ngay: string) => ngay.split('-').reverse().slice(0, 2).join('/');

/**
 * Chế độ chấm của tổ (trạm quét — docs/designs/xuong-tram-quet.md): Bấm tay (cũ) · Song song (tổ trưởng vẫn bấm, trạm
 * chỉ để so khớp) · Trạm quét (công nhân quét thẻ + phiếu thay Bắt đầu / Tạm ngưng / Chia người / điểm danh tay).
 * Đổi có hiệu lực từ ngày ca sau; "Áp dụng ngay hôm nay" để bắt đầu thử từ đầu ca. Kèm danh sách trạm + thu hồi.
 */
function CheDoTo({ to, bao, xong }: { to: ToSetup; bao: Bao; xong: () => void }) {
  const [cheDo, setCheDo] = useState<CheDoCham>(to.cheDoSau?.cheDo ?? to.cheDo ?? 'cu');
  const [homNay, setHomNay] = useState(false);
  const [dang, setDang] = useState(false);
  const [tram, setTram] = useState<TramDs[] | null>(null);
  const api = tramQuanLyApi(authXuong);
  useEffect(() => { void api.ds(to.id).then(r => setTram(r.ok ? r.data.tram : [])); }, [to.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const luu = async () => {
    setDang(true);
    const r = await api.doiCheDo(to.id, cheDo, homNay);
    setDang(false);
    if (!r.ok) { bao(false, r.message); return; }
    const canhBao = r.data.dangLamBamTay.length ? ` — ${r.data.dangLamBamTay.length} hạng mục đang chạy theo bấm tay sẽ tạm ngưng, chạy lại khi có người quét` : '';
    bao(true, `${to.ten}: ${TEN_CHE_DO[cheDo]} từ ${ngayVN(r.data.tuNgay)}${canhBao}`);
    xong();
  };
  const thuHoi = async (id: string) => {
    if (!window.confirm('Thu hồi trạm này? Máy trạm sẽ phải đăng ký lại.')) return;
    const r = await api.thuHoi(id);
    if (!r.ok) { bao(false, r.message); return; }
    setTram(ds => (ds ?? []).map(x => (x.deviceId === id ? { ...x, thuHoi: true } : x)));
  };
  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <p className="text-base font-semibold text-slate-900">Chấm công · trạm quét</p>
      <div className="flex flex-wrap gap-2">
        {(['cu', 'song_song', 'tram'] as const).map(c => (
          <label key={c} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${cheDo === c ? MAU_CHE_DO[c] + ' font-medium' : 'border-slate-200 text-slate-700'}`}>
            <input type="radio" name={`che-do-${to.id}`} checked={cheDo === c} onChange={() => setCheDo(c)} /> {TEN_CHE_DO[c]}
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-600">
        {cheDo === 'cu' && 'Tổ trưởng bấm Bắt đầu / Tạm ngưng / Chia người và điểm danh tay như hiện nay.'}
        {cheDo === 'song_song' && 'Tổ trưởng vẫn bấm như cũ (số chính thức); công nhân quét ở trạm để so khớp trong Báo cáo.'}
        {cheDo === 'tram' && 'Công nhân tự quét thẻ đầu ca; một người quét phiếu + thẻ khai cả nhóm vào hàng. App tổ trưởng ẩn Bắt đầu / Tạm ngưng / Chia người / điểm danh.'}
      </p>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={homNay} onChange={e => setHomNay(e.target.checked)} /> Áp dụng ngay hôm nay (mặc định: từ ngày ca mai)
      </label>
      <button type="button" className={BTN_CHINH} disabled={dang || (cheDo === (to.cheDo ?? 'cu') && !to.cheDoSau && !homNay)} onClick={() => void luu()}>
        <Check size={14} /> Lưu chế độ
      </button>
      <div className="border-t border-slate-100 pt-2 text-sm">
        <p className="font-medium text-slate-700">Trạm của tổ {tram === null ? '…' : `(${tram.filter(x => !x.thuHoi).length})`}
          <span className="ml-2 font-normal text-slate-500">Đăng ký: mở <b>/xuong/tram</b> trên máy đặt ở tổ</span></p>
        {tram?.map(x => (
          <div key={x.deviceId} className={`mt-1 flex items-center gap-2 ${x.thuHoi ? 'text-slate-400' : 'text-slate-700'}`}>
            <span>{x.ten || 'Trạm'} · {x.nguoiDangKy ?? ''} · lần cuối {new Date(x.lanCuoi).toLocaleString('vi-VN')}</span>
            {x.thuHoi ? <span className="text-xs">(đã thu hồi)</span>
              : <button type="button" className={`${BTN} ml-auto`} onClick={() => void thuHoi(x.deviceId)}><Trash2 size={13} /> Thu hồi</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// CÁC MỤC CON CỦA THẺ XƯỞNG (Setup dữ liệu): tổ, công đoạn, lịch ca, quản lý xưởng, cần xem.
// ============================================================================

type Bao = (ok: boolean, msg: string) => void;
interface MucProps { d: SetupXuong; bao: Bao; tai: () => Promise<void> | void }

// ---------------------------------------------------------------------------
// Chọn tài khoản (tìm theo tên / tài khoản / mã NV)
// ---------------------------------------------------------------------------
function ChonNguoi({ chon, onChon, placeholder = 'Tìm tên, tài khoản hoặc mã NV' }: {
  chon: NguoiDung | null; onChon: (n: NguoiDung | null) => void; placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [ds, setDs] = useState<NguoiDung[]>([]);
  const [mo, setMo] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setDs([]); return; }
    const t = setTimeout(() => xuongSetupApi.timNguoi(q.trim()).then(r => setDs(r.ok ? r.data.ketQua : [])), 300);
    return () => clearTimeout(t);
  }, [q]);
  if (chon && !mo) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-800">{chon.ten}{chon.msnv ? ` · ${chon.msnv}` : ''}</span>
        <button type="button" className={BTN} onClick={() => { setMo(true); setQ(''); }}>Đổi</button>
        <button type="button" className={BTN} onClick={() => onChon(null)}>Bỏ</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
      <input className={`${INPUT} pl-8`} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label="Tìm tài khoản" autoFocus={mo} />
      {ds.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {ds.map(n => (
            <li key={n.id}>
              <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => { onChon(n); setMo(false); setQ(''); setDs([]); }}>
                <span>{n.ten} <span className="text-slate-500">· {n.username}{n.msnv ? ` · ${n.msnv}` : ''}</span></span>
                {!n.coQuyenXuong && <span className="text-xs text-amber-700">chưa có quyền Xưởng</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tổ & tổ trưởng
// ---------------------------------------------------------------------------
function SuaTo({ d, to, bao, xong, huy }: { d: SetupXuong; to: ToSetup | null; bao: Bao; xong: () => void; huy: () => void }) {
  const [ten, setTen] = useState(to?.ten ?? '');
  const [tt, setTt] = useState<NguoiDung | null>(to?.toTruong ?? null);
  const [cds, setCds] = useState<Set<string>>(new Set(to?.congDoan ?? []));
  const [tv, setTv] = useState((to?.thanhVien ?? []).join('\n'));
  const [active, setActive] = useState(to?.active ?? true);
  const [capQuyen, setCapQuyen] = useState(true);
  const [luu, setLuu] = useState(false);
  const canCap = !!tt && !tt.coQuyenXuong;
  const submit = async () => {
    setLuu(true);
    const r = await xuongSetupApi.luuTo({
      id: to?.id, xuong: d.xuong!, ten: ten.trim(), toTruongUserId: tt?.id ?? null, congDoan: [...cds],
      thanhVien: tv.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean), active,
      capQuyen: d.admin && canCap && capQuyen ? true : undefined,
    });
    setLuu(false);
    if (r.ok) { bao(true, to ? 'Đã lưu tổ' : 'Đã thêm tổ'); xong(); } else bao(false, r.message);
  };
  return (
    <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-4 rlg:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">Tên tổ
          <input className={`${INPUT} mt-1`} value={ten} onChange={e => setTen(e.target.value)} />
        </label>
        <div className="text-sm font-medium text-slate-700">Tổ trưởng
          <div className="mt-1"><ChonNguoi chon={tt} onChon={setTt} /></div>
          {tt && !tt.msnv && <p className="mt-1 text-xs text-amber-700">Tài khoản chưa có mã nhân viên — vẫn gán được, nhưng không khớp danh sách thành viên.</p>}
          {canCap && (d.admin
            ? <label className="mt-2 flex items-center gap-2 text-xs font-normal text-slate-700">
                <input type="checkbox" checked={capQuyen} onChange={e => setCapQuyen(e.target.checked)} /> Cấp luôn quyền "Tổ trưởng — ghi thao tác ở xưởng" cho tài khoản này
              </label>
            : <p className="mt-1 text-xs text-amber-700">Tài khoản chưa có quyền Xưởng — nhờ admin cấp ở Quản lý người dùng.</p>)}
        </div>
      </div>
      <div className="text-sm font-medium text-slate-700">Công đoạn phụ trách
        <div className="mt-1 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
          {d.congDoan.filter(c => c.active || cds.has(c.id)).map(c => (
            <label key={c.id} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-normal ${cds.has(c.id) ? 'border-slate-900 bg-white text-slate-900' : 'border-slate-200 text-slate-600'}`}>
              <input type="checkbox" checked={cds.has(c.id)} onChange={() => setCds(s => { const t = new Set(s); if (t.has(c.id)) t.delete(c.id); else t.add(c.id); return t; })} />
              {c.ten} <span className="text-slate-400">· {c.cdTachMa ?? ''}</span>
            </label>
          ))}
        </div>
      </div>
      {to && to.cheDo !== undefined && <CheDoTo to={to} bao={bao} xong={xong} />}
      <label className="block text-sm font-medium text-slate-700">Thành viên (mã NV, mỗi dòng một mã — người có tài khoản trùng mã NV được ghi cho tổ)
        <textarea className={`${INPUT} mt-1 h-24 font-mono`} value={tv} onChange={e => setTv(e.target.value)} placeholder="AAF00123" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Tổ đang hoạt động</label>
        <div className="ml-auto flex gap-2">
          <button type="button" className={BTN} onClick={huy}><X size={14} /> Huỷ</button>
          <button type="button" className={BTN_CHINH} disabled={!ten.trim() || luu} onClick={submit}><Check size={14} /> {to ? 'Lưu tổ' : 'Thêm tổ'}</button>
        </div>
      </div>
    </div>
  );
}

export function XuongToSetup({ d, bao, tai }: MucProps) {
  const [sua, setSua] = useState<number | 'moi' | null>(null);
  const [loc, setLoc] = useState<'tat_ca' | 'chua_tt'>('tat_ca');
  const [inThe, setInThe] = useState(false);
  const tenCd = (id: string) => d.congDoan.find(c => c.id === id)?.ten ?? id;
  const ds = d.to.filter(t => loc === 'tat_ca' || !t.toTruong);
  const chuaTt = d.to.filter(t => t.active && !t.toTruong).length;
  return (
    <div className={KHUNG}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <p className="text-base font-semibold text-slate-900">{d.to.length} tổ · xưởng {d.xuong}</p>
        {chuaTt > 0 && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"><AlertTriangle size={13} /> {chuaTt} tổ chưa có tổ trưởng (tổ trưởng chưa dùng được app MRA)</span>}
        <select value={loc} onChange={e => setLoc(e.target.value as 'tat_ca' | 'chua_tt')} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
          <option value="tat_ca">Tất cả tổ</option><option value="chua_tt">Chưa có tổ trưởng</option>
        </select>
        <button type="button" className={`${BTN} ml-auto`} onClick={() => setInThe(true)}><QrCode size={14} /> In nhãn QR mã NV</button>
        <button type="button" className={BTN_CHINH} onClick={() => setSua('moi')}><Plus size={14} /> Thêm tổ</button>
      </div>
      {inThe && d.xuong && <InTheQr xuong={d.xuong} dsTo={d.to.filter(t => t.active)} onClose={() => setInThe(false)} />}
      {sua === 'moi' && <SuaTo d={d} to={null} bao={bao} xong={() => { setSua(null); tai(); }} huy={() => setSua(null)} />}
      <table className="w-full min-w-[36rem] rmd:min-w-0">
        <thead className="bg-slate-50"><tr>
          <th className={TH}>Tổ</th><th className={TH}>Tổ trưởng</th><th className={TH}>Chấm công</th><th className={TH}>Công đoạn phụ trách</th>
          <th className={`${TH} text-right`}>Thành viên</th><th className={TH} />
        </tr></thead>
        <tbody>
          {ds.map(t => (
            <FragmentTo key={t.id} t={t} tenCd={tenCd} mo={sua === t.id} onSua={() => setSua(sua === t.id ? null : t.id)}>
              <SuaTo d={d} to={t} bao={bao} xong={() => { setSua(null); tai(); }} huy={() => setSua(null)} />
            </FragmentTo>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentTo({ t, tenCd, mo, onSua, children }: { t: ToSetup; tenCd: (id: string) => string; mo: boolean; onSua: () => void; children: ReactNode }) {
  return (
    <>
      <tr className={`border-t border-slate-100 ${t.active ? '' : 'text-slate-400'}`}>
        <td className={`${TD} font-medium text-slate-800`}>{t.ten}{!t.active && <span className="ml-1 text-xs text-slate-500">(ngừng)</span>}</td>
        <td className={TD}>
          {t.toTruong
            ? <>{t.toTruong.ten}{t.toTruong.msnv ? <span className="text-slate-500"> · {t.toTruong.msnv}</span> : null}
                {!t.toTruong.coQuyenXuong && <span className="ml-1 text-xs text-amber-700">chưa có quyền Xưởng</span>}</>
            : <span className="text-amber-700">Chưa có</span>}
        </td>
        <td className={TD}>
          <span className={`inline-block rounded-md border px-2 py-0.5 text-xs ${MAU_CHE_DO[t.cheDo ?? 'cu']}`}>{TEN_CHE_DO[t.cheDo ?? 'cu']}</span>
          {t.cheDoSau && <span className="ml-1 text-xs text-slate-500">→ {TEN_CHE_DO[t.cheDoSau.cheDo]} từ {ngayVN(t.cheDoSau.tuNgay)}</span>}
          {(t.soTram ?? 0) > 0 && <span className="ml-1 text-xs text-slate-500">· {t.soTram} trạm</span>}
        </td>
        <td className={TD}>{t.congDoan.map(tenCd).join(', ') || <span className="text-amber-700">Chưa gán</span>}</td>
        <td className={`${TD} text-right tabular-nums`}>{t.thanhVien.length || '—'}</td>
        <td className={`${TD} text-right`}><button type="button" className={BTN} onClick={onSua}><Pencil size={13} /> {mo ? 'Đóng' : 'Sửa'}</button></td>
      </tr>
      {mo && <tr><td colSpan={6} className="p-0">{children}</td></tr>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Công đoạn
// ---------------------------------------------------------------------------
type CdNhap = CongDoanSetup & { moi?: boolean };
export function XuongCongDoanSetup({ d, bao, tai }: MucProps) {
  const [ds, setDs] = useState<CdNhap[]>(d.congDoan);
  const [doi, setDoi] = useState<Set<string>>(new Set());
  useEffect(() => { setDs(d.congDoan); setDoi(new Set()); }, [d.congDoan]);
  const sua = (id: string, p: Partial<CdNhap>) => { setDs(a => a.map(c => (c.id === id ? { ...c, ...p } : c))); setDoi(s => new Set(s).add(id)); };
  const them = () => {
    const id = `moi-${Date.now()}`;
    setDs(a => [...a, { id, moi: true, tenCd: `${d.xuong}-`, cdTachMa: '', ten: '', thuTu: Math.max(0, ...a.map(c => c.thuTu)), laBaoBi: false, active: true }]);
    setDoi(s => new Set(s).add(id));
  };
  const luu = async () => {
    for (const c of ds.filter(x => doi.has(x.id))) {
      if (!c.ten.trim() || !c.tenCd.trim()) { bao(false, 'Công đoạn cần tên chi tiết và tên công đoạn xưởng'); return; }
      const r = await xuongSetupApi.luuCongDoan({
        id: c.moi ? undefined : c.id, xuong: d.xuong!, tenCd: c.tenCd.trim(), cdTachMa: c.cdTachMa?.trim() || null, ten: c.ten.trim(),
        thuTu: c.thuTu, laBaoBi: c.laBaoBi, active: c.active,
      });
      if (!r.ok) { bao(false, `${c.ten}: ${r.message}`); return; }
    }
    bao(true, `Đã lưu ${doi.size} công đoạn`);
    tai();
  };
  return (
    <div className={KHUNG}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <p className="text-base font-semibold text-slate-900">{d.congDoan.length} công đoạn · xưởng {d.xuong}</p>
        <p className="text-xs text-slate-500">Thứ tự dùng để gợi ý công đoạn kế khi hạng mục chưa có tuyến triển khai.</p>
        <div className="ml-auto flex gap-2">
          <button type="button" className={BTN} onClick={them}><Plus size={14} /> Thêm công đoạn</button>
          <button type="button" className={BTN_CHINH} disabled={!doi.size} onClick={luu}><Check size={14} /> Lưu {doi.size || ''}</button>
        </div>
      </div>
      <table className="w-full min-w-[36rem] rmd:min-w-0">
        <thead className="bg-slate-50"><tr>
          <th className={`${TH} w-20`}>Thứ tự</th><th className={TH}>Nhóm công đoạn</th><th className={TH}>Công đoạn chi tiết (tổ)</th>
          <th className={TH}>Công đoạn xưởng</th><th className={`${TH} w-20`}>Bao bì</th><th className={`${TH} w-24`}>Đang dùng</th>
        </tr></thead>
        <tbody>
          {ds.map(c => (
            <tr key={c.id} className={`border-t border-slate-100 ${doi.has(c.id) ? 'bg-amber-50' : ''}`}>
              <td className={TD}><input type="number" min={0} className={INPUT} value={c.thuTu} onChange={e => sua(c.id, { thuTu: Number(e.target.value) || 0 })} aria-label="Thứ tự" /></td>
              <td className={TD}><input className={INPUT} value={c.cdTachMa ?? ''} onChange={e => sua(c.id, { cdTachMa: e.target.value })} aria-label="Nhóm công đoạn" /></td>
              <td className={TD}><input className={INPUT} value={c.ten} onChange={e => sua(c.id, { ten: e.target.value })} aria-label="Công đoạn chi tiết" /></td>
              <td className={TD}><input className={INPUT} value={c.tenCd} onChange={e => sua(c.id, { tenCd: e.target.value })} aria-label="Công đoạn xưởng" /></td>
              <td className={TD}><input type="checkbox" checked={c.laBaoBi} onChange={e => sua(c.id, { laBaoBi: e.target.checked })} aria-label="Công đoạn bao bì" /></td>
              <td className={TD}><input type="checkbox" checked={c.active} onChange={e => sua(c.id, { active: e.target.checked })} aria-label="Đang dùng" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lịch ca (giờ nghỉ trưa ở đây — Open Question 9)
// ---------------------------------------------------------------------------
const CA: LoaiCa[] = ['chinh', ...LOAI_CA_TANG_CA];
function DongLichCa({ ca, lich, macDinh, xuong, admin, bao, tai }: {
  ca: LoaiCa; lich: LichCaSetup | undefined; macDinh: LichCaSetup | undefined; xuong: string; admin: boolean; bao: Bao; tai: () => void;
}) {
  const goc = lich ?? macDinh;
  const [bd, setBd] = useState(goc?.gioBatDau ?? '07:30');
  const [kt, setKt] = useState(goc?.gioKetThuc ?? '15:45');
  const [nghi, setNghi] = useState<Array<[string, string]>>(goc?.nghi ?? []);
  useEffect(() => { setBd(goc?.gioBatDau ?? '07:30'); setKt(goc?.gioKetThuc ?? '15:45'); setNghi(goc?.nghi ?? []); }, [goc]);
  const doi = !goc || bd !== goc.gioBatDau || kt !== goc.gioKetThuc || JSON.stringify(nghi) !== JSON.stringify(goc.nghi);
  const luu = async (dich: string) => {
    const r = await xuongSetupApi.luuLichCa({ xuong: dich, loaiCa: ca, gioBatDau: bd, gioKetThuc: kt, nghi });
    if (r.ok) { bao(true, `Đã lưu ${TEN_CA[ca].toLowerCase()} ${dich === '*' ? '(mặc định mọi xưởng)' : `xưởng ${dich}`}`); tai(); } else bao(false, r.message);
  };
  return (
    <tr className={`border-t border-slate-100 ${doi ? 'bg-amber-50' : ''}`}>
      <td className={`${TD} font-medium text-slate-800`}>{TEN_CA[ca]}</td>
      <td className={TD}><input type="time" className={INPUT} value={bd} onChange={e => setBd(e.target.value)} aria-label={`Giờ bắt đầu ${TEN_CA[ca]}`} /></td>
      <td className={TD}><input type="time" className={INPUT} value={kt} onChange={e => setKt(e.target.value)} aria-label={`Giờ kết thúc ${TEN_CA[ca]}`} /></td>
      <td className={TD}>
        <div className="space-y-1">
          {nghi.map(([a, b], i) => (
            <div key={i} className="flex items-center gap-1">
              <input type="time" className={INPUT} value={a} onChange={e => setNghi(n => n.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} aria-label="Nghỉ từ" />
              <span className="text-slate-400">–</span>
              <input type="time" className={INPUT} value={b} onChange={e => setNghi(n => n.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} aria-label="Nghỉ đến" />
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={() => setNghi(n => n.filter((_, j) => j !== i))} aria-label="Bỏ khoảng nghỉ"><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline" onClick={() => setNghi(n => [...n, ['11:30', '12:30']])}>+ Thêm khoảng nghỉ</button>
        </div>
      </td>
      <td className={TD}>{lich ? <span className="text-slate-800">Riêng xưởng {xuong}</span> : <span className="text-slate-500">Mặc định</span>}</td>
      <td className={`${TD} space-x-1 whitespace-nowrap text-right`}>
        <button type="button" className={doi ? BTN_CHINH : BTN} disabled={!doi && !!lich} onClick={() => luu(xuong)}>Lưu cho {xuong}</button>
        {admin && <button type="button" className={BTN} disabled={!doi} onClick={() => luu('*')} title="Áp cho mọi xưởng chưa có lịch riêng">Lưu mặc định</button>}
        {lich && <button type="button" className={BTN} onClick={async () => {
          const r = await xuongSetupApi.boLichCa(xuong, ca);
          if (r.ok) { bao(true, 'Đã quay về lịch mặc định'); tai(); } else bao(false, r.message);
        }}>Bỏ lịch riêng</button>}
      </td>
    </tr>
  );
}

export function XuongLichCaSetup({ d, bao, tai }: MucProps) {
  const chinh = d.lichCa.find(l => l.xuong === d.xuong && l.loaiCa === 'chinh') ?? d.lichCa.find(l => l.xuong === '*' && l.loaiCa === 'chinh');
  return (
    <div className="space-y-3">
      {chinh && chinh.nghi.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={15} /> Ca chính chưa có giờ nghỉ trưa — giờ công đang tính cả giờ nghỉ. Thêm khoảng nghỉ (vd 11:30–12:30) rồi lưu.
        </p>
      )}
      <div className={KHUNG}>
        <table className="w-full min-w-[36rem] rmd:min-w-0">
          <thead className="bg-slate-50"><tr>
            <th className={TH}>Ca</th><th className={`${TH} w-32`}>Bắt đầu</th><th className={`${TH} w-32`}>Kết thúc</th>
            <th className={TH}>Giờ nghỉ (không tính giờ công)</th><th className={TH}>Áp dụng</th><th className={TH} />
          </tr></thead>
          <tbody>
            {CA.map(ca => (
              <DongLichCa key={ca} ca={ca} xuong={d.xuong!} admin={d.admin} bao={bao} tai={tai}
                lich={d.lichCa.find(l => l.xuong === d.xuong && l.loaiCa === ca)} macDinh={d.lichCa.find(l => l.xuong === '*' && l.loaiCa === ca)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Ca kết thúc sớm hơn giờ bắt đầu là ca qua đêm (vd ca 4: 16:15–06:00). Đổi lịch ca thì giờ công các ngày được tính lại khi xem.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quản lý xưởng (admin gán)
// ---------------------------------------------------------------------------
export function XuongQuanLySetup({ d, bao, tai }: MucProps) {
  const [nguoi, setNguoi] = useState<NguoiDung | null>(null);
  return (
    <div className={`${KHUNG} max-w-3xl`}>
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-base font-semibold text-slate-900">Quản lý xưởng {d.xuong}</p>
        <p className="text-xs text-slate-500">Quản lý: triển khai hạng mục, cấu hình tổ / công đoạn / lịch ca, xem "Cần xem", huỷ thao tác sai của tổ bất kỳ lúc nào.</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {d.quanLy.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Chưa có quản lý (admin luôn quản lý mọi xưởng).</li>}
        {d.quanLy.map(q => (
          <li key={q.userId} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className="text-slate-800">{q.ten}</span>
            {d.admin && <button type="button" className={BTN} onClick={async () => {
              const r = await xuongSetupApi.quanLy(q.userId, d.xuong!, true);
              if (r.ok) { bao(true, `Đã bỏ quyền quản lý xưởng ${d.xuong} của ${q.ten}`); tai(); } else bao(false, r.message);
            }}><X size={13} /> Bỏ</button>}
          </li>
        ))}
      </ul>
      {d.admin ? (
        <div className="flex items-start gap-2 border-t border-slate-100 p-4">
          <div className="flex-1"><ChonNguoi chon={nguoi} onChon={setNguoi} /></div>
          <button type="button" className={BTN_CHINH} disabled={!nguoi} onClick={async () => {
            const r = await xuongSetupApi.quanLy(nguoi!.id, d.xuong!);
            if (r.ok) { bao(true, `${nguoi!.ten} là quản lý xưởng ${d.xuong}`); setNguoi(null); tai(); } else bao(false, r.message);
          }}><Plus size={14} /> Thêm quản lý</button>
        </div>
      ) : <p className="border-t border-slate-100 p-4 text-xs text-slate-500">Chỉ admin gán / bỏ quản lý xưởng.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cần xem: sự kiện và hạng mục có cờ trong 30 ngày; quản lý huỷ được từ máy tính (R7)
// ---------------------------------------------------------------------------
type Dong = Record<string, unknown>;
export function XuongCanXem({ xuong, congDoan, to, bao, chiXem = false }: {
  xuong: string; congDoan: CongDoanSetup[]; to: ToSetup[]; bao: Bao;
  /** Tổ trưởng: chỉ xem, không huỷ (huỷ từ máy tính chỉ quản lý; tổ trưởng huỷ ở Lịch sử trong app) */
  chiXem?: boolean;
}) {
  const [d, setD] = useState<{ suKien: Dong[]; trangThai: Dong[] } | null>(null);
  const [loi, setLoi] = useState('');
  // Mặc định chỉ cờ cần xử lý — cờ chỉ để biết (quản lý ghi hộ…) nhiều, làm chìm lỗi thật
  const [boLoc, setBoLoc] = useState('can_xu_ly');
  const tai = () => { setLoi(''); xuongSetupApi.canXem(xuong).then(r => (r.ok ? setD(r.data) : setLoi(r.message))); };
  useEffect(tai, [xuong]);
  const tenCd = (id: unknown) => congDoan.find(c => c.id === id)?.ten ?? (id ? String(id) : '');
  const tenTo = (id: unknown) => to.find(t => t.id === Number(id))?.ten ?? '';
  const cacCo = useMemo(() => [...new Set((d?.suKien ?? []).flatMap(x => (x.co as string[]) ?? []))].sort(), [d]);
  // Cờ chỉ để biết (không phải lỗi): quản lý ghi hộ + các cờ ghi chú của trạm quét / phân công đầu ca
  const CO_CHI_DE_BIET = new Set(['quan_ly_ghi_ho', 'tram', 'nhan_du', 'xong_het', 'khai_ho', 'phan_cong', 'bao_xong']);
  const canXuLy = (x: Dong) => ((x.co as string[]) ?? []).some(c => !CO_CHI_DE_BIET.has(c));
  const soCanXuLy = (d?.suKien ?? []).filter(canXuLy).length;
  const ds = (d?.suKien ?? []).filter(x => !boLoc || (boLoc === 'can_xu_ly' ? canXuLy(x) : ((x.co as string[]) ?? []).includes(boLoc)));
  const ngayGio = (s: unknown) => { const t = Date.parse(String(s)); return `${hhmm(t)} ${gioVN(t).ngay.split('-').reverse().join('/')}`; };
  if (loi) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{loi}</p>;
  if (!d) return <div className="flex justify-center py-10 text-slate-400"><RefreshCw className="animate-spin" size={18} /></div>;
  return (
    <div className="space-y-4">
      <div className={KHUNG}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <p className="text-base font-semibold text-slate-900">Thao tác có cờ <span className="text-sm font-normal text-slate-500">· 30 ngày · {ds.length}</span></p>
          <select value={boLoc} onChange={e => setBoLoc(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
            <option value="can_xu_ly">Cần xử lý ({soCanXuLy})</option>
            <option value="">Mọi cờ, kể cả chỉ để biết ({d.suKien.length})</option>
            {cacCo.map(c => <option key={c} value={c}>{tenCo(c)}</option>)}
          </select>
          <button type="button" className={`${BTN} ml-auto`} onClick={tai}><RefreshCw size={13} /> Tải lại</button>
        </div>
        {ds.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">
          {boLoc === 'can_xu_ly' ? `Không có thao tác nào cần xử lý.${d.suKien.length ? ` (${d.suKien.length} thao tác chỉ để biết — chọn "Mọi cờ" để xem.)` : ''}` : 'Không có thao tác nào cần xem.'}</p> : (
          <table className="w-full min-w-[36rem] rmd:min-w-0">
            <thead className="bg-slate-50"><tr>
              <th className={TH}>Lúc</th><th className={TH}>Thao tác</th><th className={TH}>Hạng mục · công đoạn · tổ</th><th className={TH}>Cờ</th><th className={TH} />
            </tr></thead>
            <tbody>
              {ds.map(x => (
                <tr key={String(x.id)} className="border-t border-slate-100">
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{ngayGio(x.device_ts_hieu_chinh)}</td>
                  <td className={TD}>{moTaSuKien({ loai: String(x.loai), soLuong: x.so_luong as number | null, soNguoi: x.so_nguoi as number | null,
                    lyDo: x.ly_do_tam_ngung as string | null, duLieu: x.du_lieu as Record<string, unknown> | null })}</td>
                  <td className={TD}><span className="tabular-nums">{String(x.hex ?? '—')}</span>{x.cong_doan_id ? ` · ${tenCd(x.cong_doan_id)}` : ''}{x.to_id ? ` · ${tenTo(x.to_id)}` : ''}</td>
                  <td className={TD}>{((x.co as string[]) ?? []).map(c => <span key={c} className="mr-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">{tenCo(c)}</span>)}</td>
                  <td className={`${TD} text-right`}>
                    {!chiXem && <button type="button" className={BTN} onClick={async () => {
                      const lyDo = window.prompt('Huỷ thao tác này? Ghi lý do (không bắt buộc):', '');
                      if (lyDo === null) return;
                      const r = await xuongSetupApi.huy(String(x.id), lyDo || undefined);
                      if (r.ok) { bao(true, 'Đã huỷ thao tác'); tai(); } else bao(false, r.message);
                    }}>Huỷ</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className={KHUNG}>
        <p className="border-b border-slate-100 px-4 py-3 text-base font-semibold text-slate-900">Hạng mục có cờ <span className="text-sm font-normal text-slate-500">· {d.trangThai.length}</span></p>
        {d.trangThai.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">Không có.</p> : (
          <table className="w-full min-w-[36rem] rmd:min-w-0">
            <thead className="bg-slate-50"><tr><th className={TH}>Hạng mục</th><th className={TH}>Công đoạn</th><th className={TH}>Số lượng</th><th className={TH}>Cờ</th></tr></thead>
            <tbody>
              {d.trangThai.map(x => (
                <tr key={`${x.hex}|${x.congDoanId}`} className="border-t border-slate-100">
                  <td className={TD}><span className="font-medium tabular-nums">{String(x.hex)}</span> {String(x.tenHangMuc ?? '')}</td>
                  <td className={TD}>{tenCd(x.congDoanId)}</td>
                  <td className={`${TD} tabular-nums`}>Giao tới {String(x.slGiaoDen)} · Nhận {String(x.slNhan)} · Xong {String(x.slHoanThanh)} · Giao {String(x.slGiao)}</td>
                  <td className={TD}>{((x.co as string[]) ?? []).map(c => <span key={c} className="mr-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">{tenCo(c)}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
