import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Download } from 'lucide-react';
import { formatDecimal, parseNumber } from '../../utils/numberParsers';
import { exportDetailRowsToCsv } from '../../utils/csvExport';
import { DataRow } from '../../../../types';

export interface HexDetailColumnKeys {
  hexKey: string;
  congTrinhKey: string;
  hangMucKey: string;
  xuongKey: string;
  bopKey: string;
  tinhTrangKey: string;
  phanLoaiNhomSanPhamKey: string;
  triGiaDonHangTongKey: string;
  thanhTienTinhPhieuKey: string;
  thanhTienNhapKhoKey: string;
}

interface HexDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  projectName: string | null;
  rows: DataRow[];
  columnKeys: HexDetailColumnKeys;
}

const money = (value: number) => formatDecimal(value / 1000);

const COL_WIDTHS = {
  stt: 50,
  hex: 150,
  congTrinh: 200,
  hangMuc: 260,
  xuong: 100,
  bop: 80,
  tinhTrang: 200,
  phanLoai: 160,
  triGiaDonHangTong: 130,
  thanhTienTinhPhieu: 130,
  thanhTienNhapKho: 130,
};

type SortKey =
  | 'stt'
  | 'hex'
  | 'congTrinh'
  | 'hangMuc'
  | 'xuong'
  | 'bop'
  | 'tinhTrang'
  | 'phanLoai'
  | 'triGia'
  | 'thanhTienPhieu'
  | 'thanhTienKho';
type SortDir = 'asc' | 'desc';

const NUMERIC_SORT_KEYS: SortKey[] = ['triGia', 'thanhTienPhieu', 'thanhTienKho'];

const SortIcon = ({ active, dir }: { active: boolean; dir?: SortDir }) => {
  if (!active) return <ChevronsUpDown size={12} className="shrink-0 text-slate-400" />;
  return dir === 'asc' ? (
    <ChevronUp size={12} className="shrink-0 text-emerald-700" />
  ) : (
    <ChevronDown size={12} className="shrink-0 text-emerald-700" />
  );
};

