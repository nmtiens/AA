import React, { useState } from 'react';
import { FunnelCard } from '../shared/FunnelCard';
import { CheckCircle, Activity, XCircle, Eye, X } from 'lucide-react';
import { formatNumber } from '../../utils/numberParsers';
import { formatTrieuAsTy } from '../../../../utils/money';
import type { MetricType } from '../../types';
import { ModalShell } from '../../../shared/ModalShell';

export interface CustomFunnelItem {
  id: string;
  name: string;
  value: number;
  color: string;
  percentage: number;
}

export interface PivotFunnelData {
  data: { name: string; value: number }[];
  total: number;
}

interface ConstructionRevenueSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  targetRevenue2026: number;
  factoryRevenueStats: { actual: number; percent: number; cancelled?: number };
  customFunnelData: CustomFunnelItem[];
  pivotFunnelData: PivotFunnelData | null;
  workshopMetric: MetricType;
  // MỚI: báo lên cha khi user bấm vào 1 thanh funnel, để cha đổi
  // pivotFunnelData sang breakdown theo công trình của đúng bước đó.
  onFunnelItemClick?: (item: CustomFunnelItem) => void;
  // MỚI: báo lên cha khi đóng modal, để cha reset lại pivotFunnelData
  // về dữ liệu tổng (theo BOP) cho lần mở "Chi tiết" chung kế tiếp.
  onFunnelModalClose?: () => void;
  // MỚI: báo lên cha khi user bấm vào 1 con SỐ trong bảng pivot (Công trình/BOP),
  // để cha mở tiếp modal chi tiết lớp sau (vd. theo Hex). name=null khi bấm ở
  // dòng TỔNG CỘNG (xem tất cả các dòng trong bảng pivot hiện tại).
  onPivotValueClick?: (name: string | null, item: CustomFunnelItem | null) => void;
    sideContent?: React.ReactNode;

}

