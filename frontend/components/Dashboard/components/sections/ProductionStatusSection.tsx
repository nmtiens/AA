import React from 'react';

import {
  Activity, Download, Layers, CheckCircle, XCircle as CloseIcon,
  Table as TableIcon, PlusSquare, MinusSquare,
} from 'lucide-react';
import { CompactStatCard } from '../shared/CompactStatCard';
import { MetricSwitcher } from '../shared/MetricSwitcher';
import { formatNumber } from '../../utils/numberParsers';
import { formatTrieuAsTy } from '../../../../utils/money';
import { khung, soO, table, tdB, tfoot, thB, thead, trong0 } from '../../../shared/bangBaoCao';
import type { MetricType, WorkshopPivotData } from '../../types';

export interface CardMetrics {
  coTheSX: number;
  vecniFitting: number;
  chuyenKhac: number;
  coPhieuChuaSX: number;
  chuaTheSX: number;
  vuongSL: number;
  chuaTrienKhai: number;
  chuaXepNhom?: number;
}

interface ProductionStatusSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  pivotWorkshopRef: React.Ref<HTMLDivElement>;
  cardMetrics: CardMetrics;
  pivotWorkshopData: WorkshopPivotData | null;
  workshopMetric: MetricType;
  setWorkshopMetric: React.Dispatch<React.SetStateAction<MetricType>>;
  expandedBops: Set<string>;
  setExpandedBops: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleExportProductionStatus: () => void;
}

