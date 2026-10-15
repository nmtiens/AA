import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { xuongSetupApi, type PhanTichXuong as PhanTich } from '../../services/xuongSetupApi';
import { KHUNG, TH, TD } from './xuongDesktopUi';

// ============================================================================
// BÁO CÁO → KẾ HOẠCH & PHÂN TÍCH → MỐC CHUẨN THỜI GIAN: số liệu app, cùng cách phân tích của tab "Lịch sử MRA" cũ
// (đã bỏ): mỗi công đoạn chạy bao lâu (giờ trong ca), hạng mục nằm trong xưởng bao nhiêu ngày theo nhóm sản phẩm,
// tạm ngưng, theo tháng. Chỉ phân tích THỜI GIAN — giờ công (người) ở tab Theo tổ / Theo hạng mục, tiền ở kế hoạch tuần.
// Lấy công đoạn có thao tác đầu trong [tu, den]; tổ trưởng chỉ công đoạn tổ mình (backend lọc).
// ============================================================================

const so = (n: number, le = 1) => n.toLocaleString('vi-VN', { maximumFractionDigits: le });
const ngayVi = (iso: string) => { const d = new Date(Date.parse(iso) + 7 * 3_600_000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const XANH = '#16a34a', VANG = '#f59e0b', LAM = '#2563eb', TIM = '#7c3aed';

function The({ ten, giaTri, phu }: { ten: string; giaTri: string; phu?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm rsm:p-4">
      <p className="text-xs font-semibold text-slate-600">{ten}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 rsm:text-2xl">{giaTri}</p>
      {phu && <p className="mt-0.5 text-xs text-slate-500">{phu}</p>}
    </div>
  );
}
function Khung({ ten, phu, children }: { ten: string; phu?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">{ten}</p>
      {phu && <p className="text-xs text-slate-500">{phu}</p>}
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
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        Số liệu app: các công đoạn bắt đầu từ {ngayVi(t.tu)} tới {ngayVi(t.den)}{d.chiTo ? ' — chỉ công đoạn tổ của bạn' : ''} (bỏ thao tác đã huỷ).
        <b> Giờ trong ca</b> = phần thời gian chạy nằm trong ca chính (trừ nghỉ trưa, bỏ Chủ nhật, không gồm tăng ca); công đoạn đang chạy tính tới bây giờ;
        <b> ngày lịch</b> = tính cả đêm. <b>Ngày trong xưởng</b> chỉ tính hạng mục đã xong mọi công đoạn đã nhận.
        <b>Thường mất</b> = mức giữa (một nửa hạng mục nhanh hơn, một nửa chậm hơn); <b>Nên hẹn</b> = 3/4 số hạng mục xong trong mức này —
        dùng làm mốc khi lập kế hoạch. Giờ công theo người xem ở tab Theo tổ / Theo hạng mục.
      </p>

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
                <Legend wrapperStyle={{ fontSize: 12 }} />
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
                <Legend wrapperStyle={{ fontSize: 12 }} />
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
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Mốc chuẩn theo công đoạn ({(d.congDoan ?? []).length})</p>
        <table className="w-full min-w-[44rem] text-sm rmd:min-w-0">
          <thead className="bg-slate-50"><tr>
            <th className={TH}>Công đoạn</th><th className={`${TH} text-right`}>Hạng mục</th><th className={`${TH} text-right`}>SL xong</th>
            <th className={`${TH} text-right`}>Giờ trong ca (thường mất)</th><th className={`${TH} text-right`}>Giờ nên hẹn</th><th className={`${TH} text-right`}>Ngày lịch (thường mất)</th>
            <th className={`${TH} text-right`}>Giờ / đơn vị (thường mất)</th><th className={`${TH} text-right`}>Tạm ngưng</th>
          </tr></thead>
          <tbody>
            {(d.congDoan ?? []).map(c => (
              <tr key={c.congDoanId} className="border-t border-slate-100">
                <td className={TD}>{c.ten}</td>
                <td className={`${TD} text-right tabular-nums`}>{so(c.soHm, 0)}</td>
                <td className={`${TD} text-right tabular-nums`}>{so(c.slXong, 0)}</td>
                <td className={`${TD} text-right font-semibold tabular-nums`}>{c.gioCaTv ? so(c.gioCaTv) : '—'}</td>
                <td className={`${TD} text-right tabular-nums`}>{c.gioCaP75 ? so(c.gioCaP75) : '—'}</td>
                <td className={`${TD} text-right tabular-nums`}>{c.ngayChayTv ? so(c.ngayChayTv) : '—'}</td>
                <td className={`${TD} text-right tabular-nums`}>{c.gioTrenDvTv ? so(c.gioTrenDvTv, 2) : '—'}</td>
                <td className={`${TD} text-right tabular-nums`}>{c.soNgung ? `${so(c.soNgung, 0)} lần · ${c.hmNgung} HM` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          Giờ trong ca: thời gian công đoạn chạy, chỉ tính trong ca chính (không phải giờ công người — xem tab Theo tổ / Theo hạng mục).
          Ngày lịch: tính cả đêm và ngày nghỉ.
          Giờ / đơn vị theo đơn vị của hạng mục (bộ, cái, tấm…).
        </p>
      </div>

      {nhom.length > 0 && (
        <div className={KHUNG}>
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Theo nhóm sản phẩm</p>
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <th className={TH}>Nhóm</th><th className={`${TH} text-right`}>Hạng mục</th><th className={`${TH} text-right`}>Đã xong</th>
              <th className={`${TH} text-right`}>Ngày trong xưởng (thường mất)</th><th className={`${TH} text-right`}>Ngày nên hẹn</th><th className={`${TH} text-right`}>Giờ trong ca / hạng mục (thường mất)</th>
            </tr></thead>
            <tbody>
              {(d.nhom ?? []).map(n => (
                <tr key={n.ten} className="border-t border-slate-100">
                  <td className={TD}>{n.ten}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(n.soHm, 0)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{so(n.soXong, 0)}</td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{n.soXong ? so(n.ngayTv) : '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n.soXong ? so(n.ngayP75) : '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n.gioCaTv ? so(n.gioCaTv) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
