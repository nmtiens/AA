import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Upload, RefreshCw, AlertTriangle } from 'lucide-react';
import { xuongSetupApi, type CongNhanXuong, type DongNapNhanSu, type SetupXuong } from '../../services/xuongSetupApi';
import { BTN, BTN_CHINH, KHUNG, TH, TD, INPUT } from './xuongDesktopUi';

// ============================================================================
// NHÂN SỰ XƯỞNG — danh sách công nhân cho chấm công theo người (docs/designs/xuong-cham-cong.md).
// Xem theo tổ, chuyển tổ, cho nghỉ việc; nạp file nhân sự (Excel / CSV) — trình duyệt đọc file, tự nhận cột theo tiêu
// đề (sửa được), xem trước rồi gửi các dòng lên POST /api/xuong/cong-nhan/nap.
// ============================================================================

type Cot = 'mnv' | 'hoTen' | 'xuong' | 'tenTo' | 'chucVu';
const TEN_COT: Record<Cot, string> = { mnv: 'Mã NV', hoTen: 'Họ tên', xuong: 'Xưởng', tenTo: 'Tổ', chucVu: 'Chức vụ' };
const boDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
/** Đoán cột theo tiêu đề file */
const DOAN: Record<Cot, RegExp> = {
  mnv: /^(ma\s*(so\s*)?(nv|nhan\s*vien)|msnv|mnv|ma\s*so|employee\s*(id|code)|id)$/,
  hoTen: /^(ho\s*(va\s*)?ten|ten\s*nhan\s*vien|ho\s*ten|full\s*name|name|ten)$/,
  xuong: /^(xuong|xuong\s*chinh|xuong\s*san\s*xuat|bo\s*phan|workshop)$/,
  tenTo: /^(to|to\s*(san\s*xuat|sx|lam\s*viec)?|ten\s*to|nhom|team)$/,
  chucVu: /^(chuc\s*vu|chuc\s*danh|vi\s*tri|position)$/,
};

