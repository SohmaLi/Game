const { io } = require('socket.io-client');
const URL = 'https://game.frozen-top.io.vn';

function test(name, opts) {
  return new Promise((resolve) => {
    const s = io(URL, { ...opts, reconnection: false, timeout: 25000 });
    const t0 = Date.now();
    const done = (r) => { s.disconnect(); resolve(`${name}: ${r} (${Date.now()-t0}ms)`); };
    s.on('connect', () => {
      s.emit('join', { name: 'probe', type: 'pve' }, (res) => {
        done(res?.ok ? `OK — transport=${s.io.engine.transport.name}` : `join lỗi: ${res?.error}`);
      });
    });
    s.on('connect_error', (e) => done(`THẤT BẠI — ${e.message}`));
    setTimeout(() => done('TIMEOUT 28s'), 28000);
  });
}

(async () => {
  console.log(await test('websocket-only', { transports: ['websocket'] }));
  console.log(await test('polling-only  ', { transports: ['polling'] }));
  console.log(await test('polling→upgrade', { transports: ['polling', 'websocket'] }));
  process.exit(0);
})();
