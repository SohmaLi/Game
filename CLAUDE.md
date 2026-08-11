# FROZEN — game 2D top-down online

Khám phá real-time · chiến đấu turn-based · PvE tối đa 5 người/nhóm.
Chạy tại **https://game.frozen-top.io.vn**

> Đọc file này trước. Chi tiết thiết kế ở [DESIGN.md](DESIGN.md), hạ tầng ở [SETUP.md](SETUP.md).
> **Trả lời bằng tiếng Việt.**

---

## Chạy và deploy

```bash
node app.js          # local, cổng 3000 (KHÔNG có MySQL ở local)
./deploy.sh          # rsync lên host + npm install + restart
./tools/migrate.sh   # áp db/schema.sql lên MariaDB
node --test tests/           # bộ test (Node có sẵn, không cần cài gì)
node tools/simulate.js 400   # mô phỏng cân bằng chiến đấu
node tools/build-icons.js    # sinh lại public/img/icons.svg từ game-icons.net
node tools/loadtest.js <url> <n>   # đo tải WebSocket
```

⚠️ **Local không có MySQL** — mọi thứ liên quan tài khoản/lưu tiến trình chỉ test
được trên production.

⚠️ **`deploy.sh` phải kill tiến trình node**, không chỉ `touch tmp/restart.txt`:
Passenger giữ tiến trình cũ sống tới khi WebSocket cuối cùng đóng, nên người đang
online sẽ chạy code cũ vô thời hạn. Tiến trình mang tên **`lsnode:/home/frozento/game/`**,
KHÔNG phải đường dẫn tới node — `pkill` sai mẫu thì báo thành công mà không giết
gì. Deploy xong luôn xem `uptimeSec` ở `/health`: còn cao là code mới CHƯA chạy.

⚠️ **Đổi file trong `public/` phải bump `?v=N`** trong `public/index.html`, nếu
không trình duyệt dùng bản cache.

---

## Hạ tầng

| | |
|---|---|
| Host | cPanel InterData · LiteSpeed · CloudLinux |
| SSH | `ssh frozento` (key ed25519 đã cấu hình trong `~/.ssh/config`) |
| Node | v20.19.3 · `/home/frozento/nodevenv/game/20/bin/` |
| Thư mục | `/home/frozento/game` |
| DB | MariaDB 10.6 · `frozento_game` |
| Biến môi trường | cPanel → Setup Node.js App (KHÔNG có file `.env` trên host) |

Đã đo: **100 kết nối WebSocket đồng thời, 0 lỗi, ping 27ms.** WebSocket không
tiêu tốn Entry Process, nên hạn mức 40 EP không phải trần.

---

## Kiến trúc

```
app.js                 Express + Socket.IO, /health, /api
server/
  net.js               mọi sự kiện socket — cửa vào duy nhất từ client
  room.js              phòng: MỘT VÙNG, người chơi, quái lang thang, Thủ Lĩnh, NHIỀU trận song song
  battle.js            bộ máy turn-based
  party.js             nhóm — quyết định ai cùng vào một trận
  roamer.js            quái đi lang thang trên bản đồ khám phá (kể cả Thủ Lĩnh)
  map.js               sinh bản đồ theo seed của vùng, mỗi vùng một bản
  stats.js             CÔNG THỨC sát thương và chỉ số (chỉnh cân bằng ở đây)
  inventory.js         túi đồ, 10 ô trang bị
  loot.js              rớt đồ và sách
  progression.js       cấp độ, kinh nghiệm, điểm chỉ số
  characters.js        CRUD nhân vật + lưu/đọc tiến trình
  auth.js              scrypt + JWT
  data/                items · monsters · skills · skilltree · boons · nations · classes · zones
public/js/
  game.js              vòng vẽ canvas, bàn phím, kết nối
  battle.js            màn chiến đấu
  panel.js             bảng nhân vật (Balo)
  tree.js              cây kỹ năng
  hud.js               HUD 4 thanh góc trái
  ui.js                menu chuột phải, hộp xác nhận
  icons.js             nạp sprite icon, đổi [data-icon] thành SVG
  account.js           đăng nhập / chọn nhân vật / chọn bản đồ
public/vendor/         Tippy.js (tooltip) · SortableJS (kéo thả) — tải sẵn, KHÔNG dùng CDN
tests/                 node --test — chạy trước mỗi lần deploy
```

---

## Nguyên tắc bất di bất dịch

1. **Server authoritative tuyệt đối.** Client chỉ gửi phím bấm và "tôi chọn chiêu
   X vào mục tiêu Y". Mọi con số do server tính. Không bao giờ để client quyết
   định vị trí, sát thương, hay kết quả bốc ngẫu nhiên.

2. **Game loop chỉ chạy khi phòng có người.** Shared hosting, vòng lặp chạy không
   cũng đốt CPU.

3. **Hành động không hoàn tác được phải hỏi lại** — vứt đồ, ghi đè ô Dị Điển,
   chọn lớp, học kỹ năng.

4. **Lưu tiến trình sau mỗi trận và mỗi thao tác túi đồ**, không chỉ lúc thoát.

5. **Nhóm quyết định ai cùng vào trận.** Phòng chỉ là khoảng không gian chung,
   không phải một đội. **Ngoại lệ duy nhất: Thủ Lĩnh** — ai chạm vào cũng nhảy
   được vào trận đang diễn ra, và trốn thoát chỉ rút một mình người bấm.

