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
node tools/build-sprites.js  # sinh lại public/img/atlas.png từ pack Ninja Adventure
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
  map.js               sinh bản đồ theo seed của vùng — hoang dã hoặc thị trấn
  stats.js             CÔNG THỨC sát thương và chỉ số (chỉnh cân bằng ở đây)
  shop.js              giá cả, quầy hàng, mua bán đồ và SÁCH với thương nhân
  codex.js             Dị Điển: gắn · gỡ · vứt · tiêu sách trùng nâng bậc
  respec.js            rửa điểm chỉ số / điểm kỹ năng, tính phí bằng vàng
  quests.js            Nhật Ký: bộ đếm cộng dồn, việc hàng ngày, nhận thưởng
  inventory.js         túi đồ, 10 ô trang bị
  loot.js              rớt đồ và sách
  progression.js       cấp độ, kinh nghiệm, điểm chỉ số
  characters.js        CRUD nhân vật + lưu/đọc tiến trình
  auth.js              scrypt + JWT
  data/                items · monsters · skills · skilltree · boons · nations · classes · zones · npcs · quests
public/js/
  game.js              vòng vẽ canvas, bàn phím, kết nối
  battle.js            màn chiến đấu
  panel.js             bảng nhân vật (Balo)
  tree.js              cây kỹ năng
  shop.js              cửa hàng thương nhân (Mua / Bán)
  party.js             khung nhóm, thẻ lời mời, menu mời trên bản đồ
  quests.js            Nhật Ký nhiệm vụ (phím J)
  hud.js               HUD 4 thanh góc trái
  ui.js                menu chuột phải, hộp xác nhận
  icons.js             nạp sprite icon, đổi [data-icon] thành SVG
  sprites.js           nạp atlas pixel art, vẽ nhân vật · quái · ô nền
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

5a. **Mọi đường rời nhóm đi qua `Room.dropFromParty`** — tự bấm "Rời", mất kết
   nối, đổi vùng. Hàm đó vừa gỡ tên vừa BÁO cho người còn lại. Hai bản sao của
   cùng một việc là hai chỗ để quên cập nhật một người.

5b. **Vùng an toàn tắt BỐN đường một lúc** — đổ đầy quái, hẹn giờ Thủ Lĩnh, dò
   va chạm, và đồng hồ Thủ Lĩnh gửi cho client. Cả bốn đọc chung cờ `room.safe`;
   bỏ sót một đường là người chơi bị kéo vào trận ngay giữa chợ.

5c. **Thua trận chỉ được lấy đi KINH NGHIỆM** (DESIGN.md §5.2f) — không tụt cấp,
   không mất đồ, không mất vàng. `progression.loseExp` trừ tới 0 rồi dừng; đó là
   chốt chặn cứng, không phải con số để chỉnh cân bằng.

5d. **Quái Tinh Anh đi MỘT MÌNH** — `Room.groupAround` là chỗ duy nhất quyết định
   ai cùng vào một trận với con vừa chạm phải. Tinh Anh đã có máu ×2.2 và sát
   thương ×1.5; kéo thêm cả bầy vào là một trận không ai đi lẻ thắng nổi.

6. **Trận nổ ra khi quái VỪA chạm vào, không phải khi đang chạm.** Mỗi người giữ
   `contacts` — danh sách con đang đè lên mình. Nhờ vậy con đứng sẵn dưới chân
   lúc hết miễn va chạm phải bỏ đi rồi quay lại mới kéo được ai.

