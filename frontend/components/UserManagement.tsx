import React, { useEffect, useState } from 'react';
import { User, PERMISSION_GROUPS, PermissionGroup, ITEM_ACTIONS, ALL_ITEM_IDS, ALL_ACTION_IDS } from '../types';
import { userService } from '../services/userService';
import { Plus, Edit2, Trash2, Shield, X, Check, Search, RefreshCw, Loader, Mail, Briefcase, CheckSquare, Square, MinusSquare, Crown, User as UserIcon, CornerDownRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';

// Tất cả id quyền (item + action)
const ALL_PERMISSION_IDS = [...ALL_ITEM_IDS, ...ALL_ACTION_IDS];

// Lấy danh sách action id của 1 item
const actionIdsOf = (itemId: string): string[] => (ITEM_ACTIONS[itemId] || []).map(a => a.id);

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { showToast } = useToast();

  // Form State
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    username: '',
    password: '',
    fullName: '',
    role: 'USER',
    permissions: [],
    msnv: '',
    department: '',
    note: '',
    email: '',
    status: 'ACTIVE'
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const response = await userService.getUsers();
    if (response.success && response.data) {
      setUsers(response.data);
    }
    setLoading(false);
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        ...user,
        password: '' // Security: Don't show password
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: '',
        password: '',
        fullName: '',
        role: 'USER',
        permissions: ['dashboard'], // Default View
        msnv: '',
        department: '',
        note: '',
        email: '',
        status: 'ACTIVE'
      });
    }
    setIsModalOpen(true);
  };

  // ---------------- PHÂN QUYỀN ----------------

  const setPermissions = (permissions: string[]) => {
    setFormData(prev => ({ ...prev, permissions }));
  };

  // Tick / bỏ tick 1 mục nhỏ (item)
  // - Bỏ item => bỏ luôn các action con của nó
  const toggleItem = (itemId: string) => {
    const cur = formData.permissions || [];
    if (cur.includes(itemId)) {
      const childIds = actionIdsOf(itemId);
      setPermissions(cur.filter(p => p !== itemId && !childIds.includes(p)));
    } else {
      setPermissions([...cur, itemId]);
    }
  };

  // Tick / bỏ tick 1 thao tác (action)
  // - Tick action => tự tick item cha
  const toggleAction = (itemId: string, actionId: string) => {
    const cur = formData.permissions || [];
    if (cur.includes(actionId)) {
      setPermissions(cur.filter(p => p !== actionId));
    } else {
      const next = [...cur, actionId];
      if (!next.includes(itemId)) next.push(itemId);
      setPermissions(next);
    }
  };

  // Tick / bỏ tick cả mục lớn (group)
  const toggleGroup = (group: PermissionGroup) => {
    const cur = formData.permissions || [];
    const itemIds = group.items.map(i => i.id);
    const removeIds = [...itemIds, ...itemIds.flatMap(actionIdsOf)];
    const allChecked = itemIds.every(id => cur.includes(id));

    if (allChecked) {
      setPermissions(cur.filter(p => !removeIds.includes(p)));
    } else {
      setPermissions(Array.from(new Set([...cur, ...itemIds])));
    }
  };

  // Chọn tất cả / bỏ chọn tất cả
  const toggleAllPermissions = () => {
    const cur = formData.permissions || [];
    const allChecked = ALL_ITEM_IDS.every(id => cur.includes(id));
    setPermissions(allChecked ? [] : ALL_PERMISSION_IDS);
  };

  // ---------------- SUBMIT / DELETE ----------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.fullName) {
      showToast('Vui lòng nhập tên đăng nhập và họ tên', 'error');
      return;
    }
    if (!editingUser && !formData.password) {
      showToast('Vui lòng nhập mật khẩu cho user mới', 'error');
      return;
    }

    setIsSaving(true);

    // Ensure permissions is array
    const cleanData: any = {
      ...formData,
      role: formData.role || 'USER',
      permissions: formData.permissions || []
    };

    // Không gửi password nếu để trống (giữ nguyên mật khẩu cũ khi sửa user)
    if (!cleanData.password) {
      delete cleanData.password;
    }

    // Email rỗng phải chuyển thành null, không được gửi chuỗi rỗng
    // (backend validate .email() sẽ từ chối chuỗi rỗng)
    if (!cleanData.email) {
      cleanData.email = null;
    }

    let result;
    if (editingUser && editingUser.id) {
      result = await userService.updateUser({ ...cleanData, id: editingUser.id });
    } else {
      result = await userService.addUser(cleanData as any);
    }

    setIsSaving(false);

    if (result.success) {
      showToast(result.message || 'Thành công', 'success');
      setIsModalOpen(false);
      fetchUsers();
    } else {
      showToast(result.message || 'Thất bại', 'error');
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa user: ${username}?`)) {
      setLoading(true);
      const result = await userService.deleteUser(id);
      if (result.success) {
        showToast('Xóa thành công', 'success');
        fetchUsers();
      } else {
        showToast(result.message || 'Xóa thất bại', 'error');
        setLoading(false);
      }
    }
  };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.msnv && u.msnv.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isAdminForm = formData.role === 'ADMIN';

  return (
    <div className="h-full bg-slate-50 flex flex-col p-4 md:p-8 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="text-wood-600" />
            Quản trị Người dùng
          </h1>
          <p className="text-slate-500 text-sm mt-1">Quản lý tài khoản, vai trò và phân quyền truy cập</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-wood-600 hover:bg-wood-700 text-white px-4 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-all font-medium"
        >
          <Plus size={18} /> Thêm User mới
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Tìm kiếm: Tên, Username, MSNV..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wood-400 bg-white text-slate-900 placeholder-slate-400"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button onClick={fetchUsers} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors" title="Làm mới">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-slate-50 sticky top-0 z-10 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100">User Info</th>
                <th className="px-6 py-4 border-b border-slate-100">Liên hệ</th>
                <th className="px-6 py-4 border-b border-slate-100">Phòng ban</th>
                <th className="px-6 py-4 border-b border-slate-100">Vai trò</th>
                <th className="px-6 py-4 border-b border-slate-100">Quyền hạn</th>
                <th className="px-6 py-4 border-b border-slate-100">Trạng thái</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">Đang tải dữ liệu...</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">Không tìm thấy người dùng nào.</td></tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-wood-100 flex items-center justify-center text-wood-700 font-bold text-sm">
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{user.fullName}</div>
                          <div className="text-xs text-slate-500">@{user.username}</div>
                          {user.msnv && <div className="text-[10px] text-slate-400 font-mono">ID: {user.msnv}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {user.email ? (
                        <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                          <Mail size={12} /> {user.email}
                        </div>
                      ) : <span className="text-slate-300 text-xs">-</span>}
                    </td>
                    <td className="px-6 py-4">
                      {user.department ? (
                        <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                          <Briefcase size={12} /> {user.department}
                        </div>
                      ) : <span className="text-slate-300 text-xs">-</span>}
                      {user.note && <div className="text-[10px] text-slate-400 mt-1 max-w-[150px] truncate" title={user.note}>{user.note}</div>}
                    </td>
                    <td className="px-6 py-4">
                      {user.role === 'ADMIN' ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100 w-fit">
                          <Crown size={12} /> Admin
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200 w-fit">
                          <UserIcon size={12} /> User
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.role === 'ADMIN' ? (
                        <span className="text-xs text-purple-600 italic">Full Access</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {PERMISSION_GROUPS.map(group => {
                            const perms = user.permissions || [];
                            const count = group.items.filter(i => perms.includes(i.id)).length;
                            if (count === 0) return null;
                            const title = group.items
                              .filter(i => perms.includes(i.id))
                              .map(i => i.label)
                              .join(', ');
                            return (
                              <span
                                key={group.id}
                                title={title}
                                className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] border border-slate-200"
                              >
                                {group.label} ({count}/{group.items.length})
                              </span>
                            );
                          })}
                          {(user.permissions || []).length === 0 && <span className="text-slate-300 text-xs">-</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${user.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenModal(user)}
                          className="p-1.5 text-slate-500 hover:text-wood-600 hover:bg-wood-50 rounded transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={16} />
                        </button>
                        {user.username !== 'admin' && (
                          <button
                            onClick={() => handleDelete(user.id, user.username)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Xóa"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">
                {editingUser ? 'Cập nhật Người dùng' : 'Thêm Người dùng mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Basic Info */}
                <div className="md:col-span-2 text-xs font-bold text-wood-600 uppercase border-b border-slate-100 pb-1 mb-2">Thông tin cơ bản</div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Tên đăng nhập <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    disabled={!!editingUser}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Mật khẩu {editingUser && '(để trống nếu không đổi)'} {!editingUser && <span className="text-red-500">*</span>}</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Họ và Tên <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                    value={formData.fullName}
                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Vai trò</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value as 'ADMIN' | 'USER' })}
                  >
                    <option value="USER">User (Theo phân quyền)</option>
                    <option value="ADMIN">Admin (Toàn quyền)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Mã NV (MSNV)</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                    value={formData.msnv || ''}
                    onChange={e => setFormData({ ...formData, msnv: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Email (Để khôi phục MK)</label>
                  <input
                    type="email"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                    value={formData.email || ''}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Phòng ban</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                    value={formData.department || ''}
                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500">Ghi chú</label>
                  <textarea
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none resize-none h-16 bg-white text-slate-900 placeholder-slate-400"
                    value={formData.note || ''}
                    onChange={e => setFormData({ ...formData, note: e.target.value })}
                  />
                </div>

                {/* Permissions Section */}
                <div className="md:col-span-2 mt-4 relative">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-1 mb-2">
                    <div className="text-xs font-bold text-wood-600 uppercase">Phân quyền truy cập (theo mục lớn / mục nhỏ)</div>
                    {!isAdminForm && (
                      <button
                        type="button"
                        onClick={toggleAllPermissions}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Chọn tất cả / Bỏ chọn
                      </button>
                    )}
                  </div>

                  {/* Overlay when Admin */}
                  {isAdminForm && (
                    <div className="absolute inset-0 top-6 bg-white/80 z-10 flex items-center justify-center border border-purple-100 rounded-lg backdrop-blur-[1px]">
                      <div className="text-purple-600 font-bold flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-full shadow-sm">
                        <Crown size={20} /> Tài khoản Admin có toàn quyền truy cập
                      </div>
                    </div>
                  )}

                  <div className={`space-y-3 ${isAdminForm ? 'opacity-30' : ''}`}>
                    {PERMISSION_GROUPS.map(group => {
                      const perms = formData.permissions || [];
                      const checkedCount = group.items.filter(i => perms.includes(i.id)).length;
                      const allChecked = checkedCount === group.items.length;
                      const someChecked = checkedCount > 0 && !allChecked;

                      return (
                        <div key={group.id} className="border border-slate-200 rounded-lg overflow-hidden">
                          {/* Mục lớn */}
                          <div
                            onClick={() => !isAdminForm && toggleGroup(group)}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-wood-50 ${checkedCount > 0 ? 'bg-wood-50/60' : 'bg-slate-50'}`}
                          >
                            {allChecked
                              ? <CheckSquare size={18} className="text-wood-600 shrink-0" />
                              : someChecked
                                ? <MinusSquare size={18} className="text-wood-500 shrink-0" />
                                : <Square size={18} className="text-slate-300 shrink-0" />}
                            <span className="text-sm font-bold text-slate-700">{group.label}</span>
                            <span className="ml-auto text-[10px] text-slate-400">{checkedCount}/{group.items.length}</span>
                          </div>

                          {/* Mục nhỏ */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2 border-t border-slate-100">
                            {group.items.map(item => {
                              const on = perms.includes(item.id);
                              const actions = ITEM_ACTIONS[item.id] || [];

                              return (
                                <div key={item.id} className={`rounded ${on ? 'bg-wood-50/50' : ''}`}>
                                  <div
                                    onClick={() => !isAdminForm && toggleItem(item.id)}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-wood-50"
                                  >
                                    {on
                                      ? <CheckSquare size={16} className="text-wood-600 shrink-0" />
                                      : <Square size={16} className="text-slate-300 shrink-0" />}
                                    <span className={`text-sm ${on ? 'font-medium text-wood-800' : 'text-slate-600'}`}>{item.label}</span>
                                  </div>

                                  {/* Thao tác chi tiết trong mục nhỏ */}
                                  {on && actions.length > 0 && (
                                    <div className="pb-1 space-y-0.5">
                                      {actions.map(action => {
                                        const actionOn = perms.includes(action.id);
                                        return (
                                          <div
                                            key={action.id}
                                            onClick={() => !isAdminForm && toggleAction(item.id, action.id)}
                                            className="flex items-center gap-2 pl-6 py-1 cursor-pointer hover:bg-wood-100/50 rounded"
                                          >
                                            <CornerDownRight size={12} className="text-slate-400 shrink-0" />
                                            {actionOn
                                              ? <CheckSquare size={14} className="text-indigo-600 shrink-0" />
                                              : <Square size={14} className="text-slate-300 shrink-0" />}
                                            <span className={`text-xs ${actionOn ? 'text-indigo-700 font-medium' : 'text-slate-500'}`}>{action.label}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="md:col-span-2 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.status === 'ACTIVE'}
                      onChange={e => setFormData({ ...formData, status: e.target.checked ? 'ACTIVE' : 'INACTIVE' })}
                      className="w-4 h-4 text-wood-600 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700">Kích hoạt tài khoản</span>
                  </label>
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 bg-wood-600 text-white rounded-lg hover:bg-wood-700 font-medium flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
                  {editingUser ? 'Cập nhật' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default UserManagement;