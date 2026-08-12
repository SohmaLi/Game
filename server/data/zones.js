'use strict';

/**
 * Vùng bản đồ — 6 vùng phủ kín cấp 1 tới 60, mỗi vùng 10 cấp.
 *
 * Vùng là thứ chia người chơi ra: mỗi vùng có phòng riêng, quái riêng, Thủ Lĩnh
 * riêng và bản đồ riêng. Người chơi tự chọn vùng trước khi vào game.
 *
 * `levelMin` vừa là điều kiện vào, vừa là cấp thấp nhất của quái trong vùng.
 * Không chặn người cấp cao quay về vùng thấp — muốn đi dạo chỗ dễ là quyền của
 * họ, chỉ có điều phần thưởng ở đó bèo bọt.
 *
 * `seed` quyết định hình dạng bản đồ (server/map.js). Đổi seed là đổi bản đồ,
 * nên một khi đã có người chơi thì đừng đụng vào.
 */

const ZONES = [
  {
    id: 'meadow', name: 'Đồng Cỏ Thanh Bình',
    levelMin: 1, levelMax: 10, seed: 1_337,
    desc: 'Cỏ cao tới gối và những con sói chưa biết sợ người.',
    monsters: ['grey_wolf', 'bandit'],
    boss: 'alpha_wolf',
    theme: { floorA: '#141a27', floorB: '#161c2a', wall: '#28324a', wallTop: '#35415e', accent: '#7ee89a' },
  },
  {
    id: 'mistwood', name: 'Rừng Sương Mù',
    levelMin: 11, levelMax: 20, seed: 4_211,
    desc: 'Sương dày tới mức không thấy thứ đang bò trên cây.',
    monsters: ['mist_spider', 'grey_wolf', 'bandit'],
    boss: 'spider_matron',
    theme: { floorA: '#131f1c', floorB: '#152321', wall: '#24463c', wallTop: '#2f5c4d', accent: '#69d6a0' },
  },
  {
    id: 'bonewaste', name: 'Hoang Mạc Xương Trắng',
    levelMin: 21, levelMax: 30, seed: 9_090,
    desc: 'Cát ở đây trắng vì nó không phải cát.',
    monsters: ['skeleton', 'bone_archer'],
    boss: 'bone_general',
    theme: { floorA: '#241f18', floorB: '#28231b', wall: '#4a4132', wallTop: '#655944', accent: '#e8d9a8' },
  },
  {
    id: 'frostmaw', name: 'Vực Băng Vĩnh Cửu',
    levelMin: 31, levelMax: 40, seed: 15_517,
    desc: 'Lạnh đến mức tiếng động cũng đóng băng giữa chừng.',
    monsters: ['frost_revenant', 'bone_archer'],
    boss: 'ice_troll',
    theme: { floorA: '#151e2c', floorB: '#182333', wall: '#2b4665', wallTop: '#3c6089', accent: '#8fd4ff' },
  },
  {
    id: 'stormpeak', name: 'Đỉnh Bão Tố',
    levelMin: 41, levelMax: 50, seed: 27_733,
    desc: 'Nơi cao nhất lục địa, và cũng là nơi ít người trở về nhất.',
    monsters: ['storm_cultist', 'frost_revenant'],
    boss: 'storm_herald',
    theme: { floorA: '#1d1729', floorB: '#211a2f', wall: '#3d2b5c', wallTop: '#553d7d', accent: '#c4a2ff' },
  },
  {
    id: 'voidshrine', name: 'Đền Đài Hư Không',
    levelMin: 51, levelMax: 60, seed: 51_601,
    desc: 'Bão Tố xé toạc một phế tích chôn vùi hàng ngàn năm — thứ bò ra từ khe nứt đó không thuộc về thế giới này.',
    monsters: ['void_wraith', 'void_eye'],
    boss: 'void_lord',
    theme: { floorA: '#182418', floorB: '#1b281b', wall: '#2c3a24', wallTop: '#3d4f30', accent: '#c48bff' },
  },
];

const BY_ID = new Map(ZONES.map((z) => [z.id, z]));

function get(id) {
  return BY_ID.get(id) || null;
}

/** Vùng mặc định cho một cấp — vùng cao nhất mà cấp đó đã mở. */
function defaultFor(level) {
  const lv = level || 1;
  let best = ZONES[0];
  for (const z of ZONES) if (lv >= z.levelMin) best = z;
  return best;
}

const canEnter = (zone, level) => !!zone && (level || 1) >= zone.levelMin;

/** Bản rút gọn gửi cho client dựng màn chọn bản đồ. */
function publicList() {
  return ZONES.map((z) => ({
    id: z.id, name: z.name, desc: z.desc,
    levelMin: z.levelMin, levelMax: z.levelMax,
    boss: z.boss, accent: z.theme.accent,
  }));
}

module.exports = { ZONES, get, defaultFor, canEnter, publicList, all: () => ZONES };
