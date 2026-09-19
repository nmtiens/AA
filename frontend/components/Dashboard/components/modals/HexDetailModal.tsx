import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { formatDecimal, parseNumber } from '../../utils/numberParsers';
import { DataRow } from '../../../../types';

export interface HexDetailColumnKeys {
  hexKey: string;
  congTrinhKey: string;
  hangMucKey: string;
  xuongKey: string;
  bopKey: string;
  tinhTrangKey: string;
  daysAtCurrentStageKey: string;
  triGiaDonHangTongKey: string;
  thanhTienTinhPhieuKey: string;
  thanhTienNhapKhoKey: string;
}

interface HexDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tiêu đề cột đã bấm, vd "Tổng Giá Trị Đơn Hàng" */
  title: string;
  /** null = xem tất cả công trình (bấm từ dòng TỔNG CỘNG) */
  projectName: string | null;
  rows: DataRow[];
  columnKeys: HexDetailColumnKeys;
}

const money = (value: number) => formatDecimal(value / 1000);

export const HexDetailModal = ({
  isOpen,
  onClose,
  title,
  projectName,
  rows,
  columnKeys,
}: HexDetailModalProps) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const {
    hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
    daysAtCurrentStageKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
  } = columnKeys;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => {
      const hex = String(row[hexKey] || '').toLowerCase();
      const hangMuc = String(row[hangMucKey] || '').toLowerCase();
      const status = String(row[tinhTrangKey] || '').toLowerCase();
      return hex.includes(q) || hangMuc.includes(q) || status.includes(q);
    });
  }, [rows, search, hexKey, hangMucKey, tinhTrangKey]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.triGiaDonHangTong += parseNumber(row[triGiaDonHangTongKey]);
        acc.thanhTienTinhPhieu += parseNumber(row[thanhTienTinhPhieuKey]);
        acc.thanhTienNhapKho += parseNumber(row[thanhTienNhapKhoKey]);
        return acc;
      },
      { triGiaDonHangTong: 0, thanhTienTinhPhieu: 0, thanhTienNhapKho: 0 }
    );
  }, [filteredRows, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey]);

  if (!isOpen) return null;

  const showProjectColumn = projectName === null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              Chi tiết theo Hex — {title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {projectName ?? 'Tất cả công trình'} · {filteredRows.length} hex ·{' '}
              Đơn vị tiền: 1,000 VNĐ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <div className="relative max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã hex, hạng mục, tình trạng..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-300"
            />
          </div>
        </div>

        <div className="overflow-auto custom-scrollbar p-5">
          {filteredRows.length > 0 ? (
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1200px] border-separate border-spacing-0 text-xs">
                <thead className="font-bold uppercase tracking-tight text-slate-800">
                  <tr>
                    <th className="sticky left-0 top-0 z-30 min-w-[140px] border-b border-r border-emerald-200 bg-emerald-100 px-3 py-3 text-left">
                      Mã Hex
                    </th>
                    {showProjectColumn && (
                      <th className="sticky top-0 z-20 min-w-[180px] border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left">
                        Công Trình
                      </th>
                    )}
                    <th className="sticky top-0 z-20 min-w-[160px] border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left">
                      Hạng Mục
                    </th>
                    <th className="sticky top-0 z-20 border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left">
                      Khu Vực SX
                    </th>
                    <th className="sticky top-0 z-20 border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left">
                      BOP
                    </th>
                    <th className="sticky top-0 z-20 min-w-[160px] border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left">
                      Tình Trạng
                    </th>
                    <th className="sticky top-0 z-20 border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-right">
                      Số Ngày Ở <br />Giai Đoạn
                    </th>
                    <th className="sticky top-0 z-20 border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-right">
                      Trị Giá Đơn <br />Hàng Tổng
                    </th>
                    <th className="sticky top-0 z-20 border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-right">
                      Thành Tiền <br />Tính Phiếu
                    </th>
                    <th className="sticky top-0 z-20 border-b border-emerald-200 bg-emerald-50 px-3 py-3 text-right">
                      Thành Tiền <br />Nhập Kho
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                  {filteredRows.map((row, idx) => (
                    <tr key={idx} className="group transition-colors hover:bg-slate-50">
                      <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2.5 text-left font-medium text-slate-700 group-hover:bg-slate-50">
                        {String(row[hexKey] || '—')}
                      </td>
                      {showProjectColumn && (
                        <td className="px-3 py-2.5 text-left text-slate-700">
                          {String(row[congTrinhKey] || '—')}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-left text-slate-700">
                        {String(row[hangMucKey] || '—')}
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-600">
                        {String(row[xuongKey] || '—')}
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-600">
                        {String(row[bopKey] || '—')}
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-600">
                        {String(row[tinhTrangKey] || '—')}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {String(row[daysAtCurrentStageKey] || '—')}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-800">
                        {money(parseNumber(row[triGiaDonHangTongKey]))}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-800">
                        {money(parseNumber(row[thanhTienTinhPhieuKey]))}
                      </td>
                      <td className="px-3 py-2.5 text-right text-indigo-700 font-medium">
                        {money(parseNumber(row[thanhTienNhapKhoKey]))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-20 border-t border-emerald-300 bg-emerald-50 font-bold text-slate-800">
                  <tr>
                    <td
                      className="sticky left-0 bg-emerald-50 px-3 py-3 text-left"
                      colSpan={showProjectColumn ? 6 : 5}
                    >
                      TỔNG CỘNG ({filteredRows.length} hex)
                    </td>
                    <td className="px-3 py-3"></td>
                    <td className="px-3 py-3 text-right">{money(totals.triGiaDonHangTong)}</td>
                    <td className="px-3 py-3 text-right">{money(totals.thanhTienTinhPhieu)}</td>
                    <td className="px-3 py-3 text-right text-indigo-800">{money(totals.thanhTienNhapKho)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 p-8 text-center text-slate-500">
              Không có dữ liệu hex phù hợp để hiển thị.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
