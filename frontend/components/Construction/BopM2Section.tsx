import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { TRONG_M2, NHOM_VAT_TU, pivotM2, giaTriLoc, docFileBopM2, khopCongTrinh, type DuLieuM2, type HexM2, type VatLieuM2 } from './core/bopM2';
import { Pivot, ChiTiet, Loc, khopO, tenO, TAT_CA, type ChonO } from './PivotExcel';
import { API_BASE_URL } from '../../services/dataService';
import { IPO_MAC_DINH } from '../../utils/productionMetrics';
import { fmtInt } from '../../utils/format';

// ============================================================================
// Tab BOM — ĐÚNG 2 pivot của sheet 01_REPORT trong file mẫu PC (không thêm số / cột nào ngoài template):
//   II. BOM - THEO DANH MỤC VẬT LIỆU (BOP-M2): NHÓM VẬT TƯ × BOP-M2, Count of CODE VẬT LIỆU,
//       lọc PHÂN LOẠI NHU CẦU ĐẶT MUA (mặc định tất cả)                                   — sheet 03_MATERIALS
//   3/ TÌNH TRẠNG VẬT TƯ THEO ĐƠN HÀNG (ITEM BY ITEM): PHÂN LOẠI NHÓM SẢN PHẨM × TÌNH TRẠNG BOP-M2 FINAL,
//       Count of HEX, lọc TÌNH TRẠNG IPO FINAL (mặc định 01. ĐANG SẢN XUẤT như file)           — sheet 02_DATA
// Bấm 1 số (ô / tổng dòng / tổng cột / tổng chung) => hiện các dòng nguồn làm nên số đó, giống "Show Details"
// (bấm đúp ô) của pivot Excel; cột chi tiết = cột của sheet nguồn đã nạp.
// Nguồn: DB (bảng bop_m2_*, backend/scripts/nap_bop_m2.py nạp; GET /api/bop-m2?ct=…). Công trình chưa nạp =>
// chọn file .xlsx đọc trên trình duyệt (nhớ ở máy này).
// ============================================================================

const MAC_DINH_IPO = IPO_MAC_DINH;
const khoaLuu = (ct: string) => `bopM2:${ct}`;

// Nhớ kết quả /api/bop-m2 theo mã công trình trong phiên (5 phút): chuyển tab / mở lại công trình không tải lại.
// Cửa sổ công trình gọi taiTruocBopM2 lúc mở để tab BOM có sẵn số khi bấm vào.
const NHO_MS = 5 * 60_000;
const boNho = new Map<string, { luc: number; ketQua?: DuLieuM2 | null; dangTai?: Promise<DuLieuM2 | null> }>();
const maCtOf = (ten: string) => ten.match(/CT\d{2}-\d{3}/i)?.[0]?.toUpperCase() ?? null;
export const taiTruocBopM2 = (tenCongTrinh: string): Promise<DuLieuM2 | null> => {
  const ma = maCtOf(tenCongTrinh);
  if (!ma) return Promise.resolve(null);
  const e = boNho.get(ma);
  if (e && Date.now() - e.luc < NHO_MS) return e.dangTai ?? Promise.resolve(e.ketQua ?? null);
  const dangTai = fetch(`${API_BASE_URL}/bop-m2?ct=${encodeURIComponent(ma)}`)
    .then(r => (r.ok ? r.json() : null))
    .then((d: DuLieuM2 | null) => {
      const kq = d && d.hex?.length ? d : null;
      boNho.set(ma, { luc: Date.now(), ketQua: kq });
      return kq;
    })
    .catch(() => { boNho.delete(ma); return null; });
  boNho.set(ma, { luc: Date.now(), dangTai });
  return dangTai;
};
/** Kết quả đã có sẵn (không chờ mạng): undefined = chưa có */
const coSan = (tenCongTrinh: string): DuLieuM2 | null | undefined => {
  const ma = maCtOf(tenCongTrinh);
  const e = ma ? boNho.get(ma) : undefined;
  return e && !e.dangTai && Date.now() - e.luc < NHO_MS ? e.ketQua ?? null : undefined;
};

