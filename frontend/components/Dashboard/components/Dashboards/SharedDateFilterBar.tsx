import React, { useState } from 'react';
import { useTrendFilter, KyNhanh } from './TrendFilterContext';
import SearchableSelect from './SearchableSelect';
import { tenGroup, soSanhGroup } from '../../utils/nhomSp';

interface SharedDateFilterBarProps {
  /** Chỉ nguồn 'order' mới có ĐVT/phân loại SP */
  showProductFilters?: boolean;
  /** Nguồn 'stock' không có dữ liệu theo xưởng */
  showXuongFilter?: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoNgay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const ddmm = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
/** Số tuần ISO (tuần bắt đầu thứ Hai, tuần 1 chứa ngày 04/01) */
function tuanIso(d: Date) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); // thứ Năm của tuần
  const nam = t.getFullYear();
  return { nam, so: 1 + Math.round(((t.getTime() - new Date(nam, 0, 4).getTime()) / 864e5 - 3 + ((new Date(nam, 0, 4).getDay() + 6) % 7)) / 7) };
}
interface KyOpt { ma: string; nhan: string; tu: string; den: string; chiTiet?: string }
/** Danh sách kỳ để chọn, mới nhất trước: 26 tuần, 24 tháng, 5 năm tính từ ngày mốc */
function dsKy(mocISO: string): Record<KyNhanh, KyOpt[]> {
  const [y, m, d] = mocISO.split('-').map(Number);
  const moc = new Date(y, m - 1, d);
  const tuan: KyOpt[] = [];
  const thu2 = new Date(moc); thu2.setDate(thu2.getDate() - ((thu2.getDay() + 6) % 7));
  for (let i = 0; i < 26; i++) {
    const a = new Date(thu2); a.setDate(a.getDate() - 7 * i);
    const b = new Date(a); b.setDate(b.getDate() + 6);
    const w = tuanIso(a);
    tuan.push({ ma: `${w.nam}-W${w.so}`, nhan: `Tuần ${w.so}/${w.nam}`, chiTiet: `${ddmm(a)}–${ddmm(b)}`, tu: isoNgay(a), den: isoNgay(b) });
  }
  const thang: KyOpt[] = [];
  for (let i = 0; i < 24; i++) {
    const a = new Date(y, m - 1 - i, 1), b = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    thang.push({ ma: `${a.getFullYear()}-${pad2(a.getMonth() + 1)}`, nhan: `Tháng ${a.getMonth() + 1}/${a.getFullYear()}`, tu: isoNgay(a), den: isoNgay(b) });
  }
  const nam: KyOpt[] = [];
  for (let i = 0; i < 5; i++) nam.push({ ma: String(y - i), nhan: `Năm ${y - i}`, tu: `${y - i}-01-01`, den: `${y - i}-12-31` });
  return { tuan, thang, nam };
}

