import { useMemo, useState } from 'react';
import { pivotM2, giaTriLoc, TRONG_M2 } from './core/bopM2';
import { Pivot, ChiTiet, Loc, khopO, tenO, TAT_CA, type ChonO } from './PivotExcel';
import type { HexInfo } from './ProjectHealthTabs';

// ============================================================================
// Tab BOT — ĐÚNG 2 pivot "V. BOT - KẾ HOẠCH NHẬP KHO" của sheet 01_REPORT trong file mẫu PC:
//   1/ Kế hoạch nhập kho THÁNG: PHÂN LOẠI NHÓM SẢN PHẨM × NGÀY KHNK THÁNG, Count of HEX
//   2/ Kế hoạch nhập kho TUẦN:  PHÂN LOẠI NHÓM SẢN PHẨM × NGÀY KHNK TUẦN,  Count of HEX
//   cùng ô lọc TÌNH TRẠNG IPO (mặc định 01. ĐANG SẢN XUẤT như file).
// Nguồn: bảng sản xuất của app (hạng mục của công trình, không hủy) — ngày KH lấy nguyên cột ngay_khnk_thang /
// ngay_khnk_tuan, không bỏ KH kỳ đã đạt (khác cách tính hạn của các trang khác). Bấm số => danh sách HEX.
// ============================================================================

const MAC_DINH_IPO = '01. ĐANG SẢN XUẤT';
/** Khoá cột ngày 'YYYY-MM-DD' (để xếp đúng thứ tự thời gian) */
const khoaNgay = (d: Date | null | undefined) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
const nhanNgay = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(k) ? `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : k);
const COT_HEX: [string, (h: HexInfo) => string][] = [
  ['HEX', h => h.hex], ['TÊN HẠNG MỤC', h => h.hangMuc], ['PHÂN LOẠI NHÓM SẢN PHẨM', h => h.nhomSp ?? ''],
  ['XƯỞNG CHÍNH', h => h.area], ['BOP', h => h.stage ?? ''], ['NGÀY KHNK THÁNG', h => nhanNgay(khoaNgay(h.khnkThang))],
  ['NGÀY KHNK TUẦN', h => nhanNgay(khoaNgay(h.khnkTuan))], ['TÌNH TRẠNG IPO', h => h.ipo ?? ''],
];

export const BotKhnk = ({ items, onHexClick }: { items: HexInfo[]; onHexClick?: (hex: string) => void }) => {
  // Count of HEX của Excel = đếm DÒNG có HEX (1 HEX tách nhiều dòng thì đếm từng dòng) — không gộp trùng
  const hex = useMemo(() => items.filter(i => i.hex), [items]);
  const dsIpo = useMemo(() => giaTriLoc(hex, h => h.ipo ?? ''), [hex]);
  const [ipo, setIpo] = useState<string | null>(null);
  const ipoChon = ipo ?? (dsIpo.includes(MAC_DINH_IPO) ? MAC_DINH_IPO : TAT_CA);
  const loc = useMemo(() => hex.filter(h => ipoChon === TAT_CA || (h.ipo || TRONG_M2) === ipoChon), [hex, ipoChon]);

  const thangOf = (h: HexInfo) => khoaNgay(h.khnkThang);
  const tuanOf = (h: HexInfo) => khoaNgay(h.khnkTuan);
  const nspOf = (h: HexInfo) => h.nhomSp ?? '';
  const bangThang = useMemo(() => pivotM2(loc, nspOf, thangOf), [loc]);
  const bangTuan = useMemo(() => pivotM2(loc, nspOf, tuanOf), [loc]);
  const [oThang, setOThang] = useState<ChonO>(null);
  const [oTuan, setOTuan] = useState<ChonO>(null);
  const doiIpo = (v: string) => { setIpo(v); setOThang(null); setOTuan(null); };
  const tenOCot = (o: ChonO) => tenO(o && { ...o, m: o.m && nhanNgay(o.m) });

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-bold text-red-600">V. BOT - KẾ HOẠCH NHẬP KHO</h3>
      <Loc nhan="TÌNH TRẠNG IPO" gia={ipoChon} ds={dsIpo} onDoi={doiIpo} />

      <section className="space-y-2">
        <h4 className="text-base font-bold text-slate-900">1/ KẾ HOẠCH NHẬP KHO <span className="text-red-600">THÁNG</span></h4>
        <Pivot cotDong="PHÂN LOẠI NHÓM SẢN PHẨM" p={bangThang} chon={oThang} onChon={setOThang} nhanCot={nhanNgay} />
        {oThang ? (
          <ChiTiet tieuDe={`Chi tiết HEX: ${tenOCot(oThang)}`} cot={COT_HEX} onDong={() => setOThang(null)} onHex={onHexClick}
            ds={loc.filter(khopO(oThang, nspOf, thangOf))} />
        ) : <p className="text-[0.6875rem] text-slate-400">Bấm vào một số trong bảng để xem danh sách HEX.</p>}
      </section>

      <section className="space-y-2">
        <h4 className="text-base font-bold text-slate-900">2/ KẾ HOẠCH NHẬP KHO <span className="text-red-600">TUẦN</span></h4>
        <Pivot cotDong="PHÂN LOẠI NHÓM SẢN PHẨM" p={bangTuan} chon={oTuan} onChon={setOTuan} nhanCot={nhanNgay} />
        {oTuan ? (
          <ChiTiet tieuDe={`Chi tiết HEX: ${tenOCot(oTuan)}`} cot={COT_HEX} onDong={() => setOTuan(null)} onHex={onHexClick}
            ds={loc.filter(khopO(oTuan, nspOf, tuanOf))} />
        ) : <p className="text-[0.6875rem] text-slate-400">Bấm vào một số trong bảng để xem danh sách HEX.</p>}
      </section>
    </div>
  );
};
