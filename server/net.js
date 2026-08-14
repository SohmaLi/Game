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
const npcData = require('./data/npcs');
const shop = require('./shop');
const codex = require('./codex');
const respec = require('./respec');
const quests = require('./quests');
const party = require('./party');

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
            safe: !!zone.safe,
          },
          /**
           * Người bán hàng gửi MỘT LẦN cùng bản đồ, không nhét vào `state`.
           *
           * Họ đứng yên vĩnh viễn — bắn lại toạ độ 15 lần mỗi giây chỉ để nói
           * rằng không có gì thay đổi là đúng thứ lãng phí mà cả file này đang
           * cố tránh.
           */
          npcs: room.npcs.map((n) => ({
            id: n.id, name: n.name, role: n.role, kind: n.kind, sprite: n.sprite,
            greet: n.greet, x: n.x, y: n.y,
          })),
          talkRadius: npcData.TALK_RADIUS,
          maxParty: party.MAX_PARTY,
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

      // `room` là tham số thứ ba để mấy việc cần biết mình đang đứng ở đâu
      // (mua bán với người bán hàng) dùng chung được cái vỏ gác này
      const res = fn(p, payload, room);
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

    /**
     * Nâng bậc một kỹ năng đã mở, tốn 1 điểm kỹ năng — nơi tiêu điểm dư sau khi
     * Cây Nền đã mở hết (mỗi lớp chỉ tốn tối đa 15 điểm mà vẫn nhận 1 điểm mỗi
     * cấp tới cấp 60).
     */
    socket.on('skill:rank', invAction((p, d) => {
      if (!p.className) return { ok: false, error: 'Phải chọn lớp trước.' };
      const skillId = d.skillId;
      if (!tree.rankable(skillId)) return { ok: false, error: 'Kỹ năng này không nâng bậc được.' };

      const unlocked = tree.unlockedSkills(p.className, p.learned, p.codex);
      if (!unlocked.includes(skillId)) return { ok: false, error: 'Kỹ năng chưa mở.' };

      const rank = tree.rankOf(skillId, p.skillRanks);
      if (rank >= tree.MAX_SKILL_RANK) return { ok: false, error: `Đã đạt bậc tối đa (${tree.MAX_SKILL_RANK}).` };

      const left = tree.pointsLeft(p.className, p.level, p.learned, p.skillRanks, p.bookRanks, p.mastery);
      if (left < 1) return { ok: false, error: 'Không đủ điểm kỹ năng.' };

      p.skillRanks = { ...p.skillRanks, [skillId]: rank + 1 };
      return { ok: true, skillId, rank: rank + 1 };
    }));

    /**
     * Đầu tư một điểm vào một dòng Tinh Thông — chỗ tiêu cuối cùng của điểm dư
     * (skilltree.js). Không cần chọn lớp: Tinh Thông là chung cho mọi lớp, và
     * chặn nó sau `class:choose` chỉ tổ khoá điểm của người chưa kịp chọn.
     */
    socket.on('mastery:learn', invAction((p, d) => {
      const why = tree.masteryBlocked(d.lineId, p);
      if (why) return { ok: false, error: why };

      const tier = tree.masteryTier(d.lineId, p.mastery) + 1;
      p.mastery = { ...p.mastery, [d.lineId]: tier };
      return { ok: true, lineId: d.lineId, tier };
    }));

    /**
     * Bốn thao tác Dị Điển — luật nằm trong `server/codex.js`, đây chỉ là cửa vào.
     *
     * `upgrade` tiêu một cuốn sách trùng để nâng bậc kỹ năng đang gắn; `socket`
     * gắn vào ô (đè lên ô cũ là xoá vĩnh viễn sách cũ, DESIGN.md §3.4, client
     * phải hỏi lại); `unsocket` gỡ khỏi ô; `discard` vứt sách chưa gắn.
     */
    socket.on('codex:upgrade', invAction((p, d) => codex.upgrade(p, d.uid)));
    socket.on('codex:socket', invAction((p, d) => codex.socketBook(p, d.slot, d.uid)));
    socket.on('codex:unsocket', invAction((p, d) => codex.unsocket(p, d.slot)));
    socket.on('codex:discard', invAction((p, d) => codex.discard(p, d.uids)));

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
     * Rửa điểm — trả lại điểm chỉ số hoặc điểm kỹ năng, tính phí bằng vàng.
     * Luật và giá nằm trong `server/respec.js`. Client phải hỏi lại: đây là
     * hành động không hoàn tác được, và nó tiêu vàng.
     */
    socket.on('respec:stats', invAction((p) => respec.resetStats(p)));
    socket.on('respec:skills', invAction((p) => respec.resetSkills(p)));

    /**
     * Nhận thưởng một nhiệm vụ (DESIGN.md §8b). Đây là sự kiện DUY NHẤT client
     * được gửi về nhiệm vụ — tiến độ do server đếm, client không bao giờ báo lên
     * "tôi vừa hạ 20 con sói".
     */
    socket.on('quest:claim', invAction((p, d) => quests.claim(p, d.questId)));

    /**
     * Nhận hết một lượt — phải ĐỨNG CẠNH Người Chép Sử, kiểm ở server đúng như
     * mọi việc với thương nhân. Nhận từng việc thì ở đâu cũng được; đây là thứ
     * duy nhất bắt đi bộ về Bến Cảng, nên nó cũng là thứ duy nhất phải canh.
     */
    socket.on('quest:claimAll', invAction((p, d, room) => {
      if (!room.npcNear(p, 'scribe', 'quest')) {
        return { ok: false, error: 'Phải đứng cạnh Người Chép Sử.' };
      }
      return quests.claimAll(p);
    }));

    /* ------------------------------------------------ mua bán ---------- */

    /**
     * Mọi việc với người bán hàng đều phải ĐỨNG CẠNH ông ta.
     *
     * Kiểm tra khoảng cách ở server chứ không tin cái nút mà client vẽ ra: sửa
     * vài dòng JS là gọi thẳng `shop:buy` từ giữa Vực Băng, và cái ý nghĩa duy
     * nhất của việc đi bộ về thị trấn biến mất.
     */
    const atShop = (fn) => invAction((p, d, room) => {
      const npc = room.npcNear(p, d.npcId || 'merchant', 'shop');
      if (!npc) return { ok: false, error: 'Phải đứng cạnh người bán hàng.' };

      const res = fn(p, d, npc);
      // Trả kèm quầy hàng đã cập nhật: giá bán phụ thuộc túi đồ vừa đổi, nên
      // client mà tự sửa tại chỗ thì lệch ngay sau món thứ hai
      return res?.ok ? { ...res, state: shop.stateFor(p, npc) } : res;
    });

    socket.on('shop:state', (payload = {}, ack) => {
      const room = manager.roomOf(socket);
      const p = room?.players.get(socket.id);
      if (!p) return ack?.({ ok: false, error: 'Chưa ở trong phòng nào.' });

      const npc = room.npcNear(p, payload.npcId || 'merchant', 'shop');
      if (!npc) return ack?.({ ok: false, error: 'Phải đứng cạnh người bán hàng.' });

      ack?.({ ok: true, state: shop.stateFor(p, npc) });
    });

    socket.on('shop:buy', atShop((p, d) => shop.buy(p, d.uid, inventory)));

    // Client gửi thẳng danh sách uid, cùng lý do với `inv:discardMany`: server
    // không nhận điều kiện lọc kiểu "bán hết hạng Thường", vì một lỗi lọc ở
    // server là quét sạch túi của người chơi. Lọc là việc của giao diện.
    socket.on('shop:sell', atShop((p, d) => shop.sell(p, d.uids)));
    socket.on('shop:sellBooks', atShop((p, d) => shop.sellBooks(p, d.uids)));

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
        // Gửi kèm hạn lời mời thay vì để client tự viết 30 giây: đổi hằng số ở
        // `party.js` mà quên sửa client thì đồng hồ đếm ngược chạy tới 0 trong
        // khi lời mời còn sống, hoặc tệ hơn là ngược lại
        io.to(to.id).emit('party:invited', {
          fromId: from.id, fromName: from.name, ttl: party.INVITE_TTL,
        });
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

      // Cùng một đường với lúc mất kết nối (`Room.dropFromParty`) — hai bản sao
      // của cùng một việc là hai chỗ để quên cập nhật một người
      room.dropFromParty(me);
      room.sendCharacter(me);
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
