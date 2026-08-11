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

/** Đang gõ vào ô nhập liệu thì bàn phím thuộc về ô đó, không phải nhân vật. */
function typing(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

window.addEventListener('keydown', (e) => {
  // W/A/S/D và K/C là phím điều khiển, nhưng cũng là chữ cái bình thường —
  // không loại trừ ô nhập liệu thì không ai gõ được tên đăng nhập có chữ 'a'
  if (typing(e)) return;

  // Đang trong trận thì bàn phím thuộc về màn chiến đấu
  if (Battle.isOpen()) return;

  if (e.code === 'Escape') {
    if (Tree.isOpen()) { Tree.close(); return; }
    if (Panel.isOpen()) { Panel.close(); return; }
  }
  if (e.code === 'KeyK' && state.me) {
    e.preventDefault();
    Tree.toggle();
    for (const key of Object.keys(keys)) keys[key] = false;
    sendInputIfChanged();
    return;
  }
  if (e.code === 'KeyC' && state.me) {
    e.preventDefault();
    Panel.toggle();
    // Nhả hết phím, nếu không nhân vật chạy tiếp trong lúc bảng đang mở
    for (const key of Object.keys(keys)) keys[key] = false;
    sendInputIfChanged();
    return;
  }
  if (Panel.isOpen() || Tree.isOpen()) return; // đang mở bảng thì không điều khiển nhân vật

  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  keys[k] = true;
  sendInputIfChanged();
});

window.addEventListener('keyup', (e) => {
  if (typing(e)) return;
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

function connect({ token, characterId, zone }) {
  const socket = io({ transports: ['websocket', 'polling'] });
  state.socket = socket;

  // Nạp sprite icon song song với lúc bắt tay mạng — xong trước khi có gì để vẽ
  Icons.load();

  socket.on('connect', () => {
    socket.emit('join', { token, characterId, zone, type: 'pve' }, async (res) => {
      if (!res?.ok) {
        Account.showCharacters();
        alert(res?.error || 'Không vào được phòng');
        socket.disconnect();
        return;
      }
      state.me = res.you;
      state.map = res.map;
      state.zone = res.zone || null;
      state.character = res.character || null;
      // Đợi sprite trước khi vẽ bất cứ thứ gì — vẽ trước thì `<use>` trỏ vào
      // symbol chưa tồn tại, ra ô trống, và không phải trình duyệt nào cũng vẽ
      // lại khi symbol xuất hiện muộn
      await Icons.load();
      Icons.paint();

      enterGame();

      /**
       * Chỉ dựng các module ĐÚNG MỘT LẦN cho mỗi socket.
       *
       * `connect` bắn lại sau mỗi lần nối lại mạng, và mỗi `init` lại gọi
       * `socket.on(...)` thêm một lần nữa — chập mạng ba lần là mọi sự kiện
       * chạy ba lượt, mỗi đòn đánh hiện ba dòng nhật ký.
       */
      if (!socket.__inited) {
        socket.__inited = true;
        UI.init();
        Hud.init(socket);
        Battle.init(socket, res.you);
        Panel.init(socket);
        Tree.init(socket);
      }
      Battle.setMyId(res.you);
      if (res.characterState) { Panel.update(res.characterState); Tree.update(res.characterState); }
      // Vào phòng đúng lúc cả nhóm đang đánh nhau thì hiện luôn màn chiến đấu
      if (res.battle) Battle.onState(res.battle);
    });
  });

  socket.on('state', (snap) => {
    state.prev = state.curr;
    state.curr = { ...snap, recvAt: performance.now() };
    renderBossBar(snap.boss);
  });

  // Thủ Lĩnh là sự kiện của cả phòng — ai đang ở trong vùng cũng phải biết
  socket.on('boss:spawn', (b) => Panel.toast?.(
    'levelup', `◆ ${b.name} đã xuất hiện`, `Cấp ${b.level} · chạm vào để đánh, không cần lập nhóm`));
  socket.on('boss:down', (b) => Panel.toast?.('item', `${b.name} đã bị hạ`, 'Thủ Lĩnh mới sau 5 phút'));
  socket.on('boss:gone', (b) => Panel.toast?.('warn', `${b.name} đã bỏ đi`, 'Không ai hạ được nó kịp'));
  socket.on('battle:joined', (p) => Panel.toast?.('item', `${p.name} nhảy vào trận`, 'Đánh Thủ Lĩnh không cần cùng nhóm'));

  socket.on('connect_error', (err) => {
    console.error('[net]', err.message);
    Account.showCharacters();
  });
  socket.on('disconnect', (reason) => {
    leaveGame();
    // Tự ngắt (bấm Thoát) thì màn chọn nhân vật đã hiện rồi, không hiện đè
    if (reason !== 'io client disconnect') {
      Account.showCharacters();
      Panel.toast?.('warn', 'Mất kết nối', 'Tiến trình đã được lưu tới lần cuối');
    }
  });

  // Đo ping thật bằng round-trip, không dựa vào con số nội bộ của socket.io
  setInterval(() => {
    const t0 = performance.now();
    socket.emit('ping:probe', t0, () => {
      state.ping = Math.round(performance.now() - t0);
      $('ping').textContent = state.ping;
      // Đổi màu chấm theo độ trễ để nhìn phát biết ngay, không phải đọc số
      const dot = $('pingDot');
      dot.classList.toggle('warn', state.ping >= 80 && state.ping < 200);
      dot.classList.toggle('bad', state.ping >= 200);
    });
  }, 2000);
}

/* ---------------- Chuyển màn ---------------- */

function enterGame() {
  $('menu').classList.add('hidden');
  $('navbar').classList.remove('hidden');
  $('zoneBadge').textContent = state.zone
    ? `${state.zone.name} · ${state.zone.levelMin}–${state.zone.levelMax}`
    : '—';
  $('hint').classList.remove('hidden');
  setTimeout(() => $('hint').classList.add('hidden'), 6000);
}

/** Đồng hồ đếm ngược tới lượt Thủ Lĩnh kế tiếp, hoặc báo nó đang ở ngoài kia. */
function renderBossBar(boss) {
  const bar = $('bossBar');
  if (!boss) { bar.classList.add('hidden'); return; }

  bar.classList.remove('hidden');
  bar.classList.toggle('up', !!boss.up);

  if (boss.up) {
    $('bossText').textContent = `${boss.name} · Cấp ${boss.lv}`;
    return;
  }
  const s = Math.max(0, boss.in || 0);
  $('bossText').textContent = `Thủ Lĩnh sau ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function leaveGame() {
  Panel.close();
  Tree.close();
  UI.closeMenu();
  UI.closeModal();
  Hud.hide();
  $('statusBar').classList.add('hidden');
  $('navbar').classList.add('hidden');
  $('bossBar').classList.add('hidden');
  $('hint').classList.add('hidden');
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

/** Mỗi vùng một bảng màu — nhìn phát biết mình đang ở bản đồ nào. */
const DEFAULT_THEME = { floorA: '#141a27', floorB: '#161c2a', wall: '#28324a', wallTop: '#35415e' };

function drawMap(cam) {
  const { w, h, tile, data } = state.map;
  const th = state.zone?.theme || DEFAULT_THEME;
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

      ctx.fillStyle = wall ? th.wall : ((tx + ty) % 2 ? th.floorB : th.floorA);
      ctx.fillRect(sx, sy, tile, tile);

      if (wall) {
        ctx.fillStyle = th.wallTop;
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
  const r = m.bs ? 17 : 11;

  /* Quái vừa hiện ra chưa chạm vào ai được — vẽ mờ đi để người chơi hiểu vì
     sao đi xuyên qua nó mà không vào trận, thay vì tưởng game lỗi. */
  ctx.save();
  if (m.im) ctx.globalAlpha = 0.4;

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + r - 1, r - 1, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = m.c || '#c05a5a';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Viền đỏ rực khi đang đuổi theo — người chơi cần biết mình bị bám để còn chạy
  ctx.strokeStyle = m.bs ? '#ffd166' : (m.a ? '#ff4d4d' : 'rgba(255,255,255,.22)');
  ctx.lineWidth = m.bs ? 3 : (m.a ? 2.5 : 2);
  ctx.stroke();

  // Vòng hào quang cho Thủ Lĩnh — thấy từ xa là biết nên tránh hay nên rủ người
  if (m.bs) {
    ctx.strokeStyle = 'rgba(255,209,102,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 6 + Math.sin(Date.now() / 300) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[m.d] || [0, 1];
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.beginPath();
  ctx.arc(x + d[0] * (r * 0.45), y + d[1] * (r * 0.45), r * 0.23, 0, Math.PI * 2);
  ctx.fill();

  if (m.a) {
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d4d';
    ctx.fillText('!', x, y - r - 7);
  }

  const label = m.bs ? `◆ ${m.n} · ${m.lv}` : `${m.n} · ${m.lv}`;
  ctx.font = m.bs ? '700 11px system-ui, sans-serif' : '500 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(label, x, y + r + 13);
  ctx.fillStyle = m.bs ? '#ffd166' : '#e8b3ab';
  ctx.fillText(label, x, y + r + 13);

  // Đã có người đánh — nhảy vào là được, không cần lập nhóm
  if (m.f) {
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.strokeText('đang giao chiến — vào phụ', x, y + r + 25);
    ctx.fillStyle = '#7ee89a';
    ctx.fillText('đang giao chiến — vào phụ', x, y + r + 25);
  }

  ctx.restore();
}

function render() {
  requestAnimationFrame(render);

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

/* ---------------- Khởi động ---------------- */

/**
 * Không vào thẳng game nữa: phải qua đăng nhập và chọn nhân vật trước.
 * Account lo ba màn đó rồi gọi lại đây kèm token và id nhân vật.
 */
Account.start(({ token, characterId, zone }) => {
  connect({ token, characterId, zone });
});

/* ---------------- Đo chiều cao các thanh cố định ---------------- */

/**
 * Thanh kinh nghiệm ở đáy và navbar ở góc phải đều co giãn theo bề rộng màn
 * hình — màn hẹp thì thanh đáy xuống dòng và cao gấp đôi. Đo thật rồi ghi vào
 * biến CSS để thông báo và nhật ký trận biết chừa đúng chỗ.
 *
 * Đoán một con số cứng là cách cũ, và nó đã sai: thông báo phần thưởng chui
 * xuống dưới hai nút Balo / Kỹ năng, đọc không ra chữ nào.
 */
function trackBars() {
  const root = document.documentElement;
  const sb = $('statusBar');
  const nav = $('navbar');

  const apply = () => {
    const h = sb.classList.contains('hidden') ? 0 : sb.getBoundingClientRect().height;
    const n = nav.classList.contains('hidden') ? 0 : nav.getBoundingClientRect().height;
    root.style.setProperty('--sb-h', `${Math.round(h)}px`);
    root.style.setProperty('--nav-h', `${Math.round(n)}px`);
  };

  const ro = new ResizeObserver(apply);
  ro.observe(sb);
  ro.observe(nav);
  window.addEventListener('resize', apply);
  apply();
}
trackBars();

$('quit').addEventListener('click', () => {
  state.socket?.disconnect();
  leaveGame();
  Account.showCharacters();
});
