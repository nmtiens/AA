import React from 'react';

export const ProjectChartTooltip = ({ active, payload, label }: any) => {
  const formatValue = (value: any) => {
    if (value === null || value === undefined) return '0';
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  };

  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const plan = data.khValue || 0;
    const actual = data.thValue || 0;
    const percent = plan > 0 ? (actual / plan) * 100 : 0;

    return (
      <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
        <p className="text-xs font-bold text-slate-700 mb-2">{data.name}</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-emerald-600 font-medium">Kế hoạch:</span>
            <span className="text-sm font-bold text-emerald-700">{formatValue(plan)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-blue-600 font-medium">Thực hiện:</span>
            <span className="text-sm font-bold text-blue-700">{formatValue(actual)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1 mt-1">
            <span className="text-xs text-slate-500 font-medium">% Đạt:</span>
            <span className={`text-sm font-bold ${percent >= 80 ? 'text-emerald-600' : percent >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
              {percent.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};