# Kế hoạch setup hạ tầng — Game 2D Online (room-based RPG)

> Hosting: cPanel InterData · User `frozento` · Domain `frozen-top.io.vn`
> Cập nhật: 2026-08-07

---

## 0. Tóm tắt kiến trúc

| Thành phần | Công nghệ | Chạy ở đâu |
|---|---|---|
| Client (game) | HTML5 Canvas + Phaser 3 | Trình duyệt người chơi |
| Server real-time | Node.js + Socket.IO | cPanel → Setup Node.js App |
| Cơ sở dữ liệu | MySQL | cPanel → MySQL Databases |
| Xác thực | JWT (tự viết trong Node) | Node |
| File tĩnh (ảnh, âm thanh, JS) | Node phục vụ qua `express.static` | cPanel |

**Nguyên tắc thiết kế quan trọng:** server là **authoritative** — mọi vị trí, sát thương,
HP, loot đều do server tính. Client chỉ gửi ý định ("tôi muốn đi trái", "tôi tấn công")
và vẽ lại những gì server trả về. Không làm vậy thì game bị hack trong 1 ngày.

**Mô hình phòng:**
- PvE: tối đa 5 người/phòng
- PvP: tối đa 10 người/phòng
- Mỗi phòng là một object trong RAM của Node, có game loop riêng ~20 tick/giây
- Dữ liệu lâu dài (nhân vật, đồ, cấp độ) ghi xuống MySQL, **không** ghi mỗi tick

---

## 1. Tạo subdomain

**cPanel → Domains → Create A New Domain**

| Trường | Giá trị |
|---|---|
| Domain | `game.frozen-top.io.vn` |
| Document Root | `/home/frozento/game` |

⚠️ Bỏ tick "Share document root with..." — phải có thư mục riêng.

Sau khi tạo, kiểm tra thư mục `/home/frozento/game` đã tồn tại.

---

## 2. Bật SSL cho subdomain

Host này **không có AutoSSL**, thay vào đó dùng plugin Let's Encrypt.

**cPanel → Security → Lets Encrypt™ SSL**

1. ⚠️ Phải làm **sau** bước 1 — subdomain chưa tồn tại thì không hiện trong danh sách
2. Ở mục **Issue a new certificate**, tìm dòng `game.frozen-top.io.vn` → bấm **+ Issue**
3. Domain(s): tick `game.frozen-top.io.vn`
   *(bỏ tick `www.game...` nếu có — không cần, và dễ fail nếu chưa trỏ DNS)*
4. Validation method: **HTTP-01** (mặc định)
5. Bấm **Issue** → đợi 1–3 phút

Xác nhận bằng cách mở `https://game.frozen-top.io.vn` — trình duyệt phải hiện ổ khóa,
không cảnh báo. Hoặc kiểm tra ở **Security → SSL/TLS Certificates**.

**Nếu Issue thất bại:** thường do DNS subdomain chưa kịp lan truyền. Đợi 15–30 phút
rồi thử lại.

> Vì sao bắt buộc: trang chạy HTTPS chỉ được mở WebSocket qua `wss://`, mà `wss://`
> đòi chứng chỉ hợp lệ. Thiếu SSL thì client không kết nối được server, game đứng im.

---

## 3. Tạo database MySQL

**cPanel → Databases → MySQL Databases**

1. **Create New Database:** đặt tên `game`
   → cPanel tự thành `frozento_game`
2. **Add New User:** tên `gameapp` → thành `frozento_gameapp`
   - Bấm **Password Generator**, độ dài 20+
   - 🔴 **Lưu password vào trình quản lý mật khẩu của bạn. Đừng gửi cho ai, kể cả trong chat.**
     Lát nữa bạn sẽ dán thẳng nó vào ô Environment Variable của cPanel.
3. **Add User To Database:** chọn user vừa tạo + database vừa tạo → **ALL PRIVILEGES**

Ghi lại (phần không nhạy cảm):
```
DB_HOST = localhost
DB_NAME = frozento_game
DB_USER = frozento_gameapp
DB_PASS = (chỉ nhập trong cPanel, không viết ra đây)
```

---

## 4. Tạo ứng dụng Node.js

**cPanel → Software → Setup Node.js App → CREATE APPLICATION**

| Trường | Giá trị |
|---|---|
| Node.js version | Chọn số **cao nhất** có sẵn (ưu tiên 20.x hoặc 22.x) |
| Application mode | `Production` |
| Application root | `game` |
| Application URL | `game.frozen-top.io.vn` |
| Application startup file | `app.js` |

Bấm **CREATE**.

### 4b. Thêm biến môi trường

