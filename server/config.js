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
    // Chậm hơn người chơi (150) để còn chạy thoát được. Quái nhanh bằng người
    // chơi thì không ai né được trận nào, mà né được mới có lựa chọn.
    speed: 62,
    aggroRadius: 120,      // trong tầm này thì quái đuổi theo
    groupRadius: 95,       // quái trong bán kính này cùng nhảy vào trận
    respawnMs: 20_000,
    wanderMinMs: 1_200,
    wanderMaxMs: 3_200,
    // Sau khi ra khỏi trận, người chơi được miễn va chạm một lúc để không bị
    // kéo vào trận mới ngay tại chỗ vừa đánh xong
    graceMs: 3_000,
  },
};
