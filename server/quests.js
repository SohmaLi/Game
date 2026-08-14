'use strict';

const questData = require('./data/quests');
const skills = require('./data/skills');
const itemData = require('./data/items');
const tree = require('./data/skilltree');
const progression = require('./progression');

/**
 * Bộ máy nhiệm vụ (DESIGN.md §8b).
 *
 * Nguyên tắc trung tâm: **một bảng đếm cộng dồn, không có sổ sách từng việc.**
 *
 * Không có bước "nhận việc", không có trạng thái đang-làm nào phải đồng bộ. Một
 * việc là xong khi bộ đếm chạm mốc, thế thôi. Nhờ vậy thêm một nhiệm vụ mới vào
 * `data/quests.js` thì tiến độ cũ tự tính lại — không cần migrate, không có
 * nhân vật nào bị kẹt ở một nhiệm vụ đã bị xoá khỏi bảng.
 *
 * Client KHÔNG BAO GIỜ gửi tiến độ lên. Nó chỉ được gửi đúng một thứ: "tôi bấm
 * nhận thưởng việc X".
 */

/** Một ngày, tính bằng ms — mốc đổi việc hàng ngày. */
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_COUNT = 3;

/* ------------------------------------------------------------ bộ đếm ----- */

/**
 * Khoá bộ đếm. Chỉ có hai họ, và cả hai đều đọc được từ danh sách quái vừa hạ:
 *   `kill:<monsterId>` — theo bản mẫu cụ thể
 *   `tier:<hạng>`      — theo hạng, cộng thêm `tier:any` cho mọi con
 */
const killKey = (monsterId) => `kill:${monsterId}`;
const tierKey = (tier) => `tier:${tier}`;

/** Bảng rỗng cho nhân vật mới, hoặc cho bản lưu cũ chưa có cột `quests`. */
function blank() {
  return {
    counters: {},
    claimed: [],        // id việc vùng / cột mốc đã nhận thưởng
    dailyWindow: null,  // số thứ tự ngày của bộ việc đang hiện
    dailyIds: [],
    dailyBase: {},      // ảnh chụp bộ đếm lúc sang ngày mới
    dailyClaimed: [],
  };
}

/** Chuẩn hoá dữ liệu đọc từ database — thiếu trường nào thì bù trường đó. */
function normalize(q) {
  const b = blank();
  if (!q || typeof q !== 'object') return b;
  return {
    counters: q.counters && typeof q.counters === 'object' ? { ...q.counters } : b.counters,
    claimed: Array.isArray(q.claimed) ? [...q.claimed] : b.claimed,
    dailyWindow: Number.isFinite(q.dailyWindow) ? q.dailyWindow : b.dailyWindow,
    dailyIds: Array.isArray(q.dailyIds) ? [...q.dailyIds] : b.dailyIds,
    dailyBase: q.dailyBase && typeof q.dailyBase === 'object' ? { ...q.dailyBase } : b.dailyBase,
    dailyClaimed: Array.isArray(q.dailyClaimed) ? [...q.dailyClaimed] : b.dailyClaimed,
  };
}

/**
 * Ghi nhận số quái vừa hạ trong một trận thắng.
 *
 * `killed` là đúng danh sách mà `battle.finish` đã dựng để chia chiến lợi phẩm —
 * không dựng lại từ đầu, vì hai bản đếm ở hai nơi là hai chỗ để lệch nhau.
 */
function recordKills(p, killed = []) {
  const q = (p.quests = normalize(p.quests));
  for (const k of killed) {
    const id = typeof k === 'string' ? k : k.id;
    const tier = (typeof k === 'object' && k.tier) || 'common';
    bump(q.counters, killKey(id));
    bump(q.counters, tierKey(tier));
    bump(q.counters, tierKey('any'));
  }
  return q;
}

const bump = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };

/* -------------------------------------------------------- tiến độ -------- */

/**
 * Tiến độ hiện tại của một mục tiêu, và mốc cần đạt.
 *
 * `base` là mốc nền của việc hàng ngày (xem `rollDaily`). Việc vùng và cột mốc
 * truyền bảng rỗng, tức là đếm cộng dồn cả đời nhân vật.
 */
function progressOf(p, goal, base = {}) {
  const q = normalize(p.quests);
  const at = (key) => (q.counters[key] || 0) - (base[key] || 0);

  switch (goal.type) {
    case 'kill':
      return { have: at(killKey(goal.monster)), need: goal.count };
    case 'tier':
      return { have: at(tierKey(goal.tier)), need: goal.count };
    case 'level':
      // Cấp không phải bộ đếm — đọc thẳng, và không bao giờ tụt (loseExp chặn)
      return { have: p.level || 1, need: goal.level };
    case 'codex':
      return { have: (p.codex || []).filter(Boolean).length, need: goal.slots };
    case 'equip':
      return { have: itemData.SLOT_IDS.filter((s) => p.inv?.equipped?.[s]).length, need: goal.slots };
    default:
      return { have: 0, need: 1 };
  }
}

const isDone = (p, goal, base) => {
  const { have, need } = progressOf(p, goal, base);
  return have >= need;
};

/* ---------------------------------------------------- việc hàng ngày ----- */

const dayOf = (now) => Math.floor(now / DAY_MS);

/** Còn bao nhiêu giây tới lượt đổi việc. */
const nextResetIn = (now) => Math.ceil(((dayOf(now) + 1) * DAY_MS - now) / 1000);

/** PRNG cùng loại với server/map.js và server/shop.js — cùng hạt giống, cùng kết quả. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Bốc bộ việc của ngày hôm nay, và chụp mốc nền.
 *
 * Mốc nền là thứ làm việc hàng ngày chạy được trên một bộ đếm cộng dồn: tiến độ
 * = đếm hiện tại − đếm lúc sang ngày. Không có nó thì một nhân vật đã hạ 4000
 * con quái sẽ thấy cả ba việc hôm nay xong sẵn ngay lúc đăng nhập.
 */
function rollDaily(p, now = Date.now()) {
  const q = (p.quests = normalize(p.quests));
  const win = dayOf(now);
  if (q.dailyWindow === win && q.dailyIds.length) return q;

  const rnd = mulberry32(hash(`${p.characterId || p.name || p.id}:${win}`));
  const pool = [...questData.DAILY_TEMPLATES];
  // Chốt số lượng TRƯỚC vòng lặp: `pool.length` teo đi sau mỗi lần splice, nên
  // để nó trong điều kiện lặp thì bốc 3 việc từ bể 4 khuôn chỉ ra 2
  const want = Math.min(DAILY_COUNT, pool.length);
  const picked = [];
  for (let i = 0; i < want; i++) {
    picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
  }

  q.dailyWindow = win;
  q.dailyIds = picked;
  q.dailyBase = { ...q.counters };
  q.dailyClaimed = [];
  return q;
}

/**
 * Mốc cần đạt của một việc hàng ngày, co giãn theo cấp người chơi.
 *
 * Cùng một khuôn "dọn đường" phải mất khoảng cùng số phút ở cấp 5 và ở cấp 60.
 * Không co giãn thì việc hàng ngày ở cấp trần xong trong hai phút.
 */
function dailyGoal(tpl, level) {
  const lv = Math.max(1, level || 1);
  const scale = 1 + Math.floor((lv - 1) / 15) * 0.5;   // 1 · 1.5 · 2 · 2.5
  const count = Math.max(1, Math.round((tpl.goal.count || 1) * scale));
  return { ...tpl.goal, count };
}

const dailyReward = (level) => ({
  gold: Math.round(60 * Math.max(1, level || 1)),
  exp: Math.round(progression.expToNext(Math.max(1, level || 1)) * 0.25) || 0,
});

/* ------------------------------------------------------- gửi client ------ */

/** Một dòng nhiệm vụ đã tính sẵn mọi thứ client cần vẽ. */
function viewOf(p, q, def, goal, reward, base, claimed) {
  const { have, need } = progressOf(p, goal, base);
  const done = have >= need;
  return {
    id: def.id,
    kind: def.kind,
    zone: def.zone || null,
    name: def.name,
    desc: String(def.desc || '').replace('{count}', need),
    have: Math.min(have, need),
    need,
    done,
    claimed,
    // Chỉ hiện nút nhận khi thật sự bấm được — nút bấm vào để bị từ chối còn
    // tệ hơn không có nút
    claimable: done && !claimed,
    reward,
  };
}

/**
 * Toàn bộ Nhật Ký của một người chơi.
 *
 * Tính lại từ đầu mỗi lần gửi, không cache. Bộ đếm đổi sau mỗi trận, và một bản
 * cache lệch một nhịp ở đây là người chơi bấm nhận thưởng rồi bị từ chối.
 */
function stateFor(p, now = Date.now()) {
  const q = rollDaily(p, now);

  const zoneList = questData.ZONE_QUESTS.map((def) =>
    viewOf(p, q, def, def.goal, def.reward, {}, q.claimed.includes(def.id)));

  const milestones = questData.MILESTONES.map((def) =>
    viewOf(p, q, def, def.goal, def.reward, {}, q.claimed.includes(def.id)));

  const dailies = q.dailyIds.map((id) => {
    const tpl = questData.daily(id);
    if (!tpl) return null;
    const goal = dailyGoal(tpl, p.level);
    return viewOf(p, q, { ...tpl, kind: 'daily' }, goal, dailyReward(p.level),
      q.dailyBase, q.dailyClaimed.includes(id));
  }).filter(Boolean);

  return {
    zones: zoneList,
    dailies,
    milestones,
    resetIn: nextResetIn(now),
    // Chấm đỏ trên nút: chỉ đếm việc BẤM ĐƯỢC ngay, không đếm việc đang làm dở
    claimable: [...zoneList, ...dailies, ...milestones].filter((v) => v.claimable).length,
  };
}

