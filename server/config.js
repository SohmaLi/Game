'use strict';

/**
 * Cấu hình tập trung. Mọi hằng số điều chỉnh gameplay và mạng đều nằm ở đây
 * để không phải đi lục trong logic.
 */

const TILE = 32;

module.exports = {
  // ---- Mạng ----
  TICK_HZ: 15,              // số lần server cập nhật thế giới mỗi giây
  BROADCAST_HZ: 15,         // số lần gửi trạng thái về client mỗi giây
  MAX_NAME_LEN: 16,

  // ---- Bản đồ ----
  TILE,
  MAP_W: 40,                // số ô ngang
  MAP_H: 30,                // số ô dọc

  // ---- Người chơi ----
  PLAYER_SPEED: 150,        // pixel mỗi giây
  PLAYER_RADIUS: 12,

  // ---- Phòng ----
  ROOM_TYPES: {
    pve: { label: 'PvE', maxPlayers: 5 },
    pvp: { label: 'PvP', maxPlayers: 10 },
  },

  // Sau bao lâu không có người thì hủy phòng (ms)
  ROOM_EMPTY_TTL: 30_000,

  // ---- Quái đi lang thang trên bản đồ ----
  ROAMER: {
    count: 6,              // số quái cùng lúc trên bản đồ mỗi phòng
    radius: 11,
    // Chậm hơn người chơi (150) rất nhiều để còn chạy thoát được. Ở mức 62 thì
    // quái bám dai tới mức đi ngang bản đồ gần như chắc chắn dính trận.
    speed: 44,
    aggroRadius: 120,      // trong tầm này thì quái đuổi theo
    groupRadius: 95,       // quái trong bán kính này cùng nhảy vào trận
    respawnMs: 20_000,
    wanderMinMs: 1_200,
    wanderMaxMs: 3_200,
    // Quái vừa hiện ra thì chưa đụng vào ai được — nếu không, một con sinh ngay
    // dưới chân người chơi là kéo họ vào trận trước khi kịp nhìn thấy nó.
    spawnImmuneMs: 5_000,
    // Sau khi ra khỏi trận, người chơi được miễn va chạm một lúc để không bị
    // kéo vào trận mới ngay tại chỗ vừa đánh xong
    graceMs: 5_000,
  },

  // ---- Thủ Lĩnh (boss) ----
  BOSS: {
    intervalMs: 300_000,   // 5 phút một lần
    despawnMs: 180_000,    // không ai hạ trong 3 phút thì nó bỏ đi
    spawnImmuneMs: 5_000,
    radius: 17,
    speed: 34,             // to xác nên đi chậm, thấy là còn kịp tránh
    aggroRadius: 150,
    // Trận Thủ Lĩnh KHÔNG cần nhóm: ai chạm vào cũng nhảy được vào trận đang
    // diễn ra. Trần này chặn trường hợp cả server đổ dồn vào một con.
    maxPlayers: 10,
  },
};
