import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronUp, ChevronDown, ChevronsUpDown, Download } from 'lucide-react';
import { fmtInt, fmtSoTy } from '../../../../utils/format';
import * as bang from '../../../shared/bangBaoCao';
import { exportDetailRowsToCsv } from '../../utils/csvExport';
import { ModalColumnSetupButton } from '../../../Construction/utils/ModalColumnSetupButton';
import { resolveVisibleModalColumns, ModalColumnDef } from '../../../Construction/utils/tableColumnConfig';
import { useFrozenColumns, applyFrozen, fzClass, fzStyle } from '../../../Construction/utils/useFrozenColumns';

// Hằng số công đoạn: core/stages.ts (dùng chung cả máy chủ)
import { ON_LINE_STAGES, P002_STAGE, TOTAL_STAGE, extractStage } from '../../core/stages';
export { ON_LINE_STAGES, P002_STAGE, TOTAL_STAGE, extractStage };

export interface StageDetailRow {
  /** ✅ ĐỔI: bây giờ là tên KHU VỰC SẢN XUẤT (mỗi dòng = 1 khu vực) */
  name: string;
  values: Record<string, number>;
}

interface OnLineStageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string | null;
  metric: 'COUNT' | 'VALUE';
  rows: StageDetailRow[];
  /** Tham số 1 giờ là tên khu vực sản xuất (null = dòng Tổng cộng). */
  onValueClick?: (areaName: string | null, stage: string) => void;
}

const AREA_COL_WIDTH = 240;
const STAGE_COL_WIDTH = 100;
const TOTAL_MIN_COL = 120;
const AREA_LABEL = 'Khu Vực Sản Xuất';

type StageKey = (typeof ON_LINE_STAGES)[number];
type SortKey = 'name' | StageKey | 'total';
type SortDir = 'asc' | 'desc';

const STAGE_COLUMNS: ModalColumnDef[] = ON_LINE_STAGES.map((stage) => ({ key: stage, label: stage }));

