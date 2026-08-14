'use strict';

/**
 * Vùng bản đồ — 1 vùng an toàn + 6 vùng săn quái phủ kín cấp 1 tới 60.
 *
 * Vùng là thứ chia người chơi ra: mỗi vùng có phòng riêng, quái riêng, Thủ Lĩnh
 * riêng và bản đồ riêng. Người chơi tự chọn vùng trước khi vào game.
 *
 * `levelMin` vừa là điều kiện vào, vừa là cấp thấp nhất của quái trong vùng.
 * Không chặn người cấp cao quay về vùng thấp — muốn đi dạo chỗ dễ là quyền của
 * họ, chỉ có điều phần thưởng ở đó bèo bọt.
 *
 * `safe: true` là vùng KHÔNG có quái và KHÔNG có Thủ Lĩnh — chỗ để đứng buôn
 * bán và sắp xếp đồ đạc mà không bị con nào kéo vào trận giữa chừng. Phòng của
 * vùng an toàn bỏ qua toàn bộ phần sinh quái (xem server/room.js).
 *
 * `elites` là quái hạng Tinh Anh đi lang thang lẫn với quái thường, nhưng chỉ
 * vài con cùng lúc (`ROAMER.eliteMax`). Danh sách riêng chứ không trộn vào
 * `monsters`: trộn chung thì mỗi lần đổ đầy bản đồ lại bốc trúng vài con, và
 * "đáng để tìm" biến thành "đi đâu cũng vấp phải".
 *
 * `seed` quyết định hình dạng bản đồ (server/map.js). Đổi seed là đổi bản đồ,
 * nên một khi đã có người chơi thì đừng đụng vào.
 */

const ZONES = [
  /**
   * Đứng ĐẦU danh sách để màn chọn bản đồ mở ra là thấy ngay chỗ về nhà.
   *
   * Vị trí này cũng an toàn với `defaultFor`: hàm đó bỏ qua vùng an toàn, nếu
   * không thì nó là vùng cấp-1 cuối cùng khớp điều kiện và mọi người chơi không
   * chọn bản đồ đều bị thả vào thị trấn thay vì ra đồng cỏ.
   */
  {
    id: 'duskmoor', name: 'Bến Cảng Duskmoor',
    levelMin: 1, levelMax: 60, seed: 7_777,
    difficulty: 0,   // không có quái nên không rơi gì — khai cho khỏi phải đoán
    safe: true,
    desc: 'Không có gì ngoài kia bò được qua cổng thành. Chỗ duy nhất trên lục địa mà cất kiếm đi vẫn sống.',
    monsters: [],
    boss: null,
    npcs: ['merchant', 'scribe'],
    theme: { floorA: '#2a2318', floorB: '#2e2719', wall: '#4a3a22', wallTop: '#66502f', accent: '#ffd166' },
  },
  {
    id: 'meadow', name: 'Đồng Cỏ Thanh Bình',
    levelMin: 1, levelMax: 10, seed: 1_337,
    difficulty: 1,   // phẩm chất đồ rơi — xem QUALITY_STEP
    desc: 'Cỏ cao tới gối và những con sói chưa biết sợ người.',
    monsters: ['grey_wolf', 'bandit'],
    elites: ['cliff_bear'],
    boss: 'alpha_wolf',
    theme: { floorA: '#141a27', floorB: '#161c2a', wall: '#28324a', wallTop: '#35415e', accent: '#7ee89a' },
  },
  {
    id: 'mistwood', name: 'Rừng Sương Mù',
    levelMin: 11, levelMax: 20, seed: 4_211,
    difficulty: 2,   // phẩm chất đồ rơi — xem QUALITY_STEP
    desc: 'Sương dày tới mức không thấy thứ đang bò trên cây.',
    monsters: ['mist_spider', 'grey_wolf', 'bandit'],
    elites: ['fog_reaver'],
    boss: 'spider_matron',
    theme: { floorA: '#131f1c', floorB: '#152321', wall: '#24463c', wallTop: '#2f5c4d', accent: '#69d6a0' },
  },
  {
    id: 'bonewaste', name: 'Hoang Mạc Xương Trắng',
    levelMin: 21, levelMax: 30, seed: 9_090,
    difficulty: 3,   // phẩm chất đồ rơi — xem QUALITY_STEP
    desc: 'Cát ở đây trắng vì nó không phải cát.',
    monsters: ['skeleton', 'bone_archer'],
    elites: ['bone_champion'],
    boss: 'bone_general',
    theme: { floorA: '#241f18', floorB: '#28231b', wall: '#4a4132', wallTop: '#655944', accent: '#e8d9a8' },
  },
  {
    id: 'frostmaw', name: 'Vực Băng Vĩnh Cửu',
    levelMin: 31, levelMax: 40, seed: 15_517,
    difficulty: 4,   // phẩm chất đồ rơi — xem QUALITY_STEP
    desc: 'Lạnh đến mức tiếng động cũng đóng băng giữa chừng.',
    monsters: ['frost_revenant', 'bone_archer'],
    elites: ['frost_warden'],
    boss: 'ice_troll',
    theme: { floorA: '#151e2c', floorB: '#182333', wall: '#2b4665', wallTop: '#3c6089', accent: '#8fd4ff' },
  },
  {
    id: 'stormpeak', name: 'Đỉnh Bão Tố',
    levelMin: 41, levelMax: 50, seed: 27_733,
    difficulty: 5,   // phẩm chất đồ rơi — xem QUALITY_STEP
    desc: 'Nơi cao nhất lục địa, và cũng là nơi ít người trở về nhất.',
    monsters: ['storm_cultist', 'frost_revenant'],
    elites: ['thunder_zealot'],
    boss: 'storm_herald',
    theme: { floorA: '#1d1729', floorB: '#211a2f', wall: '#3d2b5c', wallTop: '#553d7d', accent: '#c4a2ff' },
  },
  {
    id: 'voidshrine', name: 'Đền Đài Hư Không',
    levelMin: 51, levelMax: 60, seed: 51_601,
    difficulty: 6,   // phẩm chất đồ rơi — xem QUALITY_STEP
    desc: 'Bão Tố xé toạc một phế tích chôn vùi hàng ngàn năm — thứ bò ra từ khe nứt đó không thuộc về thế giới này.',
    monsters: ['void_wraith', 'void_eye'],
    elites: ['void_sentinel'],
    boss: 'void_lord',
    theme: { floorA: '#182418', floorB: '#1b281b', wall: '#2c3a24', wallTop: '#3d4f30', accent: '#c48bff' },
  },
];

