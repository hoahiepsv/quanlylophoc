
import React, { useState, useEffect } from 'react';
import { Student, TeacherSchedule } from '../types';

interface StudentFormProps {
  initialData?: Partial<Student>;
  onSubmit: (data: Partial<Student>) => void;
  title: string;
  teacherSchedules?: TeacherSchedule[];
}

const StudentForm: React.FC<StudentFormProps> = ({ initialData, onSubmit, title, teacherSchedules = [] }) => {
  const [formData, setFormData] = useState<Partial<Student>>({
    'HỌ TÊN HS': '',
    'KHỐI': '',
    'TÊN LỚP': '',
    'SỐ ĐIỆN THOẠI 1': '',
    'SỐ ĐIỆN THOẠI 2': '',
    'NGÀY BẮT ĐẦU': new Date().toISOString().split('T')[0],
    'LỊCH HỌC': '',
    'ĐIỂM DANH HS': '',
    'ĐÓNG HỌC PHÍ': '',
  });

  const [isTutoring, setIsTutoring] = useState(false);

  useEffect(() => {
    if (initialData) {
      const sanitized = { ...initialData };
      if (sanitized['NGÀY BẮT ĐẦU']) {
        sanitized['NGÀY BẮT ĐẦU'] = sanitized['NGÀY BẮT ĐẦU'].split(/[T ]/)[0];
      }
      
      // Xử lý tách nhãn "Kèm Riêng" từ dữ liệu KHỐI
      const khoiValue = String(sanitized['KHỐI'] || '');
      if (khoiValue.includes(' - Kèm Riêng')) {
        setIsTutoring(true);
        sanitized['KHỐI'] = khoiValue.replace(' - Kèm Riêng', '');
      } else {
        setIsTutoring(false);
      }

      setFormData(prev => ({ ...prev, ...sanitized }));
    }
  }, [initialData]);

  const [viewDate, setViewDate] = useState(new Date());
  const [absenceViewDate, setAbsenceViewDate] = useState(new Date());
  const [feeYear, setFeeYear] = useState(new Date().getFullYear());

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
    const selectedKhoi = formData['KHỐI'];
    const startDate = formData['NGÀY BẮT ĐẦU'];

    if (!selectedKhoi) {
      alert("Vui lòng chọn NHÓM trước khi chèn lịch dạy!");
      return;
    }

    if (!startDate) {
      alert("Vui lòng chọn NGÀY BẮT ĐẦU học!");
      return;
    }

    const teacherSched = teacherSchedules.find(s => String(s['KHỐI']) === String(selectedKhoi));
    
    if (!teacherSched) {
      alert(`Không tìm thấy lịch dạy cho Nhóm ${selectedKhoi} trong hệ thống!`);
      return;
    }

    const teacherDates = (teacherSched['NGÀY DẠY TRONG THÁNG'] || '').split(' ').filter(d => d);
    const validDates = teacherDates.filter(d => d >= startDate);

    if (validDates.length === 0) {
      alert("Lịch dạy của giáo viên nhóm này không có ngày nào sau ngày bắt đầu của học sinh!");
      return;
    }

    const currentSchedule = (formData['LỊCH HỌC'] || '').split(' ').filter(d => d);
    const combined = Array.from(new Set([...currentSchedule, ...validDates])).sort();

    setFormData(prev => ({ ...prev, 'LỊCH HỌC': combined.join(' ') }));
    alert(`Đã tự động thêm ${validDates.length} buổi học dựa trên lịch dạy Nhóm ${selectedKhoi}!`);
  };

  const handleClearSchedule = () => {
    setFormData(prev => ({ ...prev, 'LỊCH HỌC': '' }));
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const toggleDate = (dateStr: string, field: 'LỊCH HỌC' | 'ĐIỂM DANH HS') => {
    const currentVal = (formData[field] || '').split(' ').filter(d => d);
    let newVal;
    if (currentVal.includes(dateStr)) {
      newVal = currentVal.filter(d => d !== dateStr);
    } else {
      newVal = [...currentVal, dateStr].sort();
    }
    setFormData(prev => ({ ...prev, [field]: newVal.join(' ') }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Tạo bản sao dữ liệu để điều chỉnh giá trị KHỐI trước khi gửi
    const submissionData = { ...formData };
    if (isTutoring && submissionData['KHỐI']) {
      submissionData['KHỐI'] = `${submissionData['KHỐI']} - Kèm Riêng`;
    }
    
    onSubmit(submissionData);
  };

  // Tính toán số buổi đã học và đã chọn
  const scheduleArray = (formData['LỊCH HỌC'] || '').split(' ').filter(d => d);
  const absenceArray = (formData['ĐIỂM DANH HS'] || '').split(' ').filter(d => d);
  const todayStr = new Date().toISOString().split('T')[0];
  const attendedCount = scheduleArray.filter(d => d <= todayStr && !absenceArray.includes(d)).length;
  const selectedCount = scheduleArray.length;

  const renderCalendar = (field: 'LỊCH HỌC' | 'ĐIỂM DANH HS', viewDateObj: Date) => {
    const year = viewDateObj.getFullYear();
    const month = viewDateObj.getMonth();
    const days = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const today = new Date().toISOString().split('T')[0];

    const calendarCells = [];
    for (let i = 0; i < startDay; i++) {
      calendarCells.push(<div key={`pad-${i}`} className="h-10 border-transparent"></div>);
    }

    for (let day = 1; day <= days; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isSelected = (formData[field] || '').includes(dateStr);
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
      <h2 className="text-2xl font-black text-blue-900 mb-8 border-b pb-4 flex items-center gap-3">
        <div className="w-2 h-8 bg-blue-600 rounded-full"></div>
        {title}
      </h2>
      
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
              <div className="grid grid-cols-2 gap-3">
                 <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">NHÓM (KHỐI)</label>
                  <select 
                    name="KHỐI" 
                    value={formData['KHỐI']} 
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                  >
                    <option value="">Chọn nhóm</option>
                    {[...Array(12)].map((_, i) => (
                      <option key={i+1} value={i+1}>Nhóm {i+1}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">TÊN LỚP</label>
                  <input 
                    name="TÊN LỚP" 
                    value={formData['TÊN LỚP']} 
                    onChange={handleChange}
                    placeholder="Ví dụ: 12A1"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                  />
                </div>
              </div>

              {/* Ô stick Kèm Riêng */}
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center justify-between">
                <div>
                  <label className="text-xs font-black text-amber-800 uppercase block">Chế độ học tập</label>
                  <span className="text-[10px] text-amber-600 font-medium">Chọn nếu học sinh học kèm riêng 1:1</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isTutoring}
                    onChange={(e) => setIsTutoring(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  <span className="ml-3 text-xs font-black text-amber-900 uppercase">KÈM RIÊNG</span>
                </label>
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
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex flex-col gap-2">
                <div className="flex justify-between items-center w-full">
                  <span>LỊCH HỌC</span>
                  <div className="flex gap-3">
                    <span className="text-emerald-600 lowercase font-medium">Đã học: {attendedCount} buổi</span>
                    <span className="text-blue-600 lowercase font-medium">Đã chọn: {selectedCount} buổi</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleInsertTeacherSchedule}
                    className="py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Chèn lịch dạy
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSchedule}
                    className="py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Xoá hết lịch học
                  </button>
                </div>
              </h3>
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

        <div className="pt-10">
          <button 
            type="submit" 
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-black py-5 rounded-2xl shadow-xl transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            CẬP NHẬT DỮ LIỆU HỆ THỐNG
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentForm;
