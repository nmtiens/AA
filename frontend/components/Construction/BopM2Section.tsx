import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { TRONG_M2, NHOM_VAT_TU, pivotM2, giaTriLoc, docFileBopM2, khopCongTrinh, type DuLieuM2, type HexM2, type VatLieuM2 } from './core/bopM2';
import { Pivot, ChiTiet, Loc, khopO, tenO, TAT_CA, type ChonO } from './PivotExcel';
import { API_BASE_URL } from '../../services/dataService';

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

const MAC_DINH_IPO = '01. ĐANG SẢN XUẤT';
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
  const [nhuCau, setNhuCau] = useState(TAT_CA);
  const [ipo, setIpo] = useState<string | null>(null); // null = mặc định của file
  const [oVl, setOVl] = useState<ChonO>(null);
  const [oHex, setOHex] = useState<ChonO>(null);
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

      {duLieu && (<>
        <section className="space-y-2">
          <h3 className="text-lg font-bold text-red-600">II. BOM - THEO DANH MỤC VẬT LIỆU (BOP-M2)</h3>
          <Loc nhan="PHÂN LOẠI NHU CẦU ĐẶT MUA" gia={nhuCau} ds={dsNhuCau} onDoi={v => { setNhuCau(v); setOVl(null); }} />
          <Pivot cotDong="NHÓM VẬT TƯ" p={bangVl} chon={oVl} onChon={setOVl} />
          {oVl ? (
            <ChiTiet tieuDe={`Chi tiết vật liệu: ${tenO(oVl)}`} cot={COT_VL} onDong={() => setOVl(null)}
              ds={vlLoc.filter(khopO(oVl, (v: VatLieuM2) => v.nhom, v => v.m))} />
          ) : <p className="text-[0.6875rem] text-slate-400">Bấm vào một số trong bảng để xem danh sách vật liệu.</p>}
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-bold text-red-600">3/ TÌNH TRẠNG VẬT TƯ THEO ĐƠN HÀNG (ITEM BY ITEM)</h3>
          <Loc nhan="TÌNH TRẠNG IPO FINAL" gia={ipoChon} ds={dsIpo} onDoi={v => { setIpo(v); setOHex(null); }} />
          <Pivot cotDong="PHÂN LOẠI NHÓM SẢN PHẨM" p={bangHex} chon={oHex} onChon={setOHex} />
          {oHex ? (
            <ChiTiet tieuDe={`Chi tiết HEX: ${tenO(oHex)}`} cot={COT_HEX} onDong={() => setOHex(null)} onHex={onHexClick}
              ds={hexLoc.filter(khopO(oHex, (h: HexM2) => h.nhomSp, h => h.final))} />
          ) : <p className="text-[0.6875rem] text-slate-400">Bấm vào một số trong bảng để xem danh sách HEX.</p>}
        </section>

      </>)}
    </div>
  );
};
