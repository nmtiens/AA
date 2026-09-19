import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { formatNumber, formatDecimal } from '../../utils/numberParsers';

// Thứ tự các công đoạn "đang trên chuyền" theo đúng bảng Tình trạng sản xuất
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

/** Lấy mã công đoạn (P002, GCVT...) từ giá trị cột Tình trạng. Không nhận diện được thì trả null. */
export const extractStage = (value: unknown): string | null => {
  const match = String(value ?? '').trim().toUpperCase().match(/^(P\d{3}|GCVT)/);
  return match ? match[1] : null;
};

export interface StageDetailRow {
  name: string;
  /** Giá trị theo từng mã công đoạn */
  values: Record<string, number>;
}

interface OnLineStageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string | null;
  metric: 'COUNT' | 'VALUE';
  rows: StageDetailRow[];
  /** Bấm vào 1 ô số → mở tiếp modal chi tiết theo Hex (lớp 2). projectName=null khi bấm ở dòng TỔNG CỘNG. */
  onValueClick?: (projectName: string | null, stage: string) => void;
}

export const OnLineStageDetailModal = ({
  isOpen,
  onClose,
  projectName,
  metric,
  rows,
  onValueClick,
}: OnLineStageDetailModalProps) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatter = metric === 'COUNT' ? formatNumber : formatDecimal;
  const label = metric === 'VALUE' ? 'Giá Trị' : 'Số Lượng';

  const rowTotal = (row: StageDetailRow) =>
    ON_LINE_STAGES.reduce((acc, stage) => acc + (row.values[stage] ?? 0), 0);
  const stageTotal = (stage: string) =>
    rows.reduce((acc, row) => acc + (row.values[stage] ?? 0), 0);
  const grandTotal = rows.reduce((acc, row) => acc + rowTotal(row), 0);

  const renderCell = (value: number, onClick?: () => void) =>
    value === 0 ? (
      <span className="text-slate-300">–</span>
    ) : onClick ? (
      <button
        type="button"
        onClick={onClick}
        className="text-slate-700 hover:text-emerald-700 hover:underline font-semibold"
      >
        {formatter(value)}
      </button>
    ) : (
      formatter(value)
    );

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
              Chi tiết đang trên chuyền {'P002->P021'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {projectName ?? 'Tất cả công trình'} · {label} ·{' '}
              {metric === 'COUNT' ? 'Hạng mục (Items)' : '1,000 VNĐ'}
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

        <div className="overflow-auto custom-scrollbar p-5">
          {rows.length > 0 ? (
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[900px] border-separate border-spacing-0 text-right text-xs">
                <thead className="font-bold uppercase tracking-tight text-slate-800">
                  <tr>
                    <th className="sticky left-0 top-0 z-30 min-w-[200px] border-b border-r border-emerald-200 bg-emerald-100 px-3 py-3 text-left">
                      Tên Công Trình
                    </th>
                    {ON_LINE_STAGES.map((stage) => (
                      <th
                        key={stage}
                        className="sticky top-0 z-20 border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3"
                      >
                        {stage}
                      </th>
                    ))}
                    <th className="sticky top-0 z-20 border-b border-emerald-200 bg-emerald-50 px-3 py-3 font-extrabold text-slate-900">
                      Tổng
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                 {rows.map((row) => (
  <tr key={row.name} className="group transition-colors hover:bg-slate-50">
    <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2.5 text-left font-medium text-slate-700 group-hover:bg-slate-50">
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
    <td className="bg-slate-50/50 px-3 py-2.5 font-bold text-slate-900">
      {formatter(rowTotal(row))}
    </td>
  </tr>
))}
                </tbody>
               {rows.length > 1 && (
  <tfoot className="sticky bottom-0 z-20 border-t border-emerald-300 bg-emerald-50 font-bold text-slate-800">
    <tr>
      <td className="sticky left-0 bg-emerald-50 px-3 py-3 text-left">TỔNG CỘNG</td>
      {ON_LINE_STAGES.map((stage) => (
        <td key={stage} className="px-3 py-3">
          {renderCell(
            stageTotal(stage),
            onValueClick ? () => onValueClick(null, stage) : undefined
          )}
        </td>
      ))}
      <td className="px-3 py-3 text-slate-900">{formatter(grandTotal)}</td>
    </tr>
  </tfoot>
)}
              </table>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 p-8 text-center text-slate-500">
              Không có dữ liệu chi tiết để hiển thị.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
