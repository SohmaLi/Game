'use strict';

const stats = require('./stats');
const skillData = require('./data/skills');
const monsterData = require('./data/monsters');
const boons = require('./data/boons');
const nations = require('./data/nations');
const loot = require('./loot');

/**
 * Trận đánh turn-based.
 *
 * Vòng lượt (DESIGN.md §5.2):
 *   1. Tất cả cùng chọn hành động — 20 giây, hết giờ thì tự đánh thường
 *   2. Server sắp thứ tự theo Nhanh Nhẹn
 *   3. Thực thi lần lượt, gửi danh sách sự kiện về client để dựng hoạt cảnh
 *   4. Tính hiệu ứng cuối vòng (độc, hồi máu, giảm lượt hồi chiêu)
 *
 * Toàn bộ tính toán ở server. Client chỉ gửi "tôi chọn chiêu X vào mục tiêu Y"
 * và phát lại hoạt cảnh từ danh sách sự kiện — nó không tự tính một con số nào.
 */

const SELECT_MS = 20_000;
const RESOLVE_MS = 2200;   // thời gian client phát hoạt cảnh trước khi sang vòng mới
const MAX_ROUNDS = 50;     // chặn trận đánh kéo dài vô tận
const RAGE_MAX = 100;

let nextBattleId = 1;

/* ------------------------------------------------------ tạo combatant ---- */

function playerCombatant(player) {
  const c = {
    id: player.id,
    socketId: player.socketId || player.id,
    name: player.name,
    side: 'ally',
    isPlayer: true,
    level: player.level || 1,
    nation: player.nation || null,
    boonId: player.boonId || null,
    className: player.className || null,
    stats: player.stats || { str: 5, int: 5, vit: 5, agi: 5, wil: 5 },
    equip: player.equip || null,
    skills: skillData.loadoutFor(player.className),
    cooldowns: {},
    effects: [],
    rage: 0,
    reviveUsed: false,
    alive: true,
  };
  c.combat = stats.derive(c);
  c.hpMax = c.combat.hpMax;
  c.manaMax = c.combat.manaMax;
  c.hp = player.hp != null ? Math.min(player.hp, c.hpMax) : c.hpMax;
  c.mana = player.mana != null ? Math.min(player.mana, c.manaMax) : c.manaMax;
  return c;
}

function monsterCombatant(def, index) {
  const tier = monsterData.TIER[def.tier];
  const c = {
    id: `m${index}_${def.id}`,
    name: def.name,
    side: 'enemy',
    isPlayer: false,
    monsterId: def.id,
    family: def.family,
    tier: def.tier,
    tierLabel: tier.label,
    color: def.color,
    level: def.level,
    stats: def.stats,
    skills: def.skills,
    cooldowns: {},
    effects: [],
    rage: 0,
    alive: true,
  };
  c.combat = stats.derive(c);
  c.hpMax = Math.round(c.combat.hpMax * tier.hpMult);
  c.manaMax = c.combat.manaMax;
  c.hp = c.hpMax;
  c.mana = c.manaMax;
  return c;
}

/* ------------------------------------------------------ lớp Battle ------- */

class Battle {
  /**
   * @param opts.auto  true (mặc định): tự chạy đồng hồ và tự sang vòng mới.
   *                   false: không đặt hẹn giờ nào — dùng cho trình mô phỏng cân bằng,
   *                   nơi cần chạy hàng trăm trận trong một giây.
   */
  constructor({ allies, monsterDefs, io, channel, onEnd, auto = true }) {
    this.id = `b${nextBattleId++}`;
    this.io = io;
    this.channel = channel;
    this.onEnd = onEnd;
    this.auto = auto;

    this.combatants = [
      ...allies.map(playerCombatant),
      ...monsterDefs.map(monsterCombatant),
    ];

    this.round = 0;
    this.phase = 'select';
    this.actions = new Map(); // combatantId -> { skillId, targetId }
    this.timer = null;
    this.deadline = 0;
    this.log = [];
    this.ended = false;

    this.startRound();
  }

