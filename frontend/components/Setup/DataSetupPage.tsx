import React, { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

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
    <div className="flex h-full flex-col overflow-hidden bg-[#f5f6f8]">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 pt-5">
        <h1 className="page-title">Setup dữ liệu</h1>
        <p className="mt-0.5 text-sm text-slate-500">Cấu hình dùng chung cho mọi người: nhóm công trình, cột hiển thị, gộp xưởng</p>
        {/* Thẻ chọn mục setup (gạch chân thẻ đang mở); mô tả ngắn dưới tên */}
        <div className="mt-3 flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Mục setup">
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
                className={`-mb-px flex shrink-0 items-start gap-2 border-b-2 px-4 pb-3 pt-2 text-left transition ${
                  on ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${on ? 'text-slate-900' : 'text-slate-400'}`}>{t.icon}</span>
                <span className="min-w-0">
                  <span className={`block text-[0.9375rem] ${on ? 'font-semibold' : ''}`}>{t.label}</span>
                  <span className="block truncate text-xs font-normal text-slate-500">{t.desc}</span>
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
