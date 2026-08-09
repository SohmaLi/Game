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
  const monsterDefs = Array.from({ length: monsterCount }, () => monsterData.randomCommon());

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
console.log();
