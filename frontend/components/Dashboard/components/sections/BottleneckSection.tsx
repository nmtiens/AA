import React, { useState } from 'react';
import { AlertTriangle, Download, Clock, CheckCircle } from 'lucide-react';
import type { BottleneckItem } from '../../types';
import { DWELL_KEYS, DWELL_STUCK } from '../../../../utils/productionMetrics';
import { laChoBanVe } from '../../core/chiTietHex';
import { fmtInt, fmtTy } from '../../../../utils/format';
import { khung, soO, table, tdB, tfoot, thB, thead, trong0 } from '../../../shared/bangBaoCao';

export interface TopBottleneckItem {
  name: string;
  count: number;
  gt?: number;
}

interface BottleneckSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  bottleneckData: BottleneckItem[];
  topBottlenecks: TopBottleneckItem[];
  bottleneckViewMode: 'BOP' | 'TÌNH TRẠNG';
  setBottleneckViewMode: (mode: 'BOP' | 'TÌNH TRẠNG') => void;
  handleExportBottlenecks: () => void;
}

// Nền cột "Từ 4 tuần trở lên": số càng lớn đỏ càng đậm
const NEN_NGHEN = ['', 'bg-red-100', 'bg-red-200', 'bg-red-300', 'bg-red-500 text-white', 'bg-red-700 font-bold text-white'];

export const BottleneckSection: React.FC<BottleneckSectionProps> = ({
  sectionRef,
  bottleneckData,
  topBottlenecks,
  bottleneckViewMode,
  setBottleneckViewMode,
  handleExportBottlenecks,
}) => {
  // P001 / "15. CHƯA TRIỂN KHAI" = chờ triển khai bản vẽ: thường chiếm gần hết số tồn ≥ 4 tuần và che mất
  // nghẽn thật trong xưởng => tách ra ô riêng, top chỉ gồm công đoạn / tình trạng sản xuất
  const [gtMode, setGtMode] = useState(true);
  const nhanSo = gtMode ? fmtTy : fmtInt;
  const soTop = (b: TopBottleneckItem) => (gtMode ? b.gt ?? 0 : b.count);
  const designWait = topBottlenecks.find(b => laChoBanVe(b.name)) ?? null;
  const prodBottlenecks = topBottlenecks.filter(b => !laChoBanVe(b.name)).slice(0, 5);

  if (bottleneckData.length === 0) return null;

  const soCua = (row: BottleneckItem, k: string) => Number(row[gtMode ? `gt:${k}` : k]) || 0;
  const tongDong = (row: BottleneckItem) => DWELL_KEYS.reduce((a, k) => a + soCua(row, k), 0);
  const tongCot = (k: string) => bottleneckData.reduce((a, row) => a + soCua(row, k), 0);
  // Mốc đậm nhất bỏ P001 (chờ bản vẽ), không thì dòng đó làm nhạt hết các dòng nghẽn trong xưởng
  const dinhNghen = Math.max(0, ...bottleneckData.filter(r => !laChoBanVe(r.name)).map(r => soCua(r, DWELL_STUCK)));
  const nenNghen = (v: number) => (v && dinhNghen ? NEN_NGHEN[Math.min(5, Math.ceil((v / dinhNghen) * 5))] : '');

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
          <h3 className="text-lg font-bold text-slate-800">ĐIỂM NGHẼN{gtMode ? ' (tỷ)' : ''}</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 shadow-inner">
            {([[true, 'Giá trị'], [false, 'Hạng mục']] as const).map(([v, ten]) => (
              <button key={ten} onClick={() => setGtMode(v)} aria-pressed={gtMode === v}
                className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all duration-200 ${gtMode === v ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
                {ten}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 shadow-inner">
            <button
              onClick={() => setBottleneckViewMode('BOP')}
              className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all duration-200 ${
                bottleneckViewMode === 'BOP'
                  ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              BOP
            </button>
            <button
              onClick={() => setBottleneckViewMode('TÌNH TRẠNG')}
              className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all duration-200 ${
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
        <div className={`${khung} max-h-[560px] lg:col-span-2`}>
          <table className={table}>
            <thead className={thead}>
              <tr>
                <th className={`${thB} sticky left-0 z-[3] min-w-[11rem] bg-emerald-300 text-center`}>
                  {bottleneckViewMode === 'BOP' ? 'BOP' : 'Tình trạng'}
                </th>
                {DWELL_KEYS.map(k => <th key={k} className={`${thB} text-center text-sm`}>{k}</th>)}
                <th className={`${thB} text-center`}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {bottleneckData.map(row => (
                <tr key={row.name}>
                  <td className={`${tdB} sticky left-0 z-[1] whitespace-nowrap bg-white font-bold`}>{row.name}</td>
                  {DWELL_KEYS.map(k => {
                    const v = soCua(row, k);
                    return <td key={k} className={`${tdB} ${soO} ${k === DWELL_STUCK ? nenNghen(v) : ''}`}>{trong0(v, nhanSo)}</td>;
                  })}
                  <td className={`${tdB} ${soO} font-bold`}>{trong0(tongDong(row), nhanSo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className={tfoot}>
              <tr>
                <td className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
                {DWELL_KEYS.map(k => <td key={k} className={`${tdB} ${soO}`}>{trong0(tongCot(k), nhanSo)}</td>)}
                <td className={`${tdB} ${soO}`}>{trong0(bottleneckData.reduce((a, r) => a + tongDong(r), 0), nhanSo)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Top 5 bottleneck list */}
        <div className="bg-red-50/50 rounded-xl p-5 border border-red-100 flex flex-col">
          <div className="flex items-center gap-2 mb-4 text-red-700">
            <Clock className="w-5 h-5" />
            <h4 className="font-bold uppercase text-sm">Top nghẽn ≥ 4 tuần</h4>
          </div>

          {prodBottlenecks.length > 0 ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {prodBottlenecks.map((item, index) => (
                <div
                  key={index}
                  className="bg-white p-3 rounded-lg border border-red-200 shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 font-bold text-sm">
                      {index + 1}
                    </span>
                    <p className="text-sm font-bold text-slate-700">{item.name}</p>
                  </div>
                  <span className="text-2xl font-bold text-red-600 leading-none tabular-nums">{nhanSo(soTop(item))}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 text-center p-4">
              <CheckCircle className="w-10 h-10 text-green-400 mb-2 opacity-50" />
              <p className="text-sm">Không có nghẽn ≥ 4 tuần</p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-red-200">
            <div className="flex justify-between items-center text-sm">
              <span className="font-semibold text-slate-700">Tổng</span>
              <span className="text-xl font-bold text-red-700 tabular-nums">
                {nhanSo(prodBottlenecks.reduce((a, b) => a + soTop(b), 0))}
              </span>
            </div>
            {designWait && (
              <div
                className="mt-2 flex justify-between items-center rounded-lg bg-white px-3 py-2 text-sm border border-slate-200"
                title="Hạng mục chưa triển khai bản vẽ tồn ≥ 4 tuần — chờ thiết kế, không phải nghẽn trong xưởng (tách khỏi top nghẽn sản xuất)"
              >
                <span className="text-slate-700">{designWait.name} · chờ bản vẽ</span>
                <span className="text-base font-bold text-slate-800 tabular-nums">{nhanSo(soTop(designWait))}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};