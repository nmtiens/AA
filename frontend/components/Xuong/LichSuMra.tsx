import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { xuongSetupApi, type LichSuMra as Mra } from '../../services/xuongSetupApi';
import { KHUNG, TH, TD } from './xuongDesktopUi';

// ============================================================================
// BÁO CÁO → LỊCH SỬ MRA: phân tích dữ liệu MRA cũ (03/2025 – 02/2026) của xưởng, TÁCH RIÊNG số liệu app mới.
// MRA không có quân số tổ, số nhân công có thể đếm trùng => không có giờ công / % có việc. Dùng làm MỐC CHUẨN:
// mỗi công đoạn chạy bao lâu (giờ trong ca), hạng mục nằm trong xưởng bao nhiêu ngày theo nhóm sản phẩm, tạm ngưng.
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">{ten}</p>
      {phu && <p className="text-xs text-slate-500">{phu}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function LichSuMra({ xuong }: { xuong: string }) {
  const [d, setD] = useState<Mra | null>(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    let huy = false;
    setD(null); setLoi('');
    xuongSetupApi.lichSuMra(xuong).then(r => { if (huy) return; if (r.ok) setD(r.data); else setLoi(r.message); });
    return () => { huy = true; };
  }, [xuong]);

  if (loi) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>;
  if (!d) return <div className="flex justify-center py-10 text-slate-400"><RefreshCw className="animate-spin" size={18} /></div>;
  if (!d.coDuLieu || !d.tong) {
    return <p className={`${KHUNG} p-4 text-sm text-slate-600`}>Chưa có lịch sử MRA của xưởng {xuong} (chưa nạp, hoặc xưởng không dùng MRA).</p>;
  }
  const t = d.tong;
  const cd = (d.congDoan ?? []).filter(c => c.soHm >= 3);
  const cdBieuDo = [...cd].sort((a, b) => b.gioCaTv - a.gioCaTv).slice(0, 14).map(c => ({ ten: c.ten, tv: c.gioCaTv, p75: Math.max(0, c.gioCaP75 - c.gioCaTv) }));
  const nhom = (d.nhom ?? []).filter(n => n.soXong >= 3);

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        Dữ liệu MRA cũ ({ngayVi(t.tu)} – {ngayVi(t.den)}), tách riêng số liệu app mới. MRA không có quân số tổ và số nhân công có thể đếm trùng,
        nên không tính giờ công / tỷ lệ có việc. <b>Giờ trong ca</b> = phần thời gian chạy nằm trong ca chính (trừ nghỉ trưa, bỏ Chủ nhật);
        <b> ngày lịch</b> = tính cả đêm. Trung vị (TV) = mức giữa, P75 = 3/4 số hạng mục nhanh hơn mức này — dùng làm mốc khi lập kế hoạch.
        {t.khongKhopCd > 0 && ` ${so(t.khongKhopCd, 0)} thao tác MRA chưa khớp công đoạn của danh mục nên chưa tính.`}
      </p>

      <div className="grid grid-cols-2 gap-3 rmd:grid-cols-3 rxl:grid-cols-5">
        <The ten="Hạng mục đã qua xưởng" giaTri={so(t.soHm, 0)} phu={`${so(t.soHmXong, 0)} đã xong · ${so(t.soCap, 0)} lượt công đoạn`} />
        <The ten="Ngày trong xưởng (TV)" giaTri={`${so(t.ngayTv)} ngày`} phu={`P75: ${so(t.ngayP75)} ngày`} />
        <The ten="Giờ trong ca (tổng)" giaTri={so(t.gioCa, 0)} phu="cộng mọi công đoạn" />
        <The ten="Tạm ngưng" giaTri={`${so(t.soNgung, 0)} lần`} phu={`${so(t.gioNgung / 24, 0)} ngày lịch cộng dồn`} />
        <The ten="Công đoạn có số liệu" giaTri={so((d.congDoan ?? []).length, 0)} phu="xem bảng bên dưới" />
      </div>

      <div className="grid gap-3 rlg:grid-cols-2">
        <Khung ten="Mỗi hạng mục chạy bao lâu ở từng công đoạn" phu="Giờ trong ca: xanh = trung vị, vàng = thêm tới P75 (công đoạn chậm lên trên)">
          <div style={{ height: Math.max(180, cdBieuDo.length * 28 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cdBieuDo} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} unit=" g" />
                <YAxis type="category" dataKey="ten" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, ten: string) => [`${so(v)} giờ`, ten]} />
                <Bar dataKey="tv" name="Trung vị" stackId="a" fill={XANH} />
                <Bar dataKey="p75" name="Thêm tới P75" stackId="a" fill={VANG} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Khung>

        <Khung ten="Ngày nằm trong xưởng theo nhóm sản phẩm" phu="Từ thao tác đầu tới lần xong / giao cuối · trung vị và P75">
          <div style={{ height: Math.max(180, nhom.length * 30 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={nhom.map(n => ({ ten: n.ten, tv: n.ngayTv, p75: n.ngayP75 }))} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} unit=" ng" />
                <YAxis type="category" dataKey="ten" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, ten: string) => [`${so(v)} ngày`, ten]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tv" name="Trung vị" fill={LAM} />
                <Bar dataKey="p75" name="P75" fill="#93c5fd" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Khung>

        <Khung ten="Theo tháng" phu="Cột: hạng mục xong trong tháng · đường: giờ trong ca của các công đoạn bắt đầu trong tháng">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={(d.theoThang ?? []).map(m => ({ ...m, thang: `${m.thang.slice(5)}/${m.thang.slice(2, 4)}` }))} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="a" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="a" dataKey="soXong" name="Hạng mục xong" fill={XANH} radius={[3, 3, 0, 0]} />
                <Line yAxisId="b" dataKey="gioCa" name="Giờ trong ca" stroke={TIM} strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Khung>

        <Khung ten="Hạng mục nằm lâu nhất trong xưởng" phu="Đã xong · số ngày lịch từ thao tác đầu tới xong / giao cuối">
          <ul className="divide-y divide-slate-100 text-sm">
            {(d.lauNhat ?? []).slice(0, 10).map(h => (
              <li key={h.hex} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate"><b className="tabular-nums">{h.hex}</b> {h.ten ?? ''} <span className="text-xs text-slate-500">· {h.nhom}</span></span>
                <span className="shrink-0 tabular-nums text-slate-700">{so(h.ngay)} ngày</span>
              </li>
            ))}
          </ul>
        </Khung>
      </div>

      <div className={KHUNG}>
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Mốc chuẩn theo công đoạn ({(d.congDoan ?? []).length})</p>
        <table className="w-full min-w-[56rem] text-sm rmd:min-w-0">
          <thead className="bg-slate-50"><tr>
            <th className={TH}>Công đoạn</th><th className={`${TH} text-right`}>Hạng mục</th><th className={`${TH} text-right`}>SL xong</th>
            <th className={`${TH} text-right`}>Giờ trong ca TV</th><th className={`${TH} text-right`}>P75</th><th className={`${TH} text-right`}>Ngày lịch TV</th>
            <th className={`${TH} text-right`}>Giờ / đơn vị TV</th><th className={`${TH} text-right`}>Nhân công TB*</th>
            <th className={`${TH} text-right`}>NC × giờ*</th><th className={`${TH} text-right`}>Tạm ngưng</th>
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
                <td className={`${TD} text-right tabular-nums`}>{c.ncTb === null ? '—' : so(c.ncTb)}</td>
                <td className={`${TD} text-right tabular-nums`}>{c.ncGio ? so(c.ncGio, 0) : '—'}</td>
                <td className={`${TD} text-right tabular-nums`}>{c.soNgung ? `${so(c.soNgung, 0)} lần · ${c.hmNgung} HM` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          * Số nhân công MRA gốc (có thể đếm trùng khi một người khai ở nhiều hạng mục) — chỉ để tham khảo, không phải giờ công.
          Giờ / đơn vị theo đơn vị MRA ghi (có công đoạn đếm theo tấm, không theo bộ).
        </p>
      </div>

      {nhom.length > 0 && (
        <div className={KHUNG}>
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Theo nhóm sản phẩm</p>
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <th className={TH}>Nhóm</th><th className={`${TH} text-right`}>Hạng mục</th><th className={`${TH} text-right`}>Đã xong</th>
              <th className={`${TH} text-right`}>Ngày trong xưởng TV</th><th className={`${TH} text-right`}>P75</th><th className={`${TH} text-right`}>Giờ trong ca TV / HM</th>
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
