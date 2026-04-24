
import React, { useState, useMemo, useRef } from 'react';
import { Student, ModelMode } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { X, FileBarChart, Download } from 'lucide-react';
import html2canvas from 'html2canvas';

interface StudentReportModalProps {
  student: Student;
  onClose: () => void;
  modelMode: ModelMode;
}

const cleanDateStr = (val: any): string => {
  if (!val) return '';
  const dateObj = new Date(val);
  if (isNaN(dateObj.getTime())) return String(val).split(/[T ]/)[0];
  return dateObj.toLocaleDateString('en-CA');
};

const formatDateVN = (dateStr: string) => {
  if (!dateStr) return '';
  const clean = cleanDateStr(dateStr);
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return clean;
};

const StudentReportModal: React.FC<StudentReportModalProps> = ({ student, onClose, modelMode }) => {
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => new Date(), []);
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const nowStr = cleanDateStr(today);

  const stats = useMemo(() => {
    const fees = (student['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(f => f);
    const schedule = (student['LỊCH HỌC'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
    const absences = (student['ĐIỂM DANH HS'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d)).sort();
    
    const attendedCount = schedule.filter(d => d <= nowStr).length;
    const totalExpectedSessions = schedule.length;

    // Phân bổ buổi học theo tháng
    const monthlyMap: Record<string, number> = {};
    schedule.forEach(dateStr => {
      if (dateStr <= nowStr && !absences.includes(dateStr)) {
        const d = new Date(dateStr);
        const label = `T${d.getMonth() + 1}/${d.getFullYear()}`;
        monthlyMap[label] = (monthlyMap[label] || 0) + 1;
      }
    });

    // Lấy 6 tháng gần nhất để vẽ biểu đồ
    const months: string[] = [];
    let curr = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    for(let i=0; i<6; i++) {
        months.push(`T${curr.getMonth() + 1}/${curr.getFullYear()}`);
        curr.setMonth(curr.getMonth() + 1);
    }

    const chartData = months.map(tag => ({
      name: tag,
      count: monthlyMap[tag] || 0
    }));

    // Tính toán tháng nợ
    const getRequiredMonths = (startDateStr: string, endDateStr?: string) => {
        if (!startDateStr) return [];
        const dateOnly = cleanDateStr(startDateStr);
        const parts = dateOnly.split('-');
        if (parts.length < 3) return [];
        
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const start = new Date(year, month - 1, 1);
        
        const requiredMonths: string[] = [];
        let cur = new Date(start.getFullYear(), start.getMonth(), 1);
        
        // Target boundary is earlier of today vs last schedule month
        const targetDate = new Date(today.getFullYear(), today.getMonth(), 1);
        let finalTarget = targetDate;
        
        if (endDateStr) {
          const endClean = cleanDateStr(endDateStr);
          const endParts = endClean.split('-');
          if (endParts.length === 3) {
            const endMonthDate = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, 1);
            if (endMonthDate < targetDate) {
              finalTarget = endMonthDate;
            }
          }
        }

        while (cur <= finalTarget) {
          requiredMonths.push(`T${cur.getMonth() + 1}/${cur.getFullYear()}`);
          cur.setMonth(cur.getMonth() + 1);
        }
        return requiredMonths;
    };

    const endDate = schedule.length > 0 ? schedule[schedule.length - 1] : '';
    const required = getRequiredMonths(student['NGÀY BẮT ĐẦU'], endDate);
    const unpaidMonths = required.filter(m => !fees.includes(m));

    return {
      totalExpectedSessions,
      attendedCount,
      absencesCount: absences.length,
      absenceDates: absences,
      paidCount: fees.length,
      paidMonths: fees,
      unpaidCount: unpaidMonths.length,
      unpaidMonths: unpaidMonths,
      chartData
    };
  }, [student, today, nowStr]);

  const exportAsJpeg = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 4, // Tăng chất lượng ảnh
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // Có thể tinh chỉnh clonedDoc nếu cần
        }
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `Bao_Cao_${student['HỌ TÊN HS']}.jpg`;
      link.click();
    } catch (error) {
      console.error("Export error:", error);
      alert("Lỗi khi xuất hình ảnh.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl relative animate-slideUp border border-blue-100 flex flex-col no-scrollbar">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-blue-50 sticky top-0 z-10">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-blue-700 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <FileBarChart className="h-7 w-7" />
             </div>
              <div>
                <h3 className="text-xl font-black text-blue-900 uppercase">BÁO CÁO CHI TIẾT</h3>
                <p className="text-xs font-bold text-blue-600">Học sinh: <span className="uppercase">{student['HỌ TÊN HS']}</span></p>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={exportAsJpeg}
              disabled={isExporting}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95 shadow-md disabled:bg-gray-400"
            >
              <Download className="h-4 w-4" />
              JPEG
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-red-100 text-gray-400 hover:text-red-600 rounded-full transition-all active:scale-95"
            >
              <X className="h-8 w-8" />
            </button>
          </div>
        </div>

        {/* Content Area - This part is captured in JPEG */}
        <div ref={reportRef} className="p-10 bg-white" style={{ width: '800px', margin: '0 auto' }}>
            <div className="text-center mb-8 border-b-4 border-blue-600 pb-4">
              <h1 className="text-[32px] text-blue-900 m-0 uppercase font-black">Phiếu Báo Cáo Học Tập</h1>
              <p className="text-gray-500 text-base mt-1 font-bold">Học sinh: <span className="text-blue-600 uppercase">{student['HỌ TÊN HS']}</span></p>
            </div>

            <div className="grid grid-cols-2 gap-5 mb-8">
              <div className="p-5 bg-slate-50 rounded-[15px] border border-gray-200">
                <p className="text-[12px] font-black text-gray-400 uppercase mb-1">Thông tin lớp học</p>
                <div className="text-base space-y-1">
                  <p><b>Nhóm:</b> {student['KHỐI']}</p>
                  <p><b>Lớp:</b> {student['TÊN LỚP']}</p>
                  <p><b>Ngày bắt đầu:</b> {formatDateVN(student['NGÀY BẮT ĐẦU'])}</p>
                  <p><b>SĐT:</b> {student['SỐ ĐIỆN THOẠI 1']}</p>
                </div>
              </div>
              <div className="p-5 bg-slate-50 rounded-[15px] border border-gray-200">
                <p className="text-[12px] font-black text-gray-400 uppercase mb-1">Thời gian báo cáo</p>
                <p className="text-[18px] m-0 text-blue-900 font-black"><b>Tháng {currentMonth} / {today.getFullYear()}</b></p>
                <p className="text-[12px] text-gray-400 mt-1">Ngày xuất: {formatDateVN(nowStr)}</p>
              </div>
            </div>

            {/* Thông số báo cáo */}
            <div className="grid grid-cols-5 gap-2 mb-8">
              {/* Ô 1: Dự kiến */}
              <div className="text-center p-3 bg-yellow-50 rounded-xl border border-yellow-200 h-[100px] flex flex-col justify-center">
                <span className="block text-[10px] text-yellow-800 font-bold uppercase">DỰ KIẾN</span>
                <span className="text-xl font-black text-yellow-900">{stats.totalExpectedSessions}</span>
                <span className="block text-[8px] text-yellow-700 mt-1">Tổng buổi</span>
              </div>
              
              {/* Ô 2: Đã dạy */}
              <div className="text-center p-3 bg-emerald-50 rounded-xl border border-emerald-200 h-[100px] flex flex-col justify-center">
                <span className="block text-[10px] text-emerald-600 font-bold uppercase">ĐÃ DẠY</span>
                <span className="text-xl font-black text-emerald-800">{stats.attendedCount}</span>
                <span className="block text-[8px] text-emerald-600 mt-1">Số buổi đã dạy</span>
              </div>

              {/* Ô 3: Vắng */}
              <div className="text-center p-3 bg-red-50 rounded-xl border border-red-200 h-[100px] flex flex-col justify-center overflow-hidden">
                <span className="block text-[10px] text-red-600 font-bold uppercase">VẮNG</span>
                <span className="text-xl font-black text-red-800">{stats.absencesCount}</span>
                <p className="text-[7px] text-red-700 mt-1 leading-tight font-medium">
                  {stats.absenceDates.length > 0 
                    ? stats.absenceDates.map(d => formatDateVN(d).split('/')[0] + '/' + formatDateVN(d).split('/')[1]).join(', ') 
                    : 'Không vắng'}
                </p>
              </div>

              {/* Ô 4: Đóng phí */}
              <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-200 h-[100px] flex flex-col justify-center overflow-hidden">
                <span className="block text-[10px] text-blue-600 font-bold uppercase">ĐÓNG PHÍ</span>
                <span className="text-xl font-black text-blue-800">{stats.paidCount}</span>
                <p className="text-[7px] text-blue-700 mt-1 leading-tight font-medium">
                  {stats.paidMonths.length > 0 ? stats.paidMonths.join(', ') : 'Chưa đóng'}
                </p>
              </div>

              {/* Ô 5: Nợ phí */}
              <div className="text-center p-3 bg-orange-50 rounded-xl border border-orange-200 h-[100px] flex flex-col justify-center overflow-hidden">
                <span className="block text-[10px] text-orange-600 font-bold uppercase">NỢ PHÍ</span>
                <span className="text-xl font-black text-orange-800">{stats.unpaidCount}</span>
                <p className="text-[7px] text-orange-700 mt-1 leading-tight font-bold">
                  {stats.unpaidMonths.length > 0 ? stats.unpaidMonths.join(', ') : 'Hoàn thành ✓'}
                </p>
              </div>
            </div>

            <div className="mb-8">
              <p className="text-sm font-black text-blue-900 mb-4 text-center uppercase">Biểu đồ chuyên cần theo tháng</p>
              <div className="h-[220px] bg-white border border-slate-100 rounded-xl p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={30}>
                      {stats.chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={index === stats.chartData.length - 1 ? '#1e3a8a' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex justify-between mt-10 pt-5 border-t border-dashed border-slate-300">
              <div className="text-center w-[40%]">
                <p className="text-sm font-black m-0 tracking-tighter uppercase">Phụ huynh xác nhận</p>
                <div className="h-[60px]"></div>
                <p className="text-[12px] text-slate-400 font-bold uppercase tracking-widest">(Ký và ghi rõ họ tên)</p>
              </div>
              <div className="text-center w-[40%]">
                <p className="text-sm font-black m-0 tracking-tighter uppercase">Giáo viên chủ nhiệm</p>
                <p className="text-base font-black text-blue-900 mt-10 mb-0 uppercase tracking-tighter">Lê Hoà Hiệp</p>
                <p className="text-[10px] text-emerald-600 font-black flex items-center justify-center gap-1">
                   <span className="w-1 h-1 bg-emerald-600 rounded-full"></span>
                   Đã phê duyệt điện tử
                </p>
              </div>
            </div>

            <div className="text-center mt-10 text-[10px] text-slate-400 italic font-bold">
               Phần mềm được thiết kế bởi Lê Hoà Hiệp
            </div>
        </div>
      </div>
    </div>
  );
};

export default StudentReportModal;
