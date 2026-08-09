'use strict';

const cfg = require('./config');
const Room = require('./room');

/**
 * Quản lý vòng đời phòng: tự tạo khi cần, tự dọn khi bỏ trống.
 * Không giới hạn cứng số phòng ở đây — trần thật là Entry Processes của hosting,
 * sẽ chốt sau khi đo bằng tools/loadtest.js.
 */
class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> Room
    this.playerRoom = new Map(); // socketId -> roomId

    // Dọn phòng rỗng định kỳ. 10 giây một lần là đủ, không tốn gì.
    this.cleanupTimer = setInterval(() => this.cleanup(), 10_000);
    this.cleanupTimer.unref?.();
  }

  /** Tìm phòng cùng loại còn chỗ, không có thì tạo mới. */
  findOrCreate(type) {
    if (!cfg.ROOM_TYPES[type]) throw new Error(`Loại phòng không hợp lệ: ${type}`);

    for (const room of this.rooms.values()) {
      if (room.type === type && !room.isFull) return room;
    }
    const room = new Room(type, this.io);
    this.rooms.set(room.id, room);
    return room;
  }

  join(socket, type, name, character = null) {
    this.leave(socket); // đảm bảo một socket chỉ ở một phòng

    const room = this.findOrCreate(type);
    const player = room.add(socket, name, character);
    this.playerRoom.set(socket.id, room.id);

    socket.to(room.id).emit('playerJoined', { id: player.id, name: player.name });
    return { room, player };
  }

  leave(socket) {
    const roomId = this.playerRoom.get(socket.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    this.playerRoom.delete(socket.id);

    if (room) {
      room.remove(socket.id);
      socket.leave(room.id);
      socket.to(room.id).emit('playerLeft', { id: socket.id });
    }
  }

  roomOf(socket) {
    const roomId = this.playerRoom.get(socket.id);
    return roomId ? this.rooms.get(roomId) : null;
  }

  cleanup() {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      if (room.players.size === 0 && room.emptySince && now - room.emptySince > cfg.ROOM_EMPTY_TTL) {
        room.stopLoop();
        this.rooms.delete(id);
      }
    }
  }

  stats() {
    let players = 0;
    let activeLoops = 0;
    for (const room of this.rooms.values()) {
      players += room.players.size;
      if (room.timer) activeLoops++;
    }
    return {
      rooms: this.rooms.size,
      activeLoops,
      players,
      list: [...this.rooms.values()].map((r) => r.info()),
    };
  }
}

module.exports = RoomManager;