Vẫn ở trang đó, mục **Environment variables** → **ADD VARIABLE**, thêm lần lượt:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST` | `localhost` |
| `DB_NAME` | `frozento_game` |
| `DB_USER` | `frozento_gameapp` |
| `DB_PASS` | *(dán password ở bước 3)* |
| `JWT_SECRET` | *(bấm Password Generator lấy chuỗi 40 ký tự ngẫu nhiên)* |

Bấm **SAVE**.

> Để secret ở đây thay vì trong file `.env` — an toàn hơn và không bị lỡ tay commit lên git.

### 4c. Câu lệnh kích hoạt môi trường ✅

Node version đã chọn: **20**. Lệnh vào môi trường app (dùng mỗi khi chạy npm/node qua SSH):

```
source /home/frozento/nodevenv/game/20/bin/activate && cd /home/frozento/game
```

---

## 5. Bật SSH

**cPanel → Security → SSH Access → Manage SSH Keys**

### Cách an toàn (khuyến nghị) — dùng SSH key, không dùng mật khẩu

Trên máy Mac của bạn, chạy:

```bash
ssh-keygen -t ed25519 -C "game-frozento" -f ~/.ssh/frozento_game
```

Nhấn Enter 2 lần (để trống passphrase cho tiện, hoặc đặt nếu bạn muốn chắc).

Rồi lấy nội dung public key:

```bash
cat ~/.ssh/frozento_game.pub
```

Trong cPanel: **Import Key** → dán nội dung vừa copy vào ô **Public Key** →
**Import** → quay lại danh sách → bấm **Manage** cạnh key đó → **Authorize**.

Cuối cùng thêm vào `~/.ssh/config` trên Mac:

```
Host frozento
    HostName frozen-top.io.vn
    User frozento
    Port 22
    IdentityFile ~/.ssh/frozento_game
```

Test:

```bash
ssh frozento "echo OK && node -v"
```

> 🔴 **Quan trọng về bảo mật:** private key (`~/.ssh/frozento_game`, không có `.pub`)
> và mật khẩu cPanel **không được gửi qua chat**. Cách trên đảm bảo mình chạy được
> lệnh `ssh` từ máy bạn mà không bao giờ nhìn thấy thông tin đăng nhập nào.

### Nếu không thấy mục "SSH Access"

Nhiều host tắt SSH mặc định trên gói shared. Mở ticket cho InterData:

> "Chào shop, cho mình xin bật SSH access cho tài khoản hosting frozento
> (domain frozen-top.io.vn) và cho mình biết port SSH. Cảm ơn shop."

Trong lúc chờ, dùng tạm **cPanel → Advanced → Terminal** nếu có.

---

## 6. Cron job giữ app sống

**cPanel → Advanced → Cron Jobs**

Passenger tự tắt app Node khi không có request một thời gian. Cron này đánh thức lại:

| Trường | Giá trị |
|---|---|
| Common Settings | Every 5 minutes (`*/5 * * * *`) |
| Command | `curl -s -o /dev/null https://game.frozen-top.io.vn/health` |

*(Làm bước này **sau** khi code đã lên và có endpoint `/health`.)*

---

## 7. Kiểm tra giới hạn tài nguyên

**cPanel → Metrics → Resource Usage → Current Usage** — ghi lại và gửi mình:

- [ ] CPU limit (%)
- [ ] Physical Memory limit
- [ ] **Entry Processes limit** ← quan trọng nhất
- [ ] Number of Processes limit
- [ ] I/O limit

Entry Processes quyết định bao nhiêu người chơi kết nối cùng lúc được.
Nếu con số này ≤ 20 thì cần tính lại quy mô phòng.

---

## Checklist tổng

- [x] 1. Subdomain `game.frozen-top.io.vn` → Document Root `/home/frozento/game` ✅ (đã xác nhận)
- [x] 2. SSL — cấp 07/08/2026, hết hạn 05/11/2026, đã verify từ bên ngoài ✅
- [ ] 2b. Bật **Force HTTPS Redirect** cho `game.frozen-top.io.vn` (Domains → gạt nút On)
- [x] 3. Database `frozento_game` + user `frozento_gameapp` + ALL PRIVILEGES
- [x] 4. Node.js App (Node 20, root `game`, startup `app.js`) + 6 biến môi trường
      ⚠️ Mật khẩu DB đã đổi lại sau sự cố lộ ảnh chụp; `JWT_SECRET` tách riêng
- [x] 4c. Lệnh activate: `source /home/frozento/nodevenv/game/20/bin/activate && cd /home/frozento/game`
- [x] 5. SSH key authorize xong — `ssh frozento` chạy được từ Mac ✅
- [ ] 6. Cron `/health` — *hoãn, làm sau khi có code*
- [x] 7. Giới hạn tài nguyên — đã ghi nhận (bảng dưới)

---

## Giới hạn tài nguyên thật (CloudLinux LVE)

| Chỉ số | Đang dùng | Giới hạn | Đánh giá |
|---|---|---|---|
| SPEED (CPU) | 0 | **300%** = 3 nhân | Rất thoải mái cho game loop |
| I/O | 0 | 100 MB/s | Không phải lo |
| IOPS | 0 | 1024 | Không phải lo |
| NPROC | 15 | **300** tiến trình | Thoải mái |
| **Entry Processes** | 3 | **40** | ⚠️ **Điểm nghẽn cần đo** |
| RAM | 25 MB | **4 GB** | Rất thoải mái |

