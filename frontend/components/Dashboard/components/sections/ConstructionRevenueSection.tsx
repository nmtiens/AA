import React, { useState } from 'react';
import { FunnelCard } from '../shared/FunnelCard';
import { X } from 'lucide-react';
import { formatNumber } from '../../utils/numberParsers';
import { formatTrieuAsTy } from '../../../../utils/money';
import type { MetricType } from '../../types';
import { ModalShell } from '../../../shared/ModalShell';
import * as bang from '../../../shared/bangBaoCao';

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
    return `${formatTrieuAsTy(value)} tỷ`;
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
    if (value === 0) return '';
    if (!onPivotValueClick) {
      return <span title={detail}>{text}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => onPivotValueClick(name, selectedFunnelItem)}
        className={`${bang.soBam} hover:text-emerald-700`}
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
      <ModalShell
        open={isFunnelPivotModalOpen}
        onClose={closeModal}
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
            <div className="flex min-h-0 flex-col p-4 sm:p-6">
              {pivotFunnelData && pivotFunnelData.data && pivotFunnelData.data.length > 0 ? (
                <div className={`${bang.khung} min-h-0`}>
                  <table className={bang.table}>
                    <thead className={bang.thead}>
                      <tr>
                        <th className={`${bang.thC} w-12`}>TT</th>
                        <th className={`${bang.thB} w-1/2 text-left`}>
                          {selectedFunnelItem ? 'Công trình' : 'BOP'}
                        </th>
                        <th className={bang.thC}>
                          {workshopMetric === 'COUNT_HEX' ? 'Số hạng mục' : 'Giá trị (tỷ)'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {pivotFunnelData.data.map((item, index) => (
                        <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                          <td className={bang.tdSo}>{index + 1}</td>
                          <td className={`${bang.tdB} break-words`}>{item.name}</td>
                          <td className={bang.tdSo}>
                            {renderPivotValue(item.value, item.name)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className={bang.tfoot}>
                      <tr>
                        <td colSpan={2} className={bang.tdB}>TỔNG</td>
                        <td className={bang.tdSo}>
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