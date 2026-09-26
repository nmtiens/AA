import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Pencil, Trash2, History, Check, Loader } from 'lucide-react';
import {
  FIVE_M_LABELS, type FiveMCategory,
  fetchVuongMacList, createVuongMac, updateVuongMac, deleteVuongMac,
  fetchVuongMacLog, type VuongMacItem, type VuongMacLogEntry,
} from '../../../../services/vuongMacService';
import { useAuth } from '../../../../context/AuthContext';

interface VuongMacDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  hex: string;
  hexLabel: string;
  category: FiveMCategory;
  categoryLabel: string; // add this line
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const CATEGORY_BADGE: Record<FiveMCategory, string> = {
  man: 'bg-blue-100 text-blue-700 border-blue-300',
  machine: 'bg-purple-100 text-purple-700 border-purple-300',
  material: 'bg-amber-100 text-amber-700 border-amber-300',
  method: 'bg-teal-100 text-teal-700 border-teal-300',
  measurement: 'bg-pink-100 text-pink-700 border-pink-300',
};

export const VuongMacDetailModal: React.FC<VuongMacDetailModalProps> = ({ isOpen, onClose, hex, hexLabel, category }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<VuongMacItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState<VuongMacLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // ✅ Chỉ tải và hiển thị đúng các mục thuộc category đang khóa cho popup này.
  const loadItems = useCallback(async () => {
    if (!hex) return;
    setLoading(true);
    const data = await fetchVuongMacList([hex]);
    setItems((data[hex] || []).filter(v => v.category === category));
    setLoading(false);
  }, [hex, category]);

  useEffect(() => {
    if (!isOpen) {
      setShowLog(false);
      setIsAdding(false);
      setEditingId(null);
      return;
    }
    loadItems();
  }, [isOpen, loadItems]);

  const loadLog = async () => {
    setLoadingLog(true);
    const entries = await fetchVuongMacLog(hex);
    // Log hiển thị đầy đủ mọi loại 5M của hex này (để không mất dấu vết khi
    // 1 mục bị đổi category), nhưng lọc mặc định về đúng category đang xem
    // cho gọn — người dùng vẫn thấy nhãn loại trên mỗi dòng nếu cần đối chiếu.
    setLogEntries(entries.filter(e => e.category === category || e.category === null));
    setLoadingLog(false);
  };

  const handleOpenLog = () => {
    setShowLog(true);
    loadLog();
  };

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    const created = await createVuongMac(hex, category, newContent.trim());
    setSaving(false);
    if (created) {
      setItems(prev => [...prev, created]);
      setNewContent('');
      setIsAdding(false);
    }
  };

  const handleStartEdit = (item: VuongMacItem) => {
    setEditingId(item.id);
    setEditContent(item.content);
  };

  const handleSaveEdit = async (id: number) => {
    if (!editContent.trim()) return;
    setSaving(true);
    const updated = await updateVuongMac(id, { content: editContent.trim() });
    setSaving(false);
    if (updated) {
      setItems(prev => prev.map(it => (it.id === id ? updated : it)));
      setEditingId(null);
    }
  };

  const handleToggleResolved = async (item: VuongMacItem) => {
    const updated = await updateVuongMac(item.id, { isResolved: !item.isResolved });
    if (updated) setItems(prev => prev.map(it => (it.id === item.id ? updated : it)));
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Xóa vướng mắc này?')) return;
    const ok = await deleteVuongMac(id);
    if (ok) setItems(prev => prev.filter(it => it.id !== id));
  };

  const canModify = (item: VuongMacItem) => user && (user.username === item.createdBy || user.role === 'ADMIN');

  if (!isOpen) return null;

  const badgeClass = CATEGORY_BADGE[category];

  return createPortal(
    <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="flex h-[85vh] w-[92vw] max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-red-700">Vướng Mắc — Hex {hex}</h3>
              <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${badgeClass}`}>
                {FIVE_M_LABELS[category]}
              </span>
            </div>
            {hexLabel && <p className="mt-0.5 text-xs text-slate-500">{hexLabel}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenLog}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <History size={14} /> Xem log
            </button>
            <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar space-y-3">
          {loading ? (
            <div className="text-sm text-slate-400">Đang tải...</div>
          ) : items.length === 0 && !isAdding ? (
            <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">
              Chưa có vướng mắc nào thuộc "{FIVE_M_LABELS[category]}" cho hex này.
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} className={`rounded-lg border p-3 ${item.isResolved ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-red-200 bg-red-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    {item.isResolved ? 'Đã xử lý' : 'Đang tồn đọng'}
                  </span>
                  {canModify(item) && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleToggleResolved(item)} title={item.isResolved ? 'Đánh dấu chưa xử lý' : 'Đánh dấu đã xử lý'} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-emerald-600">
                        <Check size={14} />
                      </button>
                      <button onClick={() => handleStartEdit(item)} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-blue-600">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {editingId === item.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-300"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEdit(item.id)} disabled={saving} className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                        {saving ? <Loader size={12} className="animate-spin" /> : 'Lưu'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">Hủy</button>
                    </div>
                  </div>
                ) : (
                  <p className={`mt-1.5 whitespace-pre-wrap break-words text-sm ${item.isResolved ? 'text-slate-500 line-through' : 'text-red-800'}`}>
                    {item.content}
                  </p>
                )}

                <p className="mt-2 text-[11px] text-slate-400">
                  Tạo bởi <span className="font-medium text-slate-500">{item.createdBy}</span> lúc {formatDateTime(item.createdAt)}
                  {item.updatedBy && item.updatedAt !== item.createdAt && (
                    <> · Sửa bởi <span className="font-medium text-slate-500">{item.updatedBy}</span> lúc {formatDateTime(item.updatedAt)}</>
                  )}
                </p>
              </div>
            ))
          )}

          {isAdding ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
              <div className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold ${badgeClass}`}>
                {FIVE_M_LABELS[category]}
              </div>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="Mô tả vướng mắc..."
                rows={3}
                autoFocus
                className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-300"
              />
              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={saving || !newContent.trim()} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                  {saving ? <Loader size={12} className="animate-spin" /> : 'Thêm vướng mắc'}
                </button>
                <button onClick={() => { setIsAdding(false); setNewContent(''); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Hủy</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-500 hover:border-red-400 hover:bg-red-50 hover:text-red-600"
            >
              <Plus size={16} /> Thêm vướng mắc ({FIVE_M_LABELS[category]})
            </button>
          )}
        </div>
      </div>

      {showLog && createPortal(
        <div className="fixed inset-0 z-[10004] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="flex h-[80vh] w-[90vw] max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-800">
                Nhật ký thao tác — Hex {hex} · {FIVE_M_LABELS[category]}
              </h3>
              <button onClick={() => setShowLog(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
              {loadingLog ? (
                <div className="text-sm text-slate-400">Đang tải...</div>
              ) : logEntries.length === 0 ? (
                <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">Chưa có thao tác nào.</div>
              ) : (
                <div className="space-y-2">
                  {logEntries.map(entry => (
                    <div key={entry.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className={`rounded px-2 py-0.5 text-[11px] font-bold
                          ${entry.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                            entry.action === 'UPDATE' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {entry.action === 'CREATE' ? 'THÊM MỚI' : entry.action === 'UPDATE' ? 'CHỈNH SỬA' : 'XÓA'}
                        </span>
                        <span className="text-[11px] text-slate-400">{formatDateTime(entry.actedAt)}</span>
                      </div>
                      {entry.action === 'UPDATE' && (
                        <div className="mt-1.5 text-xs">
                          <p className="text-slate-400 line-through">{entry.contentBefore}</p>
                          <p className="text-slate-700">{entry.contentAfter}</p>
                        </div>
                      )}
                      {entry.action !== 'UPDATE' && (
                        <p className="mt-1.5 text-xs text-slate-700">{entry.contentAfter || entry.contentBefore}</p>
                      )}
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        Người thao tác: <span className="font-medium text-slate-600">{entry.actor}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
};