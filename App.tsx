
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Student, TeacherSchedule, ModelMode, TabType } from './types';
import { apiService } from './services/apiService';
import StudentForm from './components/StudentForm';
import Statistics from './components/Statistics';
import TeacherScheduleComponent from './components/TeacherSchedule';
import Attendance from './components/Attendance';
import TuitionManagement from './components/TuitionManagement';
import StudentReportModal from './components/StudentReportModal';
import { ExternalLink, Search, X, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { removeVietnameseTones, normalizeSearchText, matchStudentSearch } from './utils';

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
  const [selectedStudentForReport, setSelectedStudentForReport] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter State for List Tab
  const [listFilterGrade, setListFilterGrade] = useState<string>('');
  const [listSearchTerm, setListSearchTerm] = useState<string>('');

  // Filter State for Update Tab
  const [updateSearchTerm, setUpdateSearchTerm] = useState('');
  const [updateFilterGrade, setUpdateFilterGrade] = useState('');

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
    
    const attended = schedule.filter(d => d <= nowStr).length;
    const vắng = absences.length;
    const expected = schedule.length;
    const endDate = schedule.length > 0 ? schedule[schedule.length - 1] : '';
    const isFinished = endDate && new Date().toISOString().split('T')[0] > endDate;
    
    return { attended, vắng, expected, endDate, isFinished };
  };

  const getRequiredMonths = (startDateStr: string, endDateStr?: string) => {
    if (!startDateStr) return [];
    const clean = startDateStr.split(/[T ]/)[0];
    const parts = clean.split('-');
    if (parts.length < 3) return [];
    
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const start = new Date(year, month - 1, 1);
    
    const required: string[] = [];
    let curr = new Date(start.getFullYear(), start.getMonth(), 1);
    
    const today = new Date();
    const targetDate = new Date(today.getFullYear(), today.getMonth(), 1);
    let finalTarget = targetDate;
    
    if (endDateStr) {
      const endParts = endDateStr.split('-');
      if (endParts.length === 3) {
        const endMonthDate = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, 1);
        if (endMonthDate < targetDate) {
          finalTarget = endMonthDate;
        }
      }
    }

    while (curr <= finalTarget) {
      required.push(`T${curr.getMonth() + 1}/${curr.getFullYear()}`);
      curr.setMonth(curr.getMonth() + 1);
    }
    return required;
  };

  const getGradeColor = (grade: string | number) => {
    const gradeStr = String(grade).trim();
    if (gradeStr === 'Đã thôi học') return 'bg-gray-100 text-gray-600 border-gray-200';
    
    const colors = [
      'bg-blue-100 text-blue-800 border-blue-200',
      'bg-emerald-100 text-emerald-800 border-emerald-200',
      'bg-purple-100 text-purple-800 border-purple-200',
      'bg-amber-100 text-amber-800 border-amber-200',
      'bg-rose-100 text-rose-800 border-rose-200',
      'bg-cyan-100 text-cyan-800 border-cyan-200',
      'bg-indigo-100 text-indigo-800 border-indigo-200',
      'bg-orange-100 text-orange-800 border-orange-200',
      'bg-lime-100 text-lime-800 border-lime-200',
      'bg-teal-100 text-teal-800 border-teal-200',
    ];
    
    // Use a simple hash to pick a color based on the grade string
    let hash = 0;
    for (let i = 0; i < gradeStr.length; i++) {
        hash = gradeStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [studentData, teacherData] = await Promise.all([
        apiService.getStudents(),
        apiService.getTeacherSchedules()
      ]);
      // Lọc bỏ các dòng trống (đã bị xóa bỏ nội dung ô) trên datasheet
      const cleanStudents = (Array.isArray(studentData) ? studentData : []).filter(
        s => s && String(s['HỌ TÊN HS'] || '').trim() !== ''
      );
      setStudents(cleanStudents);
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

  // Xác nhận xóa toàn bộ thông tin học sinh và để trống ô trên Datasheet
  const handleConfirmDelete = async () => {
    if (!studentToDelete?.rowIndex) {
      alert("Không tìm thấy vị trí dòng (rowIndex) của học sinh để xóa trên Datasheet!");
      setStudentToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      const studentName = studentToDelete['HỌ TÊN HS'] || 'học sinh';
      await apiService.clearStudent(studentToDelete.rowIndex, studentToDelete);
      alert(`Đã xóa toàn bộ thông tin của học sinh "${studentName}" và để trống các ô trên Datasheet thành công!`);
      
      setStudentToDelete(null);
      setSelectedForEdit(null);
      setTempSelection('');
      await loadData();
      setActiveTab('list');
    } catch (error: any) {
      console.error("Lỗi xóa học sinh:", error);
      alert("Lỗi khi xóa học sinh trên Datasheet: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteStudentRequest = (studentData?: Partial<Student>) => {
    if (studentData) {
      const fullStudent = students.find(s => 
        (studentData.rowIndex && s.rowIndex === studentData.rowIndex) ||
        (studentData['HỌ TÊN HS'] && s['HỌ TÊN HS'] === studentData['HỌ TÊN HS'])
      ) || (studentData as Student);
      setStudentToDelete(fullStudent);
      return;
    }

    if (selectedForEdit) {
      setStudentToDelete(selectedForEdit);
      return;
    }

    if (tempSelection) {
      const student = students.find(s => s['HỌ TÊN HS'] === tempSelection);
      if (student) {
        setStudentToDelete(student);
      } else {
        alert("Vui lòng chọn học sinh hợp lệ!");
      }
    }
  };

  // Sắp xếp danh sách học sinh theo Nhóm/khối và Tên (chữ cuối)
  const sortedStudents = useMemo(() => {
    if (!Array.isArray(students)) return [];
    return [...students].sort((a, b) => {
      const gradeA = String(a['KHỐI'] || '').trim();
      const gradeB = String(b['KHỐI'] || '').trim();
      
      const numA = parseInt(gradeA);
      const numB = parseInt(gradeB);

      // 1. Sắp xếp theo Nhóm/Khối
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      } else if (!isNaN(numA)) {
        return -1;
      } else if (!isNaN(numB)) {
        return 1;
      } else {
        if (gradeA !== gradeB) {
          // "Đã thôi học" luôn ở cuối cùng
          if (gradeA === 'Đã thôi học') return 1;
          if (gradeB === 'Đã thôi học') return -1;
          return gradeA.localeCompare(gradeB, 'vi');
        }
      }

      // 2. Nếu cùng nhóm, sắp xếp theo Tên (chữ cuối cùng của họ tên)
      const nameA = (a['HỌ TÊN HS'] || '').trim();
      const nameB = (b['HỌ TÊN HS'] || '').trim();
      
      const partsA = nameA.split(' ').filter(p => p);
      const partsB = nameB.split(' ').filter(p => p);
      
      const lastA = partsA[partsA.length - 1] || '';
      const lastB = partsB[partsB.length - 1] || '';

      const cmpLast = lastA.localeCompare(lastB, 'vi');
      if (cmpLast !== 0) return cmpLast;
      
      // Nếu tên giống nhau, so sánh toàn bộ họ tên
      return nameA.localeCompare(nameB, 'vi');
    });
  }, [students]);

  const filteredStudents = useMemo(() => {
    return sortedStudents.filter(s => {
      // Lọc theo nhóm nếu có chọn
      const matchGrade = !listFilterGrade || String(s['KHỐI']) === listFilterGrade;
      if (!matchGrade) return false;

      // Tìm kiếm không phân biệt hoa/thường, không phân biệt có dấu tiếng Việt (tên, sđt, lớp, nhóm)
      return matchStudentSearch(s, listSearchTerm);
    });
  }, [sortedStudents, listFilterGrade, listSearchTerm]);

  const filteredForUpdate = useMemo(() => {
    return sortedStudents.filter(s => {
      const matchGrade = !updateFilterGrade || String(s['KHỐI']) === updateFilterGrade;
      if (!matchGrade) return false;

      return matchStudentSearch(s, updateSearchTerm);
    });
  }, [sortedStudents, updateFilterGrade, updateSearchTerm]);

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
    return Object.keys(gradeCounts).sort((a, b) => {
      const nA = parseInt(a);
      const nB = parseInt(b);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      if (!isNaN(nA)) return -1;
      if (!isNaN(nB)) return 1;
      if (a === 'Đã thôi học') return 1;
      if (b === 'Đã thôi học') return -1;
      return a.localeCompare(b, 'vi');
    });
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
              { id: 'tuition', label: 'Học phí', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
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
            <div className="p-5 sm:p-6 bg-blue-50 border-b border-blue-100 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-xl font-black text-blue-900 uppercase tracking-tight flex items-center gap-2.5">
                    <span className="w-2.5 h-6 bg-blue-700 rounded-full inline-block"></span>
                    Danh sách học sinh
                  </h2>
                  <p className="text-xs text-blue-700 font-bold mt-1">
                    Đang hiển thị <span className="text-blue-900 font-black">{filteredStudents.length}</span> / {students.length} học sinh
                    {listSearchTerm && (
                      <span className="ml-2 inline-flex items-center gap-1 text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                        Khớp với: "{listSearchTerm}"
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto">
                  <div className="bg-white border border-blue-200 px-3.5 py-1.5 rounded-xl shadow-xs text-center min-w-[70px]">
                    <span className="text-[9px] block text-blue-500 font-black uppercase">Tổng HS</span>
                    <span className="text-base font-black text-blue-900 leading-none">{students.length}</span>
                  </div>
                  {listFilterGrade && (
                    <div className="bg-blue-700 px-3.5 py-1.5 rounded-xl shadow-sm text-center border-b-2 border-blue-900 min-w-[80px]">
                      <span className="text-[9px] block text-blue-200 font-black uppercase">{String(listFilterGrade).startsWith('Nhóm') ? listFilterGrade : `Nhóm ${listFilterGrade}`}</span>
                      <span className="text-base font-black text-white leading-none">{gradeCounts[listFilterGrade] || 0}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thanh tìm kiếm & bộ lọc nhóm */}
              <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between pt-1">
                {/* Ô TÌM KIẾM HỌC SINH (KHÔNG PHÂN BIỆT HOA/THƯỜNG, DẤU TIẾNG VIỆT) */}
                <div className="relative flex-grow max-w-xl">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-blue-600">
                    <Search className="h-4 w-4" />
                  </span>
                  <input 
                    type="text"
                    placeholder="Tìm theo tên học sinh, SĐT, nhóm, lớp (gõ có dấu hoặc không dấu)..."
                    value={listSearchTerm}
                    onChange={(e) => setListSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-9 py-2.5 bg-white border-2 border-blue-200/90 hover:border-blue-400 focus:border-blue-600 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-xs sm:text-sm font-bold text-gray-800 shadow-xs placeholder:text-gray-400 placeholder:font-normal transition-all"
                  />
                  {listSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setListSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-700 cursor-pointer"
                      title="Xoá từ khoá tìm kiếm"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Danh sách nút chọn nhóm */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button 
                    onClick={() => setListFilterGrade('')}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-xs cursor-pointer ${listFilterGrade === '' ? 'bg-blue-700 text-white shadow-sm' : 'bg-white text-blue-700 hover:bg-blue-100 border border-blue-200/60'}`}
                  >
                    Tất cả
                  </button>
                  {activeGrades.map((grade) => (
                    <button 
                      key={grade}
                      onClick={() => setListFilterGrade(grade)}
                      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-xs cursor-pointer ${listFilterGrade === grade ? 'bg-blue-700 text-white shadow-sm' : 'bg-white text-blue-700 hover:bg-blue-100 border border-blue-200/60'}`}
                    >
                      {String(grade).startsWith('Nhóm') ? grade : `Nhóm ${grade}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-[10px] md:text-xs uppercase font-black">
                  <tr>
                    <th className="px-6 py-4">HỌ TÊN HS</th>
                    <th className="px-6 py-4">NHÓM/LỚP</th>
                    <th className="px-6 py-4">SĐT</th>
                    <th className="px-6 py-4">NGÀY BĐ</th>
                    <th className="px-6 py-4 text-center">NGÀY KT</th>
                    <th className="px-6 py-4 text-center">DỰ KIẾN</th>
                    <th className="px-6 py-4 text-center">ĐÃ DẠY</th>
                    <th className="px-6 py-4 text-center">VẮNG</th>
                    <th className="px-6 py-4 text-right">HỌC PHÍ</th>
                    <th className="px-6 py-4 text-center">HÀNH ĐỘNG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredStudents.map((student, idx) => {
                    const stats = calculateStudentStats(student);
                    return (
                      <tr key={idx} className="hover:bg-blue-50/40 transition-colors group">
                        <td 
                          className="px-6 py-5 font-bold text-gray-800 group-hover:text-blue-700 transition-colors cursor-pointer hover:bg-blue-50 rounded-lg"
                          onClick={() => setSelectedStudentForReport(student)}
                        >
                          <div className="flex items-center gap-2">
                             <span>{student['HỌ TÊN HS']}</span>
                             <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-black mr-2 uppercase border ${getGradeColor(student['KHỐI'])}`}>
                            {String(student['KHỐI']).startsWith('Nhóm') ? student['KHỐI'] : `Nhóm ${student['KHỐI']}`}
                          </span>
                          <span className="font-medium text-gray-600">{student['TÊN LỚP']}</span>
                        </td>
                        <td className="px-6 py-5">
                          <a 
                            href={`tel:${student['SỐ ĐIỆN THOẠI 1']}`} 
                            className="block text-xs font-bold text-blue-700 hover:underline hover:text-blue-800 transition-all"
                          >
                            {student['SỐ ĐIỆN THOẠI 1']}
                          </a>
                        </td>
                        <td className="px-6 py-5 text-xs font-mono font-bold text-gray-500">{formatDateVN(student['NGÀY BẮT ĐẦU'])}</td>
                        <td className="px-6 py-5 text-xs font-mono font-bold text-gray-400 text-center">{formatDateVN(stats.endDate)}</td>
                        <td className="px-6 py-5 text-center">
                          <span className="text-blue-900 font-black text-xs">{stats.expected}</span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="text-emerald-600 font-black text-xs">{stats.attended}</span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="text-red-500 font-black text-xs">{stats.vắng}</span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex flex-wrap gap-1 justify-end">
                              {(student['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(f => f).map(f => (
                                <span key={f} className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 font-black uppercase tracking-tighter">{f}</span>
                              ))}
                            </div>
                            {(() => {
                              const fees = (student['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(f => f);
                              const required = getRequiredMonths(student['NGÀY BẮT ĐẦU'], stats.endDate);
                              const unpaid = required.filter(m => !fees.includes(m));
                              
                              if (unpaid.length > 0) {
                                return (
                                  <div className="flex flex-wrap gap-1 justify-end mt-1">
                                    {unpaid.map(m => (
                                      <span key={m} className="text-[9px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-100 font-black uppercase tracking-tighter shadow-sm">Nợ {m}</span>
                                    ))}
                                  </div>
                                );
                              } else if (stats.isFinished) {
                                return (
                                  <span className="text-[9px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200 font-black uppercase tracking-tighter mt-1 shadow-sm">Đã kết thúc</span>
                                );
                              }
                              return null;
                            })()}
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
                      <td colSpan={10} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
                          <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                            <Search className="w-7 h-7" />
                          </div>
                          <p className="text-base font-black text-gray-800 uppercase">
                            {listSearchTerm 
                              ? `Không tìm thấy học sinh nào khớp với "${listSearchTerm}"` 
                              : (listFilterGrade ? `Không có học sinh trong ${String(listFilterGrade).startsWith('Nhóm') ? listFilterGrade : `Nhóm ${listFilterGrade}`}` : 'Chưa có dữ liệu học sinh')}
                          </p>
                          <p className="text-xs text-gray-500 max-w-sm">
                            {listSearchTerm 
                              ? 'Hệ thống tìm kiếm không phân biệt chữ hoa/thường và không phân biệt dấu tiếng Việt. Bạn có thể gõ "hiep" để tìm "Hiệp".' 
                              : 'Vui lòng chọn nhóm khác hoặc kiểm tra lại kết nối dữ liệu.'}
                          </p>
                          {(listSearchTerm || listFilterGrade) && (
                            <button
                              type="button"
                              onClick={() => {
                                setListSearchTerm('');
                                setListFilterGrade('');
                              }}
                              className="mt-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                            >
                              Xoá bộ lọc tìm kiếm
                            </button>
                          )}
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

        {activeTab === 'tuition' && (
          <TuitionManagement students={students} onRefresh={loadData} />
        )}

        {activeTab === 'add' && (
          <div className="max-w-5xl mx-auto">
            <StudentForm 
              title="Ghi danh học sinh mới" 
              onSubmit={handleAddStudent}
              teacherSchedules={teacherSchedules}
              existingGroups={activeGrades}
              students={students}
            />
          </div>
        )}

        {activeTab === 'update' && (
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-50">
               <h3 className="font-black text-blue-900 mb-6 flex items-center gap-3 uppercase tracking-tight">
                 <div className="p-2 bg-blue-100 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                 </div>
                 TRÌNH QUẢN LÝ CẬP NHẬT
               </h3>
               
               {/* Search and Filters for Update Tab */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                 <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                      <Search className="h-4 w-4" />
                    </span>
                    <input 
                      type="text"
                      placeholder="Tìm theo tên học sinh, SĐT, nhóm, lớp (có hoặc không dấu)..."
                      value={updateSearchTerm}
                      onChange={(e) => setUpdateSearchTerm(e.target.value)}
                      className="w-full pl-11 pr-10 py-4 border border-gray-100 bg-slate-50/50 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold text-sm text-gray-700 transition-all"
                    />
                    {updateSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setUpdateSearchTerm('')}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-700 cursor-pointer"
                        title="Xoá tìm kiếm"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                 <div className="relative">
                   <select 
                     value={updateFilterGrade}
                     onChange={(e) => setUpdateFilterGrade(e.target.value)}
                     className="w-full px-4 py-4 border border-gray-100 bg-slate-50/50 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-black text-[11px] text-blue-800 uppercase tracking-widest transition-all"
                   >
                     <option value="">Lọc theo Nhóm</option>
                     {activeGrades.map((grade) => (
                       <option key={grade} value={grade}>{String(grade).startsWith('Nhóm') ? grade : `Nhóm ${grade}`}</option>
                     ))}
                   </select>
                 </div>
               </div>

               <div className="flex flex-col md:flex-row gap-4">
                 <select 
                    className="flex-grow p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-md font-bold text-gray-700 bg-white"
                    onChange={(e) => {
                      setTempSelection(e.target.value);
                      setSelectedForEdit(null); // Reset form visibility when selection changes
                    }}
                    value={tempSelection}
                 >
                    <option value="">-- Kết quả tìm thấy: {filteredForUpdate.length} học sinh --</option>
                    {filteredForUpdate.map((s, idx) => (
                      <option key={idx} value={s['HỌ TÊN HS']}>
                        {s['HỌ TÊN HS']} ({String(s['KHỐI']).startsWith('Nhóm') ? s['KHỐI'] : `Nhóm ${s['KHỐI']}`} - Lớp {s['TÊN LỚP']})
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
                  className={`px-8 py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                    tempSelection 
                    ? 'bg-blue-700 text-white hover:bg-blue-800' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                 >
                   MỞ BIỂU MẪU CẬP NHẬT
                 </button>

                 <button
                  type="button"
                  id="btn-delete-student-update-tab"
                  onClick={() => {
                    const student = students.find(s => s['HỌ TÊN HS'] === tempSelection) || selectedForEdit;
                    if (student) {
                      handleDeleteStudentRequest(student);
                    } else {
                      alert("Vui lòng chọn học sinh cần xóa trong danh sách!");
                    }
                  }}
                  disabled={!tempSelection && !selectedForEdit}
                  className={`px-6 py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                    tempSelection || selectedForEdit
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-200' 
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
                  title="Xóa học sinh này và bỏ trống các ô trong Datasheet"
                 >
                   <Trash2 className="h-5 w-5" />
                   XÓA HỌC SINH
                 </button>
               </div>
            </div>

            {selectedForEdit && (
              <div className="animate-slideUp">
                <StudentForm 
                  title={`Hiệu chỉnh: ${selectedForEdit['HỌ TÊN HS']}`} 
                  initialData={selectedForEdit}
                  onSubmit={handleUpdateStudent}
                  onDelete={handleDeleteStudentRequest}
                  teacherSchedules={teacherSchedules}
                  existingGroups={activeGrades}
                  students={students}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <Statistics students={sortedStudents} />
        )}

        {activeTab === 'teacherSchedule' && (
          <TeacherScheduleComponent onRefresh={loadData} students={students} />
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

      {/* Modal xác nhận xóa học sinh & bỏ trống ô Datasheet */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-red-100 animate-scaleUp">
            <div className="flex items-center gap-3.5 mb-5 text-red-600">
              <div className="p-3 bg-red-100 rounded-2xl">
                <Trash2 className="h-7 w-7 text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">XÁC NHẬN XÓA HỌC SINH</h3>
                <p className="text-xs text-red-600 font-bold uppercase tracking-wider">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-gray-100 mb-5 space-y-2.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-bold">Họ và tên:</span>
                <span className="font-black text-blue-900 text-base">{studentToDelete['HỌ TÊN HS']}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-bold">Nhóm / Lớp:</span>
                <span className="font-bold text-gray-800">
                  {String(studentToDelete['KHỐI']).startsWith('Nhóm') ? studentToDelete['KHỐI'] : `Nhóm ${studentToDelete['KHỐI']}`} - Lớp {studentToDelete['TÊN LỚP']}
                </span>
              </div>
              {studentToDelete['SỐ ĐIỆN THOẠI 1'] && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-bold">Số điện thoại:</span>
                  <span className="font-mono font-bold text-gray-700">{studentToDelete['SỐ ĐIỆN THOẠI 1']}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-xs pt-2 border-t border-gray-200/60">
                <span className="text-gray-400 font-semibold">Vị trí Datasheet:</span>
                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                  Dòng {studentToDelete.rowIndex || 'N/A'}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 mb-6 flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed font-semibold">
                Ứng dụng sẽ xóa toàn bộ ký tự thông tin của học sinh này ở tất cả các ô trong Datasheet (Google Sheets) và bỏ trống các ô đó theo đúng yêu cầu.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                disabled={isDeleting}
                className="px-5 py-3 rounded-xl font-bold text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-all cursor-pointer"
              >
                HỦY BỎ
              </button>
              <button
                type="button"
                id="btn-confirm-delete-student"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-black text-sm rounded-xl shadow-lg shadow-red-200 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    ĐANG XÓA...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    XÁC NHẬN XÓA
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedStudentForReport && (
        <StudentReportModal 
          student={selectedStudentForReport}
          modelMode={modelMode}
          onClose={() => setSelectedStudentForReport(null)}
        />
      )}
    </div>
  );
};

export default App;
