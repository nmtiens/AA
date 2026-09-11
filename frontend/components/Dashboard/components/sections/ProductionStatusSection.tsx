import React, { useState } from 'react';
import {
  Eye, Activity, Download, Layers, CheckCircle, XCircle as CloseIcon,
  Table as TableIcon, PlusSquare, MinusSquare, X,
} from 'lucide-react';
import { CompactStatCard } from '../shared/CompactStatCard';
import { MetricSwitcher } from '../shared/MetricSwitcher';
import { formatNumber } from '../../utils/numberParsers';
import type { MetricType, WorkshopPivotData } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomFunnelItem {
  id: string;
  name: string;
  value: number;
  color: string;
  percentage: number;
}

export interface CardMetrics {
  coTheSX: number;
  vecniFitting: number;
  chuyenKhac: number;
  coPhieuChuaSX: number;
  chuaTheSX: number;
  vuongSL: number;
  chuaTrienKhai: number;
}

export interface PivotFunnelData {
  data: { name: string; value: number }[];
  total: number;
}

interface ProductionStatusSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  pivotWorkshopRef: React.Ref<HTMLDivElement>;
  customFunnelData: CustomFunnelItem[];
  cardMetrics: CardMetrics;
  pivotWorkshopData: WorkshopPivotData | null;
  pivotFunnelData: PivotFunnelData | null;
  workshopMetric: MetricType;
  setWorkshopMetric: React.Dispatch<React.SetStateAction<MetricType>>;
  expandedBops: Set<string>;
  setExpandedBops: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleExportProductionStatus: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ProductionStatusSection: React.FC<ProductionStatusSectionProps> = ({
  sectionRef,
  pivotWorkshopRef,
  customFunnelData,
  cardMetrics,
  pivotWorkshopData,
  pivotFunnelData,
  workshopMetric,
  setWorkshopMetric,
  expandedBops,
  setExpandedBops,
  handleExportProductionStatus,
}) => {
  const [isFunnelPivotModalOpen, setIsFunnelPivotModalOpen] = useState(false);

  return (
    <>
      <div
        ref={sectionRef}
        id="production-status-section"
        className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-8"
      >
        {/* Funnel Chart - TÌNH TRẠNG ĐƠN HÀNG AATN */}
        <div className="mb-0">
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setIsFunnelPivotModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 font-medium text-xs border border-slate-200 transition-colors"
              title="Xem bảng chi tiết"
            >
              <Eye size={14} /> Chi tiết
            </button>
          </div>

          <div className="w-full flex flex-col bg-slate-50/50 p-6 rounded-xl border border-slate-200 relative">
            <h3 className="font-serif text-2xl md:text-3xl font-bold uppercase text-center mb-8 text-slate-800 tracking-wide">
              TÌNH TRẠNG ĐƠN HÀNG AATN
            </h3>

            <div className="flex flex-row gap-[30px] w-full max-w-5xl mx-auto relative mt-2">
              <div className="w-auto shrink-0 flex flex-col gap-3">
                {customFunnelData.map((item) => (
                  <div
                    key={`lbl-${item.id}`}
                    className="h-10 text-right font-semibold text-slate-700 text-sm flex items-center justify-end whitespace-nowrap"
                  >
                    {item.name}
                  </div>
                ))}
              </div>

              <div className="flex-1 relative flex flex-col gap-3 min-w-0">
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-30">
                  <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" className="overflow-visible">
                    <polygon
                      points="-2,0 102,0 50,100"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2px"
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>

                {customFunnelData.map((item) => {
  const displayValue = Math.round(item.value / 1000);
  const widthPercent = displayValue === 0 ? 6 : item.percentage;

  return (
    <div key={`bar-${item.id}`} className="h-10 flex justify-center w-full relative z-20">
      <div
        className="h-full flex items-center justify-center rounded-sm transition-all duration-500 shadow-sm"
        style={{ width: `${widthPercent}%`, backgroundColor: item.color }}
        title={`${item.name}: ${formatNumber(item.value, workshopMetric)}`}
      >
        <span className="text-black font-bold text-sm truncate px-1">
          {displayValue.toLocaleString('en-US')}
        </span>
      </div>
    </div>
  );
})}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-row justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
              <Activity className="w-5 h-5 text-wood-600" /> TÌNH TRẠNG SẢN XUẤT
            </h3>
            <p className="text-xs text-slate-500">Tổng hợp năng lực sản xuất hiện tại và phân bổ chi tiết theo xưởng</p>
          </div>
          <button
            onClick={handleExportProductionStatus}
            className="p-1.5 text-slate-500 hover:text-wood-600 hover:bg-wood-50 rounded-lg transition-colors border border-slate-200"
            title="Xuất dữ liệu sản xuất"
          >
            <Download size={16} />
          </button>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
            <Layers className="w-4 h-4 text-wood-500" /> 1. Phân tích Khả năng & Thành tiền
          </h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-green-50/50 rounded-xl p-2 border border-green-100 flex flex-col gap-2">
              <CompactStatCard
                title="CÓ THỂ SẢN XUẤT"
                value={formatNumber(cardMetrics.coTheSX)}
                icon={<CheckCircle className="w-5 h-5 text-green-600" />}
                bg="bg-green-50"
                borderColor="border-green-400"
                textColor="text-green-800"
                isParent={true}
              />
              <div className="grid grid-cols-3 gap-2">
                <CompactStatCard
                  title="VECNI + FITTING"
                  value={formatNumber(cardMetrics.vecniFitting)}
                  icon={<div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                  bg="bg-white"
                  borderColor="border-blue-200"
                  textColor="text-slate-700"
                />
                <CompactStatCard
                  title="ĐANG TRÊN CHUYỀN"
                  value={formatNumber(cardMetrics.chuyenKhac)}
                  icon={<div className="w-2 h-2 rounded-full bg-indigo-500"></div>}
                  bg="bg-white"
                  borderColor="border-indigo-200"
                  textColor="text-slate-700"
                />
                <CompactStatCard
                  title="CÓ PHIẾU CHƯA SX"
                  value={formatNumber(cardMetrics.coPhieuChuaSX)}
                  icon={<div className="w-2 h-2 rounded-full bg-amber-500"></div>}
                  bg="bg-white"
                  borderColor="border-amber-200"
                  textColor="text-slate-700"
                />
              </div>
            </div>
            <div className="bg-red-50/50 rounded-xl p-2 border border-red-100 flex flex-col gap-2">
              <CompactStatCard
                title="CHƯA THỂ SẢN XUẤT"
                value={formatNumber(cardMetrics.chuaTheSX)}
                icon={<CloseIcon className="w-5 h-5 text-red-600" />}
                bg="bg-red-50"
                borderColor="border-red-400"
                textColor="text-red-800"
                isParent={true}
              />
              <div className="grid grid-cols-2 gap-2">
                <CompactStatCard
                  title="VƯỚNG SL CHƯA REV"
                  value={formatNumber(cardMetrics.vuongSL)}
                  icon={<div className="w-2 h-2 rounded-full bg-orange-500"></div>}
                  bg="bg-white"
                  borderColor="border-orange-200"
                  textColor="text-slate-700"
                />
                <CompactStatCard
                  title="CHƯA TRIỂN KHAI SX"
                  value={formatNumber(cardMetrics.chuaTrienKhai)}
                  icon={<div className="w-2 h-2 rounded-full bg-slate-400"></div>}
                  bg="bg-white"
                  borderColor="border-slate-300"
                  textColor="text-slate-700"
                />
              </div>
            </div>
          </div>
        </div>

        <div ref={pivotWorkshopRef}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
              <TableIcon className="w-4 h-4 text-wood-500" /> 2. Chi tiết Giá trị (Tình Trạng x Khu vực sản xuất)
            </h4>
            <MetricSwitcher current={workshopMetric} onChange={setWorkshopMetric} />
          </div>
          {pivotWorkshopData ? (
            <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-right min-w-[900px]">
                <thead className="bg-wood-50 text-slate-700 font-semibold uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left bg-wood-50 border-b border-wood-200 min-w-[150px]">
                      <div className="flex items-center justify-between">
                        <span>BOP</span>
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={() => setExpandedBops(new Set(pivotWorkshopData.uniqueBops))}
                            className="p-1 hover:bg-wood-200 rounded text-wood-600"
                            title="Mở rộng tất cả"
                          >
                            <PlusSquare size={14} />
                          </button>
                          <button
                            onClick={() => setExpandedBops(new Set())}
                            className="p-1 hover:bg-wood-200 rounded text-wood-600"
                            title="Thu gọn tất cả"
                          >
                            <MinusSquare size={14} />
                          </button>
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left sticky left-0 bg-wood-50 border-b border-wood-200 z-10 min-w-[180px]">
                      Tình Trạng
                    </th>
                    {pivotWorkshopData.uniqueWorkshops.map((w: string) => (
                      <th key={w} className="px-3 py-2 border-b border-wood-200 whitespace-nowrap text-wood-800">
                        {w}
                      </th>
                    ))}
                    <th className="px-3 py-2 bg-wood-100 border-b border-wood-200 font-bold text-slate-800">
                      Tổng Cộng
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pivotWorkshopData.uniqueBops.map((bop) => {
                    const isExpanded = expandedBops.has(bop);
                    const toggleExpand = () => {
                      const next = new Set(expandedBops);
                      if (isExpanded) next.delete(bop);
                      else next.add(bop);
                      setExpandedBops(next);
                    };

                    const bopRows = pivotWorkshopData.rows.filter((r) => r.bop === bop);

                    return (
                      <React.Fragment key={bop}>
                        <tr
                          className="bg-slate-100/80 hover:bg-slate-200/50 transition-colors cursor-pointer"
                          onClick={toggleExpand}
                        >
                          <td className="px-3 py-2 text-left font-bold text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button className="text-slate-500 hover:text-slate-800">
                                {isExpanded ? <MinusSquare size={14} /> : <PlusSquare size={14} />}
                              </button>
                              {bop || '-'}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-left font-bold text-slate-700 sticky left-0 bg-slate-100/80 z-10 whitespace-nowrap border-r border-slate-200">
                            Tổng ({bopRows.length})
                          </td>
                          {pivotWorkshopData.uniqueWorkshops.map((w: string) => {
                            const val = pivotWorkshopData.bopTotals[bop]?.[w] || 0;
                            return (
                              <td
                                key={w}
                                className={`px-3 py-2 whitespace-nowrap font-semibold ${val === 0 ? 'text-slate-400' : 'text-slate-700'}`}
                              >
                                {val === 0 ? '-' : formatNumber(val, workshopMetric)}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 font-bold text-slate-800 bg-wood-50/80">
                            {formatNumber(pivotWorkshopData.bopRowTotals[bop], workshopMetric)}
                          </td>
                        </tr>

                        {isExpanded &&
                          bopRows.map((rowItem) => (
                            <tr key={rowItem.key} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-2 text-left text-slate-400 border-r border-slate-100 whitespace-nowrap"></td>
                              <td className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-white hover:bg-slate-50 z-10 whitespace-nowrap border-r border-slate-100 pl-6">
                                {rowItem.status}
                              </td>
                              {pivotWorkshopData.uniqueWorkshops.map((w: string) => {
                                const matrix = pivotWorkshopData?.matrix || {};
                                const val = matrix?.[rowItem.key]?.[w] || 0;
                                return (
                                  <td
                                    key={w}
                                    className={`px-3 py-2 whitespace-nowrap ${val === 0 ? 'text-slate-300' : 'text-slate-600'}`}
                                  >
                                    {val === 0 ? '-' : formatNumber(val, workshopMetric)}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 font-bold text-slate-800 bg-wood-50/50">
                                {formatNumber(pivotWorkshopData.rowTotals[rowItem.key], workshopMetric)}
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-left sticky left-0 bg-wood-100 z-10">
                      Tổng Cộng
                    </td>
                    {pivotWorkshopData.uniqueWorkshops.map((w: string) => (
                      <td key={w} className="px-3 py-2 whitespace-nowrap">
                        {formatNumber(pivotWorkshopData.colTotals[w], workshopMetric)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-wood-800 text-sm">
                      {formatNumber(pivotWorkshopData.grandTotal, workshopMetric)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">
              Không đủ dữ liệu hoặc thiếu cấu hình cột để tạo bảng Pivot.
            </div>
          )}
        </div>
      </div>

      {/* Funnel Pivot Detail Modal */}
      {isFunnelPivotModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
          onClick={() => setIsFunnelPivotModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Chi tiết dữ liệu Phễu</h2>
                <p className="text-xs text-slate-500 mt-1">Phân tích giá trị theo BOP</p>
              </div>
              <button
                onClick={() => setIsFunnelPivotModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto">
              {pivotFunnelData && pivotFunnelData.data && pivotFunnelData.data.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 border-b border-slate-200 text-left font-bold text-slate-700 w-1/2">
                          BOP
                        </th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right font-bold text-slate-700 w-1/2">
                          Giá Trị
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
                            <span className="truncate max-w-[200px]" title={item.name}>
                              {item.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {formatNumber(item.value, workshopMetric)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                      <tr>
                        <td className="px-4 py-3 text-left uppercase text-slate-700">Tổng Cộng</td>
                        <td className="px-4 py-3 text-right text-slate-800 text-base">
                          {formatNumber(pivotFunnelData.total, workshopMetric)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                  Không có dữ liệu để hiển thị.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};