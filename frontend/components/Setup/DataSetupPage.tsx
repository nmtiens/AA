import React, { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, RefreshCw } from 'lucide-react';

// ============================================================================
// TRANG CHUNG "SETUP DỮ LIỆU" — gộp 3 trang setup trước đây (nhóm công trình, cột dữ liệu, gộp xưởng)
// thành 1 mục menu, chọn bằng thẻ phía trên. Thẻ chỉ hiện khi người dùng có quyền tương ứng (App.tsx lọc).
// Thẻ đang mở nằm trên URL (?tab=...) để đường dẫn cũ chuyển thẳng tới đúng thẻ và tải lại không mất chỗ.
// ============================================================================

export interface SetupTab {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  render: () => React.ReactNode;
}

const DataSetupPage: React.FC<{ tabs: SetupTab[] }> = ({ tabs }) => {
  const [params, setParams] = useSearchParams();
  const active = tabs.find(t => t.id === params.get('tab')) ?? tabs[0];

  if (!active) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-500">
        Bạn chưa được cấp quyền setup dữ liệu nào.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-wood-50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-wood-600 text-white shadow-sm">
            <Settings size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Setup dữ liệu</h1>
            <p className="text-xs text-slate-500">Cấu hình dùng chung cho mọi người: nhóm công trình, cột hiển thị, gộp xưởng</p>
          </div>
        </div>
        {/* Thẻ chọn mục setup — mỗi thẻ có mô tả ngắn để biết mục đó dùng làm gì */}
        <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Mục setup">
          {tabs.map(t => {
            const on = t.id === active.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setParams({ tab: t.id }, { replace: true })}
                title={t.desc}
                className={`group flex min-w-[12rem] items-start gap-2.5 rounded-t-lg border border-b-0 px-4 py-2.5 text-left transition ${
                  on ? 'border-slate-200 bg-wood-50 text-slate-900' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${on ? 'text-wood-700' : 'text-slate-400 group-hover:text-slate-600'}`}>{t.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block truncate text-[0.6875rem] font-normal text-slate-500">{t.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1" role="tabpanel">
        {/* Nội dung thẻ tải riêng (lazy): vòng xoay chỉ trong khung thẻ, giữ nguyên tiêu đề + thanh thẻ */}
        <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-400"><RefreshCw size={18} className="animate-spin" /></div>}>
          {active.render()}
        </Suspense>
      </div>
    </div>
  );
};

export default DataSetupPage;