6a. **Nhiệm vụ đếm bằng MỘT bảng cộng dồn, không có sổ sách từng việc**
   (DESIGN.md §8b). Không có bước "nhận việc", không có trạng thái đang-làm nào
   phải đồng bộ — một việc là xong khi bộ đếm chạm mốc. Nhờ vậy thêm nhiệm vụ
   mới thì tiến độ cũ tự tính lại, không cần migrate. Việc hàng ngày chạy trên
   cùng bộ đếm đó nhờ một ảnh chụp mốc nền mỗi ngày (`dailyBase`).

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
| Dùng chiêu quét cả nhóm xong màn chiến đấu đứng hình, thanh 20 giây không nhúc nhích | Hoạt cảnh dài hơn `RESOLVE_MS` (2200ms) nên vòng mới tới trước lúc phát xong, rồi client ghi đè trạng thái MỚI bằng trạng thái CŨ vừa phát. Chiêu diện rộng hạ nhiều con cùng lúc là thứ thường xuyên đẩy một vòng qua mốc đó. Phải có `seq` tăng dần + co giãn hoạt cảnh cho vừa |
| Cộng hết điểm kỹ năng mà vào trận không dùng được chiêu nào | `carried` rỗng thì `loadoutFor` chỉ trả về hai chiêu bẩm sinh, và **không có gì trên màn hình nói ra điều đó**. Gỡ hết ở tab Mang Theo chỉ cần vài cú bấm, gắn sách Dị Điển thì trước đây không tự mang chiêu vào trận |
| Icon ô trang bị TRỐNG thò hẳn ra ngoài hàng | `.slot-icon .gi { height: 76% }` trong ô lưới `place-items: center` — ô co theo nội dung nên phần trăm không có gốc, SVG rơi về kích thước mặc định 300×150. Chỉ ô CUỐI lộ ra vì dưới nó không còn hàng nào che. Kích thước ô cố định thì dùng **pixel**, đừng dùng phần trăm |
| Kéo đồ vào ô mà server từ chối thì món đồ ở lại trong ô vĩnh viễn | SortableJS sửa DOM ngay lúc thả, trước khi server trả lời. Server từ chối thì không có gói `character` nào về, không có lần vẽ lại nào. Phải vẽ lại theo dữ liệu server NGAY trong `onAdd` |
| Vừa lên cấp, bấm dấu + thì bị từ chối "không đổi trang bị giữa trận" | `invAction` chặn theo `battleId`, mà `battleId` chỉ được gỡ vài giây sau khi trận xong — đúng lúc bảng kết quả hiện ra. Phải chặn theo trận CÒN SỐNG (`!battle.ended`) |
| Pixel art nhìn nhoè, chỗ to chỗ bé | Phóng tỉ lệ lẻ (16→34). Luôn phóng **bội số nguyên**: 32 trên bản đồ, 48 cho Thủ Lĩnh và màn chiến đấu |
| Mặt đất lỗ chỗ như miếng vá | Ô biến thể lấy từ ô khác sắc độ. Biến thể phải CÙNG TÔNG với ô nền, chỉ khác chi tiết trang trí — và phải thưa (1/11 ô), rải đều thì rối đến mức không thấy con quái đứng đâu |
| Vào thị trấn thì nhân vật kẹt cứng trong một chiếc xe hàng | `pos_x/pos_y` lưu KHÔNG kèm vùng, mà mỗi vùng có vật cản ở chỗ khác nhau. Thoát ở giữa đồng cỏ rồi vào vùng khác là toạ độ cũ rơi trúng tường, đi hướng nào cũng bị va chạm chặn. Phải xét `map.canStand` trước khi dùng lại vị trí đã lưu |
| Rớt mạng xong, bảng nhóm của người ở lại còn treo tên người đã đi | `Room.remove` gọi thẳng `party.leave` — gỡ tên trong bộ nhớ rồi thôi, không ai gửi lại `character` cho người còn lại. Suốt thời gian chưa có khung nhóm thì không nhìn thấy, nên không ai biết |
| Rớt mạng giữa trận thì màn chiến đấu đông cứng phủ lên màn chọn nhân vật | `leaveGame` đóng đủ mọi cửa sổ TRỪ `#battle`. Nó ở z-index 30, màn chọn nhân vật ở 20 — bấm gì cũng không ăn. Kéo theo: `panel.js` chỉ hiện HUD khi `!Battle.isOpen()`, nên vào lại phòng cũng không thấy thanh máu đâu |
| Thua trận không mất gì, trốn thoát thành nút vô nghĩa | `applyRewards` thoát ngay ở dòng đầu khi kết quả không phải `win`, và máu ngoài bản đồ thì không bao giờ đổi. Lao vào Thủ Lĩnh một mình rồi thua có giá đúng bằng 0 |
| Hẹn giờ dọn trận và đổ quái giữ nguyên cả phòng trong bộ nhớ | `setTimeout` không lưu tay cầm, sống 4–20 giây và ôm theo `this`. `RoomManager` xoá phòng trong khoảng đó thì bản đồ và danh sách người chơi vẫn nằm nguyên chờ nó chạy xong. Nay gom hết vào `room.timers`, `stopLoop` dọn một lượt |
| Thêm quái mới vào `data/monsters.js` là bộ test hình đỏ ngay | Đúng ý đồ — nhưng quái Tinh Anh MƯỢN hình quái thường qua trường `sprite`, nên chỗ kiểm phải tra `m.sprite \|\| m.id`, không phải `m.id`. Sinh lại atlas chỉ vì thêm một con quái là chuốc lấy rủi ro lệch cặp `atlas.png`/`atlas.json` |
| Thủ Lĩnh gọi quân lượt hai thì combatant mới trùng id với lượt một | Đếm chỉ số bằng `enemies.length` — con lượt một đã chết nhưng vẫn nằm trong danh sách, và `byId` trả về con tìm thấy trước. Phải có bộ đếm riêng chỉ tăng (`nextEnemyIndex`) |
| Thêm vùng mới xong, CẢ BẢN ĐỒ hoá thành bụi cây trên nền đen | `sprites.js`/`icons.js` từng ghi cứng `?v=21` — một số phiên bản THỨ HAI tách rời `?v=N` của `index.html`. Thêm quái/vùng làm atlas cao thêm, `groundY` dời từ 192 xuống 272; bump index.html mà số kia đứng yên nên trình duyệt ghép **JSON mới với PNG cũ còn trong cache**, toạ độ ô nền rơi trúng hàng vật cản. `atlas.png` + `atlas.json` là MỘT CẶP, phải bust cùng lúc — nay hai file tự đọc `?v=` từ `src` của chính thẻ `<script>`, khỏi có số thứ hai để quên |
| Hai ô Dị Điển gắn CÙNG một kỹ năng | Bậc tra theo `skillId`, nên ô thứ hai không cho thêm gì: cùng chiêu đó, cùng bậc đó, chỉ mất một ô trong mười. Hai ô hiện y hệt nhau nên giao diện không có cách nào cho thấy. Nay `codex.socketBook` từ chối và chỉ thẳng sang đường đúng (`codex:upgrade`) |
| Tiêu sách Dị Điển trùng để nâng bậc thì mất một điểm kỹ năng | `rankPointsSpent` cộng theo TOÀN BỘ bảng bậc, không phân biệt bậc nào mua bằng điểm, bậc nào lên bằng sách. Cả giao diện lẫn chú thích code đều nói việc đó miễn phí, mà mỗi cuốn lại lặng lẽ lấy thêm học phí một điểm. Phải có `book_ranks` tách riêng phần đến từ sách |
| Gỡ sách khỏi ô Dị Điển làm rớt luôn chiêu vẫn mở từ Cây Nền | `releaseSkill` nhấc chiêu khỏi `carried` TRƯỚC khi xét xem nó còn đường nào khác để dùng không. Phải xét `unlockedSkills` trước — còn dùng được thì không đụng gì cả |
| Cấp 60 dư 21 điểm kỹ năng không tiêu vào đâu | Cây Nền 15 + nâng bậc 24 = 39, mà cấp 60 nhận 60. Hệ Tinh Thông là chỗ chứa — nhưng giá phẳng 1 điểm/nấc biến nó thành một tầng sức mạnh mới (+20 điểm phần trăm thắng). Giá tăng dần `1·1·2·2·3` cộng với hạ mỗi nấc xuống một nửa mới đưa về đúng mức chứa điểm thừa |
| Bốc 3 việc hàng ngày từ bể 4 khuôn mà chỉ ra 2 | `for (i = 0; i < Math.min(3, pool.length); i++)` với `pool.splice` bên trong — độ dài teo đi sau mỗi lần bốc nên điều kiện lặp tự thắt lại. Chốt số lượng TRƯỚC vòng lặp |
| Nhật Ký trống trơn ngay sau khi vào phòng | `Quests.update` chỉ được gọi từ sự kiện `character`, mà lúc mới vào phòng trạng thái đến kèm gói `join` (`res.characterState`). Cùng chỗ đã phải nhớ cho `Panel`, `Tree`, `Party` — thêm bảng mới là thêm một chỗ để quên |
| Đã chọn chiêu xong vẫn ngồi hết 20 giây | Người cuối cùng chưa bấm mà RỜI trận (rớt mạng, hoặc trốn thoát khỏi trận Thủ Lĩnh) thì `removeAlly` chỉ gỡ tên rồi thôi — không ai xét lại xem còn ai để chờ nữa không. Cả nhóm chờ một người không còn trong trận |
| `deploy.sh` chạy tới bước khởi động lại rồi im, không in dòng kiểm tra nào | `pkill -f` soi dòng lệnh của MỌI tiến trình, kể cả `bash -c` đang chạy chính câu pkill đó — mẫu nằm nguyên văn trong dòng lệnh của nó. pkill tự giết phiên ssh của mình, ssh trả 255, `set -e` cắt script đúng trước khối KIỂM TRA `uptimeSec`. Deploy vẫn ăn nên không ai để ý, nhưng cái chốt chặn quan trọng nhất thì chưa bao giờ chạy. Viết mẫu kiểu `[g]ame` để nó không tự khớp chính mình |

