'use strict';

const cfg = require('./config');
const zones = require('./data/zones');
const RoomManager = require('./roomManager');
const auth = require('./auth');
const characters = require('./characters');
const inventory = require('./inventory');
const progression = require('./progression');
const tree = require('./data/skilltree');
const classData = require('./data/classes');
const skillData = require('./data/skills');

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

        /**
         * Vùng do người chơi chọn, nhưng CHỈ server quyết định có được vào hay
         * không — client sửa vài dòng JS là gửi lên vùng cấp 50 với nhân vật
         * cấp 1, và chỗ chặn duy nhất đáng tin là ở đây.
         */
        const level = character?.level || 1;
        const zone = zones.get(payload.zone) || zones.defaultFor(level);
        if (!zones.canEnter(zone, level)) {
          return reply({ ok: false, error: `${zone.name} yêu cầu cấp ${zone.levelMin} trở lên.` });
        }

        const name = character ? character.name : sanitizeName(payload.name);
        const { room, player } = manager.join(socket, type, zone, name, character);

        // Bản đồ gửi đúng một lần lúc vào phòng, không lặp lại mỗi tick
        reply({
          ok: true,
          you: player.id,
          room: room.info(),
          map: room.map.serialize(),
          zone: {
            id: zone.id, name: zone.name, desc: zone.desc,
            levelMin: zone.levelMin, levelMax: zone.levelMax, theme: zone.theme,
          },
          tickHz: cfg.TICK_HZ,
          character,
          // Người mới vào phòng luôn ở chế độ khám phá — không bị kéo vào trận
          // của người lạ nữa
          battle: null,
          characterState: room.characterState(player),
        });
      } catch (err) {
        console.error('[net] join lỗi:', err);
        reply({ ok: false, error: 'Không vào được phòng.' });
      }
    });

    socket.on('input', (input) => {
      const room = manager.roomOf(socket);
      const p = room?.players.get(socket.id);
      // Đang trong trận thì bỏ qua phím di chuyển
      if (p && !p.battleId) room.setInput(socket.id, input || {});
    });

    /** Trận mà người này đang tham gia, null nếu đang khám phá. */
    const myBattle = () => {
      const room = manager.roomOf(socket);
      const p = room?.players.get(socket.id);
      return p?.battleId ? room.battles.get(p.battleId) : null;
    };

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

      /**
       * Chặn theo trận CÒN SỐNG, không theo `battleId`.
       *
       * `battleId` chỉ được gỡ vài giây sau khi trận kết thúc (chờ hoạt cảnh
       * chạy hết). Đúng khoảng đó là lúc bảng kết quả hiện ra, người chơi vừa
       * lên cấp và bấm ngay dấu + để cộng chỉ số — rồi nhận lại một câu từ chối
       * khó hiểu. Trận đã xong thì cho thao tác bình thường.
       *
       * Câu từ chối cũng phải nói đúng chuyện: hàm này còn gác cả cộng chỉ số,
       * học kỹ năng và chọn lớp, không riêng gì trang bị.
       */
      const live = p.battleId ? room.battles.get(p.battleId) : null;
      if (live && !live.ended) {
        return ack?.({ ok: false, error: 'Đang trong trận — đánh xong rồi làm.' });
      }

      const res = fn(p, payload);
      if (res?.ok) {
        room.sendCharacter(p);
        room.saveProgress(p);
      }
      ack?.(res);
    };

    socket.on('inv:equip', invAction((p, d) => inventory.equip(p.inv, d.uid, d.slot || null)));
    socket.on('inv:unequip', invAction((p, d) => inventory.unequip(p.inv, d.slot)));
    socket.on('inv:discard', invAction((p, d) => (
      inventory.discard(p.inv, d.uid) ? { ok: true } : { ok: false, error: 'Không tìm thấy món đồ.' }
    )));

    // Xoá hàng loạt. Client gửi thẳng danh sách uid — server không nhận "xoá hết
    // hạng Thường" hay bất kỳ điều kiện lọc nào, vì như vậy một lỗi lọc ở server
    // là quét sạch túi của người chơi. Lọc là việc của giao diện, chốt danh sách
    // rồi mới gửi lên.
    socket.on('inv:discardMany', invAction((p, d) => inventory.discardMany(p.inv, d.uids)));

    socket.on('stat:spend', invAction((p, d) => {
      const res = progression.spendStatPoint(p, d.stat);
      return res ? { ok: true, ...res } : { ok: false, error: 'Không còn điểm để cộng.' };
    }));

    /* ------------------------------------------------ cây kỹ năng ------ */

    socket.on('class:choose', invAction((p, d) => {
      if (p.className) return { ok: false, error: 'Đã chọn lớp rồi. Chỉ đổi được ở mốc cấp 10, 25, 50.' };
      if (!classData.get(d.classId)) return { ok: false, error: 'Lớp không hợp lệ.' };
      p.className = d.classId;
      return { ok: true };
    }));

    socket.on('tree:learn', invAction((p, d) => {
      if (!p.className) return { ok: false, error: 'Phải chọn lớp trước.' };
      const why = tree.blockedReason(p.className, d.nodeId, p);
      if (why) return { ok: false, error: why };

      p.learned.push(d.nodeId);

      // Học được chiêu chủ động mà còn chỗ trống thì tự mang theo luôn —
      // không ai học xong lại muốn để nó nằm không
      const node = tree.node(p.className, d.nodeId);
      const active = node?.type === 'active' && !!node.skillId;
      const carried = active && p.carried.length < skillData.MAX_LOADOUT;
      if (carried) p.carried.push(node.skillId);

      // Báo lại đúng chuyện đã xảy ra. Bộ mang theo đầy mà giao diện vẫn khoe
      // "tự động mang vào trận" thì người chơi chỉ phát hiện ra lúc vào trận
      // tìm mãi không thấy chiêu vừa học đâu.
      return { ok: true, active, carried };
    }));

    socket.on('loadout:set', invAction((p, d) => {
      const unlocked = tree.unlockedSkills(p.className, p.learned, p.codex);
      const list = (Array.isArray(d.skills) ? d.skills : [])
        .filter((id) => unlocked.includes(id));

      if (list.length > skillData.MAX_LOADOUT) {
        return { ok: false, error: `Chỉ mang được tối đa ${skillData.MAX_LOADOUT} kỹ năng.` };
      }
      p.carried = [...new Set(list)];
      return { ok: true };
    }));

    /**
     * Gắn sách vào ô Dị Điển. Ô đã có sách thì sách cũ bị **xoá vĩnh viễn**
     * (DESIGN.md §3.4) — client phải hỏi lại trước khi gọi.
     */
    socket.on('codex:socket', invAction((p, d) => {
      const slot = parseInt(d.slot, 10);
      if (!(slot >= 0 && slot < tree.CODEX_SLOTS)) return { ok: false, error: 'Ô không hợp lệ.' };

      const book = (p.books || []).find((b) => b.uid === d.uid);
      if (!book) return { ok: false, error: 'Không tìm thấy sách.' };

      const old = p.codex[slot];
      p.codex[slot] = book;
      p.books = p.books.filter((b) => b.uid !== d.uid);

      // Sách cũ biến mất, và chiêu của nó cũng rời khỏi bộ mang theo
      if (old?.skillId) p.carried = p.carried.filter((id) => id !== old.skillId);

      // Gắn sách xong mà chiêu vẫn nằm ngoài trận thì gắn để làm gì. Giống hệt
      // lúc học một nút chủ động trong Cây Nền: còn chỗ thì mang theo luôn.
      if (book.skillId && !p.carried.includes(book.skillId)
          && p.carried.length < skillData.MAX_LOADOUT) {
        p.carried.push(book.skillId);
      }
      return { ok: true, replaced: old?.name || null };
    }));

    socket.on('character:get', (payload, ack) => {
      const room = manager.roomOf(socket);
      const p = room?.players.get(socket.id);
      if (!p) return ack?.({ ok: false });
      ack?.({ ok: true, character: room.characterState(p) });
    });

    socket.on('battle:action', (payload = {}, ack) => {
      const battle = myBattle();
      if (!battle) return ack?.({ ok: false, error: 'Không có trận nào.' });

      const ok = battle.submit(socket.id, payload.skillId, payload.targetId);
      ack?.({ ok, error: ok ? null : 'Lựa chọn không hợp lệ.' });
    });

    /* ------------------------------------------------ nhóm ------------- */

    /**
     * Nhóm quyết định ai cùng vào một trận. Không cùng nhóm thì dù đứng cạnh
     * nhau vẫn đánh trận riêng.
     */
    socket.on('party:invite', (payload = {}, ack) => {
      const room = manager.roomOf(socket);
      const from = room?.players.get(socket.id);
      const to = room?.players.get(payload.targetId);
      if (!from || !to) return ack?.({ ok: false, error: 'Không tìm thấy người chơi.' });
      if (from.battleId || to.battleId) return ack?.({ ok: false, error: 'Không mời được khi đang trong trận.' });

      const res = room.party.invite(from, to);
      if (res.ok) {
        io.to(to.id).emit('party:invited', { fromId: from.id, fromName: from.name });
      }
      ack?.(res);
    });

    socket.on('party:respond', (payload = {}, ack) => {
      const room = manager.roomOf(socket);
      const me = room?.players.get(socket.id);
      const from = room?.players.get(payload.fromId);
      if (!me || !from) return ack?.({ ok: false, error: 'Người mời đã rời đi.' });

      if (!payload.accept) {
        room.party.decline(me, from);
        io.to(from.id).emit('party:declined', { name: me.name });
        return ack?.({ ok: true, joined: false });
      }

      const res = room.party.accept(me, from);
      if (res.ok) {
        for (const id of res.party.members) {
          const m = room.players.get(id);
          if (m) room.sendCharacter(m);
        }
        io.to(res.party.members).emit('party:changed', { joined: me.name });
      }
      ack?.({ ...res, joined: !!res.ok });
    });

    socket.on('party:leave', (payload, ack) => {
      const room = manager.roomOf(socket);
      const me = room?.players.get(socket.id);
      if (!me) return ack?.({ ok: false });

      const res = room.party.leave(me);
      room.sendCharacter(me);
      if (res?.party) {
        for (const id of res.party.members) {
          const m = room.players.get(id);
          if (m) room.sendCharacter(m);
        }
        io.to(res.party.members).emit('party:changed', { left: me.name });
      }
      // Nhóm tan thì người còn lại cũng phải được cập nhật
      if (res?.orphan) {
        const o = room.players.get(res.orphan);
        if (o) { o.partyId = null; room.sendCharacter(o); }
      }
      ack?.({ ok: true });
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