/**
 * PHẨM CHẤT ĐỒ RƠI THEO VÙNG (DESIGN.md §6.1b).
 *
 * Cấp món đồ bám theo **cấp người chơi**, còn **hạng** thì bám theo vùng. Hai
 * thứ tách nhau vì chúng trả lời hai câu khác nhau: cấp là "món này có dùng
 * được không", hạng là "món này có đáng không".
 *
 * Trước đây cả hai đều bám theo con quái, nên một người cấp 60 đi ngang Đồng Cỏ
 * nhặt được toàn đồ cấp 5 — rác tuyệt đối, nhặt lên chỉ để vứt. Còn bây giờ
 * vùng dễ vẫn cho đồ mặc được, chỉ là gần như không bao giờ lên hạng cao; muốn
 * đồ Sử Thi với Truyền Thuyết thì phải đi vào chỗ khó.
 *
 * Hệ số nhân vào trọng số của Hiếm · Sử Thi · Truyền Thuyết, cùng chỗ với Duyên
 * Kho Báu. Bảng tỉ lệ thật đo bằng `tools/simulate.js`, ghi ở DESIGN.md §6.1b.
 */
const QUALITY_STEP = 0.45;
const qualityOf = (zone) => 1 + Math.max(0, (zone?.difficulty || 1) - 1) * QUALITY_STEP;

const BY_ID = new Map(ZONES.map((z) => [z.id, z]));

function get(id) {
  return BY_ID.get(id) || null;
}

/**
 * Vùng mặc định cho một cấp — vùng SĂN QUÁI cao nhất mà cấp đó đã mở.
 *
 * Bỏ qua vùng an toàn: nó mở từ cấp 1 nên nếu tính vào đây thì ai không chọn
 * bản đồ cũng bị thả vào thị trấn, nơi không có gì để đánh.
 */
function defaultFor(level) {
  const lv = level || 1;
  const wild = ZONES.filter((z) => !z.safe);
  let best = wild[0];
  for (const z of wild) if (lv >= z.levelMin) best = z;
  return best;
}

const canEnter = (zone, level) => !!zone && (level || 1) >= zone.levelMin;

/** Bản rút gọn gửi cho client dựng màn chọn bản đồ. */
function publicList() {
  return ZONES.map((z) => ({
    id: z.id, name: z.name, desc: z.desc,
    levelMin: z.levelMin, levelMax: z.levelMax,
    boss: z.boss, accent: z.theme.accent,
    safe: !!z.safe,
  }));
}

module.exports = {
  ZONES, QUALITY_STEP, qualityOf,
  get, defaultFor, canEnter, publicList, all: () => ZONES,
};
