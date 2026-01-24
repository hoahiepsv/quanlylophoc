
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

  // Thống kê vắng mặt thực tế đã lưu trong hệ thống
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
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-blue-50">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div className="space-y-2">
            <h2 className="text-xl font-black text-blue-900 uppercase flex items-center gap-3">
              <span className="w-2 h-8 bg-red-500 rounded-full"></span>
              Điểm danh vắng mặt
            </h2>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-dashed border-gray-200">
               <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Chọn ngày điểm danh:</label>
                  <input 
                    type="date" 
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  />
               </div>
               <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase mb-1">Đang hiển thị cho ngày:</span>
                  <span className="text-lg font-black text-red-600 leading-none">{dateDisplay}</span>
               </div>
            </div>
          </div>
          
          <button
            onClick={handleSaveAttendance}
            disabled={saving || selectedIds.size === 0}
            className={`px-8 py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center gap-3 whitespace-nowrap ${
              selectedIds.size > 0 && !saving ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
            LƯU VẮNG MẶT ({selectedIds.size})
          </button>
        </div>

        {/* Stats Section - New requirement */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-blue-900 text-white p-5 rounded-2xl shadow-lg border-b-4 border-blue-950 flex justify-between items-center">
             <div>
                <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-1">Tổng vắng hệ thống (Tất cả)</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black">{systemStats.allAbsent}</span>
                  <span className="text-xs font-bold opacity-60">/ {systemStats.allStudents} học sinh</span>
                </div>
             </div>
             <div className="p-3 bg-white/10 rounded-xl">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
               </svg>
             </div>
          </div>
          <div className="bg-emerald-700 text-white p-5 rounded-2xl shadow-lg border-b-4 border-emerald-900 flex justify-between items-center">
             <div>
                <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest mb-1">
                  Vắng {filterKhoi ? `Nhóm ${filterKhoi}` : 'Nhóm đang chọn'}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black">{systemStats.gradeAbsent}</span>
                  <span className="text-xs font-bold opacity-60">/ {systemStats.gradeTotal} học sinh</span>
                </div>
             </div>
             <div className="p-3 bg-white/10 rounded-xl">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
               </svg>
             </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </span>
            <input 
              type="text" 
              placeholder="Tìm kiếm tên học sinh..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium shadow-sm"
            />
          </div>
          <select 
            value={filterKhoi}
            onChange={(e) => {
              setFilterKhoi(e.target.value);
              setSelectedIds(new Set()); // Reset selection when changing filter
            }}
            className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-700 shadow-sm"
          >
            <option value="">Tất cả các nhóm có học sinh</option>
            {activeGradesForFilter.map((grade) => (
              <option key={grade} value={grade}>Nhóm {grade}</option>
            ))}
          </select>
        </div>

        {/* Student Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredStudents.map((student) => {
            const isSelected = selectedIds.has(student.rowIndex!);
            const isAlreadyAbsent = (student['ĐIỂM DANH HS'] || '').includes(attendanceDate);

            return (
              <div 
                key={student.rowIndex}
                onClick={() => !isAlreadyAbsent && toggleStudent(student.rowIndex!)}
                className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer select-none h-28 flex flex-col justify-between ${
                  isAlreadyAbsent 
                  ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed' 
                  : isSelected 
                  ? 'bg-red-50 border-red-500 shadow-md ring-2 ring-red-200 transform scale-[1.02]' 
                  : 'bg-white border-gray-100 hover:border-red-200 hover:bg-red-50/20'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${isSelected ? 'bg-red-200 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                    Nhóm {student['KHỐI']}
                  </span>
                  {isSelected && (
                    <div className="bg-red-600 text-white rounded-full p-1 shadow-md">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  {isAlreadyAbsent && (
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-black text-gray-400 italic">ĐÃ VẮNG</span>
                      <span className="text-[8px] text-gray-300 font-mono">{attendanceDate}</span>
                    </div>
                  )}
                </div>
                <div>
                  <h4 className={`font-black text-sm leading-tight mb-1 truncate ${isSelected ? 'text-red-900' : 'text-gray-800'}`}>
                    {student['HỌ TÊN HS']}
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{student['TÊN LỚP']}</p>
                </div>
              </div>
            );
          })}
        </div>

        {filteredStudents.length === 0 && (
          <div className="text-center py-20 flex flex-col items-center opacity-30">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            <p className="font-black text-lg uppercase tracking-widest">KHÔNG TÌM THẤY HỌC SINH NÀO</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Attendance;