/** Chuyển 'yyyy-mm-dd' (giá trị input date) -> 'dd/mm/yyyy' (hiển thị) */
function formatDateVN(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

/**
 * Input ngày luôn hiển thị đúng định dạng dd/mm/yyyy,
 * bất kể locale trình duyệt/hệ điều hành của người dùng.
 * Vẫn dùng <input type="date"> gốc để giữ lịch chọn ngày (calendar picker),
 * chỉ ẩn phần text gốc và phủ text tự định dạng lên trên.
 */
function DateInput({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative shrink-0 ${className}`}>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-[130px] px-2 py-1 border border-slate-300 rounded-md outline-none
                   text-transparent caret-transparent bg-transparent relative"
      />
      <span className="absolute inset-y-0 left-2 flex items-center pr-6 text-slate-700 pointer-events-none">
        {value ? formatDateVN(value) : 'dd/mm/yyyy'}
      </span>
    </div>
  );
}

export default function SharedDateFilterBar({
  showProductFilters = false,
  showXuongFilter = true,
}: SharedDateFilterBarProps) {
 const {
  dateFrom, dateTo, setDateFrom, setDateTo,
  applyKy, clearRange, activeKy, layNgayMoc,
  xuong, setXuong, congTrinh, setCongTrinh, dvt, setDvt, phanLoai, setPhanLoai,
  clearExtraFilters, xuongList, congTrinhList, dvtList, phanLoaiList,
} = useTrendFilter();
  // Ô chọn ngày thu gọn: hiện khoảng đang xem, bấm mới mở 2 ô ngày (người dùng 19/11/2026)
  const [moNgay, setMoNgay] = useState(false);
  // Khung chung các nút / ô (cao bằng nhau)
  const o = 'h-8 px-2.5 rounded-md border shrink-0 transition-colors';
  const khoangTxt = !dateFrom && !dateTo ? 'Chọn ngày'
    : dateFrom === dateTo ? formatDateVN(dateFrom) : `${formatDateVN(dateFrom)} – ${formatDateVN(dateTo)}`;

  const hasExtraFilters = xuong || congTrinh || dvt || phanLoai;
  // Group sản phẩm hiển thị "G.08.Tường", sắp theo số group (mã gốc giữ nguyên để lọc)
  const dsGroup = [...phanLoaiList].sort((a, b) => soSanhGroup(a.name, b.name)).map(o => ({ ...o, name: tenGroup(o.name) }));


  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm px-4 py-2">
      {/* Gọn 1 dòng (người dùng 19/11/2026): khoảng ngày (bấm mới mở ô chọn) · tuần / tháng / năm · 4 ô lọc · xóa lọc */}
      <div className="flex items-center flex-wrap gap-1.5 text-sm">
        {moNgay ? (
          <>
            <DateInput value={dateFrom} onChange={setDateFrom} />
            <span className="text-slate-500 shrink-0">→</span>
            <DateInput value={dateTo} onChange={setDateTo} />
            <button type="button" onClick={() => setMoNgay(false)}
              className={`${o} bg-slate-900 border-slate-900 text-white`}>Xong</button>
          </>
        ) : (
          <button type="button" onClick={() => setMoNgay(true)} title="Bấm để chọn khoảng ngày"
            className={`${o} bg-white border-slate-300 font-medium text-slate-700 tabular-nums hover:bg-slate-50`}>
            {khoangTxt}
          </button>
        )}
        {/* Chọn 1 tuần / tháng / năm (kỳ đang chạy tính tới ngày dữ liệu mới nhất); ô hẹp, chữ dài tự cắt */}
        {(() => {
          const ds = dsKy(layNgayMoc());
          return ([['tuan', 'Tuần'], ['thang', 'Tháng'], ['nam', 'Năm']] as [KyNhanh, string][]).map(([ky, nhan]) => {
            const dangChon = activeKy?.ky === ky;
            return (
              <select
                key={ky}
                aria-label={`Chọn ${nhan.toLowerCase()}`}
                title={dangChon ? ds[ky].find(x => x.ma === activeKy!.ma)?.nhan : `Chọn ${nhan.toLowerCase()}`}
                value={dangChon ? activeKy!.ma : ''}
                onChange={e => {
                  const x = ds[ky].find(k => k.ma === e.target.value);
                  if (x) applyKy(ky, x.tu, x.den, x.ma);
                }}
                // Rộng vừa đúng chữ đang chọn: trình duyệt tự đo (field-sizing: content, Chrome/Edge mới) — không cắt chữ dù font /
                // mũi tên của máy khác; trình duyệt cũ không hỗ trợ thì rộng theo mục dài nhất (không cắt)
                style={{ fieldSizing: 'content', minWidth: '4.5rem' } as React.CSSProperties}
                className={`${o} cursor-pointer outline-none ${
                  dangChon ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <option value="" disabled>{nhan}</option>
                {ds[ky].map(k => <option key={k.ma} value={k.ma} className="bg-white text-slate-800">{k.nhan}{k.chiTiet ? ` (${k.chiTiet})` : ''}</option>)}
              </select>
            );
          });
        })()}
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" aria-hidden />
        {showXuongFilter && (
          <SearchableSelect value={xuong} onChange={setXuong} options={xuongList} allLabel="Khu vực" allOption="Tất cả" widthClass="w-[8.5rem]" />
        )}
        <SearchableSelect value={congTrinh} onChange={setCongTrinh} options={congTrinhList} allLabel="Công trình" allOption="Tất cả" widthClass="w-[11rem]" />
        {showProductFilters && (
          <>
            <SearchableSelect value={dvt} onChange={setDvt} options={dvtList} allLabel="ĐVT" allOption="Tất cả" widthClass="w-[6.5rem]" />
            <SearchableSelect value={phanLoai} onChange={setPhanLoai} options={dsGroup} allLabel="Group" allOption="Tất cả" widthClass="w-[9rem]" />
          </>
        )}
        {(hasExtraFilters || !!activeKy || dateFrom !== dateTo) && (
          <button type="button" onClick={() => { clearRange(); clearExtraFilters(); setMoNgay(false); }}
            title="Bỏ chọn kỳ (về ngày dữ liệu mới nhất) và bỏ các ô lọc"
            className="px-2 py-1 rounded-md text-slate-600 hover:underline shrink-0">
            Xóa lọc
          </button>
        )}
      </div>
    </div>
  );
}