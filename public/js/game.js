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
  /** Người bán hàng — nhận một lần lúc vào phòng, không bao giờ đổi */
  npcs: [],
  talkRadius: 56,
  /** NPC đang trong tầm nói chuyện, null khi đứng xa */
  nearNpc: null,
  /** Vị trí người chơi ĐÃ nội suy của khung hình vừa vẽ — chuột phải dò theo đây */
  drawnPlayers: [],
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
    if (Shop.isOpen()) { Shop.close(); return; }
    if (Tree.isOpen()) { Tree.close(); return; }
    if (Panel.isOpen()) { Panel.close(); return; }
  }
  // Nói chuyện với người bán hàng. Nhả hết phím trước khi mở, nếu không nhân
  // vật chạy tiếp dưới cửa sổ đang mở rồi lạc ra khỏi tầm nói chuyện
  if (e.code === 'KeyE' && state.me && state.nearNpc && !Shop.isOpen()) {
    e.preventDefault();
    for (const key of Object.keys(keys)) keys[key] = false;
    sendInputIfChanged();
    Shop.open(state.nearNpc);
    return;
  }
  if (Shop.isOpen()) return;
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

  // Nạp hình song song với lúc bắt tay mạng — xong trước khi có gì để vẽ
  Icons.load();
  Sprites.load();

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
      // Người bán hàng đứng yên vĩnh viễn nên chỉ về đúng một lần cùng bản đồ,
      // không nằm trong gói `state` bắn 15 lần mỗi giây
      state.npcs = res.npcs || [];
      state.talkRadius = res.talkRadius || 56;
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
        Shop.init(socket);
        Party.init(socket);
      }
      Battle.setMyId(res.you);
      Party.setMe(res.you, res.maxParty);
      if (res.characterState) {
        Panel.update(res.characterState);
        Tree.update(res.characterState);
        Party.update(res.characterState);
      }
      // Vào phòng đúng lúc cả nhóm đang đánh nhau thì hiện luôn màn chiến đấu
      if (res.battle) Battle.onState(res.battle);
    });
  });

  socket.on('state', (snap) => {
    state.prev = state.curr;
    state.curr = { ...snap, recvAt: performance.now() };
    renderBossBar(snap.boss);
    // Cờ "đang trong trận" chỉ có trong gói này, không có trong `character`
    Party.syncBusy(snap.players);
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
    ? (state.zone.safe ? `${state.zone.name} · an toàn` : `${state.zone.name} · ${state.zone.levelMin}–${state.zone.levelMax}`)
    : '—';

  // Lời nhắc phải nói đúng việc đang làm được: bảo người chơi "chạm vào quái"
  // ở một vùng không có con quái nào là cách nhanh nhất khiến họ đi tìm mỏi mắt
  $('hint').innerHTML = state.zone?.safe
    ? 'Vùng an toàn — không có quái. Đi tới chỗ <b>thương nhân</b> rồi bấm <b>E</b> để mua bán'
    : 'Dùng <b>WASD</b> hoặc <b>phím mũi tên</b> để di chuyển · chạm vào quái để vào trận';
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
  /**
   * Màn chiến đấu phải đóng ĐẦU TIÊN.
   *
   * Nó nằm ở z-index 30, cao hơn màn chọn nhân vật (20). Rớt mạng giữa trận mà
   * không đóng nó thì người chơi nhìn thấy một trận đấu đông cứng phủ lên trên
   * màn chọn nhân vật, bấm gì cũng không ăn.
   */
  Battle.close();
  Panel.close();
  Tree.close();
  Shop.close();
  Party.hide();
  UI.closeMenu();
  UI.closeModal();
  Hud.hide();
  $('statusBar').classList.add('hidden');
  $('navbar').classList.add('hidden');
  $('bossBar').classList.add('hidden');
  $('hint').classList.add('hidden');
  $('npcPrompt').classList.add('hidden');
  state.me = null;
  state.prev = state.curr = null;
  state.npcs = [];
  state.nearNpc = null;
  state.drawnPlayers = [];
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

  const zoneId = state.zone?.id;
  const tiled = Sprites.zone(zoneId);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wall = data[ty * w + tx] === 1;
      const sx = tx * tile - cam.x;
      const sy = ty * tile - cam.y;

      if (tiled) {
        /**
         * Nền rải biến thể theo toạ độ ô, KHÔNG theo ngẫu nhiên.
         *
         * Cùng một ô phải luôn ra cùng một hình: bốc ngẫu nhiên mỗi khung hình
         * thì cả bãi cỏ nhấp nháy. Băm toạ độ cho ra thảm cỏ lấm tấm hoa mà
         * không phải lưu thêm gì.
         */
        Sprites.drawGround(ctx, zoneId, tileNoise(tx, ty), sx, sy, tile);
        // Vật cản vẽ ĐÈ lên nền, nên gốc cây vẫn thấy đất bên dưới
        if (wall) Sprites.drawProp(ctx, zoneId, sx, sy, tile);
        continue;
      }

      // Chưa tải xong atlas thì vẫn là ô màu phẳng như trước
      ctx.fillStyle = wall ? th.wall : ((tx + ty) % 2 ? th.floorB : th.floorA);
      ctx.fillRect(sx, sy, tile, tile);
      if (wall) {
        ctx.fillStyle = th.wallTop;
        ctx.fillRect(sx, sy, tile, 3); // viền trên cho tường có chiều sâu
      }
    }
  }
}

