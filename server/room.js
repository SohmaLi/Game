'use strict';

const cfg = require('./config');
const map = require('./map');
const monsterData = require('./data/monsters');
const { Battle } = require('./battle');
const roamer = require('./roamer');
const inventory = require('./inventory');
const progression = require('./progression');
const itemData = require('./data/items');
const classData = require('./data/classes');

let nextRoomId = 1;

/** Chỉ số khởi điểm cho khách chưa đăng nhập, đủ để đánh thử. */
const GUEST_STATS = { str: 5, int: 5, vit: 5, agi: 5, wil: 5 };

/**
 * Một phòng chơi. Toàn bộ trạng thái nằm trong RAM.
 *
 * Nguyên tắc quan trọng: game loop CHỈ chạy khi phòng có người.
 * Trên shared hosting, một vòng lặp chạy không cũng đốt CPU và dễ bị host cảnh báo.
 */
class Room {
  constructor(type, io) {
    const def = cfg.ROOM_TYPES[type];
    if (!def) throw new Error(`Loại phòng không hợp lệ: ${type}`);

    this.id = `${type}-${nextRoomId++}`;
    this.type = type;
    this.maxPlayers = def.maxPlayers;
    this.io = io;
    this.players = new Map();   // socketId -> player
    this.timer = null;
    this.emptySince = null;
    this.lastTickAt = 0;
    this.battle = null;         // trận đang diễn ra, null khi đang ở chế độ khám phá
    this.roamers = new Map();   // quái đang đi lang thang trên bản đồ
  }

  get isFull() {
    return this.players.size >= this.maxPlayers;
  }

  add(socket, name, character = null) {
    const spawn = map.randomSpawn(cfg.PLAYER_RADIUS);
    const player = {
      id: socket.id,
      name,
      x: spawn.x,
      y: spawn.y,
      dir: 'down',
      moving: false,
      hp: 100,
      hpMax: 100,
      input: { up: false, down: false, left: false, right: false },

      // Dữ liệu nhân vật. Khách chưa đăng nhập dùng giá trị mặc định để vẫn chơi thử được.
      characterId: character?.id || null,
      level: character?.level || 1,
      nation: character?.nation?.id || null,
      boonId: character?.boon?.id || null,
      className: character?.class || null,
      stats: character
        ? { str: character.stats.str, int: character.stats.int, vit: character.stats.vit,
            agi: character.stats.agi, wil: character.stats.wil }
        : { ...GUEST_STATS },
      exp: character?.exp || 0,
      gold: character?.gold || 0,
      statPoints: character?.stats?.points || 0,
      inv: inventory.create(),
      rage: 0,
      karma: 0,
    };
    this.players.set(socket.id, player);
    socket.join(this.id);
    this.emptySince = null;
    this.fillRoamers();
    this.startLoop();
    return player;
  }

  remove(socketId) {
    this.players.delete(socketId);
    if (this.players.size === 0) {
      this.stopLoop();
      // Người cuối cùng thoát giữa trận thì hủy luôn, không để trận đấu chạy không
      if (this.battle) {
        this.battle.destroy();
        this.battle = null;
      }
      this.roamers.clear();
      this.emptySince = Date.now();
    }
  }

  setInput(socketId, input) {
    const p = this.players.get(socketId);
    if (!p) return;
    // Chỉ nhận đúng 4 phím, ép về boolean — không tin dữ liệu từ client
    p.input.up = !!input.up;
    p.input.down = !!input.down;
    p.input.left = !!input.left;
    p.input.right = !!input.right;
  }

