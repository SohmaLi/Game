'use strict';

/**
 * Tạo tài khoản và nhân vật đầu tiên, trực tiếp trên máy chủ.
 *
 * Dùng khi giao diện đăng ký chưa làm xong. Mật khẩu được nhập ẩn ngay tại
 * terminal — không truyền qua tham số dòng lệnh (sẽ lọt vào lịch sử shell và
 * danh sách tiến trình), không đi qua ai khác.
 *
 * Chạy:
 *   ssh -t frozento 'source /home/frozento/nodevenv/game/20/bin/activate && \
 *                    cd /home/frozento/game && node tools/create-user.js'
 */

const readline = require('readline');
const db = require('../server/db');
const auth = require('../server/auth');
const characters = require('../server/characters');
const nations = require('../server/data/nations');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

/** Nhập ẩn: tắt hiển thị ký tự trong lúc gõ mật khẩu. */
function askHidden(q) {
  return new Promise((resolve) => {
    const onData = (char) => {
      if (['\n', '\r', ''].includes(char.toString())) {
        process.stdin.removeListener('data', onData);
      } else {
        readline.moveCursor(process.stdout, -1000, 0);
        readline.clearLine(process.stdout, 1);
        process.stdout.write(q + '*'.repeat(rl.line.length));
      }
    };
    process.stdin.on('data', onData);
    rl.question(q, (value) => {
      process.stdout.write('\n');
      resolve(value);
    });
  });
}

(async () => {
  try {
    console.log('\n=== FROZEN — tạo tài khoản đầu tiên ===\n');

    const version = await db.check();
    console.log(`Đã kết nối MariaDB ${version}\n`);

    const username = (await ask('Tên đăng nhập (3–32 ký tự, chữ/số/gạch dưới): ')).trim();
    const password = await askHidden('Mật khẩu (tối thiểu 8 ký tự): ');
    const confirm = await askHidden('Nhập lại mật khẩu: ');

    if (password !== confirm) throw new Error('Hai lần nhập mật khẩu không khớp.');

    const account = await auth.register(username, password);
    console.log(`\n✓ Đã tạo tài khoản #${account.id} — ${account.username}\n`);

    console.log('Chọn quốc gia:');
    nations.all().forEach((n, i) => {
      console.log(`  ${i + 1}. ${n.name}`);
      console.log(`     ${n.trait}`);
      console.log(`     Đặc quyền — ${n.privilege.name}: ${n.privilege.desc}\n`);
    });

    const pick = parseInt(await ask('Số thứ tự (1–4): '), 10);
    const nation = nations.all()[pick - 1];
    if (!nation) throw new Error('Lựa chọn không hợp lệ.');

    const charName = (await ask('Tên nhân vật (3–16 ký tự): ')).trim();
    const character = await characters.create(account.id, charName, nation.id);

    console.log('\n=== ĐÃ TẠO NHÂN VẬT ===');
    console.log(`Tên       : ${character.name}`);
    console.log(`Quốc gia  : ${character.nation.name}`);
    console.log(`Đặc quyền : ${character.nation.privilege.name} — ${character.nation.privilege.desc}`);
    console.log(`\nĐẶC ÂN bốc được:`);
    console.log(`  [${character.boon.star}] ${character.boon.name}`);
    console.log(`  ${character.boon.desc}`);
    console.log(`\nCòn ${character.boonRerollsLeft} lượt rút lại (rút trong game).`);
    console.log('\nXong. Đăng nhập tại https://game.frozen-top.io.vn\n');
  } catch (err) {
    console.error(`\n✗ Lỗi: ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    await db.pool.end().catch(() => {});
  }
})();
