'use strict';

/**
 * Sinh public/img/icons.svg từ kho game-icons.net.
 *
 *   node tools/build-icons.js
 *
 * Chỉ chạy khi cần THÊM hoặc ĐỔI icon — file sprite sinh ra đã nằm trong git,
 * lúc deploy không cần mạng.
 *
 * Giấy phép: game-icons.net phát hành theo CC BY 3.0. Được dùng thương mại,
 * NHƯNG bắt buộc ghi nguồn. Phần ghi nguồn nằm ngay đầu file sprite và trong
 * CREDITS.md — đừng xoá.
 *
 * Mỗi khoá có nhiều tên ứng viên vì kho hay đổi tên icon: lấy được cái nào thì
 * lấy, còn hơn để giao diện thủng một lỗ.
 */

const fs = require('fs');
const path = require('path');

const REPO = 'https://raw.githubusercontent.com/game-icons/icons/master';
const TREE = 'https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1';
const OUT = path.join(__dirname, '..', 'public', 'img', 'icons.svg');

/** khoá dùng trong game -> tên icon ứng viên, ưu tiên từ trái sang */
const WANT = {
  // 10 ô trang bị
  'slot-weapon': ['broadsword', 'pointy-sword'],
  'slot-offhand': ['round-shield', 'cross-shield'],
  'slot-head': ['visored-helm', 'crested-helmet'],
  'slot-chest': ['breastplate', 'chest-armor'],
  'slot-hands': ['gloves', 'gauntlet'],
  'slot-feet': ['boots', 'leather-boot'],
  'slot-cape': ['cape', 'cape-armor'],
  'slot-amulet': ['emerald-necklace', 'gem-pendant'],
  'slot-ring': ['diamond-ring', 'ring'],

  // giao diện
  'ui-bag': ['backpack'],
  'ui-skills': ['book-cover', 'spell-book'],
  'ui-quit': ['exit-door'],
  'ui-gold': ['two-coins'],
  'ui-detail': ['magnifying-glass'],
  'ui-equip': ['upgrade', 'up-card'],
  'ui-trash': ['trash-can'],
  'ui-boss': ['crowned-skull', 'dragon-head'],

  // chiêu thức — khoá là 'sk-' + id trong data/skills.js
  'sk-attack': ['sword-clash', 'pointy-sword'],
  'sk-defend': ['shield-bash', 'round-shield'],
  'sk-heavy_slash': ['saber-slash', 'sword-slice'],
  'sk-whirlwind': ['tornado', 'whirlwind'],
  'sk-iron_skin': ['metal-scales', 'armor-upgrade'],
  'sk-fireball': ['fireball', 'fire-bomb'],
  'sk-frost_spear': ['ice-spear', 'frozen-arrow'],
  'sk-mend': ['healing', 'heart-plus'],
  'sk-taunt': ['shouting', 'screaming'],
  'sk-execute': ['decapitation', 'guillotine'],
  'sk-berserk': ['enrage', 'rage'],
  'sk-barrier': ['magic-shield', 'energy-shield'],
  'sk-meteor': ['meteor-impact', 'falling-rocks'],
  'sk-arcane_surge': ['magic-swirl', 'energy-arrow'],
  'sk-m_bite': ['fangs', 'bite'],
  'sk-m_ambush': ['backstab', 'daggers'],
  'sk-m_curse': ['evil-hand', 'curse'],
  'sk-m_quake': ['earth-crack', 'quake-stomp'],
  'sk-m_wail': ['wolf-howl', 'screaming'],
  'sk-d_venom': ['poison-bottle', 'snake-bite'],
  'sk-d_howl': ['wolf-howl', 'howling'],
  'sk-d_drain': ['life-tap', 'drink-me'],
  'sk-d_bonewall': ['bone-knife', 'spine-arrow'],
  'sk-d_ambush': ['backstab', 'daggers'],

  // 12 Đặc Ân — khoá là 'boon-' + id, hình chọn theo tên "sao" của từng cái
  'boon-1': ['crossed-swords'],       // Lưỡi Kiếm
  'boon-2': ['flame', 'small-fire'],  // Ngọn Lửa
  'boon-3': ['arrowhead', 'bullseye'], // Mũi Tên
  'boon-4': ['snake-bite'],           // Rắn Độc
  'boon-5': ['cross-shield'],         // Tấm Khiên
  'boon-6': ['laurels', 'laurel-crown'], // Vòng Nguyệt Quế
  'boon-7': ['mirror-mirror'],        // Gương Bạc
  'boon-8': ['eagle-emblem', 'heart-wings'], // Phượng Hoàng
  'boon-9': ['wingfoot'],             // Cánh Gió
  'boon-10': ['gold-bar', 'hand-bag'], // Bàn Tay Vàng
  'boon-11': ['water-drop', 'spring'], // Suối Nguồn
  'boon-12': ['linked-rings', 'three-friends'], // Vòng Tay
};

const get = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': 'frozen-game-build' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};

/**
 * Bóc phần ruột của một file icon.
 *
 * Mỗi file có hai lớp: một ô vuông đen phủ kín làm nền, rồi hình vẽ màu trắng
 * đè lên. Phải bỏ ô nền đi — giữ lại thì mọi icon thành một khối đen đặc. Đổi
 * `#fff` thành `currentColor` để icon ăn theo màu chữ của chỗ đặt nó, nhờ vậy
 * cùng một hình dùng được cho cả năm hạng đồ.
 */
function extract(svg) {
  let body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  body = body.replace(/<path d="M0 0h512v512H0z"\s*\/>/g, '');
  body = body.replace(/fill="#fff"/g, 'fill="currentColor"');
  return body.trim();
}

async function main() {
  process.stdout.write('Đang lấy danh sách file trong kho… ');
  const tree = JSON.parse(await get(TREE)).tree.filter((n) => n.path.endsWith('.svg'));
  console.log(`${tree.length} icon`);

  const base = (p) => p.split('/').pop().replace('.svg', '');
  const symbols = [];
  const credits = new Map();   // tác giả -> số icon dùng
  const missing = [];

  for (const [key, cands] of Object.entries(WANT)) {
    const hit = cands.map((c) => tree.find((n) => base(n.path) === c)).find(Boolean)
      || cands.map((c) => tree.find((n) => base(n.path).includes(c))).find(Boolean);

    if (!hit) { missing.push(key); continue; }

    const author = hit.path.split('/')[0];
    credits.set(author, (credits.get(author) || 0) + 1);

    const body = extract(await get(`${REPO}/${hit.path}`));
    symbols.push(`<symbol id="gi-${key}" viewBox="0 0 512 512"><!-- ${hit.path} -->${body}</symbol>`);
    process.stdout.write('.');
  }
  console.log();

  if (missing.length) {
    console.log('KHÔNG TÌM THẤY (giao diện sẽ thiếu chỗ này):', missing.join(', '));
  }

  const authors = [...credits.entries()].sort((a, b) => b[1] - a[1]);
  const header = `<!--
  Icon từ https://game-icons.net — giấy phép Creative Commons BY 3.0.
  Bắt buộc ghi nguồn, ĐỪNG XOÁ đoạn này.
  Tác giả: ${authors.map(([a, n]) => `${a} (${n})`).join(', ')}
  Sinh tự động bởi tools/build-icons.js — sửa tay ở đây là mất khi chạy lại.
-->`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT,
    `${header}\n<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>\n`);

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`Đã ghi ${OUT} — ${symbols.length} icon, ${kb} KB`);
  console.log('Tác giả cần ghi nguồn:', authors.map(([a]) => a).join(', '));
}

main().catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