6. **Trận nổ ra khi quái VỪA chạm vào, không phải khi đang chạm.** Mỗi người giữ
   `contacts` — danh sách con đang đè lên mình. Nhờ vậy con đứng sẵn dưới chân
   lúc hết miễn va chạm phải bỏ đi rồi quay lại mới kéo được ai.

7. **Đo chiều cao thanh cố định bằng `getBoundingClientRect`, ghi vào biến CSS**
   (`--sb-h`, `--nav-h`). Đoán số cứng là cách đã làm thông báo chui xuống dưới
   nút Balo.

---

## Bẫy đã vấp — đừng lặp lại

| Lỗi | Nguyên nhân |
|---|---|
| Đánh xong không thoát màn chiến đấu | `socket.leave(channel)` chạy TRƯỚC `io.to(channel).emit()` → gửi vào kênh rỗng |
| Deploy không ăn | `maxAge` cache · Passenger giữ tiến trình cũ khi còn WebSocket |
| Ô đăng nhập không gõ được W/A/S/D | Bộ bắt phím điều khiển không loại trừ `<input>` |
| Đồ Thường mạnh hơn nhân vật | Thiếu `POWER_SCALE` trong `data/items.js` |
| Đồ Hiếm yếu hơn đồ Thường | Chia đều ngân sách làm loãng chỉ số chính khi hạng cao có nhiều chỉ số |
| 1 người vs 2 quái thắng 0% | Quái dùng chung công thức máu với người chơi |
| Layout chồng lớp | Nhiều thành phần `position: fixed` cùng góc — đo bằng `getBoundingClientRect` trước khi kết luận |
| Thông báo bị nút Balo che | `#toasts` neo `bottom: 14px` trong khi thanh kinh nghiệm z-index cao hơn — phải chừa theo `--sb-h` đo được |
| Đánh xong bị quái kéo lại ngay | Chỉ miễn va chạm thôi không đủ; phải cộng luật "vừa chạm" + cho quái lờ người trong lúc miễn |
| Cấp cao đánh nhau mấy chục vòng không ai chết | `armorK` cố định 60 — giáp cấp 50 chặn >70% sát thương cả hai phe. Phải tăng theo cấp |
| Thủ Lĩnh vùng cấp 50 yếu hơn vùng cấp 10 | Viết tay bảng chỉ số ở cấp cao; người chơi tăng nhanh hơn. Đặt cấp gốc thấp rồi để công thức vùng kéo lên |
| 5 người hạ Thủ Lĩnh trong 2 vòng | Nó ra tay 1 lần/vòng còn nhóm 5 lần — cộng máu vô ích, phải cho đòn quét cả nhóm |
| Đứng trong bụng quái mà không vào trận, nhân vật kẹt cứng | `checkEncounters` vẫn GHI `contacts` trong lúc miễn va chạm. Hết miễn thì con đang đè lên người không còn "vừa chạm" nữa. Phải xoá trắng `contacts` suốt thời gian miễn |
| Thắng trận xong không hiện bảng phần thưởng | Client đọc `rewards.books` nhưng server chỉ gửi `{exp, gold, perPlayer}` → ném lỗi trong `setTimeout`, không ai thấy |
| Trận sau không mở màn chiến đấu | `onState` chỉ mở khi `!state.data`. Một gói `battle:closed` đến muộn là dữ liệu còn mà màn đã ẩn — phải xét chính lớp `hidden` |
| Mỗi đòn đánh hiện 2–3 dòng nhật ký | `socket.on('connect')` bắn lại sau mỗi lần nối lại mạng, và mỗi lần lại gọi `Battle.init` đăng ký thêm một bộ handler |

---

## Trạng thái hiện tại

**Xong:** khung mạng · khám phá + quái lang thang · chiến đấu turn-based · trốn
thoát · 12 Đặc Ân · 4 quốc gia · 5 chỉ số · trang bị 10 ô + 5 hạng + rớt đồ ·
cây kỹ năng (Cây Nền 2 class + Dị Điển 10 ô) · nhóm · tài khoản + 3 nhân vật +
lưu tiến trình · menu chuột phải · **5 vùng bản đồ cấp 1–50** · **Thủ Lĩnh 5
phút một lần, đánh chung không cần nhóm**.

**Xong thêm:** màn chờ vào trận · xoá đồ hàng loạt có lọc theo hạng · icon
game-icons.net (53 hình) · tooltip Tippy · kéo thả túi đồ Sortable · bộ test.

**Chưa xong:** giao diện mời nhóm (API đã chạy, chưa có cách bấm chuột phải vào
người chơi trên bản đồ) · PvP · quái Tinh Anh chưa xuất hiện ngoài bản đồ ·
cơ chế riêng cho từng Thủ Lĩnh (triệu hồi tay sai, hoá cuồng dưới 30% máu) ·
đổi class ở mốc cấp · Thiên Ân (Karma đầy) · chưa class nào dùng Karma.

---

## Quy ước

- Tài liệu, giao diện, commit message, và **câu trả lời** đều bằng **tiếng Việt**
- Comment giải thích **vì sao**, không mô tả lại code
- Cân bằng số liệu thì **đo bằng `tools/simulate.js`**, không đoán
- Đo layout bằng `getBoundingClientRect` rồi mới kết luận, không nhìn ảnh đoán