---

## Trạng thái hiện tại

**Xong:** khung mạng · khám phá + quái lang thang · chiến đấu turn-based · trốn
thoát · 12 Đặc Ân · 4 quốc gia · 5 chỉ số · trang bị 10 ô + 5 hạng + rớt đồ ·
cây kỹ năng (Cây Nền 2 class + Dị Điển 10 ô) · nhóm · tài khoản + 3 nhân vật +
lưu tiến trình · menu chuột phải · **6 vùng bản đồ cấp 1–60** · **Thủ Lĩnh 5
phút một lần, đánh chung không cần nhóm**.

**Xong thêm:** màn chờ vào trận · xoá đồ hàng loạt có lọc theo hạng · icon
game-icons.net (53 hình) · tooltip Tippy · kéo thả túi đồ Sortable · bộ test ·
tự điền bộ mang theo khi nó rỗng · bảng phần thưởng tô màu theo loại ·
**sprite pixel art Ninja Adventure** (10 nhân vật, 1 NPC, 16 quái, ô nền 7 vùng,
cả trên bản đồ lẫn trong màn chiến đấu) · nâng bậc kỹ năng bằng điểm dư · Dị Điển
trùng lặp nâng cấp kỹ năng đang gắn · **Bến Cảng Duskmoor — vùng an toàn có
thương nhân mua bán đồ** (DESIGN.md §6c), nơi vàng cuối cùng có đường ra ·
**giao diện nhóm** (chuột phải mời trên bản đồ, thẻ lời mời có đồng hồ, khung
nhóm dưới HUD, tên đồng đội xanh lá) — chỗ bấm cuối cùng còn thiếu của một hệ
thống server đã chạy đủ từ lâu · **cái giá của thất bại** (DESIGN.md §5.2f):
thua mất 10% kinh nghiệm của cấp hiện tại, hồi sinh chỗ khác trên bản đồ, không
tụt cấp và không mất đồ — lần đầu tiên trong game có lý do để bấm Trốn thoát. ·
**quái Tinh Anh ngoài bản đồ** (2 con trên 15, đi lẻ, quầng tím, đánh tay đôi) ·
**cơ chế riêng cho từng Thủ Lĩnh** (gọi quân · hoá cuồng · tự liền vết thương —
sáu con sáu cách ghép) · **15 quái mỗi bản đồ** thay vì 6.