  /* -------------------------------------------------- truy vấn ---------- */

  get allies() { return this.combatants.filter((c) => c.side === 'ally'); }
  get enemies() { return this.combatants.filter((c) => c.side === 'enemy'); }

  living(side) { return this.combatants.filter((c) => c.side === side && c.alive); }
  byId(id) { return this.combatants.find((c) => c.id === id) || null; }

  /** Nhanh Nhẹn sau khi tính hiệu ứng làm chậm. */
  effectiveSpeed(c) {
    let sp = c.combat.speed;
    for (const e of c.effects) if (e.type === 'slow') sp *= 1 - e.percent;
    return sp;
  }

  /* -------------------------------------------------- vòng lượt --------- */

  startRound() {
    if (this.ended) return;

    this.round++;
    if (this.round > MAX_ROUNDS) return this.finish('draw');

    this.phase = 'select';
    this.actions.clear();
    this.deadline = Date.now() + SELECT_MS;

    this.broadcast();

    clearTimeout(this.timer);
    if (this.auto) this.timer = setTimeout(() => this.resolveRound(), SELECT_MS);
  }

  /** Người chơi chọn hành động. Trả về false nếu lựa chọn không hợp lệ. */
  submit(combatantId, skillId, targetId) {
    if (this.phase !== 'select' || this.ended) return false;

    const actor = this.byId(combatantId);
    if (!actor || !actor.alive || !actor.isPlayer) return false;
    if (!actor.skills.includes(skillId)) return false;

    const skill = skillData.get(skillId);
    if (!skill) return false;
    if ((actor.cooldowns[skillId] || 0) > 0) return false;
    if (stats.manaCost(actor, skill) > actor.mana) return false;
    if (skill.rage > 0 && actor.rage < skill.rage) return false;

    const target = this.resolveTargetChoice(actor, skill, targetId);
    if (!target) return false;

    this.actions.set(combatantId, { skillId, targetId: target });
    this.broadcast();

    // Tất cả người chơi còn sống đã chọn xong thì xử lý luôn, không bắt chờ hết 20 giây
    const pending = this.living('ally').filter((a) => a.isPlayer && !this.actions.has(a.id));
    if (pending.length === 0 && this.auto) {
      clearTimeout(this.timer);
      setTimeout(() => this.resolveRound(), 250);
    }
    return true;
  }

  /** Kiểm tra mục tiêu người chơi chọn có hợp lệ với loại kỹ năng không. */
  resolveTargetChoice(actor, skill, targetId) {
    const enemySide = actor.side === 'ally' ? 'enemy' : 'ally';

    switch (skill.target) {
      case 'self': return actor.id;
      case 'allEnemies': return `ALL:${enemySide}`;
      case 'allAllies': return `ALL:${actor.side}`;
      case 'ally': {
        const t = this.byId(targetId);
        return t && t.alive && t.side === actor.side ? t.id : null;
      }
      case 'enemy':
      default: {
        const t = this.byId(targetId);
        if (t && t.alive && t.side === enemySide) return t.id;
        const fallback = this.living(enemySide)[0];
        return fallback ? fallback.id : null;
      }
    }
  }

  /** Quái tự chọn: ưu tiên chiêu chủ chốt khi hết hồi chiêu, còn lại đánh thường. */
  monsterDecision(m) {
    const usable = m.skills
      .filter((id) => id !== 'attack' && (m.cooldowns[id] || 0) <= 0)
      .map((id) => skillData.get(id))
      .filter(Boolean);

    const skill = usable.length && Math.random() < 0.65
      ? usable[Math.floor(Math.random() * usable.length)]
      : skillData.get('attack');

    const targets = this.living('ally');
    if (!targets.length) return null;
    const target = targets[Math.floor(Math.random() * targets.length)];
    return { skillId: skill.id, targetId: target.id };
  }

  /* -------------------------------------------------- xử lý vòng -------- */

