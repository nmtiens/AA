import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Chip, NutMoTatCa } from './ProjectHealthTabs';
import { giaTriLoc, TRONG_M2 } from './core/bopM2';
import { fmtInt } from '../../utils/format';
import * as bang from '../shared/bangBaoCao';
import { mauLuong, soSanhThuTu, sttHienThi } from './core/thuTuNhom';
import { useThuTuLuongDo } from './useThuTuLuongDo';

// ============================================================================
// Pivot dạng cây cho tab BOM — cùng kiểu bảng BÁO CÁO BOT (BaoCaoBot): nút "Dòng theo" Công trình / Sản phẩm / Xưởng…
// (khung viền, nút đen khi chọn); theo công trình có cột STT (danh sách Luồng đỏ, ngoài luồng đánh tiếp), cột TÊN
// CÔNG TRÌNH, nền dòng theo luồng; tiêu đề có nút sắp xếp từng cột + / − mở / thu tất cả; bấm ▸ mở dòng gốc => hàng
// nút "Theo …" chọn chiều tách (còn 1 chiều thì hiện thẳng); dòng con thụt vào, nền xám nhạt dần; dòng TỔNG vàng.
// Số = đếm dòng (như "Count of" của pivot Excel). Bấm số => danh sách dòng nguồn.
// ============================================================================

export type ChieuCay<T> = {
  k: string;
  /** Tên chiều: nút "Dòng theo", "Theo …" và tiêu đề cột dòng */
  ten: string;
  of: (x: T) => string;
  /** Chữ hiện khi giá trị trống */
  khong: string;
  /** Chiều công trình: STT + xếp + tô màu theo danh sách Luồng đỏ */
  laCt?: boolean;
  /** Chữ hiện của 1 giá trị (vd mã CT => tên đầy đủ) */
  nhan?: (v: string) => string;
};
export type ChonCay<T> = { khoa: string; ten: string; ds: T[] } | null;

type Nut<T> = { ten: string; ds: T[]; cells: Record<string, T[]> };
const NOI = '\u0000';
const nutCls = (bat: boolean) => `h-full rounded px-2.5 font-semibold transition ${bat ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`;

/** Nút "Dòng theo" (Công trình / Sản phẩm / Xưởng…) — cùng khung nút của BÁO CÁO BOT */
export function NutChieu<T>({ chieu, chon, onChon }: { chieu: ChieuCay<T>[]; chon: string; onChon: (k: string) => void }) {
  if (chieu.length < 2) return null;
  return (
    <div className="flex h-9 items-center rounded-lg border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="Dòng theo">
      {chieu.map(c => (
        <button key={c.k} type="button" aria-pressed={chon === c.k} onClick={() => onChon(c.k)} title={`Mỗi dòng là 1 ${c.ten.toLowerCase()}; bấm ▸ để tách tiếp`}
          className={nutCls(chon === c.k)}>{c.ten}</button>
      ))}
    </div>
  );
}

