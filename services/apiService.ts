
/**
 * API SERVICE - KẾT NỐI GOOGLE APPS SCRIPT
 */
const GAS_URL_STUDENTS = 'https://script.google.com/macros/s/AKfycbzh_PI-oGThMjSN4Sc3_ttaSzUExOAfguXCOwQ8esP3jSZOFlpyd7E4ZELC6fsXfFJ7/exec';
const GAS_URL_TEACHER = 'https://script.google.com/macros/s/AKfycbz5GilAmCy4JHWDih7cgQAylFsJuWxTeFQORPuGtUr72-M0-VkQaSQJp1I_yfMTRiXHWg/exec';

export const apiService = {
  async request(url: string, action: string, data: any = {}, rowIndex?: number) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ action, data, rowIndex }),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Lỗi kết nối Server: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result || result.success === false) {
        throw new Error(result?.message || 'Yêu cầu thất bại từ phía máy chủ.');
      }

      return result;
    } catch (error: any) {
      console.error("Lỗi API chi tiết:", error);
      throw new Error(error.message || 'Không thể kết nối với Datasheet. Vui lòng kiểm tra lại Deploy ID.');
    }
  },

  // Học sinh (Datasheet 1)
  async getStudents() {
    const result = await this.request(GAS_URL_STUDENTS, 'getData');
    return result.data;
  },
  
  async saveStudent(action: 'addData' | 'updateData', data: any, rowIndex?: number) {
    return this.request(GAS_URL_STUDENTS, action, data, rowIndex);
  },

  // Giáo viên (Datasheet 2)
  async getTeacherSchedules() {
    const result = await this.request(GAS_URL_TEACHER, 'getData');
    return result.data;
  },

  async saveTeacherSchedule(data: any, rowIndex?: number) {
    const action = rowIndex ? 'updateData' : 'addData';
    return this.request(GAS_URL_TEACHER, action, data, rowIndex);
  }
};
