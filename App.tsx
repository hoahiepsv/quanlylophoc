
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Student, TeacherSchedule, ModelMode, TabType } from './types';
import { apiService } from './services/apiService';
import StudentForm from './components/StudentForm';
import Statistics from './components/Statistics';
import TeacherScheduleComponent from './components/TeacherSchedule';
import Attendance from './components/Attendance';

// Khai báo interface cho AI Studio API
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  // Trạng thái đăng nhập và cấu hình
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState({ username: '', password: '' });
  const [modelMode, setModelMode] = useState<ModelMode>(ModelMode.FLASH);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Kiểm tra API Key khi khởi chạy
  const checkApiKeyStatus = useCallback(async () => {
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(selected);
    }
  }, []);

  useEffect(() => {
    checkApiKeyStatus();
  }, [checkApiKeyStatus]);

  // Hàm mở trình chọn Key (Dùng để nhập Key mới cho trình duyệt này)
  const handleManageKey = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        // Sau khi mở dialog, giả định người dùng đã thao tác chọn key
        setHasApiKey(true);
      } catch (err) {
        console.error("Lỗi khi mở trình chọn key:", err);
      }
    } else {
      alert("Hệ thống quản lý Key không khả dụng trên trình duyệt này.");
    }
  };

  // State dữ liệu
  const [students, setStudents] = useState<Student[]>([]);
  const [teacherSchedules, setTeacherSchedules] = useState<TeacherSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [tempSelection, setTempSelection] = useState<string>('');
  const [selectedForEdit, setSelectedForEdit] = useState<Student | null>(null);

  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = dateStr.split(/[T ]/)[0];
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return clean;
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [studentData, teacherData] = await Promise.all([
        apiService.getStudents(),
        apiService.getTeacherSchedules()
      ]);
      setStudents(Array.isArray(studentData) ? studentData : []);
      setTeacherSchedules(Array.isArray(teacherData) ? teacherData : []);
    } catch (error: any) {
      console.error("Lỗi đồng bộ dữ liệu:", error);
      // Xử lý lỗi API Key cụ thể
      if (error.message && error.message.includes("Requested entity was not found")) {
        setHasApiKey(false);
        alert("API Key không hợp lệ hoặc đã hết hạn trên trình duyệt này. Vui lòng chọn lại khóa.");
      } else {
        alert(error.message || "Lỗi tải dữ liệu. Vui lòng kiểm tra kết nối.");
      }
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) loadData();
  }, [isLoggedIn, loadData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (user.username === 'lehoahiep' && user.password === 'Lhh249111') {
      setIsLoggedIn(true);
    } else {
      alert("Sai tài khoản hoặc mật khẩu!");
    }
  };

  const sortedStudents = useMemo(() => {
    if (!Array.isArray(students)) return [];
    return [...students].sort((a, b) => parseInt(String(a['KHỐI'] || '0')) - parseInt(String(b['KHỐI'] || '0')));
  }, [students]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900 p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.148l.83-4.742c.033-.183.158-.334.329-.403a7.488 7.488 0 003.32-3.209c.148-.249.12-.566-.079-.784l-2.968-3.273a.75.75 0 00-1.071.01l-2.734 3.125a.75.75 0 00.115 1.13l3.235 2.146c.191.127.285.357.234.581l-.634 2.801" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 uppercase tracking-tight">Hệ Thống Quản Lý</h1>
            <p className="text-gray-500 text-sm mt-1">Vui lòng đăng nhập để tiếp tục</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Tên đăng nhập</label>
              <input type="text" value={user.username} onChange={(e) => setUser({...user, username: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="lehoahiep" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Mật khẩu</label>
              <input type="password" value={user.password} onChange={(e) => setUser({...user, password: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••" />
            </div>
            <button className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95">ĐĂNG NHẬP NGAY</button>
          </form>
          <div className="mt-8 text-center text-[10px] text-gray-400 italic">Create by Hoà Hiệp AI – 0983.676.470</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-blue-800 text-white shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-inner">
               <span className="text-blue-800 font-black text-xl">HA</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight uppercase">QUẢN LÝ LỚP HỌC</h1>
              <p className="text-[10px] opacity-75">Sử dụng API Key linh hoạt cho mọi trình duyệt</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col items-end">
              <button
                onClick={handleManageKey}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all active:scale-95 shadow-md border ${
                  hasApiKey 
                  ? 'bg-emerald-500/10 border-emerald-400 text-emerald-100 hover:bg-emerald-500/20' 
                  : 'bg-amber-500/10 border-amber-400 text-amber-100 hover:bg-amber-500/20 animate-pulse'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-wider">
                  {hasApiKey ? 'API KEY: ĐÃ KẾT NỐI' : 'NHẬP API KEY'}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <span className="text-[8px] opacity-50 mt-1 uppercase font-bold">Dành cho trình duyệt này</span>
            </div>

            <div className="flex items-center bg-blue-900/50 rounded-full p-1 border border-blue-700">
              <button onClick={() => setModelMode(ModelMode.FLASH)} className={`px-4 py-1 rounded-full text-[10px] md:text-xs font-semibold transition-all ${modelMode === ModelMode.FLASH ? 'bg-white text-blue-800' : 'text-blue-200 hover:text-white'}`}>Flash</button>
              <button onClick={() => setModelMode(ModelMode.PRO)} className={`px-4 py-1 rounded-full text-[10px] md:text-xs font-semibold transition-all ${modelMode === ModelMode.PRO ? 'bg-white text-blue-800' : 'text-blue-200 hover:text-white'}`}>Pro</button>
            </div>
          </div>
        </div>

        <nav className="container mx-auto px-4 mt-2">
          <div className="flex overflow-x-auto gap-4 no-scrollbar">
            {[
              { id: 'list', label: 'Danh sách học sinh', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
              { id: 'attendance', label: 'Điểm danh', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
              { id: 'add', label: 'Thêm học sinh', icon: 'M12 4v16m8-8H4' },
              { id: 'update', label: 'Cập nhật thông tin', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
              { id: 'stats', label: 'Thống kê', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              { id: 'teacherSchedule', label: 'Lịch dạy giáo viên', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as TabType); if(tab.id !== 'update') { setSelectedForEdit(null); setTempSelection(''); } }}
                className={`flex items-center gap-2 px-4 py-3 border-b-4 font-bold text-sm transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-white bg-white/10 text-white' : 'border-transparent text-blue-200 hover:text-white hover:bg-white/5'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8">
        {loading && (
          <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-700 mb-4 shadow-xl"></div>
              <p className="text-blue-900 font-black animate-pulse uppercase tracking-widest text-xs">Đang xử lý dữ liệu...</p>
            </div>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="bg-white rounded-2xl shadow-xl border border-blue-50 overflow-hidden">
            <div className="p-6 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-blue-900 uppercase">Danh sách học sinh</h2>
              <div className="text-xs text-blue-600 font-black bg-white px-4 py-2 rounded-xl shadow-sm border border-blue-100 uppercase">
                Sĩ số: <span className="text-lg">{sortedStudents.length}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-[10px] md:text-xs uppercase font-black">
                  <tr>
                    <th className="px-6 py-4">HỌ TÊN HS</th>
                    <th className="px-6 py-4">KHỐI/LỚP</th>
                    <th className="px-6 py-4">SĐT LIÊN HỆ</th>
                    <th className="px-6 py-4">NGÀY BẮT ĐẦU</th>
                    <th className="px-6 py-4">HỌC PHÍ</th>
                    <th className="px-6 py-4 text-center">HÀNH ĐỘNG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {sortedStudents.map((student, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/40 transition-colors group">
                      <td className="px-6 py-5 font-bold text-gray-800 group-hover:text-blue-700 transition-colors">{student['HỌ TÊN HS']}</td>
                      <td className="px-6 py-5">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-lg text-[10px] font-black mr-2 uppercase">Lớp {student['KHỐI']}</span>
                        <span className="font-medium text-gray-600">{student['TÊN LỚP']}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-xs font-bold text-gray-700">{student['SỐ ĐIỆN THOẠI 1']}</div>
                        <div className="text-[10px] text-gray-400 font-medium">{student['SỐ ĐIỆN THOẠI 2'] || 'Không có'}</div>
                      </td>
                      <td className="px-6 py-5 text-xs font-mono font-bold text-gray-500">{formatDateVN(student['NGÀY BẮT ĐẦU'])}</td>
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-1">
                          {(student['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(f => f).map(f => (
                            <span key={f} className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 font-black uppercase tracking-tighter">{f}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <button onClick={() => { setTempSelection(student['HỌ TÊN HS']); setSelectedForEdit(student); setActiveTab('update'); }} className="bg-blue-600 text-white hover:bg-blue-700 px-5 py-2 rounded-xl text-xs font-black transition-all shadow-md active:scale-95">SỬA</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'attendance' && <Attendance students={students} onRefresh={loadData} />}
        {activeTab === 'add' && <div className="max-w-5xl mx-auto"><StudentForm title="Ghi danh học sinh mới" onSubmit={async (data) => { setLoading(true); try { await apiService.saveStudent('addData', data); alert("Đã thêm thành công!"); await loadData(); setActiveTab('list'); } catch (e: any) { alert(e.message); } finally { setLoading(false); } }} teacherSchedules={teacherSchedules} /></div>}
        {activeTab === 'update' && (
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-50">
               <h3 className="font-black text-blue-900 mb-6 flex items-center gap-3"><div className="p-2 bg-blue-100 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>TRÌNH QUẢN LÝ CẬP NHẬT</h3>
               <div className="flex flex-col md:flex-row gap-4">
                 <select className="flex-grow p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold text-gray-700" onChange={(e) => { setTempSelection(e.target.value); setSelectedForEdit(null); }} value={tempSelection}>
                    <option value="">-- Chọn học sinh cần chỉnh sửa --</option>
                    {sortedStudents.map((s, idx) => <option key={idx} value={s['HỌ TÊN HS']}>{s['HỌ TÊN HS']} (Lớp {s['KHỐI']})</option>)}
                 </select>
                 <button onClick={() => { const student = students.find(s => s['HỌ TÊN HS'] === tempSelection); if(student) setSelectedForEdit(student); else alert("Vui lòng chọn học sinh hợp lệ!"); }} disabled={!tempSelection} className={`px-8 py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${tempSelection ? 'bg-blue-700 text-white hover:bg-blue-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>MỞ BIỂU MẪU CẬP NHẬT</button>
               </div>
            </div>
            {selectedForEdit && <div className="animate-slideUp"><StudentForm title={`Hiệu chỉnh: ${selectedForEdit['HỌ TÊN HS']}`} initialData={selectedForEdit} onSubmit={async (data) => { if (!selectedForEdit?.rowIndex) return; setLoading(true); try { await apiService.saveStudent('updateData', data, selectedForEdit.rowIndex); alert("Cập nhật thành công!"); await loadData(); setActiveTab('list'); setSelectedForEdit(null); setTempSelection(''); } catch (e: any) { alert(e.message); } finally { setLoading(false); } }} teacherSchedules={teacherSchedules} /></div>}
          </div>
        )}
        {activeTab === 'stats' && <Statistics students={sortedStudents} />}
        {activeTab === 'teacherSchedule' && <TeacherScheduleComponent />}
      </main>

      <footer className="bg-white border-t border-gray-100 py-10 mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-blue-800 rounded-xl flex items-center justify-center shadow-lg"><span className="text-white font-black text-lg">HA</span></div>
             <div><span className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] block">Hệ Thống Quản Lý</span><span className="text-sm text-blue-900 font-black">HOÀ HIỆP AI © 2024</span></div>
          </div>
          <div className="text-xs md:text-sm font-black text-gray-400 italic">Zalo hỗ trợ kỹ thuật: <span className="text-blue-600">0983.676.470</span></div>
        </div>
      </footer>
    </div>
  );
};

export default App;
