'use strict';

/**
 * HUD nhân vật ở góc trái trên: bốn thanh tài nguyên và các ô trạng thái.
 *
 * Hiển thị liên tục ở cả chế độ khám phá lẫn trong trận. Nguồn dữ liệu đổi
 * theo hoàn cảnh — trong trận lấy từ combatant của mình, ngoài trận lấy từ
 * bảng nhân vật — nhưng cách vẽ thì chỉ có một.
 */

const Hud = (() => {
  const $ = (id) => document.getElementById(id);

  /** Tối đa 5 ô trạng thái hiện ra, còn lại gộp vào nút mũi tên. */
  const MAX_VISIBLE_STATUS = 5;

  const BARS = [
    { id: 'hp', label: 'HP' },
    { id: 'mana', label: 'MP' },
    { id: 'rage', label: 'NỘ' },
    { id: 'karma', label: 'KARMA' },
  ];

  /** Biểu tượng và tên tiếng Việt cho từng loại trạng thái. */
  const STATUS = {
    dot: { icon: '☠', name: 'Trúng độc', kind: 'debuff', desc: 'Mất máu mỗi vòng' },
    slow: { icon: '🐌', name: 'Chậm chạp', kind: 'debuff', desc: 'Giảm Nhanh Nhẹn' },
    damageReduction: { icon: '🛡', name: 'Phòng thủ', kind: 'buff', desc: 'Giảm sát thương nhận vào' },
    regen: { icon: '✚', name: 'Hồi phục', kind: 'buff', desc: 'Hồi máu mỗi vòng' },
    stun: { icon: '💫', name: 'Choáng', kind: 'debuff', desc: 'Mất lượt' },
  };

  let expanded = false;
  let data = null;

  function init() {
    $('stMore')?.addEventListener('click', () => {
      expanded = !expanded;
      render();
    });
  }

  function show() { $('playerHud').classList.remove('hidden'); }
  function hide() { $('playerHud').classList.add('hidden'); }

  /**
   * @param src.name @param src.level @param src.className
   * @param src.hp/hpMax/mana/manaMax/rage/rageMax/karma/karmaMax
   * @param src.effects  [{ type, turns }]
   * @param src.resources  danh sách thanh mà class này thật sự dùng
   */
  function set(src) {
    data = src;
    show();
    render();
  }

  function render() {
    if (!data) return;

    $('hudName').textContent = data.name || '—';
    $('hudMeta').textContent = [
      data.className ? classLabel(data.className) : 'Chưa chọn lớp',
      `Cấp ${data.level || 1}`,
    ].join(' · ');

    const used = data.resources || ['hp', 'mana', 'rage', 'karma'];

    for (const bar of BARS) {
      const el = $(`hudBar_${bar.id}`);
      if (!el) continue;

      const cur = Math.max(0, Math.round(data[bar.id] ?? 0));
      const max = Math.max(1, Math.round(data[`${bar.id}Max`] ?? 0));
      const pct = Math.min(100, (cur / max) * 100);

      el.querySelector('i').style.width = `${pct}%`;
      el.querySelector('span').textContent = `${cur} / ${max}`;
      el.classList.toggle('unused', !used.includes(bar.id));
      // Karma đầy = Thiên Ân sẵn sàng, cho nó nhấp nháy để không ai bỏ lỡ
      if (bar.id === 'karma') el.classList.toggle('full', cur >= max);
    }

    renderStatus(data.effects || []);
  }

  function renderStatus(effects) {
    const row = $('hudStatus');
    const extra = $('hudStatusExtra');
    const more = $('stMore');

    // Gộp nhiều lớp cùng loại thành một ô, hiện số lớp thay vì bày 3 ô giống nhau
    const grouped = [];
    for (const e of effects) {
      const found = grouped.find((g) => g.type === e.type);
      if (found) {
        found.stacks++;
        found.turns = Math.max(found.turns, e.turns);
      } else {
        grouped.push({ type: e.type, turns: e.turns, stacks: 1 });
      }
    }

    row.classList.toggle('empty', grouped.length === 0);
    if (!grouped.length) {
      extra.classList.remove('open');
      return;
    }

    const visible = grouped.slice(0, MAX_VISIBLE_STATUS);
    const hidden = grouped.slice(MAX_VISIBLE_STATUS);

    row.querySelectorAll('.st').forEach((n) => n.remove());
    extra.innerHTML = '';

    for (const g of visible) row.insertBefore(chip(g), more);
    for (const g of hidden) extra.appendChild(chip(g));

    more.classList.toggle('hidden', hidden.length === 0);
    more.style.display = hidden.length ? 'grid' : 'none';
    more.textContent = expanded ? '▲' : `▼${hidden.length}`;
    more.classList.toggle('open', expanded);
    extra.classList.toggle('open', expanded && hidden.length > 0);
  }

  function chip(g) {
    const info = STATUS[g.type] || { icon: '◆', name: g.type, kind: 'buff', desc: '' };
    const el = document.createElement('div');
    el.className = `st ${info.kind}`;
    el.title = `${info.name}${g.stacks > 1 ? ` ×${g.stacks}` : ''} — ${info.desc} (còn ${g.turns} vòng)`;
    el.innerHTML = `${info.icon}<span class="st-turns">${g.turns}</span>`;
    return el;
  }

  function classLabel(id) {
    return { warrior: 'Chiến Binh', mage: 'Pháp Sư' }[id] || id;
  }

  /** Ngoài trận: lấy từ bảng nhân vật, Nộ về 0 vì đó là tài nguyên trong trận. */
  function fromCharacter(c) {
    if (!c) return;
    set({
      name: c.name,
      level: c.level,
      className: c.className,
      hp: c.combat.hpMax, hpMax: c.combat.hpMax,
      mana: c.combat.manaMax, manaMax: c.combat.manaMax,
      rage: 0, rageMax: 100,
      karma: c.karma || 0, karmaMax: c.karmaMax || 100,
      resources: c.resources,
      effects: [],
    });
  }

  /** Trong trận: lấy từ combatant của chính mình. */
  function fromCombatant(c) {
    if (!c) return;
    set({
      name: c.name,
      level: c.level,
      className: c.className,
      hp: c.hp, hpMax: c.hpMax,
      mana: c.mana, manaMax: c.manaMax,
      rage: c.rage, rageMax: c.rageMax,
      karma: c.karma, karmaMax: c.karmaMax,
      resources: c.resources,
      effects: c.effects || [],
    });
  }

  return { init, show, hide, set, fromCharacter, fromCombatant, STATUS };
})();