const STAGE_WIDTHS = Object.fromEntries(
  ON_LINE_STAGES.map((s) => [s, STAGE_COL_WIDTH])
) as Record<StageKey, number>;

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
    const defaultDir: SortDir = key === 'name' ? 'asc' : 'desc';
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: defaultDir };
      if (prev.dir === defaultDir) return { key, dir: defaultDir === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  }, []);

  // ==== Setup cột hiển thị (chỉ Admin): chọn/ẩn + kéo-thả + ghim. Cột "Tổng" luôn ở cuối. ====
  const [cfgVersion, setCfgVersion] = useState(0);

  const visibleStageCols = useMemo(
    () => resolveVisibleModalColumns('modal_online_stage_detail', STAGE_COLUMNS),
    [cfgVersion]
  );

  const orderedStages = useMemo(
    () => visibleStageCols.map((c) => c.key) as StageKey[],
    [visibleStageCols]
  );

  // Freeze: cột Khu Vực Sản Xuất ('name') + các công đoạn
  const frozen = useFrozenColumns(
    'modal_online_stage_detail',
    [{ key: 'name', width: AREA_COL_WIDTH }],
    orderedStages,
    STAGE_WIDTHS,
    cfgVersion
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;

    const getValue = (row: StageDetailRow): number | string => {
      if (sort.key === 'name') return row.name;
      if (sort.key === 'total') {
        return ON_LINE_STAGES.reduce((acc, s) => acc + (row.values[s] ?? 0), 0);
      }
      return row.values[sort.key] ?? 0;
    };
    const sorted = [...rows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'vi');
      }
      return (va as number) - (vb as number);
    });
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [rows, sort]);

  if (!isOpen) return null;

  const formatter = metric === 'COUNT' ? fmtInt : fmtSoTy; // VALUE đã ở đơn vị Tỷ
  const label = metric === 'VALUE' ? 'Giá Trị' : 'Số Lượng';

  // Tổng luôn tính trên toàn bộ ON_LINE_STAGES (không phụ thuộc ẩn/hiện cột).
  const rowTotal = (row: StageDetailRow) =>
    ON_LINE_STAGES.reduce((acc, stage) => acc + (row.values[stage] ?? 0), 0);
  const stageTotal = (stage: string) =>
    rows.reduce((acc, row) => acc + (row.values[stage] ?? 0), 0);
  const grandTotal = rows.reduce((acc, row) => acc + rowTotal(row), 0);

  const renderCell = (
    value: number,
    onClick?: () => void,
    className = ''
  ) =>
    value === 0 ? (
      ''
    ) : onClick ? (
      <button
        type="button"
        onClick={onClick}
        className={`${className} ${bang.soBam} hover:text-emerald-700`}
      >
        {formatter(value)}
      </button>
    ) : (
      formatter(value)
    );

  const totalMinWidth = AREA_COL_WIDTH + orderedStages.length * STAGE_COL_WIDTH + TOTAL_MIN_COL;
  const tableStyle: React.CSSProperties = {
    width: '100%',
    minWidth: totalMinWidth,
    tableLayout: 'fixed',
  };

  // ✅ Cửa sổ co theo nội dung (không còn rộng 96vw / cao 92vh gây trống): 40px = padding 2 bên,
  // thêm chút chỗ cho thanh cuộn dọc.
  const modalWidth = Math.max(totalMinWidth + 40 + 16, 640);

  // Colgroup dùng PX; cột "Tổng" (cuối) không khai báo width -> hấp thụ phần dư (rất nhỏ).
  const ColGroup = () => (
    <colgroup>
      <col style={{ width: AREA_COL_WIDTH }} />
      {orderedStages.map((stage) => (
        <col key={stage} style={{ width: STAGE_COL_WIDTH }} />
      ))}
      <col />
    </colgroup>
  );

  const headerCellClass = `${bang.thC} cursor-pointer select-none bg-emerald-300 transition-colors hover:bg-emerald-200`;

  const exportColumns = [AREA_LABEL, ...orderedStages, 'Tổng'];
  const exportRows = sortedRows.map((row) => {
    const record: Record<string, number | string> = { [AREA_LABEL]: row.name };
    orderedStages.forEach((stage) => {
      record[stage] = row.values[stage] ?? 0;
    });
    record['Tổng'] = rowTotal(row);
    return record;
  });
  const exportFileName = `dang_tren_chuyen_${metric.toLowerCase()}_${(projectName ?? 'tat_ca_cong_trinh')
    .toString()
    .trim()
    .replace(/\s+/g, '_')}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex flex-col rounded-xl bg-white shadow-xl"
        style={{ width: `min(96vw, ${modalWidth}px)`, maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              Chi tiết đang trên chuyền {'P012->P021'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {projectName ?? 'Tất cả công trình'} · {label} ·{' '}
              {metric === 'COUNT' ? 'Hạng mục' : 'tỷ'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ModalColumnSetupButton
              modalId="modal_online_stage_detail"
              allColumns={STAGE_COLUMNS}
              fixedLabels={[AREA_LABEL]}
              onChange={() => setCfgVersion(v => v + 1)}
            />
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
            <div className="shrink-0 overflow-hidden bg-emerald-300">
              <div className="flex">
                <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                  <table style={tableStyle} className={bang.table}>
                    <ColGroup />
                    <thead className="text-slate-900">
                      <tr>
                        <th
                          onClick={() => toggleSort('name')}
                          style={fzStyle(frozen.get('name'))}
                          className={`${fzClass(frozen.get('name'))} ${bang.thB} cursor-pointer select-none bg-emerald-300 text-left transition-colors hover:bg-emerald-200`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {AREA_LABEL}
                            <SortIcon active={sort?.key === 'name'} dir={sort?.dir} />
                          </span>
                        </th>
                        {orderedStages.map((stage) =>
                          applyFrozen(
                            <th key={stage} onClick={() => toggleSort(stage)} className={headerCellClass}>
                              <span className="inline-flex items-center justify-center gap-1">
                                {stage}
                                <SortIcon active={sort?.key === stage} dir={sort?.dir} />
                              </span>
                            </th>,
                            frozen.get(stage),
                            '!bg-emerald-300'
                          )
                        )}
                        <th
                          onClick={() => toggleSort('total')}
                          className={headerCellClass}
                        >
                          <span className="inline-flex items-center justify-center gap-1">
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

            {/* Không dùng flex-1: chiều cao co theo số dòng, chỉ cuộn khi vượt quá 92vh */}
            <div
              ref={bodyScrollRef}
              onScroll={handleBodyScroll}
              className="min-h-0 overflow-auto custom-scrollbar"
            >
              <table style={tableStyle} className={bang.table}>
                <ColGroup />
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.name} className="group transition-colors hover:bg-slate-50">
                      <td
                        style={fzStyle(frozen.get('name'))}
                        className={`${fzClass(frozen.get('name'))} ${bang.tdB} bg-white text-left group-hover:bg-slate-50`}
                      >
                        {row.name}
                      </td>
                      {orderedStages.map((stage) =>
                        applyFrozen(
                          <td key={stage} className={bang.tdSo}>
                            {renderCell(
                              row.values[stage] ?? 0,
                              onValueClick ? () => onValueClick(row.name, stage) : undefined
                            )}
                          </td>,
                          frozen.get(stage),
                          '!bg-white group-hover:!bg-slate-50'
                        )
                      )}
                      <td className={`${bang.tdSo} font-bold`}>
                        {renderCell(
                          rowTotal(row),
                          onValueClick ? () => onValueClick(row.name, TOTAL_STAGE) : undefined
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.length > 1 && (
              <div className="shrink-0 overflow-hidden bg-yellow-300">
                <div className="flex">
                  <div ref={footerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                    <table style={tableStyle} className={bang.table}>
                      <ColGroup />
                      <tfoot className={bang.tfoot}>
                        <tr>
                          <td
                            className={`${frozen.has('name') ? 'sticky left-0 z-10' : ''} ${bang.tdB} text-left`}
                          >
                            TỔNG
                          </td>
                          {orderedStages.map((stage) =>
                            applyFrozen(
                              <td key={stage} className={bang.tdSo}>
                                {renderCell(
                                  stageTotal(stage),
                                  onValueClick ? () => onValueClick(null, stage) : undefined
                                )}
                              </td>,
                              frozen.get(stage),
                              '!bg-yellow-300'
                            )
                          )}
                          <td className={bang.tdSo}>
                            {renderCell(
                              grandTotal,
                              onValueClick ? () => onValueClick(null, TOTAL_STAGE) : undefined
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
          <div className="min-h-0 overflow-auto p-5">
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