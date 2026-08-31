
import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ComposedChart, Line, ScatterChart, Scatter, ZAxis, ReferenceLine, LabelList, Cell, Label
} from 'recharts';
import { Activity, BarChart2, PieChart, TrendingUp } from 'lucide-react';
import { getWeekRange2026 } from '../utils/dateUtils';

interface ProductivityData {
    name: string;
    avgWorkers: number;
    totalHc: number;
    totalTc: number;
    totalHours: number;
    sales: number;
    salesPerHour: number;
    salesPerWorker: number;
    overtimeRate: number;
    hoursPerWorker: number;
}

interface ProductivityChartsProps {
    data: ProductivityData[];
    viewMode?: 'WEEK' | 'MONTH';
    filters?: {
        nam: string[];
        thang: string[];
        ngay: string[];
        tuan: string[];
    };
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
};

const formatNumber = (value: number) => {
    return new Intl.NumberFormat('vi-VN').format(value);
};

const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
};

const formatDecimal = (value: number) => {
    return !Number.isFinite(value) ? '0' : value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

// Custom Tooltip for better readability
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        // Sort: Doanh số first
        const sortedPayload = [...payload].sort((a: any, b: any) => {
            if (a.name === 'Doanh số') return -1;
            if (b.name === 'Doanh số') return 1;
            return 0;
        });

        return (
            <div className="bg-white p-3 border border-slate-200 shadow-md rounded-md text-sm">
                <p className="font-bold text-slate-700 mb-2">{label}</p>
                {sortedPayload.map((entry: any, index: number) => {
                    let valueDisplay = formatNumber(entry.value);

                    if (entry.name === 'Doanh số') {
                        valueDisplay = `${formatDecimal(entry.value)} Triệu`;
                    } else if (entry.name === 'Giờ Hành chính') {
                        valueDisplay = `${formatNumber(Math.round(entry.value))} Giờ`;
                    } else if (entry.name === 'Giờ Tăng ca') {
                        valueDisplay = `${formatNumber(Math.round(entry.value))} Giờ`;
                    } else if (entry.name === 'Tỉ lệ Tăng ca') {
                        valueDisplay = `${entry.value.toFixed(1)}%`;
                    }

                    return (
                        <div key={index} className="flex items-center gap-2 mb-1" style={{ color: entry.color }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                            <span>{entry.name}: </span>
                            <span className="font-medium">
                                {valueDisplay}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    }
    return null;
};

const Chart1Tooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
                <p className="text-xs font-bold text-slate-700 mb-2">{label}</p>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-purple-600 font-medium">Doanh số:</span>
                    <span className="text-sm font-bold text-purple-700">
                        {formatDecimal(data.sales / 1000)}
                    </span>
                </div>
            </div>
        );
    }
    return null;
};

const Chart2Tooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
                <p className="text-xs font-bold text-slate-700 mb-2">{label}</p>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-blue-600 font-medium">BQ DS/CN:</span>
                    <span className="text-sm font-bold text-blue-700">
                        {formatDecimal(data.salesPerWorker)}
                    </span>
                </div>
            </div>
        );
    }
    return null;
};

// Custom Label for Sales Line (White background for readability)
const CustomLineLabel = (props: any) => {
    const { x, y, value } = props;
    const text = formatDecimal(value);

    // Adjust y to position label above the point
    // Recharts passes x, y as the coordinate of the point.
    const labelY = y - 10;

    return (
        <g>
            <rect
                x={x - 18}
                y={labelY - 12}
                width={36}
                height={16}
                fill="white"
                fillOpacity={0.7}
                rx={4}
            />
            <text
                x={x}
                y={labelY}
                fill="#3b82f6"
                fontSize={10}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="middle"
            >
                {text}
            </text>
        </g>
    );
};

