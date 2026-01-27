
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Student, TeacherSchedule, ModelMode, TabType } from './types';
import { apiService } from './services/apiService';
import StudentForm from './components/StudentForm';
import Statistics from './components/Statistics';
import TeacherScheduleComponent from './components/TeacherSchedule';
import Attendance from './components/Attendance';

const App: React.FC = () => {
  // Authentication & Settings
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState({ username: '', password: '' });
  const [modelMode, setModelMode] = useState<ModelMode>(ModelMode.FLASH);
  const [showSettings, setShowSettings] = useState(false);
  
  // API Key State (Manual insertion for cross-browser support)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('GEMINI_API_KEY') || '');

  // Data State
  const [students, setStudents] = useState<Student[]>([]);
  const [teacherSchedules, setTeacherSchedules] = useState<TeacherSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [tempSelection, setTempSelection] = useState<string>('');
  const [selectedForEdit, setSelectedForEdit] = useState<Student | null>(null);

  // Filter State for List Tab
  const [listFilterGrade, setListFilterGrade] = useState<string>('');

  // Sync API Key to global process.env for Gemini SDK
  useEffect(() => {
    const win = window as any;
    if (!win.process) win.process = { env: {} };
    if (apiKey) {
      win.process.env.API_KEY = apiKey;
    }
  }, [apiKey]);

  const handleSaveApiKey = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
    alert("Đã lưu API Key vào trình duyệt!");
    setShowSettings(false);
  };

  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = dateStr.split(/[T ]/)[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return clean;
  };

  const calculateStudentStats = (student: Student) => {
    const schedule = (student['LỊCH HỌC'] || '').split(' ').filter(d => d);
    const absences = (student['ĐIỂM DANH HS'] || '').split(' ').filter(d => d);
    const nowStr = new Date().toISOString().split('T')[0];
    
    const attended = schedule.filter(d => d <= nowStr && !absences.includes(d)).length;
    const vắng = absences.length;
    
    return { attended, vắng };
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
      alert(error.message || "Lỗi tải dữ liệu. Vui lòng kiểm tra Apps Script.");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      loadData();
    }
  }, [isLoggedIn, loadData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (user.username === 'lehoahiep' && user.password === 'Lhh249111') {
      setIsLoggedIn(true);
    } else {
      alert("Sai tài khoản hoặc mật khẩu!");
    }
  };

  const handleAddStudent = async (data: Partial<Student>) => {
    setLoading(true);
    try {
      await apiService.saveStudent('addData', data);
      alert("Đã thêm học sinh thành công!");
      await loadData();
      setActiveTab('list');
    } catch (error: any) {
      alert("Không thể thêm: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStudent = async (data: Partial<Student>) => {
    if (!selectedForEdit?.rowIndex) return;
    setLoading(true);
    try {
      await apiService.saveStudent('updateData', data, selectedForEdit.rowIndex);
      alert("Cập nhật thông tin thành công!");
      await loadData();
      setActiveTab('list');
      setSelectedForEdit(null);
      setTempSelection('');
    } catch (error: any) {
      alert("Lỗi cập nhật: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Memoized lists and stats
  const sortedStudents = useMemo(() => {
    if (!Array.isArray(students)) return [];
    return [...students].sort((a, b) => {
      const kA = parseInt(String(a['KHỐI'] || '0'));
      const kB = parseInt(String(b['KHỐI'] || '0'));
      return kA - kB;
    });
  }, [students]);

  const filteredStudents = useMemo(() => {
    if (!listFilterGrade) return sortedStudents;
    return sortedStudents.filter(s => String(s['KHỐI']) === listFilterGrade);
  }, [sortedStudents, listFilterGrade]);

  const gradeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    students.forEach(s => {
      const k = String(s['KHỐI']);
      if (k && k !== 'undefined' && k !== 'null') {
        counts[k] = (counts[k] || 0) + 1;
      }
    });
    return counts;
  }, [students]);

  // Lấy danh sách các nhóm thực tế có học sinh
  const activeGrades = useMemo(() => {
    return Object.keys(gradeCounts).sort((a, b) => parseInt(a) - parseInt(b));
  }, [gradeCounts]);

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
            <p className="text-gray-500 text-sm mt-1">Vui lòng đăng nhập để quản lý lớp học</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Tên đăng nhập</label>
              <input 
                type="text" 
                value={user.username}
                onChange={(e) => setUser({...user, username: e.target.value})}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                placeholder="lehoahiep"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Mật khẩu</label>
              <input 
                type="password" 
                value={user.password}
                onChange={(e) => setUser({...user, password: e.target.value})}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                placeholder="••••••••"
              />
            </div>
            <button className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg active:scale-95">
              ĐĂNG NHẬP NGAY
            </button>
          </form>
          <div className="mt-8 text-center text-[10px] text-gray-400 italic">
            Create by Hoà Hiệp - 0983.676.470
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-blue-800 text-white shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-inner">
               <span className="text-blue-800 font-black text-lg">HA</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight uppercase leading-none">QUẢN LÝ LỚP HỌC</h1>
              <p className="text-[9px] opacity-75 mt-0.5">Create by Hoà Hiệp - 0983.676.470</p>
            </div>
          </div>

          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2.5 rounded-xl transition-all flex items-center gap-2 border ${showSettings ? 'bg-white text-blue-800 border-white' : 'bg-blue-900/50 text-white border-blue-700 hover:bg-blue-700'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-500 ${showSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Cấu hình</span>
          </button>
        </div>

        {/* Collapsible Settings Area */}
        <div className={`overflow-hidden transition-all duration-500 ease-in-out bg-blue-900/40 border-t border-blue-700/30 ${showSettings ? 'max-h-40 opacity-100 py-4' : 'max-h-0 opacity-0 py-0'}`}>
          <div className="container mx-auto px-4 flex flex-wrap items-center justify-center gap-6">
            <div className="flex items-center gap-3 bg-blue-950/50 p-2.5 rounded-2xl border border-blue-700/50 shadow-inner">
               <input 
                 type="password"
                 placeholder="Dán API Key vào đây..."
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 className="bg-blue-800/50 text-white text-[11px] px-4 py-2.5 rounded-xl border border-blue-600 outline-none w-64 focus:ring-1 focus:ring-blue-400 font-mono"
               />
               <button 
                  onClick={handleSaveApiKey}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black px-5 py-3 rounded-xl transition-all shadow-lg active:scale-95 uppercase"
                >
                  LƯU KEY
                </button>
            </div>

            <div className="flex items-center bg-blue-950/50 rounded-2xl p-1.5 border border-blue-700 shadow-inner">
              <span className="text-[9px] font-black uppercase text-blue-300 px-3 tracking-widest">Model:</span>
              <button 
                onClick={() => setModelMode(ModelMode.FLASH)}
                className={`px-5 py-2 rounded-xl text-[10px] font-bold transition-all ${modelMode === ModelMode.FLASH ? 'bg-white text-blue-800 shadow-md' : 'text-blue-200 hover:text-white'}`}
              >
                Flash
              </button>
              <button 
                onClick={() => setModelMode(ModelMode.PRO)}
                className={`px-5 py-2 rounded-xl text-[10px] font-bold transition-all ${modelMode === ModelMode.PRO ? 'bg-white text-blue-800 shadow-md' : 'text-blue-200 hover:text-white'}`}
              >
                Pro
              </button>
            </div>
          </div>
        </div>

        <nav className="container mx-auto px-4">
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
                onClick={() => {
                  setActiveTab(tab.id as TabType);
                  if(tab.id !== 'update') {
                    setSelectedForEdit(null);
                    setTempSelection('');
                  }
                }}
                className={`flex items-center gap-2 px-4 py-3 border-b-4 font-bold text-xs transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                  ? 'border-white bg-white/10 text-white' 
                  : 'border-transparent text-blue-200 hover:text-white hover:bg-white/5'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <div className="p-6 bg-blue-50 border-b border-blue-100 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-black text-blue-900 uppercase">Danh sách học sinh</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button 
                    onClick={() => setListFilterGrade('')}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${listFilterGrade === '' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700 hover:bg-blue-100'}`}
                  >
                    Tất cả
                  </button>
                  {activeGrades.map((grade) => (
                    <button 
                      key={grade}
                      onClick={() => setListFilterGrade(grade)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${listFilterGrade === grade ? 'bg-blue-700 text-white' : 'bg-white text-blue-700 hover:bg-blue-100'}`}
                    >
                      Nhóm {grade}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                   <div className="text-[9px] text-blue-400 font-black uppercase tracking-wider">Thống kê sĩ số</div>
                   <div className="flex gap-2 mt-1">
                      <div className="bg-white border border-blue-200 px-4 py-2 rounded-xl shadow-sm text-center">
                        <span className="text-[10px] block text-blue-400 font-black uppercase">Tổng</span>
                        <span className="text-lg font-black text-blue-900 leading-none">{students.length}</span>
                      </div>
                      {listFilterGrade && (
                        <div className="bg-blue-700 px-4 py-2 rounded-xl shadow-lg text-center border-b-2 border-blue-900">
                          <span className="text-[10px] block text-blue-200 font-black uppercase">Nhóm {listFilterGrade}</span>
                          <span className="text-lg font-black text-white leading-none">{gradeCounts[listFilterGrade] || 0}</span>
                        </div>
                      )}
                   </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-[10px] md:text-xs uppercase font-black">
                  <tr>
                    <th className="px-6 py-4">HỌ TÊN HS</th>
                    <th className="px-6 py-4">NHÓM/LỚP</th>
                    <th className="px-6 py-4">SĐT LIÊN HỆ</th>
                    <th className="px-6 py-4">NGÀY BẮT ĐẦU</th>
                    <th className="px-6 py-4">ĐÃ HỌC</th>
                    <th className="px-6 py-4">VẮNG</th>
                    <th className="px-6 py-4">HỌC PHÍ</th>
                    <th className="px-6 py-4 text-center">HÀNH ĐỘNG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredStudents.map((student, idx) => {
                    const stats = calculateStudentStats(student);
                    return (
                      <tr key={idx} className="hover:bg-blue-50/40 transition-colors group">
                        <td className="px-6 py-5 font-bold text-gray-800 group-hover:text-blue-700 transition-colors">{student['HỌ TÊN HS']}</td>
                        <td className="px-6 py-5">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-lg text-[10px] font-black mr-2 uppercase">Nhóm {student['KHỐI']}</span>
                          <span className="font-medium text-gray-600">{student['TÊN LỚP']}</span>
                        </td>
                        <td className="px-6 py-5">
                          <a 
                            href={`tel:${student['SỐ ĐIỆN THOẠI 1']}`} 
                            className="block text-xs font-bold text-blue-700 hover:underline hover:text-blue-800 transition-all"
                          >
                            {student['SỐ ĐIỆN THOẠI 1']}
                          </a>
                          {student['SỐ ĐIỆN THOẠI 2'] && (
                            <a 
                              href={`tel:${student['SỐ ĐIỆN THOẠI 2']}`} 
                              className="block text-[10px] text-gray-400 font-medium hover:underline hover:text-blue-600 transition-all mt-1"
                            >
                              {student['SỐ ĐIỆN THOẠI 2']}
                            </a>
                          )}
                          {!student['SỐ ĐIỆN THOẠI 2'] && (
                            <div className="text-[10px] text-gray-300 italic mt-1">Không có SĐT 2</div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-xs font-mono font-bold text-gray-500">{formatDateVN(student['NGÀY BẮT ĐẦU'])}</td>
                        <td className="px-6 py-5">
                          <span className="text-emerald-600 font-black text-xs">{stats.attended} buổi</span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-red-500 font-black text-xs">{stats.vắng} buổi</span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-wrap gap-1">
                            {(student['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(f => f).map(f => (
                              <span key={f} className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 font-black uppercase tracking-tighter">{f}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <button 
                            onClick={() => { 
                              setTempSelection(student['HỌ TÊN HS']);
                              setSelectedForEdit(student); 
                              setActiveTab('update'); 
                            }}
                            className="bg-blue-600 text-white hover:bg-blue-700 px-5 py-2 rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
                          >
                            SỬA
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStudents.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="px-6 py-32 text-center">
                        <div className="flex flex-col items-center opacity-20">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          <p className="text-xl font-black uppercase">Không có dữ liệu nhóm này</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <Attendance students={students} onRefresh={loadData} />
        )}

        {activeTab === 'add' && (
          <div className="max-w-5xl mx-auto">
            <StudentForm 
              title="Ghi danh học sinh mới" 
              onSubmit={handleAddStudent}
              teacherSchedules={teacherSchedules}
            />
          </div>
        )}

        {activeTab === 'update' && (
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-50">
               <h3 className="font-black text-blue-900 mb-6 flex items-center gap-3">
                 <div className="p-2 bg-blue-100 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                 </div>
                 TRÌNH QUẢN LÝ CẬP NHẬT
               </h3>
               <div className="flex flex-col md:flex-row gap-4">
                 <select 
                    className="flex-grow p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold text-gray-700"
                    onChange={(e) => {
                      setTempSelection(e.target.value);
                      setSelectedForEdit(null); // Reset form visibility
                    }}
                    value={tempSelection}
                 >
                    <option value="">-- Chọn học sinh cần chỉnh sửa --</option>
                    {sortedStudents.map((s, idx) => (
                      <option key={idx} value={s['HỌ TÊN HS']}>
                        {s['HỌ TÊN HS']} (Nhóm {s['KHỐI']} - Lớp {s['TÊN LỚP']})
                      </option>
                    ))}
                 </select>
                 <button
                  onClick={() => {
                    const student = students.find(s => s['HỌ TÊN HS'] === tempSelection);
                    if(student) setSelectedForEdit(student);
                    else alert("Vui lòng chọn học sinh hợp lệ!");
                  }}
                  disabled={!tempSelection}
                  className={`px-8 py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    tempSelection 
                    ? 'bg-blue-700 text-white hover:bg-blue-800' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                 >
                   MỞ BIỂU MẪU CẬP NHẬT
                 </button>
               </div>
            </div>

            {selectedForEdit && (
              <div className="animate-slideUp">
                <StudentForm 
                  title={`Hiệu chỉnh: ${selectedForEdit['HỌ TÊN HS']}`} 
                  initialData={selectedForEdit}
                  onSubmit={handleUpdateStudent}
                  teacherSchedules={teacherSchedules}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <Statistics students={sortedStudents} />
        )}

        {activeTab === 'teacherSchedule' && (
          <TeacherScheduleComponent />
        )}
      </main>

      <footer className="bg-white border-t border-gray-100 py-10 mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-blue-800 rounded-xl flex items-center justify-center shadow-lg">
               <span className="text-white font-black text-lg">HA</span>
             </div>
             <div>
              <span className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] block">Hệ Thống Quản Lý</span>
              <span className="text-sm text-blue-900 font-black">LÊ HOÀ HIỆP © 2024</span>
             </div>
          </div>
          <div className="text-xs md:text-sm font-black text-gray-400 italic">
            Create by Hoà Hiệp - 0983.676.470
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