  resolveRound() {
    if (this.phase !== 'select' || this.ended) return;
    this.phase = 'resolve';

    // Ai chưa chọn thì đánh thường — không để trận đấu đứng im vì một người treo máy
    for (const a of this.living('ally')) {
      if (!this.actions.has(a.id)) {
        const t = this.living('enemy')[0];
        if (t) this.actions.set(a.id, { skillId: 'attack', targetId: t.id });
      }
    }
    for (const m of this.living('enemy')) {
      const d = this.monsterDecision(m);
      if (d) this.actions.set(m.id, d);
    }

    const order = [...this.combatants]
      .filter((c) => c.alive && this.actions.has(c.id))
      .sort((a, b) => this.effectiveSpeed(b) - this.effectiveSpeed(a) || Math.random() - 0.5);

    const events = [];
    for (const actor of order) {
      if (!actor.alive) continue; // có thể đã gục trước khi tới lượt
      const action = this.actions.get(actor.id);
      events.push(...this.execute(actor, action));
      if (this.checkEnd(events)) break;
    }

    if (!this.ended) events.push(...this.endOfRound());

    this.io.to(this.channel).emit('battle:resolve', {
      battleId: this.id,
      round: this.round,
      events,
      state: this.serialize(),
    });

    if (this.ended || !this.auto) return;
    setTimeout(() => this.startRound(), RESOLVE_MS);
  }

  execute(actor, action) {
    const events = [];
    const skill = skillData.get(action.skillId) || skillData.get('attack');

    // Kiểm tra lại tài nguyên tại thời điểm thực thi — trạng thái có thể đã đổi
    const cost = stats.manaCost(actor, skill);
    if (cost > actor.mana || (skill.rage > 0 && actor.rage < skill.rage)) {
      return this.execute(actor, { skillId: 'attack', targetId: action.targetId });
    }

    actor.mana -= cost;
    if (skill.rage > 0) actor.rage -= skill.rage;
    else if (skill.rage < 0) actor.rage = Math.min(RAGE_MAX, actor.rage - skill.rage);
    if (skill.cooldown > 0) actor.cooldowns[skill.id] = skill.cooldown + 1;

    const targets = this.expandTargets(actor, skill, action.targetId);
    const hits = [];

    for (const target of targets) {
      if (!target.alive && skill.kind !== 'heal') continue;

      if (skill.kind === 'buff') {
        if (skill.effect) this.applyEffect(target, skill.effect);
        hits.push({ id: target.id, kind: 'buff', effect: skill.effect?.type });
        continue;
      }

      const result = stats.computeDamage(actor, target, skill);

      if (result.kind === 'heal') {
        const before = target.hp;
        target.hp = Math.min(target.hpMax, target.hp + result.amount);
        hits.push({ id: target.id, kind: 'heal', amount: target.hp - before, hp: target.hp });
        continue;
      }

      if (result.dodged) {
        hits.push({ id: target.id, kind: 'dodge', amount: 0, hp: target.hp });
        continue;
      }

      target.hp = Math.max(0, target.hp - result.amount);
      if (skill.effect) this.applyEffect(target, skill.effect);

      // Xâm Thực — đòn đánh gieo thêm sát thương theo thời gian
      const aBoon = boons.get(actor.boonId);
      if (aBoon?.effect.type === 'dot') {
        this.applyEffect(target, {
          type: 'dot', turns: aBoon.effect.duration, maxStacks: aBoon.effect.maxStacks,
          amount: Math.max(1, Math.round(result.amount * aBoon.effect.percent)),
        });
      }

      // Chống đỡ bằng Nộ Khí: bị đánh cũng tích nộ
      if (target.isPlayer) target.rage = Math.min(RAGE_MAX, target.rage + 6);

      hits.push({ id: target.id, kind: 'damage', amount: result.amount, crit: result.crit, hp: target.hp });

      // Hút Máu từ trang bị
      if (actor.combat.lifesteal > 0 && actor.alive) {
        const healed = Math.max(1, Math.round(result.amount * actor.combat.lifesteal));
        const before = actor.hp;
        actor.hp = Math.min(actor.hpMax, actor.hp + healed);
        if (actor.hp > before) {
          hits.push({ id: actor.id, kind: 'heal', amount: actor.hp - before, hp: actor.hp });
        }
      }

      // Phản Phệ — dội ngược một phần sát thương
      const tBoon = boons.get(target.boonId);
      const reflectPct = (tBoon?.effect.type === 'reflect' ? tBoon.effect.percent : 0)
                       + (target.combat.reflect || 0);
      if (reflectPct > 0 && actor.alive && result.amount > 0) {
        const back = Math.max(1, Math.round(result.amount * reflectPct));
        actor.hp = Math.max(0, actor.hp - back);
        hits.push({ id: actor.id, kind: 'reflect', amount: back, hp: actor.hp });
        this.checkDeath(actor, events);
      }

      this.checkDeath(target, events);
    }

    events.unshift({
      type: 'act',
      actorId: actor.id,
      actorName: actor.name,
      skillId: skill.id,
      skillName: skill.name,
      skillKind: skill.kind,
      hits,
    });

    return events;
  }

