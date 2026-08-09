'use strict';

/**
 * Điểm khởi động. Tên file phải là app.js — cPanel/Passenger được cấu hình gọi đúng file này.
 *
 * Lưu ý về listen(): dưới Passenger (LiteSpeed trên host), lệnh listen() bị Passenger
 * ghi đè và tự gắn vào socket của web server, tham số port bị bỏ qua. Ở local thì
 * nó dùng đúng PORT. Nhờ vậy một file chạy được cả hai nơi, không cần phân nhánh.
 */

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const net = require('./server/net');
const api = require('./server/api');
const db = require('./server/db');
const auth = require('./server/auth');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  // websocket trước, polling để dự phòng nếu LiteSpeed chặn upgrade
  transports: ['websocket', 'polling'],
  pingInterval: 20_000,
  pingTimeout: 25_000,
  maxHttpBufferSize: 1e5, // 100KB — không có lý do gì client gửi gói to hơn
});

app.disable('x-powered-by');

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // 'no-cache' KHÔNG có nghĩa là không lưu — trình duyệt vẫn giữ file nhưng
    // phải hỏi lại server mỗi lần, và nhận 304 (rỗng) nếu chưa đổi. Rẻ gần như
    // cache hoàn toàn, mà không bao giờ để người chơi dính code cũ sau deploy.
    //
    // Dùng maxAge ở đây là sai: trình duyệt sẽ không thèm hỏi lại trong suốt
    // thời gian đó, và người chơi chạy lẫn lộn file mới với file cũ.
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // ảnh, âm thanh
    }
  },
}));

app.set('trust proxy', 1); // đứng sau LiteSpeed — cần để req.ip ra IP thật của người chơi
app.use('/api', api.build());

const manager = net.attach(io);

let dbStatus = 'chưa kiểm tra';

// Cron trong cPanel gọi endpoint này 5 phút/lần để Passenger không tắt app
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    node: process.versions.node,
    uptimeSec: Math.round(process.uptime()),
    rssMB: Math.round(mem.rss / 1048576),
    db: dbStatus,
    ...manager.stats(),
  });
});

// Kiểm tra DB ngay lúc khởi động — hỏng thì biết luôn chứ không đợi người chơi đầu tiên
db.check()
  .then((v) => { dbStatus = `ok (MariaDB ${v})`; console.log(`[game] DB ${dbStatus}`); })
  .catch((err) => { dbStatus = `LỖI: ${err.code || err.message}`; console.error('[game] DB lỗi:', err.message); });

// Dọn phiên hết hạn mỗi 6 tiếng để bảng sessions không phình vô hạn
setInterval(() => {
  auth.purgeExpiredSessions()
    .then((n) => n && console.log(`[game] đã xóa ${n} phiên hết hạn`))
    .catch((err) => console.error('[game] dọn phiên lỗi:', err.message));
}, 6 * 3600_000).unref?.();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[game] listening on ${PORT} (node ${process.versions.node})`);
});

// Trên shared hosting, một lỗi không bắt được sẽ giết cả server và mọi người chơi
// đang trong trận. Ghi log rồi chạy tiếp an toàn hơn là sập.
process.on('uncaughtException', (err) => console.error('[uncaught]', err));
process.on('unhandledRejection', (err) => console.error('[unhandled]', err));
