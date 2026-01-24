
import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { apiService } from '../services/apiService';

interface AttendanceProps {
  students: Student[];
  onRefresh: () => Promise<void>;
}

const Attendance: React.FC<AttendanceProps> = ({ students, onRefresh }) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [filterKhoi, setFilterKhoi] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);

  const dateDisplay = useMemo(() => {
    const d = new Date(attendanceDate);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }, [attendanceDate]);

  const systemStats = useMemo(() => {
    const allAbsent = students.filter(s => (s['ĐIỂM DANH HS'] || '').includes(attendanceDate)).length;
    const allStudents = students.length;
    
    let gradeAbsent = 0;
    let gradeTotal = 0;
    
    if (filterKhoi) {
      const gradeList = students.filter(s => String(s['KHỐI']) === filterKhoi);
      gradeTotal = gradeList.length;
      gradeAbsent = gradeList.filter(s => (s['ĐIỂM DANH HS'] || '').includes(attendanceDate)).length;
    } else {
      gradeTotal = allStudents;
      gradeAbsent = allAbsent;
    }

    return { allAbsent, allStudents, gradeAbsent, gradeTotal };
  }, [students, attendanceDate, filterKhoi]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchKhoi = filterKhoi === '' || String(s['KHỐI']) === filterKhoi;
      const matchSearch = s['HỌ TÊN HS'].toLowerCase().includes(searchTerm.toLowerCase());
      return matchKhoi && matchSearch;
    }).sort((a, b) => parseInt(String(a['KHỐI'])) - parseInt(String(b['KHỐI'])));
  }, [students, filterKhoi, searchTerm]);

  const activeGradesForFilter = useMemo(() => {
    const grades = new Set<string>();
    students.forEach(s => {
      const k = String(s['KHỐI']);
      if (k && k !== 'undefined') grades.add(k);
    });
    return Array.from(grades).sort((a, b) => parseInt(a) - parseInt(b));
  }, [students]);

  const toggleStudent = (rowIndex: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(rowIndex)) newSet.delete(rowIndex);
    else newSet.add(rowIndex);
    setSelectedIds(newSet);
  };

  const handleSaveAttendance = async () => {
    if (selectedIds.size === 0) {
      alert("Vui lòng chọn ít nhất một học sinh vắng mặt!");
      return;
    }

    if (!confirm(`Xác nhận ghi nhận vắng mặt cho ${selectedIds.size} học sinh vào ngày ${dateDisplay}?`)) return;

    setSaving(true);
    try {
      const updatePromises = Array.from(selectedIds).map((rowIndex: number) => {
        const student = students.find(s => s.rowIndex === rowIndex);
        if (!student) return Promise.resolve();

        const currentAbsences = (student['ĐIỂM DANH HS'] || '').split(' ').filter(d => d);
        if (currentAbsences.includes(attendanceDate)) return Promise.resolve();

        const newAbsences = [...currentAbsences, attendanceDate].sort().join(' ');
        return apiService.saveStudent('updateData', { ...student, 'ĐIỂM DANH HS': newAbsences }, rowIndex);
      });

      await Promise.all(updatePromises);
      alert("Đã cập nhật điểm danh thành công!");
      setSelectedIds(new Set());
      await onRefresh();
    } catch (error: any) {
      alert("Lỗi khi lưu điểm danh: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-24 md:pb-8">
      {/* Header gọn gàng */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-blue-900 uppercase flex items-center gap-2">
              <div className="w-1 h-5 bg-red-500 rounded-full"></div>
              Ghi nhận vắng
            </h2>
            <input 
              type="date" 
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="bg-slate-100 border-none text-[11px] font-bold text-blue-900 focus:ring-0 outline-none rounded-lg px-2 py-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-50/50 p-2 rounded-xl border border-blue-100 flex items-center justify-between px-3">
              <span className="text-[9px] font-black text-blue-400 uppercase">Tổng vắng</span>
              <span className="text-sm font-black text-blue-900">{systemStats.allAbsent}/{systemStats.allStudents}</span>
            </div>
            <div className="bg-emerald-50/50 p-2 rounded-xl border border-emerald-100 flex items-center justify-between px-3">
              <span className="text-[9px] font-black text-emerald-400 uppercase">Nhóm vắng</span>
              <span className="text-sm font-black text-emerald-700">{systemStats.gradeAbsent}/{systemStats.gradeTotal}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tìm kiếm & Lọc */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input 
            type="text" 
            placeholder="Tìm tên..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-4 py-2.5 bg-white border border-gray-100 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-xs font-bold shadow-sm"
          />
        </div>
        <select 
          value={filterKhoi}
          onChange={(e) => {
            setFilterKhoi(e.target.value);
            setSelectedIds(new Set());
          }}
          className="px-4 py-2.5 bg-white border border-gray-100 rounded-xl font-black text-[10px] text-blue-800 outline-none focus:ring-1 focus:ring-blue-500 shadow-sm uppercase"
        >
          <option value="">Tất cả Nhóm</option>
          {activeGradesForFilter.map((grade) => (
            <option key={grade} value={grade}>Nhóm {grade}</option>
          ))}
        </select>
      </div>

      {/* Danh sách học sinh dạng Card Gọn */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filteredStudents.map((student) => {
          const isSelected = selectedIds.has(student.rowIndex!);
          const isAlreadyAbsent = (student['ĐIỂM DANH HS'] || '').includes(attendanceDate);

          return (
            <div 
              key={student.rowIndex}
              onClick={() => !isAlreadyAbsent && toggleStudent(student.rowIndex!)}
              className={`relative p-3 rounded-xl border-2 transition-all cursor-pointer select-none flex items-center gap-3 ${
                isAlreadyAbsent 
                ? 'bg-slate-50 border-slate-100 opacity-60 grayscale' 
                : isSelected 
                ? 'bg-red-50 border-red-500 shadow-sm ring-2 ring-red-100' 
                : 'bg-white border-white hover:border-blue-100 shadow-sm'
              }`}
            >
              {/* Icon Trạng thái */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                isAlreadyAbsent ? 'bg-slate-200 text-slate-500' : isSelected ? 'bg-red-600 text-white' : 'bg-blue-100 text-blue-600'
              }`}>
                {isAlreadyAbsent ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                ) : isSelected ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="text-[10px] font-black">N{student['KHỐI']}</span>
                )}
              </div>

              {/* Thông tin học sinh */}
              <div className="flex-grow min-w-0">
                <h4 className={`text-xs font-black truncate ${isSelected ? 'text-red-900' : 'text-gray-800'}`}>
                  {student['HỌ TÊN HS']}
                </h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md uppercase">
                    Nhóm {student['KHỐI']}
                  </span>
                  <span className="text-[9px] font-medium text-gray-400">
                    Lớp {student['TÊN LỚP']}
                  </span>
                </div>
              </div>

              {/* Badge Vắng mặt */}
              {isAlreadyAbsent && (
                <span className="text-[8px] font-black text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded">Đã vắng</span>
              )}
            </div>
          );
        })}
      </div>

      {filteredStudents.length === 0 && (
        <div className="py-20 text-center text-gray-300 flex flex-col items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Không tìm thấy học sinh</p>
        </div>
      )}

      {/* Nút lưu lơ lửng cho Mobile */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xs px-4 z-[60]">
        <button
          onClick={handleSaveAttendance}
          disabled={saving || selectedIds.size === 0}
          className={`w-full py-3.5 rounded-2xl font-black shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
            selectedIds.size > 0 && !saving 
            ? 'bg-red-600 text-white animate-bounce-short' 
            : 'bg-white text-gray-300 border border-gray-100 pointer-events-none'
          }`}
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs uppercase">XÁC NHẬN VẮNG ({selectedIds.size})</span>
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .animate-bounce-short {
          animation: bounce-short 1.2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Attendance;