  expandTargets(actor, skill, targetId) {
    if (typeof targetId === 'string' && targetId.startsWith('ALL:')) {
      return this.living(targetId.slice(4));
    }
    const t = this.byId(targetId);
    return t ? [t] : [];
  }

  applyEffect(target, effect) {
    if (effect.type === 'dot') {
      const stacks = target.effects.filter((e) => e.type === 'dot').length;
      if (stacks >= (effect.maxStacks || 3)) {
        // Đã đủ lớp thì làm mới thời gian thay vì chồng thêm
        const oldest = target.effects.find((e) => e.type === 'dot');
        if (oldest) oldest.turns = effect.turns;
        return;
      }
    }
    target.effects.push({ ...effect, turns: effect.turns });
  }

  checkDeath(c, events) {
    if (c.alive && c.hp <= 0) {
      // Bất Diệt — một lần mỗi trận, đứng dậy với 25% máu
      const boon = boons.get(c.boonId);
      if (boon?.effect.type === 'revive' && !c.reviveUsed) {
        c.reviveUsed = true;
        c.hp = Math.round(c.hpMax * boon.effect.hpPercent);
        events.push({ type: 'revive', id: c.id, name: c.name, hp: c.hp });
        return;
      }
      c.alive = false;
      c.effects = [];
      events.push({ type: 'death', id: c.id, name: c.name, side: c.side });
    }
  }

  /** Hiệu ứng cuối vòng: độc, hồi mana, Đồng Cảm, giảm lượt hồi chiêu. */
  endOfRound() {
    const events = [];

    for (const c of this.combatants) {
      if (!c.alive) continue;

      for (const e of c.effects) {
        if (e.type === 'dot') {
          c.hp = Math.max(0, c.hp - e.amount);
          events.push({ type: 'dot', id: c.id, amount: e.amount, hp: c.hp });
          this.checkDeath(c, events);
        }
      }

      c.effects = c.effects.map((e) => ({ ...e, turns: e.turns - 1 })).filter((e) => e.turns > 0);

      for (const id of Object.keys(c.cooldowns)) {
        c.cooldowns[id] = Math.max(0, c.cooldowns[id] - 1);
      }

      // Hồi mana theo Ý Chí, cộng thêm phần từ trang bị
      if (c.alive) {
        c.mana = Math.min(c.manaMax,
          c.mana + Math.round(1 + c.stats.wil * 0.4) + (c.combat.manaRegen || 0));

        if (c.combat.regenPercent > 0) {
          const heal = Math.round(c.hpMax * c.combat.regenPercent);
          const before = c.hp;
          c.hp = Math.min(c.hpMax, c.hp + heal);
          if (c.hp > before) events.push({ type: 'regen', id: c.id, amount: c.hp - before, hp: c.hp });
        }
      }
    }

    // Đồng Cảm — chỉ có tác dụng khi đi nhóm
    const party = this.living('ally');
    if (party.length > 1) {
      for (const src of party) {
        const boon = boons.get(src.boonId);
        if (boon?.effect.type === 'partyRegen') {
          for (const m of party) {
            const heal = Math.round(m.hpMax * boon.effect.percent);
            const before = m.hp;
            m.hp = Math.min(m.hpMax, m.hp + heal);
            if (m.hp > before) {
              events.push({ type: 'regen', id: m.id, amount: m.hp - before, hp: m.hp });
            }
          }
        }
      }
    }

    this.checkEnd(events);
    return events;
  }

