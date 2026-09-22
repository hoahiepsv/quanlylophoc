import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { apiService } from '../services/apiService';
import { matchStudentSearch, cleanDateStr } from '../utils';
import { 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  Search, 
  X, 
  RotateCw, 
  Download, 
  CheckSquare, 
  Square, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Users,
  AlertCircle,
  Calendar,
  Phone
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface TuitionManagementProps {
  students: Student[];
  onRefresh: () => Promise<void>;
}

// Hàm sắp xếp các thẻ tháng học phí theo thứ tự thời gian
export const sortFeeTags = (tags: string[]): string[] => {
  return [...tags].sort((a, b) => {
    const partA = a.replace('T', '').split('/');
    const partB = b.replace('T', '').split('/');
    const ma = parseInt(partA[0]) || 0;
    const ya = parseInt(partA[1]) || new Date().getFullYear();
    const mb = parseInt(partB[0]) || 0;
    const yb = parseInt(partB[1]) || new Date().getFullYear();
    if (ya !== yb) return ya - yb;
    return ma - mb;
  });
};

// Kiểm tra xem học sinh đã đóng tháng/năm cụ thể hay chưa
export const checkStudentPaidMonth = (student: Student, month: number, year: number): boolean => {
  const fees = (student['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(Boolean);
  const tagWithYear = `T${month}/${year}`;
  const tagWithoutYear = `T${month}`;
  
  // Nếu là năm hiện tại và có tag không năm (dữ liệu cũ), vẫn tính là đã đóng
  const currentYear = new Date().getFullYear();
  if (fees.includes(tagWithYear)) return true;
  if (year === currentYear && fees.includes(tagWithoutYear)) return true;
  return false;
};

const TuitionManagement: React.FC<TuitionManagementProps> = ({ students, onRefresh }) => {
  const today = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1);
  const [multiMonths, setMultiMonths] = useState<number[]>([today.getMonth() + 1]);
  const [isMultiMonthMode, setIsMultiMonthMode] = useState<boolean>(false);

  // Bộ lọc
  const [filterGrade, setFilterGrade] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [includeDroppedOut, setIncludeDroppedOut] = useState<boolean>(false);

  // Chọn học sinh để áp dụng hàng loạt
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(new Set());

  // Trạng thái xử lý
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savingProgress, setSavingProgress] = useState<{ current: number; total: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal xác nhận áp dụng
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'mark_paid' | 'mark_unpaid';
    targetMonths: { month: number; year: number }[];
    studentCount: number;
    sampleNames: string[];
  } | null>(null);

  // Modal chỉnh sửa chi tiết tháng đóng phí cho 1 học sinh
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Danh sách các khối / nhóm thực tế
  const activeGrades = useMemo(() => {
    const gradesSet = new Set<string>();
    students.forEach(s => {
      const g = String(s['KHỐI'] || '').trim();
      if (g && g !== 'undefined' && g !== 'null' && g !== 'Đã thôi học') {
        gradesSet.add(g);
      }
    });
    return Array.from(gradesSet).sort((a, b) => {
      const nA = parseInt(a);
      const nB = parseInt(b);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      if (!isNaN(nA)) return -1;
      if (!isNaN(nB)) return 1;
      return a.localeCompare(b, 'vi');
    });
  }, [students]);

  // Danh sách tháng đang chọn để áp dụng
  const effectiveMonths = useMemo(() => {
    if (isMultiMonthMode) {
      return multiMonths.length > 0 ? multiMonths : [selectedMonth];
    }
    return [selectedMonth];
  }, [isMultiMonthMode, multiMonths, selectedMonth]);

  // Lọc danh sách học sinh
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      // 1. Lọc học sinh thôi học
      const isDropped = String(s['KHỐI'] || '').trim() === 'Đã thôi học';
      if (!includeDroppedOut && isDropped) return false;

      // 2. Lọc theo Nhóm/Khối
      if (filterGrade && String(s['KHỐI'] || '').trim() !== filterGrade) return false;

      // 3. Lọc theo trạng thái đóng phí của tháng đang chọn (hoặc các tháng đang chọn)
      if (filterStatus !== 'all') {
        const isPaid = effectiveMonths.every(m => checkStudentPaidMonth(s, m, selectedYear));
        if (filterStatus === 'paid' && !isPaid) return false;
        if (filterStatus === 'unpaid' && isPaid) return false;
      }

      // 4. Tìm kiếm không dấu
      return matchStudentSearch(s, searchTerm);
    }).sort((a, b) => {
      // Sắp xếp theo Nhóm, sau đó theo Tên
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
  }, [students, includeDroppedOut, filterGrade, filterStatus, effectiveMonths, selectedYear, searchTerm]);

  // Thống kê cho tháng đang chọn trong phạm vi nhóm/tìm kiếm hiện tại
  const monthStats = useMemo(() => {
    const targetStudents = students.filter(s => {
      const isDropped = String(s['KHỐI'] || '').trim() === 'Đã thôi học';
      if (!includeDroppedOut && isDropped) return false;
      if (filterGrade && String(s['KHỐI'] || '').trim() !== filterGrade) return false;
      return true;
    });

    const total = targetStudents.length;
    const paidCount = targetStudents.filter(s => checkStudentPaidMonth(s, selectedMonth, selectedYear)).length;
    const unpaidCount = total - paidCount;
    const percentage = total > 0 ? Math.round((paidCount / total) * 100) : 0;

    return { total, paidCount, unpaidCount, percentage };
  }, [students, includeDroppedOut, filterGrade, selectedMonth, selectedYear]);

  // Thống kê nhanh từng tháng trong năm để hiển thị lên từng nút tháng
  const yearlyMonthlyStats = useMemo(() => {
    const stats: Record<number, { paid: number; total: number }> = {};
    const activeList = students.filter(s => {
      const isDropped = String(s['KHỐI'] || '').trim() === 'Đã thôi học';
      if (!includeDroppedOut && isDropped) return false;
      if (filterGrade && String(s['KHỐI'] || '').trim() !== filterGrade) return false;
      return true;
    });

    const total = activeList.length;
    for (let m = 1; m <= 12; m++) {
      const paid = activeList.filter(s => checkStudentPaidMonth(s, m, selectedYear)).length;
      stats[m] = { paid, total };
    }
    return stats;
  }, [students, includeDroppedOut, filterGrade, selectedYear]);

  // Xử lý chọn/bỏ chọn học sinh
  const toggleStudentSelection = (rowIndex: number) => {
    setSelectedRowIndexes(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const allFilteredRowIndexes = filteredStudents
      .map(s => s.rowIndex)
      .filter((idx): idx is number => typeof idx === 'number');
    
    // Nếu tất cả đã được chọn -> bỏ chọn toàn bộ
    const allSelected = allFilteredRowIndexes.every(idx => selectedRowIndexes.has(idx));
    if (allSelected) {
      setSelectedRowIndexes(new Set());
    } else {
      setSelectedRowIndexes(new Set(allFilteredRowIndexes));
    }
  };

  const handleSelectAllUnpaid = () => {
    const unpaidRowIndexes = filteredStudents
      .filter(s => !effectiveMonths.every(m => checkStudentPaidMonth(s, m, selectedYear)))
      .map(s => s.rowIndex)
      .filter((idx): idx is number => typeof idx === 'number');

    if (unpaidRowIndexes.length === 0) {
      showToast('Không có học sinh nào chưa đóng phí trong danh sách đang lọc!', 'info');
      return;
    }

    setSelectedRowIndexes(new Set(unpaidRowIndexes));
    showToast(`Đã chọn ${unpaidRowIndexes.length} học sinh chưa đóng phí!`, 'info');
  };

  const handleClearSelection = () => {
    setSelectedRowIndexes(new Set());
  };

  // Mở modal xác nhận áp dụng
  const triggerBatchAction = (action: 'mark_paid' | 'mark_unpaid') => {
    if (selectedRowIndexes.size === 0) {
      showToast('Vui lòng tích chọn ít nhất 1 học sinh để áp dụng!', 'error');
      return;
    }

    const selectedStudentsList = students.filter(s => s.rowIndex && selectedRowIndexes.has(s.rowIndex));
    const sampleNames = selectedStudentsList.slice(0, 5).map(s => s['HỌ TÊN HS']);

    const targetMonths = effectiveMonths.map(m => ({ month: m, year: selectedYear }));

    setConfirmModal({
      isOpen: true,
      action,
      targetMonths,
      studentCount: selectedStudentsList.length,
      sampleNames
    });
  };

  // Thực thi áp dụng đóng học phí hàng loạt
  const executeBatchUpdate = async () => {
    if (!confirmModal) return;
    const { action, targetMonths } = confirmModal;
    setConfirmModal(null);

    const targetStudents = students.filter(s => s.rowIndex && selectedRowIndexes.has(s.rowIndex));
    if (targetStudents.length === 0) return;

    setIsSaving(true);
    setSavingProgress({ current: 0, total: targetStudents.length });

    try {
      let updatedCount = 0;

      for (let i = 0; i < targetStudents.length; i++) {
        const student = targetStudents[i];
        const currentFees = (student['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(Boolean);
        let newFeesSet = new Set(currentFees);

        targetMonths.forEach(({ month, year }) => {
          const tagWithYear = `T${month}/${year}`;
          const tagWithoutYear = `T${month}`;

          if (action === 'mark_paid') {
            // Thêm tag T{m}/{y}
            newFeesSet.add(tagWithYear);
          } else {
            // Xóa tag
            newFeesSet.delete(tagWithYear);
            newFeesSet.delete(tagWithoutYear);
          }
        });

        const newFeeString = sortFeeTags(Array.from(newFeesSet)).join(' ');

        // Chỉ gửi cập nhật nếu dữ liệu thực sự có thay đổi
        if (newFeeString !== (student['ĐÓNG HỌC PHÍ'] || '')) {
          const updatedStudentData: Partial<Student> = {
            ...student,
            'NGÀY BẮT ĐẦU': cleanDateStr(student['NGÀY BẮT ĐẦU']),
            'ĐÓNG HỌC PHÍ': newFeeString
          };

          await apiService.saveStudent('updateData', updatedStudentData, student.rowIndex);
          updatedCount++;
        }

        setSavingProgress({ current: i + 1, total: targetStudents.length });
      }

      await onRefresh();
      setSelectedRowIndexes(new Set());
      showToast(
        action === 'mark_paid'
          ? `✓ Đã cập nhật ĐÃ ĐÓNG học phí cho ${updatedCount} học sinh!`
          : `✓ Đã HỦY đánh dấu học phí cho ${updatedCount} học sinh!`,
        'success'
      );
    } catch (error: any) {
      console.error('Lỗi khi cập nhật học phí:', error);
      showToast('Lỗi khi lưu: ' + (error.message || 'Không thể kết nối máy chủ'), 'error');
    } finally {
      setIsSaving(false);
      setSavingProgress(null);
    }
  };

  // Cập nhật nhanh một học sinh trực tiếp tại dòng
  const toggleSingleStudentMonth = async (student: Student, month: number, year: number) => {
    if (!student.rowIndex) return;

    const isCurrentlyPaid = checkStudentPaidMonth(student, month, year);
    const currentFees = (student['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(Boolean);
    const tagWithYear = `T${month}/${year}`;
    const tagWithoutYear = `T${month}`;

    let newFees: string[];
    if (isCurrentlyPaid) {
      newFees = currentFees.filter(t => t !== tagWithYear && t !== tagWithoutYear);
    } else {
      newFees = Array.from(new Set([...currentFees, tagWithYear]));
    }

    const newFeeString = sortFeeTags(newFees).join(' ');

    setIsSaving(true);
    try {
      const updatedData: Partial<Student> = {
        ...student,
        'NGÀY BẮT ĐẦU': cleanDateStr(student['NGÀY BẮT ĐẦU']),
        'ĐÓNG HỌC PHÍ': newFeeString
      };

      await apiService.saveStudent('updateData', updatedData, student.rowIndex);
      await onRefresh();
      showToast(
        !isCurrentlyPaid
          ? `✓ Đã ghi nhận đóng phí Tháng ${month}/${year} cho em ${student['HỌ TÊN HS']}`
          : `✓ Đã hủy đóng phí Tháng ${month}/${year} của em ${student['HỌ TÊN HS']}`,
        'success'
      );
    } catch (error: any) {
      showToast('Lỗi cập nhật: ' + error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Xuất danh sách học phí ra file Excel
  const exportToExcel = () => {
    const rows = filteredStudents.map((s, idx) => {
      const isPaid = checkStudentPaidMonth(s, selectedMonth, selectedYear);
      return {
        'STT': idx + 1,
        'Họ và tên': s['HỌ TÊN HS'],
        'Nhóm / Khối': s['KHỐI'] || '',
        'Lớp': s['TÊN LỚP'] || '',
        'Số điện thoại 1': s['SỐ ĐIỆN THOẠI 1'] || '',
        'Số điện thoại 2': s['SỐ ĐIỆN THOẠI 2'] || '',
        'Ngày bắt đầu': cleanDateStr(s['NGÀY BẮT ĐẦU']),
        [`Trạng thái T${selectedMonth}/${selectedYear}`]: isPaid ? 'Đã đóng' : 'Chưa đóng',
        'Tất cả tháng đã đóng': s['ĐÓNG HỌC PHÍ'] || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `HocPhi_T${selectedMonth}_${selectedYear}`);

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
    saveAs(dataBlob, `DanhSach_HocPhi_Thang_${selectedMonth}_${selectedYear}.xlsx`);
    showToast(`Đã xuất file Excel cho Tháng ${selectedMonth}/${selectedYear}!`, 'success');
  };

  // Badge màu nhóm / khối
  const getGradeBadge = (gradeStr: string) => {
    const g = String(gradeStr || '').trim();
    if (g === 'Đã thôi học') return 'bg-gray-100 text-gray-600 border-gray-200';
    if (g === 'Kèm riêng' || g === 'Nhóm kèm riêng') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  return (
    <div className="space-y-6">
      {/* Toast thông báo nổi */}
      {toastMessage && (
        <div 
          className={`fixed top-5 right-5 z-[150] px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 transition-all animate-slideDown border ${
            toastMessage.type === 'success' 
              ? 'bg-emerald-600 text-white border-emerald-500' 
              : toastMessage.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-blue-700 text-white border-blue-600'
          }`}
        >
          {toastMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
          {toastMessage.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          {toastMessage.type === 'info' && <Calendar className="w-5 h-5 flex-shrink-0" />}
          <span className="font-bold text-xs">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading overlay khi lưu hàng loạt */}
      {isSaving && (
        <div className="fixed inset-0 bg-white/70 backdrop-blur-xs z-[140] flex items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-blue-100 flex flex-col items-center max-w-sm w-full mx-4 text-center">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-full border-4 border-blue-200 border-t-blue-700 animate-spin"></div>
              <CreditCard className="w-6 h-6 text-blue-700 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h4 className="text-base font-black text-blue-900 mb-1 uppercase tracking-tight">Đang cập nhật học phí...</h4>
            {savingProgress ? (
              <div className="w-full mt-2">
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden mb-2">
                  <div 
                    className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((savingProgress.current / savingProgress.total) * 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-blue-700 font-bold">
                  Đã hoàn thành: {savingProgress.current} / {savingProgress.total} học sinh ({Math.round((savingProgress.current / savingProgress.total) * 100)}%)
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-500 font-medium">Vui lòng chờ trong giây lát</p>
            )}
          </div>
        </div>
      )}

      {/* Header chính của tab Học phí */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-blue-50">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center shadow-xs">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-blue-950 uppercase tracking-tight">
                  Quản lý Đóng Học Phí
                </h2>
                <p className="text-xs font-semibold text-gray-500">
                  Chọn tháng và áp dụng cập nhật nhanh trạng thái đóng phí cho nhiều học sinh cùng lúc
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onRefresh()}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-black transition-all border border-blue-100 shadow-xs active:scale-95"
            >
              <RotateCw className="w-4 h-4" />
              ĐỒNG BỘ DỮ LIỆU
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
            >
              <Download className="w-4 h-4" />
              XUẤT EXCEL THÁNG {selectedMonth}
            </button>
          </div>
        </div>

        {/* Thanh chọn Năm & Tháng */}
        <div className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedYear(prev => prev - 1)}
                className="p-2 hover:bg-white rounded-xl text-slate-700 transition-all shadow-xs"
                title="Năm trước"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-base font-black text-blue-950 px-3 uppercase tracking-wider">
                Năm {selectedYear}
              </span>
              <button
                type="button"
                onClick={() => setSelectedYear(prev => prev + 1)}
                className="p-2 hover:bg-white rounded-xl text-slate-700 transition-all shadow-xs"
                title="Năm sau"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedYear(today.getFullYear());
                  setSelectedMonth(today.getMonth() + 1);
                  setMultiMonths([today.getMonth() + 1]);
                }}
                className="text-[11px] font-black text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-all border border-blue-200"
              >
                📅 Về tháng hiện tại (Tháng {today.getMonth() + 1}/{today.getFullYear()})
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMultiMonthMode(!isMultiMonthMode);
                  if (!isMultiMonthMode) {
                    setMultiMonths([selectedMonth]);
                  }
                }}
                className={`text-[11px] font-black px-3 py-2 rounded-xl transition-all border ${
                  isMultiMonthMode
                    ? 'bg-purple-600 text-white border-purple-700 shadow-md'
                    : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
                }`}
              >
                {isMultiMonthMode ? '✓ Đang chọn nhiều tháng' : '✚ Chọn nhiều tháng một lúc'}
              </button>
            </div>
          </div>

          {/* Lưới 12 nút tháng */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {[...Array(12)].map((_, i) => {
              const month = i + 1;
              const isSelected = isMultiMonthMode
                ? multiMonths.includes(month)
                : selectedMonth === month;
              const isCurrentCalendarMonth = today.getMonth() + 1 === month && today.getFullYear() === selectedYear;
              const stat = yearlyMonthlyStats[month] || { paid: 0, total: 0 };
              const paidPercent = stat.total > 0 ? Math.round((stat.paid / stat.total) * 100) : 0;

              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => {
                    if (isMultiMonthMode) {
                      setMultiMonths(prev => 
                        prev.includes(month) 
                          ? (prev.length > 1 ? prev.filter(m => m !== month) : prev) 
                          : [...prev, month].sort((a, b) => a - b)
                      );
                      setSelectedMonth(month);
                    } else {
                      setSelectedMonth(month);
                    }
                  }}
                  className={`relative p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-between min-h-[74px] active:scale-95 ${
                    isSelected
                      ? 'bg-emerald-600 border-emerald-700 text-white shadow-lg ring-2 ring-emerald-300'
                      : 'bg-white hover:bg-slate-50 border-gray-100 text-gray-700 hover:border-emerald-200'
                  }`}
                >
                  {isCurrentCalendarMonth && (
                    <span 
                      className={`absolute -top-1.5 -right-1.5 px-1.5 py-0.2 rounded-full text-[8px] font-black uppercase tracking-tighter ${
                        isSelected ? 'bg-amber-400 text-blue-950' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      Hiện tại
                    </span>
                  )}
                  <div className="font-black text-sm leading-tight">
                    Tháng {month}
                  </div>
                  <div className={`text-[10px] font-bold mt-1.5 ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>
                    {stat.paid}/{stat.total} ({paidPercent}%)
                  </div>
                  {/* Thanh tiến độ nhỏ dưới đáy */}
                  <div className="w-full bg-black/10 rounded-full h-1 mt-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500'}`}
                      style={{ width: `${paidPercent}%` }}
                    ></div>
                  </div>
                </button>
              );
            })}
          </div>

          {isMultiMonthMode && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-purple-900">
                📌 Các tháng đang được chọn để áp dụng: <strong>{multiMonths.map(m => `Tháng ${m}`).join(', ')}</strong> ({selectedYear})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMultiMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])}
                  className="text-[10px] font-black text-purple-700 bg-white px-2.5 py-1 rounded-lg border border-purple-200 hover:bg-purple-100"
                >
                  Chọn cả 12 tháng
                </button>
                <button
                  type="button"
                  onClick={() => setMultiMonths([selectedMonth])}
                  className="text-[10px] font-black text-purple-700 bg-white px-2.5 py-1 rounded-lg border border-purple-200 hover:bg-purple-100"
                >
                  Chỉ giữ Tháng {selectedMonth}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3 Thẻ KPI tổng quan theo tháng đang chọn */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div 
            onClick={() => setFilterStatus('all')}
            className={`cursor-pointer p-5 rounded-2xl border-2 transition-all ${
              filterStatus === 'all'
                ? 'bg-blue-50/70 border-blue-400 shadow-md ring-2 ring-blue-200'
                : 'bg-slate-50 border-gray-100 hover:border-blue-200'
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-blue-900">Tổng học sinh</span>
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-black text-blue-950">
              {monthStats.total} <span className="text-xs font-bold text-gray-500">em</span>
            </div>
            <p className="text-[11px] text-blue-700 font-semibold mt-1">
              Đang xem toàn bộ học sinh
            </p>
          </div>

          <div 
            onClick={() => setFilterStatus('paid')}
            className={`cursor-pointer p-5 rounded-2xl border-2 transition-all ${
              filterStatus === 'paid'
                ? 'bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-200'
                : 'bg-emerald-50/30 border-emerald-100 hover:border-emerald-300'
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-900">Đã đóng Tháng {selectedMonth}</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-800">{monthStats.paidCount}</span>
              <span className="text-xs font-black text-emerald-600">/ {monthStats.total} em ({monthStats.percentage}%)</span>
            </div>
            <div className="w-full bg-emerald-200 rounded-full h-1.5 mt-2 overflow-hidden">
              <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${monthStats.percentage}%` }}></div>
            </div>
          </div>

          <div 
            onClick={() => setFilterStatus('unpaid')}
            className={`cursor-pointer p-5 rounded-2xl border-2 transition-all ${
              filterStatus === 'unpaid'
                ? 'bg-rose-50/80 border-rose-500 shadow-md ring-2 ring-rose-200'
                : 'bg-rose-50/30 border-rose-100 hover:border-rose-300'
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-rose-900">Chưa đóng Tháng {selectedMonth}</span>
              <XCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-rose-700">{monthStats.unpaidCount}</span>
              <span className="text-xs font-black text-rose-500">/ {monthStats.total} em</span>
            </div>
            <p className="text-[11px] text-rose-600 font-bold mt-1">
              {filterStatus === 'unpaid' ? '● Đang lọc danh sách chưa đóng' : 'Bấm để lọc nhanh những em chưa đóng'}
            </p>
          </div>
        </div>
      </div>

      {/* Thanh công cụ lọc và tác vụ hàng loạt */}
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-blue-50 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Lọc Nhóm/Khối */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-2xl border border-gray-200">
              <Filter className="w-4 h-4 text-blue-700" />
              <select
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value)}
                className="bg-transparent text-xs font-black text-blue-900 uppercase tracking-wider outline-none cursor-pointer"
              >
                <option value="">Tất cả các nhóm ({monthStats.total})</option>
                {activeGrades.map((g) => (
                  <option key={g} value={g}>
                    {String(g).startsWith('Nhóm') ? g : `Nhóm ${g}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Lọc trạng thái đóng phí */}
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filterStatus === 'all'
                    ? 'bg-white text-blue-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Tất cả ({filteredStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('unpaid')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  filterStatus === 'unpaid'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <span>Chưa đóng</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('paid')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  filterStatus === 'paid'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <span>Đã đóng</span>
              </button>
            </div>

            {/* Checkbox bao gồm học sinh đã thôi học */}
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-600 px-2 select-none">
              <input
                type="checkbox"
                checked={includeDroppedOut}
                onChange={(e) => setIncludeDroppedOut(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Bao gồm HS thôi học</span>
            </label>
          </div>

          {/* Ô tìm kiếm học sinh */}
          <div className="relative min-w-[280px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên, SĐT, lớp (không dấu)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Thanh tác vụ hàng loạt nổi bật khi có học sinh được chọn */}
        <div className="pt-3 border-t border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-50/70 p-4 rounded-2xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              {filteredStudents.length > 0 && filteredStudents.every(s => s.rowIndex && selectedRowIndexes.has(s.rowIndex)) ? (
                <>
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                  <span>Bỏ chọn tất cả</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 text-gray-400" />
                  <span>Chọn tất cả ({filteredStudents.length})</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSelectAllUnpaid}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-1.5"
            >
              ⚡ Chọn nhanh tất cả em CHƯA đóng
            </button>

            {selectedRowIndexes.size > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs text-gray-500 hover:text-gray-800 underline ml-2"
              >
                Bỏ chọn
              </button>
            )}

            <div className="text-xs font-black text-blue-900 bg-blue-100/70 px-3 py-1 rounded-xl">
              Đã chọn: <span className="text-blue-700 text-sm">{selectedRowIndexes.size}</span> / {filteredStudents.length} học sinh
            </div>
          </div>

          {/* Các nút ÁP DỤNG HÀNG LOẠT */}
          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <button
              type="button"
              disabled={selectedRowIndexes.size === 0 || isSaving}
              onClick={() => triggerBatchAction('mark_paid')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-md active:scale-95 ${
                selectedRowIndexes.size > 0 && !isSaving
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                Áp dụng ĐÃ ĐÓNG {effectiveMonths.map(m => `T${m}`).join(', ')} ({selectedRowIndexes.size})
              </span>
            </button>

            <button
              type="button"
              disabled={selectedRowIndexes.size === 0 || isSaving}
              onClick={() => triggerBatchAction('mark_unpaid')}
              className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black transition-all border shadow-xs active:scale-95 ${
                selectedRowIndexes.size > 0 && !isSaving
                  ? 'bg-white hover:bg-rose-50 text-rose-700 border-rose-300'
                  : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
              title="Hủy đánh dấu đã đóng cho các em được chọn"
            >
              <XCircle className="w-4 h-4" />
              <span>Hủy đóng</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bảng danh sách học sinh */}
      <div className="bg-white rounded-3xl shadow-xl border border-blue-50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-blue-900 text-[11px] font-black uppercase tracking-wider border-b border-gray-200">
                <th className="py-4 px-4 text-center w-12">
                  <input
                    type="checkbox"
                    checked={filteredStudents.length > 0 && filteredStudents.every(s => s.rowIndex && selectedRowIndexes.has(s.rowIndex))}
                    onChange={handleSelectAllFiltered}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-4 px-3 text-center w-12">STT</th>
                <th className="py-4 px-4">Họ tên học sinh</th>
                <th className="py-4 px-4">Nhóm / Khối</th>
                <th className="py-4 px-3">Lớp</th>
                <th className="py-4 px-4">Số điện thoại</th>
                <th className="py-4 px-4 text-center">
                  Trạng thái {effectiveMonths.map(m => `T${m}`).join(', ')}/{selectedYear}
                </th>
                <th className="py-4 px-4">Các tháng đã đóng</th>
                <th className="py-4 px-4 text-center">Thao tác nhanh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filteredStudents.map((student, idx) => {
                const isSelected = student.rowIndex ? selectedRowIndexes.has(student.rowIndex) : false;
                const isPaidSelectedMonth = checkStudentPaidMonth(student, selectedMonth, selectedYear);
                const feesList = sortFeeTags((student['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(Boolean));
                const isDropped = String(student['KHỐI'] || '').trim() === 'Đã thôi học';

                return (
                  <tr 
                    key={student.rowIndex || idx}
                    className={`transition-colors hover:bg-blue-50/40 ${
                      isSelected ? 'bg-blue-50/70' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')
                    }`}
                  >
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => student.rowIndex && toggleStudentSelection(student.rowIndex)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-gray-400">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-black text-gray-900 text-sm flex items-center gap-2">
                        {student['HỌ TÊN HS']}
                        {isDropped && (
                          <span className="text-[9px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase">
                            Đã thôi học
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                        Bắt đầu: {cleanDateStr(student['NGÀY BẮT ĐẦU']) || 'Chưa có'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black border uppercase tracking-wider inline-block ${getGradeBadge(student['KHỐI'])}`}>
                        {String(student['KHỐI']).startsWith('Nhóm') ? student['KHỐI'] : `Nhóm ${student['KHỐI']}`}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-gray-700">
                      {student['TÊN LỚP'] || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-gray-600">
                      {student['SỐ ĐIỆN THOẠI 1'] ? (
                        <a 
                          href={`tel:${student['SỐ ĐIỆN THOẠI 1']}`} 
                          className="hover:text-blue-600 flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-gray-400" />
                          {student['SỐ ĐIỆN THOẠI 1']}
                        </a>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isPaidSelectedMonth ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 font-black text-xs shadow-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          ĐÃ ĐÓNG
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-100 text-rose-800 border border-rose-200 font-black text-xs shadow-xs">
                          <XCircle className="w-3.5 h-3.5" />
                          CHƯA ĐÓNG
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      {feesList.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {feesList.map(tag => {
                            const isCurrentSelected = tag === `T${selectedMonth}/${selectedYear}` || (selectedYear === today.getFullYear() && tag === `T${selectedMonth}`);
                            return (
                              <span
                                key={tag}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                                  isCurrentSelected
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-gray-300 italic text-[11px]">Chưa có dữ liệu</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => toggleSingleStudentMonth(student, selectedMonth, selectedYear)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border shadow-xs active:scale-95 ${
                            isPaidSelectedMonth
                              ? 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                          }`}
                          title={`Click để chuyển trạng thái đóng phí Tháng ${selectedMonth}/${selectedYear}`}
                        >
                          {isPaidSelectedMonth ? 'Hủy T' + selectedMonth : '+ Đóng T' + selectedMonth}
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingStudent(student)}
                          className="p-1.5 hover:bg-blue-50 text-blue-700 rounded-lg transition-all"
                          title="Xem & sửa tất cả các tháng của học sinh này"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-gray-400">
                    <CreditCard className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="font-black text-sm text-gray-600 uppercase">Không tìm thấy học sinh nào</p>
                    <p className="text-xs text-gray-400 mt-1">Vui lòng thử điều chỉnh bộ lọc hoặc từ khoá tìm kiếm</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal xác nhận áp dụng hàng loạt */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-gray-100 animate-slideUp">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                confirmModal.action === 'mark_paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}>
                {confirmModal.action === 'mark_paid' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase">
                  {confirmModal.action === 'mark_paid' ? 'Xác nhận ĐÃ ĐÓNG học phí' : 'Xác nhận HỦY đóng học phí'}
                </h3>
                <p className="text-xs text-gray-500 font-semibold">
                  Thao tác sẽ cập nhật trực tiếp lên Google Sheets
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 mb-5 text-xs text-gray-700">
              <div className="flex justify-between">
                <span className="font-bold text-gray-500">Các tháng áp dụng:</span>
                <span className="font-black text-blue-900">
                  {confirmModal.targetMonths.map(m => `Tháng ${m.month}/${m.year}`).join(', ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-gray-500">Số lượng học sinh:</span>
                <span className="font-black text-emerald-700 text-sm">
                  {confirmModal.studentCount} học sinh
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <span className="font-bold text-gray-500 block mb-1">Danh sách đại diện:</span>
                <div className="flex flex-wrap gap-1.5">
                  {confirmModal.sampleNames.map((name, i) => (
                    <span key={i} className="bg-white px-2 py-0.5 rounded-lg border border-gray-200 font-medium">
                      {name}
                    </span>
                  ))}
                  {confirmModal.studentCount > confirmModal.sampleNames.length && (
                    <span className="text-gray-400 font-bold self-center">
                      và {confirmModal.studentCount - confirmModal.sampleNames.length} em khác...
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-gray-600 font-black text-xs hover:bg-gray-100 transition-all"
              >
                HỦY BỎ
              </button>
              <button
                type="button"
                onClick={executeBatchUpdate}
                className={`flex-1 py-3 px-4 rounded-xl text-white font-black text-xs transition-all shadow-lg active:scale-95 ${
                  confirmModal.action === 'mark_paid'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                XÁC NHẬN CẬP NHẬT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xem & sửa chi tiết tháng đóng phí cho 1 học sinh */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 animate-slideUp">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-base font-black text-blue-950 uppercase">
                  Học phí: {editingStudent['HỌ TÊN HS']}
                </h3>
                <p className="text-xs font-bold text-gray-500">
                  {String(editingStudent['KHỐI']).startsWith('Nhóm') ? editingStudent['KHỐI'] : `Nhóm ${editingStudent['KHỐI']}`} - Lớp {editingStudent['TÊN LỚP']}
                </p>
              </div>
              <button 
                onClick={() => setEditingStudent(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="text-xs font-black text-gray-700 uppercase tracking-wider block mb-2">
                Các tháng trong năm {selectedYear}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[...Array(12)].map((_, i) => {
                  const m = i + 1;
                  const isPaid = checkStudentPaidMonth(editingStudent, m, selectedYear);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={async () => {
                        await toggleSingleStudentMonth(editingStudent, m, selectedYear);
                        // Cập nhật state cục bộ cho modal
                        const currentFees = (editingStudent['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(Boolean);
                        const tag = `T${m}/${selectedYear}`;
                        const tagOld = `T${m}`;
                        let newFees: string[];
                        if (isPaid) {
                          newFees = currentFees.filter(t => t !== tag && t !== tagOld);
                        } else {
                          newFees = Array.from(new Set([...currentFees, tag]));
                        }
                        setEditingStudent(prev => prev ? ({ ...prev, 'ĐÓNG HỌC PHÍ': sortFeeTags(newFees).join(' ') }) : null);
                      }}
                      className={`py-2 px-1 rounded-xl text-xs font-black transition-all border-2 ${
                        isPaid
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                          : 'bg-slate-50 text-gray-500 border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      Tháng {m} {isPaid ? '✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-black transition-all"
              >
                HOÀN TẤT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TuitionManagement;
