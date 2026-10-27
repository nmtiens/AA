// src/components/Construction/ConstructionSetup.tsx
//
// Trang setup: chọn 1 view (Luồng đỏ / Căn mẫu / ...), rồi chọn danh sách
// công trình sẽ hiển thị trong view đó. Danh sách công trình để chọn CHỈ
// lấy từ productionData — đây là nguồn duy nhất có tên công trình chuẩn, sạch.
//
// ✅ CẬP NHẬT (theo yêu cầu):
// 1) Bố cục 2 cột: trái = mọi công trình (tìm + tick), phải = đã chọn theo thứ
//    tự ưu tiên. Chọn nhóm bằng nút; báo "có thay đổi chưa lưu".
// 2) Thêm khu vực "Danh sách ưu tiên": các công trình ĐÃ CHỌN được liệt kê
//    theo đúng thứ tự ưu tiên (1, 2, 3...), có thể KÉO-THẢ (drag & drop) để
//    sắp xếp lại thứ tự ưu tiên. Thứ tự này được lưu nguyên vẹn vào mảng gửi
//    lên backend (setProjectsForView) — tức là thứ tự trong mảng = độ ưu
//    tiên, phần tử đầu tiên = ưu tiên cao nhất.
//
// Tổng quan công trình (nhóm Luồng đỏ / Căn mẫu) lọc theo đúng tên đã chọn ở đây
// (so theo tên chuẩn, không phụ thuộc thứ tự).

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Check,
  ChevronDown,
  GripVertical,
  X,
  ListOrdered,
} from 'lucide-react';
import { DataRow } from '../../types';
import { useToast } from '../../context/ToastContext';
import { projectMatchKey } from '../../utils/productionMetrics';
import {
  CONFIGURABLE_VIEWS,
  getProjectsForView,
  setProjectsForView,
  collectUniqueProjects,
} from './utils/viewDataConfig';

interface ConstructionSetupProps {
  /** Nằm trong trang chung Setup dữ liệu (thẻ): tiêu đề gọn, không icon lớn */
  embedded?: boolean;
  productionData: DataRow[];
  congTrinhKey: string; // tên cột công trình của productionData
}

