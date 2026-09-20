import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Student } from '../types';
import { apiService } from '../services/apiService';
import { matchStudentSearch, cleanDateStr, formatFullDateVN } from '../utils';
import html2canvas from 'html2canvas';

interface AttendanceProps {
  students: Student[];
  onRefresh: () => Promise<void>;
}

const Attendance: React.FC<AttendanceProps> = ({ students, onRefresh }) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [filterKhoi, setFilterKhoi] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(cleanDateStr(new Date()));
  const [onlyScheduled, setOnlyScheduled] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const reportJpegRef = useRef<HTMLDivElement>(null);
  const previewModalRef = useRef<HTMLDivElement>(null);

  // Hiển thị toast thông báo
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Đồng bộ danh sách học sinh vắng từ cơ sở dữ liệu dựa trên ngày điểm danh
  useEffect(() => {
    const currentAbsences = new Set<number>();
    students.forEach(s => {
      const dbAbsences = (s['ĐIỂM DANH HS'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
      if (s.rowIndex && dbAbsences.includes(attendanceDate)) {
        currentAbsences.add(s.rowIndex);
      }
    });
    setSelectedIds(currentAbsences);
  }, [attendanceDate, students]);

  // Kiểm tra học sinh có lịch học vào ngày điểm danh hay không
  const hasScheduleOnDate = (s: Student, dateStr: string): boolean => {
    const scheduleDates = (s['LỊCH HỌC'] || '').split(' ').filter(Boolean).map(d => cleanDateStr(d));
    return scheduleDates.includes(dateStr);
  };

  // Đếm số buổi vắng của học sinh trong tháng của ngày điểm danh
  const getAbsenceCountInMonth = (s: Student, dateStr: string): number => {
    const monthPrefix = dateStr.substring(0, 7); // "YYYY-MM"
    const absences = (s['ĐIỂM DANH HS'] || '').split(' ').filter(Boolean).map(d => cleanDateStr(d));
    return absences.filter(d => d.startsWith(monthPrefix)).length;
  };

  // Danh sách các nhóm hợp lệ trong hệ thống
  const activeGradesForFilter = useMemo(() => {
    const grades = new Set<string>();
    students.forEach(s => {
      const k = String(s['KHỐI'] || '').trim();
      if (k && k !== 'undefined' && k !== 'Đã thôi học') grades.add(k);
    });
    return Array.from(grades).sort((a, b) => {
      const nA = parseInt(a);
      const nB = parseInt(b);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      if (!isNaN(nA)) return -1;
      if (!isNaN(nB)) return 1;
      return a.localeCompare(b, 'vi');
    });
  }, [students]);

  // Thống kê chi tiết theo từng nhóm trong ngày điểm danh
  const groupsStatsMap = useMemo(() => {
    const map = new Map<string, { totalScheduled: number; absentCount: number; presentCount: number; totalStudents: number }>();
    
    activeGradesForFilter.forEach(grade => {
      const gradeStudents = students.filter(s => String(s['KHỐI'] || '').trim() === grade);
      const scheduledInGrade = gradeStudents.filter(s => hasScheduleOnDate(s, attendanceDate));
      const absentInGrade = gradeStudents.filter(s => s.rowIndex && selectedIds.has(s.rowIndex)).length;
      const scheduledCount = scheduledInGrade.length;
      const presentCount = Math.max(0, scheduledCount - absentInGrade);
      
      map.set(grade, {
        totalScheduled: scheduledCount,
        absentCount: absentInGrade,
        presentCount: presentCount,
        totalStudents: gradeStudents.length
      });
    });

    return map;
  }, [students, activeGradesForFilter, attendanceDate, selectedIds]);

  // Danh sách toàn bộ học sinh có lịch học vào ngày điểm danh
  const allScheduledStudentsToday = useMemo(() => {
    return students.filter(s => hasScheduleOnDate(s, attendanceDate));
  }, [students, attendanceDate]);

  // Thống kê tổng hợp cho màn hình điểm danh hiện tại
  const systemStats = useMemo(() => {
    const targetStudents = filterKhoi 
      ? students.filter(s => String(s['KHỐI'] || '').trim() === filterKhoi)
      : students;

    const scheduledList = targetStudents.filter(s => hasScheduleOnDate(s, attendanceDate));
    const totalScheduled = scheduledList.length;
    const absentCount = targetStudents.filter(s => s.rowIndex && selectedIds.has(s.rowIndex)).length;
    const presentCount = Math.max(0, totalScheduled - absentCount);
    const presentRate = totalScheduled > 0 ? Math.round((presentCount / totalScheduled) * 100) : 100;

    return {
      totalScheduled,
      absentCount,
      presentCount,
      presentRate,
      totalInGroup: targetStudents.length,
      allScheduledAcrossSystem: allScheduledStudentsToday.length,
      allAbsentAcrossSystem: selectedIds.size
    };
  }, [students, filterKhoi, attendanceDate, selectedIds, allScheduledStudentsToday]);

  // Học sinh sau khi lọc:
  // 1. Theo nhóm (nếu có chọn)
  // 2. Chỉ hiện học sinh có lịch học ngày điểm danh (hoặc đã bị đánh dấu vắng) nếu bật onlyScheduled
  // 3. Tìm kiếm theo tên / SĐT / lớp
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      // 1. Lọc theo Nhóm
      const matchKhoi = filterKhoi === '' || String(s['KHỐI'] || '').trim() === filterKhoi;
      if (!matchKhoi) return false;

      // 2. Lọc chỉ hiện học sinh có lịch học ngày điểm danh
      if (onlyScheduled) {
        const hasSchedule = hasScheduleOnDate(s, attendanceDate);
        const isAbsent = s.rowIndex ? selectedIds.has(s.rowIndex) : false;
        if (!hasSchedule && !isAbsent) return false;
      }

      // 3. Tìm kiếm không phân biệt dấu / hoa thường
      const matchSearch = matchStudentSearch(s, searchTerm);
      return matchSearch;
    }).sort((a, b) => {
      // Sắp xếp theo Nhóm, sau đó theo Tên chuẩn tiếng Việt
      const gradeA = String(a['KHỐI'] || '').trim();
      const gradeB = String(b['KHỐI'] || '').trim();
      
      const numA = parseInt(gradeA);
      const numB = parseInt(gradeB);

      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      } else if (!isNaN(numA)) {
        return -1;
      } else if (!isNaN(numB)) {
        return 1;
      } else {
        if (gradeA !== gradeB) {
          if (gradeA === 'Đã thôi học') return 1;
          if (gradeB === 'Đã thôi học') return -1;
          return gradeA.localeCompare(gradeB, 'vi');
        }
      }

      const nameA = (a['HỌ TÊN HS'] || '').trim();
      const nameB = (b['HỌ TÊN HS'] || '').trim();
      
      const partsA = nameA.split(' ').filter(Boolean);
      const partsB = nameB.split(' ').filter(Boolean);
      
      const lastA = partsA[partsA.length - 1] || '';
      const lastB = partsB[partsB.length - 1] || '';

      const cmpLast = lastA.localeCompare(lastB, 'vi');
      if (cmpLast !== 0) return cmpLast;
      return nameA.localeCompare(nameB, 'vi');
    });
  }, [students, filterKhoi, onlyScheduled, attendanceDate, selectedIds, searchTerm]);

  // Gom nhóm học sinh theo Nhóm để hiển thị phân cấp chuyên nghiệp
  const groupedStudents = useMemo(() => {
    const groups: { [key: string]: Student[] } = {};
    filteredStudents.forEach(s => {
      const g = String(s['KHỐI'] || '').trim() || 'Khác';
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });
    return groups;
  }, [filteredStudents]);

  // Danh sách các học sinh VẮNG để xuất báo cáo JPEG
  const absentStudentsForReport = useMemo(() => {
    return students.filter(s => {
      const matchKhoi = filterKhoi === '' || String(s['KHỐI'] || '').trim() === filterKhoi;
      if (!matchKhoi) return false;
      return s.rowIndex && selectedIds.has(s.rowIndex);
    }).sort((a, b) => {
      const gradeA = String(a['KHỐI'] || '').trim();
      const gradeB = String(b['KHỐI'] || '').trim();
      if (gradeA !== gradeB) return gradeA.localeCompare(gradeB, 'vi');
      return (a['HỌ TÊN HS'] || '').localeCompare(b['HỌ TÊN HS'] || '', 'vi');
    });
  }, [students, filterKhoi, selectedIds]);

  // Bật/tắt trạng thái vắng của học sinh
  const toggleStudent = (rowIndex: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(rowIndex)) {
      newSet.delete(rowIndex);
    } else {
      newSet.add(rowIndex);
    }
    setSelectedIds(newSet);
  };

  // Đánh dấu tất cả học sinh trong phạm vi đang xem là có mặt
  const handleMarkAllPresent = () => {
    const targetRowIndexes = filteredStudents.map(s => s.rowIndex).filter((id): id is number => id !== undefined);
    if (targetRowIndexes.length === 0) return;
    const newSet = new Set(selectedIds);
    targetRowIndexes.forEach(id => newSet.delete(id));
    setSelectedIds(newSet);
    showToast(`Đã đánh dấu tất cả ${targetRowIndexes.length} học sinh có mặt! Nhớ bấm Lưu.`);
  };

  // Đánh dấu tất cả học sinh trong phạm vi đang xem là vắng
  const handleMarkAllAbsent = () => {
    const targetRowIndexes = filteredStudents.map(s => s.rowIndex).filter((id): id is number => id !== undefined);
    if (targetRowIndexes.length === 0) return;
    const newSet = new Set(selectedIds);
    targetRowIndexes.forEach(id => newSet.add(id));
    setSelectedIds(newSet);
    showToast(`Đã đánh dấu tất cả ${targetRowIndexes.length} học sinh vắng! Nhớ bấm Lưu.`);
  };

  // Chuyển nhanh ngày
  const changeDateByOffset = (days: number) => {
    const d = new Date(attendanceDate);
    d.setDate(d.getDate() + days);
    setAttendanceDate(cleanDateStr(d));
  };

  // Lưu điểm danh vào Google Sheet / Database
  const handleSaveAttendance = async () => {
    const updates = students.map(student => {
      const isNowAbsent = selectedIds.has(student.rowIndex!);
      const currentAbsencesList = (student['ĐIỂM DANH HS'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
      const wasAbsentInDB = currentAbsencesList.includes(attendanceDate);
      
      if (isNowAbsent === wasAbsentInDB) return null;

      let newAbsencesStr;
      const cleanTargetDate = attendanceDate;
      if (isNowAbsent) {
        newAbsencesStr = Array.from(new Set([...currentAbsencesList, cleanTargetDate])).sort().join(' ');
      } else {
        newAbsencesStr = currentAbsencesList.filter(d => d !== cleanTargetDate).join(' ');
      }

      const cleanedStartDate = cleanDateStr(student['NGÀY BẮT ĐẦU']);
      
      return {
        rowIndex: student.rowIndex,
        data: { 
          ...student, 
          'ĐIỂM DANH HS': newAbsencesStr,
          'NGÀY BẮT ĐẦU': cleanedStartDate 
        }
      };
    }).filter(item => item !== null);

    if (updates.length === 0) {
      alert("Không có thay đổi nào để lưu!");
      return;
    }

    if (!confirm(`Xác nhận cập nhật điểm danh ngày ${attendanceDate} cho ${updates.length} học sinh?`)) return;

    setSaving(true);
    try {
      const updatePromises = updates.map(update => 
        apiService.saveStudent('updateData', update!.data, update!.rowIndex)
      );

      await Promise.all(updatePromises);
      showToast("✓ Đã lưu điểm danh thành công lên hệ thống!");
      await onRefresh();
    } catch (error: any) {
      alert("Lỗi khi lưu điểm danh: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Xuất file ảnh JPEG báo cáo học sinh vắng ngày đó
  const exportAbsentReportJPEG = async () => {
    if (!reportJpegRef.current) return;
    setIsExporting(true);
    try {
      const element = reportJpegRef.current;
      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 850
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      const groupSuffix = filterKhoi ? `Nhom_${filterKhoi.replace(/\s+/g, '_')}` : 'Tat_Ca_Nhom';
      link.href = imgData;
      link.download = `Bao_Cao_Vang_${groupSuffix}_${attendanceDate}.jpg`;
      link.click();

      showToast("✓ Đã xuất và tải về ảnh JPEG báo cáo học sinh vắng thành công!");
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi tạo hình ảnh JPEG: " + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsExporting(false);
    }
  };

  const groupDisplayName = filterKhoi 
    ? (String(filterKhoi).startsWith('Nhóm') ? filterKhoi : `Nhóm ${filterKhoi}`)
    : 'Tất cả các nhóm';

  return (
    <div className="space-y-4 animate-fadeIn pb-28 md:pb-12 max-w-7xl mx-auto">
      {/* Toast thông báo nhanh */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[100] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border border-slate-700 animate-fadeIn">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER CARD: Quản lý ngày & Thống kê & Nút xuất báo cáo JPEG */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-blue-50">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-5 bg-blue-600 rounded-full"></div>
                <h2 className="text-base sm:text-lg font-black text-blue-950 uppercase tracking-tight">
                  Điểm danh học sinh theo nhóm
                </h2>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-0.5 ml-4">
                {formatFullDateVN(attendanceDate)} • <span className="font-bold text-blue-700">{groupDisplayName}</span>
              </p>
            </div>

            {/* Điều hướng và chọn ngày điểm danh */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => changeDateByOffset(-1)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="Ngày hôm trước"
              >
                ◀
              </button>
              <input 
                type="date" 
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
                className="bg-blue-50/70 border border-blue-200 text-xs font-black text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none rounded-xl px-3 py-1.5 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => changeDateByOffset(1)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="Ngày hôm sau"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={() => setAttendanceDate(cleanDateStr(new Date()))}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer ml-1"
              >
                Hôm nay
              </button>
            </div>
          </div>

          {/* Hộp thống kê KPI ngày điểm danh */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-gradient-to-br from-blue-50/70 to-blue-100/40 p-3 rounded-2xl border border-blue-100">
              <span className="text-[10px] font-black text-blue-600 uppercase block">HS Có lịch hôm nay</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black text-blue-950">{systemStats.totalScheduled}</span>
                <span className="text-[11px] font-bold text-gray-400">/ {systemStats.totalInGroup} HS</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50/70 to-emerald-100/40 p-3 rounded-2xl border border-emerald-100">
              <span className="text-[10px] font-black text-emerald-600 uppercase block">Có mặt đi học</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black text-emerald-800">{systemStats.presentCount}</span>
                <span className="text-[11px] font-bold text-emerald-600">({systemStats.presentRate}%)</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-50/70 to-red-100/40 p-3 rounded-2xl border border-red-100">
              <span className="text-[10px] font-black text-red-600 uppercase block">Vắng mặt</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black text-red-800">{systemStats.absentCount}</span>
                <span className="text-[11px] font-bold text-red-500">học sinh</span>
              </div>
            </div>

            {/* Nút thao tác xuất báo cáo JPEG ngay trên header */}
            <div className="bg-gradient-to-br from-amber-50/80 to-amber-100/40 p-2.5 rounded-2xl border border-amber-200 flex flex-col justify-center gap-1.5">
              <button
                type="button"
                onClick={exportAbsentReportJPEG}
                disabled={isExporting}
                className={`w-full py-1.5 px-2 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                  isExporting 
                    ? 'bg-amber-300 text-amber-900 cursor-not-allowed' 
                    : 'bg-amber-500 hover:bg-amber-600 text-white active:scale-95'
                }`}
                title="Xuất ảnh JPEG danh sách học sinh vắng ngày này"
              >
                {isExporting ? (
                  <span className="animate-spin inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                <span>Xuất JPEG Vắng</span>
              </button>
              
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="w-full py-1 px-2 text-[10px] font-black uppercase text-amber-800 hover:text-amber-950 bg-white/70 hover:bg-white rounded-lg transition-all border border-amber-200/60 flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Xem trước ảnh</span>
              </button>
            </div>
          </div>

          {/* Lọc chế độ: Chỉ hiện HS có lịch học ngày điểm danh (Bật mặc định theo yêu cầu) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={onlyScheduled} 
                  onChange={(e) => setOnlyScheduled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-2 text-xs font-black text-gray-800 flex items-center gap-1.5">
                  Chỉ hiện học sinh có lịch học ngày này
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800">
                    {allScheduledStudentsToday.length} HS
                  </span>
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-all text-[11px] font-black cursor-pointer border border-emerald-200"
              >
                ✓ Cả nhóm có mặt
              </button>
              <button
                type="button"
                onClick={handleMarkAllAbsent}
                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-all text-[11px] font-black cursor-pointer border border-red-200"
              >
                ✕ Cả nhóm vắng
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* THANH CHỌN THEO NHÓM (Tabs / Pills) */}
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-blue-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Chọn Nhóm điểm danh
          </span>
          <span className="text-[10px] font-bold text-gray-400">
            Hiển thị: {filteredStudents.length} học sinh
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => setFilterKhoi('')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              filterKhoi === ''
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'bg-slate-100 hover:bg-slate-200 text-gray-700'
            }`}
          >
            <span>Tất cả các nhóm</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${filterKhoi === '' ? 'bg-blue-800 text-white' : 'bg-gray-200 text-gray-700'}`}>
              {allScheduledStudentsToday.length}
            </span>
          </button>

          {activeGradesForFilter.map((grade) => {
            const stats = groupsStatsMap.get(grade);
            const isSelected = filterKhoi === grade;
            const scheduledCount = stats?.totalScheduled || 0;
            const absentCount = stats?.absentCount || 0;

            return (
              <button
                key={grade}
                type="button"
                onClick={() => setFilterKhoi(grade)}
                className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-slate-50 hover:bg-slate-100 text-gray-700 border border-gray-100'
                }`}
              >
                <span>{grade.startsWith('Nhóm') ? grade : `Nhóm ${grade}`}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                  isSelected 
                    ? 'bg-blue-800 text-white' 
                    : scheduledCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'
                }`}>
                  {scheduledCount} HS
                </span>
                {absentCount > 0 && (
                  <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'}`}>
                    {absentCount} vắng
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TÌM KIẾM HỌC SINH */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 pointer-events-none">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
        <input 
          type="text" 
          placeholder="Tìm học sinh theo tên, SĐT, lớp (có hoặc không dấu)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-9 py-3 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-gray-800 shadow-sm"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-700 font-bold text-xs cursor-pointer"
            title="Xoá tìm kiếm"
          >
            ✕
          </button>
        )}
      </div>

      {/* DANH SÁCH HỌC SINH ĐIỂM DANH */}
      {filteredStudents.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center font-black text-xl">
            📅
          </div>
          <h3 className="text-sm font-black text-gray-800">
            {onlyScheduled 
              ? `Không có học sinh nào có lịch học vào ngày ${attendanceDate}` 
              : 'Không tìm thấy học sinh nào phù hợp'}
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {onlyScheduled 
              ? 'Hôm nay không có lịch học dự kiến cho nhóm được chọn. Bạn có thể chọn ngày khác hoặc chuyển sang chế độ "Hiện tất cả học sinh".' 
              : 'Thử kiểm tra lại từ khóa tìm kiếm hoặc bộ lọc nhóm.'}
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            {onlyScheduled && (
              <button
                type="button"
                onClick={() => setOnlyScheduled(false)}
                className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Hiển thị tất cả học sinh ({students.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setAttendanceDate(cleanDateStr(new Date()))}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Chọn ngày hôm nay
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Nếu chọn Tất cả các nhóm: Hiển thị phân tách từng nhóm */}
          {filterKhoi === '' ? (
            Object.keys(groupedStudents).map(groupName => {
              const studentsInThisGroup = groupedStudents[groupName];
              const groupAbsentCount = studentsInThisGroup.filter(s => s.rowIndex && selectedIds.has(s.rowIndex)).length;

              return (
                <div key={groupName} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      <h3 className="text-xs font-black text-blue-900 uppercase">
                        {groupName.startsWith('Nhóm') ? groupName : `Nhóm ${groupName}`}
                      </h3>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {studentsInThisGroup.length} học sinh
                      </span>
                    </div>

                    {groupAbsentCount > 0 ? (
                      <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                        {groupAbsentCount} vắng mặt
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                        ✓ Đầy đủ
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {studentsInThisGroup.map(student => renderStudentCard(student))}
                  </div>
                </div>
              );
            })
          ) : (
            /* Nếu chọn 1 nhóm cụ thể: Hiển thị lưới trực tiếp */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredStudents.map(student => renderStudentCard(student))}
            </div>
          )}
        </div>
      )}

      {/* THANH THAO TÁC CỐ ĐỊNH PHÍA DƯỚI (LƯU & XUẤT ẢNH) */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-[60] flex items-center gap-2">
        <button
          type="button"
          onClick={handleSaveAttendance}
          disabled={saving}
          className={`flex-1 py-3.5 px-4 rounded-2xl font-black shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2 ${
            !saving 
              ? 'bg-blue-700 hover:bg-blue-800 text-white animate-bounce-short' 
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
              <span className="text-xs uppercase">LƯU ĐIỂM DANH ({selectedIds.size} VẮNG)</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={exportAbsentReportJPEG}
          disabled={isExporting}
          className="py-3.5 px-4 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-2xl font-black shadow-2xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          title="Xuất ảnh JPEG danh sách học sinh vắng"
        >
          {isExporting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
          <span className="text-xs uppercase hidden sm:inline">Ảnh JPEG</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* KHU VỰC RENDER TEMPLATE ẢNH JPEG BÁO CÁO HỌC SINH VẮNG (Bắt bởi html2canvas) */}
      {/* ========================================================================= */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div 
          ref={reportJpegRef} 
          style={{ 
            width: '850px', 
            padding: '36px', 
            backgroundColor: '#ffffff', 
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#1e293b'
          }}
        >
          {/* Header Báo cáo */}
          <div style={{ 
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', 
            borderRadius: '16px', 
            padding: '24px 28px', 
            color: '#ffffff',
            marginBottom: '24px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#93c5fd', marginBottom: '6px' }}>
              LỚP HỌC THẦY HOÀ HIỆP • QUẢN LÝ ĐIỂM DANH
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: '900', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              BÁO CÁO HỌC SINH VẮNG HỌC
            </h1>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#e0f2fe' }}>
              📅 {formatFullDateVN(attendanceDate)} &nbsp;•&nbsp; 👥 {groupDisplayName}
            </div>
          </div>

          {/* Hộp chỉ số tổng hợp KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
            <div style={{ 
              backgroundColor: '#eff6ff', 
              border: '1.5px solid #bfdbfe', 
              borderRadius: '14px', 
              padding: '14px', 
              textAlign: 'center' 
            }}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase', display: 'block' }}>
                HS CÓ LỊCH HỌC
              </span>
              <span style={{ fontSize: '28px', fontWeight: '900', color: '#1e3a8a', display: 'block', margin: '4px 0' }}>
                {systemStats.totalScheduled}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>
                Tổng quy mô nhóm: {systemStats.totalInGroup} HS
              </span>
            </div>

            <div style={{ 
              backgroundColor: '#ecfdf5', 
              border: '1.5px solid #a7f3d0', 
              borderRadius: '14px', 
              padding: '14px', 
              textAlign: 'center' 
            }}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#059669', textTransform: 'uppercase', display: 'block' }}>
                CÓ MẶT ĐI HỌC
              </span>
              <span style={{ fontSize: '28px', fontWeight: '900', color: '#065f46', display: 'block', margin: '4px 0' }}>
                {systemStats.presentCount}
              </span>
              <span style={{ fontSize: '10px', color: '#059669', fontWeight: '700' }}>
                Tỷ lệ đi học: {systemStats.presentRate}%
              </span>
            </div>

            <div style={{ 
              backgroundColor: '#fef2f2', 
              border: '1.5px solid #fecaca', 
              borderRadius: '14px', 
              padding: '14px', 
              textAlign: 'center' 
            }}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', textTransform: 'uppercase', display: 'block' }}>
                VẮNG MẶT
              </span>
              <span style={{ fontSize: '28px', fontWeight: '900', color: '#991b1b', display: 'block', margin: '4px 0' }}>
                {absentStudentsForReport.length}
              </span>
              <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: '700' }}>
                {absentStudentsForReport.length > 0 ? 'Cần theo dõi & phụ đạo' : '100% đầy đủ'}
              </span>
            </div>
          </div>

          {/* DANH SÁCH CHI TIẾT HỌC SINH VẮNG */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '10px',
              borderBottom: '2px solid #e2e8f0',
              paddingBottom: '8px'
            }}>
              <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', margin: 0 }}>
                📋 Danh sách học sinh vắng ngày {attendanceDate.split('-').reverse().join('/')}
              </h2>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626' }}>
                Tổng cộng: {absentStudentsForReport.length} học sinh vắng
              </span>
            </div>

            {absentStudentsForReport.length === 0 ? (
              <div style={{ 
                backgroundColor: '#f0fdf4', 
                border: '2px dashed #86efac', 
                borderRadius: '14px', 
                padding: '30px', 
                textAlign: 'center' 
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🎉</div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#166534', marginBottom: '4px' }}>
                  Hôm nay 100% học sinh đi học đầy đủ!
                </div>
                <div style={{ fontSize: '13px', color: '#15803d' }}>
                  Không có học sinh nào vắng mặt trong buổi học ngày hôm nay.
                </div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}>
                    <th style={{ padding: '10px 8px', border: '1px solid #cbd5e1', textAlign: 'center', width: '40px' }}>STT</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #cbd5e1', textAlign: 'left' }}>Họ và tên học sinh</th>
                    <th style={{ padding: '10px 8px', border: '1px solid #cbd5e1', textAlign: 'center', width: '85px' }}>Nhóm</th>
                    <th style={{ padding: '10px 8px', border: '1px solid #cbd5e1', textAlign: 'center', width: '85px' }}>Lớp</th>
                    <th style={{ padding: '10px 10px', border: '1px solid #cbd5e1', textAlign: 'center', width: '150px' }}>SĐT Phụ huynh</th>
                    <th style={{ padding: '10px 8px', border: '1px solid #cbd5e1', textAlign: 'center', width: '110px' }}>Vắng trong tháng</th>
                  </tr>
                </thead>
                <tbody>
                  {absentStudentsForReport.map((s, idx) => {
                    const phone = s['SỐ ĐIỆN THOẠI 1'] || s['SỐ ĐIỆN THOẠI 2'] || '---';
                    const absenceCount = getAbsenceCountInMonth(s, attendanceDate);
                    const isEven = idx % 2 === 0;

                    return (
                      <tr key={s.rowIndex || idx} style={{ backgroundColor: isEven ? '#ffffff' : '#f8fafc' }}>
                        <td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '700' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', fontWeight: '800', color: '#1e3a8a' }}>
                          {s['HỌ TÊN HS']}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '700' }}>
                          {String(s['KHỐI']).startsWith('Nhóm') ? s['KHỐI'] : `Nhóm ${s['KHỐI']}`}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '600' }}>
                          {s['TÊN LỚP'] || '---'}
                        </td>
                        <td style={{ padding: '8px 10px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '700', color: '#0369a1' }}>
                          {phone}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                          <span style={{ 
                            backgroundColor: '#fee2e2', 
                            color: '#991b1b', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            fontWeight: '800',
                            fontSize: '11px'
                          }}>
                            {absenceCount} buổi
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Phân bổ theo từng nhóm (nếu chọn tất cả các nhóm) */}
          {filterKhoi === '' && activeGradesForFilter.length > 1 && (
            <div style={{ marginBottom: '24px', backgroundColor: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                📊 Phân bổ điểm danh các nhóm ngày hôm nay
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {activeGradesForFilter.map(g => {
                  const st = groupsStatsMap.get(g);
                  const scheduled = st?.totalScheduled || 0;
                  const absent = st?.absentCount || 0;
                  return (
                    <div key={g} style={{ backgroundColor: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                      <div style={{ fontWeight: '800', fontSize: '12px', color: '#1e3a8a' }}>
                        {g.startsWith('Nhóm') ? g : `Nhóm ${g}`}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                        Có lịch: <b>{scheduled}</b> • Vắng: <b style={{ color: absent > 0 ? '#dc2626' : '#16a34a' }}>{absent}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chân trang báo cáo */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-end', 
            paddingTop: '16px', 
            borderTop: '2px solid #e2e8f0' 
          }}>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              <div>Hệ thống quản lý lớp học Thầy Hoà Hiệp</div>
              <div>Thời gian xuất báo cáo: {new Date().toLocaleTimeString('vi-VN')} - {new Date().toLocaleDateString('vi-VN')}</div>
            </div>

            <div style={{ textAlign: 'center', minWidth: '180px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '35px', fontStyle: 'italic' }}>
                Giáo viên phụ trách
              </div>
              <div style={{ fontSize: '14px', fontWeight: '900', color: '#1e3a8a' }}>
                Thầy Hoà Hiệp
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL XEM TRƯỚC BÁO CÁO HỌC SINH VẮNG TRƯỚC KHI TẢI VỀ */}
      {/* ========================================================================= */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
          <div 
            ref={previewModalRef}
            className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-blue-800 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm sm:text-base uppercase tracking-tight">
                  Xem trước báo cáo học sinh vắng
                </h3>
                <p className="text-[11px] text-blue-200 mt-0.5">
                  {formatFullDateVN(attendanceDate)} • {groupDisplayName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-black transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 p-3 rounded-xl text-center">
                  <span className="text-[10px] font-black text-blue-500 uppercase block">Có lịch học</span>
                  <span className="text-xl font-black text-blue-900">{systemStats.totalScheduled}</span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl text-center">
                  <span className="text-[10px] font-black text-emerald-600 uppercase block">Có mặt</span>
                  <span className="text-xl font-black text-emerald-800">{systemStats.presentCount}</span>
                </div>
                <div className="bg-red-50 p-3 rounded-xl text-center">
                  <span className="text-[10px] font-black text-red-600 uppercase block">Vắng mặt</span>
                  <span className="text-xl font-black text-red-800">{absentStudentsForReport.length}</span>
                </div>
              </div>

              <div>
                <h4 className="font-black text-gray-800 uppercase text-[11px] mb-2">
                  Danh sách học sinh vắng ({absentStudentsForReport.length})
                </h4>
                {absentStudentsForReport.length === 0 ? (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-center font-bold">
                    ✓ Không có học sinh nào vắng mặt trong buổi học ngày hôm nay!
                  </div>
                ) : (
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100 text-gray-700 text-[10px] font-black uppercase">
                        <tr>
                          <th className="p-2 text-center w-8">#</th>
                          <th className="p-2">Họ tên</th>
                          <th className="p-2 text-center">Nhóm</th>
                          <th className="p-2 text-center">Lớp</th>
                          <th className="p-2 text-center">SĐT</th>
                          <th className="p-2 text-center">Vắng tháng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-semibold">
                        {absentStudentsForReport.map((s, i) => (
                          <tr key={s.rowIndex || i} className="hover:bg-slate-50">
                            <td className="p-2 text-center font-bold text-gray-400">{i + 1}</td>
                            <td className="p-2 font-black text-blue-900">{s['HỌ TÊN HS']}</td>
                            <td className="p-2 text-center font-bold">{s['KHỐI']}</td>
                            <td className="p-2 text-center text-gray-500">{s['TÊN LỚP']}</td>
                            <td className="p-2 text-center text-blue-600">{s['SỐ ĐIỆN THOẠI 1'] || s['SỐ ĐIỆN THOẠI 2'] || '-'}</td>
                            <td className="p-2 text-center">
                              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded font-black text-[10px]">
                                {getAbsenceCountInMonth(s, attendanceDate)} buổi
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2.5 bg-white hover:bg-gray-100 text-gray-700 font-bold rounded-xl text-xs transition-all border border-gray-200 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPreviewModal(false);
                  exportAbsentReportJPEG();
                }}
                disabled={isExporting}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Tải ảnh JPEG về máy</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

  // Helper render thẻ học sinh
  function renderStudentCard(student: Student) {
    const isSelected = selectedIds.has(student.rowIndex!);
    const dbAbsencesClean = (student['ĐIỂM DANH HS'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
    const wasAbsentInDB = dbAbsencesClean.includes(attendanceDate);
    const hasScheduled = hasScheduleOnDate(student, attendanceDate);

    return (
      <div 
        key={student.rowIndex}
        onClick={() => toggleStudent(student.rowIndex!)}
        className={`relative p-3 rounded-2xl border-2 transition-all cursor-pointer select-none flex items-center gap-3 ${
          isSelected 
          ? 'bg-red-50/90 border-red-500 shadow-sm ring-2 ring-red-100' 
          : 'bg-white border-white hover:border-blue-100 shadow-sm'
        }`}
      >
        <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
          isSelected ? 'bg-red-600 text-white shadow-sm' : 'bg-blue-50 text-blue-600'
        }`}>
          {isSelected ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <span className="text-[10px] font-black">
              {String(student['KHỐI']).startsWith('Nhóm') ? student['KHỐI'].replace(/^Nhóm\s*/i, 'N') : `N${student['KHỐI']}`}
            </span>
          )}
        </div>

        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className={`text-xs font-black truncate ${isSelected ? 'text-red-950' : 'text-gray-900'}`}>
              {student['HỌ TÊN HS']}
            </h4>
            {hasScheduled && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Có lịch học hôm nay"></span>
            )}
          </div>
          
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded-md uppercase">
              {String(student['KHỐI']).startsWith('Nhóm') ? student['KHỐI'] : `Nhóm ${student['KHỐI']}`}
            </span>
            <span className="text-[9px] font-semibold text-gray-400">
              Lớp {student['TÊN LỚP']}
            </span>
            {student['SỐ ĐIỆN THOẠI 1'] && (
              <span className="text-[9px] text-gray-400 hidden sm:inline">
                • {student['SỐ ĐIỆN THOẠI 1']}
              </span>
            )}
          </div>
        </div>

        {/* Trạng thái vắng */}
        {wasAbsentInDB && !isSelected && (
          <span className="text-[8px] font-black text-orange-600 uppercase bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
            Bỏ vắng?
          </span>
        )}
        {isSelected && !wasAbsentInDB && (
          <span className="text-[8px] font-black text-red-600 uppercase bg-white px-1.5 py-0.5 rounded border border-red-200 shadow-2xs">
            Mới chọn
          </span>
        )}
        {isSelected && wasAbsentInDB && (
          <span className="text-[8px] font-black text-red-500 uppercase opacity-60">
            Đã vắng
          </span>
        )}
      </div>
    );
  }
};

export default Attendance;
