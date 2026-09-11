import { Calendar, Layers, Building2, Ruler, Tag } from 'lucide-react';
import { useTrendFilter, Granularity } from './TrendFilterContext';
import SearchableSelect from './SearchableSelect';

interface SharedDateFilterBarProps {
  /** Chỉ nguồn 'order' mới có ĐVT/phân loại SP */
  showProductFilters?: boolean;
  /** Nguồn 'stock' không có dữ liệu theo xưởng */
  showXuongFilter?: boolean;
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
    granularity, dateFrom, dateTo, setDateFrom, setDateTo,
    applyGranularity, applyPreset, clearRange,
    xuong, setXuong, congTrinh, setCongTrinh, dvt, setDvt, phanLoai, setPhanLoai,
    clearExtraFilters, xuongList, congTrinhList, dvtList, phanLoaiList,
  } = useTrendFilter();

  const hasExtraFilters = xuong || congTrinh || dvt || phanLoai;

  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm px-4 py-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Bộ lọc chung</span>
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => applyGranularity(g)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                granularity === g ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-slate-600'
              }`}
            >
              {g === 'day' ? 'Ngày' : g === 'week' ? 'Tuần' : 'Tháng'}
            </button>
          ))}
        </div>
      </div>

      {/* Dòng 1: khoảng ngày + preset */}
      <div className="flex items-center flex-nowrap overflow-x-auto gap-2 text-xs">
        <Calendar size={13} className="text-slate-400 shrink-0" />
        <DateInput value={dateFrom} onChange={setDateFrom} />
        <span className="text-slate-400 shrink-0">→</span>
        <DateInput value={dateTo} onChange={setDateTo} />
        {[{ label: '7 ngày', days: 7 }, { label: '30 ngày', days: 30 }, { label: '90 ngày', days: 90 }, { label: '1 năm', days: 365 }].map(p => (
          <button key={p.days} onClick={() => applyPreset(p.days)}
            className="px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0">
            {p.label}
          </button>
        ))}
        {(dateFrom || dateTo) && (
          <button onClick={clearRange} className="px-2 py-1 rounded-md hover:underline text-indigo-600 shrink-0">
            Xóa lọc ngày
          </button>
        )}
      </div>

      {/* Dòng 2: xưởng / công trình / ĐVT / phân loại — GỘP CHUNG DÙNG CHO TẤT CẢ BIỂU ĐỒ */}
      <div className="flex items-center flex-nowrap overflow-visible gap-2 text-xs">
        {showXuongFilter && (
          <SearchableSelect
            value={xuong}
            onChange={setXuong}
            options={xuongList}
            allLabel="Tất cả xưởng"
            icon={<Layers size={13} className="text-slate-400 shrink-0" />}
            widthClass="w-[180px]"
          />
        )}

        <SearchableSelect
          value={congTrinh}
          onChange={setCongTrinh}
          options={congTrinhList}
          allLabel="Tất cả công trình"
          icon={<Building2 size={13} className="text-slate-400 shrink-0" />}
          widthClass="w-[220px]"
        />

        {showProductFilters && (
          <>
            <SearchableSelect
              value={dvt}
              onChange={setDvt}
              options={dvtList}
              allLabel="Tất cả ĐVT"
              icon={<Ruler size={13} className="text-slate-400 shrink-0" />}
              widthClass="w-[180px]"
            />

            <SearchableSelect
              value={phanLoai}
              onChange={setPhanLoai}
              options={phanLoaiList}
              allLabel="Tất cả phân loại SP"
              icon={<Tag size={13} className="text-slate-400 shrink-0" />}
              widthClass="w-[220px]"
            />
          </>
        )}

        {hasExtraFilters && (
          <button onClick={clearExtraFilters} className="px-2 py-1 rounded-md hover:underline text-indigo-600 shrink-0">
            Xóa lọc xưởng/công trình/ĐVT/phân loại
          </button>
        )}
      </div>
    </div>
  );
}