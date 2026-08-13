'use strict';

/**
 * Nhóm — mặt tiền cho `server/party.js`.
 *
 * Luật nhóm đã chạy đủ ở server từ lâu: mời, nhận, từ chối, rời, và quan trọng
 * nhất là "ai cùng vào một trận". Thứ duy nhất còn thiếu là chỗ để bấm chuột —
 * và vì thiếu nó, dòng "PvE tối đa 5 người/nhóm" đúng trên giấy còn trong game
 * thì không ai lập nổi một nhóm.
 *
 * Module này KHÔNG tự suy ra thành phần nhóm. Danh sách luôn lấy nguyên từ
 * `characterState.party` mà server đẩy xuống sau mỗi thay đổi — đoán ở client
 * là cách chắc chắn nhất để hai bên lệch nhau sau một lời mời bị từ chối.
 */

const Party = (() => {
  const $ = (id) => document.getElementById(id);

  /** Server gửi xuống lúc vào phòng; con số này chỉ để hiển thị "3/5". */
  let max = 5;

  let socket = null;
  let myId = null;
  let members = [];   // [{ id, name, level, leader }] — rỗng khi đi một mình
  let partyId = null; // id nhóm của CHÍNH mình, để đối chiếu với cờ `pt` trong gói `state`

  /** Lời mời đang chờ trả lời, kèm đồng hồ đếm ngược. */
  let pending = null;
  let ticker = null;

  /** Ai trong nhóm đang đánh nhau — lấy từ gói `state`, không có trong `character`. */
  let busy = new Set();
  let busySig = '';

  /* ------------------------------------------------ khởi tạo ---------- */

  function init(sock) {
    socket = sock;

    /**
     * Trạng thái nhân vật là nguồn DUY NHẤT về thành phần nhóm.
     *
     * Đăng ký riêng ở đây thay vì nhờ `panel.js` gọi hộ: cả `Hud` lẫn `Shop`
     * đều tự nghe lấy sự kiện của mình, và mỗi lần thêm một module vào chuỗi
     * chuyển tiếp của panel là thêm một chỗ để quên.
     */
    socket.on('character', update);

    socket.on('party:invited', showInvite);
    socket.on('party:declined', (d) => Panel.toast?.('warn', `${d.name} từ chối lời mời`));
    socket.on('party:changed', (d) => {
      if (d.joined) Panel.toast?.('item', `${d.joined} đã vào nhóm`, 'Từ giờ chạm quái là cùng vào một trận');
      if (d.left) Panel.toast?.('warn', `${d.left} đã rời nhóm`);
    });

    $('partyLeave').addEventListener('click', leave);
    $('piAccept').addEventListener('click', () => respond(true));
    $('piDecline').addEventListener('click', () => respond(false));
  }

  /** Socket id đổi sau mỗi lần nối lại mạng, nên nhận lại ở mỗi lần vào phòng. */
  function setMe(id, maxParty) {
    myId = id;
    if (maxParty) max = maxParty;
  }

  /* ------------------------------------------------ bảng nhóm --------- */

  function update(c) {
    members = c?.party || [];
    partyId = c?.partyId || null;
    render();
  }

  function render() {
    const box = $('partyFrame');

    // Đi một mình thì server trả về danh sách rỗng — giấu hẳn khung đi, đừng
    // chiếm một góc màn hình chỉ để nói rằng không có gì trong đó
    if (members.length < 2) return box.classList.add('hidden');
    box.classList.remove('hidden');

    $('partyCount').textContent = `${members.length}/${max}`;

    const list = $('partyList');
    list.innerHTML = '';
    for (const m of members) {
      const row = document.createElement('div');
      row.className = `pt-row ${m.id === myId ? 'me' : ''}`;
      row.innerHTML = `
        <span class="pt-lead">${m.leader ? '★' : ''}</span>
        <span class="pt-name">${UI.esc(m.name)}</span>
        <span class="pt-lv">Cấp ${m.level}</span>
        <span class="pt-busy ${busy.has(m.id) ? '' : 'hidden'}" title="Đang trong trận">⚔</span>`;
      list.appendChild(row);
    }
  }

  /**
   * Đánh dấu ai đang đánh nhau.
   *
   * Cờ này chỉ có trong gói `state` (15 lần/giây) chứ không có trong
   * `characterState`, nên phải nhặt riêng — và chỉ vẽ lại khi tập hợp ĐỔI,
   * không thì mỗi giây dựng lại cái danh sách này mười lăm lần cho vui.
   */
  function syncBusy(players) {
    if (members.length < 2) return;

    const ids = members.map((m) => m.id);
    const now = new Set();
    for (const p of players || []) if (p.b && ids.includes(p.id)) now.add(p.id);

    const sig = [...now].sort().join(',');
    if (sig === busySig) return;
    busySig = sig;
    busy = now;
    render();
  }

  /* ------------------------------------------------ mời -------------- */

  /**
   * Vì sao KHÔNG mời được người này — trả về null nghĩa là mời được.
   *
   * Chỉ để làm mờ mục trong menu và nói rõ lý do. Server vẫn kiểm tra lại từng
   * điều kiện: cái menu này client vẽ ra thì client cũng bỏ qua được.
   *
   * @param t  người chơi trong gói `state`: { id, n, pt, b }
   */
  function cannotInvite(t) {
    if (t.b) return 'Đang trong trận';
    if (t.pt && t.pt === partyId) return 'Đã cùng nhóm rồi';
    if (t.pt) return 'Đang ở nhóm khác';
    if (members.length >= max) return `Nhóm đã đủ ${max} người`;
    return null;
  }

  function invite(targetId, name) {
    socket?.emit('party:invite', { targetId }, (res) => {
      if (res?.ok) Panel.toast?.('item', `Đã mời ${name}`, 'Chờ trả lời trong 30 giây');
      else Panel.toast?.('warn', 'Không mời được', res?.error || 'Thử lại sau');
    });
  }

  /* ------------------------------------------------ nhận lời mời ----- */

  /**
   * Thẻ lời mời, KHÔNG phải hộp thoại chặn màn hình.
   *
   * Lời mời đến lúc nào không ai biết trước — thường là đang chạy giữa bầy quái.
   * Một hộp thoại phủ kín màn hình đúng lúc đó là cách bắt người chơi vào trận
   * mà không nhìn thấy gì.
   */
  function showInvite(d) {
    // Chỉ giữ MỘT lời mời: hai người rủ cùng lúc thì cái mới đè cái cũ, vì đó là
    // cái người chơi vừa nhìn thấy và sẽ bấm. Cái cũ vẫn còn hiệu lực ở server
    // cho tới khi hết hạn, nên chưa mất gì.
    clearInterval(ticker);

    const ttl = d.ttl || 30_000;
    pending = { fromId: d.fromId, fromName: d.fromName, until: Date.now() + ttl, ttl };

    $('piText').innerHTML = `<b>${UI.esc(d.fromName)}</b> rủ bạn lập nhóm`;
    const card = $('partyInvite');
    card.classList.remove('hidden');
    tick();
    ticker = setInterval(tick, 250);

    /**
     * Đẩy lời nhắc "Bấm E" lên trên đúng bằng chiều cao THẬT của thẻ này — cả
     * hai cùng đậu ở đáy màn hình. Đo sau khi bỏ `hidden`, vì phần tử còn ẩn thì
     * `getBoundingClientRect` trả về 0.
     */
    const h = Math.round(card.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--invite-h', `${h + 10}px`);
  }

  function tick() {
    if (!pending) return;
    const left = pending.until - Date.now();
    if (left <= 0) {
      hideInvite();
      Panel.toast?.('warn', 'Lời mời đã hết hạn');
      return;
    }
    $('piTime').textContent = `${Math.ceil(left / 1000)}s`;
    $('piBar').style.width = `${(left / pending.ttl) * 100}%`;
  }

  function respond(accept) {
    if (!pending) return;
    const { fromId, fromName } = pending;
    hideInvite();

    socket?.emit('party:respond', { fromId, accept }, (res) => {
      if (accept && !res?.ok) Panel.toast?.('warn', 'Không vào nhóm được', res?.error || 'Thử lại sau');
      if (!accept) Panel.toast?.('warn', `Đã từ chối ${fromName}`);
    });
  }

  function hideInvite() {
    clearInterval(ticker);
    ticker = null;
    pending = null;
    $('partyInvite').classList.add('hidden');
    document.documentElement.style.setProperty('--invite-h', '0px');
  }

  /* ------------------------------------------------ rời -------------- */

  async function leave() {
    if (members.length < 2) return;
    const ok = await UI.confirm({
      title: 'Rời nhóm?',
      message: 'Rời ra thì chạm quái sẽ đánh một mình, và không ai kéo bạn vào trận của họ nữa.',
      confirmLabel: 'Rời nhóm',
      danger: true,
    });
    if (ok) socket?.emit('party:leave', {});
  }

  /* ------------------------------------------------ dọn dẹp ---------- */

  function hide() {
    hideInvite();
    members = [];
    partyId = null;
    busy = new Set();
    busySig = '';
    $('partyFrame').classList.add('hidden');
  }

  const has = (id) => members.some((m) => m.id === id);
  const size = () => members.length;

  return { init, setMe, update, syncBusy, cannotInvite, invite, leave, hide, has, size, get max() { return max; } };
})();
