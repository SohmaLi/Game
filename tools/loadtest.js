'use strict';

/**
 * Đo xem hosting chịu được bao nhiêu kết nối WebSocket đồng thời.
 *
 * Câu hỏi cần trả lời: trên LiteSpeed + CloudLinux, mỗi kết nối WebSocket có
 * chiếm một Entry Process (giới hạn 40) hay không? Nếu có, trần người chơi là
 * ~38. Nếu không, trần thật là ulimit -n = 1024.
 *
 * Cách dùng:
 *   node tools/loadtest.js https://game.frozen-top.io.vn 40
 *   node tools/loadtest.js http://localhost:3000 100
 *
 * Trong lúc script chạy, mở cPanel → Metrics → Resource Usage → Current usage
 * và theo dõi ô "Entry Processes".
 */

const { io } = require('socket.io-client');

const URL = process.argv[2] || 'http://localhost:3000';
const TARGET = parseInt(process.argv[3], 10) || 40;
const RAMP_MS = 150; // giãn cách giữa các kết nối, tránh bị chặn vì đột biến

const sockets = [];
const stats = { connected: 0, joined: 0, failed: 0, snapshots: 0, latency: [] };

function spawn(i) {
  const socket = io(URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 20000,
  });
  sockets.push(socket);

  socket.on('connect', () => {
    stats.connected++;
    socket.emit('join', { name: `bot${i}`, type: 'pvp' }, (res) => {
      if (res?.ok) stats.joined++;
      else stats.failed++;
    });

    // Bot đi lại ngẫu nhiên để server thật sự phải chạy game loop
    setInterval(() => {
      socket.emit('input', {
        up: Math.random() < 0.3,
        down: Math.random() < 0.3,
        left: Math.random() < 0.3,
        right: Math.random() < 0.3,
      });
    }, 700);

    setInterval(() => {
      const t0 = Date.now();
      socket.emit('ping:probe', t0, () => {
        stats.latency.push(Date.now() - t0);
        if (stats.latency.length > 500) stats.latency.shift();
      });
    }, 3000);
  });

  socket.on('state', () => stats.snapshots++);

  socket.on('connect_error', (err) => {
    stats.failed++;
    if (stats.failed <= 3) console.error(`  bot${i} lỗi: ${err.message}`);
  });
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

console.log(`Mục tiêu: ${TARGET} kết nối tới ${URL}`);
console.log(`Tăng dần ${RAMP_MS}ms/kết nối — theo dõi Entry Processes trong cPanel\n`);

let spawned = 0;
const ramp = setInterval(() => {
  spawn(spawned++);
  if (spawned >= TARGET) {
    clearInterval(ramp);
    console.log(`\nĐã mở xong ${TARGET} kết nối. Giữ nguyên 60 giây để quan sát...\n`);
    setTimeout(shutdown, 60000);
  }
}, RAMP_MS);

const report = setInterval(() => {
  const l = stats.latency;
  console.log(
    `mở=${spawned}  nối=${stats.connected}  vào_phòng=${stats.joined}  ` +
    `lỗi=${stats.failed}  gói_nhận=${stats.snapshots}  ` +
    `ping p50=${percentile(l, 0.5)}ms p95=${percentile(l, 0.95)}ms`
  );
}, 3000);

function shutdown() {
  clearInterval(report);
  const l = stats.latency;
  console.log('\n================ KẾT QUẢ ================');
  console.log(`Kết nối thành công : ${stats.connected}/${TARGET}`);
  console.log(`Vào phòng được     : ${stats.joined}`);
  console.log(`Thất bại           : ${stats.failed}`);
  console.log(`Ping p50 / p95     : ${percentile(l, 0.5)}ms / ${percentile(l, 0.95)}ms`);
  console.log('=========================================');
  for (const s of sockets) s.disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
