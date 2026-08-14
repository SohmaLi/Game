'use strict';

/**
 * Nhật Ký nhiệm vụ (DESIGN.md §8b).
 *
 * Giống mọi bảng khác trong game: KHÔNG giữ trạng thái riêng. Server gửi cả
 * Nhật Ký kèm bảng nhân vật sau mỗi thao tác, client chỉ vẽ lại. Tiến độ là thứ
 * tối kỵ để client tự đếm — nó sẽ lệch ngay lần đầu mất gói tin, và người chơi
 * nhìn thấy "20/20" rồi bấm nhận thưởng thì bị từ chối.
 */

const Quests = (() => {
  const $ = (id) => document.getElementById(id);

  const TAB_EMPTY = {
    daily: 'Hôm nay chưa có việc nào. Lạ đấy — báo lại giùm.',
    zone: 'Chưa có việc vùng nào.',
    milestone: 'Chưa có cột mốc nào.',
  };

  let socket = null;
  let data = null;
  let tab = 'daily';
  /**
   * Hỏi vòng vẽ xem đang đứng cạnh ai, thay vì tự giữ một bản sao.
   *
   * Bảng này mở được từ ba đường (phím J, nút dưới HUD, bấm E cạnh Người Chép
   * Sử) mà người chơi vẫn đi lại được trong lúc nó mở. Ghi nhớ "mở từ chỗ NPC"
   * lúc mở là ghi một sự thật hết hạn ngay bước chân tiếp theo.
   */
  let nearNpc = () => null;

  /* ------------------------------------------------ khởi tạo ---------- */

  function init(sock, nearNpcFn) {
    socket = sock;
    if (nearNpcFn) nearNpc = nearNpcFn;

    $('openQuests').onclick = toggle;
    $('questClose').onclick = close;
    $('qClaimAll').onclick = claimAll;
    $('quests').addEventListener('click', (e) => { if (e.target.id === 'quests') close(); });

    document.querySelectorAll('.q-tab').forEach((btn) => {
      btn.onclick = () => { tab = btn.dataset.qtab; render(); };
    });
  }

  const isOpen = () => !$('quests').classList.contains('hidden');
  function close() { $('quests').classList.add('hidden'); }
  function open() {
    Panel.close();
    Tree.close();
    $('quests').classList.remove('hidden');
    render();
  }
  function toggle() { isOpen() ? close() : open(); }

  /** Người Chép Sử trong tầm nói chuyện, null nếu đang đứng ở đâu đó khác. */
  const scribe = () => {
    const n = nearNpc();
    return n?.kind === 'quest' ? n : null;
  };

  /** Nhật Ký đi kèm bảng nhân vật — cùng một gói, không có sự kiện riêng. */
  function update(c) {
    data = c?.quests || null;
    renderBadge();
    if (isOpen()) render();
  }

  /* ------------------------------------------------ chấm đỏ ---------- */

  /**
   * Chấm trên nút chỉ đếm việc **bấm được ngay**, không đếm việc đang làm dở.
   *
   * Chấm hiện số 12 suốt ngày vì đó là tổng số việc chưa xong thì nó thôi mang
   * thông tin — người chơi học cách lờ nó đi trong đúng một buổi.
   */
  function renderBadge() {
    const n = data?.claimable || 0;
    const el = $('sbQuests');
    el.classList.toggle('hidden', !n);
    el.textContent = n;
  }

  /* ------------------------------------------------ vẽ --------------- */

  function render() {
    if (!data) return;

    renderNpc();
    document.querySelectorAll('.q-tab').forEach((b) =>
      b.classList.toggle('active', b.dataset.qtab === tab));

    const s = data.resetIn || 0;
    $('qReset').textContent = `Đổi việc sau ${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

    const list = tab === 'daily' ? data.dailies
      : tab === 'zone' ? data.zones
        : data.milestones;

    const box = $('qBody');
    if (!list?.length) {
      box.innerHTML = `<p class="q-empty">${TAB_EMPTY[tab]}</p>`;
      return;
    }

    // Việc bấm được lên đầu, việc đã nhận xuống cuối — bảng 18 dòng mà xếp theo
    // thứ tự khai báo thì thứ đáng bấm nhất nằm lẫn đâu đó ở giữa
    const sorted = [...list].sort((a, b) =>
      (b.claimable - a.claimable) || (a.claimed - b.claimed) || (b.have / b.need - a.have / a.need));

    box.innerHTML = sorted.map(row).join('');
    box.querySelectorAll('[data-claim]').forEach((btn) => {
      btn.onclick = () => claim(btn.dataset.claim);
    });
  }

  function row(q) {
    const pct = Math.min(100, (q.have / q.need) * 100);
    const state = q.claimed ? 'done' : (q.claimable ? 'ready' : '');
    const zoneTag = q.zone ? `<span class="q-zone">${esc(zoneName(q.zone))}</span>` : '';

    const reward = [
      q.reward?.gold ? `<span class="q-gold">${q.reward.gold.toLocaleString('vi-VN')} vàng</span>` : '',
      q.reward?.exp ? `<span class="q-exp">${q.reward.exp.toLocaleString('vi-VN')} kn</span>` : '',
      q.reward?.book ? '<span class="q-book">1 Dị Điển</span>' : '',
    ].filter(Boolean).join(' · ');

    const action = q.claimed
      ? '<span class="q-claimed">Đã nhận</span>'
      : q.claimable
        ? `<button class="q-btn" data-claim="${q.id}">Nhận thưởng</button>`
        : `<span class="q-count">${q.have} / ${q.need}</span>`;

    return `
      <div class="q-row ${state}">
        <div class="q-main">
          <div class="q-title">${esc(q.name)}${zoneTag}</div>
          <div class="q-desc">${esc(q.desc)}</div>
          <div class="q-bar"><i style="width:${pct}%"></i></div>
          <div class="q-reward">${reward}</div>
        </div>
        <div class="q-action">${action}</div>
      </div>`;
  }

  function renderNpc() {
    const npc = scribe();
    $('qNpc').classList.toggle('hidden', !npc);
    if (!npc) return;

    $('qNpcName').textContent = npc.name;
    $('qNpcRole').textContent = npc.role;
    $('qNpcGreet').textContent = npc.greet || '';

    const n = data?.claimable || 0;
    const btn = $('qClaimAll');
    btn.disabled = !n;
    btn.textContent = n ? `Nhận tất cả (${n})` : 'Chưa có việc nào xong';
  }

  function claim(questId) {
    socket.emit('quest:claim', { questId }, (res) => {
      if (!res?.ok) return Panel.toast('warn', 'Chưa nhận được', res?.error || '');
      const extra = [
        `+${res.gold.toLocaleString('vi-VN')} vàng`,
        res.exp ? `+${res.exp.toLocaleString('vi-VN')} kn` : '',
        res.book ? res.book.name : '',
      ].filter(Boolean).join(' · ');
      Panel.toast('levelup', res.name, extra);
    });
  }

  /**
   * Nhận hết một lượt. Server nhận lại từng việc một và tự chốt lại điều kiện —
   * client chỉ gửi đúng một chữ "nhận hết", không gửi kèm danh sách id nào.
   */
  function claimAll() {
    socket.emit('quest:claimAll', {}, (res) => {
      if (!res?.ok) return Panel.toast('warn', 'Chưa nhận được', res?.error || '');

      const extra = [
        `+${res.gold.toLocaleString('vi-VN')} vàng`,
        res.exp ? `+${res.exp.toLocaleString('vi-VN')} kn` : '',
        res.books?.length ? `${res.books.length} Dị Điển` : '',
      ].filter(Boolean).join(' · ');
      Panel.toast('levelup', `Nhận thưởng ${res.count} việc`, extra);

      // Việc hàng ngày nâng mốc theo cấp, nên vừa lên cấp giữa chừng là có việc
      // tụt lại. Im lặng ở đây thì người chơi tưởng nút bấm hụt
      if (res.skipped) {
        Panel.toast('warn', `Còn ${res.skipped} việc chưa nhận được`,
          'Lên cấp giữa chừng làm mốc của việc hàng ngày cao lên.');
      }
    });
  }

  /* ------------------------------------------------ tiện ích --------- */

  const ZONE_NAMES = {
    meadow: 'Đồng Cỏ', mistwood: 'Rừng Sương Mù', bonewaste: 'Hoang Mạc',
    frostmaw: 'Vực Băng', stormpeak: 'Đỉnh Bão Tố', voidshrine: 'Đền Đài Hư Không',
  };
  const zoneName = (id) => ZONE_NAMES[id] || id;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /** Vòng vẽ gọi khi bước vào hoặc bước ra khỏi tầm nói chuyện. */
  function refresh() { if (isOpen()) render(); }

  return { init, update, open, close, toggle, isOpen, refresh };
})();
