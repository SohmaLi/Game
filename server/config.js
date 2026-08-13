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
    /**
     * Số quái cùng lúc trên bản đồ mỗi phòng.
     *
     * Đo trên bản đồ 40×30 ô: ở mức 15, xác suất có ít nhất một con phát hiện
     * ra bạn khi đứng tại một chỗ ngẫu nhiên là 47% (mức 6 chỉ 23%) — bản đồ
     * sống hẳn lên. Rủi ro bị vây thì tăng chậm hơn nhiều: 11% gặp hai con, 2%
     * gặp ba con, so với 4% và 0% ở mức 6. Một mình đánh hai con ở cấp trần
     * vùng vẫn thắng 87–99%, nên không phải bù trừ ở chỗ nào khác.
     */
    count: 15,
    /**
     * Trần quái Tinh Anh cùng lúc — phần còn lại luôn là hạng Thường.
     *
     * 2 trên 15 là đủ để đi một vòng bản đồ thì gặp, mà không đủ để thành quái
     * nền. Tinh Anh có máu ×2.2 và sát thương ×1.5: rải nhiều hơn thì vùng nào
     * cũng hoá thành chỗ chỉ dành cho người đi nhóm.
     */
    eliteMax: 2,
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

  // ---- Quái Tinh Anh ----
  ELITE: {
    // To hơn quái thường (11) nhưng chưa bằng Thủ Lĩnh (17) — nhìn cái bóng là
    // đủ biết mình đang đứng trước con gì
    radius: 14,
    speed: 38,             // chậm hơn quái thường: chạy là thoát được
    aggroRadius: 135,
    spawnImmuneMs: 5_000,
  },

  // ---- Cái giá của thất bại ----
  DEATH: {
    /**
     * Mất bao nhiêu phần kinh nghiệm CỦA CẤP HIỆN TẠI khi thua trận.
     *
     * Đo bằng `tools/simulate.js` chứ không đoán: một trận 2 quái ở cấp trần của
     * vùng cho 13–20% kinh nghiệm một cấp, nên 10% ≈ đúng công của một trận vừa
     * đánh — từ 0,25 trận ở cấp 1 tới 0,9 trận ở cấp 20. Đủ để phải cân nhắc bấm
     * Trốn thoát, chưa tới mức thua một lần là muốn tắt game.
     *
     * KHÔNG bao giờ tụt cấp: trừ tới 0 rồi dừng. Người vừa lên cấp xong mà thua
     * thì mất trắng 0 — cố ý, đó đúng là lúc họ đang đi thử một vùng mới.
     */
    expLossPct: 0.10,

    /**
     * Miễn va chạm sau khi hồi sinh — dài hơn lúc thắng (`ROAMER.graceMs` = 5s).
     * Người vừa thua bị thả xuống một chỗ lạ giữa bản đồ; chưa kịp nhìn quanh đã
     * dính con khác thì thành chuỗi thua liên tiếp không có lối ra.
     */
    graceMs: 10_000,
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
