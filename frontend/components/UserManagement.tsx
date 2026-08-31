
import React, { useEffect, useState } from 'react';
import { User, APP_VIEWS } from '../types';
import { userService } from '../services/userService';
import { Plus, Edit2, Trash2, Shield, X, Check, Search, RefreshCw, Loader, Mail, Briefcase, FileText, CheckSquare, Square, Crown, User as UserIcon, CornerDownRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';

// --- CẤU HÌNH SECTION PHÂN QUYỀN ---
// Định nghĩa các khu vực con (Section) nằm trong các View cha
const VIEW_SECTIONS: Record<string, { id: string; label: string }[]> = {
  dashboard: [
    { id: 'dashboard_overview', label: 'Báo cáo Tổng quan' },
    { id: 'dashboard_financial', label: 'Số liệu Tài chính' },
    { id: 'dashboard_bottleneck', label: 'Báo cáo Điểm nghẽn' }
  ],
  production: [
    { id: 'production_edit', label: 'Chỉnh sửa dữ liệu' },
    { id: 'production_export', label: 'Xuất Excel' }
  ],
  orders: [
    { id: 'orders_import', label: 'Import Dữ liệu' },
    { id: 'orders_view_price', label: 'Xem Giá trị Đơn hàng' }
  ],
  materials: [
    { id: 'materials_view_price', label: 'Xem Giá/NCC' },
    { id: 'materials_edit', label: 'Cập nhật trạng thái' }
  ],
  inventory: [
    { id: 'inventory_edit', label: 'Điều chỉnh kho' }
  ],
  analysis: [
    { id: 'analysis_export', label: 'Xuất báo cáo KH-TH' }
  ]
};

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

  const togglePermission = (id: string) => {
    const currentPerms = formData.permissions || [];
    let newPerms: string[] = [];

    if (currentPerms.includes(id)) {
      // Logic: Nếu bỏ chọn View cha, bỏ luôn các Section con của nó (nếu có)
      newPerms = currentPerms.filter(p => p !== id);
      
      // Kiểm tra xem ID vừa bỏ có phải là View cha không
      if (VIEW_SECTIONS[id]) {
        const childIds = VIEW_SECTIONS[id].map(s => s.id);
        newPerms = newPerms.filter(p => !childIds.includes(p));
      }
    } else {
      // Logic: Chọn bình thường
      newPerms = [...currentPerms, id];
      
      // Optional: Nếu chọn Section con, tự động chọn View cha (nếu chưa chọn)
      // Tìm xem id này có thuộc view nào không
      const parentView = Object.keys(VIEW_SECTIONS).find(vId => 
        VIEW_SECTIONS[vId].some(s => s.id === id)
      );
      if (parentView && !newPerms.includes(parentView)) {
        newPerms.push(parentView);
      }
    }
    
    setFormData({ ...formData, permissions: newPerms });
  };

  const toggleAllPermissions = () => {
    const allViewIds = APP_VIEWS.map(v => v.id);
    // Lấy tất cả section IDs
    const allSectionIds = Object.values(VIEW_SECTIONS).flatMap(secs => secs.map(s => s.id));
    const allIds = [...allViewIds, ...allSectionIds];

    if ((formData.permissions || []).length >= allViewIds.length) {
        // Nếu đã chọn nhiều rồi thì xóa hết
        setFormData({ ...formData, permissions: [] });
    } else {
        // Chọn tất cả (Full quyền)
        setFormData({ ...formData, permissions: allIds });
    }
  };

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
    const cleanData = {
        ...formData,
        role: formData.role || 'USER',
        permissions: formData.permissions || []
    };
    
    let result;
    if (editingUser) {
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
                <th className="px-6 py-4 border-b border-slate-100">Quyền hạn (Views)</th>
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
                               <Mail size={12}/> {user.email}
                           </div>
                       ) : <span className="text-slate-300 text-xs">-</span>}
                    </td>
                    <td className="px-6 py-4">
                        {user.department ? (
                           <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                               <Briefcase size={12}/> {user.department}
                           </div>
                       ) : <span className="text-slate-300 text-xs">-</span>}
                       {user.note && <div className="text-[10px] text-slate-400 mt-1 max-w-[150px] truncate" title={user.note}>{user.note}</div>}
                    </td>
                    <td className="px-6 py-4">
                        {user.role === 'ADMIN' ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                                <Crown size={12} /> Admin
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                <UserIcon size={12} /> User
                            </span>
                        )}
                    </td>
                    <td className="px-6 py-4">
                      {user.role === 'ADMIN' ? (
                          <span className="text-xs text-purple-600 italic">Full Access</span>
                      ) : (
                          <div className="flex flex-wrap gap-1">
                            {user.permissions
                              // Chỉ hiển thị các View ID chính để danh sách gọn gàng, Section con ẩn đi hoặc hiển thị tooltip nếu cần
                              .filter(p => APP_VIEWS.some(v => v.id === p))
                              .map(perm => (
                                <span key={perm} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] border border-slate-200">
                                    {APP_VIEWS.find(v => v.id === perm)?.label || perm}
                                </span>
                            ))}
                            {user.permissions.length > 5 && <span className="text-[10px] text-slate-400">...</span>}
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
                      onChange={e => setFormData({...formData, username: e.target.value})}
                      disabled={!!editingUser} 
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Mật khẩu {editingUser && '(để trống nếu không đổi)'} {!editingUser && <span className="text-red-500">*</span>}</label>
                    <input 
                      type="password" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Họ và Tên <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                      value={formData.fullName}
                      onChange={e => setFormData({...formData, fullName: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Vai trò</label>
                    <select 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                      value={formData.role}
                      onChange={e => setFormData({...formData, role: e.target.value as 'ADMIN' | 'USER'})}
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
                      onChange={e => setFormData({...formData, msnv: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Email (Để khôi phục MK)</label>
                    <input 
                      type="email" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                      value={formData.email || ''}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Phòng ban</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                      value={formData.department || ''}
                      onChange={e => setFormData({...formData, department: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-slate-500">Ghi chú</label>
                    <textarea 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none resize-none h-16 bg-white text-slate-900 placeholder-slate-400"
                      value={formData.note || ''}
                      onChange={e => setFormData({...formData, note: e.target.value})}
                    />
                  </div>

                  {/* Permissions Section - Only show if USER */}
                  <div className="md:col-span-2 mt-4 relative">
                      <div className="flex justify-between items-end border-b border-slate-100 pb-1 mb-2">
                         <div className="text-xs font-bold text-wood-600 uppercase">Phân quyền Truy cập View & Section</div>
                         {formData.role === 'USER' && (
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
                      {formData.role === 'ADMIN' && (
                          <div className="absolute inset-0 top-6 bg-white/80 z-10 flex items-center justify-center border border-purple-100 rounded-lg backdrop-blur-[1px]">
                              <div className="text-purple-600 font-bold flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-full shadow-sm">
                                  <Crown size={20} /> Tài khoản Admin có toàn quyền truy cập
                              </div>
                          </div>
                      )}

                      <div className={`grid grid-cols-2 gap-3 ${formData.role === 'ADMIN' ? 'opacity-30' : ''}`}>
                          {APP_VIEWS.map(view => {
                              const isViewSelected = (formData.permissions || []).includes(view.id);
                              const hasSections = VIEW_SECTIONS[view.id] && VIEW_SECTIONS[view.id].length > 0;

                              return (
                                  <div 
                                    key={view.id}
                                    className={`flex flex-col rounded-lg border transition-all ${isViewSelected ? 'bg-wood-50/50 border-wood-200' : 'bg-white border-slate-200'}`}
                                  >
                                      {/* Parent View Checkbox */}
                                      <div 
                                        onClick={() => formData.role === 'USER' && togglePermission(view.id)}
                                        className={`flex items-center gap-2 p-2 rounded-t-lg hover:bg-wood-50 cursor-pointer ${isViewSelected ? 'bg-wood-50' : ''}`}
                                      >
                                          {isViewSelected ? <CheckSquare size={18} className="text-wood-600 shrink-0" /> : <Square size={18} className="text-slate-300 shrink-0" />}
                                          <span className={`text-sm ${isViewSelected ? 'font-bold text-wood-800' : 'text-slate-600'}`}>{view.label}</span>
                                      </div>

                                      {/* Nested Sections */}
                                      {hasSections && isViewSelected && (
                                          <div className="px-2 pb-2 pt-1 border-t border-wood-100/50 space-y-1">
                                              {VIEW_SECTIONS[view.id].map(section => {
                                                  const isSectionSelected = (formData.permissions || []).includes(section.id);
                                                  return (
                                                      <div 
                                                        key={section.id}
                                                        onClick={() => formData.role === 'USER' && togglePermission(section.id)}
                                                        className="flex items-center gap-2 pl-6 py-1 cursor-pointer hover:bg-wood-100/50 rounded"
                                                      >
                                                          <CornerDownRight size={12} className="text-slate-400 shrink-0" />
                                                          {isSectionSelected ? <CheckSquare size={14} className="text-indigo-600 shrink-0" /> : <Square size={14} className="text-slate-300 shrink-0" />}
                                                          <span className={`text-xs ${isSectionSelected ? 'text-indigo-700 font-medium' : 'text-slate-500'}`}>{section.label}</span>
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

                  <div className="md:col-span-2 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.status === 'ACTIVE'} 
                            onChange={e => setFormData({...formData, status: e.target.checked ? 'ACTIVE' : 'INACTIVE'})}
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
