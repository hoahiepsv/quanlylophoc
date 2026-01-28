
import React, { useState, useMemo, useEffect } from 'react';
import { Student } from '../types';
import { apiService } from '../services/apiService';

interface AttendanceProps {
  students: Student[];
  onRefresh: () => Promise<void>;
}

const Attendance: React.FC<AttendanceProps> = ({ students, onRefresh }) => {
  // selectedIds lưu trữ rowIndex của những học sinh ĐANG ĐƯỢC CHỌN LÀ VẮNG MẶT
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [filterKhoi, setFilterKhoi] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);

  // Đồng bộ selectedIds với dữ liệu từ database khi ngày hoặc danh sách học sinh thay đổi
  useEffect(() => {
    const currentAbsences = new Set<number>();
    students.forEach(s => {
      if (s.rowIndex && (s['ĐIỂM DANH HS'] || '').includes(attendanceDate)) {
        currentAbsences.add(s.rowIndex);
      }
    });
    setSelectedIds(currentAbsences);
  }, [attendanceDate, students]);

  const dateDisplay = useMemo(() => {
    const d = new Date(attendanceDate);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }, [attendanceDate]);

  const systemStats = useMemo(() => {
    // Thống kê dựa trên trạng thái hiện tại trong selectedIds (chưa lưu hoặc đã lưu)
    const allAbsent = Array.from(selectedIds).length;
    const allStudents = students.length;
    
    let gradeAbsent = 0;
    let gradeTotal = 0;
    
    if (filterKhoi) {
      const gradeList = students.filter(s => String(s['KHỐI']) === filterKhoi);
      gradeTotal = gradeList.length;
      gradeAbsent = gradeList.filter(s => selectedIds.has(s.rowIndex!)).length;
    } else {
      gradeTotal = allStudents;
      gradeAbsent = allAbsent;
    }

    return { allAbsent, allStudents, gradeAbsent, gradeTotal };
  }, [students, selectedIds, filterKhoi]);

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
    if (newSet.has(rowIndex)) {
      newSet.delete(rowIndex);
    } else {
      newSet.add(rowIndex);
    }
    setSelectedIds(newSet);
  };

  const handleSaveAttendance = async () => {
    // Tìm những học sinh có thay đổi so với database
    const updates = students.map(student => {
      const isNowAbsent = selectedIds.has(student.rowIndex!);
      const wasAbsentInDB = (student['ĐIỂM DANH HS'] || '').includes(attendanceDate);
      
      if (isNowAbsent === wasAbsentInDB) return null; // Không có thay đổi

      const currentAbsencesList = (student['ĐIỂM DANH HS'] || '').split(' ').filter(d => d);
      let newAbsencesStr;
      
      if (isNowAbsent) {
        // Thêm ngày vắng mới
        newAbsencesStr = [...currentAbsencesList, attendanceDate].sort().join(' ');
      } else {
        // Xóa ngày vắng
        newAbsencesStr = currentAbsencesList.filter(d => d !== attendanceDate).join(' ');
      }
      
      return {
        rowIndex: student.rowIndex,
        data: { ...student, 'ĐIỂM DANH HS': newAbsencesStr }
      };
    }).filter(item => item !== null);

    if (updates.length === 0) {
      alert("Không có thay đổi nào để lưu!");
      return;
    }

    if (!confirm(`Xác nhận cập nhật điểm danh cho ${updates.length} học sinh có thay đổi vào ngày ${dateDisplay}?`)) return;

    setSaving(true);
    try {
      const updatePromises = updates.map(update => 
        apiService.saveStudent('updateData', update!.data, update!.rowIndex)
      );

      await Promise.all(updatePromises);
      alert("Đã cập nhật điểm danh thành công!");
      await onRefresh();
    } catch (error: any) {
      alert("Lỗi khi lưu điểm danh: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-24 md:pb-8">
      {/* Header */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-blue-900 uppercase flex items-center gap-2">
              <div className="w-1 h-5 bg-red-500 rounded-full"></div>
              Điểm danh vắng mặt
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
            placeholder="Tìm tên học sinh..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-4 py-2.5 bg-white border border-gray-100 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-xs font-bold shadow-sm"
          />
        </div>
        <select 
          value={filterKhoi}
          onChange={(e) => setFilterKhoi(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-100 rounded-xl font-black text-[10px] text-blue-800 outline-none focus:ring-1 focus:ring-blue-500 shadow-sm uppercase"
        >
          <option value="">Tất cả Nhóm</option>
          {activeGradesForFilter.map((grade) => (
            <option key={grade} value={grade}>Nhóm {grade}</option>
          ))}
        </select>
      </div>

      {/* Danh sách học sinh */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filteredStudents.map((student) => {
          const isSelected = selectedIds.has(student.rowIndex!);
          const wasAbsentInDB = (student['ĐIỂM DANH HS'] || '').includes(attendanceDate);

          return (
            <div 
              key={student.rowIndex}
              onClick={() => toggleStudent(student.rowIndex!)}
              className={`relative p-3 rounded-xl border-2 transition-all cursor-pointer select-none flex items-center gap-3 ${
                isSelected 
                ? 'bg-red-50 border-red-500 shadow-sm ring-2 ring-red-100' 
                : 'bg-white border-white hover:border-blue-100 shadow-sm'
              }`}
            >
              {/* Icon Trạng thái */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                isSelected ? 'bg-red-600 text-white' : 'bg-blue-100 text-blue-600'
              }`}>
                {isSelected ? (
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

              {/* Badge Trạng thái Database */}
              {wasAbsentInDB && !isSelected && (
                <span className="text-[8px] font-black text-orange-400 uppercase bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">Bỏ vắng?</span>
              )}
              {isSelected && !wasAbsentInDB && (
                <span className="text-[8px] font-black text-red-500 uppercase bg-white px-1.5 py-0.5 rounded border border-red-200">Mới</span>
              )}
              {isSelected && wasAbsentInDB && (
                <span className="text-[8px] font-black text-red-400 uppercase opacity-50">Đã vắng</span>
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
          disabled={saving}
          className={`w-full py-3.5 rounded-2xl font-black shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
            !saving 
            ? 'bg-blue-700 text-white animate-bounce-short' 
            : 'bg-gray-400 text-white cursor-not-allowed'
          }`}
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span className="text-xs uppercase">LƯU ĐIỂM DANH ({selectedIds.size})</span>
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
