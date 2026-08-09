'use strict';

/**
 * Lớp nhân vật và tài nguyên.
 *
 * Bốn thanh (theo yêu cầu thiết kế):
 *   HP     — mọi class
 *   Mana   — class dùng phép
 *   Nộ Khí — class dùng lực
 *   Karma  — mọi class
 *
 * Mana và Nộ là cặp phụ thuộc class: Pháp Sư tiêu mana, Chiến Binh tích nộ.
 * Class lai sau này có thể bật cả hai.
 */

const RESOURCE = {
  hp: { id: 'hp', name: 'Máu', color: '#46c46b' },
  mana: { id: 'mana', name: 'Mana', color: '#3f7fd8' },
  rage: { id: 'rage', name: 'Nộ Khí', color: '#d8642f' },
  karma: { id: 'karma', name: 'Karma', color: '#b18cff' },
};

const RAGE_MAX = 100;
const KARMA_MAX = 100;

/**
 * KARMA — 💡 đề xuất, chờ duyệt.
 *
 * Karma tích qua mọi hành động trong trận: gây sát thương, chịu sát thương,
 * hạ gục kẻ địch. Đầy 100 thì mở khoá **Thiên Ân** — một đòn đặc biệt gắn với
 * chính Đặc Ân mà vì sao đã ban cho nhân vật (Thập Nhị Thần Tọa, DESIGN.md §1.2).
 *
 * Vì sao chọn hướng này thay vì làm Karma thành "mana thứ hai":
 *   - Đặc Ân hiện chỉ là hiệu ứng chạy ngầm, người chơi không "cảm" thấy nó.
 *     Cho nó một đòn bấm được sẽ biến thứ ngẫu nhiên lúc tạo nhân vật thành
 *     bản sắc mà người chơi chủ động dùng.
 *   - 12 Đặc Ân → 12 Thiên Ân khác nhau, tự nó tạo ra 12 lối chơi.
 *   - Không phụ thuộc class nên không phá cân bằng giữa Pháp Sư và Chiến Binh.
 *
 * Nếu bạn có ý khác cho Karma, chỉ cần sửa phần này — hạ tầng thanh Karma và
 * cách tích đã chạy sẵn.
 */
const KARMA_GAIN = {
  onDamageDealt: 0.12,   // % Karma trên mỗi 1% máu tối đa của địch bị trừ
  onDamageTaken: 0.18,   // chịu đòn tích nhanh hơn — kẻ bị dồn ép có cửa lật
  onKill: 12,            // cộng thẳng khi hạ gục
  perRound: 3,           // cộng đều mỗi vòng để trận dài luôn dùng được
};

const CLASSES = {
  warrior: {
    id: 'warrior',
    name: 'Chiến Binh',
    role: 'Cận chiến, chịu đòn',
    resources: ['hp', 'rage', 'karma'],
    primary: 'str',
    desc: 'Đánh thường tích Nộ, dùng Nộ tung chiêu mạnh. Vào trận yếu, càng đánh lâu càng mạnh.',
  },
  mage: {
    id: 'mage',
    name: 'Pháp Sư',
    role: 'Sát thương phép tầm xa',
    resources: ['hp', 'mana', 'karma'],
    primary: 'int',
    desc: 'Bùng nổ sát thương sớm, mỏng manh, phải tính toán mana.',
  },
};

/** Chưa chọn class thì hiện cả bốn thanh — người chơi thấy được mình đang thiếu gì. */
const DEFAULT_RESOURCES = ['hp', 'mana', 'rage', 'karma'];

function get(id) {
  return CLASSES[id] || null;
}

function resourcesFor(classId) {
  return get(classId)?.resources || DEFAULT_RESOURCES;
}

module.exports = {
  CLASSES, RESOURCE, RAGE_MAX, KARMA_MAX, KARMA_GAIN, DEFAULT_RESOURCES,
  get, resourcesFor,
  all: () => Object.values(CLASSES),
};
