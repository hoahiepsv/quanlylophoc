
import { GoogleGenAI } from "@google/genai";
import { ModelMode } from "../types";

/**
 * Helper to get the API Key from localStorage or environment
 */
const getApiKey = () => {
  return localStorage.getItem('gemini_api_key') || process.env.API_KEY || '';
};

export const geminiService = {
  /**
   * Analyzes student statistics using Gemini model.
   */
  async analyzeStats(data: any, mode: ModelMode) {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const prompt = `
      Hãy phân tích dữ liệu học sinh sau đây và đưa ra nhận xét chuyên sâu:
      ${JSON.stringify(data)}
      
      Yêu cầu:
      1. Tóm tắt tình hình đi học và chuẩn bị đóng học phí.
      2. Đưa ra lời khuyên cho giáo viên.
      3. Dự báo xu hướng dựa trên ngày bắt đầu.
      4. Trả về kết quả bằng tiếng Việt, định dạng Markdown.
    `;

    const response = await ai.models.generateContent({
      model: mode,
      contents: prompt,
      config: {
        thinkingConfig: mode === ModelMode.PRO ? { thinkingBudget: 4000 } : undefined
      }
    });

    return response.text;
  },

  /**
   * Generates a professional summary for PDF reports.
   */
  async generateReportContent(type: 'class' | 'student', data: any) {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    let prompt = "";

    if (type === 'class') {
      prompt = `Bạn là một trợ lý quản lý giáo dục cao cấp. Hãy viết một đoạn "Nhận xét từ Thầy / cô" ngắn gọn (khoảng 150 từ) cho báo cáo tổng quan tháng của lớp học.
      Dữ liệu: ${JSON.stringify(data)}
      Yêu cầu:
      - Đánh giá mức độ hoàn thành học phí của cả lớp (tỷ lệ đã đóng vs chuẩn bị đóng).
      - Nhận xét về sự ổn định của sĩ số.
      - Đưa ra 2 đề xuất cụ thể để giáo viên quản lý lớp tốt hơn.
      - Ngôn ngữ chuyên nghiệp, khích lệ. Không dùng Markdown.
      - Tuyệt đối không liệt kê danh sách nợ phí cá nhân cụ thể trong đoạn văn này.`;
    } else {
      prompt = `Bạn là giáo viên chủ nhiệm. Hãy viết một đoạn "Nhận xét và Lời nhắn" gửi tới phụ huynh học sinh ${data.name}.
      Dữ liệu học tập: ${JSON.stringify(data)}
      Yêu cầu QUAN TRỌNG:
      - Nhận xét về sự chuyên cần (số buổi tham gia: ${data.attended}, vắng: ${data.absences}).
      - Đưa ra lời khuyên học tập, động viên em cố gắng.
      - ĐẶC BIỆT: Khi nhắc đến giáo viên, hãy sử dụng danh xưng "Thầy / cô" thay vì chỉ dùng "Thầy" hay "Cô".
      - TUYỆT ĐỐI KHÔNG được nhắc nhở về việc đóng học phí hay thanh toán tiền nong trong đoạn văn này.
      - Độ dài khoảng 60-80 từ. Văn phong chân thành, giáo dục. Chỉ trả về văn bản thuần.`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text;
  }
};