export function PivotCay<T>({ ds, chieu, goc, cotOf, nhanCot = m => m, ten, chon, onChon }: {
  ds: T[];
  /** Mọi chiều dùng được */
  chieu: ChieuCay<T>[];
  /** Khoá chiều gốc */
  goc: string;
  cotOf: (x: T) => string;
  nhanCot?: (m: string) => string;
  /** Tên bảng, đứng đầu tiêu đề danh sách chi tiết (rỗng = không) */
  ten: string;
  chon: ChonCay<T>;
  onChon: (o: ChonCay<T>) => void;
}) {
  const thuTu = useThuTuLuongDo();
  const [moDong, setMoDong] = useState<Set<string>>(new Set());
  // Chiều tách đã chọn của dòng đang mở (khoá dòng => khoá chiều); chưa chọn thì chưa hiện dòng con (như BOT)
  const [chonCon, setChonCon] = useState<Record<string, string>>({});
  const [sapCot, setSapCot] = useState<{ k: string; giam: boolean } | null>(null);
  useEffect(() => { setMoDong(new Set()); setChonCon({}); setSapCot(null); }, [goc]);

  const cGoc = chieu.find(c => c.k === goc) ?? chieu[0];
  const laCt = !!cGoc.laCt;
  const cotCua = (x: T) => cotOf(x) || TRONG_M2;
  const cols = useMemo(() => giaTriLoc(ds, cotOf), [ds, cotOf]);
  const hienTen = (c: ChieuCay<T>, v: string) => (c.nhan ? c.nhan(v) : v);

  const nhom = (xs: T[], c: ChieuCay<T>): Nut<T>[] => {
    const m = new Map<string, Nut<T>>();
    for (const x of xs) {
      const v = c.of(x) || c.khong;
      let n = m.get(v);
      if (!n) { n = { ten: v, ds: [], cells: {} }; m.set(v, n); }
      n.ds.push(x);
      (n.cells[cotCua(x)] ??= []).push(x);
    }
    const viTri = new Map(giaTriLoc(xs, x => c.of(x)).map((v, i) => [v, i]));
    // Công trình: luồng theo STT rồi số dòng giảm dần; chiều khác: như pivot (trống cuối)
    return [...m.values()].sort((a, b) => {
      const cuoi = Number(a.ten === c.khong) - Number(b.ten === c.khong);
      if (cuoi) return cuoi;
      if (c.laCt) return soSanhThuTu(thuTu(hienTen(c, a.ten)), thuTu(hienTen(c, b.ten))) || b.ds.length - a.ds.length || a.ten.localeCompare(b.ten, 'vi', { numeric: true });
      return (viTri.get(a.ten) ?? 0) - (viTri.get(b.ten) ?? 0);
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gocMacDinh = useMemo(() => nhom(ds, cGoc), [ds, cGoc, cotOf, thuTu]);
  // STT theo thứ tự mặc định (luồng trước), không đổi khi bấm sắp xếp cột
  const stt = useMemo(() => {
    if (!laCt) return new Map<string, number>();
    const so = sttHienThi(gocMacDinh.map(n => thuTu(hienTen(cGoc, n.ten))));
    return new Map(gocMacDinh.map((n, i) => [n.ten, so[i]]));
  }, [gocMacDinh, laCt]); // eslint-disable-line react-hooks/exhaustive-deps
  const dongGoc = useMemo(() => {
    if (!sapCot) return gocMacDinh;
    const k = sapCot.k;
    const gt = (n: Nut<T>): number | string => (k === 'ten' ? hienTen(cGoc, n.ten) : k === 'stt' ? stt.get(n.ten) ?? 0
      : k === 'tong' ? n.ds.length : n.cells[k]?.length ?? 0);
    const so = (a: number | string, b: number | string) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'vi', { numeric: true }));
    return [...gocMacDinh].sort((a, b) => (sapCot.giam ? so(gt(b), gt(a)) : so(gt(a), gt(b))));
  }, [gocMacDinh, sapCot, stt]); // eslint-disable-line react-hooks/exhaustive-deps

  const doiSap = (k: string) => setSapCot(s => {
    const dau = k !== 'ten' && k !== 'stt';                     // số: lớn trước; chữ / STT: nhỏ trước
    if (!s || s.k !== k) return { k, giam: dau };
    return s.giam === dau ? { k, giam: !dau } : null;
  });
  const NutSap = ({ k }: { k: string }) => (
    <button type="button" onClick={() => doiSap(k)} title="Sắp xếp (bấm lần 3 về thứ tự mặc định)" aria-label="Sắp xếp"
      className={`ml-0.5 inline-flex align-middle ${sapCot?.k === k ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
      {sapCot?.k === k ? (sapCot.giam ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5" />}
    </button>
  );

  const soCot = (laCt ? 1 : 0) + 1 + cols.length + 1;
  const oSo = (xs: T[] | undefined, khoaDong: string, duongTen: string[], m: string | null, dam = false) => {
    const v = xs?.length ?? 0, khoa = `${khoaDong}${NOI}${m ?? '*'}`;
    const bam = () => {
      if (chon?.khoa === khoa) return onChon(null);
      onChon({ khoa, ten: [ten, ...duongTen, m ? nhanCot(m) : ''].filter(Boolean).join(' · ') || 'Tất cả', ds: xs! });
    };
    return (
      <td key={m ?? '*'} className={`${bang.tdSo} ${dam ? 'font-bold' : ''} ${chon?.khoa === khoa ? '!bg-amber-100' : ''}`}>
        {v ? <button type="button" onClick={bam} title="Bấm để xem chi tiết" className={`${bang.soBam} hover:text-blue-700`}>{fmtInt(v)}</button> : ''}
      </td>
    );
  };
  const doi = (k: string) => setMoDong(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const conLaiSau = (daDung: ChieuCay<T>[]) => chieu.filter(x => !daDung.includes(x));

  // Phần mở của 1 dòng: còn ≥ 2 chiều => hàng nút "Theo …" (chưa chọn thì chưa hiện dòng con); còn 1 => hiện thẳng
  const phanMo = (n: Nut<T>, daDung: ChieuCay<T>[], khoa: string, duong: string[]): React.ReactNode => {
    if (!moDong.has(khoa)) return null;
    const conLai = conLaiSau(daDung);
    const cCon = conLai.length === 1 ? conLai[0] : conLai.find(x => x.k === chonCon[khoa]);
    return (
      <>
        {conLai.length > 1 && (
          <tr className="bg-slate-50">
            <td colSpan={soCot} className={bang.tdB}>
              <span className="sticky left-2 inline-flex gap-1" style={{ paddingLeft: `${1.25 + (daDung.length - 1) * 1.5}rem` }}>
                {conLai.map(x => (
                  <Chip key={x.k} active={cCon === x}
                    onClick={() => setChonCon(s => { const t = { ...s }; if (t[khoa] === x.k) delete t[khoa]; else t[khoa] = x.k; return t; })}>
                    Theo {x.ten.toLowerCase()}
                  </Chip>
                ))}
              </span>
            </td>
          </tr>
        )}
        {cCon && nhom(n.ds, cCon).map(con => dongCon(con, cCon, daDung, khoa, duong))}
      </>
    );
  };
  // Dòng con: thụt vào theo bậc, nền xám nhạt dần
  const dongCon = (n: Nut<T>, c: ChieuCay<T>, daDungCha: ChieuCay<T>[], cha: string, duongCha: string[]): React.ReactNode => {
    const daDung = [...daDungCha, c], sau = daDungCha.length, khoa = `${cha}${NOI}${c.k}=${n.ten}`, mo = moDong.has(khoa);
    const hien = hienTen(c, n.ten), duong = [...duongCha, hien], coCon = conLaiSau(daDung).length > 0;
    const nen = sau === 1 ? 'bg-slate-50' : 'bg-slate-100';
    return (
      <React.Fragment key={khoa}>
        <tr className={`${nen} hover:bg-blue-50`}>
          {laCt && <td className={bang.tdSo} />}
          <td className={`${bang.tdB} sticky left-0 z-[1] whitespace-nowrap font-medium ${nen}`} style={{ paddingLeft: `${0.5 + sau * 1.5}rem` }} title={`${c.ten}: ${hien}`}>
            {coCon
              ? <button type="button" onClick={() => doi(khoa)} aria-expanded={mo} className="text-left hover:underline"><span className="inline-block w-4 text-slate-400">{mo ? '▾' : '▸'}</span>{hien}</button>
              : <span className="pl-4">{hien}</span>}
          </td>
          {cols.map(m => oSo(n.cells[m], khoa, duong, m))}
          {oSo(n.ds, khoa, duong, null, true)}
        </tr>
        {phanMo(n, daDung, khoa, duong)}
      </React.Fragment>
    );
  };
  const dongGocCua = (n: Nut<T>): React.ReactNode => {
    const khoa = `${NOI}${cGoc.k}=${n.ten}`, mo = moDong.has(khoa), hien = hienTen(cGoc, n.ten), duong = [hien];
    const mau = laCt ? mauLuong(thuTu(hien)) : null;
    const nen = mau ? mau.nen : 'bg-white';
    const coCon = chieu.length > 1;
    return (
      <React.Fragment key={khoa}>
        <tr className={`${nen} ${mau ? mau.hover : 'hover:bg-blue-50'}`} title={mau ? mau.nhan : undefined}>
          {laCt && <td className={`${bang.tdSo} ${mau?.stt ?? ''}`}>{stt.get(n.ten)}</td>}
          <td className={`${bang.tdB} sticky left-0 z-[1] font-bold ${nen}`}>
            <div className="w-max min-w-[16rem] whitespace-nowrap text-left">
              {coCon
                ? <button type="button" onClick={() => doi(khoa)} aria-expanded={mo} title={mo ? 'Thu lại' : `Mở xem theo ${conLaiSau([cGoc]).map(x => x.ten.toLowerCase()).join(' / ')}`}
                    className="hover:underline"><span className="mr-1 inline-block w-4 text-slate-500">{mo ? '▾' : '▸'}</span>{hien}</button>
                : hien}
            </div>
          </td>
          {cols.map(m => oSo(n.cells[m], khoa, duong, m))}
          {oSo(n.ds, khoa, duong, null, true)}
        </tr>
        {phanMo(n, [cGoc], khoa, duong)}
      </React.Fragment>
    );
  };

  if (!ds.length) return <p className="text-sm text-slate-500">Không có dữ liệu.</p>;
  const tongCot = theoCot(ds, cotCua);
  return (
    <div className={`${bang.khung} max-h-[70vh]`}>
      <table className={bang.table}>
        <thead className={bang.thead}>
          <tr>
            {laCt && <th className={`${bang.thC} w-px`} title="STT theo danh sách Luồng đỏ (Setup → Nhóm công trình); ngoài luồng đánh tiếp">STT<NutSap k="stt" /></th>}
            <th className={`${bang.thC} sticky left-0 z-20 w-px whitespace-nowrap bg-emerald-300`}>
              {laCt ? 'TÊN CÔNG TRÌNH' : cGoc.ten.toUpperCase()}<NutSap k="ten" />
              {chieu.length > 1 && <NutMoTatCa onMo={() => setMoDong(new Set(dongGoc.map(n => `${NOI}${cGoc.k}=${n.ten}`)))} onThu={() => setMoDong(new Set())} />}
            </th>
            {cols.map(m => <th key={m} className={`${bang.thC} min-w-[5.5rem] whitespace-nowrap`}>{nhanCot(m)}<NutSap k={m} /></th>)}
            <th className={`${bang.thC} min-w-[6.5rem] whitespace-nowrap`}>TỔNG<NutSap k="tong" /></th>
          </tr>
        </thead>
        <tbody>{dongGoc.map(dongGocCua)}</tbody>
        <tfoot className={bang.tfoot}>
          <tr>
            <td colSpan={laCt ? 2 : 1} className={`${bang.tdB} left-0 !z-[3] text-center`}>TỔNG · {fmtInt(dongGoc.length)} {cGoc.ten.toLowerCase()}</td>
            {cols.map(m => oSo(tongCot[m], '', [], m))}
            {oSo(ds, '', [], null)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Dòng nguồn theo cột (dòng TỔNG) */
function theoCot<T>(ds: T[], cotCua: (x: T) => string): Record<string, T[]> {
  const t: Record<string, T[]> = {};
  for (const x of ds) (t[cotCua(x)] ??= []).push(x);
  return t;
}
