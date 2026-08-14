'use strict';

const zones = require('./zones');
const monsterData = require('./monsters');
const progression = require('../progression');

/**
 * Nhiệm vụ (DESIGN.md §8b).
 *
 * Ba loại: việc vùng · việc hàng ngày · cột mốc. Cả ba dùng chung đúng một bộ
 * máy đếm cộng dồn trong `server/quests.js` — ở đây chỉ có ĐỊNH NGHĨA.
 *
 * Mỗi mục tiêu phải khớp với một chỗ server VỐN ĐÃ quan sát được. Không thêm
 * đường theo dõi mới nào chỉ để phục vụ nhiệm vụ, vì mỗi đường theo dõi là một
 * chỗ nữa để quên cập nhật.
 *
 *   kill  — hạ N con một bản mẫu cụ thể   (battle.finish → killed)
 *   tier  — hạ N con hạng Tinh Anh/Thủ Lĩnh (cùng chỗ, đọc tier)
 *   level — đạt cấp N                      (progression.addExp)
 *   codex — gắn đủ N ô Dị Điển             (p.codex)
 *   equip — mặc đủ N ô trang bị            (p.inv.equipped)
 */

/* ------------------------------------------------------------ thưởng ----- */

/**
 * Kinh nghiệm tính theo cấp TRẦN CỦA VÙNG, không theo cấp người chơi.
 *
 * Theo cấp người chơi thì một người cấp 60 quay về Đồng Cỏ làm ba việc vùng ở đó
 * sẽ nhận kinh nghiệm cấp 60 cho việc hạ hai chục con sói cấp 5 — vùng thấp biến
 * thành đường tắt lên cấp nhanh nhất game.
 */
const zoneExp = (levelMax, share) => Math.round(progression.expToNext(levelMax) * share);
const zoneGold = (levelMax, mult) => Math.round(40 * levelMax * mult);

/* -------------------------------------------------------- việc vùng ------ */

/**
 * Ba việc mỗi vùng săn, theo đúng một khuôn: dọn quái thường → hạ Tinh Anh →
 * hạ Thủ Lĩnh. Khuôn cố định chứ không mỗi vùng một kiểu, vì nó dạy người chơi
 * thứ tự tiếp cận một vùng mới: đánh cho quen tay, rồi thử con đi lẻ có quầng
 * tím, rồi mới gọi người đánh Thủ Lĩnh.
 */
const ZONE_QUEST_FLAVOR = {
  meadow: [
    ['Cỏ cao che mắt', 'Đàn sói ở đây chưa biết sợ người. Dạy chúng biết.'],
    ['Con gấu trên vách', 'Có thứ to hơn sói đang đi một mình quanh vách đá.'],
    ['Kẻ đứng đầu đàn', 'Cả đồng cỏ im tiếng mỗi lần nó hú.'],
  ],
  mistwood: [
    ['Thứ bò trên cây', 'Sương dày tới mức không thấy gì — cứ đi rồi sẽ chạm phải.'],
    ['Lưỡi dao trong sương', 'Có kẻ dùng sương mù làm áo choàng.'],
    ['Mẹ của cả tổ', 'Đi theo sợi tơ dày nhất, nó dẫn tới nơi cần tới.'],
  ],
  bonewaste: [
    ['Cát không phải cát', 'Mỗi bước đi là một tiếng vỡ. Đừng nghĩ về nó.'],
    ['Bộ giáp còn nguyên', 'Có một bộ xương mặc giáp tốt hơn cả người sống.'],
    ['Kẻ dựng đội hình', 'Xương ở đây không tự đứng lên. Có ai đó gọi chúng.'],
  ],
  frostmaw: [
    ['Tiếng động đóng băng', 'Lạnh đến mức không nghe được thứ đang tới sau lưng.'],
    ['Người canh băng giá', 'Nó không đuổi ai. Nó chỉ đứng đó, và không cho đi qua.'],
    ['Thứ trong hang sâu', 'Vết máu trên tuyết dẫn vào trong. Chỉ có một chiều.'],
  ],
  stormpeak: [
    ['Nơi ít người trở về', 'Không khí loãng, sét đánh liên tục, và có kẻ thờ nó.'],
    ['Kẻ mang sấm', 'Nó gọi sét xuống như gọi một con vật đã thuần.'],
    ['Con mắt của bão', 'Giữa cơn bão có một chỗ yên tĩnh. Nó ở đó.'],
  ],
  voidshrine: [
    ['Thứ không thuộc về đây', 'Bão Tố xé toạc phế tích, và có gì đó bò ra.'],
    ['Kẻ canh khe nứt', 'Nó không sống, cũng không chết. Nó chỉ canh.'],
    ['Cõi trống rỗng', 'Đi tới cuối đền là hết đường. Cả nghĩa đen lẫn nghĩa kia.'],
  ],
};

