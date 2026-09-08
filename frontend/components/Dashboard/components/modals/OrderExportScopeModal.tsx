import React from 'react';
import { Download, X } from 'lucide-react';
import { DataRow } from '../../../../types';

export type ExportScope = 'FILTERED' | 'MTD' | 'ALL';

interface OrderExportScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderExportScope: ExportScope;
  setOrderExportScope: (scope: ExportScope) => void;
  filteredOrderData: DataRow[];
  mtdOrderData: DataRow[];
  orderData: DataRow[];
  latestUnifiedDate: Date | null;
  overviewDateFilters: string[];
  onContinue: () => void;
}

export const OrderExportScopeModal = ({
  isOpen,
  onClose,
  orderExportScope,
  setOrderExportScope,
  filteredOrderData,
  mtdOrderData,
  orderData,
  latestUnifiedDate,
  overviewDateFilters,
  onContinue,
}: OrderExportScopeModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-pink-600 to-rose-600">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/20 rounded-lg">
              <Download size={22} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">Tùy Chọn Phạm Vi Xuất</h3>
              <p className="text-[10px] text-pink-100 font-medium">Bước 1/2: Chọn phạm vi dữ liệu xuất</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 bg-slate-50/50 flex flex-col gap-4">
          <p className="text-sm font-semibold text-slate-700">Bạn muốn xuất dữ liệu theo tùy chọn nào?</p>

          <div className="flex flex-col gap-3">
            <div
              onClick={() => setOrderExportScope('FILTERED')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${orderExportScope === 'FILTERED' ? 'border-pink-500 bg-pink-50/70 shadow-sm ring-2 ring-pink-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input
                type="radio"
                name="orderExportScope"
                checked={orderExportScope === 'FILTERED'}
                onChange={() => setOrderExportScope('FILTERED')}
                className="mt-1 text-pink-600 focus:ring-pink-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc ngày</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-700">
                    {filteredOrderData.length.toLocaleString('en-US')} dòng
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {overviewDateFilters.length > 0
                    ? `Đang áp dụng ngày: ${overviewDateFilters.join(', ')}`
                    : 'Xuất theo ngày hiển thị hiện tại'}
                </p>
              </div>
            </div>

            <div
              onClick={() => setOrderExportScope('MTD')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${orderExportScope === 'MTD' ? 'border-pink-500 bg-pink-50/70 shadow-sm ring-2 ring-pink-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input
                type="radio"
                name="orderExportScope"
                checked={orderExportScope === 'MTD'}
                onChange={() => setOrderExportScope('MTD')}
                className="mt-1 text-pink-600 focus:ring-pink-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc lũy kế tháng</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    {mtdOrderData.length.toLocaleString('en-US')} dòng
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lũy kế tháng {latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''} (từ đầu tháng đến ngày lọc {latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}` : ''})
                </p>
              </div>
            </div>

            <div
              onClick={() => setOrderExportScope('ALL')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${orderExportScope === 'ALL' ? 'border-pink-500 bg-pink-50/70 shadow-sm ring-2 ring-pink-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input
                type="radio"
                name="orderExportScope"
                checked={orderExportScope === 'ALL'}
                onChange={() => setOrderExportScope('ALL')}
                className="mt-1 text-pink-600 focus:ring-pink-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Xuất đầy đủ dữ liệu (Gốc)</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {orderData.length.toLocaleString('en-US')} dòng
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bao gồm toàn bộ tất cả các dòng dữ liệu đơn hàng trong hệ thống (không lọc).
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm cursor-pointer">
            Hủy
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-pink-600 text-white font-bold rounded-lg hover:bg-pink-700 transition-all shadow-md active:scale-95 text-sm flex items-center gap-2 cursor-pointer"
          >
            Tiếp tục (Chọn cột) &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};