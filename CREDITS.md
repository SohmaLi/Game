# Nguồn tài nguyên bên ngoài

Ghi nguồn ở đây là **bắt buộc theo giấy phép**, không phải phép lịch sự. Đừng xoá.

---

## Icon — game-icons.net

Giấy phép **Creative Commons BY 3.0** — dùng thương mại được, nhưng bắt buộc ghi
tên tác giả.

- Nguồn: <https://game-icons.net>
- Kho: <https://github.com/game-icons/icons>
- Tác giả các icon đang dùng: **lorc, delapouite, willdabeast, skoll,
  carl-olsen, sbed**

53 icon đã gộp vào `public/img/icons.svg`. Muốn thêm hoặc đổi icon thì sửa bảng
`WANT` trong `tools/build-icons.js` rồi chạy:

```bash
node tools/build-icons.js
```

Công cụ đó tải từ kho chính thức và sinh lại file sprite. File sprite nằm trong
git nên **lúc deploy không cần mạng**.

---

## Sprite nhân vật, quái và bản đồ — Ninja Adventure

Giấy phép **CC0** (miễn trừ bản quyền). Không bắt buộc ghi nguồn, nhưng tác giả
xứng đáng được nhắc tên.

- Tác giả: **Pixel-Boy** ([@2pblog1](https://twitter.com/2pblog1)) và **AAA**
- Bản gốc: <https://pixel-boy.itch.io/ninja-adventure-asset-pack>
- Bản đang dùng: <https://github.com/sparklinlabs/superpowers-asset-packs> —
  cùng tác giả, cùng giấy phép, tải thẳng được nên công cụ dựng lại chạy tự động

10 hình nhân vật, 1 hình NPC, 16 hình quái và ô nền của 7 vùng đã gộp vào
`public/img/atlas.png` kèm bảng toạ độ `public/img/atlas.json`.

Muốn đổi hình cho một con quái hoặc một vùng thì sửa bảng `CHARS` / `NPCS` /
`MOBS` / `ZONE_TILES` trong `tools/build-sprites.js` rồi chạy:

```bash
node tools/build-sprites.js
```

Ô gốc 16×16, phóng lên đúng **bội số nguyên** (32px trên bản đồ, 48px trong màn
chiến đấu). Phóng tỉ lệ lẻ là pixel chỗ to chỗ bé — hỏng ngay cái nhìn đầu tiên.

---

## Thư viện JavaScript

Đặt trong `public/vendor/`, tải sẵn về chứ không gọi CDN — host chạy được cả khi
mạng ngoài chập chờn, và không rò thông tin người chơi sang bên thứ ba.

| Thư viện | Giấy phép | Dùng để |
|---|---|---|
| [Tippy.js](https://atomiks.github.io/tippyjs/) + Popper | MIT | Tooltip món đồ, tự tránh mép màn hình |
| [SortableJS](https://sortablejs.github.io/Sortable/) | MIT | Kéo thả đồ giữa túi và ô trang bị |

Bản MIT chỉ yêu cầu giữ lại phần ghi bản quyền trong chính file thư viện —
đừng nén hay cắt gọt mấy file trong `public/vendor/`.
