import React, { useMemo, useState } from 'react';
import { X, Download } from 'lucide-react';
import { formatDecimal, parseNumber } from '../../utils/numberParsers';
import { exportDetailRowsToCsv } from '../../utils/csvExport';
import { DataRow } from '../../../../types';

export interface ExportDetailColumnKeys {
  hexKey: string;
  congTrinhKey: string;
  xuongKey: string;
  dateKey: string;
  soLuongKey: string;
  thanhTienKey: string;
}

interface ExportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string | null;
  rows: DataRow[];
  columnKeys: ExportDetailColumnKeys;
}

const money = (value: number) => formatDecimal(value / 1000);

export const ExportDetailModal = ({
  isOpen,
  onClose,
  projectName,
  rows,
  columnKeys,
}: ExportDetailModalProps) => {
  const { hexKey, congTrinhKey, xuongKey, dateKey, soLuongKey, thanhTienKey } = columnKeys;
  const showProjectColumn = projectName === null;

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.soLuong += parseNumber(row[soLuongKey]);
          acc.thanhTien += parseNumber(row[thanhTienKey]);
          return acc;
        },
        { soLuong: 0, thanhTien: 0 }
      ),
    [rows, soLuongKey, thanhTienKey]
  );

  if (!isOpen) return null;

  const exportColumns = [
    'STT', 'Mã Hex',
    ...(showProjectColumn ? ['Công Trình'] : []),
    'Khu Vực SX', 'Ngày Xuất', 'Số Lượng Xuất Kho', 'Thành Tiền Xuất Kho (1000 VNĐ)',
  ];
  const exportRows = rows.map((row, idx) => ({
    'STT': idx + 1,
    'Mã Hex': String(row[hexKey] || ''),
    ...(showProjectColumn ? { 'Công Trình': String(row[congTrinhKey] || '') } : {}),
    'Khu Vực SX': String(row[xuongKey] || ''),
    'Ngày Xuất': String(row[dateKey] || ''),
    'Số Lượng Xuất Kho': parseNumber(row[soLuongKey]),
    'Thành Tiền Xuất Kho (1000 VNĐ)': parseNumber(row[thanhTienKey]) / 1000,
  }));
  const exportFileName = `chi_tiet_xuat_kho_${(projectName ?? 'tat_ca_cong_trinh').toString().trim().replace(/\s+/g, '_')}`;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div
        className="flex flex-col rounded-xl bg-white shadow-xl"
        style={{ width: '90vw', maxWidth: 1200, height: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Chi tiết Đã Xuất Kho P025</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {projectName ?? 'Tất cả công trình'} · {rows.length} dòng · Đơn vị tiền: 1,000 VNĐ
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => exportDetailRowsToCsv(exportFileName, exportColumns, exportRows)}
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={15} /><span>Xuất CSV</span>
            </button>
            <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-auto custom-scrollbar px-5">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead className="font-bold uppercase tracking-tight text-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="border-b border-r border-emerald-200 bg-emerald-50 px-2 py-3 text-center">STT</th>
                  <th className="border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left">Mã Hex</th>
                  {showProjectColumn && (
                    <th className="border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left">Công Trình</th>
                  )}
                  <th className="border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left">Khu Vực SX</th>
                  <th className="border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left">Ngày Xuất</th>
                  <th className="border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-right">Số Lượng</th>
                  <th className="border-b border-emerald-200 bg-emerald-50 px-3 py-3 text-right">Thành Tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="border-r border-slate-100 px-2 py-2.5 text-center text-slate-500">{idx + 1}</td>
                    <td className="border-r border-slate-100 px-3 py-2.5 text-left font-medium text-slate-700">{String(row[hexKey] || '—')}</td>
                    {showProjectColumn && (
                      <td className="px-3 py-2.5 text-left text-slate-700">{String(row[congTrinhKey] || '—')}</td>
                    )}
                    <td className="px-3 py-2.5 text-left text-slate-600">{String(row[xuongKey] || '—')}</td>
                    <td className="px-3 py-2.5 text-left text-slate-600">{String(row[dateKey] || '—')}</td>
                    <td className="px-3 py-2.5 text-right text-slate-800">{parseNumber(row[soLuongKey]).toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">{money(parseNumber(row[thanhTienKey]))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-bold text-slate-900 sticky bottom-0">
                <tr>
                  <td className="bg-emerald-100 px-3 py-3 text-left" colSpan={showProjectColumn ? 4 : 3}>
                    TỔNG CỘNG ({rows.length} dòng)
                  </td>
                  <td className="bg-emerald-100 px-3 py-3 text-right">{totals.soLuong.toLocaleString('vi-VN')}</td>
                  <td className="bg-emerald-100 px-3 py-3 text-right">{money(totals.thanhTien)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="rounded-lg bg-slate-50 p-8 text-center text-slate-500">Không có dữ liệu xuất kho phù hợp.</div>
          </div>
        )}
      </div>
    </div>
  );
};