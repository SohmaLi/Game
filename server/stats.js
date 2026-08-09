'use strict';

const boons = require('./data/boons');
const nations = require('./data/nations');

/**
 * Công thức chỉ số và sát thương.
 *
 * Tách riêng khỏi hệ chiến đấu để cân bằng game chỉ cần sửa một file, và để
 * viết test cho công thức mà không phải dựng cả trận đấu.
 *
 * Mọi con số ở đây là bản nháp đầu tiên — sẽ chỉnh nhiều sau khi chơi thử.
 */

const BASE = {
  hp: 50, hpPerVit: 12, hpPerLevel: 8,
  mana: 20, manaPerInt: 6, manaPerWil: 3,
  atkPerStr: 3, atkPerInt: 3, atkFlat: 8,
  armorPerVit: 1.2, resistPerWil: 1.2,
  critChance: 0.05, critDamage: 1.5,
  dodgePerAgi: 0.003, dodgeMax: 0.25,
  // Giáp giảm sát thương theo tỉ lệ chứ không trừ thẳng — trừ thẳng sẽ khiến
  // đòn yếu bị vô hiệu hoàn toàn còn đòn mạnh gần như không bị ảnh hưởng.
  armorK: 60,
};

/**
 * Quái dùng công thức máu riêng, thấp hơn người chơi nhiều.
 *
 * Nếu dùng chung công thức thì một con quái thường cấp 2 có nhiều máu hơn cả
 * người chơi — trận đánh kéo dài lê thê và người chơi luôn thua vì bị đông hơn.
 * Quái sinh ra để bị hạ trong vài đòn; độ khó đến từ số lượng và kỹ năng của
 * chúng, không phải từ việc chúng dai máu.
 */
const MONSTER = {
  hp: 14, hpPerVit: 4, hpPerLevel: 4,

  /**
   * Quái đánh nhẹ hơn người chơi khá nhiều. Lý do không phải để game dễ, mà vì
   * bị đông hơn trong hệ turn-based là bất lợi lũy tiến: N con quái vừa gây
   * N lần sát thương mỗi vòng, vừa cần N lần lâu hơn để dọn sạch. Nếu mỗi con
   * đánh mạnh ngang người chơi thì chỉ hơn một con là thua chắc, và độ khó
   * biến thành vực thẳm thay vì đường dốc.
   *
   * Con số 0.5 được chọn từ tools/simulate.js để đường cong ra như sau:
   *   1 vs 1 → thắng gần chắc     (quái thường chỉ là chướng ngại)
   *   1 vs 2 → khoảng nửa ăn nửa thua  (căng thẳng, đáng chơi)
   *   1 vs 3 → gần như thua       (phải rủ bạn)
   */
  damageMult: 0.5,
};

/**
 * Gộp chỉ số gốc + trang bị + đặc ân + đặc quyền quốc gia thành chỉ số chiến đấu.
 *
 * Thứ tự áp dụng có ý nghĩa: chỉ số cộng thẳng từ trang bị được gộp vào TRƯỚC
 * khi chạy công thức, nên "+5 Thể Chất" cũng làm tăng máu và giáp. Còn hệ số
 * phần trăm thì áp SAU, chỉ chạm đúng thứ nó nói.
 */
