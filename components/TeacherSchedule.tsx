
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { TeacherSchedule } from '../types';

const TeacherScheduleComponent: React.FC = () => {
  const [schedules, setSchedules] = useState<TeacherSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKhoi, setSelectedKhoi] = useState<string>('');
  const [currentDates, setCurrentDates] = useState<string[]>([]);
  const [viewDate, setViewDate] = useState(new Date());

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const data = await apiService.getTeacherSchedules();
      setSchedules(data);
    } catch (error) {
      console.error("Lỗi tải lịch dạy:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  useEffect(() => {
    const existing = schedules.find(s => String(s['KHỐI']) === String(selectedKhoi));
    if (existing) {
      setCurrentDates((existing['NGÀY DẠY TRONG THÁNG'] || '').split(' ').filter(d => d));
    } else {
      setCurrentDates([]);
    }
  }, [selectedKhoi, schedules]);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const toggleDate = (dateStr: string) => {
    setCurrentDates(prev => {
      if (prev.includes(dateStr)) {
        return prev.filter(d => d !== dateStr).sort();
      }
      return [...prev, dateStr].sort();
    });
  };

  const handleSave = async () => {
    if (!selectedKhoi) {
      alert("Vui lòng chọn khối trước!");
      return;
    }
    setLoading(true);
    try {
      const existing = schedules.find(s => String(s['KHỐI']) === String(selectedKhoi));
      const data = {
        'KHỐI': selectedKhoi,
        'NGÀY DẠY TRONG THÁNG': currentDates.join(' ')
      };
      await apiService.saveTeacherSchedule(data, existing?.rowIndex);
      alert("Đã cập nhật lịch dạy thành công!");
      await loadSchedules();
    } catch (error: any) {
      alert("Lỗi lưu dữ liệu: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const today = new Date().toISOString().split('T')[0];

    const cells = [];
    for (let i = 0; i < startDay; i++) {
      cells.push(<div key={`pad-${i}`} className="h-12 border-transparent"></div>);
    }

    for (let day = 1; day <= days; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isSelected = currentDates.includes(dateStr);
      const isToday = dateStr === today;

      cells.push(
        <button
          key={day}
          type="button"
          onClick={() => toggleDate(dateStr)}
          className={`h-12 border rounded-xl flex flex-col items-center justify-center text-xs transition-all transform active:scale-90 ${
            isSelected 
            ? 'bg-blue-600 border-blue-700 text-white shadow-lg font-bold' 
            : 'bg-white border-gray-100 hover:border-blue-200 text-gray-700'
          } ${isToday && !isSelected ? 'border-red-400 border-2' : ''}`}
        >
          <span>{day}</span>
        </button>
      );
    }
    return cells;
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-50">
        <h2 className="text-xl font-black text-blue-900 uppercase mb-8 flex items-center gap-3">
          <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
          Lịch dạy của giáo viên
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cài đặt */}
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase mb-2 tracking-widest">Chọn Khối đang dạy</label>
              <select 
                value={selectedKhoi}
                onChange={(e) => setSelectedKhoi(e.target.value)}
                className="w-full p-4 border border-gray-200 rounded-xl font-bold text-gray-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              >
                <option value="">-- Chọn Khối --</option>
                {[...Array(12)].map((_, i) => (
                  <option key={i+1} value={i+1}>Khối {i+1}</option>
                ))}
              </select>
            </div>

            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
              <p className="text-xs font-bold text-blue-800 mb-2">Tóm tắt:</p>
              <p className="text-sm text-blue-600">
                {selectedKhoi ? `Khối ${selectedKhoi}: ` : 'Vui lòng chọn khối. '}
                <span className="font-black">{currentDates.length} ngày dạy</span> được tích chọn trong lịch.
              </p>
            </div>

            <button
              onClick={handleSave}
              disabled={loading || !selectedKhoi}
              className={`w-full py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                selectedKhoi && !loading ? 'bg-blue-700 text-white hover:bg-blue-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? "ĐANG LƯU..." : "CẬP NHẬT LỊCH DẠY"}
            </button>
          </div>

          {/* Lịch */}
          <div className="lg:col-span-2">
            <div className="border border-gray-100 rounded-3xl p-6 bg-slate-50 shadow-inner">
              <div className="flex justify-between items-center mb-6">
                <button 
                  onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))}
                  className="p-3 hover:bg-white rounded-full transition-all shadow-sm active:scale-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="font-black text-blue-900 uppercase tracking-widest">
                  Tháng {viewDate.getMonth() + 1}, {viewDate.getFullYear()}
                </div>
                <button 
                  onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))}
                  className="p-3 hover:bg-white rounded-full transition-all shadow-sm active:scale-90"
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
                {renderCalendar()}
              </div>
              
              <div className="mt-6 flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-600 rounded-sm"></div> Ngày có tiết dạy
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-white border border-gray-200 rounded-sm"></div> Ngày nghỉ
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherScheduleComponent;
