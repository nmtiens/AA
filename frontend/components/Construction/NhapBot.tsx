import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../../services/dataService';
import { canonicalProjectName } from '../../utils/productionMetrics';
import { fmtInt } from '../../utils/format';
import type { HexInfo } from './ProjectHealthTabs';
import { FormNhapBot, type NgayMap } from './BotCongDoan';
import { khoaNgay, type OGhi, type QuyenBot } from './core/botCongDoan';
import { useThuTuLuongDo } from './useThuTuLuongDo';

// ============================================================================
// TRANG "NHẬP BOT" — biểu mẫu cho các bộ phận được phân công (Setup phân công ở Tổng quan công trình → BOT x BOP):
// chọn công trình → phạm vi → công đoạn của mình → ngày BOT đợt đầu / đợt cuối → Lưu. Bảng tổng thể xem ở tab BOT x BOP.
// Danh sách HEX lấy gọn từ máy chủ (GET /api/bot-cong-doan/hex: HEX đang sản xuất theo file công trình, đã lọc theo xưởng
// của bộ phận) nên mở nhanh, không cần tải bảng sản xuất. Máy chủ kiểm quyền lại từng ô khi lưu.
// ============================================================================

interface GoiHex { cot: string[]; ds: unknown[][] }

const thanhHex = (g: GoiHex): HexInfo[] => {
  const i = (k: string) => g.cot.indexOf(k);
  const c = (k: string) => g.ds[i(k)] ?? [];
  const hex = c('hex'), n = hex.length;
  const ra: HexInfo[] = [];
  for (let r = 0; r < n; r++) {
    const remain = Number(c('remain')[r]) || 0;
    const bot = c('botDuAn')[r] as string | null;
    ra.push({
      hex: String(hex[r]), congTrinh: canonicalProjectName(c('ct')[r]), nhomSp: String(c('nsp')[r] ?? ''), area: String(c('xuong')[r] ?? ''),
      stage: (c('bop')[r] as string | null) ?? null, hangMuc: String(c('hm')[r] ?? ''), status: '',
      total: Number(c('total')[r]) || 0, inv: Number(c('inv')[r]) || 0, xuat: Number(c('xuat')[r]) || 0, remain, open: remain > 0,
      botDuAn: bot ? new Date(`${bot}T00:00:00`) : null,
    } as unknown as HexInfo);
  }
  return ra;
};

const NhapBot: React.FC = () => {
  const [goi, setGoi] = useState<GoiHex | null>(null);
  const [ngay, setNgay] = useState<NgayMap>({});
  const [quyen, setQuyen] = useState<QuyenBot | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [thongBao, setThongBao] = useState<{ ok: boolean; noiDung: string } | null>(null);
  const thuTu = useThuTuLuongDo();

  useEffect(() => {
    const doc = (u: string) => fetch(`${API_BASE_URL}${u}`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))));
    Promise.all([doc('/bot-cong-doan/hex'), doc('/bot-cong-doan')])
      .then(([g, d]) => { setGoi(g); setNgay(d.ngay ?? {}); setQuyen(d.quyen ?? null); })
      .catch(e => setLoi(e instanceof Error ? e.message : String(e)));
  }, []);
  const items = useMemo(() => (goi ? thanhHex(goi) : []), [goi]);

  const luu = async (ds: OGhi[]) => {
    setDangLuu(true); setThongBao(null);
    try {
      const r = await fetch(`${API_BASE_URL}/bot-cong-doan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ds }) });
      const kq = await r.json().catch(() => null);
      if (!r.ok) throw new Error(kq?.error || `Lỗi ${r.status}`);
      const bo = new Set((kq.bo as { hex: string; congDoan: string }[]).map(x => `${x.hex}|${x.congDoan}`));
      setNgay(cu => {
        const n = { ...cu };
        for (const x of ds) {
          if (bo.has(`${x.hex}|${x.congDoan}`)) continue;
          const o = { ...(n[x.hex] ?? {}) }, k = khoaNgay(x.congDoan, x.dot);
          if (x.ngay) o[k] = x.ngay; else delete o[k];
          n[x.hex] = o;
        }
        return n;
      });
      setThongBao(kq.bo.length
        ? { ok: false, noiDung: `Đã lưu ${fmtInt(ds.length - kq.bo.length)} ô · ${fmtInt(kq.bo.length)} ô không được lưu: ${kq.bo.slice(0, 3).map((x: { lyDo: string }) => x.lyDo).join('; ')}` }
        : { ok: true, noiDung: `Đã lưu ${fmtInt(ds.length)} ô ngày BOT.` });
    } catch (e) {
      setThongBao({ ok: false, noiDung: `Không lưu được: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setDangLuu(false);
    }
  };

  const coQuyen = !!quyen && (quyen.admin || quyen.congDoan.length > 0);
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Nhập BOT theo công đoạn</h1>
        <p className="text-xs text-slate-500">
          Ngày BOT đợt đầu / đợt cuối cho HEX đang sản xuất · chỉ các công đoạn bộ phận bạn được giao
          {quyen && coQuyen && <> · bạn nhập được: <b>{quyen.admin ? 'mọi công đoạn' : quyen.congDoan.join(', ')}</b>{quyen.xuong ? <> · xưởng <b>{quyen.xuong.join(', ')}</b></> : null}</>}
        </p>
      </div>
      {thongBao && (
        <p className={`rounded-lg px-3 py-2 text-sm ${thongBao.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{thongBao.noiDung}</p>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {loi ? <p className="py-10 text-center text-sm text-slate-600">Không tải được dữ liệu ({loi}).</p>
          : !goi ? <p className="py-10 text-center text-sm font-semibold text-slate-500">Đang tải danh sách HEX…</p>
            : !coQuyen || !items.length
              ? <p className="py-10 text-center text-sm text-slate-600">Chưa có HEX nào để nhập: bộ phận của bạn chưa được giao công đoạn (ADMIN gán ở Tổng quan công trình → BOT x BOP → Setup phân công), hoặc chưa có HEX đang sản xuất thuộc xưởng của bạn.</p>
              : <FormNhapBot nhung items={items} quyen={quyen} ngay={ngay} thuTu={thuTu} onClose={() => { /* trang: không đóng */ }} onLuu={ds => { void luu(ds); }} dangLuu={dangLuu} />}
      </div>
    </div>
  );
};

export default NhapBot;
