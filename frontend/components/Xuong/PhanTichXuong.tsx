import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { xuongSetupApi, type PhanTichXuong as PhanTich } from '../../services/xuongSetupApi';
import { KHUNG, TH_BC as TH, TD_BC as TD, BANG } from './xuongDesktopUi';
import * as bang from '../shared/bangBaoCao';
import { so, oSo } from './chiSoXuong';
import The from './TheSo';

/** Chữ chú thích biểu đồ màu chữ thường (mặc định theo màu cột — vàng / xanh nhạt khó đọc) */
const chuChuThich = (v: string) => <span style={{ color: '#334155' }}>{v}</span>;

// ============================================================================
// BÁO CÁO → KẾ HOẠCH & PHÂN TÍCH → MỐC CHUẨN THỜI GIAN: số liệu app, cùng cách phân tích của tab "Lịch sử MRA" cũ
// (đã bỏ): mỗi công đoạn chạy bao lâu (giờ trong ca), hạng mục nằm trong xưởng bao nhiêu ngày theo nhóm sản phẩm,
// tạm ngưng, theo tháng. Chỉ phân tích THỜI GIAN — giờ công (người) ở tab Theo tổ / Theo hạng mục, tiền ở kế hoạch tuần.
// Lấy công đoạn có thao tác đầu trong [tu, den]; tổ trưởng chỉ công đoạn tổ mình (backend lọc).
// ============================================================================

