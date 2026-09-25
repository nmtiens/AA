import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronUp, ChevronDown, ChevronsUpDown, Download } from 'lucide-react';
import { formatNumber, formatDecimal } from '../../utils/numberParsers';
import { exportDetailRowsToCsv } from '../../utils/csvExport';

export const ON_LINE_STAGES = [
  'P002',
  'P012',
  'P013',
  'GCVT',
  'P014',
  'P016',
  'P018',
  'P020',
  'P021',
] as const;

// Giá trị đại diện cho "tất cả công đoạn" khi click vào ô Tổng.
export const TOTAL_STAGE = 'TOTAL';

export const extractStage = (value: unknown): string | null => {
  const match = String(value ?? '').trim().toUpperCase().match(/^(P\d{3}|GCVT)/);
  return match ? match[1] : null;
};

export interface StageDetailRow {
  name: string;
  values: Record<string, number>;
}

interface OnLineStageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string | null;
  metric: 'COUNT' | 'VALUE';
  rows: StageDetailRow[];
  // stage = mã công đoạn (P002...) hoặc TOTAL_STAGE khi click ô Tổng
  onValueClick?: (projectName: string | null, stage: string) => void;
}

const STT_COL_WIDTH = 50;
const NAME_COL_WIDTH = 220;
const STAGE_COL_WIDTH = 90;
const TOTAL_COL_WIDTH = 110;

type SortKey = 'stt' | 'name' | (typeof ON_LINE_STAGES)[number] | 'total';
type SortDir = 'asc' | 'desc';

const SortIcon = ({ active, dir }: { active: boolean; dir?: SortDir }) => {
  if (!active) return <ChevronsUpDown size={12} className="shrink-0 text-slate-400" />;
  return dir === 'asc' ? (
    <ChevronUp size={12} className="shrink-0 text-emerald-700" />
  ) : (
    <ChevronDown size={12} className="shrink-0 text-emerald-700" />
  );
};

