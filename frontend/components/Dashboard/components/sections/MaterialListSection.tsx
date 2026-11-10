import React, { useState, useMemo, useEffect } from 'react';
import { Box, ChevronLeft, ChevronRight } from 'lucide-react';
import { DataRow } from '../../../../types';
import { MATERIAL_LIST_COLUMNS, MATERIAL_LIST_COLUMN_LABELS } from '../../constants';
import { fmtInt } from '../../../../utils/format';
import * as bang from '../../../shared/bangBaoCao';

const MATERIAL_ITEMS_PER_PAGE = 100;

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

useEffect(() => {
  setMaterialListPage(1);
}, [displayedMaterialData]);

const totalMaterialPages = Math.max(
  1,
  Math.ceil(displayedMaterialData.length / MATERIAL_ITEMS_PER_PAGE)
);

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
          <Box className="w-4 h-4 text-slate-600" />Chi tiết vật tư
        </h3>
       <span className="text-sm text-slate-600 tabular-nums">
  {fmtInt(paginatedMaterialList.length)} / {fmtInt(displayedMaterialData.length)}
</span>
      </div>
      <div className={`${bang.khung} max-h-[600px]`}>
        <table className={`${bang.table} whitespace-nowrap text-left`}>
          <thead className={bang.thead}>
            <tr>
              <th className={`${bang.thC} w-12`}>STT</th>
              {MATERIAL_LIST_COLUMNS.map((col, idx) => (
                <th key={idx} className={bang.thB}>
                  {MATERIAL_LIST_COLUMN_LABELS[col] || col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedMaterialList.length > 0 ? (
              paginatedMaterialList.map((row, index) => (
                <tr key={index} className={getMaterialRowClassName(row)}>
                  <td className={`${bang.tdSo} text-slate-500`}>
                    {(materialListPage - 1) * MATERIAL_ITEMS_PER_PAGE + index + 1}
                  </td>
                  {MATERIAL_LIST_COLUMNS.map((col, colIdx) => (
                    <td key={colIdx} className={bang.tdB}>{formatCellValue(row[col])}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={MATERIAL_LIST_COLUMNS.length + 1} className={`${bang.tdB} p-8 text-center text-slate-500`}>
                  Không có dữ liệu hiển thị.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className={bang.tfoot}>
            <tr>
              <td className={bang.tdSo}>TỔNG</td>
              <td className={bang.tdB} colSpan={MATERIAL_LIST_COLUMNS.length}>{fmtInt(displayedMaterialData.length)} dòng</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {totalMaterialPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-700">
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
