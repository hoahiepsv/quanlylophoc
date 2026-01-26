
import React, { useState, useMemo, useRef } from 'react';
import { Student } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { geminiService } from '../services/geminiService';

interface StatisticsProps {
  students: Student[];
}

const Statistics: React.FC<StatisticsProps> = ({ students }) => {
  const [selectedStudentName, setSelectedStudentName] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => new Date(), []);
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const currentMonthTag = `T${currentMonth}/${currentYear}`;

  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = dateStr.split(/[T ]/)[0];
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return clean;
  };

  const getRequiredMonths = (startDateStr: string) => {
    if (!startDateStr) return [];
    const dateOnly = startDateStr.split(/[T ]/)[0];
    const parts = dateOnly.split('-');
    if (parts.length < 3) return [];
    
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const start = new Date(year, month - 1, 1);
    
    const required: string[] = [];
    let curr = new Date(start.getFullYear(), start.getMonth(), 1);
    const target = new Date(today.getFullYear(), today.getMonth(), 1);

    while (curr <= target) {
      required.push(`T${curr.getMonth() + 1}/${curr.getFullYear()}`);
      curr.setMonth(curr.getMonth() + 1);
    }
    return required;
  };

  const calculateAttended = (student: Student) => {
    const schedule = (student['LỊCH HỌC'] || '').split(' ').filter(d => d);
    const absences = (student['ĐIỂM DANH HS'] || '').split(' ').filter(d => d);
    const nowStr = today.toISOString().split('T')[0];
    return schedule.filter(d => d <= nowStr && !absences.includes(d)).length;
  };

  const classStats = useMemo(() => {
    const paidThisMonth: Student[] = [];
    const unpaidThisMonth: Student[] = [];
    const debtors: { student: Student; unpaidMonths: string[] }[] = [];

    students.forEach(s => {
      const fees = (s['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(f => f);
      const required = getRequiredMonths(s['NGÀY BẮT ĐẦU']);
      
      const isPaidThisMonth = fees.includes(currentMonthTag);
      const missingMonths = required.filter(m => !fees.includes(m));
      
      const isUnpaidThisMonth = !isPaidThisMonth && required.includes(currentMonthTag);
      const previousDebt = missingMonths.filter(m => m !== currentMonthTag);

      if (isPaidThisMonth) paidThisMonth.push(s);
      if (isUnpaidThisMonth) unpaidThisMonth.push(s);
      if (previousDebt.length > 0) debtors.push({ student: s, unpaidMonths: previousDebt });
    });

    return { paidThisMonth, unpaidThisMonth, debtors };
  }, [students, currentMonthTag, today]);

  const selectedStudent = useMemo(() => {
    return students.find(s => s['HỌ TÊN HS'] === selectedStudentName);
  }, [selectedStudentName, students]);

  const studentDetailStats = useMemo(() => {
    if (!selectedStudent) return null;

    const fees = (selectedStudent['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(f => f);
    const schedule = (selectedStudent['LỊCH HỌC'] || '').split(' ').filter(d => d);
    const absences = (selectedStudent['ĐIỂM DANH HS'] || '').split(' ').filter(d => d).sort();
    
    const nowStr = today.toISOString().split('T')[0];
    const attendedCount = calculateAttended(selectedStudent);
    
    const required = getRequiredMonths(selectedStudent['NGÀY BẮT ĐẦU']);
    const unpaidMonths = required.filter(m => !fees.includes(m));

    const monthlyMap: Record<string, number> = {};
    schedule.forEach(dateStr => {
      if (dateStr <= nowStr && !absences.includes(dateStr)) {
        const d = new Date(dateStr);
        const label = `T${d.getMonth() + 1}/${d.getFullYear()}`;
        monthlyMap[label] = (monthlyMap[label] || 0) + 1;
      }
    });

    const chartData = required.map(tag => ({
      name: tag,
      count: monthlyMap[tag] || 0
    })).slice(-12);

    return {
      attendedCount,
      absencesCount: absences.length,
      absenceDates: absences,
      paidCount: fees.length,
      paidMonths: fees,
      unpaidCount: unpaidMonths.length,
      unpaidLabels: unpaidMonths.join(', '),
      chartData
    };
  }, [selectedStudent, today]);

  const captureAndAddSection = async (doc: jsPDF, html: string, yOffset: number): Promise<number> => {
    const container = document.createElement('div');
    container.style.width = '1000px'; 
    container.style.padding = '40px 60px';
    container.style.fontFamily = '"Times New Roman", Times, serif';
    container.style.fontSize = '14pt';
    container.style.lineHeight = '1.6';
    container.style.color = '#000';
    container.style.backgroundColor = '#fff';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.innerHTML = html;
    document.body.appendChild(container);

    const canvas = await html2canvas(container, { 
      scale: 4, 
      useCORS: true, 
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 1000
    });
    
    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const pdfWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const imgWidth = pdfWidth - (margin * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (yOffset + imgHeight > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      yOffset = margin;
    }

    doc.addImage(imgData, 'JPEG', margin, yOffset, imgWidth, imgHeight, undefined, 'FAST');
    document.body.removeChild(container);
    return yOffset + imgHeight;
  };

  const exportClassReport = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      
      const aiInsights = await geminiService.generateReportContent('class', {
        total: students.length,
        paid: classStats.paidThisMonth.length,
        unpaid: classStats.unpaidThisMonth.length,
        debtors: classStats.debtors.length
      });

      let currentY = 15;

      currentY = await captureAndAddSection(doc, `
        <div style="text-align:center; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px;">
          <h1 style="font-size:26pt; color:#1e3a8a; text-transform:uppercase; margin-bottom:5px;">Báo cáo tổng quan học tập</h1>
          <p style="font-size:13pt; color:#444; margin:0;">Thời gian: Tháng ${currentMonth} Năm ${currentYear}</p>
          <p style="font-size:11pt; color:#666; margin-top:5px;">Ngày kết xuất: ${today.toLocaleDateString('vi-VN')} | Đơn vị: Trung tâm Hoà Hiệp AI</p>
        </div>
      `, currentY);

      currentY = await captureAndAddSection(doc, `
        <div style="padding:25px; border:1px solid #cbd5e1; border-radius:15px; background:#f1f5f9; margin-bottom:25px;">
          <h3 style="font-size:16pt; color:#1e3a8a; margin-top:0; margin-bottom:12px; border-bottom:1px solid #cbd5e1; padding-bottom:8px; font-weight:bold;">I. NHẬN XÉT ĐÁNH GIÁ CHUNG:</h3>
          <p style="text-align:justify; margin:0; line-height: 1.8; color: #1e293b; font-size:14pt;">${aiInsights}</p>
        </div>
      `, currentY);

      currentY = await captureAndAddSection(doc, `
        <h3 style="font-size:16pt; color:#1e3a8a; border-left:8px solid #1e3a8a; padding-left:15px; margin-bottom:15px; font-weight:bold;">II. SỐ LIỆU THỐNG KÊ CHI TIẾT:</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:10px; font-size:13pt;">
          <tr style="background:#1e3a8a; color:#fff;">
            <th style="border:1px solid #000; padding:12px; text-align:left;">Hạng mục đánh giá</th>
            <th style="border:1px solid #000; padding:12px; text-align:center; width:150px;">Số lượng</th>
            <th style="border:1px solid #000; padding:12px; text-align:center; width:150px;">Tỷ lệ (%)</th>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:12px;">Tổng số học sinh quản lý</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-weight:bold;">${students.length}</td>
            <td style="border:1px solid #000; padding:12px; text-align:center;">100%</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:12px; color:#059669;">Đã hoàn thành học phí (T${currentMonth})</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-weight:bold; color:#059669;">${classStats.paidThisMonth.length}</td>
            <td style="border:1px solid #000; padding:12px; text-align:center;">${((classStats.paidThisMonth.length / students.length) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:12px; color:#dc2626;">Chưa hoàn thành học phí (T${currentMonth})</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-weight:bold; color:#dc2626;">${classStats.unpaidThisMonth.length}</td>
            <td style="border:1px solid #000; padding:12px; text-align:center;">${((classStats.unpaidThisMonth.length / students.length) * 100).toFixed(1)}%</td>
          </tr>
          <tr style="background: #fff7ed;">
            <td style="border:1px solid #000; padding:12px; color:#ea580c; font-weight:bold;">Học sinh tồn đọng phí các tháng cũ</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-weight:bold; color:#ea580c;">${classStats.debtors.length}</td>
            <td style="border:1px solid #000; padding:12px; text-align:center;">-</td>
          </tr>
        </table>
      `, currentY);

      const tableTitles = [
        { title: `PHỤ LỤC 1: DANH SÁCH HOÀN THÀNH HỌC PHÍ (THÁNG ${currentMonth})`, list: classStats.paidThisMonth, type: 'paid' },
        { title: `PHỤ LỤC 2: DANH SÁCH NHẮC ĐÓNG PHÍ (THÁNG ${currentMonth})`, list: classStats.unpaidThisMonth, type: 'preparing' },
        { title: `PHỤ LỤC 3: DANH SÁCH NỢ TỒN ĐỌNG (THÁNG TRƯỚC)`, list: classStats.debtors.map(d => d.student), type: 'debt' }
      ];

      for (const entry of tableTitles) {
        if (entry.list.length > 0) {
          const isDebt = entry.type === 'debt';
          const tableHtml = `
            <h3 style="font-size:15pt; color:#334155; border-left:8px solid #64748b; padding-left:15px; margin-top:30px; margin-bottom:12px; font-weight:bold;">${entry.title}</h3>
            <table style="width:100%; border-collapse:collapse; font-size:11pt;">
              <tr style="background:#f8fafc;">
                <th style="border:1px solid #000; padding:10px; width:40px; text-align:center;">STT</th>
                <th style="border:1px solid #000; padding:10px;">Họ tên học sinh</th>
                <th style="border:1px solid #000; padding:10px; width:55px; text-align:center;">Nhóm</th>
                <th style="border:1px solid #000; padding:10px; width:85px; text-align:center;">Bắt đầu</th>
                <th style="border:1px solid #000; padding:10px; width:65px; text-align:center;">Số buổi</th>
                <th style="border:1px solid #000; padding:10px; width:100px; text-align:center;">SĐT</th>
                ${isDebt ? '<th style="border:1px solid #000; padding:10px; width:140px; text-align:center;">Tháng nợ cũ</th>' : '<th style="border:1px solid #000; padding:10px; width:100px; text-align:center;">Ghi chú</th>'}
              </tr>
              ${entry.list.map((s, idx) => {
                const unpaid = isDebt ? (classStats.debtors.find(d => d.student === s)?.unpaidMonths.join(', ') || '') : '';
                return `
                <tr>
                  <td style="border:1px solid #000; padding:10px; text-align:center;">${idx + 1}</td>
                  <td style="border:1px solid #000; padding:10px; font-weight:bold;">${s['HỌ TÊN HS']}</td>
                  <td style="border:1px solid #000; padding:10px; text-align:center;">${s['TÊN LỚP']}</td>
                  <td style="border:1px solid #000; padding:10px; text-align:center;">${formatDateVN(s['NGÀY BẮT ĐẦU'])}</td>
                  <td style="border:1px solid #000; padding:10px; text-align:center; font-weight:bold; color:#2563eb;">${calculateAttended(s)}</td>
                  <td style="border:1px solid #000; padding:10px; text-align:center; font-weight:bold; color:#1e40af;">
                    ${s['SỐ ĐIỆN THOẠI 1'] || ''}
                  </td>
                  <td style="border:1px solid #000; padding:10px; text-align:center; ${isDebt ? 'color:#dc2626; font-weight:bold; font-size:9pt;' : ''}">
                    ${isDebt ? unpaid : ''}
                  </td>
                </tr>
              `}).join('')}
            </table>
          `;
          currentY = await captureAndAddSection(doc, tableHtml, currentY);
        }
      }

      await captureAndAddSection(doc, `
        <div style="margin-top:50px; text-align:right; font-size:12pt;">
           <div style="display:inline-block; text-align:center;">
             <p style="margin-bottom:80px; font-weight:bold;">NGƯỜI LẬP BÁO CÁO</p>
             <p style="font-weight:bold; text-transform:uppercase;">LÊ HOÀ HIỆP</p>
           </div>
        </div>
        <div style="margin-top:20px; text-align:center; font-style:italic; font-size:10pt; color:#999; border-top:1px solid #eee; padding-top:15px;">
          Tài liệu nội bộ - Hệ thống quản lý học tập thông minh v2.0 - Hotline: 0983.676.470
        </div>
      `, currentY);

      doc.save(`Bao_Cao_Lop_T${currentMonth}_HD.pdf`);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi xuất PDF sắc nét cao.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportStudentReport = async () => {
    if (!selectedStudent || !studentDetailStats) return;
    setIsExporting(true);
    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      
      const aiComment = await geminiService.generateReportContent('student', {
        name: selectedStudent['HỌ TÊN HS'],
        attended: studentDetailStats.attendedCount,
        absences: studentDetailStats.absencesCount,
        unpaidMonths: studentDetailStats.unpaidLabels
      });

      let currentY = 15;

      // Tính toán thông tin cho bảng chi tiết
      const detailedAbsences = studentDetailStats.absenceDates.map(d => formatDateVN(d)).join(', ') || 'Không vắng';
      const detailedPaidMonths = studentDetailStats.paidMonths.join(', ') || 'Chưa đóng';
      const periodStr = `Từ ${formatDateVN(selectedStudent['NGÀY BẮT ĐẦU'])} đến ${today.toLocaleDateString('vi-VN')}`;

      currentY = await captureAndAddSection(doc, `
        <div style="text-align:center; margin-bottom: 25px;">
          <h1 style="font-size:26pt; color:#2563eb; text-transform:uppercase; margin-bottom:5px; font-weight:bold;">PHIẾU THEO DÕI HỌC TẬP</h1>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:20px; border-top: 3px solid #2563eb; border-bottom: 3px solid #2563eb; padding: 15px 0;">
          <div style="width: 60%;">
            <p style="margin:5px 0; font-size:14pt;"><strong>Họ và tên:</strong> <span style="font-size:18pt; color:#1e3a8a; font-weight:bold;">${selectedStudent['HỌ TÊN HS']}</span></p>
            <p style="margin:5px 0; font-size:13pt;"><strong>Lớp đào tạo:</strong> ${selectedStudent['TÊN LỚP']} (Nhóm ${selectedStudent['KHỐI']})</p>
          </div>
          <div style="width: 40%; text-align:right;">
            <p style="margin:5px 0; font-size:13pt;"><strong>Ngày tham gia:</strong> ${formatDateVN(selectedStudent['NGÀY BẮT ĐẦU'])}</p>
            <p style="margin:5px 0; font-size:13pt;"><strong>Ngày in phiếu:</strong> ${today.toLocaleDateString('vi-VN')}</p>
          </div>
        </div>
      `, currentY);

      currentY = await captureAndAddSection(doc, `
        <div style="background:#f0f9ff; border-radius:15px; padding:25px; margin-bottom:25px; border:2px solid #bae6fd;">
          <h3 style="margin-top:0; color:#0369a1; font-size:15pt; border-bottom:1px solid #bae6fd; padding-bottom:10px; margin-bottom:15px; font-weight:bold;">LỜI NHẮN TỪ THẦY / CÔ:</h3>
          <p style="font-style:italic; margin:0; text-align:justify; font-size:14pt; line-height:1.7;">"${aiComment}"</p>
        </div>
      `, currentY);

      currentY = await captureAndAddSection(doc, `
        <h3 style="font-size:16pt; color:#1e3a8a; border-left:8px solid #2563eb; padding-left:15px; margin-bottom:15px; font-weight:bold; text-transform:uppercase;">KẾT QUẢ CHUYÊN CẦN & HỌC PHÍ:</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:25px; font-size:13pt;">
          <tr style="background:#2563eb; color:#fff;">
            <th style="border:1px solid #000; padding:12px; text-align:center; width:280px;">CÁC TIÊU CHÍ THEO DÕI</th>
            <th style="border:1px solid #000; padding:12px; text-align:center; width:150px;">KẾT QUẢ</th>
            <th style="border:1px solid #000; padding:12px; text-align:center;">CHI TIẾT:</th>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:12px; text-align:center;">Số buổi học tập trung thực tế</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-weight:bold; color:#059669;">${studentDetailStats.attendedCount} buổi</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; color:#666;">${periodStr}</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:12px; text-align:center;">Số buổi vắng mặt (có phép/không phép)</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-weight:bold; color:#dc2626;">${studentDetailStats.absencesCount} buổi</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-size:11pt;">${detailedAbsences}</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:12px; text-align:center;">Số tháng đã hoàn tất học phí</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-weight:bold;">${studentDetailStats.paidCount} tháng</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-size:11pt;">${detailedPaidMonths}</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:12px; text-align:center;">Các tháng còn nợ học phí</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-weight:bold; color:#dc2626;">${studentDetailStats.unpaidCount} tháng</td>
            <td style="border:1px solid #000; padding:12px; text-align:center; font-weight:bold; color:#dc2626; font-size:11pt;">${studentDetailStats.unpaidLabels || 'Đã hoàn thành ✅'}</td>
          </tr>
        </table>
      `, currentY);

      if (chartRef.current) {
        const chartCaptureContainer = document.createElement('div');
        chartCaptureContainer.style.width = '1000px';
        chartCaptureContainer.style.padding = '30px 50px';
        chartCaptureContainer.style.backgroundColor = '#ffffff';
        chartCaptureContainer.style.fontFamily = '"Times New Roman", Times, serif';
        chartCaptureContainer.style.position = 'fixed';
        chartCaptureContainer.style.left = '-9999px';
        
        chartCaptureContainer.innerHTML = `
          <h3 style="font-size:16pt; font-weight:bold; color:#1e3a8a; margin-bottom:20px; border-left:8px solid #1e3a8a; padding-left:15px; text-transform:uppercase;">BIỂU ĐỒ DIỄN BIẾN CHUYÊN CẦN (12 THÁNG GẦN NHẤT):</h3>
          <div id="chart-image-target" style="width: 100%; height: 400px; border: 1px solid #eee; border-radius: 10px; padding: 10px;"></div>
        `;
        document.body.appendChild(chartCaptureContainer);

        const originalChartCanvas = await html2canvas(chartRef.current, { 
          scale: 4, 
          useCORS: true,
          logging: false 
        });
        const chartImgData = originalChartCanvas.toDataURL('image/png');
        
        const target = chartCaptureContainer.querySelector('#chart-image-target') as HTMLElement;
        const img = document.createElement('img');
        img.src = chartImgData;
        img.style.width = '100%';
        target.appendChild(img);

        const finalCanvas = await html2canvas(chartCaptureContainer, { 
          scale: 4, 
          useCORS: true, 
          logging: false 
        });
        const finalImgData = finalCanvas.toDataURL('image/jpeg', 1.0);
        
        const pdfWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        const finalImgWidth = pdfWidth - (margin * 2);
        const finalImgHeight = (finalCanvas.height * finalImgWidth) / finalCanvas.width;

        if (currentY + finalImgHeight > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          currentY = 15;
        }

        doc.addImage(finalImgData, 'JPEG', margin, currentY, finalImgWidth, finalImgHeight, undefined, 'FAST');
        document.body.removeChild(chartCaptureContainer);
        currentY += finalImgHeight + 15;
      }

      await captureAndAddSection(doc, `
        <div style="display:flex; justify-content:space-between; margin-top:40px;">
          <div style="text-align:center; width: 45%;">
            <p style="font-weight:bold;">XÁC NHẬN CỦA PHỤ HUYNH</p>
            <p style="font-size:11pt; font-style:italic;">(Ký và ghi rõ họ tên)</p>
          </div>
          <div style="text-align:center; width: 45%;">
             <div style="display:inline-block; text-align:center;">
               <p style="font-weight:bold;">GIÁO VIÊN CHỦ NHIỆM</p>
               <p style="font-size:11pt; font-style:italic;">(Đã phê duyệt điện tử)</p>
               <p style="margin-top:70px; font-weight:bold; font-size:16pt;">LÊ HOÀ HIỆP</p>
             </div>
          </div>
        </div>
      `, currentY);

      doc.save(`Phieu_Hoc_Tap_${selectedStudent['HỌ TÊN HS']}_HD.pdf`);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi tạo phiếu học tập sắc nét cao.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-50">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <h2 className="text-xl font-black text-blue-900 uppercase flex items-center gap-3">
            <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
            Thống kê nhóm (T{currentMonth}/{currentYear})
          </h2>
          <button 
            onClick={exportClassReport}
            disabled={isExporting}
            className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:bg-gray-400"
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                ĐANG XỬ LÝ HD...
              </>
            ) : "XUẤT BÁO CÁO NHÓM (PDF HD)"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Sĩ số nhóm</p>
            <p className="text-3xl font-black text-blue-900">{students.length}</p>
          </div>
          <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Đã đóng (T{currentMonth})</p>
            <p className="text-3xl font-black text-emerald-600">{classStats.paidThisMonth.length}</p>
          </div>
          <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Chuẩn bị đóng (T{currentMonth})</p>
            <p className="text-3xl font-black text-red-600">{classStats.unpaidThisMonth.length}</p>
          </div>
          <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">Nợ phí cũ</p>
            <p className="text-3xl font-black text-orange-600">{classStats.debtors.length}</p>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          {/* Danh sách học sinh ĐÃ ĐÓNG */}
          <div>
            <h3 className="text-[11px] font-black text-emerald-600 uppercase mb-3 tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              Học sinh đã hoàn thành học phí tháng này
            </h3>
            <div className="flex flex-wrap gap-2">
              {classStats.paidThisMonth.map((s, i) => (
                <span key={i} className="bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-[11px] font-bold border border-emerald-100 shadow-sm">
                  {s['HỌ TÊN HS']} - <span className="opacity-60">{s['TÊN LỚP']}</span>
                </span>
              ))}
              {classStats.paidThisMonth.length === 0 && <span className="text-gray-400 font-bold text-xs italic">Chưa có ai hoàn thành học phí tháng này.</span>}
            </div>
          </div>

          {/* Danh sách học sinh CHUẨN BỊ ĐÓNG */}
          <div>
            <h3 className="text-[11px] font-black text-red-500 uppercase mb-3 tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              Học sinh chuẩn bị đóng phí tháng này
            </h3>
            <div className="flex flex-wrap gap-2">
              {classStats.unpaidThisMonth.map((s, i) => (
                <span key={i} className="bg-red-50 text-red-700 px-3 py-2 rounded-xl text-[11px] font-bold border border-red-100 shadow-sm">
                  {s['HỌ TÊN HS']} - <span className="opacity-60">{s['TÊN LỚP']}</span>
                </span>
              ))}
              {classStats.unpaidThisMonth.length === 0 && <span className="text-emerald-600 font-bold text-xs">Tất cả đã hoàn thành! ✅</span>}
            </div>
          </div>

          {/* Danh sách học sinh NỢ PHÍ CŨ */}
          <div>
            <h3 className="text-[11px] font-black text-orange-500 uppercase mb-3 tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
              Học sinh nợ phí các tháng trước
            </h3>
            <div className="flex flex-wrap gap-3">
              {classStats.debtors.map((d, i) => (
                <div key={i} className="bg-white border border-orange-200 px-4 py-2.5 rounded-2xl shadow-sm flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-800">
                    {d.student['HỌ TÊN HS']} - <span className="text-gray-400 font-medium">{d.student['TÊN LỚP']}</span>
                  </span>
                  <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-2.5 py-1 rounded-lg uppercase border border-orange-200">
                    Nợ: {d.unpaidMonths.join(', ')}
                  </span>
                </div>
              ))}
              {classStats.debtors.length === 0 && <span className="text-emerald-600 font-bold text-xs">Tuyệt vời! Không có nợ cũ. ✨</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-50">
        <h2 className="text-xl font-black text-blue-900 uppercase mb-8 flex items-center gap-3">
          <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
          Báo cáo cá nhân
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="md:col-span-3">
            <select 
              className="w-full p-4 border border-gray-200 rounded-xl font-bold text-gray-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              value={selectedStudentName}
              onChange={(e) => setSelectedStudentName(e.target.value)}
            >
              <option value="">-- Chọn học sinh để xem dữ liệu chi tiết --</option>
              {students.map((s, idx) => (
                <option key={idx} value={s['HỌ TÊN HS']}>{s['HỌ TÊN HS']} (Nhóm {s['KHỐI']})</option>
              ))}
            </select>
          </div>
          <button
            onClick={exportStudentReport}
            disabled={!selectedStudent || isExporting}
            className={`flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-black transition-all shadow-lg active:scale-95 ${
              selectedStudent && !isExporting ? 'bg-blue-700 text-white hover:bg-blue-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isExporting ? "ĐANG TẠO PDF..." : "XUẤT PHIẾU HD (PDF)"}
          </button>
        </div>

        {selectedStudent && studentDetailStats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-slideUp">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Ngày bắt đầu</p>
                  <p className="text-lg font-bold text-blue-900">{formatDateVN(selectedStudent['NGÀY BẮT ĐẦU'])}</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Số buổi đã học</p>
                  <p className="text-lg font-bold text-emerald-600">{studentDetailStats.attendedCount}</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Số buổi vắng</p>
                  <p className="text-lg font-bold text-red-500">{studentDetailStats.absencesCount}</p>
                  <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto no-scrollbar">
                    {studentDetailStats.absenceDates.map((d, i) => (
                      <span key={i} className="text-[8px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                        {formatDateVN(d).split('/')[0]}/{formatDateVN(d).split('/')[1]}
                      </span>
                    ))}
                    {studentDetailStats.absenceDates.length === 0 && <span className="text-[8px] text-gray-300 italic">Không vắng buổi nào</span>}
                  </div>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Số tháng đóng phí</p>
                  <p className="text-lg font-bold text-blue-600">{studentDetailStats.paidCount}</p>
                  <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto no-scrollbar">
                    {studentDetailStats.paidMonths.map((m, i) => (
                      <span key={i} className="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
                <p className="text-[10px] font-black text-orange-400 uppercase mb-2 tracking-widest">Tháng chuẩn bị đóng học phí</p>
                <p className="text-sm font-bold text-orange-800">{studentDetailStats.unpaidLabels || "Đã hoàn thành đầy đủ!"}</p>
              </div>
            </div>

            <div 
              ref={chartRef}
              className="bg-white p-6 rounded-2xl border border-gray-200 min-h-[350px]"
            >
              <p className="text-[10px] font-black text-gray-400 uppercase mb-6 tracking-widest text-center">Biểu đồ chuyên cần (Buổi/Tháng)</p>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={studentDetailStats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{fontSize: 10, fontWeights: 900}} axisLine={false} tickLine={false} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                    <Tooltip cursor={{fill: '#f1f5f9'}} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={35}>
                      {studentDetailStats.chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#2563eb' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Statistics;