function derive(char) {
  const equip = char.equip || null;
  const base = char.stats;
  const s = equip
    ? {
        str: base.str + equip.stats.str,
        int: base.int + equip.stats.int,
        vit: base.vit + equip.stats.vit,
        agi: base.agi + equip.stats.agi,
        wil: base.wil + equip.stats.wil,
      }
    : base;

  const boon = boons.get(char.boonId);
  const nation = nations.get(char.nation);

  let agi = s.agi;
  let manaMult = 1;
  let armorMult = 1;

  if (boon?.effect.type === 'statPercent' && boon.effect.stat === 'agi') {
    agi *= 1 + boon.effect.percent;
  }
  if (nation?.privilege.effect.agiPercent) agi *= 1 + nation.privilege.effect.agiPercent;
  if (nation?.privilege.effect.manaPercent) manaMult += nation.privilege.effect.manaPercent;
  if (nation?.privilege.effect.armorPercent) armorMult += nation.privilege.effect.armorPercent;

  const level = char.level || 1;
  const H = char.isPlayer === false ? MONSTER : BASE;
  const e = equip?.combat;

  const out = {
    hpMax: Math.round(H.hp + s.vit * H.hpPerVit + level * H.hpPerLevel),
    manaMax: Math.round((BASE.mana + s.int * BASE.manaPerInt + s.wil * BASE.manaPerWil) * manaMult),
    atkPhys: BASE.atkFlat + s.str * BASE.atkPerStr,
    atkMagic: BASE.atkFlat + s.int * BASE.atkPerInt,
    armor: s.vit * BASE.armorPerVit * armorMult,
    resist: s.wil * BASE.resistPerWil,
    speed: agi,
    dodge: Math.min(BASE.dodgeMax, agi * BASE.dodgePerAgi),
    critChance: BASE.critChance + (boon?.effect.type === 'crit' ? boon.effect.chance : 0),
    critDamage: BASE.critDamage + (boon?.effect.type === 'crit' ? boon.effect.damage : 0),
    // Hiệu ứng chỉ đến từ trang bị
    regenPercent: 0, manaRegen: 0, reflect: 0, lifesteal: 0,
  };

  if (e) {
    out.hpMax = Math.round(out.hpMax * (1 + e.hpPercent));
    out.armor *= 1 + e.armorPercent;
    out.resist *= 1 + e.resistPercent;
    out.critChance += e.critChance;
    out.critDamage += e.critDamage;
    // Né vẫn bị chặn trần — nếu không, nhồi đủ đồ né là bất tử
    out.dodge = Math.min(BASE.dodgeMax + 0.15, out.dodge + e.dodge);
    out.regenPercent = e.regenPercent;
    out.manaRegen = e.manaRegen;
    out.reflect = e.reflect;
    out.lifesteal = e.lifesteal;
  }

  return out;
}

/** Giáp/kháng giảm sát thương theo đường cong, không bao giờ về 0. */
function mitigate(raw, defense) {
  return raw * (BASE.armorK / (BASE.armorK + Math.max(0, defense)));
}

/**
 * Tính một đòn đánh. Trả về đầy đủ chi tiết để client dựng hoạt cảnh và
 * hiện đúng chữ "CHÍ MẠNG" / "NÉ" chứ không chỉ trừ máu khan.
 */
function computeDamage(attacker, defender, skill) {
  const A = attacker.combat;
  const D = defender.combat;

  if (skill.kind === 'heal') {
    const amount = Math.round((A.atkMagic * skill.power) * rand(0.95, 1.05));
    return { kind: 'heal', amount, crit: false, dodged: false };
  }

  // Né chỉ áp dụng cho đòn vật lý — phép thuật thì không né được, chỉ kháng
  if (skill.kind === 'physical' && Math.random() < D.dodge) {
    return { kind: skill.kind, amount: 0, crit: false, dodged: true };
  }

  const isMagic = skill.kind === 'magic';
  let raw = (isMagic ? A.atkMagic : A.atkPhys) * skill.power;
  if (attacker.isPlayer === false) raw *= MONSTER.damageMult;

  // Cuồng Nộ — máu càng thấp sát thương càng cao
  const boon = boons.get(attacker.boonId);
  if (boon?.effect.type === 'lowHpDamage') {
    const hpRatio = attacker.hp / attacker.hpMax;
    if (hpRatio < boon.effect.threshold) {
      const t = 1 - hpRatio / boon.effect.threshold;
      raw *= 1 + boon.effect.maxBonus * t;
    }
  }

  const crit = Math.random() < A.critChance;
  if (crit) raw *= A.critDamage;

  let dmg = mitigate(raw, isMagic ? D.resist : D.armor);

  // Kiên Định / Hộ Tâm
  const dBoon = boons.get(defender.boonId);
  if (dBoon?.effect.type === 'physicalReduction' && !isMagic) dmg *= 1 - dBoon.effect.percent;
  if (dBoon?.effect.type === 'magicReduction' && isMagic) dmg *= 1 - dBoon.effect.percent;

  // Bản Năng Hoang Dã — Vharn chịu ít sát thương hơn từ Thú Vật
  const dNation = nations.get(defender.nation);
  if (dNation?.privilege.effect.beastDamageTaken && attacker.family === 'beast') {
    dmg *= 1 + dNation.privilege.effect.beastDamageTaken;
  }

  dmg *= rand(0.92, 1.08); // dao động nhẹ để hai đòn giống nhau không ra số y hệt

  return { kind: skill.kind, amount: Math.max(1, Math.round(dmg)), crit, dodged: false };
}

/** Mana tiêu hao sau khi tính Cộng Hưởng và đặc quyền quốc gia. */
function manaCost(caster, skill) {
  let cost = skill.manaCost || 0;
  const boon = boons.get(caster.boonId);
  if (boon?.effect.type === 'manaCost') cost *= 1 + boon.effect.percent;
  return Math.max(0, Math.round(cost));
}

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

module.exports = { BASE, MONSTER, derive, mitigate, computeDamage, manaCost };
