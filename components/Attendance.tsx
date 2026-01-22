
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

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayVN = useMemo(() => {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }, []);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchKhoi = filterKhoi === '' || String(s['KHỐI']) === filterKhoi;
      const matchSearch = s['HỌ TÊN HS'].toLowerCase().includes(searchTerm.toLowerCase());
      return matchKhoi && matchSearch;
    }).sort((a, b) => parseInt(String(a['KHỐI'])) - parseInt(String(b['KHỐI'])));
  }, [students, filterKhoi, searchTerm]);

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

    if (!confirm(`Xác nhận ghi nhận vắng mặt cho ${selectedIds.size} học sinh vào ngày ${todayVN}?`)) return;

    setSaving(true);
    try {
      const updatePromises = Array.from(selectedIds).map((rowIndex: number) => {
        const student = students.find(s => s.rowIndex === rowIndex);
        if (!student) return Promise.resolve();

        const currentAbsences = (student['ĐIỂM DANH HS'] || '').split(' ').filter(d => d);
        if (currentAbsences.includes(todayStr)) return Promise.resolve();

        const newAbsences = [...currentAbsences, todayStr].sort().join(' ');
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black text-blue-900 uppercase flex items-center gap-3">
              <span className="w-2 h-8 bg-red-500 rounded-full"></span>
              Điểm danh vắng mặt hôm nay
            </h2>
            <p className="text-sm text-gray-500 font-bold mt-1 uppercase tracking-tighter">Ngày: <span className="text-red-600">{todayVN}</span></p>
          </div>
          
          <button
            onClick={handleSaveAttendance}
            disabled={saving || selectedIds.size === 0}
            className={`px-8 py-3 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center gap-2 ${
              selectedIds.size > 0 && !saving ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            LƯU VẮNG MẶT ({selectedIds.size})
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <input 
            type="text" 
            placeholder="Tìm kiếm tên học sinh..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
          />
          <select 
            value={filterKhoi}
            onChange={(e) => setFilterKhoi(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-700"
          >
            <option value="">Tất cả các nhóm</option>
            {[...Array(12)].map((_, i) => (
              <option key={i+1} value={i+1}>Nhóm {i+1}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredStudents.map((student) => {
            const isSelected = selectedIds.has(student.rowIndex!);
            const isAlreadyAbsent = (student['ĐIỂM DANH HS'] || '').includes(todayStr);

            return (
              <div 
                key={student.rowIndex}
                onClick={() => !isAlreadyAbsent && toggleStudent(student.rowIndex!)}
                className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer select-none ${
                  isAlreadyAbsent 
                  ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed' 
                  : isSelected 
                  ? 'bg-red-50 border-red-500 shadow-md ring-2 ring-red-200' 
                  : 'bg-white border-gray-100 hover:border-red-200 hover:bg-red-50/20'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase ${isSelected ? 'bg-red-200 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                    Nhóm {student['KHỐI']}
                  </span>
                  {isSelected && (
                    <div className="bg-red-600 text-white rounded-full p-1 shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  {isAlreadyAbsent && (
                    <span className="text-[9px] font-black text-gray-400 italic">Đã vắng</span>
                  )}
                </div>
                <h4 className={`font-black text-sm leading-tight ${isSelected ? 'text-red-900' : 'text-gray-800'}`}>
                  {student['HỌ TÊN HS']}
                </h4>
                <p className="text-[10px] text-gray-400 font-bold mt-1">{student['TÊN LỚP']}</p>
              </div>
            );
          })}
        </div>

        {filteredStudents.length === 0 && (
          <div className="text-center py-20 opacity-30">
            <p className="font-black text-lg">KHÔNG TÌM THẤY HỌC SINH</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Attendance;
