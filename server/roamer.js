'use strict';

const cfg = require('./config');
const monsterData = require('./data/monsters');

/**
 * Quái đi lang thang trên bản đồ khám phá.
 *
 * Đây chỉ là "hình bóng" của con quái ngoài thế giới — nó có vị trí và biết đi
 * lại, nhưng không có máu, không đánh nhau. Khi người chơi chạm phải, nó và
 * đồng bọn xung quanh mới được dựng thành combatant thật trong server/battle.js.
 *
 * Tách hai thứ này ra vì chúng khác hẳn nhau: ngoài bản đồ cần cập nhật 15 lần
 * mỗi giây và chỉ quan tâm toạ độ; trong trận thì chạy theo lượt và cần đầy đủ
 * chỉ số, kỹ năng, hiệu ứng.
 */

let nextId = 1;

const R = cfg.ROAMER;

class Roamer {
  /**
   * @param def  bản mẫu ĐÃ kéo về đúng cấp của vùng (monsters.scaled)
   * @param opts.boss  Thủ Lĩnh — to hơn, chậm hơn, và ở lại bản đồ khi có người
   *                   đang đánh nó để người khác còn nhảy vào phụ
   */
  constructor(def, pos, opts = {}) {
    this.id = `r${nextId++}`;
    this.def = def;
    this.defId = def.id;
    this.name = def.name;
    this.color = def.color;
    this.family = def.family;
    this.level = def.level;
    this.boss = !!opts.boss;

    const K = this.boss ? cfg.BOSS : R;
    this.radius = K.radius;
    this.speed = K.speed;
    this.aggroRadius = K.aggroRadius;

    this.x = pos.x;
    this.y = pos.y;
    this.dir = 'down';
    this.moving = false;

    this.state = 'idle';
    this.nextThinkAt = 0;
    this.goal = null;      // đích đang đi tới khi lang thang

    const now = Date.now();
    this.spawnedAt = now;
    /**
     * Vừa hiện ra thì chưa chạm vào ai được. Không có khoảng này thì con quái
     * sinh ngay cạnh người chơi kéo họ vào trận trước khi họ kịp thấy nó.
     */
    this.touchableAt = now + K.spawnImmuneMs;
    this.expireAt = this.boss ? now + cfg.BOSS.despawnMs : 0;
    this.battleId = null;  // trận đang diễn ra trên con này (chỉ Thủ Lĩnh)
  }

  get immune() { return Date.now() < this.touchableAt; }

  /**
   * Quyết định mỗi vài giây, không phải mỗi tick.
   * @param players người chơi CÓ THỂ bị đuổi (người vừa ra khỏi trận đã bị lọc)
   */
  think(now, players, map) {
    // Chưa nhập thế giới thì đứng yên tại chỗ cho người chơi kịp nhìn thấy
    if (this.immune) { this.state = 'idle'; this.goal = null; return; }

    /**
     * Thủ Lĩnh đang bị đánh thì đứng yên.
     *
     * Nó vẫn nằm trên bản đồ để người khác nhảy vào phụ, nhưng nếu vẫn đi lại
     * thì nó tự đi chạm vào người ngoài cuộc và lôi họ vào trận Thủ Lĩnh mà họ
     * không hề chọn. Đứng yên biến nó thành điểm hẹn: muốn vào thì tự bước tới.
     */
    if (this.battleId) { this.state = 'idle'; this.goal = null; this.moving = false; return; }

    // Có người trong tầm thì đuổi, bất kể đang làm gì
    const prey = nearest(this, players, this.aggroRadius);
    if (prey) {
      this.state = 'chase';
      this.goal = { x: prey.x, y: prey.y };
      this.nextThinkAt = now + 300; // bám sát nên nghĩ lại nhanh
      return;
    }

    if (now < this.nextThinkAt) return;

    if (this.state === 'chase') {
      // Vừa mất dấu — đứng lại một nhịp cho tự nhiên
      this.state = 'idle';
      this.goal = null;
      this.nextThinkAt = now + 800;
      return;
    }

    if (this.state === 'walk') {
      this.state = 'idle';
      this.goal = null;
      this.nextThinkAt = now + rand(R.wanderMinMs, R.wanderMaxMs);
    } else {
      const spot = map.randomSpawn(this.radius);
      this.state = 'walk';
      this.goal = spot;
      this.nextThinkAt = now + rand(R.wanderMinMs, R.wanderMaxMs);
    }
  }