const ConstructionSetup: React.FC<ConstructionSetupProps> = ({
  productionData,
  congTrinhKey,
  embedded = false,
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
  // Danh sách lúc tải / lần lưu gần nhất — so để báo "chưa lưu"
  const [daLuu, setDaLuu] = useState<string[]>([]);
  const chuaLuu = daLuu.join('\u0001') !== selectedProjects.join('\u0001');
  const [chiChuaChon, setChiChuaChon] = useState(false);

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
    // So theo tên chuẩn (projectMatchKey) như bộ lọc nhóm của Tổng quan công trình:tên đã lưu là 1 cách viết khác của cùng công trình
    // thì đổi về tên đang dùng thay vì âm thầm bỏ (lưu lại sẽ xoá công trình đó khỏi view)
    const byKey = new Map(allProjects.map(p => [projectMatchKey(p), p] as const));
    const cleaned = [...new Set(saved.map((p) => byKey.get(projectMatchKey(p))).filter((p): p is string => !!p))];
    setSelectedProjects(cleaned);
    setDaLuu(cleaned);
  }, [selectedViewId, allProjects]);

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
  // "lưu rồi" nhưng nhóm Luồng đỏ/Căn mẫu vẫn rỗng.
  // Sửa: await kết quả thật, chỉ báo thành công khi backend xác nhận OK,
  // báo lỗi rõ ràng khi thất bại để không còn "false positive".
  const handleSave = async () => {
    if (!selectedViewId) return;
    setIsSaving(true);
    try {
      // Gửi nguyên mảng có thứ tự (= thứ tự ưu tiên) lên backend.
      const ok = await setProjectsForView(selectedViewId, selectedProjects);
      if (ok) {
        setDaLuu(selectedProjects);
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
    p.toLowerCase().includes(searchTerm.toLowerCase()) && (!chiChuaChon || !selectedSet.has(p))
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Thanh trên: chọn nhóm (nút) + số đã chọn + Lưu (báo khi có thay đổi chưa lưu) */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        {!embedded && <h1 className="page-title mr-2">Setup dữ liệu theo View</h1>}
        <span className="text-sm text-slate-500">Nhóm</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn nhóm công trình">
          {CONFIGURABLE_VIEWS.map(view => (
            <button key={view.id} type="button" onClick={() => setSelectedViewId(view.id)} aria-pressed={view.id === selectedViewId}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${view.id === selectedViewId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {view.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">
          đã chọn <b className="font-semibold text-slate-900">{selectedProjects.length}</b> / {allProjects.length} công trình
        </span>
        <div className="ml-auto flex items-center gap-2">
          {chuaLuu && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Có thay đổi chưa lưu</span>}
          {chuaLuu && (
            <button type="button" onClick={() => setSelectedProjects(daLuu)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">Huỷ thay đổi</button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !selectedViewId || !chuaLuu}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
            {isSaving ? 'Đang lưu...' : 'Lưu setup'}
          </button>
        </div>
      </div>
      <p className="shrink-0 px-6 pt-3 text-sm text-slate-500">
        Công trình của nhóm <b className="font-semibold text-slate-700">{selectedView?.label}</b> hiện ở nút chọn nhóm của trang Tổng quan công trình, theo thứ tự ưu tiên bên phải.
      </p>

      <div className="grid min-h-0 flex-1 gap-4 p-6 pt-3 lg:grid-cols-2">
        {/* Cột trái: mọi công trình — tìm + tick để thêm / bỏ */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-900">Tất cả công trình</h2>
            <span className="text-sm text-slate-400">({allProjects.length})</span>
            <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={chiChuaChon} onChange={e => setChiChuaChon(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />
              Chỉ hiện chưa chọn
            </label>
          </div>
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Tìm công trình..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 pl-8 pr-3 text-sm focus:border-slate-500 focus:outline-none" />
            </div>
            <button onClick={handleSelectAllFiltered} disabled={filteredProjects.length === 0}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              Chọn {searchTerm.trim() ? 'kết quả' : 'tất cả'}
            </button>
            <button onClick={handleClearAllFiltered}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-red-50 hover:text-red-600">
              Bỏ chọn {searchTerm.trim() ? 'kết quả' : 'hết'}
            </button>
          </div>
          <div className="min-h-[16rem] flex-1 overflow-y-auto custom-scrollbar">
            {allProjects.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">Cần cột "{congTrinhKey}" trong dữ liệu sản xuất</div>
            ) : filteredProjects.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">Không tìm thấy công trình phù hợp.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredProjects.map(congTrinh => {
                  const checked = selectedSet.has(congTrinh);
                  const thu = checked ? selectedProjects.indexOf(congTrinh) + 1 : 0;
                  return (
                    <li key={congTrinh}>
                      <label className={`flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-slate-50 ${checked ? 'bg-slate-50/60' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleProject(congTrinh)} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />
                        <span className={`flex-1 truncate text-sm ${checked ? 'font-medium text-slate-900' : 'text-slate-600'}`} title={congTrinh}>{congTrinh}</span>
                        {checked && <span className="shrink-0 text-xs text-slate-400">#{thu}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Cột phải: đã chọn — thứ tự ưu tiên, kéo-thả hoặc mũi tên */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <ListOrdered size={16} className="text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">Đã chọn · thứ tự ưu tiên</h2>
            <span className="text-sm text-slate-400">({selectedProjects.length})</span>
            <span className="ml-auto text-xs text-slate-500">Kéo (⠿) hoặc bấm mũi tên để đổi thứ tự — số 1 ưu tiên cao nhất</span>
          </div>
          <div className="min-h-[16rem] flex-1 overflow-y-auto custom-scrollbar">
            {selectedProjects.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">Chưa chọn công trình nào. Tick công trình ở cột bên trái để thêm.</div>
            ) : (
              <ol className="divide-y divide-slate-100">
                {selectedProjects.map((congTrinh, index) => (
                  <li
                    key={congTrinh}
                    draggable
                    onDragStart={handleDragStart(index)}
                    onDragOver={handleDragOver(index)}
                    onDrop={handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={`group flex items-center gap-3 px-3 py-2 transition-colors
                      ${dragIndex === index ? 'opacity-40' : ''}
                      ${dragOverIndex === index && dragIndex !== null && dragIndex !== index ? 'border-t-2 border-slate-900 bg-slate-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className="cursor-grab text-slate-300 group-hover:text-slate-500 active:cursor-grabbing" title="Kéo để sắp xếp"><GripVertical size={16} /></span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{index + 1}</span>
                    <span className="flex-1 truncate text-sm font-medium text-slate-800" title={congTrinh}>{congTrinh}</span>
                    <span className="flex shrink-0 items-center opacity-40 transition group-hover:opacity-100">
                      <button onClick={() => moveProject(index, -1)} disabled={index === 0} title="Tăng ưu tiên"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-25"><ChevronDown size={15} className="rotate-180" /></button>
                      <button onClick={() => moveProject(index, 1)} disabled={index === selectedProjects.length - 1} title="Giảm ưu tiên"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-25"><ChevronDown size={15} /></button>
                      <button onClick={() => removeProject(congTrinh)} title="Bỏ khỏi nhóm"
                        className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"><X size={15} /></button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ConstructionSetup;