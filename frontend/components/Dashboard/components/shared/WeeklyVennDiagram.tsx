import { formatDecimal } from '../../utils/numberParsers.ts';
export const WeeklyVennDiagram = ({
  totalPlan,
  totalActual,
  intersection,
  leftOnly,
  rightOnly
}: {
  totalPlan: number;
  totalActual: number;
  intersection: number;
  leftOnly: number;
  rightOnly: number;
}) => {
  // Config dimensions
  const width = 600;
  const height = 350;
  const cx1 = 220; // Center of Plan circle
  const cx2 = 380; // Center of Actual circle
  const cy = 180;
  const r = 130;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border border-slate-200 shadow-sm h-full w-full">
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-slate-800">Mô phỏng Venn Diagram</h3>
        <p className="text-sm font-medium text-slate-600">
          (Tổng KH: {formatDecimal(totalPlan)} - Tổng TH: {formatDecimal(totalActual)})
        </p>
      </div>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="max-w-full h-auto">
        {/* Plan Circle (Red/Pink) - Left */}
        <circle cx={cx1} cy={cy} r={r} fill="#fca5a5" fillOpacity="0.5" stroke="#ef4444" strokeWidth="2" />

        {/* Actual Circle (Blue/Cyan) - Right */}
        <circle cx={cx2} cy={cy} r={r} fill="#bae6fd" fillOpacity="0.5" stroke="#0ea5e9" strokeWidth="2" />

        {/* Labels */}
        {/* Left Only: Rớt Kế Hoạch */}
        <text x={cx1 - 60} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold fill-red-900 pointer-events-none">
          <tspan x={cx1 - 60} dy="-0.6em" fontSize="16" fontWeight="bold">Rớt Kế Hoạch</tspan>
          <tspan x={cx1 - 60} dy="1.4em" fontSize="18" fontWeight="bold">{formatDecimal(leftOnly)}</tspan>
        </text>

        {/* Intersection: Đúng Kế Hoạch */}
        <text x={(cx1 + cx2) / 2} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold fill-white pointer-events-none drop-shadow-md">
          <tspan x={(cx1 + cx2) / 2} dy="-0.6em" fontSize="16" fontWeight="bold">Đúng Kế Hoạch</tspan>
          <tspan x={(cx1 + cx2) / 2} dy="1.4em" fontSize="18" fontWeight="bold">{formatDecimal(intersection)}</tspan>
        </text>

        {/* Right Only: Ngoài/Vượt */}
        <text x={cx2 + 60} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold fill-blue-900 pointer-events-none">
          <tspan x={cx2 + 60} dy="-0.6em" fontSize="16" fontWeight="bold">Ngoài/Vượt</tspan>
          <tspan x={cx2 + 60} dy="1.4em" fontSize="18" fontWeight="bold">{formatDecimal(rightOnly)}</tspan>
        </text>
      </svg>

      <div className="flex gap-8 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-4 bg-red-300/50 border border-red-500 rounded"></div>
          <span className="text-sm font-medium text-slate-700">Kế hoạch</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-4 bg-sky-200/50 border border-sky-500 rounded"></div>
          <span className="text-sm font-medium text-slate-700">Thực hiện</span>
        </div>
      </div>
    </div>
  );
};