export const ConstructionRevenueSection = ({
  sectionRef,
  targetRevenue2026,
  factoryRevenueStats,
  customFunnelData,
  pivotFunnelData,
  workshopMetric,
  onFunnelItemClick,
  onFunnelModalClose,
  onPivotValueClick,
  sideContent
}: ConstructionRevenueSectionProps) => {
  const [isFunnelPivotModalOpen, setIsFunnelPivotModalOpen] = useState(false);
  const [selectedFunnelItem, setSelectedFunnelItem] = useState<CustomFunnelItem | null>(null);

  const cancelledValue = factoryRevenueStats.cancelled ?? 0;

  // Giá trị gốc là triệu đồng -> hiển thị Tỷ, 2 chữ số thập phân; đếm HEX giữ nguyên số lượng
  const formatFunnelValue = (value: number): string => {
    if (workshopMetric === 'COUNT_HEX') {
      return formatNumber(value, workshopMetric);
    }
    return formatTrieuAsTy(value);
  };

  const formatBarLabel = formatFunnelValue;

  const formatDetailValue = (value: number): string => {
    if (workshopMetric === 'COUNT_HEX') {
      return formatNumber(value, workshopMetric);
    }
    return `${formatTrieuAsTy(value)} Tỷ`;
  };

  const handleOpenOverallDetail = () => {
    setSelectedFunnelItem(null); // null = xem tổng theo BOP, giữ hành vi cũ
    setIsFunnelPivotModalOpen(true);
  };

  const handleBarClick = (item: CustomFunnelItem) => {
    setSelectedFunnelItem(item);
    onFunnelItemClick?.(item); // báo cha đổi pivotFunnelData sang breakdown theo công trình của bước này
    setIsFunnelPivotModalOpen(true);
  };

  const closeModal = () => {
    setIsFunnelPivotModalOpen(false);
    setSelectedFunnelItem(null);
    onFunnelModalClose?.(); // báo cha reset về dữ liệu tổng
  };

  // Ô số trong bảng pivot: hiển thị số làm tròn, rê chuột vào sẽ thấy số chi tiết.
  // Nếu cha có truyền onPivotValueClick thì hiển thị dạng nút bấm được
  // (giống style ở OnLineStageDetailModal / HexDetailModal),
  // ngược lại là text tĩnh (vẫn có tooltip số chi tiết).
  const renderPivotValue = (value: number, name: string | null) => {
    const text = formatFunnelValue(value);   // hiển thị làm tròn
    const detail = formatDetailValue(value); // tooltip chi tiết
    if (!onPivotValueClick) {
      return <span title={detail}>{text}</span>;
    }
    if (value === 0) {
      return <span className="text-slate-300" title={detail}>{text}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => onPivotValueClick(name, selectedFunnelItem)}
        className="text-slate-800 hover:text-emerald-700 hover:underline font-semibold"
        title={`${detail} — bấm để xem chi tiết`}
      >
        {text}
      </button>
    );
  };

  return (
    <>
          <div ref={sectionRef} className="scroll-mt-24 w-full grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Phễu (thẻ dùng chung với trang Tổng quan) */}
        <FunnelCard
          className={sideContent ? 'xl:col-span-8' : 'xl:col-span-12'}
          subtitle="Phân bổ theo công đoạn (BOP)"
          unit={workshopMetric === 'COUNT_HEX' ? 'Hạng mục' : 'Tỷ đồng'}
          items={customFunnelData}
          barLabel={item => formatBarLabel(item.value)}
          barTitle={item => `${item.name}: ${formatDetailValue(item.value)}`}
          onBarClick={handleBarClick}
          onDetail={handleOpenOverallDetail}
        />

        {/* 3 biểu đồ tròn — cùng chiều cao với phễu */}
        {sideContent && <div className="xl:col-span-4 min-w-0 flex flex-col">{sideContent}</div>}
      </div>

      {/* Funnel Pivot Detail Modal */}
      {/* closeOnEsc={false}: bấm 1 con số trong bảng sẽ mở "Chi tiết theo Hex" ĐÈ LÊN modal này,
          modal kia tự xử lý Esc — bật Esc ở đây thì 1 lần nhấn sẽ đóng cả 2. */}
      <ModalShell
        open={isFunnelPivotModalOpen}
        onClose={closeModal}
        closeOnEsc={false}
        labelledBy="construction-funnel-detail-title"
        overlayClassName="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
        panelClassName="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col focus:outline-none"
      >
            <div className="flex justify-between items-start gap-4 p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="min-w-0">
                <h2 id="construction-funnel-detail-title" className="text-lg font-bold text-slate-800 truncate">
                  Chi tiết dữ liệu Phễu{selectedFunnelItem ? ` — ${selectedFunnelItem.name}` : ''}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedFunnelItem ? 'Phân tích giá trị theo Công trình' : 'Phân tích giá trị theo BOP'}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {workshopMetric !== 'COUNT_HEX' && (
                  <span className="text-[0.6875rem] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    Đơn vị: Tỷ đồng
                  </span>
                )}
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Đóng"
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto">
              {pivotFunnelData && pivotFunnelData.data && pivotFunnelData.data.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 border-b border-slate-200 text-left font-bold text-slate-700 w-1/2">
                          {selectedFunnelItem ? 'Công trình' : 'BOP'}
                        </th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right font-bold text-slate-700 w-1/2">
                          {workshopMetric === 'COUNT_HEX' ? 'Số hạng mục' : 'Giá trị (tỷ)'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {pivotFunnelData.data.map((item, index) => (
                        <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-left font-medium text-slate-700 flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                              {index + 1}
                            </span>
                            <span className="break-words">{item.name}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {renderPivotValue(item.value, item.name)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                      <tr>
                        <td className="px-4 py-3 text-left uppercase text-slate-700">Tổng Cộng</td>
                        <td className="px-4 py-3 text-right text-slate-800 text-base">
                          {renderPivotValue(pivotFunnelData.total, null)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                  {selectedFunnelItem
                    ? `Không có dữ liệu chi tiết theo công trình cho ${selectedFunnelItem.name}.`
                    : 'Không có dữ liệu để hiển thị.'}
                </div>
              )}
            </div>
      </ModalShell>
    </>
  );
};