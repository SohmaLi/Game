'use strict';

const cfg = require('./config');
const map = require('./map');
const RoomManager = require('./roomManager');
const auth = require('./auth');
const characters = require('./characters');
const inventory = require('./inventory');
const progression = require('./progression');

/** Làm sạch tên người chơi trước khi cho vào hệ thống. */
function sanitizeName(raw) {
  const name = String(raw ?? '')
    .replace(/[\x00-\x1f<>]/g, '') // bỏ ký tự điều khiển và dấu ngoặc nhọn (chống XSS)
    .trim()
    .slice(0, cfg.MAX_NAME_LEN);
  return name || `Khach${Math.floor(Math.random() * 9000 + 1000)}`;
}

function attach(io) {
  const manager = new RoomManager(io);

  io.on('connection', (socket) => {
    socket.on('join', async (payload = {}, ack) => {
      const reply = (res) => {
        if (typeof ack === 'function') ack(res);
        else socket.emit('joined', res);
      };

      try {
        const type = cfg.ROOM_TYPES[payload.type] ? payload.type : 'pve';

        // Có token thì chơi bằng nhân vật thật; không có thì vào với tư cách khách.
        // Giữ đường khách để còn thử nghiệm nhanh khi chưa làm xong màn đăng nhập.
        let character = null;
        if (payload.token) {
          const account = await auth.verifyToken(payload.token);
          if (!account) return reply({ ok: false, error: 'Phiên đăng nhập đã hết hạn.' });

          const row = payload.characterId
            ? await characters.getOwned(account.id, payload.characterId)
            : (await characters.list(account.id))[0] &&
              await characters.getOwned(account.id, (await characters.list(account.id))[0].id);

          if (!row) return reply({ ok: false, error: 'Không tìm thấy nhân vật.' });
          character = characters.present(row);
        }

        const name = character ? character.name : sanitizeName(payload.name);
        const { room, player } = manager.join(socket, type, name, character);

        // Bản đồ gửi đúng một lần lúc vào phòng, không lặp lại mỗi tick
        reply({
          ok: true,
          you: player.id,
          room: room.info(),
          map: map.serialize(),
          tickHz: cfg.TICK_HZ,
          character,
          // Vào giữa lúc cả phòng đang đánh nhau thì xem luôn, không phải chờ
          battle: room.battle ? room.battle.serialize() : null,
          characterState: room.characterState(player),
        });
      } catch (err) {
        console.error('[net] join lỗi:', err);
        reply({ ok: false, error: 'Không vào được phòng.' });
      }
    });

    socket.on('input', (input) => {
      const room = manager.roomOf(socket);
      // Đang trong trận thì bỏ qua phím di chuyển
      if (room && !room.battle) room.setInput(socket.id, input || {});
    });

    /* ------------------------------------------------ chiến đấu -------- */

    // Không có sự kiện "bắt đầu trận" nào cho client gọi. Trận chỉ nổ ra khi
    // server thấy người chơi chạm phải quái trên bản đồ — client không tự
    // quyết định được lúc nào mình vào trận.

    /* ------------------------------------------------ túi đồ ----------- */

    /**
     * Mọi thao tác túi đồ đều xử lý ở server rồi gửi lại toàn bộ trạng thái
     * nhân vật. Cách này tốn vài trăm byte mỗi lần bấm, đổi lại client không
     * bao giờ lệch trạng thái với server — điều tối kỵ với đồ đạc.
     */
    const invAction = (fn) => (payload = {}, ack) => {
      const room = manager.roomOf(socket);
      const p = room?.players.get(socket.id);
      if (!p) return ack?.({ ok: false, error: 'Chưa ở trong phòng nào.' });
      if (room.battle) return ack?.({ ok: false, error: 'Không đổi trang bị giữa trận.' });

      const res = fn(p, payload);
      if (res?.ok) room.sendCharacter(p);
      ack?.(res);
    };

    socket.on('inv:equip', invAction((p, d) => inventory.equip(p.inv, d.uid, d.slot || null)));
    socket.on('inv:unequip', invAction((p, d) => inventory.unequip(p.inv, d.slot)));
    socket.on('inv:discard', invAction((p, d) => (
      inventory.discard(p.inv, d.uid) ? { ok: true } : { ok: false, error: 'Không tìm thấy món đồ.' }
    )));

    socket.on('stat:spend', invAction((p, d) => {
      const res = progression.spendStatPoint(p, d.stat);
      return res ? { ok: true, ...res } : { ok: false, error: 'Không còn điểm để cộng.' };
    }));

    socket.on('character:get', (payload, ack) => {
      const room = manager.roomOf(socket);
      const p = room?.players.get(socket.id);
      if (!p) return ack?.({ ok: false });
      ack?.({ ok: true, character: room.characterState(p) });
    });

    socket.on('battle:action', (payload = {}, ack) => {
      const room = manager.roomOf(socket);
      if (!room?.battle) return ack?.({ ok: false, error: 'Không có trận nào.' });

      const ok = room.battle.submit(socket.id, payload.skillId, payload.targetId);
      ack?.({ ok, error: ok ? null : 'Lựa chọn không hợp lệ.' });
    });

    // Client dùng để đo độ trễ thật (round-trip)
    socket.on('ping:probe', (sentAt, ack) => {
      if (typeof ack === 'function') ack(sentAt);
    });

    socket.on('leave', () => manager.leave(socket));
    socket.on('disconnect', () => manager.leave(socket));
  });

  return manager;
}

module.exports = { attach, sanitizeName };