const COT_VL: [string, (v: VatLieuM2) => string][] = [
  ['NHÓM VẬT TƯ', v => v.nhom], ['CODE VẬT LIỆU', v => v.code], ['MÔ TẢ VẬT LIỆU', v => v.moTa], ['TÌNH TRẠNG MẪU', v => v.ttMau],
  ['NGÀY DUYỆT MẪU', v => v.ngayDuyet], ['PHÂN LOẠI NHU CẦU ĐẶT MUA', v => v.nhuCau], ['GHI CHÚ', v => v.ghiChu],
  ['TÌNH TRẠNG PR', v => v.ttPr], ['NGÀY PR', v => v.ngayPr], ['NGÀY DỰ KIẾN GIAO HÀNG PMH NHẬP', v => v.ngayDuKien],
  ['NGÀY THỰC TẾ VỀ', v => v.ngayVe], ['BOP-M2', v => v.m],
];
const COT_HEX: [string, (h: HexM2) => string][] = [
  ['HEX', h => h.hex], ['MÃ NHÀ MÁY', h => h.maNm], ['TÊN HẠNG MỤC', h => h.hangMuc], ['PHÂN LOẠI NHÓM SẢN PHẨM', h => h.nhomSp],
  ['XƯỞNG CHÍNH', h => h.xuong], ['BOP', h => h.bop],
  ...NHOM_VAT_TU.map(n => [`BOP-M2 ${n}`, (h: HexM2) => h.m2[n] ?? ''] as [string, (h: HexM2) => string]),
  ['TÌNH TRẠNG BOP-M2 FINAL', h => h.final], ['TÌNH TRẠNG IPO FINAL', h => h.ipo],
];
export const BopM2Section = ({ tenCongTrinh, onHexClick }: { tenCongTrinh: string; onHexClick?: (hex: string) => void }) => {
  const [duLieu, setDuLieu] = useState<DuLieuM2 | null>(() => {
    const s0 = coSan(tenCongTrinh);
    if (s0) return s0;
    try { const s = localStorage.getItem(khoaLuu(tenCongTrinh)); return s ? JSON.parse(s) as DuLieuM2 : null; } catch { return null; }
  });
  const [dangDoc, setDangDoc] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const oFile = useRef<HTMLInputElement>(null);
  // 'tai' = đang hỏi DB; 'db' = đang hiện dữ liệu DB; 'khong' = DB chưa có công trình này
  const [nguonDb, setNguonDb] = useState<'tai' | 'db' | 'khong'>(() => {
    const s0 = coSan(tenCongTrinh);
    return s0 ? 'db' : s0 === null ? 'khong' : 'tai';
  });

  useEffect(() => {
    let bo = false;
    taiTruocBopM2(tenCongTrinh).then(d => {
      if (bo) return;
      if (d) { setDuLieu(d); setNguonDb('db'); } else setNguonDb('khong');
    });
    return () => { bo = true; };
  }, [tenCongTrinh]);

  const chonFile = async (f: File | undefined) => {
    if (!f) return;
    setDangDoc(true); setLoi(null);
    try {
      const d = await docFileBopM2(await f.arrayBuffer(), f.name);
      if (!khopCongTrinh(d, tenCongTrinh)) throw new Error(`File thuộc công trình ${d.maCt || '(không rõ mã)'}, không phải công trình đang xem`);
      setDuLieu(d);
      try { localStorage.setItem(khoaLuu(tenCongTrinh), JSON.stringify(d)); } catch { /* đầy bộ nhớ / chế độ riêng tư: chỉ giữ trong phiên */ }
    } catch (e) {
      setLoi(e instanceof Error ? e.message : String(e));
    } finally {
      setDangDoc(false);
      if (oFile.current) oFile.current.value = '';
    }
  };
  const xoa = () => {
    setDuLieu(null);
    try { localStorage.removeItem(khoaLuu(tenCongTrinh)); } catch { /* bỏ qua */ }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          {nguonDb === 'tai' && !duLieu ? 'Đang tải…'
            : duLieu
              ? `Nguồn: file ${duLieu.nguon}${duLieu.docLuc ? ` (${nguonDb === 'db' ? 'nạp vào DB' : 'đọc trên máy này'} lúc ${new Date(duLieu.docLuc).toLocaleString('vi-VN')})` : ''}`
              : 'Công trình chưa được nạp vào DB — chọn file Excel của công trình để xem.'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input ref={oFile} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={e => chonFile(e.target.files?.[0])} />
          {nguonDb !== 'db' && (
            <button type="button" onClick={() => oFile.current?.click()} disabled={dangDoc}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <FileSpreadsheet size={13} /> {dangDoc ? 'Đang đọc file…' : duLieu ? 'Đọc lại file' : 'Chọn file Excel'}
            </button>
          )}
          {duLieu && nguonDb !== 'db' && <button type="button" onClick={xoa} title="Xoá dữ liệu đã đọc trên máy này" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={14} /></button>}
        </div>
      </div>
      {loi && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{loi}</p>}

      {duLieu && <HaiBangBom duLieu={duLieu} onHexClick={onHexClick} />}
    </div>
  );
};

/** 2 pivot của tab BOM (II. BOM theo danh mục vật liệu + 3/ Tình trạng vật tư theo đơn hàng) trên 1 bộ dữ liệu */
const HaiBangBom = ({ duLieu, onHexClick, coCt = false }: {
  duLieu: Pick<DuLieuM2, 'hex' | 'vatLieu'>; onHexClick?: (hex: string) => void;
  /** Nhiều công trình: danh sách chi tiết có thêm cột CÔNG TRÌNH */
  coCt?: boolean;
}) => {
  const [nhuCau, setNhuCau] = useState(TAT_CA);
  const [ipo, setIpo] = useState<string | null>(null); // null = mặc định của file
  const [oVl, setOVl] = useState<ChonO>(null);
  const [oHex, setOHex] = useState<ChonO>(null);
  // II. BOM theo danh mục vật liệu — Count of CODE VẬT LIỆU (dòng CODE trống không đếm)
  const vl = useMemo(() => (duLieu?.vatLieu ?? []).filter(v => v.code), [duLieu]);
  const dsNhuCau = useMemo(() => giaTriLoc(vl, (v: VatLieuM2) => v.nhuCau), [vl]);
  const vlLoc = useMemo(() => vl.filter(v => nhuCau === TAT_CA || (v.nhuCau || TRONG_M2) === nhuCau), [vl, nhuCau]);
  const bangVl = useMemo(() => pivotM2(vlLoc, v => v.nhom, v => v.m), [vlLoc]);

  // 3/ Tình trạng vật tư theo đơn hàng — Count of HEX, lọc TÌNH TRẠNG IPO FINAL
  const hex = useMemo(() => duLieu?.hex ?? [], [duLieu]);
  const dsIpo = useMemo(() => giaTriLoc(hex, (h: HexM2) => h.ipo), [hex]);
  const ipoChon = ipo ?? (dsIpo.includes(MAC_DINH_IPO) ? MAC_DINH_IPO : TAT_CA);
  const hexLoc = useMemo(() => hex.filter(h => ipoChon === TAT_CA || (h.ipo || TRONG_M2) === ipoChon), [hex, ipoChon]);
  const bangHex = useMemo(() => pivotM2(hexLoc, h => h.nhomSp, h => h.final), [hexLoc]);

  return (
    <>
        <section className="space-y-2">
          <h3 className="text-lg font-bold text-red-600">II. BOM - THEO DANH MỤC VẬT LIỆU (BOP-M2)</h3>
          <Loc nhan="PHÂN LOẠI NHU CẦU ĐẶT MUA" gia={nhuCau} ds={dsNhuCau} onDoi={v => { setNhuCau(v); setOVl(null); }} />
          <Pivot cotDong="NHÓM VẬT TƯ" p={bangVl} chon={oVl} onChon={setOVl} />
          {oVl && (
            <ChiTiet tieuDe={`Chi tiết vật liệu: ${tenO(oVl)}`} cot={coCt ? [['CÔNG TRÌNH', v => v.ct ?? ''], ...COT_VL] : COT_VL} onDong={() => setOVl(null)}
              ds={vlLoc.filter(khopO(oVl, (v: VatLieuM2) => v.nhom, v => v.m))} />
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-bold text-red-600">3/ TÌNH TRẠNG VẬT TƯ THEO ĐƠN HÀNG (ITEM BY ITEM)</h3>
          <Loc nhan="TÌNH TRẠNG IPO FINAL" gia={ipoChon} ds={dsIpo} onDoi={v => { setIpo(v); setOHex(null); }} />
          <Pivot cotDong="PHÂN LOẠI NHÓM SẢN PHẨM" p={bangHex} chon={oHex} onChon={setOHex} />
          {oHex && (
            <ChiTiet tieuDe={`Chi tiết HEX: ${tenO(oHex)}`} cot={coCt ? [['CÔNG TRÌNH', h => h.ct ?? ''], ...COT_HEX] : COT_HEX} onDong={() => setOHex(null)} onHex={onHexClick}
              ds={hexLoc.filter(khopO(oHex, (h: HexM2) => h.nhomSp, h => h.final))} />
          )}
        </section>

    </>
  );
};

// ============================================================================
// BOM cho TẤT CẢ công trình đang xem (trang Báo cáo tiến độ công trình): cùng 2 pivot, gộp mọi công trình đã nạp
// BOP-M2 vào DB (GET /api/bop-m2/nhieu). Công trình chưa nạp file thì không có số.
// ============================================================================
type KqNhieu = { khoa: string; soCt: number; duLieu: Pick<DuLieuM2, 'hex' | 'vatLieu'> };
// Nhớ kết quả /api/bop-m2/nhieu theo danh sách mã công trình trong phiên (5 phút): chuyển qua lại tab Tổng quan /
// BOP / BOT / BOM không tải lại; trang gọi taiTruocBomTatCa lúc mở để bấm BOM là có số ngay
const boNhoNhieu = new Map<string, { luc: number; kq?: KqNhieu; dangTai?: Promise<KqNhieu> }>();
const khoaMa = (tenCongTrinh: string[]) => [...new Set(tenCongTrinh.map(maCtOf).filter((x): x is string => !!x))].sort().join(',');
export const taiTruocBomTatCa = (tenCongTrinh: string[]): Promise<KqNhieu> | null => {
  const khoa = khoaMa(tenCongTrinh);
  if (!khoa) return null;
  const e = boNhoNhieu.get(khoa);
  if (e && Date.now() - e.luc < NHO_MS) return e.dangTai ?? Promise.resolve(e.kq!);
  const dangTai = fetch(`${API_BASE_URL}/bop-m2/nhieu?cts=${encodeURIComponent(khoa)}`)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
    .then((d: { soCt: number; hex: HexM2[]; vatLieu: VatLieuM2[] }) => {
      const kq: KqNhieu = { khoa, soCt: d.soCt, duLieu: { hex: d.hex ?? [], vatLieu: d.vatLieu ?? [] } };
      boNhoNhieu.set(khoa, { luc: Date.now(), kq });
      if (boNhoNhieu.size > 6) boNhoNhieu.delete(boNhoNhieu.keys().next().value!);
      return kq;
    })
    .catch(err => { boNhoNhieu.delete(khoa); throw err; });
  boNhoNhieu.set(khoa, { luc: Date.now(), dangTai });
  return dangTai;
};

export const BomTatCa = ({ tenCongTrinh, onHexClick }: { tenCongTrinh: string[]; onHexClick?: (hex: string) => void }) => {
  const khoa = useMemo(() => khoaMa(tenCongTrinh), [tenCongTrinh]);
  const ma = khoa ? khoa.split(',') : [];
  const [kq, setKq] = useState<KqNhieu | null>(() => boNhoNhieu.get(khoa)?.kq ?? null);
  const [loi, setLoi] = useState<string | null>(null);
  useEffect(() => {
    if (!khoa) return;
    let bo = false;
    setLoi(null);
    const co = boNhoNhieu.get(khoa)?.kq;
    if (co) { setKq(co); return; }
    taiTruocBomTatCa(tenCongTrinh)?.then(k => { if (!bo) setKq(k); })
      .catch(e => { if (!bo) setLoi(e instanceof Error ? e.message : String(e)); });
    return () => { bo = true; };
  }, [khoa]); // eslint-disable-line react-hooks/exhaustive-deps
  const dangTai = !!khoa && kq?.khoa !== khoa && !loi;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {!khoa ? 'Không có công trình nào có mã CTxx-xxx trong phạm vi đang xem.'
          : loi ? <span className="text-red-600">Không tải được BOP-M2 ({loi}).</span>
          : dangTai ? 'Đang tải BOP-M2 của các công trình…'
          : <><b className="text-slate-800">{fmtInt(kq!.soCt)}</b> / {fmtInt(ma.length)} công trình đã nạp · {fmtInt(kq!.duLieu.hex.length)} HEX · {fmtInt(kq!.duLieu.vatLieu.length)} dòng vật liệu</>}
      </p>
      {kq && kq.khoa === khoa && <HaiBangBom key={khoa} duLieu={kq.duLieu} onHexClick={onHexClick} coCt />}
    </div>
  );
};
