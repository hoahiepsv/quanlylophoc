
export interface Student {
  rowIndex?: number;
  'STT': number | string;
  'HỌ TÊN HS': string;
  'KHỐI': string;
  'TÊN LỚP': string;
  'SỐ ĐIỆN THOẠI 1': string;
  'SỐ ĐIỆN THOẠI 2': string;
  'NGÀY BẮT ĐẦU': string;
  'LỊCH HỌC': string;
  'ĐIỂM DANH HS': string;
  'ĐÓNG HỌC PHÍ': string;
}

export interface TeacherSchedule {
  rowIndex?: number;
  'STT': number | string;
  'KHỐI': string;
  'NGÀY DẠY TRONG THÁNG': string;
}

export enum ModelMode {
  FLASH = 'gemini-3-flash-preview',
  PRO = 'gemini-3-pro-preview'
}

export type TabType = 'list' | 'add' | 'update' | 'stats' | 'teacherSchedule' | 'attendance';
