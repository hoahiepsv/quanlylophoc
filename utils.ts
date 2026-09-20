import { Student } from './types';

/**
 * Chuẩn hoá chuỗi bỏ dấu tiếng Việt và chuyển về chữ thường:
 * - Sử dụng bảng mã NFD và loại bỏ các dấu thanh / dấu phụ ([\u0300-\u036f])
 * - Chuyển đổi ký tự đặc biệt đ/Đ ➔ d
 * - Chuyển toàn bộ về chữ thường và cắt khoảng trắng dư thừa
 */
export const removeVietnameseTones = (str: string): string => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd');
};

export const normalizeSearchText = (text: string): string => {
  return removeVietnameseTones(text || '').toLowerCase().trim();
};

/**
 * Kiểm tra học sinh có khớp với từ khoá tìm kiếm hay không:
 * - Không phân biệt chữ hoa / chữ thường
 * - Không phân biệt dấu tiếng Việt (NFD, đ/Đ -> d, á/à/ả... -> a)
 * - Phạm vi tìm kiếm linh hoạt:
 *   + Họ và tên học sinh
 *   + Số điện thoại 1 hoặc Số điện thoại 2
 *   + Tên lớp (VD: 12A1, 10...)
 *   + Khối / Nhóm
 * - Hỗ trợ cả tìm cụm từ chính xác hoặc tìm nhiều từ khoá kết hợp (VD: "hiep 12a1")
 */
export const matchStudentSearch = (student: Partial<Student>, searchTerm: string): boolean => {
  const normalizedTerm = normalizeSearchText(searchTerm);
  if (!normalizedTerm) return true;

  const nameNorm = normalizeSearchText(student['HỌ TÊN HS'] || '');
  const phone1Norm = normalizeSearchText(student['SỐ ĐIỆN THOẠI 1'] || '');
  const phone2Norm = normalizeSearchText(student['SỐ ĐIỆN THOẠI 2'] || '');
  const classNorm = normalizeSearchText(student['TÊN LỚP'] || '');
  const gradeNorm = normalizeSearchText(String(student['KHỐI'] || ''));

  // Kiểm tra từng trường cụ thể
  if (
    nameNorm.includes(normalizedTerm) ||
    phone1Norm.includes(normalizedTerm) ||
    phone2Norm.includes(normalizedTerm) ||
    classNorm.includes(normalizedTerm) ||
    gradeNorm.includes(normalizedTerm)
  ) {
    return true;
  }

  // Chuỗi tổng hợp để hỗ trợ tìm kiếm kết hợp nhiều từ (VD: "hiệp 12a1", "duc 0912")
  const combinedInfo = `${nameNorm} ${phone1Norm} ${phone2Norm} ${classNorm} ${gradeNorm}`;
  if (combinedInfo.includes(normalizedTerm)) {
    return true;
  }

  const words = normalizedTerm.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 1) {
    return words.every(word => combinedInfo.includes(word));
  }

  return false;
};

/**
 * Chuẩn hoá chuỗi ngày thành YYYY-MM-DD an toàn theo giờ địa phương
 */
export const cleanDateStr = (val: any): string => {
  if (!val) return '';
  const dateObj = new Date(val);
  if (isNaN(dateObj.getTime())) return String(val).split(/[T ]/)[0];
  return dateObj.toLocaleDateString('en-CA');
};

/**
 * Định dạng ngày đầy đủ tiếng Việt: Thứ ..., ngày DD/MM/YYYY
 */
export const formatFullDateVN = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = days[date.getDay()] || '';
  return `${dayName}, ngày ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
};
