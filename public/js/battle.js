'use strict';

/**
 * Màn chiến đấu turn-based.
 *
 * Client không tính một con số nào. Nó nhận trạng thái từ server để vẽ, nhận
 * danh sách sự kiện để phát hoạt cảnh, và gửi lên đúng một thứ: "tôi chọn
 * kỹ năng X nhắm vào Y".
 */

const Battle = (() => {
  const $ = (id) => document.getElementById(id);

  /** Phải khớp với hằng số cùng tên ở server/battle.js */
  const FLEE = '__flee';

  /** Thời lượng mặc định của một sự kiện trong hoạt cảnh (ms). */
  const ACT_MS = 320;   // đòn ra tay — cần lâu hơn để đọc kịp tên chiêu
  const EV_MS = 260;    // gục, độc, hồi máu…

  const ui = {
    root: null, round: null, timerFill: null, timerText: null, phase: null,
    enemies: null, allies: null, order: null, prompt: null, skills: null,
    log: null, result: null, resultTitle: null, resultBody: null, resultClose: null,
    flee: null, fleeChance: null,
    loading: null, loadingTitle: null, loadingFoes: null,
  };

  const state = {
    socket: null,
    myId: null,
    data: null,          // trạng thái trận mới nhất từ server
    pickedSkill: null,   // kỹ năng đang chọn, chờ chọn mục tiêu
    submitted: false,
    timerRAF: null,
    deadlineAt: 0,
    playing: false,      // đang phát hoạt cảnh, khóa thao tác
    loadingTimer: null,  // chốt an toàn cho màn chờ vào trận
    endTimer: null,      // hẹn giờ hiện bảng kết quả
    seq: -1,             // gói trạng thái mới nhất ĐÃ ÁP — xem applyState
    pendingEnd: null,    // kết quả trận đang chờ hoạt cảnh chạy xong
  };

  /* ------------------------------------------------ khởi tạo ------------ */

  function init(socket, myId) {
    state.socket = socket;
    state.myId = myId;

    for (const key of Object.keys(ui)) {
      const map = {
        root: 'battle', round: 'bRound', timerFill: 'bTimerFill', timerText: 'bTimerText',
        phase: 'bPhase', enemies: 'bEnemies', allies: 'bAllies', order: 'bOrder',
        prompt: 'bPrompt', skills: 'bSkills', log: 'bLog', result: 'bResult',
        resultTitle: 'bResultTitle', resultBody: 'bResultBody', resultClose: 'bResultClose',
        flee: 'bFlee', fleeChance: 'bFleeChance',
        loading: 'bLoading', loadingTitle: 'bLoadingTitle', loadingFoes: 'bLoadingFoes',
      };
      ui[key] = $(map[key]);
    }

    ui.resultClose.onclick = () => {
      ui.result.classList.add('hidden');
      close();
    };

    ui.flee.onclick = async () => {
      const self = me();
      const chance = self?.fleeChance ?? 0;
      // Tỉ lệ thấp thì hỏi lại — trốn hụt là mất trắng một lượt, đủ để thua
      // một trận đang cân bằng
      if (chance < 50) {
        const ok = await UI.confirm({
          title: 'Trốn thoát?',
          message: `Tỉ lệ thành công chỉ <b class="warn">${chance}%</b>.<br><br>
            Trốn hụt thì mất trọn lượt này, kẻ địch vẫn ra đòn bình thường.`,
          confirmLabel: 'Cứ thử',
          danger: true,
        });
        if (!ok) return;
      }
      submit(FLEE, null);
    };

    socket.on('battle:opening', showLoading);
    socket.on('battle:state', onState);
    socket.on('battle:resolve', onResolve);
    socket.on('battle:end', onEnd);
    // Server dọn trận sau vài giây, nhưng nếu bảng kết quả đang mở thì để nguyên —
    // người chơi cần thời gian đọc phần thưởng, đóng lúc nào là quyền của họ.
    socket.on('battle:closed', () => {
      hideLoading();
      if (!ui.result.classList.contains('hidden')) return;
      close();
    });
  }

  function setMyId(id) { state.myId = id; }

  function isOpen() { return state.data && !ui.root.classList.contains('hidden'); }

  /**
   * Màn chờ giữa lúc chạm phải quái và lúc trận hiện ra.
   *
   * Server khoá phím ngay khi quyết định mở trận, nên không có màn này thì
   * người chơi thấy nhân vật khựng lại giữa bản đồ vài trăm mili giây mà chưa
   * có gì thay thế — trông hệt như game bị treo.
   */
  function showLoading({ boss, foes } = {}) {
    if (!ui.loading) return;
    const names = (foes || []).map(
      (f) => `<span>${escapeHtml(f.name)}<em>Cấp ${f.level}</em></span>`);
    ui.loadingTitle.textContent = boss ? 'Thủ Lĩnh chặn đường!' : 'Chạm mặt quái!';
    ui.loadingFoes.innerHTML = names.join('') || '<span>…</span>';
    ui.loading.classList.remove('hidden');

    // Chốt an toàn: gói battle:state có thể rớt giữa đường. Thà bỏ màn chờ còn
    // hơn để người chơi nhìn một vòng xoay vĩnh viễn.
    clearTimeout(state.loadingTimer);
    state.loadingTimer = setTimeout(hideLoading, 8000);
  }

  function hideLoading() {
    clearTimeout(state.loadingTimer);
    ui.loading?.classList.add('hidden');
  }

  function open(fresh) {
    hideLoading();
    // Trận mới không bao giờ được hiện kèm bảng kết quả của trận trước
    ui.result.classList.add('hidden');
    ui.root.classList.remove('hidden');
    if (fresh) {
      ui.log.innerHTML = '';
      log('sys', 'Trận đấu bắt đầu!');
    }
  }

  function close() {
    hideLoading();
    clearTimeout(state.endTimer);
    ui.root.classList.add('hidden');
    state.data = null;
    state.pickedSkill = null;
    state.submitted = false;
    state.playing = false;
    state.pendingEnd = null;
    state.seq = -1;
    cancelAnimationFrame(state.timerRAF);
  }

  /* ------------------------------------------------ nhận trạng thái ---- */

  /**
   * Ghi trạng thái mới, nhưng CHỈ khi nó thật sự mới hơn cái đang có.
   *
   * Hoạt cảnh của một vòng mất hơn một giây, và trạng thái đi kèm nó chỉ được
   * áp sau khi phát xong. Vòng sau tới trước lúc đó là chuyện thường — không
   * chặn thì hoạt cảnh vừa xong sẽ ghi đè trạng thái mới bằng trạng thái cũ:
   * thanh 20 giây đứng im, mọi nút kỹ năng khoá cứng, trong khi server vẫn
   * đếm ngược bình thường rồi tự đánh thay. Nhìn y như game treo.
   */
  function applyState(data) {
    if (!data) return false;
    // Trận khác thì đếm lại từ đầu — mỗi trận có bộ số thứ tự riêng, so số của
    // trận này với trận trước là vứt mất gói đầu tiên của trận mới
    const sameBattle = state.data && state.data.battleId === data.battleId;
    if (sameBattle && data.seq != null && state.seq >= 0 && data.seq <= state.seq) return false;
    state.seq = data.seq ?? -1;
    state.data = data;
    return true;
  }

  function onState(data) {
    const fresh = !state.data;
    if (!applyState(data)) return;

    /**
     * Mở màn khi nó đang ẩn, KHÔNG chỉ khi chưa có dữ liệu.
     *
     * Trước đây chỉ xét `!state.data`, nên một gói `battle:closed` đến muộn là
     * đủ để dữ liệu còn nguyên mà màn đã ẩn. Trận sau đó server vẫn mở bình
     * thường — người chơi bị khoá phím đứng im trên bản đồ, không thấy màn
     * chiến đấu đâu. Bám vào trạng thái hiển thị thật thì không lệch được nữa.
     */
    if (fresh || ui.root.classList.contains('hidden')) open(fresh);

    if (data.phase === 'select') {
      state.submitted = data.chosen.includes(state.myId);
      state.deadlineAt = Date.now() + data.msLeft;
      runTimer();
    }
    Hud.fromCombatant(me());
    render();
  }

  function me() {
    return state.data?.combatants.find((c) => c.id === state.myId) || null;
  }

  /* ------------------------------------------------ đồng hồ ----------- */

  function runTimer() {
    cancelAnimationFrame(state.timerRAF);
    const tick = () => {
      if (!state.data || state.data.phase !== 'select') return;
      const left = Math.max(0, state.deadlineAt - Date.now());
      const ratio = left / state.data.selectMs;
      ui.timerFill.style.width = `${ratio * 100}%`;
      ui.timerFill.classList.toggle('urgent', left < 6000);
      ui.timerText.textContent = Math.ceil(left / 1000);
      state.timerRAF = requestAnimationFrame(tick);
    };
    tick();
  }

  /* ------------------------------------------------ vẽ --------------- */

  function render() {
    const d = state.data;
    if (!d) return;

    ui.round.textContent = d.round;
    ui.phase.textContent =
      d.phase === 'select' ? (state.submitted ? 'Đang chờ người khác…' : 'Chọn hành động')
        : d.phase === 'resolve' ? 'Đang xử lý…' : 'Kết thúc';

    ui.enemies.innerHTML = '';
    ui.allies.innerHTML = '';
    for (const c of d.combatants) {
      const el = renderUnit(c);
      (c.side === 'enemy' ? ui.enemies : ui.allies).appendChild(el);
    }

    ui.order.innerHTML = '';
    for (const id of d.order) {
      const c = d.combatants.find((x) => x.id === id);
      if (!c) continue;
      const chip = document.createElement('span');
      chip.className = `ord ${c.side === 'enemy' ? 'enemy' : ''} ${c.id === state.myId ? 'me' : ''}`;
      chip.textContent = c.name;
      ui.order.appendChild(chip);
    }

    renderSkills();
  }

  function renderUnit(c) {
    const el = document.createElement('div');
    el.className = `unit ${c.side} ${c.id === state.myId ? 'me' : ''} ${c.alive ? '' : 'dead'}`;
    el.dataset.id = c.id;

    const hpPct = Math.max(0, (c.hp / c.hpMax) * 100);
    const manaPct = c.manaMax ? (c.mana / c.manaMax) * 100 : 0;
    const ragePct = c.rageMax ? (c.rage / c.rageMax) * 100 : 0;

    const effects = c.effects.map((e) =>
      `<span class="eff ${e.type}">${effectLabel(e.type)} ${e.turns}</span>`).join('');

    const ready = state.data.chosen.includes(c.id) && c.isPlayer && state.data.phase === 'select'
      ? '<div class="unit-ready">✓</div>' : '';

    /**
     * CẢ HAI phe đều quay mặt về phía người xem.
     *
     * Cho đồng đội quay lưng thì đúng với cách hai bên đứng đối diện nhau,
     * nhưng khung nhìn từ sau của bộ sprite này chỉ là một mảng tóc — không
     * phân biệt nổi ai với ai. Đọc được quan trọng hơn đúng phối cảnh.
     * Chưa có sprite thì vẫn là khối màu tròn như trước.
     */
    const block = c.isPlayer ? Sprites.charBlock(c.sprite, c.name) : Sprites.mobBlock(c.sprite);
    const face = Sprites.cssFrame(block, 'down', 3);
    const avatar = face
      ? `<div class="unit-avatar sprite" style="${Object.entries(face)
          .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`).join(';')}"></div>`
      : `<div class="unit-avatar" style="background:${c.color || (c.side === 'enemy' ? '#c05a5a' : '#4c7dff')}"></div>`;

    el.innerHTML = `
      ${ready}
      ${avatar}
      <div class="unit-name">${escapeHtml(c.name)}</div>
      <div class="unit-sub">Cấp ${c.level}${c.tierLabel ? ` · ${c.tierLabel}` : ''} · ⚡${c.speed}</div>
      <div class="bar hp"><i style="width:${hpPct}%"></i></div>
      <div class="bar-text">${c.hp} / ${c.hpMax}</div>
      ${c.isPlayer ? `<div class="bar mana"><i style="width:${manaPct}%"></i></div>` : ''}
      ${c.isPlayer ? `<div class="bar rage"><i style="width:${ragePct}%"></i></div>` : ''}
      <div class="unit-effects">${effects}</div>
    `;

    if (canTarget(c)) {
      el.classList.add('targetable');
      el.onclick = () => chooseTarget(c);
    }
    return el;
  }

  function effectLabel(type) {
    return { dot: 'Độc', slow: 'Chậm', damageReduction: 'Thủ' }[type] || type;
  }

  function renderSkills() {
    const d = state.data;
    const self = me();
    ui.skills.innerHTML = '';

    if (!self?.skills) {
      ui.prompt.textContent = 'Bạn đang theo dõi trận đấu.';
      return;
    }

    const locked = d.phase !== 'select' || state.submitted || !self.alive || state.playing;

    ui.prompt.className = 'b-prompt' + (state.submitted ? ' wait' : '');
    ui.prompt.textContent = !self.alive ? 'Bạn đã gục — chờ hết trận.'
      : state.submitted ? 'Đã chọn xong. Đang chờ người khác…'
        : state.pickedSkill ? `${skillById(state.pickedSkill).name} — chọn mục tiêu`
          : 'Chọn một kỹ năng';

    // Nút trốn thoát: tỉ lệ do server tính từ Nhanh Nhẹn so với kẻ địch
    const chance = self.fleeChance ?? 0;
    ui.flee.disabled = locked;
    ui.fleeChance.textContent = `${chance}%`;
    ui.fleeChance.classList.toggle('risky', chance < 50);
    ui.flee.title = `Tỉ lệ ${chance}% — tính từ Nhanh Nhẹn của bạn so với kẻ địch. Trốn hụt là mất lượt.`;

    for (const s of self.skills) {
      const cd = self.cooldowns[s.id] || 0;
      const notEnoughMana = s.manaCost > self.mana;
      const notEnoughRage = s.rage > 0 && self.rage < s.rage;
      const disabled = locked || cd > 0 || notEnoughMana || notEnoughRage;

      const btn = document.createElement('button');
      btn.className = 'skill' + (state.pickedSkill === s.id ? ' selected' : '');
      btn.disabled = disabled;
      btn.title = s.desc;

      const costs = [];
      if (s.manaCost) costs.push(`<span class="mana">${s.manaCost} mana</span>`);
      if (s.rage > 0) costs.push(`<span class="rage">${s.rage} nộ</span>`);
      if (s.rage < 0) costs.push(`<span class="rage">+${-s.rage} nộ</span>`);
      if (cd > 0) costs.push(`<span class="cd">chờ ${cd} vòng</span>`);
      if (!costs.length) costs.push('miễn phí');

      btn.innerHTML = `
        <div class="skill-name">${Icons.svg(`sk-${s.id}`, { cls: 'gi-sk' })}${escapeHtml(s.name)}</div>
        <div class="skill-cost">${costs.join(' · ')}</div>`;
      btn.onclick = () => pickSkill(s);
      ui.skills.appendChild(btn);
    }
  }

  function skillById(id) {
    return me()?.skills.find((s) => s.id === id) || null;
  }

  /* ------------------------------------------------ thao tác --------- */

  function pickSkill(s) {
    // Kỹ năng không cần chọn mục tiêu thì gửi luôn
    if (s.target === 'self' || s.target === 'allEnemies' || s.target === 'allAllies') {
      return submit(s.id, null);
    }
    state.pickedSkill = state.pickedSkill === s.id ? null : s.id;
    render();
  }

  function canTarget(c) {
    if (!state.pickedSkill || state.submitted || state.playing) return false;
    if (!c.alive) return false;
    const s = skillById(state.pickedSkill);
    if (!s) return false;
    return s.target === 'ally' ? c.side === 'ally' : c.side === 'enemy';
  }

  function chooseTarget(c) {
    if (!canTarget(c)) return;
    submit(state.pickedSkill, c.id);
  }

  function submit(skillId, targetId) {
    state.socket.emit('battle:action', { skillId, targetId }, (res) => {
      if (res?.ok) {
        state.submitted = true;
        state.pickedSkill = null;
      } else {
        log('sys', res?.error || 'Không thực hiện được');
      }
      render();
    });
  }

  /* ------------------------------------------------ hoạt cảnh -------- */

  /**
   * Hệ số co giãn để cả chuỗi hoạt cảnh chạy xong TRƯỚC khi server sang vòng mới.
   *
   * Một vòng có 4 người ra tay, 3 con gục và vài hiệu ứng cuối vòng cần hơn 2,3
   * giây theo nhịp mặc định, trong khi server chỉ chờ 2,2 giây. Chiêu quét cả
   * nhóm (Thiên Thạch, Xoáy Lốc) là thứ thường xuyên đẩy một vòng qua mốc đó vì
   * nó hạ nhiều con cùng lúc. Vòng cuối trận thì không co — không còn vòng nào
   * đuổi theo, và đó lại đúng lúc người chơi muốn xem kỹ.
   */
  function paceOf(events) {
    if (events.some((e) => e.type === 'end')) return 1;
    const budget = (state.data?.resolveMs || 2200) - 250;
    const natural = events.reduce((sum, e) => sum + (e.type === 'act' ? ACT_MS : EV_MS), 0);
    return natural <= budget ? 1 : Math.max(0.35, budget / natural);
  }

  async function onResolve({ events, state: newState }) {
    state.playing = true;
    state.pickedSkill = null;
    state.submitted = false;
    ui.phase.textContent = 'Đang xử lý…';

    const pace = paceOf(events);
    for (const ev of events) {
      await playEvent(ev, pace);
    }

    // Vòng sau có thể đã tới trong lúc phát hoạt cảnh — `applyState` bỏ qua gói
    // cũ hơn thay vì ghi đè lên nó
    applyState(newState);
    state.playing = false;
    Hud.fromCombatant(me());
    render();

    // Bảng kết quả chờ hoạt cảnh chạy hết mới hiện, không cắt ngang đòn cuối
    if (state.pendingEnd) {
      const done = state.pendingEnd;
      state.pendingEnd = null;
      showResult(done);
    }
  }

  function playEvent(ev, pace = 1) {
    return new Promise((resolve) => {
      switch (ev.type) {
        case 'act': {
          animate(ev.actorId, 'acting');
          log('', `<span class="hl">${escapeHtml(ev.actorName)}</span> dùng <b>${escapeHtml(ev.skillName)}</b>`);
          setTimeout(() => {
            for (const h of ev.hits) applyHit(h);
            resolve();
          }, ACT_MS * pace);
          return;
        }
        case 'dot':
          float(ev.id, `-${ev.amount}`, 'dot');
          setBar(ev.id, ev.hp);
          break;
        case 'regen':
          float(ev.id, `+${ev.amount}`, 'heal');
          if (ev.via) log('heal', `<b>${escapeHtml(ev.via)}</b> hồi ${ev.amount} máu`);
          setBar(ev.id, ev.hp);
          break;
        case 'revive':
          log('sys', `<b>${escapeHtml(ev.name)}</b> đứng dậy nhờ Bất Diệt!`);
          float(ev.id, 'HỒI SINH', 'heal');
          setBar(ev.id, ev.hp);
          break;
        case 'flee':
          if (ev.success) {
            log('sys', `<b>${escapeHtml(ev.actorName)}</b> trốn thoát thành công!`);
            float(ev.actorId, 'THOÁT', 'dodge');
          } else {
            log('sys', `${escapeHtml(ev.actorName)} trốn hụt (${ev.chance}%) — mất lượt`);
            float(ev.actorId, 'HỤT', 'dodge');
          }
          break;
        case 'death':
          log('die', `${escapeHtml(ev.name)} đã gục.`);
          document.querySelector(`.unit[data-id="${cssEsc(ev.id)}"]`)?.classList.add('dead');
          break;
        default:
          break;
      }
      setTimeout(resolve, EV_MS * pace);
    });
  }

  function applyHit(h) {
    switch (h.kind) {
      case 'damage':
        animate(h.id, 'hurt');
        float(h.id, `-${h.amount}`, h.crit ? 'crit' : 'damage');
        if (h.crit) log('dmg', `Chí mạng! <b>${h.amount}</b> sát thương`);
        setBar(h.id, h.hp);
        break;
      case 'heal':
        float(h.id, `+${h.amount}`, 'heal');
        if (h.via) log('heal', `<b>${escapeHtml(h.via)}</b> hồi ${h.amount} máu`);
        setBar(h.id, h.hp);
        break;
      case 'dodge':
        float(h.id, 'NÉ', 'dodge');
        break;
      case 'reflect':
        animate(h.id, 'hurt');
        float(h.id, `-${h.amount}`, 'damage');
        if (h.via) log('dmg', `<b>${escapeHtml(h.via)}</b> dội lại ${h.amount} sát thương`);
        setBar(h.id, h.hp);
        break;
      case 'buff':
        float(h.id, 'THỦ', 'heal');
        break;
      default:
        break;
    }
  }

  function unitEl(id) {
    return document.querySelector(`.unit[data-id="${cssEsc(id)}"]`);
  }

  function animate(id, cls) {
    const el = unitEl(id);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // ép trình duyệt chạy lại animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 600);
  }

  function float(id, text, cls) {
    const el = unitEl(id);
    if (!el) return;
    const f = document.createElement('div');
    f.className = `float ${cls}`;
    f.textContent = text;
    el.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }

  /** Cập nhật thanh máu ngay trong lúc phát hoạt cảnh, không chờ hết chuỗi sự kiện. */
  function setBar(id, hp) {
    const el = unitEl(id);
    if (!el) return;
    const c = state.data?.combatants.find((x) => x.id === id);
    if (!c) return;
    const pct = Math.max(0, (hp / c.hpMax) * 100);
    el.querySelector('.bar.hp > i').style.width = `${pct}%`;
    el.querySelector('.bar-text').textContent = `${hp} / ${c.hpMax}`;
  }

  /* ------------------------------------------------ kết thúc --------- */

  /** Màu hạng đồ — phải khớp với RARITY_COLOR trong panel.js. */
  const RARITY_COLOR = {
    common: '#9aa4b8', fine: '#5bd18a', rare: '#5b9cff',
    epic: '#c07bff', legendary: '#ffb648',
  };

  function onEnd({ result, rewards }) {
    hideLoading();
    clearTimeout(state.endTimer);

    // Hoạt cảnh vòng cuối vẫn đang chạy thì xếp hàng chờ — bảng kết quả đè lên
    // đúng lúc con quái cuối đang gục là cướp mất khoảnh khắc duy nhất đáng xem
    if (state.playing) {
      state.pendingEnd = { result, rewards };
      return;
    }
    state.endTimer = setTimeout(() => showResult({ result, rewards }), 900);
  }

  function showResult({ result, rewards }) {
    const titles = { win: 'Chiến thắng', lose: 'Thất bại', draw: 'Bất phân thắng bại', fled: 'Đã trốn thoát' };
    ui.resultTitle.textContent = titles[result] || result;
    ui.resultTitle.className = result === 'fled' ? 'draw' : result;

    if (rewards) {
      /**
       * Phần của CHÍNH MÌNH, không phải của cả nhóm: vàng và đồ mỗi người bốc
       * riêng. Đọc thẳng `rewards.books` là đọc phải phần gộp của cả nhóm —
       * và hồi trước server còn không gửi trường đó, nên chỗ này ném lỗi,
       * bảng kết quả không bao giờ hiện ra sau mỗi trận thắng.
       */
      const mine = rewards.perPlayer?.[state.myId] || {};
      const books = mine.books || rewards.books || [];
      const drops = mine.drops || [];
      const gold = mine.gold ?? rewards.gold ?? 0;

      // Mỗi loại phần thưởng một màu riêng: vàng ra vàng, kinh nghiệm ra tím,
      // vật phẩm ăn theo màu hạng của chính nó. Tô cả bảng một màu thì phải đọc
      // từng chữ mới biết vừa nhặt được món hiếm hay món rác.
      const bookRows = books.length
        ? books.map((b) => `<div class="reward"><span>Sách Dị Điển</span>
             <span class="v book">${escapeHtml(b.name || 'Dị Điển')}</span></div>`).join('')
        : '<div class="reward"><span>Sách Dị Điển</span><span class="v none">không rơi</span></div>';
      const dropRows = drops.map((d) => `
        <div class="reward"><span>Vật phẩm</span>
          <span class="v" style="color:${RARITY_COLOR[d.rarity] || '#e6e9ef'}">${escapeHtml(d.name || '—')}</span>
        </div>`).join('');

      ui.resultBody.innerHTML = `
        <div class="reward"><span>Kinh nghiệm</span><span class="v exp">+${rewards.exp ?? 0}</span></div>
        <div class="reward"><span>Vàng</span><span class="v gold">+${gold}</span></div>
        ${dropRows}
        ${bookRows}`;
    } else if (result === 'fled') {
      ui.resultBody.innerHTML = '<p style="color:#8b95ab">Rút lui an toàn. Không có phần thưởng, nhưng cũng không mất gì.</p>';
    } else {
      ui.resultBody.innerHTML = '<p style="color:#8b95ab">Không nhận được phần thưởng.</p>';
    }

    ui.result.classList.remove('hidden');
  }

  /* ------------------------------------------------ tiện ích --------- */

  function log(cls, html) {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.innerHTML = html;
    ui.log.appendChild(p);
    ui.log.scrollTop = ui.log.scrollHeight;
    while (ui.log.children.length > 80) ui.log.removeChild(ui.log.firstChild);
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const cssEsc = (s) => (window.CSS?.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));

  return { init, setMyId, isOpen, open, close, onState };
})();