  move(dt, map) {
    if (!this.goal) { this.moving = false; return; }

    const dx = this.goal.x - this.x;
    const dy = this.goal.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 4) {
      this.moving = false;
      this.goal = null;
      return;
    }

    const step = this.speed * dt;
    const ux = dx / dist;
    const uy = dy / dist;

    this.dir = Math.abs(ux) > Math.abs(uy)
      ? (ux < 0 ? 'left' : 'right')
      : (uy < 0 ? 'up' : 'down');

    // Tách trục để quái trượt dọc tường thay vì dính cứng vào góc
    const nx = this.x + ux * step;
    if (!map.collides(nx, this.y, this.radius)) this.x = nx;

    const ny = this.y + uy * step;
    if (!map.collides(this.x, ny, this.radius)) this.y = ny;

    this.moving = true;
  }

  serialize() {
    return {
      id: this.id,
      n: this.name,
      c: this.color,
      mid: this.defId,   // bản mẫu — client tra hình theo đây, màu `c` là dự phòng
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      d: this.dir,
      m: this.moving,
      lv: this.level,
      a: this.state === 'chase', // đang đuổi — client vẽ dấu cảnh báo
      bs: this.boss || undefined,
      im: this.immune || undefined,   // đang miễn va chạm — client vẽ mờ
      f: this.battleId ? true : undefined, // có người đang đánh, vào phụ được
    };
  }
}

function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

/** Đối tượng gần nhất trong bán kính, hoặc null. */
function nearest(from, list, radius) {
  let best = null;
  let bestD = radius;
  for (const o of list) {
    const d = Math.hypot(o.x - from.x, o.y - from.y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/** Tìm chỗ trống xa người chơi để không đè lên đầu họ. */
function findSpot(map, players, radius, keepAway) {
  for (let i = 0; i < 30; i++) {
    const pos = map.randomSpawn(radius);
    if (!nearest(pos, players, keepAway)) return pos;
  }
  return map.randomSpawn(radius);
}

/**
 * Sinh một quái thường của vùng, cấp bốc ngẫu nhiên trong khoảng của vùng.
 *
 * @param others  quái đã đặt trước đó trong cùng đợt đổ đầy (server/room.js
 *                fillRoamers). Một trận lớn nhấc 5-6 con khỏi bản đồ cùng lúc,
 *                rồi đợt đổ đầy sau đó gọi spawn() liên tiếp — không tránh
 *                nhau thì `map.randomSpawn` ngẫu nhiên độc lập từng lần rất dễ
 *                dồn nhiều con đứng dính lên nhau ở cùng một góc bản đồ.
 */
function spawn(zone, map, players = [], others = []) {
  // Chỉ hạng Thường mới đi lang thang. Tinh Anh và Thủ Lĩnh có luật xuất hiện
  // riêng — thả chúng vào đây là người chơi vấp phải một con Tinh Anh giữa
  // đường mà không hề được báo trước.
  const base = monsterData.randomFrom(zone.monsters, 'common');
  const level = zone.levelMin + Math.floor(Math.random() * (zone.levelMax - zone.levelMin + 1));

  // Cách nhau tối thiểu vài lần bán kính — đủ để không chồng hình, vẫn cho
  // phép đứng thành bầy gần đó như thiết kế ban đầu (groupRadius vẫn kéo
  // được cả cụm vào chung một trận).
  const minGap = R.radius * 3;
  let pos = findSpot(map, players, R.radius, R.aggroRadius * 1.5);
  for (let i = 0; i < 10 && nearest(pos, others, minGap); i++) {
    pos = findSpot(map, players, R.radius, R.aggroRadius * 1.5);
  }
  return new Roamer(monsterData.scaled(base, level), pos);
}

/** Sinh Thủ Lĩnh của vùng — luôn ở cấp trần của vùng. */
function spawnBoss(zone, map, players = []) {
  const base = monsterData.get(zone.boss);
  if (!base) return null;
  const pos = findSpot(map, players, cfg.BOSS.radius, cfg.BOSS.aggroRadius * 1.2);
  return new Roamer(monsterData.scaled(base, zone.levelMax), pos, { boss: true });
}

module.exports = { Roamer, spawn, spawnBoss, nearest };