  checkEnd(events) {
    if (this.ended) return true;
    if (this.living('enemy').length === 0) { this.finish('win', events); return true; }
    if (this.living('ally').length === 0) { this.finish('lose', events); return true; }
    return false;
  }

  /* -------------------------------------------------- kết thúc ---------- */

  finish(result, events = []) {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'ended';
    clearTimeout(this.timer);

    let rewards = null;
    if (result === 'win') {
      const monsterIds = this.enemies.map((m) => m.monsterId);
      const partySize = this.allies.length || 1;

      // Kinh nghiệm và vàng chia đều; ĐỒ thì mỗi người bốc riêng — nếu chia đều
      // thì nhóm 5 người mỗi người được 1/5 món, tức là chẳng ai nhận được gì.
      const perPlayer = {};
      let exp = 0;
      let gold = 0;

      for (const ally of this.allies) {
        const boon = boons.get(ally.boonId);
        const luck = boon?.effect.type === 'dropRate' ? boon.effect.multiplier : 1;
        const nation = nations.get(ally.nation);
        const goldBonus = nation?.privilege.effect.goldPercent || 0;

        const roll = loot.rollBattleLoot(monsterIds, { luck, goldBonus, partySize });
        exp = roll.exp;
        gold = Math.max(gold, roll.gold);
        perPlayer[ally.id] = { gold: roll.gold, drops: roll.drops, books: roll.books };
      }

      rewards = { exp, gold, perPlayer };
    }

    events.push({ type: 'end', result, rewards });

    this.io.to(this.channel).emit('battle:end', {
      battleId: this.id,
      result,
      rewards,
      state: this.serialize(),
    });

    this.onEnd?.(this, result, rewards);
  }

  destroy() {
    clearTimeout(this.timer);
    this.ended = true;
  }

  /* -------------------------------------------------- gửi client -------- */

  serializeCombatant(c) {
    return {
      id: c.id,
      name: c.name,
      side: c.side,
      isPlayer: c.isPlayer,
      level: c.level,
      tierLabel: c.tierLabel || null,
      color: c.color || null,
      hp: c.hp, hpMax: c.hpMax,
      mana: c.mana, manaMax: c.manaMax,
      rage: c.rage, rageMax: RAGE_MAX,
      speed: Math.round(this.effectiveSpeed(c)),
      alive: c.alive,
      effects: c.effects.map((e) => ({ type: e.type, turns: e.turns })),
      cooldowns: c.cooldowns,
      // Chỉ chủ nhân mới cần biết mình có những chiêu gì
      skills: c.isPlayer ? c.skills.map(skillData.publicView) : null,
    };
  }

  serialize() {
    return {
      battleId: this.id,
      round: this.round,
      phase: this.phase,
      msLeft: this.phase === 'select' ? Math.max(0, this.deadline - Date.now()) : 0,
      selectMs: SELECT_MS,
      chosen: [...this.actions.keys()],
      combatants: this.combatants.map((c) => this.serializeCombatant(c)),
      // Thứ tự lượt hiện tại, để client hiện dải "ai đánh trước"
      order: [...this.combatants]
        .filter((c) => c.alive)
        .sort((a, b) => this.effectiveSpeed(b) - this.effectiveSpeed(a))
        .map((c) => c.id),
    };
  }

  broadcast() {
    this.io.to(this.channel).emit('battle:state', this.serialize());
  }
}

module.exports = { Battle, SELECT_MS, RESOLVE_MS, RAGE_MAX };
