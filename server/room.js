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
const tree = require('./data/skilltree');
const skillData = require('./data/skills');
const statsLib = require('./stats');
const { PartyManager } = require('./party');
const charactersRepo = require('./characters');

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
    /**
     * Nhiều trận có thể diễn ra song song trong cùng một phòng — mỗi nhóm một
     * trận riêng. Người không cùng nhóm vẫn đi lại bình thường trên bản đồ
     * trong lúc nhóm khác đang đánh nhau.
     */
    this.battles = new Map();   // battleId -> Battle
    this.party = new PartyManager();
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

      // Cây kỹ năng — nạp lại từ bản lưu nếu có
      learned: character?.learned || [],
      carried: character?.carried || [],
      codex: character?.codex?.length === tree.CODEX_SLOTS
        ? character.codex
        : Array(tree.CODEX_SLOTS).fill(null),
      books: character?.books || [],

      partyId: null,   // nhóm đang tham gia
      battleId: null,  // trận đang đánh, null khi đang khám phá
    };
    // Khôi phục túi đồ và vị trí đã lưu
    if (character?.equipped) {
      for (const slot of itemData.SLOT_IDS) {
        if (character.equipped[slot]) player.inv.equipped[slot] = character.equipped[slot];
      }
    }
    if (character?.bag?.length) player.inv.bag = character.bag;
    if (character?.pos && character.pos.x > 0) {
      player.x = character.pos.x;
      player.y = character.pos.y;
    }

    this.players.set(socket.id, player);
    socket.join(this.id);
    this.emptySince = null;
    this.fillRoamers();
    this.startLoop();
    return player;
  }

  remove(socketId) {
    const p = this.players.get(socketId);
    if (p) {
      this.saveProgress(p);
      this.party.leave(p);

      // Rời giữa trận: nếu là người cuối cùng của trận đó thì hủy luôn trận
      const b = p.battleId ? this.battles.get(p.battleId) : null;
      if (b && !this.battleHasOtherPlayers(b, socketId)) this.dropBattle(b);
    }

    this.players.delete(socketId);

    if (this.players.size === 0) {
      this.stopLoop();
      for (const b of this.battles.values()) b.destroy();
      this.battles.clear();
      this.roamers.clear();
      this.emptySince = Date.now();
    }
  }

  battleHasOtherPlayers(battle, exceptId) {
    return battle.allies.some((c) => c.id !== exceptId && this.players.has(c.id));
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
    // Vòng lặp khám phá vẫn chạy kể cả khi có trận đang diễn ra — người không
    // ở trong trận đó vẫn phải đi lại được
    if (this.timer) return;
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

    // Người đang trong trận thì đứng yên trên bản đồ: không di chuyển, không
    // tan tài nguyên (trận đấu tự lo phần đó theo vòng)
    const free = [...this.players.values()].filter((p) => !p.battleId);
    for (const p of free) {
      this.movePlayer(p, dt);
      this.decayResources(p, dt);
    }

    const players = free;
    for (const r of this.roamers.values()) {
      r.think(now, players);
      r.move(dt);
    }

    this.party.sweep();
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
  scatterNearbyRoamers(only = null) {
    const players = only || [...this.players.values()];
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
    const touchDist = cfg.PLAYER_RADIUS + cfg.ROAMER.radius;

    for (const p of players) {
      if (p.battleId) continue;
      if (now < (p.graceUntil || 0)) continue; // vừa ra khỏi trận, chưa bị kéo lại

      for (const r of this.roamers.values()) {
        if (Math.hypot(r.x - p.x, r.y - p.y) > touchDist) continue;

        // Gom cả những con đứng gần điểm va chạm
        const group = [...this.roamers.values()].filter(
          (o) => Math.hypot(o.x - r.x, o.y - r.y) <= cfg.ROAMER.groupRadius
        ).slice(0, 8);

        this.startBattle(group, p);
        break; // người này đã vào trận, xét tiếp người khác
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
        b: !!p.battleId,      // đang trong trận — client vẽ mờ đi
        pt: p.partyId || null, // để client tô màu đồng đội
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
  startBattle(group, initiator) {
    if (!initiator || initiator.battleId) return null;

    const roamers = group?.length ? group : [roamer.spawn([])];
    const monsterDefs = roamers
      .map((r) => monsterData.get(r.defId))
      .filter(Boolean)
      .slice(0, 8);
    if (!monsterDefs.length) return null;

    /**
     * CHỈ người chạm phải quái và ĐỒNG ĐỘI của họ vào trận.
     *
     * Người trong cùng phòng nhưng khác nhóm vẫn đi lại bình thường — phòng
     * chỉ là khoảng không gian chung, không phải một đội. Đồng đội thì bị kéo
     * vào cùng dù đang đứng ở đâu trên bản đồ: đã là nhóm thì cùng đánh.
     */
    const participants = this.party.membersOf(initiator)
      .map((id) => this.players.get(id))
      .filter((p) => p && !p.battleId);

    if (!participants.length) return null;

    // Nhấc quái khỏi bản đồ ngay, nếu không người khác lại chạm vào chính con đó
    for (const r of roamers) this.roamers.delete(r.id);

    const allies = participants.map((p) => ({
      id: p.id, socketId: p.id, name: p.name, level: p.level,
      nation: p.nation, boonId: p.boonId, className: p.className, stats: p.stats,
      equip: this.modsOf(p),
      carried: p.carried,
      unlocked: tree.unlockedSkills(p.className, p.learned, p.codex),
      rage: p.rage,
      karma: p.karma,
    }));

    // Mỗi trận một kênh socket riêng — người ngoài trận không nhận được gói tin
    // của trận đó, vừa đúng luật chơi vừa đỡ băng thông
    const channel = `${this.id}#b${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const battle = new Battle({
      allies,
      monsterDefs,
      io: this.io,
      channel,
      onEnd: (b, result, rewards) => {
        this.applyRewards(b, result, rewards);
        setTimeout(() => this.endBattle(b), 4000);
      },
    });

    battle.channel = channel;
    battle.roomRef = this;
    this.battles.set(battle.id, battle);

    for (const p of participants) {
      p.battleId = battle.id;
      p.input = { up: false, down: false, left: false, right: false };
      const sock = this.io.sockets.sockets.get(p.id);
      sock?.join(channel);
    }

    // Gửi trạng thái ban đầu sau khi mọi người đã vào kênh
    battle.broadcast();
    return battle;
  }

  /** Hủy một trận không qua luồng kết thúc bình thường (người cuối cùng thoát). */
  dropBattle(battle) {
    battle.destroy();
    this.battles.delete(battle.id);
    for (const c of battle.allies) {
      const p = this.players.get(c.id);
      if (p) p.battleId = null;
    }
  }

  /**
   * Ghi phần thưởng vào từng người chơi. Gọi ngay khi trận kết thúc, trước khi
   * dọn trận — nếu chờ tới lúc dọn thì người thoát sớm sẽ mất phần của mình.
   */
  applyRewards(battle, result, rewards) {
    if (result !== 'win' || !rewards) return;

    for (const c of battle.allies) {
      const p = this.players.get(c.id);
      if (!p) continue;
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

  /**
   * Ghi tiến trình xuống database.
   *
   * Gọi sau mỗi trận và khi người chơi rời đi. Chỉ lưu lúc thoát là không đủ —
   * mất kết nối đột ngột hoặc server restart sẽ nuốt mất cả buổi chơi.
   * Khách chưa đăng nhập (characterId null) thì bỏ qua, không có gì để lưu.
   */
  saveProgress(p) {
    if (!p?.characterId) return;
    charactersRepo.saveProgress(p.characterId, p)
      .catch((err) => console.error('[room] lưu tiến trình lỗi:', err.message));
  }

  /** Gộp bị động từ trang bị và từ Cây Nền thành một bảng cộng thêm duy nhất. */
  modsOf(p) {
    return statsLib.mergeMods(
      inventory.bonuses(p.inv),
      tree.bonuses(p.className, p.learned)
    );
  }

  /** Toàn bộ dữ liệu bảng nhân vật của một người. */
  characterState(p) {
    const bonus = this.modsOf(p);
    const combat = statsLib.derive({
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

      // Cây kỹ năng
      partyId: p.partyId,
      party: p.partyId
        ? (this.party.get(p.partyId)?.members || []).map((id) => {
            const m = this.players.get(id);
            return m && { id: m.id, name: m.name, level: m.level, leader: this.party.get(p.partyId).leaderId === id };
          }).filter(Boolean)
        : [],
      classes: classData.all().map((c) => ({ id: c.id, name: c.name, role: c.role, desc: c.desc })),
      tree: p.className ? tree.publicTree(p.className, p) : [],
      skillPoints: p.className ? tree.pointsLeft(p.className, p.level, p.learned) : tree.pointsEarned(p.level),
      learned: p.learned,
      carried: p.carried,
      maxLoadout: skillData.MAX_LOADOUT,
      unlocked: tree.unlockedSkills(p.className, p.learned, p.codex)
        .map(skillData.publicView).filter(Boolean),
      innate: skillData.INNATE.map(skillData.publicView),
      codex: p.codex,
      codexSlots: tree.CODEX_SLOTS,

      equipped: p.inv.equipped,
      bag: p.inv.bag,
      bagSize: inventory.BAG_SIZE,
      books: p.books || [],
      unspentBooks: (p.books || []).length,
      slots: itemData.SLOTS,
    };
  }

  sendCharacter(p) {
    this.io.to(p.id).emit('character', this.characterState(p));
  }

  endBattle(battle) {
    if (!battle || !this.battles.has(battle.id)) return;

    // Nộ và Karma theo người chơi ra khỏi trận, rồi tiếp tục tan ngoài bản đồ
    for (const c of battle.allies) {
      const p = this.players.get(c.id);
      if (!p) continue;
      p.rage = c.rage || 0;
      p.karma = c.karma || 0;
      p.battleId = null;

      // Miễn va chạm một lúc, nếu không người vừa thắng lại bị con quái đứng
      // ngay cạnh kéo vào trận mới mà không kịp bước đi đâu
      p.graceUntil = Date.now() + cfg.ROAMER.graceMs;

      const sock = this.io.sockets.sockets.get(p.id);
      sock?.leave(battle.channel);
    }

    this.io.to(battle.channel).emit('battle:closed');
    battle.destroy();
    this.battles.delete(battle.id);

    // Chỉ dạt những con đang đứng sát người vừa ra khỏi trận
    this.scatterNearbyRoamers(battle.allies.map((c) => this.players.get(c.id)).filter(Boolean));

    for (const c of battle.allies) {
      const p = this.players.get(c.id);
      if (!p) continue;
      this.sendCharacter(p);
      this.saveProgress(p);
    }

    setTimeout(() => {
      if (this.players.size > 0) this.fillRoamers();
    }, cfg.ROAMER.respawnMs);
  }

  info() {
    return {
      id: this.id,
      type: this.type,
      label: cfg.ROOM_TYPES[this.type].label,
      players: this.players.size,
      max: this.maxPlayers,
      battles: this.battles.size,
    };
  }
}

module.exports = Room;
