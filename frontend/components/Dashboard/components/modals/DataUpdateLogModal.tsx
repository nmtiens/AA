import React, { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

interface UpdateLogRow {
  table: string;
  label: string;
  lastUpdated: string | null;
  isFresh: boolean; // cờ từ server — không còn dùng để tô màu, xem isUpdatedToday bên dưới
  hoursAgo: number | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const DataUpdateLogModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [rows, setRows] = useState<UpdateLogRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('vi-VN') : '—';

  // "Đã cập nhật" chỉ khi lần cập nhật cuối rơi vào ĐÚNG NGÀY HÔM NAY (theo giờ local).
  // Không dùng cờ isFresh từ server (tính theo số giờ trôi qua), vì cách đó khiến
  // dữ liệu cập nhật hôm qua (chưa đủ X giờ) vẫn bị tô xanh dù đã sang ngày mới.
  const isUpdatedToday = (iso: string | null) => {
    if (!iso) return false;
    const updated = new Date(iso);
    const now = new Date();
    return (
      updated.getFullYear() === now.getFullYear() &&
      updated.getMonth() === now.getMonth() &&
      updated.getDate() === now.getDate()
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-bold text-slate-800">Nhật ký cập nhật dữ liệu</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md disabled:opacity-50"
              title="Làm mới"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase">
                <th className="text-left px-3 py-2">Nguồn dữ liệu</th>
                <th className="text-left px-3 py-2">Cập nhật lần cuối</th>
                <th className="text-left px-3 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const fresh = isUpdatedToday(row.lastUpdated);
                return (
                  <tr key={row.table} className={`rounded-lg ${fresh ? 'bg-green-50' : 'bg-red-50'}`}>
                    <td className="px-3 py-2 font-medium text-slate-700">{row.label}</td>
                    <td className="px-3 py-2 text-slate-600">{formatDate(row.lastUpdated)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1.5 font-semibold ${fresh ? 'text-green-700' : 'text-red-700'}`}>
                        {fresh ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {fresh ? 'Đã cập nhật' : 'Chưa cập nhật'}
                        {row.hoursAgo !== null && (
                          <span className="text-slate-400 font-normal">({row.hoursAgo}h trước)</span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-400">Không có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};