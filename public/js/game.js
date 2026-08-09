'use strict';

/**
 * Client. Nhiệm vụ duy nhất: gửi phím bấm lên server, và vẽ lại trạng thái
 * server trả về. Client KHÔNG tự quyết định vị trí của mình — nếu để nó tự quyết,
 * người chơi sửa vài dòng JS là dịch chuyển tức thời khắp bản đồ.
 */

const $ = (id) => document.getElementById(id);

const canvas = $('game');
const ctx = canvas.getContext('2d');

const state = {
  socket: null,
  me: null,
  map: null,
  roomType: 'pve',
  /** Đệm 2 snapshot gần nhất để nội suy chuyển động cho mượt */
  prev: null,
  curr: null,
  ping: 0,
  camera: { x: 0, y: 0 },
};

/* Vẽ chậm hơn thực tế đúng một snapshot. Nghe có vẻ ngược đời, nhưng nhờ luôn
   có sẵn 2 mốc dữ liệu để nội suy nên nhân vật đi mượt thay vì giật theo từng
   gói tin. Trễ đúng một snapshot (~66ms ở 15Hz) là mức nhỏ nhất mà vẫn đủ dữ
   liệu — trễ nhiều hơn thì cần đệm 3 snapshot trở lên. */

/* ---------------- Bàn phím ---------------- */

const keys = { up: false, down: false, left: false, right: false };
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

let lastSentInput = '';

function sendInputIfChanged() {
  const sig = `${keys.up}${keys.down}${keys.left}${keys.right}`;
  if (sig === lastSentInput) return; // chỉ gửi khi phím thay đổi, không spam mỗi frame
  lastSentInput = sig;
  state.socket?.emit('input', keys);
}

window.addEventListener('keydown', (e) => {
  // Đang trong trận thì bàn phím thuộc về màn chiến đấu
  if (Battle.isOpen()) return;

  if (e.code === 'Escape' && Panel.isOpen()) { Panel.close(); return; }
  if (e.code === 'KeyC' && state.me) {
    e.preventDefault();
    Panel.toggle();
    // Nhả hết phím, nếu không nhân vật chạy tiếp trong lúc bảng đang mở
    for (const key of Object.keys(keys)) keys[key] = false;
    sendInputIfChanged();
    return;
  }
  if (Panel.isOpen()) return; // bảng đang mở thì không điều khiển nhân vật

  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  keys[k] = true;
  sendInputIfChanged();
});

window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  keys[k] = false;
  sendInputIfChanged();
});

// Rời tab thì nhả hết phím, tránh nhân vật chạy mãi một hướng
window.addEventListener('blur', () => {
  for (const k of Object.keys(keys)) keys[k] = false;
  sendInputIfChanged();
});

/* ---------------- Kết nối ---------------- */

function connect(name, type) {
  const socket = io({ transports: ['websocket', 'polling'] });
  state.socket = socket;

  socket.on('connect', () => {
    socket.emit('join', { name, type }, (res) => {
      if (!res?.ok) {
        showError(res?.error || 'Không vào được phòng');
        socket.disconnect();
        return;
      }
      state.me = res.you;
      state.map = res.map;
      state.character = res.character || null;
      $('roomLabel').textContent = `${res.room.label} · ${res.room.id}`;
      enterGame();

      Battle.init(socket, res.you);
      Panel.init(socket);
      if (res.characterState) Panel.update(res.characterState);
      // Vào phòng đúng lúc cả nhóm đang đánh nhau thì hiện luôn màn chiến đấu
      if (res.battle) Battle.onState(res.battle);
    });
  });

  socket.on('state', (snap) => {
    state.prev = state.curr;
    state.curr = { ...snap, recvAt: performance.now() };
    $('count').textContent = snap.players.length;
  });

  socket.on('connect_error', (err) => showError(`Lỗi kết nối: ${err.message}`));
  socket.on('disconnect', (reason) => {
    if (reason !== 'io client disconnect') showError('Mất kết nối tới server');
    leaveGame();
  });

  // Đo ping thật bằng round-trip, không dựa vào con số nội bộ của socket.io
  setInterval(() => {
    const t0 = performance.now();
    socket.emit('ping:probe', t0, () => {
      state.ping = Math.round(performance.now() - t0);
      $('ping').textContent = state.ping;
    });
  }, 2000);
}

/* ---------------- Chuyển màn ---------------- */

function showError(msg) {
  $('error').textContent = msg;
  $('play').disabled = false;
}

function enterGame() {
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('hint').classList.remove('hidden');
  setTimeout(() => $('hint').classList.add('hidden'), 6000);
}

function leaveGame() {
  Panel.close();
  $('statusBar').classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('hint').classList.add('hidden');
  $('play').disabled = false;
  state.me = null;
  state.prev = state.curr = null;
}

/* ---------------- Nội suy ---------------- */

/**
 * Ghép 2 snapshot gần nhất thành vị trí tại thời điểm "hiện tại trừ INTERP_DELAY".
 * Người chơi mới xuất hiện hoặc vừa rời đi được xử lý bằng cách rơi về snapshot mới nhất.
 */