/** Số giả ngẫu nhiên cố định theo ô — dùng chọn biến thể ô nền. */
function tileNoise(x, y) {
  let h = (x * 73_856_093) ^ (y * 19_349_663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % 997;
}

/** Băm chuỗi thành số — dùng lệch pha hoạt cảnh giữa các nhân vật. */
function hashCode(s) {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function drawPlayer(p, cam) {
  const x = p.x - cam.x;
  const y = p.y - cam.y;
  const isMe = p.id === state.me;
  // Đồng đội phải nhìn ra được từ xa: họ là những người sẽ bị kéo vào trận cùng
  // mình, và giữa một bản đồ đông người thì tên trắng nào cũng giống tên trắng nào
  const mate = !isMe && Party.has(p.id);

  // Bóng đổ — vẽ cả khi có sprite, nếu không nhân vật trông như dán lên nền
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 11, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  /**
   * Mỗi người một pha bước chân khác nhau: lấy id làm độ lệch thời gian.
   * Không có nó thì cả nhóm nhấc chân cùng một nhịp như đội duyệt binh.
   */
  const seed = hashCode(p.id) % 400;
  // Phóng ĐÚNG bội số nguyên (16→32). Tỉ lệ lẻ làm pixel chỗ to chỗ bé, thứ duy
  // nhất phá hỏng một bộ pixel art nhanh hơn cả chọn sai màu.
  const drawn = Sprites.drawUnit(
    ctx, Sprites.charBlock(p.cl, p.n), p.d, Sprites.walkFrame(p.m, seed), x, y, 32);

  if (!drawn) {
    // Chưa tải xong atlas thì vẽ hình tròn như trước — không được để trống chỗ
    ctx.fillStyle = isMe ? '#4c7dff' : '#e0705a';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isMe ? '#a9c6ff' : '#ffb3a3';
    ctx.lineWidth = 2;
    ctx.stroke();

    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.d] || [0, 1];
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + d[0] * 6, y + d[1] * 6, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (isMe || mate) {
    // Sprite ai cũng giống ai — cần một dấu chỉ rõ con nào là mình, và con nào
    // là người sẽ vào trận cùng mình
    ctx.strokeStyle = isMe ? 'rgba(124,160,255,.85)' : 'rgba(110,225,150,.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 11, 12, 5.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Tên và thanh máu nằm TRÊN đầu sprite. Sprite cao 32px tính từ y-20, nên mốc
  // cũ (y-20 / y-17) rơi thẳng vào mặt nhân vật.
  const top = drawn ? y - 22 : y - 17;

  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(p.n, x, top - 8);
  ctx.fillStyle = isMe ? '#cfe0ff' : (mate ? '#9ff0b5' : '#ffd9d1');
  ctx.fillText(p.n, x, top - 8);

  const bw = 30;
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(x - bw / 2, top - 5, bw, 4);
  ctx.fillStyle = '#5ad17a';
  ctx.fillRect(x - bw / 2, top - 5, bw * (p.hp / 100), 4);
}

/**
 * Người bán hàng. Vẽ giống nhân vật nhưng KHÔNG có thanh máu và không bao giờ
 * có dấu "!" — nó không đánh nhau, và mọi thứ trông giống quái đều khiến người
 * chơi vòng tránh thay vì lại gần.
 */
function drawNpc(n, cam) {
  const x = n.x - cam.x;
  const y = n.y - cam.y;
  const near = state.nearNpc?.id === n.id;

  /**
   * Vòng tầm nói chuyện dưới chân, đậm hơn khi đã bước vào trong — đó là toàn
   * bộ phản hồi cho biết đứng thế này đã bấm được hay chưa.
   *
   * Vẽ HAI nét: nét sẫm dày ở dưới, nét sáng mảnh ở trên. Nền thị trấn là đá
   * lát màu vàng cát, nên một vòng vàng mảnh vẽ thẳng lên đó gần như tàng hình
   * — đúng kiểu chỉ lộ ra khi nhìn trên nền thật chứ không phải trong đầu.
   */
  const rw = state.talkRadius * 0.62;
  const rh = state.talkRadius * 0.3;
  const ring = () => {
    ctx.beginPath();
    ctx.ellipse(x, y + 11, rw, rh, 0, 0, Math.PI * 2);
    ctx.stroke();
  };
  ctx.strokeStyle = near ? 'rgba(40,22,0,.75)' : 'rgba(40,22,0,.35)';
  ctx.lineWidth = 4;
  ring();
  ctx.strokeStyle = near ? 'rgba(255,226,150,.95)' : 'rgba(255,226,150,.45)';
  ctx.lineWidth = 1.5;
  ring();

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 11, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const drawn = Sprites.drawUnit(ctx, Sprites.npcBlock(n.sprite), 'down', 0, x, y, 32);
  if (!drawn) {
    ctx.fillStyle = '#e8c37a';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  const top = drawn ? y - 22 : y - 17;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(n.name, x, top - 8);
  ctx.fillStyle = '#ffd166';
  ctx.fillText(n.name, x, top - 8);

  ctx.font = '500 10px system-ui, sans-serif';
  ctx.strokeText(n.role, x, top + 4);
  ctx.fillStyle = '#c9b489';
  ctx.fillText(n.role, x, top + 4);
}

function drawMonster(m, cam) {
  const x = m.x - cam.x;
  const y = m.y - cam.y;
  // Ba cỡ bóng, khớp với bán kính va chạm thật ở server (config.js)
  const r = m.bs ? 17 : (m.el ? 14 : 11);

  /* Quái vừa hiện ra chưa chạm vào ai được — vẽ mờ đi để người chơi hiểu vì
     sao đi xuyên qua nó mà không vào trận, thay vì tưởng game lỗi. */
  ctx.save();
  if (m.im) ctx.globalAlpha = 0.4;

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + r - 1, r - 1, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  /* Vòng hào quang — thấy từ xa là biết nên tránh, nên đánh, hay nên rủ người.
     Vẽ TRƯỚC thân để nó nằm dưới, không cắt ngang mặt con quái.
     Vàng = Thủ Lĩnh, tím = Tinh Anh; tím nhịp chậm hơn để hai thứ không lẫn. */
  if (m.bs || m.el) {
    ctx.strokeStyle = m.bs ? 'rgba(255,209,102,.45)' : 'rgba(196,139,255,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 6 + Math.sin(Date.now() / (m.bs ? 300 : 480)) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* Phóng phải là BỘI SỐ NGUYÊN của ô 16px, nếu không pixel art nhoè và chỗ to
     chỗ bé. Tinh Anh dùng chung mức 48 với Thủ Lĩnh — khác nhau ở màu quầng và
     dấu ◈ trước tên, không phải ở cỡ. */
  const drawn = Sprites.drawUnit(
    ctx, Sprites.mobBlock(m.mid), m.d, Sprites.walkFrame(m.m, hashCode(m.id) % 400),
    x, y, (m.bs || m.el) ? 48 : 32);

  if (!drawn) {
    ctx.fillStyle = m.c || '#c05a5a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = m.bs ? '#ffd166' : (m.el ? '#c48bff' : (m.a ? '#ff4d4d' : 'rgba(255,255,255,.22)'));
    ctx.lineWidth = (m.bs || m.el) ? 3 : (m.a ? 2.5 : 2);
    ctx.stroke();

    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[m.d] || [0, 1];
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.beginPath();
    ctx.arc(x + d[0] * (r * 0.45), y + d[1] * (r * 0.45), r * 0.23, 0, Math.PI * 2);
    ctx.fill();
  } else if (m.a) {
    // Đang đuổi: vòng đỏ dưới chân thay cho cái viền quanh hình tròn ngày trước
    ctx.strokeStyle = 'rgba(255,77,77,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + r - 1, r - 1, r * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (m.a) {
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d4d';
    ctx.fillText('!', x, y - r - 7);
  }

  // Dấu đầu tên nói ra HẠNG của con quái, vì cái quầng sáng thì bị thân nó che
  // mất một phần khi đứng chồng lên vật cản
  const mark = m.bs ? '◆ ' : (m.el ? '◈ ' : '');
  const label = `${mark}${m.n} · ${m.lv}`;
  ctx.font = (m.bs || m.el) ? '700 11px system-ui, sans-serif' : '500 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(label, x, y + r + 13);
  ctx.fillStyle = m.bs ? '#ffd166' : (m.el ? '#c48bff' : '#e8b3ab');
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
  // Chuột phải dò trúng đúng thứ đang NHÌN THẤY, không phải vị trí thô của gói
  // tin gần nhất — lệch nửa ô là bấm vào người mà menu không hiện
  state.drawnPlayers = players;

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

  updateNearNpc(me);

  // Trộn người chơi, quái và người bán hàng rồi vẽ theo thứ tự y, để ai đứng
  // dưới che ai đứng trên
  const entities = [
    ...players.map((p) => ({ ...p, kind: 'player' })),
    ...monsters.map((m) => ({ ...m, kind: 'monster' })),
    ...state.npcs.map((n) => ({ ...n, kind: 'npc' })),
  ].sort((a, b) => a.y - b.y);

  for (const e of entities) {
    if (e.kind === 'player') drawPlayer(e, state.camera);
    else if (e.kind === 'npc') drawNpc(e, state.camera);
    else drawMonster(e, state.camera);
  }
}

/**
 * Ai đang trong tầm nói chuyện.
 *
 * Tính ở client CHỈ để bật cái nhắc trên màn hình. Server kiểm tra lại khoảng
 * cách trong từng lệnh mua bán — không thì sửa vài dòng JS là mở được cửa hàng
 * từ giữa Vực Băng, và việc đi bộ về thị trấn chẳng còn ý nghĩa gì.
 */
function updateNearNpc(me) {
  const before = state.nearNpc?.id || null;
  state.nearNpc = me
    ? state.npcs.find((n) => Math.hypot(n.x - me.x, n.y - me.y) <= state.talkRadius) || null
    : null;

  if ((state.nearNpc?.id || null) === before) return;

  const el = $('npcPrompt');
  if (!state.nearNpc) return el.classList.add('hidden');
  el.innerHTML = `Bấm <b>E</b> để nói chuyện với <b>${UI.esc(state.nearNpc.name)}</b>`;
  el.classList.remove('hidden');
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------------- Chuột phải lên người chơi ---------------- */

/**
 * Ai đang ở dưới con trỏ.
 *
 * Canvas trải đúng 100vw × 100vh từ góc trái trên, nên toạ độ chuột cộng thẳng
 * với camera ra toạ độ thế giới — không cần `getBoundingClientRect`.
 *
 * Bắt theo KHUNG CHỮ NHẬT chứ không theo bán kính: sprite cao 32px mà chỉ rộng
 * chừng nửa thế, dùng hình tròn thì bấm vào đầu nhân vật là trượt.
 */
function playerAt(clientX, clientY) {
  const wx = clientX + state.camera.x;
  const wy = clientY + state.camera.y;

  let best = null;
  for (const p of state.drawnPlayers) {
    if (Math.abs(wx - p.x) > 16) continue;
    if (wy < p.y - 22 || wy > p.y + 13) continue;
    // Hai người chồng lên nhau thì lấy người vẽ SAU — đúng con đang nằm trên
    if (!best || p.y > best.y) best = p;
  }
  return best;
}

/**
 * Menu nhóm — lối vào DUY NHẤT của cả hệ thống nhóm.
 *
 * `server/party.js` chạy đủ từ lâu nhưng chưa có gì gọi tới, nên "PvE tối đa 5
 * người/nhóm" đúng trên giấy mà trong game thì không ai lập nổi một nhóm.
 */
canvas.addEventListener('contextmenu', (e) => {
  // Đang đánh nhau hoặc đang mua bán thì bản đồ ở dưới không nhận thao tác nào
  if (!state.me || !state.curr || Battle.isOpen() || Shop.isOpen()) return;

  const t = playerAt(e.clientX, e.clientY);
  if (!t) return;
  e.preventDefault();

  // Bấm vào chính mình: chỗ thứ hai để rời nhóm, ngoài cái nút trên khung nhóm
  if (t.id === state.me) {
    if (Party.size() < 2) return;
    UI.menu(e, {
      title: t.n,
      subtitle: `Đang ở nhóm ${Party.size()}/${Party.max} người`,
      color: '#9ff0b5',
      items: [{ label: 'Rời nhóm', icon: '⎋', danger: true, onClick: () => Party.leave() }],
    });
    return;
  }

  // Lý do không mời được hiện thẳng dưới tên, không giấu trong một nút xám câm
  const why = Party.cannotInvite(t);
  UI.menu(e, {
    title: t.n,
    subtitle: why || 'Cùng nhóm thì cùng bị kéo vào một trận',
    color: why ? '#8b95ab' : '#9ff0b5',
    items: [{
      label: 'Mời vào nhóm',
      icon: '✚',
      disabled: !!why,
      onClick: () => Party.invite(t.id, t.n),
    }],
  });
});

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
  // HUD cũng phải đo: hàng ô trạng thái bung ra là nó cao thêm, và khung nhóm
  // ngay bên dưới thì trèo đè lên
  const hud = $('playerHud');

  const measure = (el) => (el.classList.contains('hidden') ? 0 : el.getBoundingClientRect().height);

  const apply = () => {
    root.style.setProperty('--sb-h', `${Math.round(measure(sb))}px`);
    root.style.setProperty('--nav-h', `${Math.round(measure(nav))}px`);
    root.style.setProperty('--hud-h', `${Math.round(measure(hud))}px`);
  };

  const ro = new ResizeObserver(apply);
  ro.observe(sb);
  ro.observe(nav);
  ro.observe(hud);
  window.addEventListener('resize', apply);
  apply();
}
trackBars();

$('quit').addEventListener('click', () => {
  state.socket?.disconnect();
  leaveGame();
  Account.showCharacters();
});
