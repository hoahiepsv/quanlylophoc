import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/apiService';
import { TeacherSchedule, Student } from '../types';
import { matchStudentSearch, normalizeSearchText } from '../utils';

interface TeacherScheduleProps {
  onRefresh?: () => Promise<void> | void;
  students?: Student[];
}

const cleanDateStr = (val: any): string => {
  if (!val) return '';
  const dateObj = new Date(val);
  if (isNaN(dateObj.getTime())) return String(val).split(/[T ]/)[0];
  return dateObj.toLocaleDateString('en-CA');
};

const formatDateVN = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const TeacherScheduleComponent: React.FC<TeacherScheduleProps> = ({ onRefresh, students }) => {
  const [schedules, setSchedules] = useState<TeacherSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeMode, setActiveMode] = useState<'list' | 'create'>('list');

  // Chế độ chỉnh sửa / xem lịch hiện có
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [currentDates, setCurrentDates] = useState<string[]>([]);
  const [viewDate, setViewDate] = useState(new Date());

  // Chế độ tạo lịch dạy mới
  const [newScheduleName, setNewScheduleName] = useState<string>('');
  const [newDates, setNewDates] = useState<string[]>([]);
  const [newViewDate, setNewViewDate] = useState(new Date());

  // Danh sách học sinh & Chức năng áp dụng lịch dạy cho học sinh
  const [studentList, setStudentList] = useState<Student[]>(students || []);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showConfirmModeDialog, setShowConfirmModeDialog] = useState(false);
  const [selectedStudentRowIndices, setSelectedStudentRowIndices] = useState<Set<number>>(new Set());
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [studentFilterGrade, setStudentFilterGrade] = useState('');
  const [applyingProgress, setApplyingProgress] = useState<{ 
    current: number; 
    total: number; 
    isApplying: boolean; 
    mode?: 'replace' | 'merge' 
  } | null>(null);

  useEffect(() => {
    if (Array.isArray(students) && students.length > 0) {
      setStudentList(students);
    } else {
      apiService.getStudents().then(res => {
        if (Array.isArray(res)) setStudentList(res);
      }).catch(console.error);
    }
  }, [students]);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const data = await apiService.getTeacherSchedules();
      setSchedules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Lỗi tải lịch dạy:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  // Tự động chọn lịch đầu tiên khi tải xong nếu chưa có lựa chọn
  useEffect(() => {
    if (schedules.length > 0 && !selectedScheduleId) {
      const first = schedules[0];
      const id = String(first.rowIndex || first['TÊN NHÓM'] || first['KHỐI']);
      setSelectedScheduleId(id);
    }
  }, [schedules, selectedScheduleId]);

  // Khi chọn một lịch trong danh sách hiện có
  useEffect(() => {
    const selected = schedules.find(s => 
      String(s.rowIndex) === String(selectedScheduleId) || 
      String(s['TÊN NHÓM'] || s['KHỐI']) === String(selectedScheduleId)
    );

    if (selected) {
      setEditName(selected['TÊN NHÓM'] || selected['KHỐI'] || '');
      const dates = (selected['NGÀY DẠY TRONG THÁNG'] || '')
        .split(' ')
        .filter(d => d)
        .map(d => cleanDateStr(d));
      setCurrentDates(dates);
    } else {
      setEditName('');
      setCurrentDates([]);
    }
  }, [selectedScheduleId, schedules]);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  // Thao tác với ngày ở chế độ Sửa
  const toggleEditDate = (dateStr: string) => {
    setCurrentDates(prev => {
      if (prev.includes(dateStr)) {
        return prev.filter(d => d !== dateStr).sort();
      }
      return [...prev, dateStr].sort();
    });
  };

  // Thao tác với ngày ở chế độ Tạo mới
  const toggleNewDate = (dateStr: string) => {
    setNewDates(prev => {
      if (prev.includes(dateStr)) {
        return prev.filter(d => d !== dateStr).sort();
      }
      return [...prev, dateStr].sort();
    });
  };

  // Chọn nhanh các ngày theo thứ trong tuần
  const addDaysByWeekdays = (
    targetDate: Date, 
    weekdays: number[], 
    setDatesFn: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const totalDays = daysInMonth(year, month);
    const addedDates: string[] = [];

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      if (weekdays.includes(d.getDay())) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        addedDates.push(dateStr);
      }
    }

    setDatesFn(prev => Array.from(new Set([...prev, ...addedDates])).sort());
  };

  // Xoá nhanh các ngày trong tháng đang xem
  const clearCurrentMonthDates = (
    targetDate: Date,
    setDatesFn: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    setDatesFn(prev => prev.filter(d => !d.startsWith(monthPrefix)));
  };

  // Lưu lịch mới
  const handleCreateNewSchedule = async () => {
    const nameTrimmed = newScheduleName.trim();
    if (!nameTrimmed) {
      alert("Vui lòng nhập Tên lịch dạy / Tên nhóm!");
      return;
    }

    if (newDates.length === 0) {
      console.info("Tạo lịch dạy với danh sách ngày trống ban đầu");
    }

    setLoading(true);
    try {
      const payload = {
        'TÊN NHÓM': nameTrimmed,
        'KHỐI': nameTrimmed,
        'NGÀY DẠY TRONG THÁNG': newDates.sort().join(' ')
      };

      await apiService.saveTeacherSchedule(payload);
      alert(`Đã tạo lịch dạy "${nameTrimmed}" thành công và lưu vào cột TÊN NHÓM!`);

      // Cập nhật lạc quan vào danh sách lịch dạy cục bộ
      setSchedules(prev => {
        const maxRow = prev.length > 0 ? Math.max(...prev.map(s => Number(s.rowIndex) || 0)) : 1;
        const newSched = {
          ...payload,
          rowIndex: maxRow + 1,
          STT: maxRow
        };
        const updated = [...prev, newSched];
        apiService.setCachedData(undefined, updated);
        return updated;
      });

      // Reset form
      setNewScheduleName('');
      setNewDates([]);
      
      // Chuyển sang màn hình danh sách với nhóm vừa tạo
      setSelectedScheduleId(nameTrimmed);
      setActiveMode('list');

      // Reload danh sách ngầm từ máy chủ
      loadSchedules();
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error("Lỗi khi tạo lịch dạy mới:", error);
      alert("Lỗi khi lưu dữ liệu mới: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Cập nhật lịch dạy hiện có
  const handleUpdateSchedule = async () => {
    const selected = schedules.find(s => 
      String(s.rowIndex) === String(selectedScheduleId) || 
      String(s['TÊN NHÓM'] || s['KHỐI']) === String(selectedScheduleId)
    );

    if (!selected) {
      alert("Vui lòng chọn một lịch dạy cần cập nhật!");
      return;
    }

    const finalName = editName.trim() || selected['TÊN NHÓM'] || selected['KHỐI'] || '';
    if (!finalName) {
      alert("Vui lòng nhập tên lịch dạy / nhóm!");
      return;
    }

    setLoading(true);
    try {
      const data = {
        'TÊN NHÓM': finalName,
        'KHỐI': finalName,
        'NGÀY DẠY TRONG THÁNG': currentDates.sort().join(' ')
      };
      await apiService.saveTeacherSchedule(data, selected.rowIndex);
      alert("Đã cập nhật lịch dạy thành công!");

      // Cập nhật lạc quan
      setSchedules(prev => {
        const updated = prev.map(s => s.rowIndex === selected.rowIndex ? { ...s, ...data } : s);
        apiService.setCachedData(undefined, updated);
        return updated;
      });

      loadSchedules();
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error("Lỗi khi cập nhật lịch dạy:", error);
      alert("Lỗi khi lưu dữ liệu cập nhật: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Danh sách các nhóm học sinh duy nhất để lọc
  const studentGradesForFilter = useMemo(() => {
    const grades = new Set<string>();
    studentList.forEach(s => {
      const k = String(s['KHỐI'] || '').trim();
      if (k && k !== 'undefined' && k !== 'null') grades.add(k);
    });
    return Array.from(grades).sort((a, b) => {
      const nA = parseInt(a);
      const nB = parseInt(b);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      if (!isNaN(nA)) return -1;
      if (!isNaN(nB)) return 1;
      if (a === 'Đã thôi học') return 1;
      if (b === 'Đã thôi học') return -1;
      return a.localeCompare(b, 'vi');
    });
  }, [studentList]);

  // Lọc học sinh theo từ khóa và nhóm
  const filteredStudents = useMemo(() => {
    return studentList.filter(s => {
      const matchSearch = matchStudentSearch(s, studentSearchTerm);
      const matchGrade = !studentFilterGrade || 
        String(s['KHỐI'] || '').trim() === studentFilterGrade;
      return matchSearch && matchGrade;
    });
  }, [studentList, studentSearchTerm, studentFilterGrade]);

  // Tìm nhóm học sinh có tên trùng hoặc tương ứng với lịch dạy hiện tại
  const matchingGroupName = useMemo(() => {
    const raw = (editName || '').trim();
    if (!raw) return '';
    const rawNorm = normalizeSearchText(raw);
    const withoutPrefixNorm = normalizeSearchText(raw.replace(/^Nhóm\s*/i, ''));
    const found = studentGradesForFilter.find(g => {
      const gNorm = normalizeSearchText(g);
      return (
        gNorm === rawNorm || 
        gNorm === withoutPrefixNorm || 
        rawNorm.includes(gNorm) || 
        gNorm.includes(withoutPrefixNorm)
      );
    });
    return found || '';
  }, [editName, studentGradesForFilter]);

  const matchingGroupCount = useMemo(() => {
    if (!matchingGroupName) return 0;
    return studentList.filter(s => String(s['KHỐI'] || '').trim() === matchingGroupName).length;
  }, [matchingGroupName, studentList]);

  // Mở modal chọn học sinh
  const handleOpenApplyModal = () => {
    if (currentDates.length === 0) {
      alert("Lịch dạy hiện tại chưa có ngày nào được chọn. Vui lòng chọn các ngày dạy trên lịch trước khi áp dụng cho học sinh!");
      return;
    }
    setShowApplyModal(true);
    setShowConfirmModeDialog(false);
    setStudentSearchTerm('');
    // Nếu có nhóm trùng với lịch dạy thì gợi ý lọc nhóm đó trước
    if (matchingGroupName) {
      setStudentFilterGrade(matchingGroupName);
    } else {
      setStudentFilterGrade('');
    }
  };

  // Chọn / bỏ chọn học sinh
  const toggleSelectStudent = (rowIndex?: number) => {
    if (!rowIndex) return;
    setSelectedStudentRowIndices(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  };

  // Chọn tất cả học sinh đang hiển thị trong bộ lọc
  const handleSelectAllFiltered = () => {
    setSelectedStudentRowIndices(prev => {
      const next = new Set(prev);
      filteredStudents.forEach(s => {
        if (s.rowIndex) next.add(s.rowIndex);
      });
      return next;
    });
  };

  // Bỏ chọn tất cả
  const handleDeselectAll = () => {
    setSelectedStudentRowIndices(new Set());
  };

  // Chọn nhanh học sinh thuộc nhóm tương ứng với lịch
  const handleQuickSelectMatchingGroup = () => {
    if (!matchingGroupName) return;
    setSelectedStudentRowIndices(prev => {
      const next = new Set(prev);
      studentList.forEach(s => {
        if (String(s['KHỐI'] || '').trim() === matchingGroupName && s.rowIndex) {
          next.add(s.rowIndex);
        }
      });
      return next;
    });
  };

  // Sau khi chọn xong học sinh -> Chuyển sang bước hỏi phương thức: "Xóa hết lịch cũ" hay "Thêm vào lịch có sẵn"
  const handleProceedToConfirm = () => {
    if (selectedStudentRowIndices.size === 0) {
      alert("Vui lòng chọn ít nhất một học sinh trong danh sách để áp dụng lịch dạy!");
      return;
    }
    setShowConfirmModeDialog(true);
  };

  // Thực hiện áp dụng lịch dạy:
  // - mode = 'replace': Xóa hết lịch cũ và thay bằng các ngày trong lịch dạy
  // - mode = 'merge': Thêm vào lịch có sẵn, giữ ngày cũ và bổ sung ngày mới (không trùng)
  const executeApplySchedule = async (mode: 'replace' | 'merge') => {
    const selectedStudents = studentList.filter(s => s.rowIndex && selectedStudentRowIndices.has(s.rowIndex));
    if (selectedStudents.length === 0) {
      alert("Chưa chọn học sinh nào!");
      return;
    }

    setApplyingProgress({ 
      current: 0, 
      total: selectedStudents.length, 
      isApplying: true, 
      mode 
    });

    try {
      const sortedScheduleDates = [...currentDates].sort();
      const batchSize = 3;
      
      for (let i = 0; i < selectedStudents.length; i += batchSize) {
        const batch = selectedStudents.slice(i, i + batchSize);
        
        await Promise.all(batch.map(student => {
          let newScheduleStr = '';
          if (mode === 'replace') {
            // Xóa hết lịch cũ: Ghi đè toàn bộ bằng các ngày trong lịch dạy
            newScheduleStr = sortedScheduleDates.join(' ');
          } else {
            // Thêm vào lịch có sẵn: Giữ ngày cũ và gộp thêm ngày mới
            const currentStudentDates = (student['LỊCH HỌC'] || '')
              .split(' ')
              .filter(d => d)
              .map(d => cleanDateStr(d));
            const merged = Array.from(new Set([...currentStudentDates, ...sortedScheduleDates])).sort();
            newScheduleStr = merged.join(' ');
          }

          const updatedData: Student = {
            ...student,
            'LỊCH HỌC': newScheduleStr,
            'NGÀY BẮT ĐẦU': cleanDateStr(student['NGÀY BẮT ĐẦU'])
          };

          return apiService.saveStudent('updateData', updatedData, student.rowIndex);
        }));

        setApplyingProgress({
          current: Math.min(i + batchSize, selectedStudents.length),
          total: selectedStudents.length,
          isApplying: true,
          mode
        });
      }

      const modeName = mode === 'replace' ? 'Xóa hết lịch cũ' : 'Thêm vào lịch có sẵn';
      alert(`Đã áp dụng thành công lịch dạy "${editName || 'Lịch dạy'}" cho ${selectedStudents.length} học sinh theo phương thức "${modeName}"!`);
      
      setShowConfirmModeDialog(false);
      setShowApplyModal(false);
      setSelectedStudentRowIndices(new Set());
      
      if (onRefresh) {
        await onRefresh();
      }
      
      // Đồng bộ lại danh sách học sinh
      try {
        const refreshed = await apiService.getStudents();
        if (Array.isArray(refreshed)) {
          setStudentList(refreshed);
        }
      } catch (err) {
        console.error("Lỗi làm mới học sinh:", err);
      }
    } catch (error: any) {
      alert("Lỗi khi áp dụng lịch dạy: " + error.message);
    } finally {
      setApplyingProgress(null);
    }
  };

  // Render lịch tương tác
  const renderCalendar = (
    currentViewDate: Date, 
    selectedDatesList: string[], 
    onToggle: (d: string) => void
  ) => {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    const days = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const todayStr = cleanDateStr(new Date());

    const cells = [];
    for (let i = 0; i < startDay; i++) {
      cells.push(<div key={`pad-${i}`} className="h-12 border-transparent"></div>);
    }

    for (let day = 1; day <= days; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isSelected = selectedDatesList.includes(dateStr);
      const isToday = dateStr === todayStr;

      cells.push(
        <button
          key={day}
          type="button"
          onClick={() => onToggle(dateStr)}
          className={`h-12 border rounded-xl flex flex-col items-center justify-center text-xs transition-all transform active:scale-95 relative ${
            isSelected 
            ? 'bg-blue-600 border-blue-700 text-white shadow-md font-black ring-2 ring-blue-200' 
            : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 text-gray-700 font-semibold'
          } ${isToday && !isSelected ? 'border-amber-400 border-2 text-amber-900 bg-amber-50/30' : ''}`}
        >
          <span className="text-[13px]">{day}</span>
          {isSelected && (
            <span className="text-[8px] uppercase tracking-wider font-bold text-blue-100">Dạy</span>
          )}
          {isToday && !isSelected && (
            <span className="text-[7px] text-amber-600 font-bold uppercase">Hôm nay</span>
          )}
        </button>
      );
    }
    return cells;
  };

  const currentSelectedSchedule = useMemo(() => {
    return schedules.find(s => 
      String(s.rowIndex) === String(selectedScheduleId) || 
      String(s['TÊN NHÓM'] || s['KHỐI']) === String(selectedScheduleId)
    );
  }, [schedules, selectedScheduleId]);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Thẻ chính */}
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl border border-blue-50">
        
        {/* Tiêu đề & Nút chuyển đổi chế độ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100 mb-6">
          <div>
            <h2 className="text-xl font-black text-blue-900 uppercase flex items-center gap-3">
              <span className="w-2.5 h-8 bg-blue-600 rounded-full"></span>
              Lịch dạy của giáo viên
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Quản lý lịch dạy, tạo lịch mới.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl self-start sm:self-auto border border-gray-200">
            <button
              type="button"
              id="btn-tab-list-schedule"
              onClick={() => setActiveMode('list')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                activeMode === 'list'
                  ? 'bg-white text-blue-900 shadow-sm'
                  : 'text-gray-500 hover:text-blue-800'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Lịch hiện có ({schedules.length})
            </button>
            <button
              type="button"
              id="btn-tab-create-schedule"
              onClick={() => setActiveMode('create')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                activeMode === 'create'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-700 hover:bg-blue-50'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Tạo lịch dạy mới
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* CHẾ ĐỘ 1: TẠO LỊCH DẠY MỚI                                   */}
        {/* ============================================================ */}
        {activeMode === 'create' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50/40 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-black text-blue-900 uppercase">Tạo lịch dạy mới cho Nhóm</h3>
                <p className="text-xs text-blue-700 mt-0.5">
                  Nhập tên lịch dạy, tên sẽ được lưu vào cột <strong className="underline">TÊN NHÓM</strong> trong Google Sheet. Sau đó chọn các ngày dạy dự kiến trên lịch bên dưới.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Cột trái: Nhập tên & Tóm tắt & Nút lưu */}
              <div className="space-y-6">
                <div>
                  <label htmlFor="input-new-schedule-name" className="block text-xs font-black text-gray-600 uppercase mb-2 tracking-widest">
                    Tên lịch dạy / Tên nhóm <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="input-new-schedule-name"
                    type="text"
                    value={newScheduleName}
                    onChange={(e) => setNewScheduleName(e.target.value)}
                    placeholder="Ví dụ: Nhóm 1, Nhóm 2, Lớp 9A, Toán Chuyên..."
                    className="w-full p-4 border border-blue-200 rounded-xl font-bold text-gray-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-sm"
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5 italic">
                    Gợi ý: Đặt tên tương ứng với Nhóm học sinh (ví dụ: "1", "2" hoặc "Lớp 9A") để tự động chèn lịch cho học sinh.
                  </p>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-500 uppercase">Ngày dạy dự kiến:</span>
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-black">
                      {newDates.length} buổi
                    </span>
                  </div>

                  {newDates.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto pr-1 flex flex-wrap gap-1.5 pt-1">
                      {newDates.map(dateStr => (
                        <span 
                          key={dateStr}
                          className="inline-flex items-center gap-1 text-[10px] font-bold bg-white border border-blue-200 text-blue-800 px-2 py-1 rounded-md shadow-2xs"
                        >
                          {formatDateVN(dateStr)}
                          <button
                            type="button"
                            onClick={() => toggleNewDate(dateStr)}
                            className="text-gray-400 hover:text-red-500 font-black ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">
                      Chưa chọn ngày nào. Vui lòng bấm vào các ngày trên lịch bên cạnh.
                    </p>
                  )}
                </div>

                {/* Phím chọn nhanh */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Chọn nhanh tháng {newViewDate.getMonth() + 1}:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => addDaysByWeekdays(newViewDate, [1, 3, 5], setNewDates)}
                      className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold transition-all"
                    >
                      + Thứ 2, 4, 6
                    </button>
                    <button
                      type="button"
                      onClick={() => addDaysByWeekdays(newViewDate, [2, 4, 6], setNewDates)}
                      className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold transition-all"
                    >
                      + Thứ 3, 5, 7
                    </button>
                  </div>
                  {newDates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearCurrentMonthDates(newViewDate, setNewDates)}
                      className="w-full py-1.5 text-center text-[10px] font-bold text-red-500 hover:text-red-700 hover:underline"
                    >
                      Xoá các ngày trong Tháng {newViewDate.getMonth() + 1}
                    </button>
                  )}
                </div>

                {/* Nút hành động */}
                <div className="space-y-2 pt-2">
                  <button
                    id="btn-save-new-schedule"
                    type="button"
                    onClick={handleCreateNewSchedule}
                    disabled={loading || !newScheduleName.trim()}
                    className={`w-full py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                      newScheduleName.trim() && !loading 
                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                        ĐANG LƯU VÀO SHEET...
                      </span>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        LƯU LỊCH DẠY MỚI
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveMode('list')}
                    className="w-full py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 text-center"
                  >
                    Huỷ và quay lại danh sách
                  </button>
                </div>
              </div>

              {/* Cột phải: Lịch chọn ngày dự kiến */}
              <div className="lg:col-span-2">
                <div className="border border-gray-100 rounded-3xl p-6 bg-slate-50 shadow-inner">
                  <div className="flex justify-between items-center mb-6">
                    <button 
                      type="button"
                      onClick={() => setNewViewDate(new Date(newViewDate.getFullYear(), newViewDate.getMonth() - 1))}
                      className="p-3 hover:bg-white rounded-full transition-all shadow-sm active:scale-90"
                      title="Tháng trước"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div className="text-center">
                      <div className="font-black text-blue-900 uppercase tracking-widest text-base">
                        Tháng {newViewDate.getMonth() + 1}, {newViewDate.getFullYear()}
                      </div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Bấm vào các ngày dự kiến dạy</span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setNewViewDate(new Date(newViewDate.getFullYear(), newViewDate.getMonth() + 1))}
                      className="p-3 hover:bg-white rounded-full transition-all shadow-sm active:scale-90"
                      title="Tháng sau"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-2 text-center mb-4">
                    {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => (
                      <div key={d} className="text-[10px] font-black text-gray-400 uppercase">{d}</div>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-2">
                    {renderCalendar(newViewDate, newDates, toggleNewDate)}
                  </div>
                  
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-[10px] font-bold text-gray-400 uppercase pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 bg-blue-600 rounded-md"></div> Ngày dạy dự kiến
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 bg-white border border-gray-200 rounded-md"></div> Ngày nghỉ
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 bg-amber-50 border border-amber-400 rounded-md"></div> Hôm nay
                      </div>
                    </div>
                    <span className="text-blue-700 font-black">Đã chọn {newDates.length} ngày</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* CHẾ ĐỘ 2: DANH SÁCH & CHỈNH SỬA LỊCH HIỆN CÓ                 */}
        {/* ============================================================ */}
        {activeMode === 'list' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Cột trái: Chọn nhóm & Chỉnh sửa tên & Lưu */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="select-schedule-item" className="block text-xs font-black text-gray-500 uppercase tracking-widest">
                    Chọn lịch dạy / Nhóm
                  </label>
                  <button
                    type="button"
                    onClick={() => setActiveMode('create')}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    + Thêm mới
                  </button>
                </div>

                <select 
                  id="select-schedule-item"
                  value={selectedScheduleId}
                  onChange={(e) => setSelectedScheduleId(e.target.value)}
                  className="w-full p-4 border border-gray-200 rounded-xl font-bold text-gray-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-sm"
                >
                  <option value="">-- Chọn lịch dạy --</option>
                  {schedules.map((s, idx) => {
                    const name = s['TÊN NHÓM'] || s['KHỐI'] || `Lịch ${idx + 1}`;
                    const count = (s['NGÀY DẠY TRONG THÁNG'] || '').split(' ').filter(d => d).length;
                    const val = String(s.rowIndex || name);
                    return (
                      <option key={val} value={val}>
                        {name} ({count} buổi)
                      </option>
                    );
                  })}
                  {/* Nếu chưa có lịch nào thì hiển thị nhóm 1..12 làm mẫu */}
                  {schedules.length === 0 && [...Array(12)].map((_, i) => (
                    <option key={i + 1} value={`Nhóm ${i + 1}`}>Nhóm {i + 1}</option>
                  ))}
                </select>
              </div>

              {/* Tên nhóm / lịch */}
              {selectedScheduleId && (
                <div>
                  <label htmlFor="input-edit-schedule-name" className="block text-xs font-black text-gray-500 uppercase mb-2 tracking-widest">
                    Tên lịch dạy (Cột TÊN NHÓM)
                  </label>
                  <input
                    id="input-edit-schedule-name"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nhập tên lịch dạy..."
                    className="w-full p-3 border border-gray-200 rounded-xl font-bold text-gray-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-sm"
                  />
                </div>
              )}

              {/* Tóm tắt */}
              <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 space-y-2">
                <p className="text-xs font-bold text-blue-800">Tóm tắt lịch dạy:</p>
                <p className="text-sm text-blue-900">
                  {editName ? <span className="font-black text-blue-900">{editName}: </span> : 'Chưa chọn lịch. '}
                  <span className="font-black text-blue-700">{currentDates.length} ngày dạy</span> được ghi nhận.
                </p>
                {currentDates.length > 0 && (
                  <div className="max-h-28 overflow-y-auto pr-1 flex flex-wrap gap-1 pt-1">
                    {currentDates.slice(0, 15).map(dateStr => (
                      <span 
                        key={dateStr}
                        className="text-[9px] font-bold bg-white border border-blue-200 text-blue-800 px-1.5 py-0.5 rounded"
                      >
                        {formatDateVN(dateStr)}
                      </span>
                    ))}
                    {currentDates.length > 15 && (
                      <span className="text-[9px] text-blue-500 font-bold self-center">
                        +{currentDates.length - 15} ngày nữa
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Phím chọn nhanh */}
              {selectedScheduleId && (
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Chọn nhanh tháng {viewDate.getMonth() + 1}:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => addDaysByWeekdays(viewDate, [1, 3, 5], setCurrentDates)}
                      className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold transition-all"
                    >
                      + Thứ 2, 4, 6
                    </button>
                    <button
                      type="button"
                      onClick={() => addDaysByWeekdays(viewDate, [2, 4, 6], setCurrentDates)}
                      className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold transition-all"
                    >
                      + Thứ 3, 5, 7
                    </button>
                  </div>
                </div>
              )}

              {/* Nút lưu cập nhật */}
              <button
                id="btn-update-schedule"
                type="button"
                onClick={handleUpdateSchedule}
                disabled={loading || !selectedScheduleId}
                className={`w-full py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  selectedScheduleId && !loading 
                    ? 'bg-blue-700 text-white hover:bg-blue-800' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    ĐANG LƯU...
                  </span>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    CẬP NHẬT LỊCH DẠY
                  </>
                )}
              </button>

              {/* Nút áp dụng lịch dạy cho học sinh */}
              <button
                id="btn-open-apply-students-modal"
                type="button"
                onClick={handleOpenApplyModal}
                disabled={loading || !selectedScheduleId || currentDates.length === 0}
                className={`w-full py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border ${
                  selectedScheduleId && currentDates.length > 0 && !loading
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-emerald-100 cursor-pointer'
                    : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                ÁP DỤNG CHO HỌC SINH ({currentDates.length} BUỔI)
              </button>
            </div>

            {/* Cột phải: Lịch hiển thị */}
            <div className="lg:col-span-2">
              <div className="border border-gray-100 rounded-3xl p-6 bg-slate-50 shadow-inner">
                <div className="flex justify-between items-center mb-6">
                  <button 
                    type="button"
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))}
                    className="p-3 hover:bg-white rounded-full transition-all shadow-sm active:scale-90"
                    title="Tháng trước"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="text-center">
                    <div className="font-black text-blue-900 uppercase tracking-widest text-base">
                      Tháng {viewDate.getMonth() + 1}, {viewDate.getFullYear()}
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Bấm vào ngày để thêm hoặc bỏ buổi dạy</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))}
                    className="p-3 hover:bg-white rounded-full transition-all shadow-sm active:scale-90"
                    title="Tháng sau"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                
                <div className="grid grid-cols-7 gap-2 text-center mb-4">
                  {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => (
                    <div key={d} className="text-[10px] font-black text-gray-400 uppercase">{d}</div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-2">
                  {renderCalendar(viewDate, currentDates, toggleEditDate)}
                </div>
                
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-[10px] font-bold text-gray-400 uppercase pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 bg-blue-600 rounded-md"></div> Ngày có buổi dạy
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 bg-white border border-gray-200 rounded-md"></div> Ngày nghỉ
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 bg-amber-50 border border-amber-400 rounded-md"></div> Hôm nay
                    </div>
                  </div>
                  <span className="text-blue-700 font-black">Tổng {currentDates.length} ngày đã chọn</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: CHỌN HỌC SINH ÁP DỤNG LỊCH DẠY */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-blue-100 overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 p-5 sm:p-6 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-black text-lg sm:text-xl tracking-tight uppercase">
                    Áp dụng lịch dạy cho học sinh
                  </h3>
                  <p className="text-xs text-blue-200 mt-0.5 font-medium">
                    Lịch: <span className="font-black text-white underline">{editName || 'Lịch dạy'}</span> • Tổng số: <span className="font-black text-white">{currentDates.length} buổi dạy</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Dải hiển thị danh sách ngày của lịch */}
            <div className="bg-blue-50/80 px-5 py-3 border-b border-blue-100 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
              <span className="font-black text-blue-900 whitespace-nowrap text-[11px] uppercase tracking-wider">
                Các ngày sẽ áp dụng:
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                {currentDates.slice(0, 12).map(d => (
                  <span key={d} className="px-2 py-0.5 bg-white border border-blue-200 rounded font-bold text-blue-800 text-[11px] whitespace-nowrap shadow-2xs">
                    {formatDateVN(d)}
                  </span>
                ))}
                {currentDates.length > 12 && (
                  <span className="text-[11px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded whitespace-nowrap">
                    +{currentDates.length - 12} ngày khác
                  </span>
                )}
              </div>
            </div>

            {/* Bộ lọc & Phím chọn nhanh */}
            <div className="p-4 sm:p-5 border-b border-gray-100 bg-slate-50/50 space-y-3 shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Tìm kiếm theo tên */}
                <div className="sm:col-span-7 relative">
                  <input
                    type="text"
                    value={studentSearchTerm}
                    onChange={e => setStudentSearchTerm(e.target.value)}
                    placeholder="Tìm theo tên học sinh, SĐT, lớp (có hoặc không dấu)..."
                    className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 absolute left-3.5 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {studentSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setStudentSearchTerm('')}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Hộp chọn nhóm */}
                <div className="sm:col-span-5">
                  <select
                    value={studentFilterGrade}
                    onChange={e => setStudentFilterGrade(e.target.value)}
                    className="w-full py-2.5 px-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  >
                    <option value="">-- Tất cả các nhóm --</option>
                    {studentGradesForFilter.map(g => (
                      <option key={g} value={g}>
                        Nhóm {g} ({studentList.filter(s => String(s['KHỐI'] || '').trim() === g).length} HS)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Thao tác chọn nhanh */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold transition-all"
                  >
                    Chọn tất cả ({filteredStudents.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-bold transition-all"
                  >
                    Bỏ chọn tất cả
                  </button>
                </div>

                {matchingGroupName && matchingGroupCount > 0 && (
                  <button
                    type="button"
                    onClick={handleQuickSelectMatchingGroup}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-black transition-all flex items-center gap-1.5"
                  >
                    <span>⚡</span>
                    <span>Chọn học sinh Nhóm {matchingGroupName} ({matchingGroupCount} HS)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bảng danh sách học sinh */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {filteredStudents.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-bold text-sm">Không tìm thấy học sinh nào phù hợp!</p>
                  <p className="text-xs text-gray-400 mt-1">Vui lòng thử tìm kiếm với từ khóa khác hoặc chọn tất cả nhóm.</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-black text-gray-500 uppercase tracking-wider">
                        <th className="py-3 px-4 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={filteredStudents.length > 0 && filteredStudents.every(s => s.rowIndex && selectedStudentRowIndices.has(s.rowIndex))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleSelectAllFiltered();
                              } else {
                                setSelectedStudentRowIndices(prev => {
                                  const next = new Set(prev);
                                  filteredStudents.forEach(s => { if (s.rowIndex) next.delete(s.rowIndex); });
                                  return next;
                                });
                              }
                            }}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th className="py-3 px-3">Học sinh</th>
                        <th className="py-3 px-3">Nhóm (Khối)</th>
                        <th className="py-3 px-3">Lớp</th>
                        <th className="py-3 px-3 text-right">Lịch học hiện tại</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {filteredStudents.map(student => {
                        const isSelected = student.rowIndex ? selectedStudentRowIndices.has(student.rowIndex) : false;
                        const currentSchedDates = (student['LỊCH HỌC'] || '').split(' ').filter(d => d);
                        return (
                          <tr
                            key={student.rowIndex || student['STT']}
                            onClick={() => toggleSelectStudent(student.rowIndex)}
                            className={`cursor-pointer transition-colors ${
                              isSelected 
                                ? 'bg-blue-50/80 hover:bg-blue-100/70 font-semibold' 
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectStudent(student.rowIndex)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-bold text-gray-900">{student['HỌ TÊN HS']}</div>
                              <div className="text-[11px] text-gray-400 font-normal">STT: {student['STT']}</div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800">
                                {student['KHỐI']}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-gray-600 text-xs">
                              {student['TÊN LỚP'] || '—'}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className={`text-xs font-bold ${currentSchedDates.length > 0 ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                                {currentSchedDates.length > 0 ? `${currentSchedDates.length} buổi` : 'Chưa có lịch'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Chân Modal */}
            <div className="p-4 sm:p-5 border-t border-gray-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-sm text-gray-600 font-medium">
                Đã chọn: <strong className="text-blue-700 font-black text-base">{selectedStudentRowIndices.size}</strong> / {studentList.length} học sinh
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-all"
                >
                  Hủy bỏ
                </button>

                <button
                  type="button"
                  onClick={handleProceedToConfirm}
                  disabled={selectedStudentRowIndices.size === 0}
                  className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide transition-all shadow-md flex items-center justify-center gap-2 ${
                    selectedStudentRowIndices.size > 0
                      ? 'bg-blue-700 hover:bg-blue-800 text-white active:scale-95 cursor-pointer'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span>Tiếp tục áp dụng lịch</span>
                  <span className="px-2 py-0.5 bg-white/20 rounded-md text-xs">
                    {selectedStudentRowIndices.size}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: HỎI "XÓA HẾT LỊCH CŨ" VÀ "THÊM VÀO LỊCH CÓ SẴN" (HIỂN THỊ NỔI TRÊN CÙNG TẤT CẢ) */}
      {showConfirmModeDialog && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border-2 border-blue-500/30 space-y-6 relative z-[10000] my-auto animate-scaleUp">
            {/* Tiêu đề */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                Chọn phương thức áp dụng lịch dạy
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                Bạn đang chuẩn bị áp dụng lịch dạy <strong className="text-blue-700 font-bold">"{editName || 'Lịch dạy'}"</strong> ({currentDates.length} buổi) cho <strong className="text-blue-700 font-bold">{selectedStudentRowIndices.size} học sinh</strong> đã chọn.
              </p>
            </div>

            {/* 2 Lựa chọn cụ thể theo yêu cầu */}
            <div className="space-y-3">
              {/* Nút 1: Xóa hết lịch cũ */}
              <button
                type="button"
                onClick={() => executeApplySchedule('replace')}
                disabled={applyingProgress?.isApplying}
                className="w-full text-left p-4 sm:p-5 rounded-2xl border-2 border-rose-200 hover:border-rose-500 bg-rose-50/50 hover:bg-rose-50 transition-all group flex items-start gap-4 active:scale-[0.99] shadow-sm hover:shadow-md cursor-pointer"
              >
                <div className="p-3 bg-rose-600 text-white rounded-xl group-hover:bg-rose-700 transition-colors shadow-sm shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-gray-900 text-base group-hover:text-rose-900">
                      Xóa hết lịch cũ
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-rose-200 text-rose-900 rounded-md">
                      Thay thế toàn bộ
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Xóa toàn bộ lịch học cũ của các học sinh đã chọn và thay thế bằng chính xác {currentDates.length} ngày trong lịch dạy này.
                  </p>
                </div>
              </button>

              {/* Nút 2: Thêm vào lịch có sẵn */}
              <button
                type="button"
                onClick={() => executeApplySchedule('merge')}
                disabled={applyingProgress?.isApplying}
                className="w-full text-left p-4 sm:p-5 rounded-2xl border-2 border-emerald-200 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 transition-all group flex items-start gap-4 active:scale-[0.99] shadow-sm hover:shadow-md cursor-pointer"
              >
                <div className="p-3 bg-emerald-600 text-white rounded-xl group-hover:bg-emerald-700 transition-colors shadow-sm shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-gray-900 text-base group-hover:text-emerald-900">
                      Thêm vào lịch có sẵn
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-md">
                      Gộp bổ sung
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Giữ nguyên các ngày học đã có trước đây của học sinh và bổ sung thêm các ngày từ lịch dạy này (tự động loại bỏ ngày trùng lặp).
                  </p>
                </div>
              </button>
            </div>

            {/* Nút quay lại */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmModeDialog(false)}
                disabled={applyingProgress?.isApplying}
                className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-all shadow-xs"
              >
                ← Quay lại danh sách chọn học sinh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY TIẾN ĐỘ ĐỒNG BỘ DỮ LIỆU (NỔI CAO NHẤT) */}
      {applyingProgress?.isApplying && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] text-center space-y-5 border-2 border-blue-500/30 relative z-[100000] my-auto animate-scaleUp">
            <div className="relative w-16 h-16 mx-auto">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-700"></div>
              <div className="absolute inset-0 flex items-center justify-center font-black text-blue-800 text-xs">
                {Math.round((applyingProgress.current / applyingProgress.total) * 100)}%
              </div>
            </div>
            <div>
              <h4 className="text-lg font-black text-gray-900 uppercase">
                Đang cập nhật lịch học...
              </h4>
              <p className="text-sm font-semibold text-blue-800 mt-1">
                Đã xử lý {applyingProgress.current} / {applyingProgress.total} học sinh
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Chế độ: {applyingProgress.mode === 'replace' ? 'Xóa hết lịch cũ' : 'Thêm vào lịch có sẵn'}
              </p>
            </div>
            {/* Thanh tiến độ */}
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${(applyingProgress.current / applyingProgress.total) * 100}%` }}
              ></div>
            </div>
            <p className="text-[11px] text-gray-400 italic">
              Vui lòng giữ nguyên màn hình trong khi hệ thống đồng bộ dữ liệu với Google Sheet...
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherScheduleComponent;
