import { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell, ReferenceLine, LabelList,
} from 'recharts';
import type { BaoCaoTo } from '../../services/xuongSetupApi';

// ============================================================================
// BIỂU ĐỒ BÁO CÁO XƯỞNG (recharts — cùng thư viện Dashboard)
//   BieuDoNgay   : mỗi ngày giờ công = giờ công SP + giờ chờ việc (cột chồng) + % có việc (đường)
//   BieuDoTo     : mỗi tổ giờ công SP / giờ chờ việc (thanh ngang) + % có việc
//   BieuDoKeHoach: Venn rớt / đúng / ngoài kế hoạch, giá trị kế hoạch theo tình trạng, giờ công dùng vào đâu,
//                  nhập kho từng ngày trong tuần + luỹ kế so kế hoạch
// ============================================================================

const so = (n: number, le = 1) => n.toLocaleString('vi-VN', { maximumFractionDigits: le });
const tien = (trieu: number) => (Math.abs(trieu) >= 1000 ? `${so(trieu / 1000, 2)} tỷ` : `${so(trieu, 0)} tr`);
const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const XANH = '#16a34a', VANG = '#f59e0b', DO = '#dc2626', XAM = '#cbd5e1', LAM = '#2563eb', LAM_NHAT = '#93c5fd', TIM = '#7c3aed';

function Khung({ ten, children, phu }: { ten: string; children: React.ReactNode; phu?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">{ten}</p>
      {phu && <p className="text-xs text-slate-500">{phu}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

/** Theo ngày: cả xưởng mỗi ngày */
export function BieuDoNgay({ ds }: { ds: BaoCaoTo[] }) {
  const data = useMemo(() => {
    const m = new Map<string, { gn: number; gc: number; ch: number }>();
    for (const t of ds) for (const n of t.theoNgay) {
      const x = m.get(n.ngay) ?? { gn: 0, gc: 0, ch: 0 };
      x.gn += n.gioNguoi; x.gc += n.gioCong; x.ch += n.gioCho;
      m.set(n.ngay, x);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ngay, x]) => ({ ngay: ddmm(ngay), sp: Math.round(x.gc * 10) / 10, cho: Math.round(x.ch * 10) / 10, pct: pct(x.gc, x.gn) }));
  }, [ds]);
  if (data.length < 1) return null;
  return (
    <Khung ten="Giờ công từng ngày" phu="Cột = giờ công (xanh: làm hàng · vàng: chờ việc) · đường = tỷ lệ có việc">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="ngay" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="g" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="p" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number, ten: string) => (ten === 'Tỷ lệ có việc' ? [`${v}%`, ten] : [`${so(v)} giờ`, ten])} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="g" dataKey="sp" name="Giờ công SP" stackId="a" fill={XANH} />
            <Bar yAxisId="g" dataKey="cho" name="Giờ chờ việc" stackId="a" fill={VANG} radius={[3, 3, 0, 0]} />
            <Line yAxisId="p" dataKey="pct" name="Tỷ lệ có việc" stroke={TIM} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <ReferenceLine yAxisId="p" y={80} stroke={TIM} strokeDasharray="4 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Khung>
  );
}