  startLoop() {
    if (this.timer || this.battle) return; // đang đánh nhau thì không chạy vòng lặp khám phá
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => this.tick(), 1000 / cfg.TICK_HZ);
  }

  stopLoop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickAt) / 1000, 0.25); // chặn dt nhảy vọt khi server khựng
    this.lastTickAt = now;

    for (const p of this.players.values()) {
      this.movePlayer(p, dt);
      this.decayResources(p, dt);
    }

    const players = [...this.players.values()];
    for (const r of this.roamers.values()) {
      r.think(now, players);
      r.move(dt);
    }

    this.checkEncounters(now, players);
    this.broadcast();
  }

  /**
   * Nộ và Karma tan dần khi đang khám phá.
   *
   * Không gửi thông báo mỗi tick — client tự nội suy thanh xuống cho mượt và
   * chỉ đồng bộ lại con số thật khi có sự kiện. Bắn 15 gói mỗi giây chỉ để
   * hiển thị một thanh đang tụt là lãng phí băng thông vô ích.
   */
  decayResources(p, dt) {
    const before = { rage: p.rage || 0, karma: p.karma || 0 };
    p.rage = Math.max(0, before.rage - classData.DECAY.rage.perSecond * dt);
    p.karma = Math.max(0, before.karma - classData.DECAY.karma.perSecond * dt);

    // Chỉ báo cho client khi vượt qua một mốc tròn, đủ để thanh không lệch xa
    if (Math.floor(before.karma / 5) !== Math.floor(p.karma / 5)
      || Math.floor(before.rage / 5) !== Math.floor(p.rage / 5)) {
      this.io.to(p.id).emit('resources', {
        rage: Math.round(p.rage),
        karma: Math.round(p.karma),
      });
    }
  }

  /* -------------------------------------------------- quái lang thang --- */

  /** Đổ đầy bản đồ tới đủ số quái quy định. */
  fillRoamers() {
    const players = [...this.players.values()];
    while (this.roamers.size < cfg.ROAMER.count) {
      const r = roamer.spawn(players);
      this.roamers.set(r.id, r);
    }
  }

  /**
   * Dời những con quái đang đứng sát người chơi ra chỗ khác trên bản đồ.
   * Gọi sau mỗi trận để người chơi có khoảng thở, không bị tóm lại tại chỗ.
   */
  scatterNearbyRoamers() {
    const players = [...this.players.values()];
    if (!players.length) return;

    const safeDist = cfg.ROAMER.aggroRadius * 1.4;

    for (const r of this.roamers.values()) {
      const tooClose = players.some((p) => Math.hypot(r.x - p.x, r.y - p.y) < safeDist);
      if (!tooClose) continue;

      const fresh = roamer.spawn(players);
      r.x = fresh.x;
      r.y = fresh.y;
      r.state = 'idle';
      r.goal = null;
      r.nextThinkAt = Date.now() + cfg.ROAMER.wanderMinMs;
    }
  }

  /**
   * Người chơi chạm phải quái thì vào trận — cùng với những con khác đang
   * đứng gần đó, nên đi vào giữa bầy sói là gặp cả bầy.
   */
  checkEncounters(now, players) {
    if (this.battle) return;

    const touchDist = cfg.PLAYER_RADIUS + cfg.ROAMER.radius;

    for (const p of players) {
      if (now < (p.graceUntil || 0)) continue; // vừa ra khỏi trận, chưa bị kéo lại

      for (const r of this.roamers.values()) {
        if (Math.hypot(r.x - p.x, r.y - p.y) > touchDist) continue;

        // Gom cả những con đứng gần điểm va chạm
        const group = [...this.roamers.values()].filter(
          (o) => Math.hypot(o.x - r.x, o.y - r.y) <= cfg.ROAMER.groupRadius
        ).slice(0, 8);

        this.startBattle(group);
        return;
      }
    }
  }

  /**
   * Server tự tính vị trí từ phím bấm của client — client không bao giờ
   * được gửi thẳng toạ độ. Đây là điểm mấu chốt chống hack dịch chuyển.
   */
  movePlayer(p, dt) {
    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);

    p.moving = dx !== 0 || dy !== 0;
    if (!p.moving) return;

    // Chuẩn hoá để đi chéo không nhanh hơn đi thẳng
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;

    if (dy < 0) p.dir = 'up';
    else if (dy > 0) p.dir = 'down';
    else if (dx < 0) p.dir = 'left';
    else if (dx > 0) p.dir = 'right';

    const dist = cfg.PLAYER_SPEED * dt;

    // Tách trục X và Y để nhân vật trượt dọc tường thay vì dính cứng
    const nx = p.x + dx * dist;
    if (!map.collides(nx, p.y, cfg.PLAYER_RADIUS)) p.x = nx;

    const ny = p.y + dy * dist;
    if (!map.collides(p.x, ny, cfg.PLAYER_RADIUS)) p.y = ny;
  }

  snapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id,
        n: p.name,
        // Làm tròn 1 chữ số: giảm ~30% kích thước gói tin, mắt thường không phân biệt được
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        d: p.dir,
        m: p.moving,
        hp: p.hp,
      });
    }
    const monsters = [];
    for (const r of this.roamers.values()) monsters.push(r.serialize());

    return { t: Date.now(), players, monsters };
  }

  broadcast() {
    this.io.to(this.id).emit('state', this.snapshot());
  }

  /* -------------------------------------------------- chiến đấu --------- */

  /**
   * Vào trận. Cả phòng cùng vào — đây là game co-op theo phòng, không phải
   * mỗi người một trận riêng.
   *
   * Vòng lặp khám phá dừng lại trong lúc đánh: không ai di chuyển được, và
   * server khỏi phải tính vị trí cho những nhân vật đang đứng yên.
   *
   * @param group danh sách Roamer đã chạm phải. Chúng bị nhấc khỏi bản đồ và
   *              dựng thành combatant trong trận.
   */
  startBattle(group) {
    if (this.battle || this.players.size === 0) return null;

    const roamers = group?.length ? group : [roamer.spawn([])];
    const monsterDefs = roamers
      .map((r) => monsterData.get(r.defId))
      .filter(Boolean)
      .slice(0, 8);
    if (!monsterDefs.length) return null;

    // Nhấc khỏi bản đồ ngay, nếu không người chơi khác lại chạm vào chính con đó
    for (const r of roamers) this.roamers.delete(r.id);

    const allies = [...this.players.values()].map((p) => ({
      id: p.id, socketId: p.id, name: p.name, level: p.level,
      nation: p.nation, boonId: p.boonId, className: p.className, stats: p.stats,
      equip: inventory.bonuses(p.inv),
      rage: p.rage,
      karma: p.karma,
    }));

    this.stopLoop();
    this.battle = new Battle({
      allies,
      monsterDefs,
      io: this.io,
      channel: this.id,
      onEnd: (b, result, rewards) => {
        this.applyRewards(result, rewards);
        setTimeout(() => this.endBattle(), 4000);
      },
    });

    return this.battle;
  }

  /**
   * Ghi phần thưởng vào từng người chơi. Gọi ngay khi trận kết thúc, trước khi
   * dọn trận — nếu chờ tới lúc dọn thì người thoát sớm sẽ mất phần của mình.
   */
  applyRewards(result, rewards) {
    if (result !== 'win' || !rewards) return;

    for (const p of this.players.values()) {
      const mine = rewards.perPlayer?.[p.id];
      if (!mine) continue;

      p.gold += mine.gold;

      const levelUp = progression.addExp(p, rewards.exp);

      const kept = [];
      const lost = [];
      for (const item of mine.drops) {
        (inventory.addItem(p.inv, item) ? kept : lost).push(item);
      }
      for (const book of mine.books) p.books = [...(p.books || []), book];

      this.io.to(p.id).emit('reward', {
        exp: rewards.exp,
        gold: mine.gold,
        items: kept,
        booksFound: mine.books.length,
        // Túi đầy thì báo thẳng, không im lặng vứt đồ của người chơi
        lostToFullBag: lost.length,
        levelUp: levelUp.levelsGained > 0 ? levelUp : null,
      });

      this.sendCharacter(p);
    }
  }

  /** Toàn bộ dữ liệu bảng nhân vật của một người. */
  characterState(p) {
    const bonus = inventory.bonuses(p.inv);
    const combat = require('./stats').derive({
      stats: p.stats, equip: bonus, level: p.level,
      boonId: p.boonId, nation: p.nation, isPlayer: true,
    });

    return {
      name: p.name,
      level: p.level,
      exp: p.exp,
      expNeeded: progression.expToNext(p.level),
      gold: p.gold,
      className: p.className,
      nation: p.nation,
      boonId: p.boonId,
      stats: p.stats,
      statPoints: p.statPoints,
      rage: Math.round(p.rage || 0),
      rageMax: classData.RAGE_MAX,
      karma: Math.round(p.karma || 0),
      karmaMax: classData.KARMA_MAX,
      resources: classData.resourcesFor(p.className),
      equipBonus: bonus.stats,
      combat: {
        hpMax: combat.hpMax, manaMax: combat.manaMax,
        atkPhys: Math.round(combat.atkPhys), atkMagic: Math.round(combat.atkMagic),
        armor: Math.round(combat.armor), resist: Math.round(combat.resist),
        speed: Math.round(combat.speed),
        crit: Math.round(combat.critChance * 100),
        dodge: Math.round(combat.dodge * 100),
      },
      passives: inventory.activePassives(p.inv),
      equipped: p.inv.equipped,
      bag: p.inv.bag,
      bagSize: inventory.BAG_SIZE,
      books: p.books || [],
      slots: itemData.SLOTS,
    };
  }

  sendCharacter(p) {
    this.io.to(p.id).emit('character', this.characterState(p));
  }

  endBattle() {
    if (!this.battle) return;

    // Cả Nộ lẫn Karma đều theo người chơi ra khỏi trận — rồi tiếp tục tan dần
    // ngoài bản đồ theo DECAY.perSecond. Không cắt về 0 ở đây, vì đánh xong
    // trận này chạy sang trận kế bên cạnh thì đáng được giữ lại đà đang có.
    for (const c of this.battle.allies) {
      const p = this.players.get(c.id);
      if (!p) continue;
      p.rage = c.rage || 0;
      p.karma = c.karma || 0;
    }

    this.battle.destroy();
    this.battle = null;

    // Miễn va chạm một lúc, nếu không người chơi vừa thắng xong lại bị con quái
    // đứng ngay cạnh kéo vào trận mới mà không kịp bước đi đâu cả
    const until = Date.now() + cfg.ROAMER.graceMs;
    for (const p of this.players.values()) p.graceUntil = until;

    // Chỉ miễn va chạm thôi thì chưa đủ: con quái vẫn đứng đó và tóm lại ngay
    // khi hết hạn. Phải đẩy hẳn những con đang bám sát ra chỗ khác — coi như
    // chúng dạt ra sau khi thấy đồng bọn bị hạ.
    this.scatterNearbyRoamers();

    this.io.to(this.id).emit('battle:closed');

    // Gửi lại bảng nhân vật cho mọi người, kể cả khi trận không có phần thưởng
    // (trốn thoát, thua). Không gửi thì HUD giữ nguyên máu và tài nguyên của
    // lúc đang đánh, hiện sai cho tới trận sau.
    for (const p of this.players.values()) this.sendCharacter(p);

    // Quái bị tiêu diệt sẽ được bù lại sau một lúc, không hồi ngay tại chỗ
    setTimeout(() => {
      if (this.players.size > 0 && !this.battle) this.fillRoamers();
    }, cfg.ROAMER.respawnMs);

    if (this.players.size > 0) this.startLoop();
  }

  info() {
    return {
      id: this.id,
      type: this.type,
      label: cfg.ROOM_TYPES[this.type].label,
      players: this.players.size,
      max: this.maxPlayers,
      inBattle: !!this.battle,
    };
  }
}

module.exports = Room;
