
/**
 * GOOGLE APPS SCRIPT - QUẢN LÝ LỊCH DẠY GIÁO VIÊN (DATASHEET 2)
 * ID Spreadsheet: 1X_Dfvol3HQb7IZX_Z9ktuIe7kvxX7A7Js1rivsuFy8U
 */

const SPREADSHEET_ID = '1X_Dfvol3HQb7IZX_Z9ktuIe7kvxX7A7Js1rivsuFy8U';
const SHEET_NAME = 'Sheet1'; 

function doGet(e) {
  const status = "Hệ thống Lịch dạy Giáo viên - Hoà Hiệp AI (Datasheet 2) đang hoạt động ✅";
  return HtmlService.createHtmlOutput("<div style='font-family:sans-serif; text-align:center; padding-top:50px;'><h2>" + status + "</h2><p>ID: " + SPREADSHEET_ID + "</p></div>")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    if (!e || !e.postData || !e.postData.contents) {
      return createResponse({ success: false, message: 'Yêu cầu không có dữ liệu (No postData).' });
    }

    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    const tz = ss.getSpreadsheetTimeZone();
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['STT', 'KHỐI', 'NGÀY DẠY TRONG THÁNG']);
    }

    if (action === 'getData') {
      const range = sheet.getDataRange();
      const values = range.getValues();
      const headers = values[0].map(h => h.toString().trim());
      
      const rows = values.slice(1).map((row, index) => {
        let obj = { rowIndex: index + 2 }; 
        headers.forEach((header, i) => {
          let val = row[i];
          // KIỂM TRA VÀ CHUẨN HOÁ NGÀY THÁNG ĐỂ TRÁNH NHẢY MÚI GIỜ
          if (val instanceof Date) {
            val = Utilities.formatDate(val, tz, "yyyy-MM-dd");
          }
          obj[header] = val;
        });
        return obj;
      });
      return createResponse({ success: true, data: rows });
    }
    
    if (action === 'addData') {
      const item = params.data;
      const lastRow = sheet.getLastRow();
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
      
      const newRow = headers.map(h => {
        if (h === 'STT') return lastRow;
        return item[h] || '';
      });
      
      sheet.appendRow(newRow);
      return createResponse({ success: true, message: 'Đã thêm thành công.' });
    }
    
    if (action === 'updateData') {
      const item = params.data;
      const rowIndex = parseInt(params.rowIndex);
      
      if (!rowIndex || isNaN(rowIndex)) {
        return createResponse({ success: false, message: 'Vị trí dòng không hợp lệ.' });
      }
      
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
      const rowValues = headers.map(header => {
        let val = item[header];
        return (val !== undefined) ? val : '';
      });
      
      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      return createResponse({ success: true, message: 'Cập nhật thành công.' });
    }

    return createResponse({ success: false, message: 'Hành động không xác định.' });
    
  } catch (error) {
    return createResponse({ success: false, message: 'Lỗi: ' + error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
