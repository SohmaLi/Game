'use strict';

const mysql = require('mysql2/promise');

/**
 * Kết nối MySQL dùng chung.
 *
 * Biến môi trường do cPanel nạp vào tiến trình (Setup Node.js App → Environment
 * variables). Ở local thì đọc từ .env nếu có — file đó không bao giờ được commit.
 */

if (!process.env.DB_NAME) loadEnvFromFile();
if (!process.env.DB_NAME) loadEnvFromCpanel();

/** Local: đọc .env nếu có. File này không bao giờ được commit. */
function loadEnvFromFile() {
  try {
    require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8')
      .split('\n')
      .forEach((line) => {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      });
  } catch { /* không có .env là chuyện bình thường trên production */ }
}

/**
 * Trên hosting, cPanel chỉ nạp biến môi trường vào tiến trình web — script chạy
 * qua SSH không thấy chúng. Đọc thẳng từ file cấu hình của CloudLinux để các
 * công cụ dòng lệnh (tạo user, migrate) dùng được mà không phải chép mật khẩu ra đâu cả.
 */
function loadEnvFromCpanel() {
  try {
    const cfg = JSON.parse(require('fs').readFileSync(
      `${process.env.HOME}/.cl.selector/node-selector.json`, 'utf8'));

    const found = (function dig(node) {
      if (node && typeof node === 'object') {
        if ('DB_NAME' in node && 'DB_PASS' in node) return node;
        for (const v of Object.values(node)) {
          const r = dig(v);
          if (r) return r;
        }
      }
      return null;
    })(cfg);
    if (!found) return;

    for (const [k, v] of Object.entries(found)) {
      const value = v && typeof v === 'object' ? v.value : v;
      if (value != null && !process.env[k]) process.env[k] = String(value);
    }
  } catch { /* không chạy trên cPanel */ }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  // Shared hosting giới hạn số kết nối MySQL đồng thời. 10 là đủ rộng cho
  // hàng trăm người chơi vì truy vấn DB rất thưa — chỉ khi đăng nhập và lưu tiến trình.
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/** Kiểm tra kết nối lúc khởi động — hỏng thì biết ngay chứ không đợi người chơi đầu tiên. */
async function check() {
  const row = await one('SELECT VERSION() AS v');
  return row?.v || null;
}

module.exports = { pool, query, one, check };
