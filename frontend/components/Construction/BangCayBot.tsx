import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tinhCayDem, type NutDem } from './core/cayDem';
import { Chip, NutMoTatCa, type HexInfo } from './ProjectHealthTabs';
import { fmtInt, fmtTy } from '../../utils/format';
import { khung as khungB, soBam, soO, table, tdB, tfoot, thB, thead } from '../shared/bangBaoCao';

// ============================================================================
// Bảng kế hoạch nhập kho của tab BOT, cùng kiểu bảng tab BOP: dòng theo công trình / sản phẩm / xưởng, mở dòng ra
// nút chọn chiều, cột ngày gộp theo tháng (bấm + mới tách ngày), bấm số xem danh sách HEX.
// ============================================================================

export type ChieuBot = 'ct' | 'nsp' | 'xuong';
export const TEN_CHIEU_BOT: Record<ChieuBot, string> = { ct: 'Công trình', nsp: 'Sản phẩm', xuong: 'Xưởng' };
const BAC: Record<ChieuBot, ChieuBot[]> = { ct: ['ct', 'nsp', 'xuong'], nsp: ['nsp', 'ct', 'xuong'], xuong: ['xuong', 'ct', 'nsp'] };
const KHONG: Record<ChieuBot, string> = { ct: '(Chưa có công trình)', nsp: '(Chưa có nhóm)', xuong: '(Chưa có xưởng)' };
const giaTriChieu: Record<ChieuBot, (h: HexInfo) => string> = {
  ct: h => h.congTrinh || KHONG.ct, nsp: h => h.nhomSp || KHONG.nsp, xuong: h => h.area || KHONG.xuong,
};
const NOI = '\u0000';
const nhanNgay = (k: string) => `${k.slice(8)}/${k.slice(5, 7)}`;

const sapNut = (b: ChieuBot[]) => (x: NutDem, y: NutDem, bac: number) => {
  const c = b[bac], cuoi = Number(x.ten === KHONG[c]) - Number(y.ten === KHONG[c]);
  return cuoi || (c === 'ct' ? y.total - x.total : 0) || x.ten.localeCompare(y.ten, 'vi', { numeric: true });
};

export type ChonBot = { khoa: string; ten: string; ds: HexInfo[] } | null;

