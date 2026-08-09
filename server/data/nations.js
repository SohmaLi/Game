'use strict';

/**
 * Bốn quốc gia của lục địa Aethelmark.
 *
 * Đặc quyền cố ý giữ ở mức 5–10% và thiên về tiện ích. Nếu một nước mạnh hơn rõ rệt
 * trong chiến đấu thì gần như ai cũng chọn nước đó và ba nước còn lại thành trang trí.
 */

const NATIONS = [
  {
    id: 'corvane',
    name: 'Vương quốc Corvane',
    trait: 'Quân sự, kỵ binh nặng, kỷ luật thép',
    magic: 'Kiểm soát chặt — chỉ quân đội được phép dùng',
    privilege: {
      name: 'Kỷ Luật Thép',
      desc: '+5% Giáp · phí sửa trang bị giảm 30%',
      effect: { armorPercent: 0.05, repairCostPercent: -0.30 },
    },
  },
  {
    id: 'sylvara',
    name: 'Học viện Sylvara',
    trait: 'Thành bang của học giả và pháp sư',
    magic: 'Tôn sùng — nghiên cứu không giới hạn',
    privilege: {
      name: 'Tàng Thư Các',
      desc: '+5% Mana tối đa · học sách Dị Điển rẻ hơn 30%',
      effect: { manaPercent: 0.05, bookCostPercent: -0.30 },
    },
  },
  {
    id: 'duskmoor',
    name: 'Liên minh Duskmoor',
    trait: 'Thương nhân, hải cảng, lính đánh thuê',
    magic: 'Thực dụng — cái gì bán được thì dùng',
    privilege: {
      name: 'Mối Lợi',
      desc: '+10% vàng rơi ra · phí giao dịch giảm 50%',
      effect: { goldPercent: 0.10, tradeFeePercent: -0.50 },
    },
  },
  {
    id: 'vharn',
    name: 'Đất hoang Vharn',
    trait: 'Bộ lạc, không vua, sống cùng thú hoang',
    magic: 'Bản năng, không sách vở',
    privilege: {
      name: 'Bản Năng Hoang Dã',
      desc: '+5% Nhanh Nhẹn · nhận ít hơn 10% sát thương từ Thú Vật',
      effect: { agiPercent: 0.05, beastDamageTaken: -0.10 },
    },
  },
];

const BY_ID = new Map(NATIONS.map((n) => [n.id, n]));

module.exports = {
  NATIONS,
  get: (id) => BY_ID.get(String(id)) || null,
  isValid: (id) => BY_ID.has(String(id)),
  all: () => NATIONS,
};
