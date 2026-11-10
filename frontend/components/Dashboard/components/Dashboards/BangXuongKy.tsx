import { useEffect, useMemo, useState } from 'react';
import { useTrendFilter } from './TrendFilterContext';
import DetailDataModal from './DetailDataModal';
import * as bang from '../../../shared/bangBaoCao';
import { fmtInt, fmtTy } from '../../../../utils/format';
import { bienKy, chonKy, nhanKy, pivotXuongKy, type DongXuongKy } from './xuongKy';

type Nguon = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export';

interface Props {
  source: Nguon;
  displayMode: 'COUNT' | 'SUM';
  accentColor: string;
  title: string;
}

interface ChiTiet {
  tieuDe: string;
  rows: Record<string, unknown>[];
  columns: string[];
  truncated: boolean;
  loading: boolean;
}

/** Bảng xưởng × kỳ đầu trang Biểu đồ: dùng đúng bộ lọc chung, bấm số mở dữ liệu nguồn */
export default function BangXuongKy({ source, displayMode, accentColor, title }: Props) {
  const { dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai, hasCtWhitelist, ctWhitelistCsv, selectedDatesCsv } = useTrendFilter();
  const [rows, setRows] = useState<DongXuongKy[]>([]);
  const [loading, setLoading] = useState(true);
  const [chiTiet, setChiTiet] = useState<ChiTiet | null>(null);
  const coKhoang = Boolean(dateFrom && dateTo);
  const ky = coKhoang ? chonKy(dateFrom, dateTo) : 'month';

  useEffect(() => {
    if (!coKhoang) { setRows([]); setLoading(false); return; }
    let huy = false;
    setLoading(true);
    const p = new URLSearchParams({ source, dateFrom, dateTo, ky });
    if (xuong) p.set('xuong', xuong);
    if (congTrinh) p.set('congTrinh', congTrinh);
    if (dvt) p.set('dvt', dvt);
    if (phanLoai) p.set('phanLoai', phanLoai);
    if (hasCtWhitelist) p.set('ctWhitelist', ctWhitelistCsv);
    if (selectedDatesCsv) p.set('dates', selectedDatesCsv);
    fetch(`/api/trend-by-xuong?${p.toString()}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (!huy) setRows(Array.isArray(d) ? d : []); })
      .catch(err => { console.error('Lỗi bảng xưởng × kỳ:', err); if (!huy) setRows([]); })
      .finally(() => { if (!huy) setLoading(false); });
    return () => { huy = true; };
  }, [source, ky, coKhoang, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai, hasCtWhitelist, ctWhitelistCsv, selectedDatesCsv]);

  const laTien = displayMode === 'SUM';
  const b = useMemo(() => pivotXuongKy(rows, r => (laTien ? r.total : r.totalCount)), [rows, laTien]);
  const fmt = (v: number) => (laTien ? fmtTy(v) : fmtInt(v));

  const moChiTiet = async (x: string, k: string | null) => {
    const bien = k ? bienKy(k, ky, dateFrom, dateTo) : { tu: dateFrom, den: dateTo };
    setChiTiet({ tieuDe: `${title}, ${x}, ${k ? nhanKy(k, ky) : 'cả kỳ'}`, rows: [], columns: [], truncated: false, loading: true });
    try {
      const p = new URLSearchParams({ source, dimension: 'xuong', value: x, dateFrom: bien.tu, dateTo: bien.den });
      if (congTrinh) p.set('congTrinh', congTrinh);
      if (dvt) p.set('dvt', dvt);
      if (phanLoai) p.set('phanLoai', phanLoai);
      if (hasCtWhitelist) p.set('ctWhitelist', ctWhitelistCsv);
      if (selectedDatesCsv) p.set('dates', selectedDatesCsv);
      const r = await fetch(`/api/detail?${p.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setChiTiet(c => c && { ...c, rows: d.rows || [], columns: d.columns || [], truncated: !!d.truncated, loading: false });
    } catch (err) {
      console.error('Lỗi chi tiết bảng xưởng × kỳ:', err);
      setChiTiet(c => c && { ...c, loading: false });
    }
  };

  if (!coKhoang || (!loading && !b.dong.length)) return null;
  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Đang tải...</div>;

  const oSo = (v: number | undefined, x: string, k: string | null) => (v
    ? <button type="button" onClick={() => void moChiTiet(x, k)} className={bang.soBam}>{fmt(v)}</button>
    : '');

  return (
    <div>
      <div className={`${bang.khung} max-h-[420px] bg-white`}>
        <table className={bang.table}>
          <thead className={bang.thead}>
            <tr>
              <th className={`${bang.thB} text-left`}>Xưởng ({laTien ? 'tỷ' : 'hạng mục'})</th>
              {b.kys.map(k => <th key={k} className={`${bang.thC} whitespace-nowrap`}>{nhanKy(k, ky)}</th>)}
              <th className={bang.thC}>Tổng</th>
            </tr>
          </thead>
          <tbody>
            {b.dong.map(d => (
              <tr key={d.xuong}>
                <td className={`${bang.tdB} whitespace-nowrap`}>{d.xuong}</td>
                {b.kys.map(k => <td key={k} className={bang.tdSo}>{oSo(d.o[k], d.xuong, k)}</td>)}
                <td className={`${bang.tdSo} font-bold`}>{oSo(d.tong, d.xuong, null)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className={bang.tfoot}>
            <tr>
              <td className={bang.tdB}>TỔNG</td>
              {b.kys.map(k => <td key={k} className={bang.tdSo}>{bang.trong0(b.tongKy[k] ?? 0, fmt)}</td>)}
              <td className={bang.tdSo}>{bang.trong0(b.tong, fmt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {chiTiet && (
        <DetailDataModal
          open
          onClose={() => setChiTiet(null)}
          title={`Chi tiết ${chiTiet.tieuDe}`}
          accentColor={accentColor}
          rows={chiTiet.rows}
          columns={chiTiet.columns}
          loading={chiTiet.loading}
          truncated={chiTiet.truncated}
        />
      )}
    </div>
  );
}