/** Theo tổ: cả kỳ, xếp tổ có việc thấp lên trên */
export function BieuDoTo({ ds }: { ds: BaoCaoTo[] }) {
  const data = useMemo(() => ds.map(t => {
    const gn = t.theoNgay.reduce((a, n) => a + n.gioNguoi, 0);
    const gc = t.theoNgay.reduce((a, n) => a + n.gioCong, 0);
    const ch = t.theoNgay.reduce((a, n) => a + n.gioCho, 0);
    const p = pct(gc, gn);
    return { ten: t.ten, sp: Math.round(gc * 10) / 10, cho: Math.round(ch * 10) / 10, nhan: p === null ? '' : `${p}%`, p: p ?? -1 };
  }).filter(x => x.sp + x.cho > 0).sort((a, b) => a.p - b.p), [ds]);
  if (!data.length) return null;
  return (
    <Khung ten="Giờ công theo tổ (cả kỳ)" phu="Xanh: giờ công sản phẩm · vàng: chờ việc · số bên phải = tỷ lệ có việc (thấp lên trên)">
      <div style={{ height: Math.max(160, data.length * 34 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="ten" width={96} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number, ten: string) => [`${so(v)} giờ`, ten]} />
            <Bar dataKey="sp" name="Giờ công SP" stackId="a" fill={XANH} />
            <Bar dataKey="cho" name="Giờ chờ việc" stackId="a" fill={VANG} radius={[0, 3, 3, 0]}>
              <LabelList dataKey="nhan" position="right" style={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Khung>
  );
}

/** Venn kế hoạch – thực hiện (cùng ý bảng KH-TH tuần của Dashboard), SVG co giãn */
function Venn({ rot, dung, ngoai }: { rot: number; dung: number; ngoai: number }) {
  return (
    <svg viewBox="0 0 400 220" className="h-auto w-full max-w-md" role="img" aria-label={`Rớt ${tien(rot)}, đúng ${tien(dung)}, ngoài ${tien(ngoai)}`}>
      <circle cx="150" cy="110" r="95" fill="#fca5a5" fillOpacity="0.45" stroke="#ef4444" strokeWidth="2" />
      <circle cx="250" cy="110" r="95" fill="#bae6fd" fillOpacity="0.5" stroke="#0ea5e9" strokeWidth="2" />
      <text x="100" y="100" textAnchor="middle" fontSize="13" fontWeight="700" fill="#7f1d1d">Rớt / còn thiếu</text>
      <text x="100" y="122" textAnchor="middle" fontSize="15" fontWeight="700" fill="#7f1d1d">{tien(rot)}</text>
      <text x="200" y="100" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b">Đúng KH</text>
      <text x="200" y="122" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1e293b">{tien(dung)}</text>
      <text x="300" y="100" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0c4a6e">Ngoài / vượt</text>
      <text x="300" y="122" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0c4a6e">{tien(ngoai)}</text>
      <text x="150" y="212" textAnchor="middle" fontSize="11" fill="#64748b">Kế hoạch</text>
      <text x="250" y="212" textAnchor="middle" fontSize="11" fill="#64748b">Nhập kho</text>
    </svg>
  );
}

const MAU_TT: Record<string, string> = {
  dat: XANH, dat_truoc: '#15803d', cho_nk: '#22c55e', dang_lam: LAM, mot_phan: '#60a5fa', cho_chay: VANG, chua_nhan: '#fbbf24', ngung: '#f97316', chua_tk: DO, rot: '#991b1b',
};

export function BieuDoKeHoach({ tongKh, nkTheoKh, conThieu, nkNgoai, vuot = 0, nkTong, dong, gioSpKh, gioSpNgoai, gioCho, theoNgay, tu, den }: {
  tongKh: number; nkTheoKh: number; conThieu: number; nkNgoai: number; vuot?: number; nkTong: number;
  dong: Array<{ r: { kh: number }; tt: { ma: string; ten: string } }>;
  gioSpKh: number; gioSpNgoai: number; gioCho: number;
  theoNgay: Array<{ ngay: string; theoKh: number; ngoaiKh: number }>; tu: string; den: string;
}) {
  // Giá trị kế hoạch theo tình trạng
  const ttData = useMemo(() => {
    const m = new Map<string, { ten: string; ma: string; gt: number; n: number }>();
    for (const { r, tt } of dong) {
      const x = m.get(tt.ma) ?? { ten: tt.ten.startsWith('Nhập kho ') ? 'Nhập kho một phần' : tt.ten, ma: tt.ma, gt: 0, n: 0 };
      x.gt += r.kh; x.n += 1; m.set(tt.ma, x);
    }
    return [...m.values()].sort((a, b) => b.gt - a.gt);
  }, [dong]);
  // Nhập kho từng ngày (đủ 7 ngày) + luỹ kế theo kế hoạch
  const ngayData = useMemo(() => {
    const m = new Map(theoNgay.map(x => [x.ngay, x]));
    const out: Array<{ ngay: string; theoKh: number; ngoaiKh: number; luyKe: number }> = [];
    let lk = 0;
    for (let t = Date.parse(`${tu}T00:00:00Z`); t <= Date.parse(`${den}T00:00:00Z`); t += 86_400_000) {
      const k = new Date(t).toISOString().slice(0, 10);
      const x = m.get(k);
      lk += x?.theoKh ?? 0;
      out.push({ ngay: ddmm(k), theoKh: Math.round(x?.theoKh ?? 0), ngoaiKh: Math.round(x?.ngoaiKh ?? 0), luyKe: Math.round(lk) });
    }
    return out;
  }, [theoNgay, tu, den]);
  const gioData = [
    { ten: 'Hạng mục kế hoạch', gt: gioSpKh, mau: XANH },
    { ten: 'Hạng mục ngoài kế hoạch', gt: gioSpNgoai, mau: VANG },
    { ten: 'Chờ việc', gt: gioCho, mau: XAM },
  ].filter(x => x.gt > 0.05);

  return (
    <div className="grid gap-3 rlg:grid-cols-2">
      <Khung ten="Kế hoạch – nhập kho tuần" phu={`Kế hoạch ${tien(tongKh)} · nhập kho trong tuần ${tien(nkTong)}`}>
        <div className="flex justify-center"><Venn rot={conThieu} dung={nkTheoKh} ngoai={nkNgoai + vuot} /></div>
      </Khung>

      <Khung ten="Giá trị kế hoạch theo tình trạng" phu="Bao nhiêu tiền kế hoạch đang ở mỗi tình trạng">
        <div className="flex flex-col items-center gap-2 rsm:flex-row">
          <div className="h-52 w-full rsm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ttData} dataKey="gt" nameKey="ten" innerRadius="55%" outerRadius="90%" paddingAngle={1}>
                  {ttData.map(x => <Cell key={x.ma} fill={MAU_TT[x.ma] ?? XAM} />)}
                </Pie>
                <Tooltip formatter={(v: number, ten: string) => [tien(v), ten]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full space-y-1 text-xs rsm:w-1/2">
            {ttData.map(x => (
              <li key={x.ma} className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: MAU_TT[x.ma] ?? XAM }} />
                <span className="min-w-0 flex-1 truncate text-slate-700">{x.ten} ({x.n})</span>
                <span className="tabular-nums font-medium text-slate-900">{tien(x.gt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Khung>

      <Khung ten="Nhập kho từng ngày" phu="Cột: nhập kho theo / ngoài kế hoạch · đường: luỹ kế theo kế hoạch so với mục tiêu tuần">
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={ngayData} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="ngay" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="d" tick={{ fontSize: 11 }} tickFormatter={v => so(v / 1000, 1)} />
              <YAxis yAxisId="l" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => so(v / 1000, 1)} domain={[0, (max: number) => Math.max(max, tongKh) * 1.05]} />
              <Tooltip formatter={(v: number, ten: string) => [tien(v), ten]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="d" dataKey="theoKh" name="Theo KH" stackId="a" fill={LAM} />
              <Bar yAxisId="d" dataKey="ngoaiKh" name="Ngoài KH" stackId="a" fill={LAM_NHAT} radius={[3, 3, 0, 0]} />
              <Line yAxisId="l" dataKey="luyKe" name="Luỹ kế theo KH" stroke={XANH} strokeWidth={2} dot={{ r: 3 }} />
              <ReferenceLine yAxisId="l" y={tongKh} stroke={DO} strokeDasharray="5 4" label={{ value: 'Mục tiêu tuần', fontSize: 11, fill: DO, position: 'insideTopRight' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-500">Trục: tỷ đồng.</p>
      </Khung>

      <Khung ten="Giờ công dùng vào đâu" phu="Giờ công của các tổ dùng MRA trong tuần">
        {gioData.length ? (
          <div className="flex flex-col items-center gap-2 rsm:flex-row">
            <div className="h-52 w-full rsm:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={gioData} dataKey="gt" nameKey="ten" innerRadius="55%" outerRadius="90%" paddingAngle={1}>
                    {gioData.map(x => <Cell key={x.ten} fill={x.mau} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, ten: string) => [`${so(v)} giờ`, ten]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-full space-y-1 text-xs rsm:w-1/2">
              {gioData.map(x => {
                const tong = gioData.reduce((a, y) => a + y.gt, 0);
                return (
                  <li key={x.ten} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: x.mau }} />
                    <span className="min-w-0 flex-1 text-slate-700">{x.ten}</span>
                    <span className="tabular-nums font-medium text-slate-900">{so(x.gt)} giờ · {pct(x.gt, tong)}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : <p className="py-10 text-center text-sm text-slate-500">Tuần này chưa có giờ công (chưa tổ nào ghi trên app, không có số liệu MRA cũ).</p>}
      </Khung>
    </div>
  );
}
