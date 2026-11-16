// Khởi tạo Express app + Socket.IO (tách khỏi index.js để kiểm thử).
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { AppError } = require('./services/errors');
const { initChat } = require('./sockets/chat');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  // Header bảo mật cơ bản
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
    next();
  });

  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub));
  // Chart.js phục vụ cục bộ (không phụ thuộc CDN); package "exports" không mở subpath nên dùng đường dẫn thư mục gói
  const chartJs = path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.min.js');
  app.get('/vendor/chart.umd.js', (req, res) => res.sendFile(chartJs));

  app.use('/api', require('./routes/public'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'API không tồn tại.' }));

  app.get('/admin', (req, res) => res.sendFile(path.join(pub, 'admin.html')));

  // Xử lý lỗi tập trung: lỗi nghiệp vụ -> mã HTTP tương ứng; lỗi khác -> 500.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_JSON', message: 'Dữ liệu gửi lên không đúng JSON.' });
    if (String(err.code || '').startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'CONSTRAINT', message: 'Dữ liệu vi phạm ràng buộc toàn vẹn.' });
    }
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Lỗi máy chủ.' });
  });

  const server = http.createServer(app);
  const io = new Server(server);
  initChat(io);
  return { app, server, io };
}

module.exports = { createApp };
