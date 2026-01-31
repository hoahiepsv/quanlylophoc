
import React, { useState, useMemo, useRef } from 'react';
import { Student } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import html2canvas from 'html2canvas';
import { geminiService } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  AlignmentType, 
  WidthType, 
  BorderStyle,
  VerticalAlign,
  ImageRun,
} from 'docx';

interface StatisticsProps {
  students: Student[];
}

// Hàm chuẩn hoá ngày an toàn để tránh nhảy ngày do múi giờ
const cleanDateStr = (val: any): string => {
  if (!val) return '';
  const dateObj = new Date(val);
  if (isNaN(dateObj.getTime())) return String(val).split(/[T ]/)[0];
  return dateObj.toLocaleDateString('en-CA');
};

const Statistics: React.FC<StatisticsProps> = ({ students }) => {
  const [selectedStudentName, setSelectedStudentName] = useState<string>('');
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [reportFilterGrade, setReportFilterGrade] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  
  const studentReportRef = useRef<HTMLDivElement>(null);
  const jpegTemplateRef = useRef<HTMLDivElement>(null);
  const classJpegTemplateRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => new Date(), []);
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const currentMonthTag = `T${currentMonth}/${currentYear}`;
  
  const WORD_FONT = "Times New Roman";
  const WORD_SIZE = 26; // 13pt = 26 half-points in docx

  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = cleanDateStr(dateStr);
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return clean;
  };

  const getRequiredMonths = (startDateStr: string) => {
    if (!startDateStr) return [];
    const dateOnly = cleanDateStr(startDateStr);
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
    const schedule = (student['LỊCH HỌC'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
    const absences = (student['ĐIỂM DANH HS'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
    const nowStr = cleanDateStr(today);
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

  const filteredStudentsForReport = useMemo(() => {
    return students.filter(s => {
      const matchGrade = !reportFilterGrade || String(s['KHỐI']) === reportFilterGrade;
      const matchSearch = !reportSearchTerm || (s['HỌ TÊN HS'] || '').toLowerCase().includes(reportSearchTerm.toLowerCase());
      return matchGrade && matchSearch;
    });
  }, [students, reportFilterGrade, reportSearchTerm]);

  const activeGradesForFilter = useMemo(() => {
    const grades = new Set<string>();
    students.forEach(s => {
      const k = String(s['KHỐI']);
      if (k && k !== 'undefined' && k !== 'null') grades.add(k);
    });
    return Array.from(grades).sort((a, b) => {
      const nA = parseInt(a);
      const nB = parseInt(b);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      if (!isNaN(nA)) return -1;
      if (!isNaN(nB)) return 1;
      return a.localeCompare(b);
    });
  }, [students]);

  const selectedStudent = useMemo(() => {
    return students.find(s => s['HỌ TÊN HS'] === selectedStudentName);
  }, [selectedStudentName, students]);

  const studentDetailStats = useMemo(() => {
    if (!selectedStudent) return null;

    const fees = (selectedStudent['ĐÓNG HỌC PHÍ'] || '').split(' ').filter(f => f);
    const schedule = (selectedStudent['LỊCH HỌC'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d));
    const absences = (selectedStudent['ĐIỂM DANH HS'] || '').split(' ').filter(d => d).map(d => cleanDateStr(d)).sort();
    
    const nowStr = cleanDateStr(today);
    const attendedCount = calculateAttended(selectedStudent);
    const totalSessionsInMonth = schedule.filter(d => d <= nowStr).length;
    
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
      totalSessionsInMonth,
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

  // HÀM SAO LƯU EXCEL
  const exportBackupExcel = () => {
    if (students.length === 0) {
      alert("Không có dữ liệu để sao lưu.");
      return;
    }

    setIsExporting(true);
    try {
      // Chuẩn bị dữ liệu sạch (loại bỏ rowIndex kỹ thuật)
      const excelData = students.map(s => ({
        'STT': s['STT'],
        'HỌ TÊN HS': s['HỌ TÊN HS'],
        'KHỐI': s['KHỐI'],
        'TÊN LỚP': s['TÊN LỚP'],
        'SỐ ĐIỆN THOẠI 1': s['SỐ ĐIỆN THOẠI 1'],
        'SỐ ĐIỆN THOẠI 2': s['SỐ ĐIỆN THOẠI 2'],
        'NGÀY BẮT ĐẦU': cleanDateStr(s['NGÀY BẮT ĐẦU']),
        'LỊCH HỌC': s['LỊCH HỌC'],
        'ĐIỂM DANH HS': s['ĐIỂM DANH HS'],
        'ĐÓNG HỌC PHÍ': s['ĐÓNG HỌC PHÍ']
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "StudentsData");

      // Tự động điều chỉnh độ rộng cột
      const max_width = excelData.reduce((w, r) => Math.max(w, r['HỌ TÊN HS'].length), 10);
      worksheet["!cols"] = [{ wch: 5 }, { wch: max_width + 5 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 40 }, { wch: 30 }];

      XLSX.writeFile(workbook, `Sao_Luu_Datasheet_Hoc_Sinh_${cleanDateStr(today)}.xlsx`);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi tạo file sao lưu Excel.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportClassReportWord = async () => {
    setIsExporting(true);
    try {
      const aiInsights = await geminiService.generateReportContent('class', {
        total: students.length,
        paid: classStats.paidThisMonth.length,
        unpaid: classStats.unpaidThisMonth.length,
        debtors: classStats.debtors.length
      });

      const tableTitles = [
        { title: `PHỤ LỤC 1: DANH SÁCH HOÀN THÀNH HỌC PHÍ (THÁNG ${currentMonth})`, list: classStats.paidThisMonth, type: 'paid' },
        { title: `PHỤ LỤC 2: DANH SÁCH NHẮC ĐÓNG PHÍ (THÁNG ${currentMonth})`, list: classStats.unpaidThisMonth, type: 'preparing' },
        { title: `PHỤ LỤC 3: DANH SÁCH NỢ TỒN ĐỌNG (THÁNG TRƯỚC)`, list: classStats.debtors.map(d => d.student), type: 'debt' }
      ];

      const children = [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "BÁO CÁO TỔNG QUAN HỌC TẬP",
              bold: true,
              size: 36,
              font: WORD_FONT,
              color: "1e3a8a",
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `Thời gian: Tháng ${currentMonth} Năm ${currentYear}`, font: WORD_FONT, size: WORD_SIZE }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `Ngày kết xuất: ${today.toLocaleDateString('vi-VN')} | Đơn vị: Trung tâm Hoà Hiệp AI`, font: WORD_FONT, size: 22, color: "666666" }),
          ],
          spacing: { after: 400 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "1e3a8a" } },
        }),

        new Paragraph({
          spacing: { before: 400, after: 200 },
          children: [
            new TextRun({ text: "I. NHẬN XÉT ĐÁNH GIÁ CHUNG:", bold: true, font: WORD_FONT, size: 32, color: "1e3a8a" }),
          ],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { fill: "f1f5f9" },
                  margins: { top: 200, bottom: 200, left: 200, right: 200 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.JUSTIFY,
                      children: [
                        new TextRun({ text: aiInsights, font: WORD_FONT, size: WORD_SIZE }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),

        new Paragraph({
          spacing: { before: 400, after: 200 },
          children: [
            new TextRun({ text: "II. SỐ LIỆU THỐNG KÊ CHI TIẾT:", bold: true, font: WORD_FONT, size: 32, color: "1e3a8a" }),
          ],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ shading: { fill: "1e3a8a" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Hạng mục đánh giá", bold: true, color: "ffffff", font: WORD_FONT, size: WORD_SIZE })] })] }),
                new TableCell({ shading: { fill: "1e3a8a" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Số lượng", bold: true, color: "ffffff", font: WORD_FONT, size: WORD_SIZE })] })] }),
                new TableCell({ shading: { fill: "1e3a8a" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tỷ lệ", bold: true, color: "ffffff", font: WORD_FONT, size: WORD_SIZE })] })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "Tổng số học sinh quản lý", font: WORD_FONT, size: WORD_SIZE })] }),
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${students.length}`, bold: true, font: WORD_FONT, size: WORD_SIZE })] })] }),
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: "100%", font: WORD_FONT, size: WORD_SIZE })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: `Đã hoàn thành học phí (T${currentMonth})`, font: WORD_FONT, size: WORD_SIZE })] }),
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${classStats.paidThisMonth.length}`, bold: true, font: WORD_FONT, size: WORD_SIZE })] })] }),
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: `${((classStats.paidThisMonth.length / students.length) * 100).toFixed(1)}%`, font: WORD_FONT, size: WORD_SIZE })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: `Chưa hoàn thành học phí (T${currentMonth})`, font: WORD_FONT, size: WORD_SIZE })] }),
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${classStats.unpaidThisMonth.length}`, bold: true, font: WORD_FONT, size: WORD_SIZE })] })] }),
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: `${((classStats.unpaidThisMonth.length / students.length) * 100).toFixed(1)}%`, font: WORD_FONT, size: WORD_SIZE })] }),
              ],
            }),
          ],
        }),
      ];

      for (const entry of tableTitles) {
        if (entry.list.length > 0) {
          const isDebt = entry.type === 'debt';
          
          children.push(new Paragraph({
            spacing: { before: 600, after: 200 },
            children: [
              new TextRun({ text: entry.title, bold: true, font: WORD_FONT, size: 28, color: "334155" }),
            ],
          }));

          children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ shading: { fill: "f8fafc" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "STT", bold: true, font: WORD_FONT, size: 20 })] })] }),
                  new TableCell({ shading: { fill: "f8fafc" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Họ tên học sinh", bold: true, font: WORD_FONT, size: 20 })] })] }),
                  new TableCell({ shading: { fill: "f8fafc" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Nhóm", bold: true, font: WORD_FONT, size: 20 })] })] }),
                  new TableCell({ shading: { fill: "f8fafc" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Bắt đầu", bold: true, font: WORD_FONT, size: 20 })] })] }),
                  new TableCell({ shading: { fill: "f8fafc" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Số buổi", bold: true, font: WORD_FONT, size: 20 })] })] }),
                  new TableCell({ shading: { fill: "f8fafc" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SĐT", bold: true, font: WORD_FONT, size: 20 })] })] }),
                  new TableCell({ shading: { fill: "f8fafc" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isDebt ? "Tháng nợ" : "Ghi chú", bold: true, font: WORD_FONT, size: 20 })] })] }),
                ],
              }),
              ...entry.list.map((s, idx) => {
                const unpaid = isDebt ? (classStats.debtors.find(d => d.student === s)?.unpaidMonths.join(', ') || '') : '';
                return new TableRow({
                  children: [
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, text: `${idx + 1}`, font: WORD_FONT, size: 20 })] }),
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ children: [new TextRun({ text: s['HỌ TÊN HS'], bold: true, font: WORD_FONT, size: 20 })] })] }),
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, text: s['TÊN LỚP'], font: WORD_FONT, size: 20 })] }),
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, text: formatDateVN(s['NGÀY BẮT ĐẦU']), font: WORD_FONT, size: 20 })] }),
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${calculateAttended(s)}`, bold: true, color: "2563eb", font: WORD_FONT, size: 20 })] })] }),
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, text: s['SỐ ĐIỆN THOẠI 1'], font: WORD_FONT, size: 20 })] }),
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isDebt ? unpaid : '', color: isDebt ? "dc2626" : "000000", font: WORD_FONT, size: 18 })] })] }),
                  ],
                });
              }),
            ],
          }));
        }
      }

      children.push(new Paragraph({ spacing: { before: 800 } }));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [] }),
              new TableCell({
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "NGƯỜI LẬP BÁO CÁO", bold: true, font: WORD_FONT, size: WORD_SIZE })] }),
                  new Paragraph({ spacing: { before: 1200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "LÊ HOÀ HIỆP", bold: true, font: WORD_FONT, size: 32 })] }),
                ],
              }),
            ],
          }),
        ],
      }));

      const doc = new Document({
        sections: [{
          properties: {},
          children: children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Bao_Cao_Nhom_T${currentMonth}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi tạo file Word.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportStudentReportWord = async () => {
    if (!selectedStudent || !studentDetailStats) return;
    setIsExporting(true);
    try {
      const aiComment = await geminiService.generateReportContent('student', {
        name: selectedStudent['HỌ TÊN HS'],
        attended: studentDetailStats.attendedCount,
        absences: studentDetailStats.absencesCount,
        unpaidMonths: studentDetailStats.unpaidLabels
      });

      let chartBase64 = '';
      if (studentReportRef.current) {
        const chartElem = studentReportRef.current.querySelector('.recharts-responsive-container');
        if (chartElem) {
           const canvas = await html2canvas(chartElem as HTMLElement, { scale: 2, useCORS: true, logging: false });
           chartBase64 = canvas.toDataURL('image/png').split(',')[1];
        }
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "PHIẾU THEO DÕI HỌC TẬP",
                  bold: true,
                  size: 36,
                  font: WORD_FONT,
                  color: "2563eb",
                }),
              ],
              spacing: { after: 400 },
            }),

            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.THICK, size: 24, color: "2563eb" },
                bottom: { style: BorderStyle.THICK, size: 24, color: "2563eb" },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: "Họ và tên: ", bold: true, font: WORD_FONT, size: WORD_SIZE }),
                            new TextRun({ text: selectedStudent['HỌ TÊN HS'], bold: true, font: WORD_FONT, size: 32, color: "1e3a8a" }),
                          ],
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({ text: `Lớp đào tạo: ${selectedStudent['TÊN LỚP']} (Nhóm ${selectedStudent['KHỐI']})`, font: WORD_FONT, size: WORD_SIZE }),
                          ],
                        }),
                      ],
                      width: { size: 60, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.RIGHT,
                          children: [
                            new TextRun({ text: `Ngày tham gia: ${formatDateVN(selectedStudent['NGÀY BẮT ĐẦU'])}`, font: WORD_FONT, size: WORD_SIZE }),
                          ],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.RIGHT,
                          children: [
                            new TextRun({ text: `Ngày in phiếu: ${today.toLocaleDateString('vi-VN')}`, font: WORD_FONT, size: WORD_SIZE }),
                          ],
                        }),
                      ],
                      width: { size: 40, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
              ],
            }),

            new Paragraph({ spacing: { before: 400 } }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      shading: { fill: "f0f9ff" },
                      margins: { top: 200, bottom: 200, left: 200, right: 200 },
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: "LỜI NHẮN TỪ THẦY / CÔ:", bold: true, color: "0369a1", font: WORD_FONT, size: WORD_SIZE }),
                          ],
                          spacing: { after: 200 },
                        }),
                        new Paragraph({
                          alignment: AlignmentType.JUSTIFY,
                          children: [
                            new TextRun({ text: `"${aiComment}"`, italics: true, font: WORD_FONT, size: WORD_SIZE }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),

            new Paragraph({
              spacing: { before: 400, after: 200 },
              children: [
                new TextRun({ text: "KẾT QUẢ CHUYÊN CẦN & HỌC PHÍ:", bold: true, font: WORD_FONT, size: 32, color: "1e3a8a" }),
              ],
            }),

            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TIÊU CHÍ", bold: true, color: "ffffff", font: WORD_FONT, size: WORD_SIZE })] })], shading: { fill: "2563eb" } }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "KẾT QUẢ", bold: true, color: "ffffff", font: WORD_FONT, size: WORD_SIZE })] })], shading: { fill: "2563eb" } }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CHI TIẾT", bold: true, color: "ffffff", font: WORD_FONT, size: WORD_SIZE })] })], shading: { fill: "2563eb" } }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ text: "Số buổi học thực tế", font: WORD_FONT, size: WORD_SIZE })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${studentDetailStats.attendedCount} buổi`, bold: true, font: WORD_FONT, size: WORD_SIZE })] })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: `Từ ${formatDateVN(selectedStudent['NGÀY BẮT ĐẦU'])}`, font: WORD_FONT, size: WORD_SIZE })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ text: "Số buổi vắng mặt", font: WORD_FONT, size: WORD_SIZE })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${studentDetailStats.absencesCount} buổi`, bold: true, color: "dc2626", font: WORD_FONT, size: WORD_SIZE })] })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: studentDetailStats.absenceDates.map(d => formatDateVN(d)).join(', ') || 'Không vắng', font: WORD_FONT, size: WORD_SIZE })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ text: "Tháng đã đóng phí", font: WORD_FONT, size: WORD_SIZE })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${studentDetailStats.paidCount} tháng`, bold: true, font: WORD_FONT, size: WORD_SIZE })] })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: studentDetailStats.paidMonths.join(', ') || 'Chưa đóng', font: WORD_FONT, size: WORD_SIZE })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ text: "Tháng còn nợ phí", font: WORD_FONT, size: WORD_SIZE })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${studentDetailStats.unpaidCount} tháng`, bold: true, color: "dc2626", font: WORD_FONT, size: WORD_SIZE })] })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: studentDetailStats.unpaidLabels || 'Hoàn thành ✅', bold: true, font: WORD_FONT, size: WORD_SIZE })] })] }),
                  ],
                }),
              ],
            }),

            new Paragraph({
              spacing: { before: 400, after: 200 },
              children: [
                new TextRun({ text: "BIỂU ĐỒ CHUYÊN CẦN:", bold: true, font: WORD_FONT, size: 28, color: "1e3a8a" }),
              ],
            }),
            ...(chartBase64 ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: Uint8Array.from(atob(chartBase64), c => c.charCodeAt(0)),
                    transformation: { width: 500, height: 250 },
                  }),
                ],
              })
            ] : []),

            new Paragraph({ spacing: { before: 600 } }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "XÁC NHẬN CỦA PHỤ HUYNH", bold: true, font: WORD_FONT, size: WORD_SIZE })] }),
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Ký và ghi rõ họ tên)", italics: true, font: WORD_FONT, size: 22 })] }),
                      ],
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "GIÁO VIÊN CHỦ NHIỆM", bold: true, font: WORD_FONT, size: WORD_SIZE })] }),
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Đã phê duyệt điện tử)", italics: true, font: WORD_FONT, size: 22 })] }),
                        new Paragraph({ spacing: { before: 800 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "LÊ HOÀ HIỆP", bold: true, font: WORD_FONT, size: 32 })] }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Phieu_Hoc_Tap_${selectedStudent['HỌ TÊN HS']}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi tạo file Word.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportStudentReportJPG = async () => {
    if (!selectedStudent || !studentDetailStats || !jpegTemplateRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(jpegTemplateRef.current, {
        scale: 4, 
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 800, 
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `Bao_Cao_${selectedStudent['HỌ TÊN HS']}_${currentMonthTag.replace('/', '_')}.jpg`;
      link.click();
    } catch (err) {
      console.error(err);
      alert("Lỗi khi tạo hình ảnh báo cáo.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportClassReportJPG = async () => {
    if (!classJpegTemplateRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(classJpegTemplateRef.current, {
        scale: 4,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 1200, // Wider to accommodate more columns
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `Bao_Cao_Lop_T${currentMonth}.jpg`;
      link.click();
    } catch (err) {
      console.error(err);
      alert("Lỗi khi tạo hình ảnh báo cáo lớp.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hidden Templates for Image Export */}
      {selectedStudent && studentDetailStats && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={jpegTemplateRef} style={{ width: '800px', padding: '40px', backgroundColor: '#ffffff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '4px solid #2563eb', paddingBottom: '15px' }}>
              <h1 style={{ fontSize: '32px', color: '#1e3a8a', margin: '0', textTransform: 'uppercase', fontWeight: '900' }}>Phiếu Báo Cáo Học Tập</h1>
              <p style={{ color: '#64748b', fontSize: '16px', marginTop: '5px', fontWeight: 'bold' }}>Học sinh: <span style={{ color: '#2563eb' }}>{selectedStudent['HỌ TÊN HS']}</span></p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
              <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '5px' }}>Thông tin lớp học</p>
                <p style={{ fontSize: '16px', margin: '0' }}><b>Nhóm:</b> {selectedStudent['KHỐI']}</p>
                <p style={{ fontSize: '16px', margin: '5px 0' }}><b>Lớp:</b> {selectedStudent['TÊN LỚP']}</p>
                <p style={{ fontSize: '16px', margin: '0' }}><b>Ngày bắt đầu:</b> {formatDateVN(selectedStudent['NGÀY BẮT ĐẦU'])}</p>
              </div>
              <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '5px' }}>Thời gian báo cáo</p>
                <p style={{ fontSize: '18px', margin: '0', color: '#1e3a8a' }}><b>Tháng {currentMonth} / {currentYear}</b></p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '5px' }}>Ngày xuất: {today.toLocaleDateString('vi-VN')}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '30px' }}>
              <div style={{ textAlign: 'center', padding: '12px', background: '#f1f5f9', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <span style={{ display: 'block', fontSize: '9px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>BUỔI DẠY</span>
                <span style={{ fontSize: '20px', fontWeight: '900', color: '#1e293b' }}>{studentDetailStats.totalSessionsInMonth}</span>
                <span style={{ display: 'block', fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>Tổng buổi lịch</span>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: '#ecfdf5', borderRadius: '12px', border: '1px solid #d1fae5' }}>
                <span style={{ display: 'block', fontSize: '9px', color: '#059669', fontWeight: 'bold', textTransform: 'uppercase' }}>ĐÃ HỌC</span>
                <span style={{ fontSize: '20px', fontWeight: '900', color: '#065f46' }}>{studentDetailStats.attendedCount}</span>
                <span style={{ display: 'block', fontSize: '8px', color: '#059669', marginTop: '4px' }}>Chuyên cần</span>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                <span style={{ display: 'block', fontSize: '9px', color: '#dc2626', fontWeight: 'bold', textTransform: 'uppercase' }}>VẮNG MẶT</span>
                <span style={{ fontSize: '20px', fontWeight: '900', color: '#991b1b' }}>{studentDetailStats.absencesCount}</span>
                <p style={{ fontSize: '7px', color: '#b91c1c', marginTop: '4px', lineHeight: '1.2' }}>{studentDetailStats.absenceDates.map(d => formatDateVN(d).split('/')[0] + '/' + formatDateVN(d).split('/')[1]).join(', ') || 'Không vắng'}</p>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #dbeafe' }}>
                <span style={{ display: 'block', fontSize: '9px', color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase' }}>ĐÓNG PHÍ</span>
                <span style={{ fontSize: '20px', fontWeight: '900', color: '#1e40af' }}>{studentDetailStats.paidCount}</span>
                <p style={{ fontSize: '7px', color: '#1d4ed8', marginTop: '4px', lineHeight: '1.2' }}>{studentDetailStats.paidMonths.join(', ') || 'Chưa đóng'}</p>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: '#fff7ed', borderRadius: '12px', border: '1px solid #ffedd5' }}>
                <span style={{ display: 'block', fontSize: '9px', color: '#ea580c', fontWeight: 'bold', textTransform: 'uppercase' }}>CHƯA ĐÓNG</span>
                <span style={{ fontSize: '20px', fontWeight: '900', color: '#9a3412' }}>{studentDetailStats.unpaidCount}</span>
                <p style={{ fontSize: '7px', color: '#c2410c', marginTop: '4px', lineHeight: '1.2' }}>{studentDetailStats.unpaidLabels || 'Đã hoàn thành'}</p>
              </div>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '15px', textAlign: 'center', textTransform: 'uppercase' }}>Biểu đồ chuyên cần theo tháng</p>
              <div style={{ height: '220px', background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '10px', padding: '10px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={studentDetailStats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={30}>
                      {studentDetailStats.chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={index === studentDetailStats.chartData.length - 1 ? '#1e3a8a' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '20px', borderTop: '1px dashed #cbd5e1' }}>
              <div style={{ textAlign: 'center', width: '40%' }}>
                <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0' }}>PHỤ HUYNH XÁC NHẬN</p>
                <div style={{ height: '60px' }}></div>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>(Ký và ghi rõ họ tên)</p>
              </div>
              <div style={{ textAlign: 'center', width: '40%' }}>
                <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0' }}>GIÁO VIÊN CHỦ NHIỆM</p>
                <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e3a8a', marginTop: '50px', marginBottom: '0' }}>LÊ HOÀ HIỆP</p>
                <p style={{ fontSize: '11px', color: '#059669', fontWeight: 'bold' }}>✓ Đã phê duyệt điện tử</p>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '40px', fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>
              Báo cáo được khởi tạo tự động bởi Hệ Thống Quản Lý Hoà Hiệp AI
            </div>
          </div>
        </div>
      )}

      {/* Class Report JPEG Template */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={classJpegTemplateRef} style={{ width: '1200px', padding: '50px', backgroundColor: '#ffffff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px', borderBottom: '5px solid #1e3a8a', paddingBottom: '20px' }}>
            <h1 style={{ fontSize: '42px', color: '#1e3a8a', margin: '0', textTransform: 'uppercase', fontWeight: '900' }}>Báo Cáo Tổng Quan Học Tập</h1>
            <p style={{ color: '#475569', fontSize: '20px', marginTop: '10px' }}>Thời gian: Tháng {currentMonth} Năm {currentYear}</p>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '5px' }}>Đơn vị: Trung tâm Hoà Hiệp AI | Ngày xuất: {today.toLocaleDateString('vi-VN')}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
            <div style={{ background: '#f1f5f9', padding: '25px', borderRadius: '20px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Sĩ số nhóm</span>
              <span style={{ fontSize: '48px', fontWeight: '900', color: '#1e3a8a' }}>{students.length}</span>
            </div>
            <div style={{ background: '#ecfdf5', padding: '25px', borderRadius: '20px', textAlign: 'center', border: '1px solid #d1fae5' }}>
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#059669', textTransform: 'uppercase' }}>Đã đóng phí</span>
              <span style={{ fontSize: '48px', fontWeight: '900', color: '#065f46' }}>{classStats.paidThisMonth.length}</span>
            </div>
            <div style={{ background: '#fef2f2', padding: '25px', borderRadius: '20px', textAlign: 'center', border: '1px solid #fee2e2' }}>
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#dc2626', textTransform: 'uppercase' }}>Chuẩn bị đóng</span>
              <span style={{ fontSize: '48px', fontWeight: '900', color: '#991b1b' }}>{classStats.unpaidThisMonth.length}</span>
            </div>
            <div style={{ background: '#fff7ed', padding: '25px', borderRadius: '20px', textAlign: 'center', border: '1px solid #ffedd5' }}>
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#ea580c', textTransform: 'uppercase' }}>Nợ phí cũ</span>
              <span style={{ fontSize: '48px', fontWeight: '900', color: '#9a3412' }}>{classStats.debtors.length}</span>
            </div>
          </div>

          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ fontSize: '20px', color: '#1e3a8a', borderLeft: '10px solid #1e3a8a', paddingLeft: '20px', marginBottom: '20px', fontWeight: '900' }}>DANH SÁCH CHI TIẾT THEO TÌNH TRẠNG PHÍ</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#1e3a8a', color: '#fff' }}>
                  <th style={{ border: '1px solid #e2e8f0', padding: '12px', textAlign: 'left' }}>Họ tên học sinh</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '12px' }}>Nhóm - Lớp</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '12px' }}>Bắt đầu</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '12px' }}>Đã học</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '12px' }}>Vắng</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '12px' }}>SĐT liên hệ</th>
                  <th style={{ border: '1px solid #e2e8f0', padding: '12px' }}>Tình trạng phí (Tháng {currentMonth})</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => {
                  const isPaid = classStats.paidThisMonth.includes(s);
                  const debt = classStats.debtors.find(d => d.student === s);
                  const attendedCount = calculateAttended(s);
                  const absenceCount = (s['ĐIỂM DANH HS'] || '').split(' ').filter(d => d).length;
                  
                  let statusText = 'Chưa đóng phí';
                  let statusColor = '#dc2626'; // Red
                  if (isPaid) {
                    statusText = 'Đã hoàn thành ✓';
                    statusColor = '#059669'; // Emerald
                  } else if (debt) {
                    statusText = `Nợ cũ: ${debt.unpaidMonths.join(', ')}`;
                    statusColor = '#ea580c'; // Orange
                  }

                  return (
                    <tr key={i}>
                      <td style={{ border: '1px solid #e2e8f0', padding: '12px', fontWeight: 'bold' }}>{s['HỌ TÊN HS']}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '12px', textAlign: 'center' }}>{s['KHỐI']} - {s['TÊN LỚP']}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '12px', textAlign: 'center' }}>{formatDateVN(s['NGÀY BẮT ĐẦU'])}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#059669' }}>{attendedCount}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#dc2626' }}>{absenceCount}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '12px', textAlign: 'center' }}>{s['SỐ ĐIỆN THOẠI 1']}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '12px', textAlign: 'center', color: statusColor, fontWeight: 'bold' }}>
                        {statusText}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '60px' }}>
            <div style={{ textAlign: 'center', width: '300px' }}>
              <p style={{ fontWeight: 'bold', fontSize: '18px', margin: '0' }}>NGƯỜI LẬP BÁO CÁO</p>
              <div style={{ height: '80px' }}></div>
              <p style={{ fontWeight: '900', fontSize: '24px', color: '#1e3a8a', margin: '0' }}>LÊ HOÀ HIỆP</p>
              <p style={{ fontSize: '12px', color: '#94a3b8' }}>(Đã xác thực chữ ký điện tử)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main UI */}
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-50">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <h2 className="text-xl font-black text-blue-900 uppercase flex items-center gap-3">
            <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
            Thống kê nhóm (T{currentMonth}/{currentYear})
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <button 
              onClick={exportBackupExcel}
              disabled={isExporting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-black text-[11px] shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:bg-gray-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              SAO LƯU (Excel)
            </button>
            <button 
              onClick={exportClassReportWord}
              disabled={isExporting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-black text-[11px] shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:bg-gray-400"
            >
              Word
            </button>
            <button 
              onClick={exportClassReportJPG}
              disabled={isExporting}
              className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-3 rounded-xl font-black text-[11px] shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:bg-gray-400"
            >
              JPEG
            </button>
          </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input 
              type="text"
              placeholder="Tìm tên học sinh..."
              value={reportSearchTerm}
              onChange={(e) => setReportSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-gray-100 bg-slate-50/50 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold text-sm text-gray-700 transition-all"
            />
          </div>
          <div className="relative">
            <select 
              value={reportFilterGrade}
              onChange={(e) => setReportFilterGrade(e.target.value)}
              className="w-full px-4 py-3 border border-gray-100 bg-slate-50/50 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-black text-[11px] text-blue-800 uppercase tracking-widest transition-all"
            >
              <option value="">Tất cả Nhóm</option>
              {activeGradesForFilter.map((grade) => (
                <option key={grade} value={grade}>Nhóm {grade}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          <div className="md:col-span-2 lg:col-span-2">
            <select 
              className="w-full p-4 border border-gray-200 rounded-xl font-bold text-gray-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 shadow-md"
              value={selectedStudentName}
              onChange={(e) => setSelectedStudentName(e.target.value)}
            >
              <option value="">-- Kết quả: {filteredStudentsForReport.length} học sinh --</option>
              {filteredStudentsForReport.map((s, idx) => (
                <option key={idx} value={s['HỌ TÊN HS']}>{s['HỌ TÊN HS']} (Nhóm {s['KHỐI']})</option>
              ))}
            </select>
          </div>
          <button
            onClick={exportStudentReportWord}
            disabled={!selectedStudent || isExporting}
            className={`flex items-center justify-center gap-2 px-4 py-4 rounded-xl font-black transition-all shadow-lg active:scale-95 ${
              selectedStudent && !isExporting ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            Word
          </button>
          <button
            onClick={exportStudentReportJPG}
            disabled={!selectedStudent || isExporting}
            className={`flex items-center justify-center gap-2 px-4 py-4 rounded-xl font-black transition-all shadow-lg active:scale-95 ${
              selectedStudent && !isExporting ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            JPEG
          </button>
        </div>
        {selectedStudent && studentDetailStats && (
          <div ref={studentReportRef} className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-slideUp bg-white p-2 rounded-2xl">
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
            <div className="bg-white p-6 rounded-2xl border border-gray-200 min-h-[350px]">
              <p className="text-[10px] font-black text-gray-400 uppercase mb-6 tracking-widest text-center">Biểu đồ chuyên cần (Buổi/Tháng)</p>
              <div className="h-[280px] w-full recharts-responsive-container">
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
