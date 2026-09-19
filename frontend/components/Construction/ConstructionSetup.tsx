// src/components/Construction/ConstructionSetup.tsx
//
// Trang setup: chọn 1 view (Luồng đỏ / Căn mẫu / ...), rồi tick chọn danh sách
// công trình sẽ hiển thị trong view đó. Danh sách công trình để tick chọn CHỈ
// lấy từ productionData — đây là nguồn duy nhất có tên công trình chuẩn, sạch.
// Material/Order/KHSX không dùng để liệt kê vì cột "công trình" của các bảng
// này thực chất ghi mô tả hạng mục gia công (vd "AALA - GIA CÔNG KIM LOẠI..."),
// không phải tên công trình gốc — dùng để liệt kê sẽ làm nhiễu danh sách.
// ConstructionRedFlow.tsx và ConstructionSampleUnit.tsx vẫn dùng filterByView()
// để lọc material/order/khsx theo đúng tên đã chọn ở đây.

import React, { useState, useEffect, useMemo } from 'react';
import { Settings2, Search, RefreshCw, Check, ChevronDown } from 'lucide-react';
import { DataRow } from '../../types';
import { useToast } from '../../context/ToastContext';
import {
  CONFIGURABLE_VIEWS,
  getProjectsForView,
  setProjectsForView,
  collectUniqueProjects,
} from './utils/viewDataConfig';

interface ConstructionSetupProps {
  productionData: DataRow[];
  congTrinhKey: string; // tên cột công trình của productionData
}

const ConstructionSetup: React.FC<ConstructionSetupProps> = ({
  productionData,
  congTrinhKey,
}) => {
  const { showToast } = useToast();

  const allProjects = useMemo(
    () => collectUniqueProjects([
      { data: productionData, key: congTrinhKey },
    ]),
    [productionData, congTrinhKey]
  );

  const [selectedViewId, setSelectedViewId] = useState<string>(CONFIGURABLE_VIEWS[0]?.id || '');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedView = CONFIGURABLE_VIEWS.find((v) => v.id === selectedViewId);

  useEffect(() => {
    if (!selectedViewId) return;
    const saved = getProjectsForView(selectedViewId);
    // đối chiếu với allProjects hiện tại, loại bỏ những công trình đã lưu
    // trước đó nhưng không còn tồn tại trong dữ liệu sản xuất hiện tại
    const validProjectsSet = new Set(allProjects);
    const cleaned = saved.filter((p) => validProjectsSet.has(p));
    setSelectedProjects(new Set(cleaned));
  }, [selectedViewId, allProjects]);

  const toggleProject = (congTrinh: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(congTrinh)) next.delete(congTrinh);
      else next.add(congTrinh);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      filteredProjects.forEach((p) => next.add(p));
      return next;
    });
  };

  const handleClearAllFiltered = () => {
    // nếu không đang search (searchTerm rỗng), bỏ chọn TOÀN BỘ, kể cả phần tử
    // mồ côi còn sót — đảm bảo nút "Bỏ chọn hết" luôn đưa về đúng 0.
    if (!searchTerm.trim()) {
      setSelectedProjects(new Set());
      return;
    }
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      filteredProjects.forEach((p) => next.delete(p));
      return next;
    });
  };

  // ✅ SỬA: BUG CHÍNH — bản cũ gọi `setProjectsForView(...)` (hàm async,
  // trả về Promise<boolean>) mà KHÔNG `await`, nên code chạy thẳng xuống
  // `showToast('...thành công')` ngay lập tức, không chờ request thật sự
  // xong. Nếu API lỗi (401 sai token, CORS, route /api không tới đúng
  // backend...), lỗi đó chỉ vào console.error — người dùng luôn thấy toast
  // "Đã lưu setup" dù dữ liệu chưa hề được lưu ở backend. Đây là lý do
  // "lưu rồi" nhưng 2 trang Luồng đỏ/Căn mẫu vẫn rỗng.
  // Sửa: await kết quả thật, chỉ báo thành công khi backend xác nhận OK,
  // báo lỗi rõ ràng khi thất bại để không còn "false positive".
  const handleSave = async () => {
    if (!selectedViewId) return;
    setIsSaving(true);
    try {
      const ok = await setProjectsForView(selectedViewId, Array.from(selectedProjects));
      if (ok) {
        showToast(`Đã lưu setup cho "${selectedView?.label}"`, 'success');
      } else {
        showToast(
          'Lưu setup thất bại — vui lòng mở Console (F12) để xem lỗi chi tiết (thường là hết hạn đăng nhập hoặc lỗi kết nối API)',
          'error'
        );
      }
    } catch {
      showToast('Lưu setup thất bại', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProjects = allProjects.filter((p) =>
    p.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-wood-50">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-wood-600 flex items-center justify-center text-white shadow-sm">
            <Settings2 size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Setup dữ liệu theo View</h1>
            <p className="text-xs text-slate-500">Chọn công trình sẽ hiển thị cho từng view</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !selectedViewId}
          className={`flex items-center gap-2 px-5 py-2.5 bg-wood-600 text-white rounded-lg font-medium hover:bg-wood-700 transition-colors ${(isSaving || !selectedViewId) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
          {isSaving ? 'Đang lưu...' : 'Lưu setup'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-5">

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <label className="text-xs font-bold text-slate-500 block mb-2">Chọn view cần setup dữ liệu</label>
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:border-wood-400 transition-colors"
              >
                <span>{selectedView?.label || 'Chọn view'}</span>
                <ChevronDown size={16} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {CONFIGURABLE_VIEWS.map((view) => (
                    <button
                      key={view.id}
                      onClick={() => { setSelectedViewId(view.id); setIsDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-wood-50 transition-colors
                        ${view.id === selectedViewId ? 'bg-wood-50 text-wood-700 font-semibold' : 'text-slate-700'}`}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Đã chọn <span className="font-semibold text-wood-600">{selectedProjects.size}</span> / {allProjects.length} công trình cho view này
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm công trình..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white"
              />
            </div>
            <button
              onClick={handleSelectAllFiltered}
              className="px-3 py-2.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-wood-50 whitespace-nowrap"
            >
              Chọn tất cả
            </button>
            <button
              onClick={handleClearAllFiltered}
              className="px-3 py-2.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 whitespace-nowrap"
            >
              Bỏ chọn hết
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {allProjects.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                Chưa có dữ liệu công trình. Hãy làm mới dữ liệu trước (cần cột "{congTrinhKey}" trong dữ liệu sản xuất).
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">Không tìm thấy công trình phù hợp.</div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
                {filteredProjects.map((congTrinh) => {
                  const checked = selectedProjects.has(congTrinh);
                  return (
                    <label
                      key={congTrinh}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-wood-50/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProject(congTrinh)}
                        className="w-4 h-4 rounded border-slate-300 text-wood-600 focus:ring-wood-500/30"
                      />
                      <span className={`text-sm ${checked ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                        {congTrinh}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConstructionSetup;
