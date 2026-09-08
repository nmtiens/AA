import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Activity } from 'lucide-react';
import { MetricSwitcher } from '../shared/MetricSwitcher';
import { MetricType } from '../../types';
import { formatNumber } from '../../utils/numberParsers';

interface StatusLineChartSectionProps {
  lineChartData: { name: string; value: number }[];
  chartMetric: MetricType;
  setChartMetric: (m: MetricType) => void;
}

export const StatusLineChartSection = ({
  lineChartData,
  chartMetric,
  setChartMetric,
}: StatusLineChartSectionProps) => (
  <div className="w-full bg-white p-6 rounded-xl shadow-sm border border-wood-100 flex flex-col">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
      <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
        <Activity className="w-4 h-4 text-purple-600" />Biểu đồ Phân tích Tình trạng (Sản xuất)
      </h3>
      <MetricSwitcher current={chartMetric} onChange={setChartMetric} />
    </div>
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={lineChartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
          <YAxis
            tickFormatter={(val) => {
              if (val >= 1000000000) return (val / 1000000000).toFixed(1) + 'B';
              if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
              if (val >= 1000) return (val / 1000).toFixed(0) + 'K';
              return val;
            }}
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={60}
          />
          <RechartsTooltip
            formatter={(value: number) => [formatNumber(value, chartMetric), 'Giá trị']}
            labelStyle={{ color: '#334155', fontWeight: 600 }}
            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
          />
          <Legend verticalAlign="top" height={36} />
          <Line type="monotone" dataKey="value" name="Giá trị theo Tình trạng" stroke="#ba6a42" strokeWidth={2} activeDot={{ r: 6, strokeWidth: 0 }} dot={{ r: 3, fill: '#ba6a42', strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);