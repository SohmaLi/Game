'use strict';

/**
 * Lớp nhân vật và tài nguyên.
 *
 * Bốn thanh, chỉ HP là chung cho mọi class — ba thanh còn lại gắn với hướng
 * sức mạnh của class:
 *
 *   HP     · mọi class
 *   Mana   · class phép thuật   — hồi đều theo Ý Chí, tiêu khi tung chiêu
 *   Nộ Khí · class sức lực      — tích khi đánh và khi bị đánh, TỰ NGUỘI DẦN
 *   Karma  · class bóng tối     — tích khi GIẾT, TỰ TAN DẦN
 *
 * Nộ và Karma khác Mana ở chỗ chúng **không giữ được**. Mana đầy thì cứ nằm đó
 * chờ dùng; Nộ và Karma thì tụt liên tục, nên người chơi phải tiêu ngay hoặc
 * mất — điều này ép hai lối chơi đó phải hung hăng và giữ nhịp, thay vì tích
 * đầy rồi ngồi chờ thời cơ như Pháp Sư.
 */

const RESOURCE = {
  hp: { id: 'hp', name: 'Máu', short: 'HP', color: '#46c46b' },
  mana: { id: 'mana', name: 'Mana', short: 'MP', color: '#3f7fd8' },
  rage: { id: 'rage', name: 'Nộ Khí', short: 'NỘ', color: '#d8642f' },
  karma: { id: 'karma', name: 'Karma', short: 'KARMA', color: '#b18cff' },
};

const RAGE_MAX = 100;
const KARMA_MAX = 100;

/**
 * Tốc độ tan của Nộ và Karma.
 *
 * Trong trận tính theo VÒNG, ngoài trận tính theo GIÂY. Hai đơn vị khác nhau
 * vì "thời gian" ở hai chế độ là hai thứ khác nhau — một vòng turn-based có
 * thể kéo dài 20 giây thực nhưng chỉ là một nhịp trong trận.
 */
const DECAY = {
  rage: {
    /**
     * Trong trận chỉ tan nhẹ. Đo thực tế cho thấy tan 6/vòng khiến Nộ chỉ
     * tăng ròng 8 mỗi vòng — Chém Mạnh giá 25 phải đợi tới vòng 4, mà trận
     * với quái thường chỉ kéo dài 3–5 vòng, nên chiêu đặc trưng của Chiến
     * Binh gần như không bao giờ dùng được.
     *
     * Ngoài trận thì tan nhanh, để Nộ không mang được từ trận này sang trận
     * khác mà không phải đánh gì.
     */
    perRound: 4,
    perSecond: 6,
  },
  karma: {
    // Karma tan chậm hơn Nộ: nó đổi bằng mạng sống của kẻ địch, mất quá nhanh
    // thì công sức săn giết thành vô nghĩa
    perRound: 3,
    perSecond: 1.5,
  },
};

/** Nộ tích khi đánh và khi bị đánh. */
const RAGE_GAIN = {
  onHitDealt: 16,    // cộng khi ra đòn thường (khai báo trên từng kỹ năng)
  onDamageTaken: 8,  // cộng khi ăn đòn — càng bị dồn ép càng nổi giận
};

/** Karma chỉ tích khi hạ gục — không tích từ sát thương. */
const KARMA_GAIN = {
  onKillMonster: 25,
  onKillPlayer: 40,  // PvP sau này
};

const CLASSES = {
  warrior: {
    id: 'warrior',
    name: 'Chiến Binh',
    archetype: 'might',
    role: 'Cận chiến, chịu đòn',
    resources: ['hp', 'rage'],
    primary: 'str',
    desc: 'Đánh thường tích Nộ, dùng Nộ tung chiêu mạnh. Nộ nguội dần nên phải đánh liên tục.',
  },
  mage: {
    id: 'mage',
    name: 'Pháp Sư',
    archetype: 'arcane',
    role: 'Sát thương phép tầm xa',
    resources: ['hp', 'mana'],
    primary: 'int',
    desc: 'Bùng nổ sát thương sớm, mỏng manh, phải tính toán mana.',
  },
};

/**
 * Chưa có class nào dùng Karma — nó dành cho nhánh **bóng tối** sẽ thêm sau
 * (ví dụ Ám Sát Giả, Tử Linh Sư). Toàn bộ cơ chế tích và tan của Karma đã
 * chạy sẵn, thêm class chỉ cần khai `resources: ['hp', 'karma']`.
 */
const ARCHETYPE_RESOURCE = { might: 'rage', arcane: 'mana', dark: 'karma' };

/** Chưa chọn class thì hiện cả bốn thanh — người chơi thấy được hệ thống có gì. */
const DEFAULT_RESOURCES = ['hp', 'mana', 'rage', 'karma'];

function get(id) {
  return CLASSES[id] || null;
}

function resourcesFor(classId) {
  return get(classId)?.resources || DEFAULT_RESOURCES;
}

function uses(classId, resource) {
  return resourcesFor(classId).includes(resource);
}

module.exports = {
  CLASSES, RESOURCE, RAGE_MAX, KARMA_MAX, DECAY, RAGE_GAIN, KARMA_GAIN,
  ARCHETYPE_RESOURCE, DEFAULT_RESOURCES,
  get, resourcesFor, uses,
  all: () => Object.values(CLASSES),
};
