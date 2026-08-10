'use strict';

const cfg = require('./config');
const mapLib = require('./map');
const { Battle, RESOLVE_MS } = require('./battle');
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
  constructor(type, io, zone) {
    const def = cfg.ROOM_TYPES[type];
    if (!def) throw new Error(`Loại phòng không hợp lệ: ${type}`);
    if (!zone) throw new Error('Phòng phải thuộc một vùng bản đồ.');

    this.id = `${type}-${zone.id}-${nextRoomId++}`;
    this.type = type;
    /** Vùng quyết định bản đồ, quái, Thủ Lĩnh và khoảng cấp của cả phòng. */
    this.zone = zone;
    this.map = mapLib.forZone(zone);
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
    this.roamers = new Map();   // quái thường đang đi lang thang trên bản đồ

    /**
     * Thủ Lĩnh nằm ngoài `roamers`: nó có luật riêng (một con duy nhất, ở lại
     * bản đồ trong lúc đang bị đánh, hết giờ thì tự bỏ đi) nên trộn chung vào
     * đó chỉ tổ phải viết `if (boss)` ở mọi vòng lặp.
     */
    this.boss = null;
    this.nextBossAt = Date.now() + cfg.BOSS.intervalMs;
  }

  /** Mọi thứ có thể va chạm trên bản đồ — quái thường và Thủ Lĩnh. */
  * mobs() {
    yield* this.roamers.values();
    if (this.boss) yield this.boss;
  }

  mobById(id) {
    for (const m of this.mobs()) if (m.id === id) return m;
    return null;
  }

  get isFull() {
    return this.players.size >= this.maxPlayers;
  }

  add(socket, name, character = null) {
    const spawn = this.map.randomSpawn(cfg.PLAYER_RADIUS);
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

      /**
       * Những con quái đang chồng lên người này ngay lúc này.
       *
       * Trận chỉ nổ ra khi có con MỚI chạm vào, không phải khi đang chạm. Nhờ
       * vậy con quái đứng sẵn dưới chân lúc hết thời gian miễn va chạm không
       * kéo người chơi vào trận ngay lập tức — nó phải rời ra rồi quay lại.
       */
      contacts: new Set(),
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

      // Rời giữa trận: người cuối cùng thì hủy luôn trận, còn không thì chỉ
      // nhấc mình ra — để lại một cái xác tự đánh thường mỗi vòng thì vô lý
      const b = p.battleId ? this.battles.get(p.battleId) : null;
      this.players.delete(socketId);
      if (b) {
        if (this.battleHasOtherPlayers(b, socketId)) b.removeAlly(socketId);
        else this.dropBattle(b);
      }
    }
    this.players.delete(socketId);

    if (this.players.size === 0) {
      this.stopLoop();
      for (const b of this.battles.values()) b.destroy();
      this.battles.clear();
      this.roamers.clear();
      this.boss = null;
      this.nextBossAt = Date.now() + cfg.BOSS.intervalMs;
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

    /**
     * Quái coi như KHÔNG THẤY người vừa ra khỏi trận.
     *
     * Trước đây phải dạt hết quái quanh đó ra chỗ khác, nhìn rất kỳ — cả bản đồ
     * nhảy dựng lên sau mỗi trận. Chỉ cần chúng lờ người đó đi trong vài giây
     * là đủ: không đuổi, không chạm, và người chơi có thời gian bước ra.
     */
    const prey = free.filter((p) => now >= (p.graceUntil || 0));
    for (const r of this.mobs()) {
      r.think(now, prey, this.map);
      r.move(dt, this.map);
    }

    this.party.sweep();
    this.updateBoss(now);
    this.checkEncounters(now, free);
    this.broadcast();
  }

  /* -------------------------------------------------- Thủ Lĩnh ---------- */

  /**
   * Mỗi vùng có đúng một Thủ Lĩnh, xuất hiện 5 phút một lần.
   *
   * Không ai hạ trong 3 phút thì nó bỏ đi và đồng hồ đếm lại — nếu để nó đứng
   * mãi thì người vào sau lúc nào cũng thấy boss, và cái đồng hồ đếm ngược
   * chẳng còn nghĩa lý gì.
   */
  updateBoss(now) {
    if (this.boss) {
      // Đang có người đánh thì không bỏ đi giữa chừng
      if (!this.boss.battleId && now >= this.boss.expireAt) {
        this.io.to(this.id).emit('boss:gone', { name: this.boss.name });
        this.boss = null;
        this.nextBossAt = now + cfg.BOSS.intervalMs;
      }
      return;
    }

    if (now < this.nextBossAt || !this.players.size) return;

    const b = roamer.spawnBoss(this.zone, this.map, [...this.players.values()]);
    if (!b) { this.nextBossAt = now + cfg.BOSS.intervalMs; return; }

    this.boss = b;
    this.io.to(this.id).emit('boss:spawn', { name: b.name, level: b.level });
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
      const r = roamer.spawn(this.zone, this.map, players);
      this.roamers.set(r.id, r);
    }
  }

  /**
   * Người chơi chạm phải quái thì vào trận — cùng với những con khác đang
   * đứng gần đó, nên đi vào giữa bầy sói là gặp cả bầy.
   *
   * Điều kiện là con quái phải VỪA chạm vào, chứ không phải đang chạm. Xem
   * `player.contacts` để biết vì sao.
   */
  checkEncounters(now, players) {
    for (const p of players) {
      const touching = new Set();
      for (const r of this.mobs()) {
        if (r.immune) continue; // quái vừa hiện ra thì chưa đụng vào ai được
        const reach = cfg.PLAYER_RADIUS + r.radius;
        if (Math.hypot(r.x - p.x, r.y - p.y) <= reach) touching.add(r.id);
      }

      const fresh = [...touching].filter((id) => !p.contacts.has(id));
      p.contacts = touching;

      if (p.battleId) continue;
      if (now < (p.graceUntil || 0)) continue; // vừa ra khỏi trận, chưa bị kéo lại
      if (!fresh.length) continue;

      // Thủ Lĩnh được ưu tiên: chạm cả hai thì rõ ràng người chơi nhắm con to
      const hits = fresh.map((id) => this.mobById(id)).filter(Boolean);
      const hit = hits.find((m) => m.boss) || hits[0];
      if (!hit) continue;

      if (hit.boss) this.engageBoss(hit, p);
      else {
        // Gom cả những con đứng gần điểm va chạm
        const group = [...this.roamers.values()].filter(
          (o) => !o.immune && Math.hypot(o.x - hit.x, o.y - hit.y) <= cfg.ROAMER.groupRadius
        ).slice(0, 8);
        this.startBattle(group, p);
      }
    }
  }

  /**
   * Chạm vào Thủ Lĩnh. Đã có người đánh rồi thì nhảy vào trận đó — KHÔNG cần
   * cùng nhóm, đây là điểm khác biệt duy nhất so với quái thường.
   */
  engageBoss(boss, p) {
    const running = boss.battleId ? this.battles.get(boss.battleId) : null;
    if (running && !running.ended) return this.joinBattle(running, p);

    const battle = this.startBattle([boss], p, { boss: true });
    if (battle) boss.battleId = battle.id;
    return battle;
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
    if (!this.map.collides(nx, p.y, cfg.PLAYER_RADIUS)) p.x = nx;

    const ny = p.y + dy * dist;
    if (!this.map.collides(p.x, ny, cfg.PLAYER_RADIUS)) p.y = ny;
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
    for (const r of this.mobs()) monsters.push(r.serialize());

    return {
      t: Date.now(),
      players,
      monsters,
      // Đồng hồ Thủ Lĩnh, tính bằng giây để gói tin khỏi phình vì mấy chữ số lẻ
      boss: this.boss
        ? { up: true, name: this.boss.name, lv: this.boss.level }
        : { up: false, in: Math.max(0, Math.ceil((this.nextBossAt - Date.now()) / 1000)) },
    };
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
  startBattle(group, initiator, opts = {}) {
    if (!initiator || initiator.battleId) return null;

    const mobs = group?.length ? group : [];
    // Bản mẫu đã được kéo về đúng cấp của vùng ngay từ lúc sinh ra ngoài bản đồ
    const monsterDefs = mobs.map((r) => r.def).filter(Boolean).slice(0, 8);
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

    // Nhấc quái thường khỏi bản đồ ngay, nếu không người khác lại chạm vào
    // chính con đó. Thủ Lĩnh thì Ở LẠI — đó là cách người thứ hai, thứ ba tìm
    // thấy trận đang diễn ra để nhảy vào phụ.
    if (!opts.boss) for (const r of mobs) this.roamers.delete(r.id);

    const allies = participants.map((p) => this.allyPayload(p));

    // Mỗi trận một kênh socket riêng — người ngoài trận không nhận được gói tin
    // của trận đó, vừa đúng luật chơi vừa đỡ băng thông
    const channel = `${this.id}#b${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const battle = new Battle({
      allies,
      monsterDefs,
      io: this.io,
      channel,
      boss: !!opts.boss,
      maxAllies: opts.boss ? cfg.BOSS.maxPlayers : this.maxPlayers,
      onEnd: (b, result, rewards) => {
        this.applyRewards(b, result, rewards);
        setTimeout(() => this.endBattle(b), 4000);
      },
      onLeave: (b, c) => this.releasePlayer(b, c),
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

  /** Dữ liệu một người chơi cần để dựng thành combatant. */
  allyPayload(p) {
    return {
      id: p.id, socketId: p.id, name: p.name, level: p.level,
      nation: p.nation, boonId: p.boonId, className: p.className, stats: p.stats,
      equip: this.modsOf(p),
      carried: p.carried,
      unlocked: tree.unlockedSkills(p.className, p.learned, p.codex),
      rage: p.rage,
      karma: p.karma,
    };
  }

  /** Nhảy vào một trận đang diễn ra (chỉ trận Thủ Lĩnh cho phép). */
  joinBattle(battle, p) {
    if (!battle || battle.ended || p.battleId) return null;

    const c = battle.addAlly(this.allyPayload(p));
    if (!c) return null;

    p.battleId = battle.id;
    p.input = { up: false, down: false, left: false, right: false };
    this.io.sockets.sockets.get(p.id)?.join(battle.channel);

    // Phát lại sau khi socket đã vào kênh, nếu không người vừa nhảy vào nhìn
    // thấy một màn chiến đấu trống rỗng cho tới vòng sau
    battle.broadcast();
    this.io.to(battle.channel).emit('battle:joined', { name: p.name });
    return c;
  }

  /**
   * Nhấc một người ra khỏi trận mà trận vẫn chạy tiếp (trốn thoát khỏi trận
   * Thủ Lĩnh). Chờ hết hoạt cảnh rồi mới đóng màn, nếu không người chơi bấm
   * trốn xong chỉ thấy màn hình tắt phụt mà không biết mình trốn có thoát không.
   */
  releasePlayer(battle, combatant) {
    const id = combatant.id;
    setTimeout(() => {
      const p = this.players.get(id);
      if (!p || p.battleId !== battle.id) return;

      p.rage = combatant.rage || 0;
      p.karma = combatant.karma || 0;
      p.battleId = null;
      p.graceUntil = Date.now() + cfg.ROAMER.graceMs;

      this.io.to(id).emit('battle:closed');
      this.io.sockets.sockets.get(id)?.leave(battle.channel);
      this.sendCharacter(p);
      this.saveProgress(p);
    }, RESOLVE_MS);
  }

  /** Hủy một trận không qua luồng kết thúc bình thường (người cuối cùng thoát). */
  dropBattle(battle) {
    battle.destroy();
    this.battles.delete(battle.id);
    this.closeBossBattle(battle);
    for (const c of battle.allies) {
      const p = this.players.get(c.id);
      if (p) p.battleId = null;
    }
  }

  /**
   * Gỡ trận khỏi con Thủ Lĩnh.
   *
   * Hạ được thì nó biến mất và đồng hồ 5 phút đếm lại. Không hạ được (thua,
   * trốn, cả nhóm rớt mạng) thì nó ở lại bản đồ — kèm một khoảng miễn va chạm
   * để người vừa thua có đường mà chạy.
   */
  closeBossBattle(battle) {
    if (!battle.boss) return;
    const b = this.boss;
    if (!b || b.battleId !== battle.id) return;

    b.battleId = null;

    if (battle.living('enemy').length === 0) {
      this.io.to(this.id).emit('boss:down', { name: b.name, level: b.level });
      this.boss = null;
      this.nextBossAt = Date.now() + cfg.BOSS.intervalMs;
      return;
    }

    b.expireAt = Date.now() + cfg.BOSS.despawnMs;
    b.touchableAt = Date.now() + cfg.BOSS.spawnImmuneMs;
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
    }

    this.closeBossBattle(battle);

    /**
     * Báo đóng TRƯỚC rồi mới cho rời kênh.
     *
     * Làm ngược lại thì `io.to(channel)` gửi vào một kênh đã rỗng — không ai
     * nhận được, và màn chiến đấu ở client treo lại vĩnh viễn sau khi đánh xong.
     */
    this.io.to(battle.channel).emit('battle:closed');

    for (const c of battle.allies) {
      this.io.sockets.sockets.get(c.id)?.leave(battle.channel);
    }

    battle.destroy();
    this.battles.delete(battle.id);

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
      zone: {
        id: this.zone.id, name: this.zone.name,
        levelMin: this.zone.levelMin, levelMax: this.zone.levelMax,
        theme: this.zone.theme,
      },
      players: this.players.size,
      max: this.maxPlayers,
      battles: this.battles.size,
    };
  }
}

module.exports = Room;