### Entry Processes = 40 — ĐÃ ĐO, không còn là vấn đề ✅

Câu hỏi đặt ra ban đầu: mỗi kết nối WebSocket có chiếm 1 Entry Process không?
Nếu có thì trần chỉ ~38 người chơi.

**Đã đo bằng `tools/loadtest.js` ngày 07/08/2026 trên chính production:**

| Số kết nối đồng thời | Kết nối OK | Lỗi | Ping p50 | Ping p95 | RAM app | Phòng |
|---|---|---|---|---|---|---|
| 40 | 40/40 | 0 | 26 ms | 32 ms | 63 MB | 4 |
| **100** | **100/100** | **0** | **27 ms** | **32 ms** | **71 MB** | **10** |

**Kết luận: WebSocket KHÔNG tiêu tốn Entry Process.** Toàn bộ kết nối được ghép vào
một tiến trình Node duy nhất; Entry Process chỉ tính request HTTP thường. 100 kết nối
vượt xa con số 40 mà không có một lỗi nào, và ping không hề tăng khi tải gấp 2.5 lần.

Trần thật là `ulimit -n` = **1024 file descriptor**, trừ hao còn khoảng **900 người chơi
đồng thời** — tức ~90 phòng PvP. Xa hơn nhiều so với nhu cầu.

RAM cũng không phải lo: 100 người chơi + 10 game loop chỉ tốn 71 MB trong hạn mức 4 GB.

---

## Trạng thái hạ tầng (đã kiểm chứng 07/08/2026)

| Hạng mục | Kết quả |
|---|---|
| Web server | **LiteSpeed** (không phải Apache) — hỗ trợ WebSocket tốt |
| OS | CloudLinux 8, kernel 4.18 LVE |
| Node.js | **v20.19.3**, npm 10.8.2 |
| Đường dẫn node | `/home/frozento/nodevenv/game/20/bin/node` |
| Database | **MariaDB 10.6.23** — kết nối từ app OK ✅ |
| SSH | `ssh frozento` (key ed25519, port 22) ✅ |
| MySQL CLI | có sẵn `/usr/bin/mysql` |
| HTTPS | `https://game.frozen-top.io.vn` → **HTTP 200** ✅ |
| Giới hạn open files | `ulimit -n` = 1024 → trần ~1000 kết nối đồng thời |

### Sự cố đã xử lý

**Thiếu `.htaccess`:** cPanel không tự sinh file cấu hình Passenger trong `/home/frozento/game`,
khiến LiteSpeed trả 404 thay vì gọi vào app Node. Đã tạo thủ công:

```apache
PassengerAppRoot "/home/frozento/game"
PassengerBaseURI "/"
PassengerNodejs "/home/frozento/nodevenv/game/20/bin/node"
PassengerAppType node
PassengerStartupFile app.js
```

⚠️ **Không được xóa file này.** Nếu sau này site đột nhiên 404, kiểm tra nó đầu tiên.

### Lệnh hay dùng

```bash
# Kết nối
ssh frozento

# Vào môi trường Node của app
source /home/frozento/nodevenv/game/20/bin/activate && cd /home/frozento/game

# Restart app sau khi đổi code
cloudlinux-selector restart --json --interpreter nodejs --app-root game
```

---

## Sau khi bạn xong, mình sẽ làm

1. Dựng khung server Node: Express + Socket.IO + kết nối MySQL
2. Thiết kế schema DB: `users`, `characters`, `items`, `inventory`, `match_history`
3. Viết room manager: tạo/vào/rời phòng, giới hạn 5 (PvE) và 10 (PvP)
4. Game loop authoritative 20 tick/giây + đồng bộ trạng thái
5. Client Phaser 3: di chuyển, va chạm, animation, HUD
6. Hệ thống chiến đấu, máu, hồi sinh
7. Deploy qua SSH + test độ trễ thật

---

## Rủi ro cần biết trước (không phải để nản, để chuẩn bị)

| Rủi ro | Thực tế | Xử lý |
|---|---|---|
| Passenger kill app Node | Xảy ra khi idle | Cron ở bước 6 |
| Giới hạn Entry Process | Mỗi WebSocket có thể chiếm 1 slot | Đo ở bước 7; nếu chật thì lên VPS |
| CPU shared hosting | Game loop chạy liên tục tốn CPU | Chỉ chạy loop cho phòng **đang có người** |
| Host cảnh báo vượt tài nguyên | Có thể xảy ra khi đông người | Code viết portable, chuyển VPS trong 1 giờ |

Server sẽ được viết bằng Node thuần + Socket.IO, **không phụ thuộc gì vào cPanel**.
Ngày nào cần chuyển sang VPS thì chỉ là copy thư mục + chạy `pm2 start`. Không phải viết lại.
