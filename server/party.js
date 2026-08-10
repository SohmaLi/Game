'use strict';

/**
 * Nhóm (party).
 *
 * Nhóm quyết định **ai cùng vào một trận**. Không cùng nhóm thì dù đứng cạnh
 * nhau trên bản đồ, mỗi người vẫn đánh trận riêng của mình.
 *
 * Trước đây cả phòng cùng vào một trận — sai, vì phòng chỉ là một khoảng không
 * gian chung, không phải một đội. Người mới vào phòng bị kéo thẳng vào trận của
 * người lạ, và trận đó dùng luôn chỉ số của họ.
 */

const MAX_PARTY = 5;         // trùng với giới hạn PvE mỗi trận
const INVITE_TTL = 30_000;   // lời mời hết hạn sau 30 giây

let nextPartyId = 1;

class PartyManager {
  constructor() {
    this.parties = new Map();  // partyId -> { id, leaderId, members: [socketId] }
    this.invites = new Map();  // `${toId}|${fromId}` -> { at, partyId }
  }

  get(partyId) {
    return this.parties.get(partyId) || null;
  }

  /** Danh sách bạn đồng hành của một người — luôn gồm chính họ. */
  membersOf(player) {
    const party = player.partyId ? this.get(player.partyId) : null;
    return party ? [...party.members] : [player.id];
  }

  size(partyId) {
    return this.get(partyId)?.members.length || 0;
  }

  /* -------------------------------------------------- mời --------------- */

  invite(from, to) {
    if (from.id === to.id) return { ok: false, error: 'Không tự mời mình được.' };
    if (to.partyId && to.partyId === from.partyId) return { ok: false, error: 'Đã cùng nhóm rồi.' };
    if (to.partyId) return { ok: false, error: `${to.name} đang ở nhóm khác.` };

    // Người mời đã có nhóm thì nhóm đó phải còn chỗ
    if (from.partyId && this.size(from.partyId) >= MAX_PARTY) {
      return { ok: false, error: `Nhóm đã đủ ${MAX_PARTY} người.` };
    }

    this.invites.set(`${to.id}|${from.id}`, { at: Date.now(), partyId: from.partyId });
    return { ok: true };
  }

  /** Người được mời đồng ý. Chưa có nhóm thì lập nhóm mới cho cả hai. */
  accept(to, from) {
    const key = `${to.id}|${from.id}`;
    const inv = this.invites.get(key);
    if (!inv) return { ok: false, error: 'Lời mời không còn hiệu lực.' };
    this.invites.delete(key);

    if (Date.now() - inv.at > INVITE_TTL) return { ok: false, error: 'Lời mời đã hết hạn.' };
    if (to.partyId) return { ok: false, error: 'Bạn đang ở nhóm khác.' };

    let party = from.partyId ? this.get(from.partyId) : null;

    if (!party) {
      party = { id: `p${nextPartyId++}`, leaderId: from.id, members: [from.id] };
      this.parties.set(party.id, party);
      from.partyId = party.id;
    }

    if (party.members.length >= MAX_PARTY) return { ok: false, error: 'Nhóm đã đầy.' };

    party.members.push(to.id);
    to.partyId = party.id;
    return { ok: true, party };
  }

  decline(to, from) {
    this.invites.delete(`${to.id}|${from.id}`);
  }

  /* -------------------------------------------------- rời -------------- */

  leave(player) {
    const party = player.partyId ? this.get(player.partyId) : null;
    player.partyId = null;
    if (!party) return null;

    party.members = party.members.filter((id) => id !== player.id);

    // Nhóm còn một người thì không còn là nhóm nữa
    if (party.members.length <= 1) {
      this.parties.delete(party.id);
      return { dissolved: true, party, orphan: party.members[0] || null };
    }

    if (party.leaderId === player.id) party.leaderId = party.members[0];
    return { dissolved: false, party };
  }

  /** Dọn lời mời hết hạn để Map không phình mãi. */
  sweep() {
    const now = Date.now();
    for (const [k, v] of this.invites) {
      if (now - v.at > INVITE_TTL) this.invites.delete(k);
    }
  }
}

module.exports = { PartyManager, MAX_PARTY, INVITE_TTL };
