'use strict';

/**
 * Mười Hai Đặc Ân — Thập Nhị Thần Tọa.
 *
 * Người chơi bốc ngẫu nhiên một đặc ân lúc tạo nhân vật, được rút lại tối đa 3 lần,
 * sau đó khóa vĩnh viễn.
 *
 * Nguyên tắc: không đặc ân nào khóa class. Cả 12 đều dùng được cho mọi class,
 * chỉ nghiêng khác nhau. Trường `effect` là dữ liệu thuần để hệ chiến đấu đọc —
 * không nhét logic vào đây.
 */

const BOONS = [
  {
    id: 1, star: 'Lưỡi Kiếm', name: 'Song Kích', role: 'cong',
    desc: '15% cơ hội đòn đánh thường ra hai lần.',
    effect: { type: 'doubleStrike', chance: 0.15 },
  },
  {
    id: 2, star: 'Ngọn Lửa', name: 'Cuồng Nộ', role: 'cong',
    desc: 'Máu càng thấp sát thương càng cao, tối đa +30% khi dưới 30% HP.',
    effect: { type: 'lowHpDamage', maxBonus: 0.30, threshold: 0.30 },
  },
  {
    id: 3, star: 'Mũi Tên', name: 'Chí Mạng', role: 'cong',
    desc: '+10% tỉ lệ chí mạng, +25% sát thương chí mạng.',
    effect: { type: 'crit', chance: 0.10, damage: 0.25 },
  },
  {
    id: 4, star: 'Rắn Độc', name: 'Xâm Thực', role: 'cong',
    desc: 'Đòn đánh gây thêm sát thương theo thời gian, cộng dồn tối đa 3 lớp.',
    effect: { type: 'dot', percent: 0.08, duration: 3, maxStacks: 3 },
  },
  {
    id: 5, star: 'Tấm Khiên', name: 'Kiên Định', role: 'thu',
    desc: 'Giảm 12% sát thương vật lý nhận vào.',
    effect: { type: 'physicalReduction', percent: 0.12 },
  },
  {
    id: 6, star: 'Vòng Nguyệt Quế', name: 'Hộ Tâm', role: 'thu',
    desc: 'Giảm 12% sát thương phép nhận vào.',
    effect: { type: 'magicReduction', percent: 0.12 },
  },
  {
    id: 7, star: 'Gương Bạc', name: 'Phản Phệ', role: 'thu',
    desc: 'Dội lại 15% sát thương nhận được cho kẻ tấn công.',
    effect: { type: 'reflect', percent: 0.15 },
  },
  {
    id: 8, star: 'Phượng Hoàng', name: 'Bất Diệt', role: 'thu',
    desc: 'Một lần mỗi trận, hồi sinh với 25% HP khi gục.',
    effect: { type: 'revive', hpPercent: 0.25, perBattle: 1 },
  },
  {
    id: 9, star: 'Cánh Gió', name: 'Tốc Hành', role: 'tienich',
    desc: '+15% Nhanh Nhẹn — đi trước trong thứ tự lượt.',
    effect: { type: 'statPercent', stat: 'agi', percent: 0.15 },
  },
  {
    id: 10, star: 'Bàn Tay Vàng', name: 'Duyên Kho Báu', role: 'tienich',
    desc: '+50% tỉ lệ rơi đồ. Sách Dị Điển từ 5% lên 7.5%.',
    effect: { type: 'dropRate', multiplier: 1.5 },
  },
  {
    id: 11, star: 'Suối Nguồn', name: 'Cộng Hưởng', role: 'hotro',
    desc: 'Giảm 20% mana tiêu hao của kỹ năng chủ động.',
    effect: { type: 'manaCost', percent: -0.20 },
  },
  {
    id: 12, star: 'Vòng Tay', name: 'Đồng Cảm', role: 'hotro',
    desc: 'Hồi 3% HP cho toàn đội mỗi lượt. Chỉ có tác dụng khi đi nhóm.',
    effect: { type: 'partyRegen', percent: 0.03, requiresParty: true },
  },
];

const BY_ID = new Map(BOONS.map((b) => [b.id, b]));

/** Số lần được rút lại trước khi khóa vĩnh viễn. */
const MAX_REROLLS = 3;

function get(id) {
  return BY_ID.get(Number(id)) || null;
}

/** Bốc ngẫu nhiên. Tất cả đặc ân có xác suất bằng nhau — không có cái nào hiếm hơn. */
function roll(excludeId = null) {
  const pool = excludeId ? BOONS.filter((b) => b.id !== excludeId) : BOONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Bản rút gọn để gửi xuống client — không lộ chi tiết công thức. */
function publicView(b) {
  return b && { id: b.id, star: b.star, name: b.name, desc: b.desc, role: b.role };
}

module.exports = { BOONS, MAX_REROLLS, get, roll, publicView, all: () => BOONS.map(publicView) };
