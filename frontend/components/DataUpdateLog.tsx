import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

interface UpdateLogRow {
  table: string;
  label: string;
  lastUpdated: string | null;
  isFresh: boolean;
  hoursAgo: number | null;
}

const DataUpdateLog: React.FC = () => {
  const [rows, setRows] = useState<UpdateLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/data-update-log');
      const data = await res.json();
      setRows(data);
    } catch (err) {
      console.error('Lỗi tải nhật ký cập nhật:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('vi-VN') : '—';

  return (
    <div className="flex flex-col h-full bg-wood-50">
      <div className="flex items-center justify-between px-6 py-4 border-b border-wood-200 bg-white">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Nhật ký cập nhật dữ liệu</h2>
          <p className="text-sm text-slate-500">Thời điểm cập nhật gần nhất của từng nguồn dữ liệu</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-wood-600 text-white rounded-lg hover:bg-wood-700 text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-wood-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Nguồn dữ liệu</th>
                <th className="text-left px-4 py-3">Cập nhật lần cuối</th>
                <th className="text-left px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.table}
                  className={`border-t border-wood-100 ${
                    row.isFresh ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-700">{row.label}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(row.lastUpdated)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 font-semibold ${
                        row.isFresh ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {row.isFresh ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      {row.isFresh ? 'Đã cập nhật' : 'Chưa cập nhật'}
                      {row.hoursAgo !== null && (
                        <span className="text-slate-400 font-normal">
                          ({row.hoursAgo}h trước)
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                    Không có dữ liệu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DataUpdateLog;