const ngayVi = (iso: string) => { const d = new Date(Date.parse(iso) + 7 * 3_600_000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const XANH = '#16a34a', VANG = '#f59e0b', LAM = '#2563eb', TIM = '#7c3aed';

function Khung({ ten, phu, children }: { ten: string; phu?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-base font-semibold text-slate-900">{ten}</p>
      {phu && <p className="text-sm text-slate-500">{phu}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function PhanTichXuong({ xuong, tu, den }: { xuong: string; tu: string; den: string }) {
  const [d, setD] = useState<PhanTich | null>(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    let huy = false;
    setD(null); setLoi('');
    xuongSetupApi.phanTich(xuong, tu, den).then(r => { if (huy) return; if (r.ok) setD(r.data); else setLoi(r.message); });
    return () => { huy = true; };
  }, [xuong, tu, den]);

  if (loi) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>;
  if (!d) return <div className="flex justify-center py-10 text-slate-400"><RefreshCw className="animate-spin" size={18} /></div>;
  if (!d.coDuLieu || !d.tong) {
    return <p className={`${KHUNG} p-4 text-sm text-slate-600`}>Chưa có công đoạn nào bắt đầu trên app trong khoảng ngày này{d.chiTo ? ' ở tổ của bạn' : ''}.</p>;
  }
  const t = d.tong;
  const cd = (d.congDoan ?? []).filter(c => c.soHm >= 3);
  // Chỉ vẽ khi đủ số liệu làm mốc (≥ 3 hạng mục, có giờ trong ca) — ít số liệu thì biểu đồ ra thanh 0,1 giờ / "0 ngày" gây hiểu nhầm
  const cdBieuDo = [...cd].filter(c => c.gioCaTv >= 0.1).sort((a, b) => b.gioCaTv - a.gioCaTv).slice(0, 14)
    .map(c => ({ ten: c.ten, tv: c.gioCaTv, p75: Math.max(0, c.gioCaP75 - c.gioCaTv) }));
  const nhom = (d.nhom ?? []).filter(n => n.soXong >= 3 && n.ngayTv > 0);
  const theoThang = d.theoThang ?? [];
  const lauNhat = (d.lauNhat ?? []).filter(h => h.ngay >= 0.1);
  const coBieuDo = cdBieuDo.length > 0 || nhom.length > 0 || theoThang.length >= 2 || lauNhat.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Công đoạn bắt đầu từ {ngayVi(t.tu)} tới {ngayVi(t.den)}{d.chiTo ? ', chỉ công đoạn tổ của bạn' : ''}.</p>

      <div className="grid grid-cols-2 gap-3 rmd:grid-cols-3 rxl:grid-cols-5">
        <The ten="Hạng mục đã qua xưởng" giaTri={so(t.soHm, 0)} phu={`${so(t.soHmXong, 0)} đã xong · ${so(t.soCap, 0)} lượt công đoạn`} />
        <The ten="Ngày trong xưởng (thường mất)" giaTri={`${so(t.ngayTv)} ngày`} phu={`Nên hẹn: ${so(t.ngayP75)} ngày`} />
        <The ten="Giờ trong ca (tổng)" giaTri={so(t.gioCa, 0)} phu="cộng mọi công đoạn" />
        <The ten="Tạm ngưng" giaTri={`${so(t.soNgung, 0)} lần`} phu={`${so(t.gioNgung / 24, 0)} ngày lịch cộng dồn`} />
        <The ten="Công đoạn có số liệu" giaTri={so((d.congDoan ?? []).length, 0)} phu="xem bảng bên dưới" />
      </div>

      {!coBieuDo && (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          Chưa đủ số liệu app để vẽ mốc chuẩn (cần mỗi công đoạn ≥ 3 hạng mục có chạy trong ca, hạng mục xong đủ công đoạn).
          Số liệu đến đâu xem ở bảng dưới; biểu đồ tự hiện khi tổ dùng app thêm vài tuần.
        </p>
      )}
      {coBieuDo && <div className="grid gap-3 rlg:grid-cols-2">
        {cdBieuDo.length > 0 && <Khung ten="Mỗi hạng mục chạy bao lâu ở từng công đoạn" phu="Giờ trong ca: xanh = thường mất, vàng = thêm cho tới mức nên hẹn (công đoạn chậm lên trên)">
          <div style={{ height: Math.max(180, cdBieuDo.length * 28 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cdBieuDo} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} unit=" g" />
                <YAxis type="category" dataKey="ten" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, ten: string) => [`${so(v)} giờ`, ten]} />
                <Bar dataKey="tv" name="Thường mất" stackId="a" fill={XANH} />
                <Bar dataKey="p75" name="Thêm cho tới mức nên hẹn" stackId="a" fill={VANG} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Khung>}

        {nhom.length > 0 && <Khung ten="Ngày nằm trong xưởng theo nhóm sản phẩm" phu="Từ thao tác đầu tới lần xong / giao cuối · thường mất và nên hẹn (3/4 hạng mục xong kịp)">
          <div style={{ height: Math.max(180, nhom.length * 30 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={nhom.map(n => ({ ten: n.ten, tv: n.ngayTv, p75: n.ngayP75 }))} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} unit=" ng" />
                <YAxis type="category" dataKey="ten" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, ten: string) => [`${so(v)} ngày`, ten]} />
                <Legend wrapperStyle={{ fontSize: 14 }} formatter={chuChuThich} />
                <Bar dataKey="tv" name="Thường mất" fill={LAM} />
                <Bar dataKey="p75" name="Nên hẹn" fill="#93c5fd" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Khung>}

        {theoThang.length >= 2 && <Khung ten="Theo tháng" phu="Cột: hạng mục xong mọi công đoạn trong tháng (không phải nhập kho) · đường: giờ trong ca của các công đoạn bắt đầu trong tháng">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={theoThang.map(m => ({ ...m, thang: `${m.thang.slice(5)}/${m.thang.slice(2, 4)}` }))} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="a" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 14 }} formatter={chuChuThich} />
                <Bar yAxisId="a" dataKey="soXong" name="Hạng mục xong công đoạn" fill={XANH} radius={[3, 3, 0, 0]} />
                <Line yAxisId="b" dataKey="gioCa" name="Giờ trong ca" stroke={TIM} strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Khung>}

        {lauNhat.length > 0 && <Khung ten="Hạng mục nằm lâu nhất trong xưởng" phu="Đã xong · số ngày lịch từ thao tác đầu tới xong / giao cuối">
          <ul className="divide-y divide-slate-100 text-sm">
            {lauNhat.slice(0, 10).map(h => (
              <li key={h.hex} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate"><b className="tabular-nums">{h.hex}</b> {h.ten ?? ''} <span className="text-xs text-slate-500">· {h.nhom}</span></span>
                <span className="shrink-0 tabular-nums text-slate-700">{so(h.ngay)} ngày</span>
              </li>
            ))}
          </ul>
        </Khung>}
      </div>}

      <div className={KHUNG}>
        <p className="border-b border-slate-100 px-4 py-3 text-base font-semibold text-slate-900">Mốc chuẩn theo công đoạn ({(d.congDoan ?? []).length})</p>
        <table className={`${BANG} w-full min-w-[44rem] rmd:min-w-0`}>
          <thead className={bang.thead}><tr>
            <th className={TH}>Công đoạn</th><th className={`${TH}`}>Hạng mục</th><th className={`${TH}`}>SL xong</th>
            <th className={`${TH}`}>Giờ trong ca (thường mất)</th><th className={`${TH}`}>Giờ nên hẹn</th><th className={`${TH}`}>Ngày lịch (thường mất)</th>
            <th className={`${TH}`}>Giờ / đơn vị (thường mất)</th><th className={`${TH}`}>Tạm ngưng</th>
          </tr></thead>
          <tbody>
            {(d.congDoan ?? []).map(c => (
              <tr key={c.congDoanId} className="border-t border-slate-100">
                <td className={TD}>{c.ten}</td>
                <td className={`${TD} text-center tabular-nums`}>{oSo(c.soHm, 0)}</td>
                <td className={`${TD} text-center tabular-nums`}>{oSo(c.slXong, 0)}</td>
                <td className={`${TD} text-center font-semibold tabular-nums`}>{oSo(c.gioCaTv)}</td>
                <td className={`${TD} text-center tabular-nums`}>{oSo(c.gioCaP75)}</td>
                <td className={`${TD} text-center tabular-nums`}>{oSo(c.ngayChayTv)}</td>
                <td className={`${TD} text-center tabular-nums`}>{oSo(c.gioTrenDvTv, 2)}</td>
                <td className={`${TD} text-center tabular-nums`}>{c.soNgung ? `${so(c.soNgung, 0)} lần · ${c.hmNgung} HM` : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className={bang.tfoot}><tr>
            <td className={TD}>TỔNG</td>
            <td className={bang.tdSo}>{oSo(t.soHm, 0)}</td>
            <td className={TD} /><td className={TD} /><td className={TD} /><td className={TD} /><td className={TD} />
            <td className={bang.tdSo}>{t.soNgung ? `${so(t.soNgung, 0)} lần` : ''}</td>
          </tr></tfoot>
        </table>
      </div>

      {nhom.length > 0 && (
        <div className={KHUNG}>
          <p className="border-b border-slate-100 px-4 py-3 text-base font-semibold text-slate-900">Theo nhóm sản phẩm</p>
          <table className={`${BANG} w-full`}>
            <thead className={bang.thead}><tr>
              <th className={TH}>Nhóm</th><th className={`${TH}`}>Hạng mục</th><th className={`${TH}`}>Đã xong</th>
              <th className={`${TH}`}>Ngày trong xưởng (thường mất)</th><th className={`${TH}`}>Ngày nên hẹn</th><th className={`${TH}`}>Giờ trong ca / hạng mục (thường mất)</th>
            </tr></thead>
            <tbody>
              {(d.nhom ?? []).map(n => (
                <tr key={n.ten} className="border-t border-slate-100">
                  <td className={TD}>{n.ten}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.soHm, 0)}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.soXong, 0)}</td>
                  <td className={`${TD} text-center font-semibold tabular-nums`}>{n.soXong ? oSo(n.ngayTv) : ''}</td>
                  <td className={`${TD} text-center tabular-nums`}>{n.soXong ? oSo(n.ngayP75) : ''}</td>
                  <td className={`${TD} text-center tabular-nums`}>{oSo(n.gioCaTv)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className={bang.tfoot}><tr>
              <td className={TD}>TỔNG</td>
              <td className={bang.tdSo}>{oSo(t.soHm, 0)}</td>
              <td className={bang.tdSo}>{oSo(t.soHmXong, 0)}</td>
              <td className={bang.tdSo}>{oSo(t.ngayTv)}</td>
              <td className={bang.tdSo}>{oSo(t.ngayP75)}</td>
              <td className={TD} />
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