export const ProductionStatusSection: React.FC<ProductionStatusSectionProps> = ({
  sectionRef,
  pivotWorkshopRef,
  cardMetrics,
  pivotWorkshopData,
  workshopMetric,
  setWorkshopMetric,
  expandedBops,
  setExpandedBops,
  handleExportProductionStatus,
}) => {
  const soXuong = (v: number) => trong0(v, x => formatNumber(x, workshopMetric));
  return (
    <div
      ref={sectionRef}
      id="production-status-section"
      className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-8"
    >
  

      <div className="flex flex-row justify-between items-start border-b border-slate-100 pb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Activity className="w-5 h-5 text-wood-600" /> TÌNH TRẠNG SẢN XUẤT
        </h3>
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
          <Layers className="w-4 h-4 text-wood-500" /> Khả năng sản xuất
          <span className="normal-case font-semibold text-slate-600">(theo tình trạng, tỷ)</span>
        </h4>
        {(cardMetrics.chuaXepNhom ?? 0) >= 5 && (
          <p className="mb-2 text-sm font-medium text-red-600">Chưa xếp nhóm {formatTrieuAsTy(cardMetrics.chuaXepNhom ?? 0)} tỷ</p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-green-50/50 rounded-xl p-2 border border-green-100 flex flex-col gap-2">
            <CompactStatCard
              title="CÓ THỂ SẢN XUẤT"
              value={formatTrieuAsTy(cardMetrics.coTheSX)}
              icon={<CheckCircle className="w-5 h-5 text-green-600" />}
              bg="bg-green-50"
              borderColor="border-green-400"
              textColor="text-green-800"
              isParent={true}
            />
            <div className="grid grid-cols-3 gap-2">
              <CompactStatCard
                title="ĐÓNG GÓI / KĐB"
                value={formatTrieuAsTy(cardMetrics.vecniFitting)}
                icon={<div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                bg="bg-white"
                borderColor="border-blue-200"
                textColor="text-slate-700"
              />
              <CompactStatCard
                title="ĐANG Ở TỔ SX"
                value={formatTrieuAsTy(cardMetrics.chuyenKhac)}
                icon={<div className="w-2 h-2 rounded-full bg-indigo-500"></div>}
                bg="bg-white"
                borderColor="border-indigo-200"
                textColor="text-slate-700"
              />
              <CompactStatCard
                title="11. CHƯA SX"
                value={formatTrieuAsTy(cardMetrics.coPhieuChuaSX)}
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
              value={formatTrieuAsTy(cardMetrics.chuaTheSX)}
              icon={<CloseIcon className="w-5 h-5 text-red-600" />}
              bg="bg-red-50"
              borderColor="border-red-400"
              textColor="text-red-800"
              isParent={true}
            />
            <div className="grid grid-cols-2 gap-2">
              <CompactStatCard
                title="VƯỚNG SL CHƯA REV"
                value={formatTrieuAsTy(cardMetrics.vuongSL)}
                icon={<div className="w-2 h-2 rounded-full bg-orange-500"></div>}
                bg="bg-white"
                borderColor="border-orange-200"
                textColor="text-slate-700"
              />
              <CompactStatCard
                title="14-15. CHƯA PHIẾU, TK"
                value={formatTrieuAsTy(cardMetrics.chuaTrienKhai)}
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
            <TableIcon className="w-4 h-4 text-wood-500" /> Tình trạng × Xưởng
            {workshopMetric !== 'COUNT_HEX' && <span className="normal-case font-semibold text-slate-600">(tỷ)</span>}
          </h4>
          <MetricSwitcher current={workshopMetric} onChange={setWorkshopMetric} />
        </div>
        {pivotWorkshopData ? (
          <div className={`${khung} max-h-[70vh]`}>
            <table className={`${table} min-w-[900px]`}>
              <thead className={thead}>
                <tr>
                  <th className={`${thB} min-w-[150px] text-center`}>
                    <div className="flex items-center justify-between">
                      <span>BOP</span>
                      <div className="ml-2 flex gap-1">
                        <button
                          onClick={() => setExpandedBops(new Set(pivotWorkshopData.uniqueBops))}
                          className="rounded p-1 text-slate-700 hover:bg-emerald-400"
                          title="Mở rộng tất cả"
                        >
                          <PlusSquare size={14} />
                        </button>
                        <button
                          onClick={() => setExpandedBops(new Set())}
                          className="rounded p-1 text-slate-700 hover:bg-emerald-400"
                          title="Thu gọn tất cả"
                        >
                          <MinusSquare size={14} />
                        </button>
                      </div>
                    </div>
                  </th>
                  <th className={`${thB} sticky left-0 z-[3] min-w-[180px] bg-emerald-300 text-center`}>Tình trạng</th>
                  {pivotWorkshopData.uniqueWorkshops.map((w: string) => (
                    <th key={w} className={`${thB} whitespace-nowrap text-center`}>{w}</th>
                  ))}
                  <th className={`${thB} text-center`}>Tổng</th>
                </tr>
              </thead>
              <tbody>
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
                      <tr className="cursor-pointer bg-white hover:bg-amber-50" onClick={toggleExpand}>
                        <td className={`${tdB} whitespace-nowrap font-bold`}>
                          <div className="flex items-center gap-2">
                            <button className="text-slate-400 hover:text-slate-800">
                              {isExpanded ? <MinusSquare size={14} /> : <PlusSquare size={14} />}
                            </button>
                            {bop || '-'}
                          </div>
                        </td>
                        <td className={`${tdB} sticky left-0 z-[1] whitespace-nowrap bg-white font-bold`}>
                          Tổng ({bopRows.length})
                        </td>
                        {pivotWorkshopData.uniqueWorkshops.map((w: string) => (
                          <td key={w} className={`${tdB} ${soO} font-semibold`}>
                            {soXuong(pivotWorkshopData.bopTotals[bop]?.[w] || 0)}
                          </td>
                        ))}
                        <td className={`${tdB} ${soO} font-bold`}>{soXuong(pivotWorkshopData.bopRowTotals[bop])}</td>
                      </tr>

                      {isExpanded &&
                        bopRows.map((rowItem) => (
                          <tr key={rowItem.key} className="bg-slate-50">
                            <td className={tdB}></td>
                            <td className={`${tdB} sticky left-0 z-[1] whitespace-nowrap bg-slate-50 pl-6`}>
                              {rowItem.status}
                            </td>
                            {pivotWorkshopData.uniqueWorkshops.map((w: string) => {
                              const matrix = pivotWorkshopData?.matrix || {};
                              return (
                                <td key={w} className={`${tdB} ${soO}`}>{soXuong(matrix?.[rowItem.key]?.[w] || 0)}</td>
                              );
                            })}
                            <td className={`${tdB} ${soO} font-bold`}>{soXuong(pivotWorkshopData.rowTotals[rowItem.key])}</td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className={tfoot}>
                <tr>
                  <td colSpan={2} className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
                  {pivotWorkshopData.uniqueWorkshops.map((w: string) => (
                    <td key={w} className={`${tdB} ${soO}`}>{soXuong(pivotWorkshopData.colTotals[w])}</td>
                  ))}
                  <td className={`${tdB} ${soO}`}>{soXuong(pivotWorkshopData.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">
            Không có dữ liệu
          </div>
        )}
      </div>
    </div>
  );
};