
/**
 * API SERVICE - KẾT NỐI GOOGLE APPS SCRIPT
 * Tối ưu hóa: Bộ nhớ đệm cục bộ (Local Cache SWR) + Tải ngầm trước (Background Pre-fetch)
 */
const GAS_URL_STUDENTS = 'https://script.google.com/macros/s/AKfycbzh_PI-oGThMjSN4Sc3_ttaSzUExOAfguXCOwQ8esP3jSZOFlpyd7E4ZELC6fsXfFJ7/exec';
const GAS_URL_TEACHER = 'https://script.google.com/macros/s/AKfycbz5GilAmCy4JHWDih7cgQAylFsJuWxTeFQORPuGtUr72-M0-VkQaSQJp1I_yfMTRiXHWg/exec';

const CACHE_KEY_STUDENTS = 'QL_STUDENTS_CACHE_V2';
const CACHE_KEY_TEACHER = 'QL_TEACHER_CACHE_V2';
const CACHE_KEY_TIMESTAMP = 'QL_LAST_SYNC_V2';

let inFlightPreload: Promise<{ students: any[]; teacherSchedules: any[]; syncTime: string }> | null = null;

// Hàm gửi yêu cầu mạng an toàn tới Google Apps Script (độc lập, không phụ thuộc con trỏ this)
async function sendGasRequest(
  url: string, 
  action: string, 
  data: any = {}, 
  rowIndex?: number, 
  retryCount = 1
): Promise<any> {
  const payload: any = { action, data };
  if (rowIndex !== undefined && rowIndex !== null) {
    payload.rowIndex = rowIndex;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`Lỗi kết nối máy chủ Google: HTTP ${response.status}`);
    }

    const text = await response.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      // Nếu Apps Script phản hồi chuỗi text thay vì JSON
      const lower = (text || '').toLowerCase();
      if (lower.includes('success') || lower.includes('thành công') || lower.includes('ok')) {
        return { success: true, message: text };
      }
      if (text.includes('<html') || text.includes('<!DOCTYPE')) {
        throw new Error('Google Apps Script phản hồi trang HTML lỗi. Vui lòng kiểm tra quyền triển khai Web App (Who has access: Anyone).');
      }
      throw new Error(text.length < 200 ? text : 'Dữ liệu phản hồi từ Apps Script không đúng định dạng JSON.');
    }

    if (result) {
      if (result.success === false || result.status === 'error' || result.error) {
        throw new Error(result.message || result.error || 'Yêu cầu thất bại từ phía máy chủ.');
      }
    }

    return result;
  } catch (error: any) {
    const errorMsg = error?.name === 'AbortError' 
      ? 'Quá thời gian phản hồi từ Google Sheets (Timeout). Vui lòng thử lại.' 
      : (error?.message || 'Không thể kết nối với Datasheet Google Sheets.');

    if (retryCount > 0 && error?.name !== 'AbortError') {
      console.warn(`Lỗi API (${errorMsg}), đang thử lại tự động...`);
      await new Promise(r => setTimeout(r, 1200));
      return sendGasRequest(url, action, data, rowIndex, retryCount - 1);
    }
    console.error("Lỗi API chi tiết:", error);
    throw new Error(errorMsg);
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiService = {
  // Đọc dữ liệu từ bộ nhớ đệm cục bộ (tức thì 0ms)
  getCachedData() {
    try {
      const rawStudents = localStorage.getItem(CACHE_KEY_STUDENTS);
      const rawTeachers = localStorage.getItem(CACHE_KEY_TEACHER);
      const lastSync = localStorage.getItem(CACHE_KEY_TIMESTAMP);
      return {
        students: rawStudents ? JSON.parse(rawStudents) : null,
        teacherSchedules: rawTeachers ? JSON.parse(rawTeachers) : null,
        lastSync: lastSync || null
      };
    } catch (e) {
      console.warn("Lỗi đọc cache:", e);
      return { students: null, teacherSchedules: null, lastSync: null };
    }
  },

  // Lưu dữ liệu vào bộ nhớ đệm cục bộ
  setCachedData(students?: any[], teacherSchedules?: any[]) {
    try {
      if (students) {
        localStorage.setItem(CACHE_KEY_STUDENTS, JSON.stringify(students));
      }
      if (teacherSchedules) {
        localStorage.setItem(CACHE_KEY_TEACHER, JSON.stringify(teacherSchedules));
      }
      const now = new Date();
      const syncTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')} ngày ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      localStorage.setItem(CACHE_KEY_TIMESTAMP, syncTime);
      return syncTime;
    } catch (e) {
      console.warn("Lỗi ghi cache:", e);
      return null;
    }
  },

  // Tải trước ngầm (Pre-fetch) ngay khi người dùng vừa mở trang hoặc đang ở màn hình đăng nhập
  preloadData(): Promise<{ students: any[]; teacherSchedules: any[]; syncTime: string }> {
    if (inFlightPreload) {
      return inFlightPreload;
    }

    inFlightPreload = (async () => {
      try {
        const [studentData, teacherData] = await Promise.all([
          this.getStudents(),
          this.getTeacherSchedules()
        ]);
        const cleanStudents = (Array.isArray(studentData) ? studentData : []).filter(
          (s: any) => s && String(s['HỌ TÊN HS'] || '').trim() !== ''
        );
        const cleanTeachers = Array.isArray(teacherData) ? teacherData : [];
        const syncTime = this.setCachedData(cleanStudents, cleanTeachers) || '';
        return { students: cleanStudents, teacherSchedules: cleanTeachers, syncTime };
      } catch (err) {
        inFlightPreload = null; // Reset để thử lại nếu lỗi mạng
        throw err;
      }
    })();

    return inFlightPreload;
  },

  // Tải mới dữ liệu (ép buộc làm mới hoặc dùng lại request đang chạy)
  async fetchAllData(force = false): Promise<{ students: any[]; teacherSchedules: any[]; syncTime: string }> {
    if (force) {
      inFlightPreload = null;
    }
    return this.preloadData();
  },

  async request(url: string, action: string, data: any = {}, rowIndex?: number, retryCount = 1): Promise<any> {
    return sendGasRequest(url, action, data, rowIndex, retryCount);
  },

  // Học sinh (Datasheet 1)
  async getStudents() {
    const result = await sendGasRequest(GAS_URL_STUDENTS, 'getData');
    return result.data;
  },
  
  async saveStudent(action: 'addData' | 'updateData', data: any, rowIndex?: number) {
    inFlightPreload = null; // Xóa cache request khi có ghi mới
    
    // Chuẩn hóa và làm sạch dữ liệu chuẩn tiếng Việt UTF-8
    const cleanData: Record<string, string> = {};
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(key => {
        if (key !== 'rowIndex' && data[key] !== undefined && data[key] !== null) {
          cleanData[key] = String(data[key]);
        }
      });
    }

    // Đảm bảo cả KHỐI và TÊN NHÓM đều có giá trị tương ứng để không bị trống ở bất kỳ cột nào
    if (cleanData['KHỐI'] && !cleanData['TÊN NHÓM']) {
      cleanData['TÊN NHÓM'] = cleanData['KHỐI'];
    }
    if (cleanData['TÊN NHÓM'] && !cleanData['KHỐI']) {
      cleanData['KHỐI'] = cleanData['TÊN NHÓM'];
    }

    return sendGasRequest(GAS_URL_STUDENTS, action, cleanData, rowIndex);
  },

  // Xóa toàn bộ thông tin (ký tự) của học sinh tại các ô trên Datasheet và để trống dòng đó
  async clearStudent(rowIndex: number, studentData?: any) {
    inFlightPreload = null;
    const emptyData: Record<string, string> = {
      'STT': '',
      'HỌ TÊN HS': '',
      'KHỐI': '',
      'TÊN LỚP': '',
      'SỐ ĐIỆN THOẠI 1': '',
      'SỐ ĐIỆN THOẠI 2': '',
      'NGÀY BẮT ĐẦU': '',
      'LỊCH HỌC': '',
      'ĐIỂM DANH HS': '',
      'ĐÓNG HỌC PHÍ': '',
      'TÊN NHÓM': '',
      'GHI CHÚ': ''
    };
    if (studentData && typeof studentData === 'object') {
      Object.keys(studentData).forEach(key => {
        if (key !== 'rowIndex') {
          emptyData[key] = '';
        }
      });
    }
    return this.saveStudent('updateData', emptyData, rowIndex);
  },

  // Giáo viên (Datasheet 2)
  async getTeacherSchedules() {
    const result = await sendGasRequest(GAS_URL_TEACHER, 'getData');
    return result.data;
  },

  async saveTeacherSchedule(data: any, rowIndex?: number) {
    inFlightPreload = null;
    const action = rowIndex ? 'updateData' : 'addData';
    
    const cleanData: Record<string, string> = {};
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(key => {
        if (key !== 'rowIndex' && data[key] !== undefined && data[key] !== null) {
          cleanData[key] = String(data[key]);
        }
      });
    }

    if (cleanData['TÊN NHÓM'] && !cleanData['KHỐI']) {
      cleanData['KHỐI'] = cleanData['TÊN NHÓM'];
    }
    if (cleanData['KHỐI'] && !cleanData['TÊN NHÓM']) {
      cleanData['TÊN NHÓM'] = cleanData['KHỐI'];
    }

    return sendGasRequest(GAS_URL_TEACHER, action, cleanData, rowIndex);
  }
};