**Xong đợt này:** **bốn đường ra cho sách Dị Điển** (gỡ khỏi ô · vứt · bán cho
thương nhân · chặn gắn trùng) · **Tinh Thông** — sáu dòng chỉ số nhỏ, giá tăng
dần, chỗ tiêu 21 điểm dư ở cấp 60 · **rửa điểm chỉ số và điểm kỹ năng** bằng
vàng · **đồ rơi theo cấp NGƯỜI CHƠI, hạng theo ĐỘ KHÓ BẢN ĐỒ** (DESIGN.md §6.1b)
· bảng bị động ghi thẳng hiệu quả ra dòng, khỏi phải rê chuột.

**Xong đợt này:** **Nhật Ký nhiệm vụ** (DESIGN.md §8b) — 18 việc vùng, 3 việc
hàng ngày đổi theo ngày, 8 cột mốc; đếm bằng một bảng cộng dồn duy nhất, nhận
thưởng ngay trong bảng ở bất cứ đâu vì đổi vùng là mất nhóm.

**Chưa xong:** **giao dịch giữa người chơi với nhau** (mua bán với
NPC đã xong) · PvP · lá chắn miễn nhiễm vật lý cho Thủ Lĩnh (loại cơ chế thứ tư,
cần class có sẵn đòn phép để đổi sang) · đổi class ở mốc cấp · Thiên Ân (Karma
đầy) · chưa class nào dùng Karma.

---

## Quy ước

- Tài liệu, giao diện, commit message, và **câu trả lời** đều bằng **tiếng Việt**
- Comment giải thích **vì sao**, không mô tả lại code
- Cân bằng số liệu thì **đo bằng `tools/simulate.js`**, không đoán
- Đo layout bằng `getBoundingClientRect` rồi mới kết luận, không nhìn ảnh đoán
