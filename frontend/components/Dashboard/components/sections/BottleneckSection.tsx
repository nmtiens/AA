import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import { AlertTriangle, Download, Clock, CheckCircle } from 'lucide-react';
import type { BottleneckItem } from '../../types';

export interface TopBottleneckItem {
  name: string;
  count: number;
}

interface BottleneckSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  bottleneckData: BottleneckItem[];
  topBottlenecks: TopBottleneckItem[];
  bottleneckViewMode: 'BOP' | 'TÌNH TRẠNG';
  setBottleneckViewMode: (mode: 'BOP' | 'TÌNH TRẠNG') => void;
  handleExportBottlenecks: () => void;
}

export const BottleneckSection: React.FC<BottleneckSectionProps> = ({
  sectionRef,
  bottleneckData,
  topBottlenecks,
  bottleneckViewMode,
  setBottleneckViewMode,
  handleExportBottlenecks,
}) => {
  if (bottleneckData.length === 0) return null;

  return (
    <div
      ref={sectionRef}
      className="scroll-mt-24 w-full bg-white p-6 rounded-xl shadow-sm border border-red-100 flex flex-col gap-6"
    >
      {/* Header */}
      <div className="flex flex-row justify-between items-start border-b border-red-50 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-red-50 p-2 rounded-lg text-red-600">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">BÁO CÁO TỶ TRỌNG ĐIỂM NGHẼN</h3>
            <p className="text-xs text-slate-500">
              Phân tích thời gian tồn tại của các hạng mục (HEX) tại từng công đoạn
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 shadow-inner">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 hidden sm:inline-block">
              CHẾ ĐỘ XEM:
            </span>
            <button
              onClick={() => setBottleneckViewMode('BOP')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-200 ${
                bottleneckViewMode === 'BOP'
                  ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              BOP
            </button>
            <button
              onClick={() => setBottleneckViewMode('TÌNH TRẠNG')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-200 ${
                bottleneckViewMode === 'TÌNH TRẠNG'
                  ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              TÌNH TRẠNG
            </button>
          </div>
          <button
            onClick={handleExportBottlenecks}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg border border-red-100"
            title="Xuất báo cáo điểm nghẽn"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stacked bar chart */}
        <div className="lg:col-span-2 h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bottleneckData}
              stackOffset="expand"
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval={0}
              />
              <YAxis
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                tick={{ fontSize: 10, fill: '#64748b' }}
              />
              <RechartsTooltip
                formatter={(value: number, name: string) => [value, name]}
                labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
              />
              <Legend
                verticalAlign="top"
                height={36}
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', fontWeight: 500 }}
              />

              <Bar dataKey="Từ 4 tuần trở lên" stackId="a" fill="#ef4444" barSize={30}>
                <LabelList
                  dataKey="Từ 4 tuần trở lên"
                  position="center"
                  fill="#ffffff"
                  fontSize={10}
                  fontWeight="bold"
                  formatter={(v: any) => (v > 0 ? v : '')}
                />
              </Bar>
              <Bar dataKey="3 tuần" stackId="a" fill="#f97316" barSize={30}>
                <LabelList
                  dataKey="3 tuần"
                  position="center"
                  fill="#ffffff"
                  fontSize={10}
                  fontWeight="bold"
                  formatter={(v: any) => (v > 0 ? v : '')}
                />
              </Bar>
              <Bar dataKey="2 tuần" stackId="a" fill="#eab308" barSize={30}>
                <LabelList
                  dataKey="2 tuần"
                  position="center"
                  fill="#ffffff"
                  fontSize={10}
                  fontWeight="bold"
                  formatter={(v: any) => (v > 0 ? v : '')}
                />
              </Bar>
              <Bar dataKey="4-7 NGÀY" stackId="a" fill="#3b82f6" barSize={30}>
                <LabelList
                  dataKey="4-7 NGÀY"
                  position="center"
                  fill="#ffffff"
                  fontSize={10}
                  fontWeight="bold"
                  formatter={(v: any) => (v > 0 ? v : '')}
                />
              </Bar>
              <Bar dataKey="<3 NGÀY" stackId="a" fill="#22c55e" barSize={30}>
                <LabelList
                  dataKey="<3 NGÀY"
                  position="center"
                  fill="#ffffff"
                  fontSize={10}
                  fontWeight="bold"
                  formatter={(v: any) => (v > 0 ? v : '')}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top 5 bottleneck list */}
        <div className="bg-red-50/50 rounded-xl p-5 border border-red-100 flex flex-col">
          <div className="flex items-center gap-2 mb-4 text-red-700">
            <Clock className="w-5 h-5" />
            <h4 className="font-bold uppercase text-sm">Top Điểm Nghẽn (Trên 4 Tuần)</h4>
          </div>

          {topBottlenecks.length > 0 ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {topBottlenecks.map((item, index) => (
                <div
                  key={index}
                  className="bg-white p-3 rounded-lg border border-red-200 shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 font-bold text-xs">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-700">{item.name}</p>
                      <p className="text-[10px] text-red-500 font-medium">Tồn đọng lâu</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-red-600 block leading-none">{item.count}</span>
                    <span className="text-[9px] text-slate-400 uppercase">items</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center p-4">
              <CheckCircle className="w-10 h-10 text-green-400 mb-2 opacity-50" />
              <p className="text-xs">Không có công đoạn nào tồn đọng trên 4 tuần.</p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-red-200">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Tổng cảnh báo:</span>
              <span className="font-bold text-red-700">
                {topBottlenecks.reduce((a, b) => a + b.count, 0)} items
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};