export const OnLineStageDetailModal = ({
  isOpen,
  onClose,
  projectName,
  metric,
  rows,
  onValueClick,
}: OnLineStageDetailModalProps) => {
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);

  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

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
  }, [isOpen, rows]);

  const handleBodyScroll = useCallback(() => {
    const left = bodyScrollRef.current?.scrollLeft ?? 0;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
    if (footerScrollRef.current) footerScrollRef.current.scrollLeft = left;
  }, []);

  const toggleSort = useCallback((key: SortKey) => {
    const defaultDir: SortDir = key === 'name' || key === 'stt' ? 'asc' : 'desc';
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: defaultDir };
      if (prev.dir === defaultDir) return { key, dir: defaultDir === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  }, []);

  // STT cố định (1..N) theo đúng thứ tự gốc của rows.
  const indexedRows = useMemo(
    () => rows.map((row, i) => ({ row, stt: i + 1 })),
    [rows]
  );

  const sortedRows = useMemo(() => {
    if (!sort) return indexedRows;

    if (sort.key === 'stt') {
      const sorted = [...indexedRows].sort((a, b) => a.stt - b.stt);
      return sort.dir === 'desc' ? sorted.reverse() : sorted;
    }

    const getValue = (row: StageDetailRow): number | string => {
      if (sort.key === 'name') return row.name;
      if (sort.key === 'total') {
        return ON_LINE_STAGES.reduce((acc, s) => acc + (row.values[s] ?? 0), 0);
      }
      return row.values[sort.key] ?? 0;
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
  }, [indexedRows, sort]);

  if (!isOpen) return null;

  const formatter = metric === 'COUNT' ? formatNumber : formatDecimal;
  const label = metric === 'VALUE' ? 'Giá Trị' : 'Số Lượng';

  const rowTotal = (row: StageDetailRow) =>
    ON_LINE_STAGES.reduce((acc, stage) => acc + (row.values[stage] ?? 0), 0);
  const stageTotal = (stage: string) =>
    rows.reduce((acc, row) => acc + (row.values[stage] ?? 0), 0);
  const grandTotal = rows.reduce((acc, row) => acc + rowTotal(row), 0);

  const renderCell = (
    value: number,
    onClick?: () => void,
    className = 'font-semibold text-slate-700'
  ) =>
    value === 0 ? (
      <span className="text-slate-300">–</span>
    ) : onClick ? (
      <button
        type="button"
        onClick={onClick}
        className={`${className} hover:text-emerald-700 hover:underline`}
      >
        {formatter(value)}
      </button>
    ) : (
      formatter(value)
    );

  const totalMinWidth = STT_COL_WIDTH + NAME_COL_WIDTH + ON_LINE_STAGES.length * STAGE_COL_WIDTH + TOTAL_COL_WIDTH;
  const pct = (px: number) => `${((px / totalMinWidth) * 100).toFixed(4)}%`;
  const tableStyle: React.CSSProperties = {
    width: '100%',
    minWidth: totalMinWidth,
    tableLayout: 'fixed',
  };

  const ColGroup = () => (
    <colgroup>
      <col style={{ width: pct(STT_COL_WIDTH) }} />
      <col style={{ width: pct(NAME_COL_WIDTH) }} />
      {ON_LINE_STAGES.map((stage) => (
        <col key={stage} style={{ width: pct(STAGE_COL_WIDTH) }} />
      ))}
      <col style={{ width: pct(TOTAL_COL_WIDTH) }} />
    </colgroup>
  );

  const headerCellClass =
    'cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 transition-colors hover:bg-emerald-100';

  const exportColumns = ['STT', 'Tên Công Trình', ...ON_LINE_STAGES, 'Tổng'];
  const exportRows = sortedRows.map(({ row, stt }) => {
    const record: Record<string, number | string> = { 'STT': stt, 'Tên Công Trình': row.name };
    ON_LINE_STAGES.forEach((stage) => {
      record[stage] = row.values[stage] ?? 0;
    });
    record['Tổng'] = rowTotal(row);
    return record;
  });
  const exportFileName = `dang_tren_chuyen_${metric.toLowerCase()}_${(projectName ?? 'tat_ca_cong_trinh')
    .toString()
    .trim()
    .replace(/\s+/g, '_')}`;

  // ✅ SỬA: return createPortal(...) thay vì return JSX trực tiếp — render ra
  // document.body để tránh bị "giam" trong ancestor có transform (sidebar/app
  // shell), và tăng z-index lên z-[9999] để luôn nổi trên HexDetailModal
  // (z-[9998]) khi cả hai cùng mở, không phụ thuộc thứ tự DOM.
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4"
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
              Chi tiết đang trên chuyền {'P002->P021'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {projectName ?? 'Tất cả công trình'} · {label} ·{' '}
              {metric === 'COUNT' ? 'Hạng mục (Items)' : '1,000 VNĐ'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => exportDetailRowsToCsv(exportFileName, exportColumns, exportRows)}
              disabled={rows.length === 0}
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

        {rows.length > 0 ? (
          <>
            <div className="shrink-0 overflow-hidden border-b border-emerald-200 bg-emerald-50 px-5 pt-5">
              <div className="flex">
                <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                  <table style={tableStyle} className="border-separate border-spacing-0 text-right text-xs">
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
                          onClick={() => toggleSort('name')}
                          style={{ left: STT_COL_WIDTH }}
                          className="sticky z-10 cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left transition-colors hover:bg-emerald-100"
                        >
                          <span className="inline-flex items-center gap-1">
                            Tên Công Trình
                            <SortIcon active={sort?.key === 'name'} dir={sort?.dir} />
                          </span>
                        </th>
                        {ON_LINE_STAGES.map((stage) => (
                          <th key={stage} onClick={() => toggleSort(stage)} className={headerCellClass}>
                            <span className="inline-flex items-center justify-end gap-1">
                              {stage}
                              <SortIcon active={sort?.key === stage} dir={sort?.dir} />
                            </span>
                          </th>
                        ))}
                        <th
                          onClick={() => toggleSort('total')}
                          className="border-b border-emerald-200 bg-emerald-50 px-3 py-3 font-extrabold text-slate-900 cursor-pointer select-none transition-colors hover:bg-emerald-100"
                        >
                          <span className="inline-flex items-center justify-end gap-1">
                            Tổng
                            <SortIcon active={sort?.key === 'total'} dir={sort?.dir} />
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
              <table style={tableStyle} className="border-separate border-spacing-0 text-right text-xs">
                <ColGroup />
                <tbody className="divide-y divide-emerald-50">
                  {sortedRows.map((entry) => {
                    const row = entry.row;
                    return (
                      <tr key={row.name} className="group transition-colors hover:bg-slate-50">
                        <td
                          style={{ left: 0 }}
                          className="sticky z-10 border-r border-slate-100 bg-white px-2 py-2.5 text-center font-semibold text-slate-500 group-hover:bg-slate-50"
                        >
                          {entry.stt}
                        </td>
                        <td
                          style={{ left: STT_COL_WIDTH }}
                          className="sticky z-10 border-r border-slate-100 bg-white px-3 py-2.5 text-left font-medium text-slate-700 group-hover:bg-slate-50"
                        >
                          {row.name}
                        </td>
                        {ON_LINE_STAGES.map((stage) => (
                          <td key={stage} className="px-3 py-2.5 text-slate-700">
                            {renderCell(
                              row.values[stage] ?? 0,
                              onValueClick ? () => onValueClick(row.name, stage) : undefined
                            )}
                          </td>
                        ))}
                        <td className="bg-slate-50/50 px-3 py-2.5">
                          {renderCell(
                            rowTotal(row),
                            onValueClick ? () => onValueClick(row.name, TOTAL_STAGE) : undefined,
                            'font-bold text-slate-900'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.length > 1 && (
              <div className="shrink-0 overflow-hidden border-t-2 border-emerald-400 bg-emerald-100 px-5 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
                <div className="flex">
                  <div ref={footerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                    <table style={tableStyle} className="border-separate border-spacing-0 text-right text-xs">
                      <ColGroup />
                      <tfoot className="font-bold text-slate-900">
                        <tr>
                          <td className="sticky left-0 z-10 bg-emerald-100 px-3 py-3 text-left" colSpan={2}>
                            TỔNG CỘNG
                          </td>
                          {ON_LINE_STAGES.map((stage) => (
                            <td key={stage} className="px-3 py-3">
                              {renderCell(
                                stageTotal(stage),
                                onValueClick ? () => onValueClick(null, stage) : undefined
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-3">
                            {renderCell(
                              grandTotal,
                              onValueClick ? () => onValueClick(null, TOTAL_STAGE) : undefined,
                              'font-bold text-slate-900'
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {scrollbarWidth > 0 && <div style={{ width: scrollbarWidth }} className="shrink-0" />}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="rounded-lg bg-slate-50 p-8 text-center text-slate-500">
              Không có dữ liệu chi tiết để hiển thị.
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};