// Cấu hình tập trung: ngưỡng sĩ số theo đề bài + tham số vận hành.
const path = require('path');

if (process.env.NODE_ENV === 'production' && !process.env.TOKEN_SECRET) {
  console.warn('CẢNH BÁO: chưa đặt biến môi trường TOKEN_SECRET – đang dùng khoá mặc định chỉ dành cho phát triển.');
}

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite'),
  TOKEN_SECRET: process.env.TOKEN_SECRET || 'project2-de-tai-1a-dev-secret',
  TOKEN_TTL_HOURS: 12,

  // Quy tắc sĩ số (BR-02, BR-03)
  CAPACITY: {
    ONLINE: { min: 10, max: Number(process.env.ONLINE_MAX) || 40 }, // max online: tham số nền tảng (đề bài không quy định)
    OFFLINE: { min: 20, max: 30 },                                  // > 30 cần Lãnh đạo phê duyệt (BR-04)
  },

  // Bài kiểm tra đầu vào (BR-01)
  PLACEMENT: { QUESTIONS: 20, MINUTES: 20 },

  LEVELS: ['A1', 'A2', 'B1', 'B2', 'C1'],
  FORMS: ['ONLINE', 'OFFLINE'],
  SHIFTS: {
    MORNING: { label: 'Sáng', time: '08:00 – 10:00' },
    AFTERNOON: { label: 'Chiều', time: '14:00 – 16:00' },
    EVENING: { label: 'Tối', time: '18:30 – 20:30' },
  },
  WEEKDAYS: { 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7', 8: 'Chủ nhật' },
  PAYMENT_METHODS: { VNPAY: 'VNPay', MOMO: 'Ví MoMo', BANK: 'Chuyển khoản', CASH: 'Tiền mặt tại quầy' },
};
