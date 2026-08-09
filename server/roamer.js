'use strict';

const cfg = require('./config');
const map = require('./map');
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
  constructor(def, pos) {
    this.id = `r${nextId++}`;
    this.defId = def.id;
    this.name = def.name;
    this.color = def.color;
    this.family = def.family;
    this.level = def.level;

    this.x = pos.x;
    this.y = pos.y;
    this.dir = 'down';
    this.moving = false;

    this.state = 'idle';
    this.nextThinkAt = 0;
    this.goal = null;      // đích đang đi tới khi lang thang
  }

  /**
   * Quyết định mỗi vài giây, không phải mỗi tick.
   * @param players danh sách người chơi còn hoạt động trong phòng
   */
  think(now, players) {
    // Có người trong tầm thì đuổi, bất kể đang làm gì
    const prey = nearest(this, players, R.aggroRadius);
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
      const spot = map.randomSpawn(R.radius);
      this.state = 'walk';
      this.goal = spot;
      this.nextThinkAt = now + rand(R.wanderMinMs, R.wanderMaxMs);
    }
  }

  move(dt) {
    if (!this.goal) { this.moving = false; return; }

    const dx = this.goal.x - this.x;
    const dy = this.goal.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 4) {
      this.moving = false;
      this.goal = null;
      return;
    }

    const step = R.speed * dt;
    const ux = dx / dist;
    const uy = dy / dist;

    this.dir = Math.abs(ux) > Math.abs(uy)
      ? (ux < 0 ? 'left' : 'right')
      : (uy < 0 ? 'up' : 'down');

    // Tách trục để quái trượt dọc tường thay vì dính cứng vào góc
    const nx = this.x + ux * step;
    if (!map.collides(nx, this.y, R.radius)) this.x = nx;

    const ny = this.y + uy * step;
    if (!map.collides(this.x, ny, R.radius)) this.y = ny;

    this.moving = true;
  }

  serialize() {
    return {
      id: this.id,
      n: this.name,
      c: this.color,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      d: this.dir,
      m: this.moving,
      lv: this.level,
      a: this.state === 'chase', // đang đuổi — client vẽ dấu cảnh báo
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

/** Sinh một quái mới ở chỗ trống, tránh xa người chơi để không đè lên đầu họ. */
function spawn(players = []) {
  const def = monsterData.randomCommon();
  for (let i = 0; i < 30; i++) {
    const pos = map.randomSpawn(R.radius);
    if (!nearest(pos, players, R.aggroRadius * 1.5)) return new Roamer(def, pos);
  }
  return new Roamer(def, map.randomSpawn(R.radius));
}

module.exports = { Roamer, spawn, nearest };
