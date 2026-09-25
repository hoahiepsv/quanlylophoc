
import React, { useState, useEffect, useMemo } from 'react';
import { Student, TeacherSchedule } from '../types';
import { Loader2 } from 'lucide-react';

interface StudentFormProps {
  initialData?: Partial<Student>;
  onSubmit: (data: Partial<Student>) => void | Promise<void>;
  onDelete?: (student: Partial<Student>) => void;
  title: string;
  teacherSchedules?: TeacherSchedule[];
  existingGroups?: string[];
  students?: Student[];
}

// Hàm chuẩn hoá ngày an toàn để tránh nhảy ngày do múi giờ
const cleanDateStr = (val: any): string => {
  if (!val) return '';
  const dateObj = new Date(val);
  if (isNaN(dateObj.getTime())) return String(val).split(/[T ]/)[0];
  // toLocaleDateString('en-CA') luôn trả về YYYY-MM-DD dựa trên giờ địa phương
  return dateObj.toLocaleDateString('en-CA');
};

const StudentForm: React.FC<StudentFormProps> = ({ 
  initialData, 
  onSubmit, 
  onDelete,
  title, 
  teacherSchedules = [],
  existingGroups = [],
  students = []
}) => {
  const [formData, setFormData] = useState<Partial<Student>>({
    'HỌ TÊN HS': '',
    'KHỐI': '',
    'TÊN LỚP': '',
    'SỐ ĐIỆN THOẠI 1': '',
    'SỐ ĐIỆN THOẠI 2': '',
    'NGÀY BẮT ĐẦU': cleanDateStr(new Date()),
    'LỊCH HỌC': '',
    'ĐIỂM DANH HS': '',
    'ĐÓNG HỌC PHÍ': '',
  });

  const [isTutoring, setIsTutoring] = useState(false);
  const [isDroppedOut, setIsDroppedOut] = useState(false);
  const [isCustomGroup, setIsCustomGroup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      const sanitized = { ...initialData };
      if (sanitized['NGÀY BẮT ĐẦU']) {
        sanitized['NGÀY BẮT ĐẦU'] = cleanDateStr(sanitized['NGÀY BẮT ĐẦU']);
      }
      
      const khoiValue = String(sanitized['KHỐI'] || '');
      if (khoiValue === 'Đã thôi học') {
        setIsDroppedOut(true);
        setIsTutoring(false);
        sanitized['KHỐI'] = '';
      } else if (khoiValue === 'Kèm riêng' || khoiValue === 'Nhóm kèm riêng') {
        setIsDroppedOut(false);
        setIsTutoring(true);
        sanitized['KHỐI'] = '';
      } else {
        setIsTutoring(false);
        setIsDroppedOut(false);
      }

      setFormData(prev => ({ ...prev, ...sanitized }));
    }
  }, [initialData]);

  const [viewDate, setViewDate] = useState(new Date());
  const [absenceViewDate, setAbsenceViewDate] = useState(new Date());
  const [feeYear, setFeeYear] = useState(new Date().getFullYear());
  const [selectedTeacherSchedule, setSelectedTeacherSchedule] = useState<string>('');

  useEffect(() => {
    if (formData['KHỐI'] && teacherSchedules.length > 0) {
      const match = teacherSchedules.find(s => 
        String(s['TÊN NHÓM'] || s['KHỐI']) === String(formData['KHỐI']) ||
        String(s['KHỐI']) === String(formData['KHỐI'])
      );
      if (match) {
        setSelectedTeacherSchedule(String(match['TÊN NHÓM'] || match['KHỐI']));
      }
    }
  }, [formData['KHỐI'], teacherSchedules]);

  const availableGroups = useMemo(() => {
    const groupsSet = new Set<string>();
    
    // 1. Chỉ lấy các nhóm thực tế đang tồn tại từ danh sách học sinh
    if (students && students.length > 0) {
      students.forEach(s => {
        const g = String(s['KHỐI'] || '').trim();
        if (g && g !== 'undefined' && g !== 'null' && g !== 'Đã thôi học' && g !== 'Kèm riêng' && g !== 'Nhóm kèm riêng') {
          groupsSet.add(g);
        }
      });
    } else if (existingGroups && existingGroups.length > 0) {
      existingGroups.forEach(g => {
        const trimmed = String(g || '').trim();
        if (trimmed && trimmed !== 'undefined' && trimmed !== 'null' && trimmed !== 'Đã thôi học' && trimmed !== 'Kèm riêng' && trimmed !== 'Nhóm kèm riêng') {
          groupsSet.add(trimmed);
        }
      });
    }

    // 2. Thêm nhóm hiện tại của học sinh đang sửa nếu có
    if (initialData?.['KHỐI']) {
      const g = String(initialData['KHỐI']).trim();
      if (g && g !== 'undefined' && g !== 'null' && g !== 'Đã thôi học' && g !== 'Kèm riêng' && g !== 'Nhóm kèm riêng') {
        groupsSet.add(g);
      }
    }

    // Tuyệt đối không lấy nhóm từ teacherSchedules (không hiện nhóm giáo viên)

    return Array.from(groupsSet).sort((a, b) => {
      const nA = parseInt(a);
      const nB = parseInt(b);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      if (!isNaN(nA)) return -1;
      if (!isNaN(nB)) return 1;
      return a.localeCompare(b, 'vi');
    });
  }, [students, existingGroups, initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxMonth = (month: number) => {
    const tag = `T${month}/${feeYear}`;
    const currentFees = formData['ĐÓNG HỌC PHÍ'] || '';
    const tags = currentFees.split(' ').filter(m => m);
    
    let newTags;
    if (tags.includes(tag)) {
      newTags = tags.filter(t => t !== tag);
    } else {
      newTags = [...tags, tag].sort((a, b) => {
        const [ma, ya] = a.replace('T', '').split('/').map(Number);
        const [mb, yb] = b.replace('T', '').split('/').map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      });
    }
    setFormData(prev => ({ ...prev, 'ĐÓNG HỌC PHÍ': newTags.join(' ') }));
  };

  const handleInsertTeacherSchedule = () => {
    const startDate = formData['NGÀY BẮT ĐẦU'];

    if (!startDate) {
      alert("Vui lòng chọn NGÀY BẮT ĐẦU học của học sinh trước khi chèn lịch dạy!");
      return;
    }

    const schedKey = selectedTeacherSchedule || formData['KHỐI'];

    if (!schedKey) {
      alert("Vui lòng chọn một lịch dạy của giáo viên trong danh sách để chèn!");
      return;
    }

    const teacherSched = teacherSchedules.find(s => 
      String(s['TÊN NHÓM'] || s['KHỐI']) === String(schedKey) ||
      String(s['KHỐI']) === String(schedKey) ||
      String(s['TÊN NHÓM']) === String(schedKey)
    );
    
    if (!teacherSched) {
      alert(`Không tìm thấy lịch dạy "${schedKey}" trong hệ thống!`);
      return;
    }

    const cleanStart = cleanDateStr(startDate);
    const teacherDates = (teacherSched['NGÀY DẠY TRONG THÁNG'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
    const validDates = teacherDates.filter(d => d >= cleanStart);

    if (validDates.length === 0) {
      alert(`Lịch dạy "${schedKey}" không có buổi nào kể từ ngày bắt đầu (${cleanStart}) của học sinh!`);
      return;
    }

    const currentSchedule = (formData['LỊCH HỌC'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
    const combined = Array.from(new Set([...currentSchedule, ...validDates])).sort();

    setFormData(prev => ({ ...prev, 'LỊCH HỌC': combined.join(' ') }));
    alert(`Đã chèn thành công ${validDates.length} buổi dạy từ lịch "${schedKey}" vào lịch học của học sinh!`);
  };

  const handleClearSchedule = () => {
    setFormData(prev => ({ ...prev, 'LỊCH HỌC': '' }));
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const toggleDate = (dateStr: string, field: 'LỊCH HỌC' | 'ĐIỂM DANH HS') => {
    const currentVal = (formData[field] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
    let newVal;
    if (currentVal.includes(dateStr)) {
      newVal = currentVal.filter(d => d !== dateStr);
    } else {
      newVal = [...currentVal, dateStr].sort();
    }
    setFormData(prev => ({ ...prev, [field]: newVal.join(' ') }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const studentName = String(formData['HỌ TÊN HS'] || '').trim();
    if (!studentName) {
      alert("Vui lòng nhập Họ và tên học sinh!");
      return;
    }
    
    const submissionData = { ...formData, 'HỌ TÊN HS': studentName };
    
    // Đảm bảo các trường ngày luôn ở định dạng YYYY-MM-DD chuẩn hoá
    submissionData['NGÀY BẮT ĐẦU'] = cleanDateStr(submissionData['NGÀY BẮT ĐẦU']) || cleanDateStr(new Date());
    
    if (submissionData['LỊCH HỌC']) {
      submissionData['LỊCH HỌC'] = submissionData['LỊCH HỌC'].split(' ').filter(d => d).map(d => cleanDateStr(d)).join(' ');
    }
    
    if (submissionData['ĐIỂM DANH HS']) {
      submissionData['ĐIỂM DANH HS'] = submissionData['ĐIỂM DANH HS'].split(' ').filter(d => d).map(d => cleanDateStr(d)).join(' ');
    }
    
    if (isDroppedOut) {
      submissionData['KHỐI'] = "Đã thôi học";
    } else if (isTutoring) {
      submissionData['KHỐI'] = "Kèm riêng";
    } else {
      const finalKhoi = String(formData['KHỐI'] || '').trim();
      if (!finalKhoi) {
        alert("Vui lòng chọn hoặc nhập tên NHÓM (KHỐI) cho học sinh!");
        return;
      }
      submissionData['KHỐI'] = finalKhoi;
    }

    // Luôn đồng bộ TÊN NHÓM với KHỐI để tránh trống cột trên Google Sheet
    submissionData['TÊN NHÓM'] = submissionData['KHỐI'];
    
    setIsSubmitting(true);
    try {
      await onSubmit(submissionData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const scheduleArray = (formData['LỊCH HỌC'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
  const absenceArray = (formData['ĐIỂM DANH HS'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
  const todayStr = cleanDateStr(new Date());
  const attendedCount = scheduleArray.filter(d => d <= todayStr).length;
  const selectedCount = scheduleArray.length;

  const renderCalendar = (field: 'LỊCH HỌC' | 'ĐIỂM DANH HS', viewDateObj: Date) => {
    const year = viewDateObj.getFullYear();
    const month = viewDateObj.getMonth();
    const days = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const today = cleanDateStr(new Date());

    const calendarCells = [];
    for (let i = 0; i < startDay; i++) {
      calendarCells.push(<div key={`pad-${i}`} className="h-10 border-transparent"></div>);
    }

    for (let day = 1; day <= days; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const currentVal = (formData[field] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
      const isSelected = currentVal.includes(dateStr);
      const isToday = dateStr === today;
      
      let baseStyle = "h-10 border rounded-lg flex flex-col items-center justify-center text-xs transition-all transform active:scale-90 ";
      if (field === 'LỊCH HỌC') {
        baseStyle += isSelected 
          ? 'bg-blue-600 border-blue-700 text-white shadow-inner font-bold' 
          : 'bg-white border-gray-100 hover:border-blue-300 text-gray-700';
      } else {
        baseStyle += isSelected 
          ? 'bg-red-500 border-red-600 text-white shadow-inner font-bold' 
          : 'bg-white border-gray-100 hover:border-red-300 text-gray-700';
      }

      calendarCells.push(
        <button
          key={day}
          type="button"
          onClick={() => toggleDate(dateStr, field)}
          className={`${baseStyle} ${isToday && !isSelected ? 'border-amber-400 border-2' : ''}`}
        >
          <span>{day}</span>
          {isSelected && <div className="w-1 h-1 bg-white rounded-full mt-0.5"></div>}
        </button>
      );
    }

    return calendarCells;
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-xl border border-blue-50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b pb-4">
        <h2 className="text-2xl font-black text-blue-900 flex items-center gap-3">
          <div className="w-2 h-8 bg-blue-600 rounded-full"></div>
          {title}
        </h2>
        {onDelete && initialData?.rowIndex && (
          <button
            type="button"
            id="btn-delete-student-top"
            onClick={() => onDelete(formData)}
            className="self-start sm:self-auto px-4 py-2.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-xs active:scale-95 cursor-pointer"
            title="Xóa toàn bộ ký tự của học sinh này trên Datasheet và bỏ trống các ô"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Xóa học sinh
          </button>
        )}
      </div>
      
      <form className="space-y-8" onSubmit={handleFormSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Thông tin cơ bản</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">HỌ TÊN HỌC SINH</label>
                <input 
                  name="HỌ TÊN HS" 
                  value={formData['HỌ TÊN HS']} 
                  onChange={handleChange}
                  placeholder="Nhập họ tên đầy đủ"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase">
                      {isCustomGroup ? 'TẠO NHÓM MỚI (LƯU CỘT KHỐI)' : 'NHÓM (KHỐI)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextState = !isCustomGroup;
                        setIsCustomGroup(nextState);
                        if (nextState) {
                          setFormData(prev => ({ ...prev, 'KHỐI': '' }));
                        }
                      }}
                      disabled={isDroppedOut || isTutoring}
                      className="text-[10px] font-black text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      {isCustomGroup ? (
                        <span>↩ Chọn nhóm có sẵn</span>
                      ) : (
                        <span>+ Tạo nhóm mới</span>
                      )}
                    </button>
                  </div>

                  {isCustomGroup ? (
                    <div>
                      <input 
                        name="KHỐI" 
                        value={formData['KHỐI'] || ''} 
                        onChange={handleChange}
                        disabled={isDroppedOut || isTutoring}
                        placeholder="Gõ tên nhóm mới (VD: Nhóm 13, Toán 9A...)"
                        className={`w-full px-4 py-3 border-2 border-blue-400 bg-blue-50/20 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-blue-900 shadow-inner ${(isDroppedOut || isTutoring) ? 'bg-gray-100 text-gray-400 opacity-50' : ''}`}
                        autoFocus
                      />
                      <p className="text-[10px] text-blue-600 font-medium mt-1 flex items-center gap-1">
                        <span>💡</span>
                        <span>Tên nhóm này sẽ được lưu trực tiếp vào cột <strong>KHỐI</strong> trên Google Sheet.</span>
                      </p>
                    </div>
                  ) : (
                    <select 
                      name="KHỐI" 
                      value={formData['KHỐI']} 
                      onChange={(e) => {
                        if (e.target.value === '__CREATE_NEW_GROUP__') {
                          setIsCustomGroup(true);
                          setFormData(prev => ({ ...prev, 'KHỐI': '' }));
                        } else {
                          handleChange(e);
                        }
                      }}
                      disabled={isDroppedOut || isTutoring}
                      className={`w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium ${(isDroppedOut || isTutoring) ? 'bg-gray-100 text-gray-400 opacity-50' : ''}`}
                    >
                      <option value="">
                        {isDroppedOut ? 'Đã thôi học' : (isTutoring ? 'Kèm riêng' : (availableGroups.length === 0 ? '-- Chưa có nhóm (Bấm Tạo nhóm mới) --' : '-- Chọn nhóm đã có --'))}
                      </option>
                      {availableGroups.map((g) => (
                        <option key={g} value={g}>
                          {String(g).startsWith('Nhóm') ? g : `Nhóm ${g}`}
                        </option>
                      ))}
                      <option value="__CREATE_NEW_GROUP__" className="font-black text-blue-600 bg-blue-50">
                        ✨ + Tạo nhóm mới (gõ tên riêng)...
                      </option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase">TÊN LỚP</label>
                  <input 
                    name="TÊN LỚP" 
                    value={formData['TÊN LỚP']} 
                    onChange={handleChange}
                    placeholder="Ví dụ: 12A1"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center justify-between">
                  <div>
                    <label className="text-[10px] font-black text-amber-800 uppercase block">Học tập</label>
                    <span className="text-[8px] text-amber-600 font-medium leading-none">Kèm riêng</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isTutoring}
                      onChange={(e) => {
                        setIsTutoring(e.target.checked);
                        if (e.target.checked) setIsDroppedOut(false);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>

                <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex items-center justify-between">
                  <div>
                    <label className="text-[10px] font-black text-red-800 uppercase block">Trạng thái</label>
                    <span className="text-[8px] text-red-600 font-medium leading-none">HS thôi học</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isDroppedOut}
                      onChange={(e) => {
                        setIsDroppedOut(e.target.checked);
                        if (e.target.checked) setIsTutoring(false);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">SỐ ĐIỆN THOẠI 1 (Zalo)</label>
                <input 
                  name="SỐ ĐIỆN THOẠI 1" 
                  value={formData['SỐ ĐIỆN THOẠI 1']} 
                  onChange={handleChange}
                  placeholder="09xx xxx xxx"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">SỐ ĐIỆN THOẠI 2</label>
                <input 
                  name="SỐ ĐIỆN THOẠI 2" 
                  value={formData['SỐ ĐIỆN THOẠI 2']} 
                  onChange={handleChange}
                  placeholder="Dự phòng"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">NGÀY BẮT ĐẦU HỌC</label>
                <input 
                  type="date"
                  name="NGÀY BẮT ĐẦU" 
                  value={formData['NGÀY BẮT ĐẦU']} 
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center w-full">
                <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">LỊCH HỌC DỰ KIẾN</span>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-600 font-bold">Đã dạy: {attendedCount} buổi</span>
                  <span className="text-blue-600 font-bold">Đã chọn: {selectedCount} buổi</span>
                </div>
              </div>

              {/* Ô chọn lịch dạy của giáo viên để chèn */}
              <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="select-teacher-schedule-insert" className="block text-xs font-black text-indigo-900 uppercase tracking-wider">
                    Chọn lịch dạy của giáo viên để chèn:
                  </label>
                  {selectedTeacherSchedule && (
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md">
                      Đang chọn: {selectedTeacherSchedule}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-7">
                    <select
                      id="select-teacher-schedule-insert"
                      value={selectedTeacherSchedule}
                      onChange={(e) => setSelectedTeacherSchedule(e.target.value)}
                      className="w-full px-3 py-2.5 border border-indigo-200 bg-white rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                    >
                      <option value="">-- Chọn lịch dạy để chèn --</option>
                      {teacherSchedules.map((s, idx) => {
                        const name = s['TÊN NHÓM'] || s['KHỐI'] || `Lịch ${idx + 1}`;
                        const count = (s['NGÀY DẠY TRONG THÁNG'] || '').split(' ').filter(d => d).length;
                        return (
                          <option key={idx} value={name}>
                            {name} ({count} buổi dự kiến)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <button
                      type="button"
                      id="btn-insert-teacher-schedule"
                      onClick={handleInsertTeacherSchedule}
                      disabled={!selectedTeacherSchedule && !formData['KHỐI']}
                      className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                        (selectedTeacherSchedule || formData['KHỐI'])
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Chèn lịch dạy
                    </button>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      id="btn-clear-student-schedule"
                      onClick={handleClearSchedule}
                      className="w-full py-2.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-1 shadow-2xs active:scale-95"
                      title="Xoá toàn bộ lịch học của học sinh"
                    >
                      Xoá hết
                    </button>
                  </div>
                </div>

                {selectedTeacherSchedule && (() => {
                  const target = teacherSchedules.find(s => 
                    String(s['TÊN NHÓM'] || s['KHỐI']) === String(selectedTeacherSchedule) ||
                    String(s['KHỐI']) === String(selectedTeacherSchedule)
                  );
                  if (!target) return null;
                  const allDates = (target['NGÀY DẠY TRONG THÁNG'] || '').split(' ').filter(d => d);
                  const validCount = formData['NGÀY BẮT ĐẦU'] 
                    ? allDates.filter(d => cleanDateStr(d) >= cleanDateStr(formData['NGÀY BẮT ĐẦU'])).length
                    : allDates.length;
                  return (
                    <p className="text-[11px] text-indigo-700 font-semibold">
                      💡 Lịch "{selectedTeacherSchedule}" có {allDates.length} buổi dự kiến {formData['NGÀY BẮT ĐẦU'] ? `(trong đó có ${validCount} buổi kể từ ngày bắt đầu ${formData['NGÀY BẮT ĐẦU']})` : ''}.
                    </p>
                  );
                })()}
              </div>
              <div className="border border-gray-100 rounded-2xl p-4 bg-slate-50 shadow-inner">
                <div className="flex justify-between items-center mb-4">
                  <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))} className="p-1 hover:bg-gray-200 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg></button>
                  <div className="font-black text-blue-900 text-[11px] uppercase">Tháng {viewDate.getMonth() + 1}, {viewDate.getFullYear()}</div>
                  <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))} className="p-1 hover:bg-gray-200 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg></button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[9px] font-bold text-gray-400">
                  {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {renderCalendar('LỊCH HỌC', viewDate)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest flex justify-between items-center">
                <span>ĐIỂM DANH (VẮNG MẶT)</span>
                <span className="text-red-600 lowercase font-medium">Đã vắng: {absenceArray.length} buổi</span>
              </h3>
              <p className="text-[10px] text-gray-400 italic mt-1">Ghi chú: Vui lòng click vào các ngày học sinh vắng học để hệ thống lưu lại.</p>
              <div className="border border-red-50 rounded-2xl p-4 bg-red-50/30 shadow-inner">
                <div className="flex justify-between items-center mb-4">
                  <button type="button" onClick={() => setAbsenceViewDate(new Date(absenceViewDate.getFullYear(), absenceViewDate.getMonth() - 1))} className="p-1 hover:bg-red-100 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-700" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg></button>
                  <div className="font-black text-red-900 text-[11px] uppercase">Tháng {absenceViewDate.getMonth() + 1}, {absenceViewDate.getFullYear()}</div>
                  <button type="button" onClick={() => setAbsenceViewDate(new Date(absenceViewDate.getFullYear(), absenceViewDate.getMonth() + 1))} className="p-1 hover:bg-red-100 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-700" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg></button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[9px] font-bold text-gray-400">
                  {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {renderCalendar('ĐIỂM DANH HS', absenceViewDate)}
                </div>
              </div>
            </div>

            <div>
              <div className="flex flex-col justify-between items-start gap-2 mb-4">
                 <label className="block text-xs font-black text-gray-700 uppercase tracking-widest">Tháng đã đóng học phí</label>
                 <div className="flex items-center gap-4 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 w-full">
                    <button type="button" onClick={() => setFeeYear(prev => prev - 1)} className="p-1 hover:bg-white rounded-lg shadow-sm transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg></button>
                    <span className="text-sm font-black text-emerald-900 flex-grow text-center uppercase">Năm {feeYear}</span>
                    <button type="button" onClick={() => setFeeYear(prev => prev + 1)} className="p-1 hover:bg-white rounded-lg shadow-sm transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg></button>
                 </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 bg-emerald-50/30 p-4 rounded-2xl border border-dashed border-emerald-100">
                {[...Array(12)].map((_, i) => {
                  const month = i + 1;
                  const tag = `T${month}/${feeYear}`;
                  const isActive = (formData['ĐÓNG HỌC PHÍ'] || '').includes(tag);
                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => handleCheckboxMonth(month)}
                      className={`py-2 rounded-xl text-[10px] font-black transition-all border-2 ${
                        isActive 
                        ? 'bg-emerald-600 border-emerald-700 text-white shadow-md' 
                        : 'bg-white border-white text-gray-400 hover:border-emerald-200'
                      }`}
                    >
                      Tháng {month}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-10 flex flex-col sm:flex-row items-center gap-4">
          {onDelete && initialData?.rowIndex && (
            <button
              type="button"
              id="btn-delete-student-bottom"
              onClick={() => onDelete(formData)}
              className="w-full sm:w-auto px-8 py-5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border-2 border-red-200 hover:border-red-600 font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] order-2 sm:order-1 cursor-pointer"
              title="Xóa toàn bộ ký tự của học sinh này trên Datasheet và bỏ trống các ô"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              XÓA HỌC SINH
            </button>
          )}

          <button 
            type="submit" 
            id="btn-submit-student"
            disabled={isSubmitting}
            className={`flex-1 w-full text-white font-black py-5 rounded-2xl shadow-xl transition-all transform flex items-center justify-center gap-3 active:scale-[0.98] order-1 sm:order-2 ${
              isSubmitting 
                ? 'bg-blue-400 cursor-not-allowed opacity-80' 
                : 'bg-blue-700 hover:bg-blue-800 hover:-translate-y-1 cursor-pointer'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-white" />
                <span>ĐANG LƯU DỮ LIỆU...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                <span>{initialData?.rowIndex ? 'LƯU CẬP NHẬT DỮ LIỆU' : 'GHI DANH HỌC SINH MỚI'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentForm;