function NapFile({ xuong, bao, xong }: { xuong: string; bao: (ok: boolean, msg: string) => void; xong: () => void }) {
  const [tieuDe, setTieuDe] = useState<string[]>([]);
  const [dong, setDong] = useState<Array<Record<string, unknown>>>([]);
  const [cot, setCot] = useState<Partial<Record<Cot, string>>>({});
  const [tenFile, setTenFile] = useState('');
  const [nghi, setNghi] = useState(false);
  const [dang, setDang] = useState(false);
  const [kq, setKq] = useState<{ daNap: number; boQua: number; nghi: number; loi: string[]; toKhongKhop: string[] } | null>(null);

  const doc = async (f: File) => {
    setKq(null);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await f.arrayBuffer());
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
    const td = rows.length ? Object.keys(rows[0]) : [];
    const doan: Partial<Record<Cot, string>> = {};
    for (const c of Object.keys(DOAN) as Cot[]) {
      const k = td.find(h => DOAN[c].test(boDau(h)));
      if (k) doan[c] = k;
    }
    setTenFile(f.name); setTieuDe(td); setDong(rows); setCot(doan);
  };

  const ra = useMemo<DongNapNhanSu[]>(() => (cot.mnv && cot.hoTen ? dong.map(x => ({
    mnv: String(x[cot.mnv!] ?? '').trim(), hoTen: String(x[cot.hoTen!] ?? '').trim(),
    xuong: cot.xuong ? String(x[cot.xuong] ?? '').trim() || xuong : xuong,
    tenTo: cot.tenTo ? String(x[cot.tenTo] ?? '').trim() || null : null,
    chucVu: cot.chucVu ? String(x[cot.chucVu] ?? '').trim() || null : null,
  })).filter(x => x.mnv || x.hoTen) : []), [dong, cot, xuong]);

  const nap = async () => {
    setDang(true);
    const r = await xuongSetupApi.napCongNhan(ra, nghi);
    setDang(false);
    if (!r.ok) { bao(false, r.status === 503 ? 'Máy chủ chưa chạy file backend/sql/2026-10-13_xuong_cham_cong.sql' : r.message); return; }
    setKq(r.data);
    bao(true, `Đã nạp ${r.data.daNap} người`);
    xong();
  };

  return (
    <div className={`${KHUNG} space-y-3 p-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-slate-800">Nạp file nhân sự</p>
        <label className={`${BTN} cursor-pointer`}>
          <Upload size={14} /> Chọn file Excel / CSV
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) doc(f); e.target.value = ''; }} />
        </label>
        {tenFile && <span className="text-sm text-slate-600">{tenFile} · {dong.length} dòng</span>}
      </div>
      <p className="text-xs text-slate-500">Cần tối thiểu cột mã NV và họ tên; có cột tổ thì người được xếp vào tổ trùng tên (trong xưởng). Người đã có thì cập nhật, không tạo trùng.</p>
      {tieuDe.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(TEN_COT) as Cot[]).map(c => (
              <label key={c} className="space-y-1 text-xs text-slate-600">
                <span>{TEN_COT[c]}{c === 'mnv' || c === 'hoTen' ? ' *' : ''}</span>
                <select className={INPUT} value={cot[c] ?? ''} onChange={e => setCot(x => ({ ...x, [c]: e.target.value || undefined }))}>
                  <option value="">— không có —</option>
                  {tieuDe.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          {ra.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50"><tr>{(Object.keys(TEN_COT) as Cot[]).map(c => <th key={c} className={TH}>{TEN_COT[c]}</th>)}</tr></thead>
                <tbody>
                  {ra.slice(0, 5).map((x, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className={`${TD} tabular-nums`}>{x.mnv}</td><td className={TD}>{x.hoTen}</td><td className={TD}>{x.xuong}</td>
                      <td className={TD}>{x.tenTo ?? '—'}</td><td className={TD}>{x.chucVu ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ra.length > 5 && <p className="px-3 py-1.5 text-xs text-slate-500">… và {ra.length - 5} dòng nữa</p>}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={nghi} onChange={e => setNghi(e.target.checked)} />
            Đánh <b>nghỉ việc</b> người của các xưởng trong file mà không có tên trong file
          </label>
          <button type="button" className={BTN_CHINH} disabled={dang || !ra.length} onClick={nap}>
            {dang ? 'Đang nạp…' : `Nạp ${ra.length} người`}
          </button>
        </>
      )}
      {kq && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p>Đã nạp <b>{kq.daNap}</b> người{kq.boQua ? `, bỏ qua ${kq.boQua} dòng` : ''}{kq.nghi ? `, đánh nghỉ việc ${kq.nghi} người` : ''}.</p>
          {kq.toKhongKhop.length > 0 && <p className="text-amber-800">Tổ không khớp tên tổ trong hệ thống (người vẫn được nạp, chưa xếp tổ): {kq.toKhongKhop.join(', ')}</p>}
          {kq.loi.map(l => <p key={l} className="text-red-700">{l}</p>)}
        </div>
      )}
    </div>
  );
}

export default function NhanSuXuong({ d, bao }: { d: SetupXuong; bao: (ok: boolean, msg: string) => void }) {
  const xuong = d.xuong!;
  const [ds, setDs] = useState<CongNhanXuong[] | null>(null);
  const [loi, setLoi] = useState('');
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState<string>('');
  const [anNghi, setAnNghi] = useState(true);

  const tai = useCallback(async () => {
    const r = await xuongSetupApi.dsCongNhan(xuong);
    if (r.ok) { setDs(r.data.congNhan); setLoi(''); }
    else setLoi(r.status === 503 ? 'Máy chủ chưa bật chấm công theo người — chạy file backend/sql/2026-10-13_xuong_cham_cong.sql.' : r.message);
  }, [xuong]);
  useEffect(() => { tai(); }, [tai]);

  const sua = async (x: CongNhanXuong, p: { toId?: number | null; active?: boolean }) => {
    const r = await xuongSetupApi.suaCongNhan({ mnv: x.mnv, ...p });
    if (!r.ok) { bao(false, r.message); return; }
    setDs(a => a?.map(y => (y.mnv === x.mnv ? r.data.congNhan : y)) ?? null);
  };

  const tim = q.trim().toLowerCase();
  const hien = (ds ?? []).filter(x => (!anNghi || x.active)
    && (loc === '' || (loc === 'chua' ? x.toId === null : String(x.toId) === loc))
    && (!tim || `${x.mnv} ${x.hoTen}`.toLowerCase().includes(tim)));
  const demTo = new Map<number, number>();
  for (const x of ds ?? []) if (x.active && x.toId) demTo.set(x.toId, (demTo.get(x.toId) ?? 0) + 1);

  return (
    <div className="space-y-4">
      {loi && <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle size={15} /> {loi}</p>}
      {!loi && <NapFile xuong={xuong} bao={bao} xong={tai} />}
      {ds && (
        <div className={KHUNG}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-md border border-slate-300 px-2 py-1">
              <Search size={14} className="text-slate-400" aria-hidden />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã NV, họ tên" className="w-full text-sm outline-none" aria-label="Tìm công nhân" />
            </label>
            <select value={loc} onChange={e => setLoc(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Lọc theo tổ">
              <option value="">Mọi tổ ({(ds ?? []).filter(x => x.active).length})</option>
              <option value="chua">Chưa xếp tổ</option>
              {d.to.filter(t => t.active).map(t => <option key={t.id} value={String(t.id)}>{t.ten} ({demTo.get(t.id) ?? 0})</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={anNghi} onChange={e => setAnNghi(e.target.checked)} /> Ẩn người nghỉ việc</label>
            <button type="button" className={`${BTN} ml-auto`} onClick={tai}><RefreshCw size={13} /> Tải lại</button>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[720px]">
              <thead className="sticky top-0 bg-slate-50"><tr>
                <th className={TH}>Mã NV</th><th className={TH}>Họ tên</th><th className={TH}>Tổ</th><th className={TH}>Chức vụ</th>
                <th className={TH}>Nguồn</th><th className={TH} />
              </tr></thead>
              <tbody>
                {hien.map(x => (
                  <tr key={x.mnv} className={`border-t border-slate-100 ${x.active ? '' : 'opacity-50'}`}>
                    <td className={`${TD} tabular-nums`}>{x.mnv}</td>
                    <td className={TD}>{x.hoTen}</td>
                    <td className={TD}>
                      <select value={x.toId ?? ''} disabled={!x.active} onChange={e => sua(x, { toId: e.target.value ? Number(e.target.value) : null })}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm" aria-label={`Tổ của ${x.hoTen}`}>
                        <option value="">— chưa xếp —</option>
                        {d.to.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.ten}</option>)}
                      </select>
                    </td>
                    <td className={TD}>{x.chucVu ?? '—'}</td>
                    <td className={`${TD} text-xs text-slate-500`}>{x.nguon === 'file' ? 'File nhân sự' : 'Tổ trưởng thêm'}</td>
                    <td className={`${TD} text-right`}>
                      <button type="button" className="text-sm text-slate-600 underline" onClick={() => sua(x, { active: !x.active })}>
                        {x.active ? 'Nghỉ việc' : 'Khôi phục'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!hien.length && <tr><td colSpan={6} className={`${TD} text-slate-500`}>{ds.length ? 'Không có người khớp.' : 'Chưa có công nhân — nạp file nhân sự, hoặc tổ trưởng thêm khi điểm danh.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