/** Số quái thường phải hạ ở việc thứ nhất của mỗi vùng. */
const CLEAR_COUNT = 20;

function buildZoneQuests() {
  const out = [];

  for (const z of zones.ZONES) {
    if (z.safe) continue;
    const flavor = ZONE_QUEST_FLAVOR[z.id];
    if (!flavor) throw new Error(`Vùng ${z.id} chưa có lời dẫn nhiệm vụ`);

    const L = z.levelMax;
    const firstMob = monsterData.get(z.monsters[0]);
    const elite = monsterData.get(z.elites[0]);
    const boss = monsterData.get(z.boss);

    out.push({
      id: `${z.id}_clear`, kind: 'zone', zone: z.id,
      name: flavor[0][0], desc: flavor[0][1],
      goal: { type: 'kill', monster: firstMob.id, count: CLEAR_COUNT },
      reward: { gold: zoneGold(L, 1), exp: zoneExp(L, 0.5) },
    });

    out.push({
      id: `${z.id}_elite`, kind: 'zone', zone: z.id,
      name: flavor[1][0], desc: flavor[1][1],
      goal: { type: 'kill', monster: elite.id, count: 3 },
      reward: { gold: zoneGold(L, 1.5), exp: zoneExp(L, 0.75) },
    });

    out.push({
      id: `${z.id}_boss`, kind: 'zone', zone: z.id,
      name: flavor[2][0], desc: flavor[2][1],
      goal: { type: 'kill', monster: boss.id, count: 1 },
      // Thủ Lĩnh 5 phút mới có một con, và phải gọi người đánh chung — trả bằng
      // một cuốn Dị Điển chứ không chỉ vàng
      reward: { gold: zoneGold(L, 3), exp: zoneExp(L, 1), book: 'boss' },
    });
  }
  return out;
}

/* ---------------------------------------------------- việc hàng ngày ----- */

/**
 * Khuôn việc hàng ngày. Mỗi ngày bốc 3 khuôn, hạt giống buộc vào (nhân vật,
 * ngày) — cùng cơ chế với quầy hàng thương nhân, và cùng lý do: thoát ra vào
 * lại vẫn thấy đúng ba việc cũ, không biến thành máy quay xổ số.
 *
 * `scale` nhân vào mốc cần đạt theo cấp người chơi, để một việc "hạ 12 con" ở
 * cấp 5 và ở cấp 60 đều mất khoảng cùng số phút.
 */
const DAILY_TEMPLATES = [
  {
    id: 'd_clear', name: 'Dọn đường',
    desc: 'Hạ {count} con quái thường ở bất cứ vùng nào.',
    goal: { type: 'tier', tier: 'common', count: 25 },
  },
  {
    id: 'd_elite', name: 'Con đi một mình',
    desc: 'Hạ {count} con Tinh Anh — loại có quầng tím, đi lẻ.',
    goal: { type: 'tier', tier: 'elite', count: 3 },
  },
  {
    id: 'd_boss', name: 'Kẻ chặn đường',
    desc: 'Hạ {count} Thủ Lĩnh. Không cần cùng nhóm, ai chạm vào cũng đánh được.',
    goal: { type: 'tier', tier: 'boss', count: 1 },
  },
  {
    id: 'd_hunt', name: 'Đi xa hơn',
    desc: 'Hạ {count} con quái bất kỳ hạng nào.',
    goal: { type: 'tier', tier: 'any', count: 40 },
  },
];