const ProductivityCharts: React.FC<ProductivityChartsProps> = ({ data, viewMode = 'MONTH', filters }) => {
    if (!data || data.length === 0) return null;

    // Color Palettes
    const COOL_PALETTE = ['#4338ca', '#3b82f6', '#0ea5e9', '#10b981', '#84cc16', '#eab308']; // Purple -> Green -> Yellow
    const WARM_PALETTE = ['#581c87', '#7e22ce', '#be185d', '#ef4444', '#f97316', '#eab308']; // Dark Purple -> Red -> Orange

    // Calculate Average for Chart 2 Reference Line
    const overallAvgSalesPerWorker = useMemo(() => {
        const totalSales = data.reduce((sum, item) => sum + item.sales, 0);
        const totalWorkers = data.reduce((sum, item) => sum + item.avgWorkers, 0);
        return totalWorkers > 0 ? totalSales / totalWorkers : 0;
    }, [data]);

    // Color Scale Logic for Chart 4
    const maxSalesPerHour = Math.max(...data.map(d => d.salesPerHour));
    const minSalesPerHour = Math.min(...data.map(d => d.salesPerHour));

    const getColorForSalesPerHour = (value: number, min: number, max: number) => {
        // Simple linear interpolation between Blue (#3b82f6) and Red (#ef4444)
        if (max === min) return '#3b82f6';
        const ratio = (value - min) / (max - min);
        // RGB interpolation
        const r = Math.round(59 + ratio * (239 - 59));
        const g = Math.round(130 + ratio * (68 - 130));
        const b = Math.round(246 + ratio * (68 - 246));
        return `rgb(${r}, ${g}, ${b})`;
    };

    const getDynamicDescription = () => {
        if (!filters) return '';

        const { nam, thang, ngay, tuan } = filters;
        const currentYear = nam[0] || new Date().getFullYear().toString();

        if (viewMode === 'MONTH') {
            const currentMonth = thang[0] || (new Date().getMonth() + 1).toString();
            return `Thống kê Tháng ${currentMonth.padStart(2, '0')}/${currentYear}`;
        }

        if (viewMode === 'WEEK') {
            const currentWeek = tuan[0];
            if (!currentWeek) return '';

            const weekNum = parseInt(currentWeek);
            const { start, end } = getWeekRange2026(weekNum);

            const fmtDate = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            const fmtFullDate = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

            if (ngay.length > 0) {
                if (ngay.length === 1) {
                    // Single Day
                    const day = parseInt(ngay[0]);
                    const month = parseInt(thang[0]) || (new Date().getMonth() + 1);
                    return `Thống kê ngày ${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${currentYear} (Tuần ${currentWeek.padStart(2, '0')})`;
                } else {
                    // Multiple Days
                    // Assuming days are sorted or we find min/max
                    const days = ngay.map(d => parseInt(d)).sort((a, b) => a - b);
                    const minDay = days[0];
                    const maxDay = days[days.length - 1];
                    const month = parseInt(thang[0]) || (new Date().getMonth() + 1);
                    return `Thống kê Từ ngày ${minDay.toString().padStart(2, '0')} đến ngày ${maxDay.toString().padStart(2, '0')} /${month.toString().padStart(2, '0')}/${currentYear} (Tuần ${currentWeek.padStart(2, '0')})`;
                }
            }

            // Full Week
            return `Thống kê Từ ngày ${fmtDate(start)} đến ngày ${fmtFullDate(end)} (Tuần ${currentWeek.padStart(2, '0')})`;
        }

        return '';
    };

    return (
        <div className="w-full mt-8 p-6 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 uppercase flex items-center gap-2">
                        <Activity className="w-5 h-5 text-purple-600" />
                        DASHBOARD HIỆU SUẤT VẬN HÀNH
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 italic pl-7">
                        {getDynamicDescription()}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* CHART 1 (Moved): Cấu Trúc Giờ Công, Tỷ Lệ OT & Doanh Số (Composed Chart) */}
                <div className="md:col-span-2 bg-white p-4 rounded-lg border border-slate-200 shadow-sm animate-fade-in">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                        <PieChart className="w-4 h-4 text-orange-500" />
                        CẤU TRÚC GIỜ CÔNG, TỶ LỆ TĂNG CA & DOANH SỐ
                    </h3>
                    <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="name"
                                    textAnchor="end"
                                    interval={0}
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    height={20}
                                />
                                <YAxis
                                    yAxisId="left"
                                    orientation="left"
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    label={{ value: 'Giờ công & Doanh số (Triệu)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b', fontSize: 10 } }}
                                />
                                <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend verticalAlign="top" height={36} />

                                <Bar yAxisId="left" dataKey="totalHc" name="Giờ Hành chính" stackId="a" fill="#22c55e" barSize={40} />
                                <Bar yAxisId="left" dataKey="totalTc" name="Giờ Tăng ca" stackId="a" fill="#F2994A" barSize={40} />

                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="sales"
                                    name="Doanh số"
                                    stroke="#3b82f6"
                                    strokeWidth={3}
                                    dot={{ r: 3, fill: '#3b82f6', stroke: '#3b82f6', strokeWidth: 1 }}
                                >
                                    <LabelList
                                        dataKey="sales"
                                        position="top"
                                        content={<CustomLineLabel />}
                                    />
                                </Line>

                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="overtimeRate"
                                    name="Tỉ lệ Tăng ca"
                                    stroke="#eab308"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: '#eab308', stroke: '#eab308', strokeWidth: 1 }}
                                >
                                    <LabelList
                                        dataKey="overtimeRate"
                                        position="top"
                                        formatter={(val: number) => val.toFixed(0) + '%'}
                                        style={{ fontSize: 10, fill: '#eab308', fontWeight: 'bold' }}
                                    />
                                </Line>
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* CHART 2: Hiệu Quả Nhân Sự (Bar Chart + Ref Line) */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm animate-fade-in" style={{ animationDelay: '0.1s' }}>
                    <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500" />
                        HIỆU QUẢ: BQ DOANH SỐ / 1 CÔNG NHÂN
                    </h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="name"
                                    textAnchor="end"
                                    interval={0}
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    height={20}
                                />
                                <YAxis hide />
                                <Tooltip content={<Chart2Tooltip />} cursor={{ fill: '#f8fafc' }} />
                                <Bar dataKey="salesPerWorker" name="BQ DS/CN" radius={[4, 4, 0, 0]}>
                                    {data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={WARM_PALETTE[index % WARM_PALETTE.length]} />
                                    ))}
                                    <LabelList
                                        dataKey="salesPerWorker"
                                        position="top"
                                        formatter={(val: number) => formatDecimal(val)}
                                        style={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
                                    />
                                </Bar>
                                <ReferenceLine y={overallAvgSalesPerWorker} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={2}>
                                    <Label value={`TB AATN: ${formatDecimal(overallAvgSalesPerWorker)} Triệu`} position="insideTopRight" fill="#ef4444" fontSize={10} fontWeight="bold" dy={-20} dx={-10} />
                                </ReferenceLine>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* CHART 3: Ma Trận Tương Quan (Bubble Chart) */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm animate-fade-in" style={{ animationDelay: '0.2s' }}>
                    <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        MA TRẬN TƯƠNG QUAN: QUY MÔ vs HIỆU QUẢ
                    </h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                    type="number"
                                    dataKey="avgWorkers"
                                    name="Quy mô (CN)"
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    label={{ value: 'Số Lượng Công Nhân', position: 'bottom', offset: 0, fontSize: 10, fill: '#64748b' }}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="sales"
                                    name="Doanh số"
                                    tickFormatter={(val) => (val / 1000).toFixed(1)}
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    label={{ value: 'Doanh Số Nhập Kho (Tỷ)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b', style: { textAnchor: 'middle' } }}
                                />
                                <ZAxis type="number" dataKey="overtimeRate" range={[50, 600]} name="Tỉ lệ Tăng ca" unit="%" />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={
                                    ({ active, payload }: any) => {
                                        if (active && payload && payload.length) {
                                            const d = payload[0].payload;
                                            return (
                                                <div className="bg-white p-3 border border-slate-200 shadow-md rounded-md text-sm">
                                                    <p className="font-bold text-slate-800 mb-1">{d.name}</p>
                                                    <p className="text-slate-600">Quy mô: <span className="font-medium text-slate-800">{formatNumber(d.avgWorkers)} CN</span></p>
                                                    <p className="text-slate-600">Doanh số: <span className="font-medium text-slate-800">{formatDecimal(d.sales / 1000)} Tỷ</span></p>
                                                    <p className="text-slate-600">Tỉ lệ Tăng ca: <span className="font-medium text-orange-600">{formatPercent(d.overtimeRate)}</span></p>
                                                    <p className="text-blue-600 font-medium text-xs mt-1">NS: {formatCurrency(d.salesPerHour)}/giờ</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }
                                } />
                                <Scatter name="Workshops" data={data}>
                                    {data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={getColorForSalesPerHour(entry.salesPerHour, minSalesPerHour, maxSalesPerHour)} stroke="#000000" strokeWidth={0.5} strokeOpacity={0.2} />
                                    ))}
                                    <LabelList dataKey="name" position="top" style={{ fontSize: 9, fill: '#334155', fontWeight: 600 }} />
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 text-center italic">
                        *Bóng to = Tỉ lệ Tăng ca cao &bull; Màu nóng (Cam/Đỏ) = Năng suất giờ cao
                    </p>
                </div>

            </div>
        </div>
    );
};

export default ProductivityCharts;