export const BangCayBot = ({ ds, cotOf, cheDo, tatCa, ten, chon, onChon, theoGiaTri }: {
  /** true: cộng trị giá hạng mục, in tỷ; false: đếm hạng mục */
  theoGiaTri: boolean;
  ds: HexInfo[];
  /** Khoá ngày 'YYYY-MM-DD'; rỗng = chưa có ngày */
  cotOf: (h: HexInfo) => string;
  cheDo: ChieuBot;
  tatCa: boolean;
  /** Tên bảng, đứng đầu tiêu đề danh sách HEX */
  ten: string;
  chon: ChonBot;
  onChon: (o: ChonBot) => void;
}) => {
  const [moDong, setMoDong] = useState<Set<string>>(new Set());
  const [chonCon, setChonCon] = useState<Record<string, ChieuBot>>({});
  const [moThang, setMoThang] = useState<Set<string>>(new Set());
  const khung = useRef<HTMLDivElement>(null);
  const [rong, setRong] = useState(0);
  useEffect(() => {
    const el = khung.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRong(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setMoDong(new Set()); setChonCon({}); }, [cheDo]);

  const bac = useMemo(() => BAC[cheDo].filter(c => tatCa || c !== 'ct'), [cheDo, tatCa]);
  const bacDao = useMemo<ChieuBot[]>(() => [bac[0], bac[2], bac[1]], [bac]);
  const tinh = (b: ChieuBot[]) => tinhCayDem(ds, h => b.map(c => giaTriChieu[c](h)), cotOf, sapNut(b), theoGiaTri ? h => Math.max(h.total, 0) : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cay = useMemo(() => tinh(bac), [ds, bac, cotOf, theoGiaTri]);
  const canDao = tatCa && Object.values(chonCon).includes(bacDao[1]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cayDao = useMemo(() => (canDao ? new Map(tinh(bacDao).goc.map(n => [n.ten, n])) : null), [canDao, ds, bacDao, cotOf, theoGiaTri]);

  // Cột gộp theo tháng; chưa có ngày để cuối
  const thang = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of cay.cols) if (k) m.set(k.slice(0, 7), [...(m.get(k.slice(0, 7)) ?? []), k]);
    return [...m.entries()].map(([t, ngay]) => ({ t, ngay }));
  }, [cay.cols]);
  const coTrong = (cay.colTot[''] ?? 0) > 0;
  const tenThang = (t: string) => `${t.slice(5)}/${t.slice(0, 4)}`;
  const cot = [
    ...thang.flatMap(g => (moThang.has(g.t) ? g.ngay.map(n => ({ key: n, ngay: [n], nhan: nhanNgay(n) })) : [{ key: `g${g.t}`, ngay: g.ngay, nhan: tenThang(g.t) }])),
    ...(coTrong ? [{ key: 'trong', ngay: [''], nhan: 'Chưa có ngày' }] : []),
  ];
  const coSoRong = rong >= 1300;
  const rongTen = Math.max(256, rong - cot.reduce((a, c) => a + (c.key.startsWith('g') ? 96 : 72), 0) - 96);

  const congCot = (o: Record<string, number>, ngay: string[]) => ngay.reduce((a, k) => a + (o[k] ?? 0), 0);
  const khoaO = (duong: string[], b: ChieuBot[], ngay: string[] | null) => JSON.stringify([duong, b, ngay]);
  const bam = (duong: string[], b: ChieuBot[], ngay: string[] | null, nhan: string) => {
    const khoa = khoaO(duong, b, ngay);
    if (chon?.khoa === khoa) return onChon(null);
    const hop = ds.filter(h => duong.every((v, i) => giaTriChieu[b[i]](h) === v) && (!ngay || ngay.includes(cotOf(h))));
    onChon({ khoa, ten: [ten, ...duong, nhan].filter(Boolean).join(' · '), ds: hop });
  };
  const o = (v: number, duong: string[], b: ChieuBot[], ngay: string[] | null, nhan: string, cls = '') => (
    <td onClick={v ? () => bam(duong, b, ngay, nhan) : undefined}
      className={`${tdB} ${soO} ${v ? 'cursor-pointer hover:bg-amber-50' : ''} ${chon?.khoa === khoaO(duong, b, ngay) ? 'bg-amber-100 font-semibold' : ''} ${cls}`}>
      {v ? <span className={soBam}>{(theoGiaTri ? fmtTy : fmtInt)(v)}</span> : ''}
    </td>
  );
  const doi = (k: string) => setMoDong(m => { const n = new Set(m); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  let soDong = 0;
  const dong = (n: NutDem, b: ChieuBot[]): React.ReactNode => {
    soDong += 1;
    const sau = n.duong.length - 1, khoa = (sau ? [b[1], ...n.duong] : n.duong).join(NOI), mo = moDong.has(khoa);
    const nen = sau === 0 ? 'bg-white' : sau === 1 ? 'bg-slate-50' : 'bg-slate-100';
    const coChon = tatCa && sau === 0;
    const cho = coChon ? chonCon[n.ten] : undefined;
    const bacCon = cho === bacDao[1] ? bacDao : b;
    const con = !coChon ? n.con : !cho ? [] : cho === bacDao[1] ? cayDao?.get(n.ten)?.con ?? [] : n.con;
    if (mo && coChon) soDong += 1;
    return (
      <React.Fragment key={khoa}>
        <tr className={`${nen} text-slate-900`}>
          <td className={`${tdB} sticky left-0 z-[1] truncate text-[0.9375rem] ${nen} ${sau ? 'font-medium' : 'font-bold'}`} style={{ maxWidth: rongTen, paddingLeft: `${0.5 + sau * 1.25}rem` }} title={`${TEN_CHIEU_BOT[b[sau]]}: ${n.ten}`}>
            {n.con.length > 0
              ? <button type="button" onClick={() => doi(khoa)} className="text-left hover:underline"><span className="inline-block w-4 text-slate-400">{mo ? '▾' : '▸'}</span>{n.ten}</button>
              : <span className="pl-4">{n.ten}</span>}
          </td>
          {cot.map(c => <React.Fragment key={c.key}>{o(congCot(n.cells, c.ngay), n.duong, b, c.ngay, c.nhan)}</React.Fragment>)}
          {o(n.total, n.duong, b, null, '', 'font-bold')}
        </tr>
        {mo && coChon && (
          <tr className="bg-slate-50">
            <td colSpan={cot.length + 2} className={tdB}>
              <span className="sticky left-2 inline-flex gap-1 pl-5">
                {[bac[1], bac[2]].map(c => (
                  <Chip key={c} active={cho === c} onClick={() => setChonCon(m => { const x = { ...m }; if (x[n.ten] === c) delete x[n.ten]; else x[n.ten] = c; return x; })}>
                    Theo {TEN_CHIEU_BOT[c].toLowerCase()}
                  </Chip>
                ))}
              </span>
            </td>
          </tr>
        )}
        {mo && con.map(c => dong(c, bacCon))}
      </React.Fragment>
    );
  };
  const dongBang = cay.goc.map(n => dong(n, bac));
  const it = soDong <= 15 && coSoRong;
  return (
    <div ref={khung} style={{ height: `min(70vh, ${soDong * 52 + 120}px)` }} className={khungB}>
      <table className={`${table} h-full ${it ? '!text-base' : ''}`}>
        <thead className={thead}>
          <tr>
            <th rowSpan={2} className={`${thB} sticky left-0 z-20 w-px min-w-[13rem] whitespace-nowrap bg-emerald-300 text-center`}>
              {TEN_CHIEU_BOT[cheDo]}
              <NutMoTatCa onMo={() => setMoDong(new Set(cay.goc.map(n => n.ten)))} onThu={() => setMoDong(new Set())} />
            </th>
            {thang.map(g => {
              const mo = moThang.has(g.t);
              return (
                <th key={g.t} colSpan={mo ? g.ngay.length : 1} rowSpan={mo ? 1 : 2} title={mo ? 'Bấm để gộp lại 1 cột' : 'Bấm để tách từng ngày'}
                  onClick={() => setMoThang(m => { const n = new Set(m); if (n.has(g.t)) n.delete(g.t); else n.add(g.t); return n; })}
                  className={`${thB} cursor-pointer select-none whitespace-nowrap text-center text-sm hover:bg-emerald-400`}>
                  {tenThang(g.t)} <span className="font-bold text-emerald-800">{mo ? '−' : '+'}</span>
                </th>
              );
            })}
            {coTrong && <th rowSpan={2} className={`${thB} text-center text-sm leading-tight`}>Chưa có ngày</th>}
            <th rowSpan={2} style={{ minWidth: coSoRong ? 96 : undefined }} className={`${thB} text-center`}>Tổng</th>
          </tr>
          <tr>
            {thang.map(g => (moThang.has(g.t) ? g.ngay.map(n => <th key={n} className={`${thB} whitespace-nowrap text-center`}>{nhanNgay(n)}</th>) : null))}
          </tr>
        </thead>
        <tbody>{dongBang}</tbody>
        <tfoot className={tfoot}>
          <tr>
            <td className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
            {cot.map(c => <React.Fragment key={c.key}>{o(congCot(cay.colTot, c.ngay), [], bac, c.ngay, c.nhan)}</React.Fragment>)}
            {o(cay.tong, [], bac, null, 'Tất cả')}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