export const HexDetailModal = ({
  isOpen,
  onClose,
  title,
  projectName,
  rows,
  columnKeys,
}: HexDetailModalProps) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);

  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  useEffect(() => {
    if (!isOpen) setSearch('');
    if (!isOpen) setSort(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const el = bodyScrollRef.current;
      if (el) setScrollbarWidth(el.offsetWidth - el.clientWidth);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [isOpen, rows, search]);

  const handleBodyScroll = useCallback(() => {
    const left = bodyScrollRef.current?.scrollLeft ?? 0;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
    if (footerScrollRef.current) footerScrollRef.current.scrollLeft = left;
  }, []);

  const {
    hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
    phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
  } = columnKeys;

  const toggleSort = useCallback((key: SortKey) => {
    const defaultDir: SortDir = NUMERIC_SORT_KEYS.includes(key) ? 'desc' : 'asc';
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: defaultDir };
      if (prev.dir === defaultDir) return { key, dir: defaultDir === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  }, []);

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

  // ✅ MỚI: gắn STT cố định (1..N) theo đúng thứ tự gốc của filteredRows —
  // giá trị này KHÔNG đổi khi sort theo các cột khác, chỉ dùng để sort riêng
  // cột STT (giống Excel: sort theo STT desc thì đảo N..1).
  const indexedRows = useMemo(
    () => filteredRows.map((row, i) => ({ row, stt: i + 1 })),
    [filteredRows]
  );

  const sortedRows = useMemo(() => {
    if (!sort) return indexedRows;

    if (sort.key === 'stt') {
      const sorted = [...indexedRows].sort((a, b) => a.stt - b.stt);
      return sort.dir === 'desc' ? sorted.reverse() : sorted;
    }

    const getValue = (row: DataRow): number | string => {
      switch (sort.key) {
        case 'hex': return String(row[hexKey] || '');
        case 'congTrinh': return String(row[congTrinhKey] || '');
        case 'hangMuc': return String(row[hangMucKey] || '');
        case 'xuong': return String(row[xuongKey] || '');
        case 'bop': return String(row[bopKey] || '');
        case 'tinhTrang': return String(row[tinhTrangKey] || '');
        case 'phanLoai': return String(row[phanLoaiNhomSanPhamKey] || '');
        case 'triGia': return parseNumber(row[triGiaDonHangTongKey]);
        case 'thanhTienPhieu': return parseNumber(row[thanhTienTinhPhieuKey]);
        case 'thanhTienKho': return parseNumber(row[thanhTienNhapKhoKey]);
        default: return '';
      }
    };
    const sorted = [...indexedRows].sort((a, b) => {
      const va = getValue(a.row);
      const vb = getValue(b.row);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'vi');
      }
      return (va as number) - (vb as number);
    });
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [indexedRows, sort, hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey, phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey]);

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

  const exportColumns = [
    'STT',
    'Mã Hex',
    ...(showProjectColumn ? ['Công Trình'] : []),
    'Hạng Mục',
    'Khu Vực SX',
    'BOP',
    'Tình Trạng',
    'Phân Loại Nhóm Sản Phẩm',
    'Trị Giá Đơn Hàng Tổng (1000 VNĐ)',
    'Thành Tiền Tính Phiếu (1000 VNĐ)',
    'Thành Tiền Nhập Kho (1000 VNĐ)',
  ];
  const exportRows = sortedRows.map(({ row, stt }) => ({
    'STT': stt,
    'Mã Hex': String(row[hexKey] || ''),
    ...(showProjectColumn ? { 'Công Trình': String(row[congTrinhKey] || '') } : {}),
    'Hạng Mục': String(row[hangMucKey] || ''),
    'Khu Vực SX': String(row[xuongKey] || ''),
    'BOP': String(row[bopKey] || ''),
    'Tình Trạng': String(row[tinhTrangKey] || ''),
    'Phân Loại Nhóm Sản Phẩm': String(row[phanLoaiNhomSanPhamKey] || ''),
    'Trị Giá Đơn Hàng Tổng (1000 VNĐ)': parseNumber(row[triGiaDonHangTongKey]) / 1000,
    'Thành Tiền Tính Phiếu (1000 VNĐ)': parseNumber(row[thanhTienTinhPhieuKey]) / 1000,
    'Thành Tiền Nhập Kho (1000 VNĐ)': parseNumber(row[thanhTienNhapKhoKey]) / 1000,
  }));
  const exportFileName = `chi_tiet_hex_${(projectName ?? 'tat_ca_cong_trinh')
    .toString()
    .trim()
    .replace(/\s+/g, '_')}`;

  const totalMinWidth =
    COL_WIDTHS.stt +
    COL_WIDTHS.hex +
    (showProjectColumn ? COL_WIDTHS.congTrinh : 0) +
    COL_WIDTHS.hangMuc +
    COL_WIDTHS.xuong +
    COL_WIDTHS.bop +
    COL_WIDTHS.tinhTrang +
    COL_WIDTHS.phanLoai +
    COL_WIDTHS.triGiaDonHangTong +
    COL_WIDTHS.thanhTienTinhPhieu +
    COL_WIDTHS.thanhTienNhapKho;

  const pct = (px: number) => `${((px / totalMinWidth) * 100).toFixed(4)}%`;

  const ColGroup = () => (
    <colgroup>
      <col style={{ width: pct(COL_WIDTHS.stt) }} />
      <col style={{ width: pct(COL_WIDTHS.hex) }} />
      {showProjectColumn && <col style={{ width: pct(COL_WIDTHS.congTrinh) }} />}
      <col style={{ width: pct(COL_WIDTHS.hangMuc) }} />
      <col style={{ width: pct(COL_WIDTHS.xuong) }} />
      <col style={{ width: pct(COL_WIDTHS.bop) }} />
      <col style={{ width: pct(COL_WIDTHS.tinhTrang) }} />
      <col style={{ width: pct(COL_WIDTHS.phanLoai) }} />
      <col style={{ width: pct(COL_WIDTHS.triGiaDonHangTong) }} />
      <col style={{ width: pct(COL_WIDTHS.thanhTienTinhPhieu) }} />
      <col style={{ width: pct(COL_WIDTHS.thanhTienNhapKho) }} />
    </colgroup>
  );

  const tableStyle: React.CSSProperties = {
    width: '100%',
    minWidth: totalMinWidth,
    tableLayout: 'fixed',
  };

  const headerCellClass =
    'cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 transition-colors hover:bg-emerald-100';

  const SortableHeader = ({
    sortKey,
    align = 'left',
    children,
    className = '',
  }: {
    sortKey: SortKey;
    align?: 'left' | 'right';
    children: React.ReactNode;
    className?: string;
  }) => (
    <th onClick={() => toggleSort(sortKey)} className={`${headerCellClass} ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {children}
        <SortIcon active={sort?.key === sortKey} dir={sort?.dir} />
      </span>
    </th>
  );

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex flex-col rounded-xl bg-white shadow-xl"
        style={{ width: '96vw', maxWidth: 1680, height: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              Chi tiết theo Hex — {title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {projectName ?? 'Tất cả công trình'} · {filteredRows.length} hex ·{' '}
              Đơn vị tiền: 1,000 VNĐ
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => exportDetailRowsToCsv(exportFileName, exportColumns, exportRows)}
              disabled={filteredRows.length === 0}
              title="Xuất dữ liệu đang hiển thị ra file .CSV"
              className="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={15} />
              <span>Xuất CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-slate-100 px-5 py-3">
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

        {filteredRows.length > 0 ? (
          <>
            <div className="shrink-0 overflow-hidden border-b border-emerald-200 bg-emerald-50 px-5 pt-5">
              <div className="flex">
                <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                  <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                    <ColGroup />
                    <thead className="font-bold uppercase tracking-tight text-slate-800">
                      <tr>
                        <th
                          onClick={() => toggleSort('stt')}
                          style={{ left: 0 }}
                          className="sticky z-10 cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-2 py-3 text-center transition-colors hover:bg-emerald-100"
                        >
                          <span className="inline-flex items-center justify-center gap-1">
                            STT
                            <SortIcon active={sort?.key === 'stt'} dir={sort?.dir} />
                          </span>
                        </th>
                        <th
                          onClick={() => toggleSort('hex')}
                          style={{ left: COL_WIDTHS.stt }}
                          className="sticky z-10 min-w-[140px] cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left transition-colors hover:bg-emerald-100"
                        >
                          <span className="inline-flex items-center gap-1">
                            Mã Hex
                            <SortIcon active={sort?.key === 'hex'} dir={sort?.dir} />
                          </span>
                        </th>
                        {showProjectColumn && (
                          <SortableHeader sortKey="congTrinh">Công Trình</SortableHeader>
                        )}
                        <SortableHeader sortKey="hangMuc">Hạng Mục</SortableHeader>
                        <SortableHeader sortKey="xuong">Khu Vực SX</SortableHeader>
                        <SortableHeader sortKey="bop">BOP</SortableHeader>
                        <SortableHeader sortKey="tinhTrang">Tình Trạng</SortableHeader>
                        <SortableHeader sortKey="phanLoai" align="right">
                          Phân Loại <br />Nhóm SP
                        </SortableHeader>
                        <SortableHeader sortKey="triGia" align="right">
                          Trị Giá Đơn <br />Hàng Tổng
                        </SortableHeader>
                        <SortableHeader sortKey="thanhTienPhieu" align="right">
                          Thành Tiền <br />Tính Phiếu
                        </SortableHeader>
                        <th
                          onClick={() => toggleSort('thanhTienKho')}
                          className="cursor-pointer select-none border-b border-emerald-200 bg-emerald-50 px-3 py-3 text-right transition-colors hover:bg-emerald-100"
                        >
                          <span className="inline-flex items-center justify-end gap-1">
                            Thành Tiền <br />Nhập Kho
                            <SortIcon active={sort?.key === 'thanhTienKho'} dir={sort?.dir} />
                          </span>
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>
                {scrollbarWidth > 0 && <div style={{ width: scrollbarWidth }} className="shrink-0" />}
              </div>
            </div>

            <div
              ref={bodyScrollRef}
              onScroll={handleBodyScroll}
              className="min-h-0 flex-1 overflow-auto custom-scrollbar px-5"
            >
              <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                <ColGroup />
                <tbody className="divide-y divide-emerald-50">
                  {sortedRows.map((entry, idx) => {
                    const row = entry.row;
                    return (
                      <tr key={idx} className="group transition-colors hover:bg-slate-50">
                        <td
                          style={{ left: 0 }}
                          className="sticky z-10 border-r border-slate-100 bg-white px-2 py-2.5 text-center font-semibold text-slate-500 group-hover:bg-slate-50"
                        >
                          {entry.stt}
                        </td>
                        <td
                          style={{ left: COL_WIDTHS.stt }}
                          className="sticky z-10 border-r border-slate-100 bg-white px-3 py-2.5 text-left font-medium text-slate-700 group-hover:bg-slate-50"
                        >
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
                          {String(row[phanLoaiNhomSanPhamKey] || '—')}
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
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 overflow-hidden border-t-2 border-emerald-400 bg-emerald-100 px-5 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
              <div className="flex">
                <div ref={footerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                  <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                    <ColGroup />
                    <tfoot className="font-bold text-slate-900">
                      <tr>
                        <td
                          className="sticky left-0 z-10 bg-emerald-100 px-3 py-3 text-left"
                          colSpan={(showProjectColumn ? 6 : 5) + 1}
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
                {scrollbarWidth > 0 && <div style={{ width: scrollbarWidth }} className="shrink-0" />}
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="rounded-lg bg-slate-50 p-8 text-center text-slate-500">
              Không có dữ liệu hex phù hợp để hiển thị.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};