function interpolate() {
  if (!state.curr) return { players: [], monsters: [] };

  const curr = state.curr;
  const prev = state.prev;
  if (!prev) return { players: curr.players, monsters: curr.monsters || [] };

  const span = curr.t - prev.t;
  if (span <= 0) return { players: curr.players, monsters: curr.monsters || [] };

  // Tại lúc vừa nhận snapshot mới, ta vẽ ở vị trí của snapshot TRƯỚC (alpha=0),
  // rồi tiến dần tới snapshot mới trong khoảng thời gian đúng bằng span.
  const elapsed = performance.now() - curr.recvAt;
  const alpha = Math.max(0, Math.min(1, elapsed / span));

  const blend = (list, prevList) => {
    const byId = new Map((prevList || []).map((o) => [o.id, o]));
    return (list || []).map((o) => {
      const a = byId.get(o.id);
      if (!a) return o;
      return { ...o, x: a.x + (o.x - a.x) * alpha, y: a.y + (o.y - a.y) * alpha };
    });
  };

  return {
    players: blend(curr.players, prev.players),
    monsters: blend(curr.monsters, prev.monsters),
  };
}

/* ---------------- Vẽ ---------------- */

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

function drawMap(cam) {
  const { w, h, tile, data } = state.map;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Chỉ vẽ những ô nằm trong khung nhìn — bản đồ to cỡ nào cũng không tốn thêm
  const x0 = Math.max(0, Math.floor(cam.x / tile));
  const y0 = Math.max(0, Math.floor(cam.y / tile));
  const x1 = Math.min(w - 1, Math.ceil((cam.x + vw) / tile));
  const y1 = Math.min(h - 1, Math.ceil((cam.y + vh) / tile));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wall = data[ty * w + tx] === 1;
      const sx = tx * tile - cam.x;
      const sy = ty * tile - cam.y;

      ctx.fillStyle = wall ? '#28324a' : ((tx + ty) % 2 ? '#161c2a' : '#141a27');
      ctx.fillRect(sx, sy, tile, tile);

      if (wall) {
        ctx.fillStyle = '#35415e';
        ctx.fillRect(sx, sy, tile, 3); // viền trên cho tường có chiều sâu
      }
    }
  }
}

function drawPlayer(p, cam) {
  const x = p.x - cam.x;
  const y = p.y - cam.y;
  const isMe = p.id === state.me;

  // Bóng đổ
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 11, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Thân
  ctx.fillStyle = isMe ? '#4c7dff' : '#e0705a';
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isMe ? '#a9c6ff' : '#ffb3a3';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Hướng nhìn
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.d] || [0, 1];
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + d[0] * 6, y + d[1] * 6, 3, 0, Math.PI * 2);
  ctx.fill();

  // Tên
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(p.n, x, y - 20);
  ctx.fillStyle = isMe ? '#cfe0ff' : '#ffd9d1';
  ctx.fillText(p.n, x, y - 20);

  // Thanh máu
  const bw = 30;
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(x - bw / 2, y - 17, bw, 4);
  ctx.fillStyle = '#5ad17a';
  ctx.fillRect(x - bw / 2, y - 17, bw * (p.hp / 100), 4);
}

function drawMonster(m, cam) {
  const x = m.x - cam.x;
  const y = m.y - cam.y;

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 10, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = m.c || '#c05a5a';
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fill();

  // Viền đỏ rực khi đang đuổi theo — người chơi cần biết mình bị bám để còn chạy
  ctx.strokeStyle = m.a ? '#ff4d4d' : 'rgba(255,255,255,.22)';
  ctx.lineWidth = m.a ? 2.5 : 2;
  ctx.stroke();

  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[m.d] || [0, 1];
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.beginPath();
  ctx.arc(x + d[0] * 5, y + d[1] * 5, 2.5, 0, Math.PI * 2);
  ctx.fill();

  if (m.a) {
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d4d';
    ctx.fillText('!', x, y - 18);
  }

  ctx.font = '500 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(`${m.n} · ${m.lv}`, x, y + 24);
  ctx.fillStyle = '#e8b3ab';
  ctx.fillText(`${m.n} · ${m.lv}`, x, y + 24);
}

let frames = 0;
let fpsAt = performance.now();

function render() {
  requestAnimationFrame(render);

  frames++;
  const now = performance.now();
  if (now - fpsAt >= 1000) {
    $('fps').textContent = frames;
    frames = 0;
    fpsAt = now;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!state.map || !state.curr) return;

  const { players, monsters } = interpolate();
  const me = players.find((p) => p.id === state.me);

  // Camera bám nhân vật, kẹp trong biên bản đồ để không lộ vùng trống ngoài rìa
  if (me) {
    const worldW = state.map.w * state.map.tile;
    const worldH = state.map.h * state.map.tile;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    state.camera.x = worldW <= vw ? (worldW - vw) / 2 : clamp(me.x - vw / 2, 0, worldW - vw);
    state.camera.y = worldH <= vh ? (worldH - vh) / 2 : clamp(me.y - vh / 2, 0, worldH - vh);
  }

  drawMap(state.camera);

  // Trộn người chơi và quái rồi vẽ theo thứ tự y, để ai đứng dưới che ai đứng trên
  const entities = [
    ...players.map((p) => ({ ...p, kind: 'player' })),
    ...monsters.map((m) => ({ ...m, kind: 'monster' })),
  ].sort((a, b) => a.y - b.y);

  for (const e of entities) {
    if (e.kind === 'player') drawPlayer(e, state.camera);
    else drawMonster(e, state.camera);
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

render();

/* ---------------- Menu ---------------- */

document.querySelectorAll('.mode').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.roomType = btn.dataset.type;
  });
});

$('play').addEventListener('click', () => {
  $('play').disabled = true;
  $('error').textContent = '';
  connect($('name').value.trim(), state.roomType);
});

$('name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('play').click();
});

$('quit').addEventListener('click', () => {
  state.socket?.disconnect();
  leaveGame();
});
