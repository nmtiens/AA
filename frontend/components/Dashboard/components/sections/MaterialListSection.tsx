import React, { useState, useMemo } from 'react';
import { Box, ChevronLeft, ChevronRight } from 'lucide-react';
import { DataRow } from '../../../../types';
import { MATERIAL_LIST_COLUMNS, MATERIAL_LIST_COLUMN_LABELS } from '../../constants';

const MATERIAL_ITEMS_PER_PAGE = 15;

interface MaterialListSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  displayedMaterialData: DataRow[];
  getMaterialRowClassName: (row: DataRow) => string;
}

// Định dạng lại giá trị ô hiển thị: nếu là ngày dạng ISO (yyyy-mm-dd hoặc
// yyyy-mm-ddTHH:mm:ss...) thì chuyển sang dd/mm/yyyy. Các giá trị khác giữ nguyên.
const formatCellValue = (value: any): string => {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value);
  const isoDateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoDateMatch) {
    const [, y, m, d] = isoDateMatch;
    return `${d}/${m}/${y}`;
  }
  return str;
};

export const MaterialListSection = ({
  sectionRef,
  displayedMaterialData,
  getMaterialRowClassName,
}: MaterialListSectionProps) => {
  const [materialListPage, setMaterialListPage] = useState(1);

  const totalMaterialPages = Math.ceil(displayedMaterialData.length / MATERIAL_ITEMS_PER_PAGE);

  const paginatedMaterialList = useMemo(
    () => displayedMaterialData.slice(
      (materialListPage - 1) * MATERIAL_ITEMS_PER_PAGE,
      materialListPage * MATERIAL_ITEMS_PER_PAGE
    ),
    [displayedMaterialData, materialListPage]
  );

  return (
    <div ref={sectionRef} className="w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <Box className="w-4 h-4 text-slate-600" />Chi tiết Dữ liệu Vật tư (Lọc theo Công trình)
        </h3>
        <span className="text-xs text-slate-500">Hiển thị {displayedMaterialData.length} dòng</span>
      </div>
      <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 border-b border-slate-200 text-center w-10">#</th>
              {MATERIAL_LIST_COLUMNS.map((col, idx) => (
                <th key={idx} className="px-3 py-2 border-b border-slate-200">
                  {MATERIAL_LIST_COLUMN_LABELS[col] || col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedMaterialList.length > 0 ? (
              paginatedMaterialList.map((row, index) => (
                <tr key={index} className={`transition-colors border-b border-slate-100 ${getMaterialRowClassName(row)}`}>
                  <td className="px-3 py-2 text-center opacity-70 font-mono text-xs">
                    {(materialListPage - 1) * MATERIAL_ITEMS_PER_PAGE + index + 1}
                  </td>
                  {MATERIAL_LIST_COLUMNS.map((col, colIdx) => (
                    <td key={colIdx} className="px-3 py-2">{formatCellValue(row[col])}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={MATERIAL_LIST_COLUMNS.length + 1} className="p-8 text-center text-slate-500">
                  Không có dữ liệu hiển thị.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalMaterialPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-slate-600">
          <div>Trang {materialListPage} / {totalMaterialPages}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMaterialListPage(prev => Math.max(prev - 1, 1))}
              disabled={materialListPage === 1}
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setMaterialListPage(prev => Math.min(prev + 1, totalMaterialPages))}
              disabled={materialListPage === totalMaterialPages}
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
