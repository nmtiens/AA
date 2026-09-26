import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X, RefreshCw, CheckCircle2, XCircle, Plus, Trash2, Loader2 } from 'lucide-react';
import { getToken } from '../../../../services/userService'; // SỬA: dùng chung hàm đọc đúng key 'app_token'
                                                       // thay vì tự đọc sai key 'token' như bản cũ —
                                                       // đây là lý do mọi thao tác lưu/thêm/xóa luôn
                                                       // trả về 401 dù đã đăng nhập ADMIN.

interface UpdateLogRow {
  table: string;
  label: string;
  lastUpdated: string | null;
  isFresh: boolean;
  hoursAgo: number | null;
  dataAsOfDate: string | null;   // "Dữ liệu cập nhật đến ngày" — tự động tính, hoặc nhập tay nếu isManual
  sourceNote: string;            // "Nguồn dữ liệu từ" — nhập tay
  note: string;                  // "Ghi chú" — nhập tay
  isManual: boolean;             // true = nguồn tạo thủ công (không gắn ETL thật), cho phép xóa
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  apiBaseUrl?: string;         // mặc định '' (same-origin)
  getAuthToken?: () => string | null; // mặc định dùng getToken() từ userService (đọc đúng key 'app_token')
}

// <1h -> phút | <24h -> giờ | <7 ngày -> ngày | <~4.3 tuần -> tuần |
// <12 tháng -> tháng | còn lại -> năm
const formatRelativeTime = (hoursAgo: number | null): string => {
  if (hoursAgo === null || !Number.isFinite(hoursAgo)) return '—';
  const minutes = hoursAgo * 60;
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} phút trước`;
  if (hoursAgo < 24) return `${hoursAgo.toFixed(1)} giờ trước`;
  const days = hoursAgo / 24;
  if (days < 7) return `${days.toFixed(1)} ngày trước`;
  const weeks = days / 7;
  if (weeks < 4.345) return `${weeks.toFixed(1)} tuần trước`;
  const months = days / 30.44;
  if (months < 12) return `${months.toFixed(1)} tháng trước`;
  const years = days / 365.25;
  return `${years.toFixed(1)} năm trước`;
};

export const DataUpdateLogModal: React.FC<Props> = ({
  isOpen,
  onClose,
  apiBaseUrl = '',
  getAuthToken = getToken, // SỬA: trước đây là defaultGetToken (đọc sai key 'token')
}) => {
  const [rows, setRows] = useState<UpdateLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null); // `${table}:${field}` đang lưu
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEntry, setNewEntry] = useState({ tableName: '', label: '', sourceNote: '', note: '' });
  const [adding, setAdding] = useState(false);
  const [deletingTable, setDeletingTable] = useState<string | null>(null);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAuthToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAuthToken]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/data-update-log`);
      if (!res.ok) throw new Error('Không tải được dữ liệu');
      const data = await res.json();
      setRows(data);
    } catch (err) {
      console.error('Lỗi tải nhật ký cập nhật:', err);
      setError('Không tải được nhật ký cập nhật dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  // Cập nhật local ngay khi gõ (không giật UI), rồi debounce lưu API
  const handleFieldChange = (table: string, field: 'sourceNote' | 'note', value: string) => {
    setRows(prev => prev.map(r => (r.table === table ? { ...r, [field]: value } : r)));

    const key = `${table}:${field}`;
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => saveField(table, field, value), 700);
  };

  const saveField = async (table: string, field: 'sourceNote' | 'note', value: string) => {
    const key = `${table}:${field}`;
    setSavingKey(key);
    try {
      const res = await fetch(`${apiBaseUrl}/api/data-update-log/${encodeURIComponent(table)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error('Lưu thất bại');
    } catch (err) {
      console.error(`Lỗi lưu ${field} cho ${table}:`, err);
      setError('Lưu ghi chú thất bại — kiểm tra lại quyền đăng nhập');
    } finally {
      setSavingKey(curr => (curr === key ? null : curr));
    }
  };

  const handleAdd = async () => {
    if (!newEntry.tableName.trim() || !newEntry.label.trim()) {
      setError('Vui lòng nhập tên định danh và tên hiển thị');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/data-update-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          tableName: newEntry.tableName.trim().toLowerCase(),
          label: newEntry.label.trim(),
          sourceNote: newEntry.sourceNote.trim() || null,
          note: newEntry.note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Thêm thất bại');
      setNewEntry({ tableName: '', label: '', sourceNote: '', note: '' });
      setShowAddForm(false);
      await load();
    } catch (err: any) {
      console.error('Lỗi thêm nguồn dữ liệu:', err);
      setError(err?.message || 'Thêm nguồn dữ liệu thất bại');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (table: string) => {
    if (!window.confirm('Xóa nguồn dữ liệu này? Hành động không thể hoàn tác.')) return;
    setDeletingTable(table);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/data-update-log/${encodeURIComponent(table)}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Xóa thất bại');
      setRows(prev => prev.filter(r => r.table !== table));
    } catch (err: any) {
      console.error('Lỗi xóa nguồn dữ liệu:', err);
      setError(err?.message || 'Xóa nguồn dữ liệu thất bại');
    } finally {
      setDeletingTable(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-bold text-slate-800">Nhật ký cập nhật dữ liệu</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"
              title="Thêm nguồn dữ liệu thủ công"
            >
              <Plus size={14} /> Thêm nguồn
            </button>
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

        {error && (
          <div className="px-6 py-2 bg-red-50 text-red-700 text-xs border-b border-red-100 shrink-0">
            {error}
          </div>
        )}

        {showAddForm && (
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60 shrink-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input
                value={newEntry.tableName}
                onChange={e => setNewEntry(s => ({ ...s, tableName: e.target.value }))}
                placeholder="ten_dinh_danh (vd: bao_gia_ncc)"
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-md"
              />
              <input
                value={newEntry.label}
                onChange={e => setNewEntry(s => ({ ...s, label: e.target.value }))}
                placeholder="Tên hiển thị"
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-md"
              />
              <input
                value={newEntry.sourceNote}
                onChange={e => setNewEntry(s => ({ ...s, sourceNote: e.target.value }))}
                placeholder="Nguồn dữ liệu từ"
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-md"
              />
              <input
                value={newEntry.note}
                onChange={e => setNewEntry(s => ({ ...s, note: e.target.value }))}
                placeholder="Ghi chú"
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
              >
                Hủy
              </button>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 flex items-center gap-1"
              >
                {adding && <Loader2 size={12} className="animate-spin" />} Lưu
              </button>
            </div>
          </div>
        )}

        <div className="overflow-y-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase">
                <th className="text-left px-3 py-2 w-10">STT</th>
                <th className="text-left px-3 py-2">Nguồn dữ liệu</th>
                <th className="text-left px-3 py-2">Cập nhật lần cuối</th>
                <th className="text-left px-3 py-2">Dữ liệu cập nhật đến ngày</th>
                <th className="text-left px-3 py-2">Trạng thái</th>
                <th className="text-left px-3 py-2 w-40">Nguồn dữ liệu từ</th>
                <th className="text-left px-3 py-2 w-48">Ghi chú</th>
                <th className="text-left px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const fresh = row.isFresh;
                const savingSource = savingKey === `${row.table}:sourceNote`;
                const savingNote = savingKey === `${row.table}:note`;
                return (
                  <tr key={row.table} className={`rounded-lg ${fresh ? 'bg-green-50' : 'bg-red-50'}`}>
                    <td className="px-3 py-2 text-slate-400 align-top">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-700 align-top">
                      {row.label}
                      {row.isManual && (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-400">(thủ công)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 align-top whitespace-nowrap">
                      <div>{row.lastUpdated ? new Date(row.lastUpdated).toLocaleString('vi-VN') : '—'}</div>
                      <div className="text-slate-400 text-xs">
                        {formatRelativeTime(row.hoursAgo)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 align-top whitespace-nowrap">
                      {row.dataAsOfDate ? new Date(row.dataAsOfDate).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={`inline-flex items-center gap-1.5 font-semibold ${fresh ? 'text-green-700' : 'text-red-700'}`}>
                        {fresh ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {fresh ? 'Đã cập nhật' : 'Chưa cập nhật'}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="relative">
                        <input
                          value={row.sourceNote}
                          onChange={e => handleFieldChange(row.table, 'sourceNote', e.target.value)}
                          placeholder="—"
                          className="w-full px-2 py-1 text-xs bg-white/70 border border-transparent hover:border-slate-200 focus:border-blue-300 focus:bg-white rounded-md outline-none"
                        />
                        {savingSource && <Loader2 size={11} className="animate-spin absolute right-1.5 top-1.5 text-slate-400" />}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="relative">
                        <input
                          value={row.note}
                          onChange={e => handleFieldChange(row.table, 'note', e.target.value)}
                          placeholder="—"
                          className="w-full px-2 py-1 text-xs bg-white/70 border border-transparent hover:border-slate-200 focus:border-blue-300 focus:bg-white rounded-md outline-none"
                        />
                        {savingNote && <Loader2 size={11} className="animate-spin absolute right-1.5 top-1.5 text-slate-400" />}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {row.isManual && (
                        <button
                          onClick={() => handleDelete(row.table)}
                          disabled={deletingTable === row.table}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
                          title="Xóa nguồn dữ liệu"
                        >
                          {deletingTable === row.table
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Trash2 size={14} />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Không có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};