/* ------------------------------------------------------- cột mốc --------- */

/**
 * Việc cả đời nhân vật — mục tiêu dài hạn, không làm lại được.
 *
 * Đây là chỗ duy nhất trong game nói ra thành lời rằng mười ô Dị Điển và mười ô
 * trang bị là thứ ĐÁNG lấp đầy. Trước đây người chơi phải tự đoán.
 */
const MILESTONES = [
  {
    id: 'm_level20', kind: 'milestone', name: 'Qua chặng đầu',
    desc: 'Đạt cấp 20 — chặng mà Cây Nền bắt đầu dư điểm.',
    goal: { type: 'level', level: 20 },
    reward: { gold: 3000, exp: 0 },
  },
  {
    id: 'm_level40', kind: 'milestone', name: 'Nửa đường',
    desc: 'Đạt cấp 40 — từ đây điểm kỹ năng phải dồn vào Tinh Thông.',
    goal: { type: 'level', level: 40 },
    reward: { gold: 12000, exp: 0 },
  },
  {
    id: 'm_level60', kind: 'milestone', name: 'Cấp trần',
    desc: 'Đạt cấp 60. Không còn cấp nào nữa — chỉ còn đồ và kỹ năng.',
    goal: { type: 'level', level: 60 },
    reward: { gold: 40000, exp: 0, book: 'boss' },
  },
  {
    id: 'm_equip', kind: 'milestone', name: 'Đủ bộ',
    desc: 'Mặc kín cả 10 ô trang bị cùng lúc.',
    goal: { type: 'equip', slots: 10 },
    reward: { gold: 6000, exp: 0 },
  },
  {
    id: 'm_codex5', kind: 'milestone', name: 'Nửa quyển Dị Điển',
    desc: 'Gắn sách vào 5 ô Dị Điển.',
    goal: { type: 'codex', slots: 5 },
    reward: { gold: 8000, exp: 0 },
  },
  {
    id: 'm_codex10', kind: 'milestone', name: 'Trọn quyển Dị Điển',
    desc: 'Gắn kín cả 10 ô. Mỗi ô một kỹ năng khác nhau.',
    goal: { type: 'codex', slots: 10 },
    reward: { gold: 25000, exp: 0, book: 'boss' },
  },
  {
    id: 'm_elites', kind: 'milestone', name: 'Kẻ săn Tinh Anh',
    desc: 'Hạ 50 con Tinh Anh, cộng dồn cả đời nhân vật.',
    goal: { type: 'tier', tier: 'elite', count: 50 },
    reward: { gold: 15000, exp: 0 },
  },
  {
    id: 'm_bosses', kind: 'milestone', name: 'Sáu kẻ chặn đường',
    desc: 'Hạ 6 Thủ Lĩnh, cộng dồn — không cần khác loài.',
    goal: { type: 'tier', tier: 'boss', count: 6 },
    reward: { gold: 20000, exp: 0, book: 'boss' },
  },
];

/* ------------------------------------------------------------ tra cứu ---- */

const ZONE_QUESTS = buildZoneQuests();
const ALL = [...ZONE_QUESTS, ...MILESTONES];
const BY_ID = new Map(ALL.map((q) => [q.id, q]));
const DAILY_BY_ID = new Map(DAILY_TEMPLATES.map((t) => [t.id, t]));

module.exports = {
  ZONE_QUESTS, MILESTONES, DAILY_TEMPLATES, CLEAR_COUNT,
  ALL,
  get: (id) => BY_ID.get(id) || null,
  daily: (id) => DAILY_BY_ID.get(id) || null,
  zoneGold, zoneExp,
};
