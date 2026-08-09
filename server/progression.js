'use strict';

/**
 * Cấp độ, kinh nghiệm và điểm chỉ số.
 *
 * Đường cong: mỗi cấp cần nhiều hơn cấp trước theo lũy thừa 1.55. Chọn số này
 * để những cấp đầu lên rất nhanh (người chơi mới thấy tiến bộ ngay trong vài
 * phút đầu), rồi chậm dần lại.
 */

const MAX_LEVEL = 60;
const STAT_POINTS_PER_LEVEL = 3;

/** Kinh nghiệm cần để từ `level` lên `level + 1`. */
function expToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(30 * Math.pow(level, 1.55) + 20 * level);
}

/**
 * Cộng kinh nghiệm, tự lên cấp nếu đủ.
 * Trả về thông tin để client hiện hoạt cảnh lên cấp.
 */
function addExp(char, amount) {
  const gained = Math.max(0, Math.round(amount));
  let levelsGained = 0;
  let pointsGained = 0;

  char.exp = (char.exp || 0) + gained;

  while (char.level < MAX_LEVEL && char.exp >= expToNext(char.level)) {
    char.exp -= expToNext(char.level);
    char.level++;
    levelsGained++;
    pointsGained += STAT_POINTS_PER_LEVEL;
  }

  char.statPoints = (char.statPoints || 0) + pointsGained;
  if (char.level >= MAX_LEVEL) char.exp = 0;

  return {
    gained,
    levelsGained,
    pointsGained,
    level: char.level,
    exp: char.exp,
    expNeeded: expToNext(char.level),
  };
}

/** Người chơi tự phân bổ điểm. Trả về null nếu không hợp lệ. */
function spendStatPoint(char, stat) {
  const valid = ['str', 'int', 'vit', 'agi', 'wil'];
  if (!valid.includes(stat)) return null;
  if ((char.statPoints || 0) <= 0) return null;

  char.stats[stat]++;
  char.statPoints--;
  return { stat, value: char.stats[stat], remaining: char.statPoints };
}

/** Mốc được phép đổi class (DESIGN.md §3.2). */
const CLASS_CHANGE_LEVELS = [10, 25, 50];

module.exports = {
  MAX_LEVEL, STAT_POINTS_PER_LEVEL, CLASS_CHANGE_LEVELS,
  expToNext, addExp, spendStatPoint,
};
