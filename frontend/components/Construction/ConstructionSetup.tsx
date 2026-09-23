// src/components/Construction/ConstructionSetup.tsx
//
// Trang setup: chọn 1 view (Luồng đỏ / Căn mẫu / ...), rồi chọn danh sách
// công trình sẽ hiển thị trong view đó. Danh sách công trình để chọn CHỈ
// lấy từ productionData — đây là nguồn duy nhất có tên công trình chuẩn, sạch.
//
// ✅ CẬP NHẬT (theo yêu cầu):
// 1) Thay vì hiển thị luôn cả danh sách dài công trình để tick, giờ dùng cơ
//    chế lọc kiểu Excel: 1 nút "Chọn công trình" mở ra 1 popover nhỏ (có ô
//    tìm kiếm + danh sách checkbox), đóng lại thì popover ẩn đi — không còn
//    chiếm hết màn hình như trước.
// 2) Thêm khu vực "Danh sách ưu tiên": các công trình ĐÃ CHỌN được liệt kê
//    theo đúng thứ tự ưu tiên (1, 2, 3...), có thể KÉO-THẢ (drag & drop) để
//    sắp xếp lại thứ tự ưu tiên. Thứ tự này được lưu nguyên vẹn vào mảng gửi
//    lên backend (setProjectsForView) — tức là thứ tự trong mảng = độ ưu
//    tiên, phần tử đầu tiên = ưu tiên cao nhất.
//
// ConstructionRedFlow.tsx và ConstructionSampleUnit.tsx vẫn dùng filterByView()
// để lọc material/order/khsx theo đúng tên đã chọn ở đây (không phụ thuộc thứ
// tự), nên việc đổi Set -> mảng có thứ tự không ảnh hưởng tới các trang đó.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings2,
  Search,
  RefreshCw,
  Check,
  ChevronDown,
  ListFilter,
  GripVertical,
  X,
  ListOrdered,
} from 'lucide-react';
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

  // ✅ SỬA: Set -> mảng có thứ tự. Thứ tự phần tử = độ ưu tiên
  // (index 0 = ưu tiên cao nhất). Toggle chọn thêm sẽ nối vào cuối mảng.
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);

  // ✅ MỚI: popover chọn công trình kiểu Excel — ẩn/hiện thay vì list luôn mở
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  // ✅ MỚI: state cho kéo-thả sắp xếp ưu tiên
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const selectedView = CONFIGURABLE_VIEWS.find((v) => v.id === selectedViewId);
  const selectedSet = useMemo(() => new Set(selectedProjects), [selectedProjects]);

  useEffect(() => {
    if (!selectedViewId) return;
    const saved = getProjectsForView(selectedViewId);
    // đối chiếu với allProjects hiện tại, loại bỏ những công trình đã lưu
    // trước đó nhưng không còn tồn tại trong dữ liệu sản xuất hiện tại —
    // giữ nguyên THỨ TỰ đã lưu (chính là thứ tự ưu tiên).
    const validProjectsSet = new Set(allProjects);
    const cleaned = saved.filter((p) => validProjectsSet.has(p));
    setSelectedProjects(cleaned);
  }, [selectedViewId, allProjects]);

  // Đóng popover khi click ra ngoài
  useEffect(() => {
    if (!isFilterOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(target) &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(target)
      ) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  const toggleProject = (congTrinh: string) => {
    setSelectedProjects((prev) => {
      if (prev.includes(congTrinh)) {
        return prev.filter((p) => p !== congTrinh);
      }
      // Thêm mới -> nối vào CUỐI danh sách ưu tiên (ưu tiên thấp nhất hiện tại)
      return [...prev, congTrinh];
    });
  };

  const removeProject = (congTrinh: string) => {
    setSelectedProjects((prev) => prev.filter((p) => p !== congTrinh));
  };

  const handleSelectAllFiltered = () => {
    setSelectedProjects((prev) => {
      const existing = new Set(prev);
      const toAdd = filteredProjects.filter((p) => !existing.has(p));
      return [...prev, ...toAdd];
    });
  };

  const handleClearAllFiltered = () => {
    // nếu không đang search (searchTerm rỗng), bỏ chọn TOÀN BỘ, kể cả phần tử
    // mồ côi còn sót — đảm bảo nút "Bỏ chọn hết" luôn đưa về đúng 0.
    if (!searchTerm.trim()) {
      setSelectedProjects([]);
      return;
    }
    const filteredSet = new Set(filteredProjects);
    setSelectedProjects((prev) => prev.filter((p) => !filteredSet.has(p)));
  };

  // ✅ Kéo-thả sắp xếp lại thứ tự ưu tiên trong danh sách đã chọn
  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      return;
    }
    setSelectedProjects((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const moveProject = (index: number, direction: -1 | 1) => {
    setSelectedProjects((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
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
      // Gửi nguyên mảng có thứ tự (= thứ tự ưu tiên) lên backend.
      const ok = await setProjectsForView(selectedViewId, selectedProjects);
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
            <p className="text-xs text-slate-500">Chọn công trình & sắp xếp độ ưu tiên cho từng view</p>
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

          {/* Chọn view */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <label className="text-xs font-bold text-slate-500 block mb-2">Chọn view cần setup dữ liệu</label>
            <div className="relative">
              <button
                onClick={() => setIsViewDropdownOpen(!isViewDropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:border-wood-400 transition-colors"
              >
                <span>{selectedView?.label || 'Chọn view'}</span>
                <ChevronDown size={16} className={`transition-transform ${isViewDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isViewDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {CONFIGURABLE_VIEWS.map((view) => (
                    <button
                      key={view.id}
                      onClick={() => { setSelectedViewId(view.id); setIsViewDropdownOpen(false); }}
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
              Đã chọn <span className="font-semibold text-wood-600">{selectedProjects.length}</span> / {allProjects.length} công trình cho view này
            </p>
          </div>

          {/* ✅ MỚI: Nút mở popover chọn công trình kiểu Excel (thay cho list luôn mở) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-500">Chọn công trình</label>
              {allProjects.length === 0 && (
                <span className="text-xs text-slate-400">
                  Cần cột "{congTrinhKey}" trong dữ liệu sản xuất
                </span>
              )}
            </div>
            <div className="relative inline-block">
              <button
                ref={filterButtonRef}
                onClick={() => setIsFilterOpen((v) => !v)}
                disabled={allProjects.length === 0}
                className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-colors
                  ${isFilterOpen ? 'border-wood-500 text-wood-700 bg-wood-50' : 'border-slate-300 text-slate-700 hover:border-wood-400'}
                  ${allProjects.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ListFilter size={16} />
                Chọn công trình
                <span className="px-1.5 py-0.5 rounded bg-wood-600 text-white text-[11px] font-bold">
                  {selectedProjects.length}
                </span>
                <ChevronDown size={14} className={`transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Popover kiểu Excel filter: ẩn hoàn toàn khi đóng */}
              {isFilterOpen && (
                <div
                  ref={filterPopoverRef}
                  className="absolute z-20 mt-1 w-96 bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col overflow-hidden"
                >
                  <div className="p-3 border-b border-slate-100 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Tìm công trình..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none"
                      />
                    </div>
                    <button
                      onClick={() => setIsFilterOpen(false)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
                      title="Đóng"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="px-3 py-2 border-b border-slate-100 flex gap-2 bg-slate-50">
                    <button
                      onClick={handleSelectAllFiltered}
                      className="flex-1 px-2 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-600 hover:bg-wood-50"
                    >
                      Chọn tất cả{searchTerm.trim() ? ' (đang lọc)' : ''}
                    </button>
                    <button
                      onClick={handleClearAllFiltered}
                      className="flex-1 px-2 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-600 hover:bg-red-50 hover:text-red-600"
                    >
                      Bỏ chọn hết
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {filteredProjects.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-sm">Không tìm thấy công trình phù hợp.</div>
                    ) : (
                      filteredProjects.map((congTrinh) => {
                        const checked = selectedSet.has(congTrinh);
                        return (
                          <label
                            key={congTrinh}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-wood-50/40 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleProject(congTrinh)}
                              className="w-4 h-4 rounded border-slate-300 text-wood-600 focus:ring-wood-500/30"
                            />
                            <span className={`text-sm truncate ${checked ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                              {congTrinh}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ✅ MỚI: Danh sách ưu tiên — kéo-thả để sắp xếp thứ tự */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <ListOrdered size={16} className="text-wood-600" />
              <h2 className="text-sm font-bold text-slate-700">Danh sách ưu tiên công trình</h2>
              <span className="text-xs text-slate-400 ml-auto">
                Kéo (⠿) để sắp xếp — số 1 là ưu tiên cao nhất
              </span>
            </div>

            {selectedProjects.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                Chưa có công trình nào được chọn. Nhấn "Chọn công trình" ở trên để thêm.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {selectedProjects.map((congTrinh, index) => (
                  <div
                    key={congTrinh}
                    draggable
                    onDragStart={handleDragStart(index)}
                    onDragOver={handleDragOver(index)}
                    onDrop={handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 px-4 py-2.5 bg-white transition-colors
                      ${dragIndex === index ? 'opacity-40' : ''}
                      ${dragOverIndex === index && dragIndex !== null && dragIndex !== index ? 'bg-wood-50 border-t-2 border-wood-400' : ''}
                    `}
                  >
                    <span className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600" title="Kéo để sắp xếp">
                      <GripVertical size={16} />
                    </span>
                    <span className="w-7 h-7 shrink-0 rounded-full bg-wood-100 text-wood-700 text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-sm text-slate-800 font-medium flex-1 truncate">
                      {congTrinh}
                    </span>
                    <button
                      onClick={() => moveProject(index, -1)}
                      disabled={index === 0}
                      className="p-1 text-slate-400 hover:text-wood-600 disabled:opacity-25 disabled:cursor-not-allowed"
                      title="Tăng ưu tiên"
                    >
                      <ChevronDown size={14} className="rotate-180" />
                    </button>
                    <button
                      onClick={() => moveProject(index, 1)}
                      disabled={index === selectedProjects.length - 1}
                      className="p-1 text-slate-400 hover:text-wood-600 disabled:opacity-25 disabled:cursor-not-allowed"
                      title="Giảm ưu tiên"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => removeProject(congTrinh)}
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="Bỏ chọn"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConstructionSetup;