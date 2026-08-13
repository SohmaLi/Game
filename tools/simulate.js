'use strict';

/**
 * Mô phỏng cân bằng chiến đấu.
 *
 * Chạy hàng trăm trận không cần giao diện để trả lời: người chơi thắng bao nhiêu
 * phần trăm, trận kéo dài mấy vòng. Cân bằng bằng cách ngồi bấm tay thì mỗi lần
 * chỉ có một mẫu, và cảm nhận thì không đáng tin.
 *
 * Chạy:
 *   node tools/simulate.js [số_trận_mỗi_kịch_bản]
 */

const { Battle } = require('../server/battle');
const monsterData = require('../server/data/monsters');
const boons = require('../server/data/boons');
const zones = require('../server/data/zones');
const inventory = require('../server/inventory');
const items = require('../server/data/items');

const RUNS = parseInt(process.argv[2], 10) || 300;

// io giả — trình mô phỏng không gửi gì đi đâu cả
const io = { to: () => ({ emit: () => {} }) };

function makePlayer(i, opts = {}) {
  return {
    id: `p${i}`,
    name: `NguoiChoi${i}`,
    level: opts.level || 1,
    nation: opts.nation || null,
    boonId: opts.boonId || null,
    className: opts.className || null,
    stats: opts.stats || { str: 5, int: 5, vit: 5, agi: 5, wil: 5 },
  };
}

/** Chạy một trận tới khi kết thúc. Người chơi luôn đánh thường vào mục tiêu đầu tiên. */
function runOne(partySize, monsterCount, playerOpts = {}) {
  const allies = Array.from({ length: partySize }, (_, i) => makePlayer(i, playerOpts));
  // Quái của vùng đầu tiên ở cấp gốc — đúng thứ người chơi mới gặp trong 10
  // phút đầu, khi còn chưa có mảnh trang bị nào
  const monsterDefs = Array.from({ length: monsterCount },
    () => monsterData.randomFrom(zones.defaultFor(1).monsters));

  const battle = new Battle({ allies, monsterDefs, io, channel: 'sim', auto: false });

  while (!battle.ended) {
    for (const a of battle.living('ally')) {
      const target = battle.living('enemy')[0];
      if (target) battle.submit(a.id, 'attack', target.id);
    }
    battle.resolveRound();
    if (!battle.ended) battle.startRound();
  }

  const result = battle.living('ally').length > 0 ? 'win' : 'lose';
  return {
    result,
    rounds: battle.round,
    hpLeft: battle.allies.reduce((s, a) => s + Math.max(0, a.hp), 0) /
            battle.allies.reduce((s, a) => s + a.hpMax, 0),
  };
}

function scenario(label, partySize, monsterCount, playerOpts = {}) {
  let wins = 0, rounds = 0, hp = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = runOne(partySize, monsterCount, playerOpts);
    if (r.result === 'win') { wins++; rounds += r.rounds; hp += r.hpLeft; }
  }
  const winRate = wins / RUNS;
  const avgRounds = wins ? rounds / wins : 0;
  const avgHp = wins ? hp / wins : 0;

  const verdict =
    winRate < 0.35 ? '⚠ QUÁ KHÓ'
      : winRate > 0.95 ? '⚠ quá dễ'
        : avgRounds > 14 ? '⚠ lê thê'
          : avgRounds < 3 ? '⚠ kết thúc quá nhanh'
            : '✓ ổn';

  console.log(
    `${label.padEnd(26)} thắng ${(winRate * 100).toFixed(0).padStart(3)}%  ` +
    `${avgRounds.toFixed(1).padStart(4)} vòng  ` +
    `còn ${(avgHp * 100).toFixed(0).padStart(3)}% máu   ${verdict}`
  );
  return winRate;
}

console.log(`\nMô phỏng ${RUNS} trận mỗi kịch bản — người chơi chỉ dùng Đánh Thường\n`);

console.log('--- Theo quy mô nhóm (số quái = số người) ---');
scenario('1 người vs 1 quái', 1, 1);
scenario('2 người vs 2 quái', 2, 2);
scenario('3 người vs 3 quái', 3, 3);
scenario('5 người vs 5 quái', 5, 5);

console.log('\n--- Khi bị đông hơn ---');
scenario('1 người vs 2 quái', 1, 2);
scenario('1 người vs 3 quái', 1, 3);
scenario('5 người vs 8 quái', 5, 8);

console.log('\n--- Ảnh hưởng của Đặc Ân (1 vs 1) ---');
const baseline = scenario('không có đặc ân', 1, 1);
for (const b of boons.BOONS) {
  const wr = scenario(`  ${b.name}`, 1, 1, { boonId: b.id });
  const delta = (wr - baseline) * 100;
  if (Math.abs(delta) > 12) {
    console.log(`      ↑ lệch ${delta > 0 ? '+' : ''}${delta.toFixed(0)} điểm % so với không có đặc ân`);
  }
}
/* ==================================================== theo vùng bản đồ ==== */

/**
 * Nhân vật "trung bình" ở một cấp: đã tiêu hết điểm chỉ số và mặc đủ 10 ô đồ
 * cùng cấp. Đây mới là đối thủ thật của quái vùng cao — so quái cấp 50 với một
 * nhân vật trần trụi chỉ số gốc thì con số nào cũng vô nghĩa.
 */