/* ------------------------------------------------------- nhận thưởng ---- */

/**
 * Nhận thưởng một việc. Trả về `{ ok, error }` theo giao kèo của `invAction`
 * trong `net.js` — chỗ gọi lo việc gửi lại bảng nhân vật và lưu tiến trình.
 *
 * Kiểm tra lại điều kiện TẠI ĐÂY chứ không tin cái nút client vẽ ra: sửa vài
 * dòng JS là gọi thẳng `quest:claim` với id bất kỳ.
 */
function claim(p, questId, now = Date.now()) {
  const q = rollDaily(p, now);

  const daily = q.dailyIds.includes(questId) ? questData.daily(questId) : null;
  const def = daily || questData.get(questId);
  if (!def) return { ok: false, error: 'Không tìm thấy nhiệm vụ.' };

  const claimedList = daily ? q.dailyClaimed : q.claimed;
  if (claimedList.includes(questId)) return { ok: false, error: 'Đã nhận thưởng việc này rồi.' };

  const goal = daily ? dailyGoal(def, p.level) : def.goal;
  const base = daily ? q.dailyBase : {};
  if (!isDone(p, goal, base)) {
    const { have, need } = progressOf(p, goal, base);
    return { ok: false, error: `Chưa xong: ${Math.min(have, need)}/${need}.` };
  }

  const reward = daily ? dailyReward(p.level) : def.reward;
  claimedList.push(questId);

  p.gold = (p.gold || 0) + (reward.gold || 0);
  const levelUp = reward.exp ? progression.addExp(p, reward.exp) : null;

  // Sách thưởng bốc từ đúng bể sách Dị Điển mà quái vẫn rơi — không có bể riêng
  // cho nhiệm vụ, vì hai bể là hai chỗ để một kỹ năng mới bị bỏ sót
  let book = null;
  if (reward.book) {
    book = rollQuestBook(reward.book, def.name);
    p.books = [...(p.books || []), book];
  }

  return {
    ok: true,
    questId,
    name: def.name,
    gold: reward.gold || 0,
    exp: reward.exp || 0,
    book: book ? { name: book.name, tier: book.tier } : null,
    levelUp: levelUp && levelUp.levelsGained > 0 ? levelUp : null,
  };
}

/**
 * Nhận thưởng MỌI việc đang xong — chỉ làm được khi đứng cạnh Người Chép Sử.
 *
 * Đây là lý do duy nhất để đi bộ về Bến Cảng: nhận từng việc một thì ở đâu cũng
 * bấm được, và phải như vậy — đổi vùng là mất nhóm (`Room.dropFromParty`), bắt
 * người chơi về thị trấn để lấy thưởng là bắt họ giải tán nhóm. Cái NPC bán là
 * sự tiện tay, không phải sức mạnh, nên ai không bao giờ ghé cũng không thiệt.
 */
function claimAll(p, now = Date.now()) {
  const view = stateFor(p, now);

  // Việc hàng ngày đi TRƯỚC: mốc của nó tính theo cấp hiện tại, nên kinh nghiệm
  // của một việc vùng có thể đẩy người chơi qua mốc 16/31/46 và nâng mốc của
  // chính việc hàng ngày đang chờ nhận ngay trong vòng lặp này
  const ids = [...view.dailies, ...view.zones, ...view.milestones]
    .filter((v) => v.claimable)
    .map((v) => v.id);

  if (!ids.length) return { ok: false, error: 'Chưa có việc nào xong để nhận.' };

  const out = { ok: true, count: 0, skipped: 0, gold: 0, exp: 0, books: [], names: [], levels: 0 };
  for (const id of ids) {
    const r = claim(p, id, now);
    if (!r.ok) { out.skipped++; continue; }

    out.count++;
    out.gold += r.gold;
    out.exp += r.exp;
    out.names.push(r.name);
    if (r.book) out.books.push(r.book);
    out.levels += r.levelUp?.levelsGained || 0;
  }
  return out;
}

function rollQuestBook(tier, from) {
  const pool = skills.CODEX_SKILLS;
  const skillId = pool[Math.floor(Math.random() * pool.length)];
  const skill = skills.get(skillId);
  return {
    uid: `bk${Date.now()}${Math.floor(Math.random() * 100000)}`,
    from,
    tier,
    skillId,
    name: `Dị Điển: ${skill.name}`,
    desc: skill.desc,
  };
}

module.exports = {
  DAY_MS, DAILY_COUNT,
  blank, normalize, recordKills, progressOf, isDone,
  rollDaily, dailyGoal, dailyReward, nextResetIn, dayOf,
  stateFor, claim, claimAll,
  // Chỉ để test đọc được khoá bộ đếm mà không phải đoán chuỗi
  killKey, tierKey,
  CODEX_SLOTS: tree.CODEX_SLOTS,
};