function levelledPlayer(i, level) {
  const pts = 3 * (level - 1);
  const stats = { str: 5, int: 5, vit: 5, agi: 5, wil: 5 };
  stats.str += Math.round(pts * 0.40);
  stats.vit += Math.round(pts * 0.30);
  stats.agi += Math.round(pts * 0.15);
  stats.wil += pts - Math.round(pts * 0.40) - Math.round(pts * 0.30) - Math.round(pts * 0.15);

  const inv = inventory.create();
  for (const slot of items.SLOT_IDS) inv.equipped[slot] = items.generate(level, {});

  return {
    id: `p${i}`, name: `NguoiChoi${i}`, level, stats,
    equip: inventory.bonuses(inv),
    nation: null, boonId: null, className: null,
  };
}

/** Chạy tới hết một trận đã dựng sẵn hai phe. */
function runBattle(allies, monsterDefs) {
  const battle = new Battle({ allies, monsterDefs, io, channel: 'sim', auto: false });

  while (!battle.ended) {
    for (const a of battle.living('ally')) {
      const target = battle.living('enemy')[0];
      if (target) battle.submit(a.id, 'attack', target.id);
    }
    battle.resolveRound();
    if (!battle.ended) battle.startRound();
  }

  return {
    result: battle.living('ally').length > 0 ? 'win' : 'lose',
    rounds: battle.round,
    hpLeft: battle.allies.reduce((s, a) => s + Math.max(0, a.hp), 0) /
            battle.allies.reduce((s, a) => s + a.hpMax, 0),
  };
}

/**
 * @param kind  'field' — quái thường, mong thắng 85-95%
 *              'bossSolo' — một mình đánh Thủ Lĩnh, ĐÚNG ra là phải thua
 *              'bossParty' — cả nhóm đánh Thủ Lĩnh, mong thắng 60-95% và mất máu thật
 */
function report(label, runs, kind = 'field') {
  let wins = 0, rounds = 0, hp = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = runs();
    if (r.result === 'win') { wins++; rounds += r.rounds; hp += r.hpLeft; }
  }
  const winRate = wins / RUNS;
  const avgRounds = wins ? rounds / wins : 0;
  const avgHp = wins ? hp / wins : 0;

  const verdict = kind === 'bossSolo'
    ? (winRate <= 0.20 ? '✓ phải đi nhóm' : '⚠ một mình cũng hạ được')
    : kind === 'bossParty'
      ? (winRate < 0.55 ? '⚠ QUÁ KHÓ' : winRate > 0.98 && avgHp > 0.7 ? '⚠ quá dễ' : '✓ ổn')
      : winRate < 0.35 ? '⚠ QUÁ KHÓ'
        : winRate > 0.98 ? '⚠ quá dễ'
          : avgRounds > 14 ? '⚠ lê thê'
            : '✓ ổn';

  console.log(
    `${label.padEnd(30)} thắng ${(winRate * 100).toFixed(0).padStart(3)}%  ` +
    `${avgRounds.toFixed(1).padStart(4)} vòng  ` +
    `còn ${(avgHp * 100).toFixed(0).padStart(3)}% máu   ${verdict}`
  );
  return winRate;
}

/**
 * Vùng an toàn không có gì để đo: không quái, không Thủ Lĩnh. Bỏ qua ngay từ
 * đây thay vì để `monsterData.get(null)` ném lỗi giữa bảng kết quả.
 */
const HUNTING = zones.ZONES.filter((z) => !z.safe);

console.log('--- Quái thường theo vùng (nhân vật cấp trần của vùng, đủ trang bị) ---');
for (const z of HUNTING) {
  const lv = z.levelMax;
  report(`${z.name} · 1 vs 2`, () => runBattle(
    [levelledPlayer(0, lv)],
    Array.from({ length: 2 }, () => monsterData.scaled(monsterData.randomFrom(z.monsters), lv))
  ));
}

/**
 * Quái Tinh Anh đi lang thang LẺ MỘT MÌNH (`Room.groupAround`) — nên chỉ đo
 * đúng cảnh đó. Nó phải là thứ một người đủ trang bị dám đánh nhưng phải trả
 * giá bằng máu: dễ quá thì chẳng khác quái thường, khó quá thì không ai dừng lại.
 */
console.log('\n--- Quái Tinh Anh (đi lẻ, đụng là đánh tay đôi) ---');
for (const z of HUNTING) {
  const lv = z.levelMax;
  const elite = () => monsterData.scaled(monsterData.randomFrom(z.elites, 'elite'), lv);
  report(`${z.name} · 1 người`, () => runBattle([levelledPlayer(0, lv)], [elite()]));
  report(`${z.name} · 2 người`, () => runBattle(
    Array.from({ length: 2 }, (_, i) => levelledPlayer(i, lv)), [elite()]
  ));
}

console.log('\n--- Thủ Lĩnh (một mình vs cả nhóm 5) ---');
for (const z of HUNTING) {
  const lv = z.levelMax;
  const boss = () => monsterData.scaled(monsterData.get(z.boss), lv);
  report(`${z.name} · 1 người`, () => runBattle([levelledPlayer(0, lv)], [boss()]), 'bossSolo');
  report(`${z.name} · 5 người`, () => runBattle(
    Array.from({ length: 5 }, (_, i) => levelledPlayer(i, lv)), [boss()]
  ), 'bossParty');
}

console.log();
