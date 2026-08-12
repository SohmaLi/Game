# Tài liệu thiết kế — **FROZEN**

> Game 2D top-down online · khám phá real-time · chiến đấu turn-based
> PvE tối đa 5 người/phòng · PvP tối đa 10 người/phòng *(hoãn sang sau)*
> Phiên bản 0.2 — 07/08/2026

**Ký hiệu:** 🔒 đã chốt · 💡 mình đề xuất, chờ duyệt · ❓ còn bỏ ngỏ

---

## 1. Bối cảnh

### 1.1 Thế giới

🔒 Fantasy phương Tây. Một lục địa chia thành nhiều quốc gia. Phép thuật tồn tại và
là một phần của đời sống thường ngày.

💡 **Lục địa Aethelmark.** Từng là lãnh thổ thống nhất dưới một đế chế cổ, nay vỡ thành
nhiều vương quốc tranh giành ảnh hưởng. Phép thuật không phải thứ hiếm hoi dành cho số
ít — nó chảy trong mạch đất, và ai sinh ra ở Aethelmark cũng mang trong mình một dấu
ấn của nó.

### 1.2 Thập Nhị Thần Tọa

💡 Phần lore giải thích vì sao có **đúng 12** đặc ân:

> Trên bầu trời Aethelmark có Mười Hai Vì Sao — người xưa gọi là *Thập Nhị Thần Tọa*.
> Mỗi đứa trẻ sinh ra dưới một vì sao, và vì sao đó ban cho nó một **Đặc Ân**: năng lực
> bẩm sinh không thể học, không thể cho đi, không thể đổi.
>
> Không ai chọn được vì sao của mình. Người ta chỉ chọn được sẽ làm gì với nó.

### 1.3 Bốn quốc gia

🔒 Người chơi chọn quốc gia. Ảnh hưởng: **lore + một đặc quyền riêng của mỗi nước.**

| Quốc gia | Đặc trưng | Thái độ với phép thuật | 💡 Đặc quyền |
|---|---|---|---|
| **Vương quốc Corvane** | Quân sự, kỵ binh nặng, kỷ luật thép | Kiểm soát chặt, chỉ quân đội được dùng | **Kỷ Luật Thép** — +5% Giáp · phí sửa trang bị −30% |
| **Học viện Sylvara** | Thành bang của học giả và pháp sư | Tôn sùng, nghiên cứu không giới hạn | **Tàng Thư Các** — +5% Mana tối đa · học sách Dị Điển rẻ hơn 30% |
| **Liên minh Duskmoor** | Thương nhân, hải cảng, lính đánh thuê | Thực dụng — cái gì bán được thì dùng | **Mối Lợi** — +10% vàng rơi ra · phí giao dịch −50% |
| **Đất hoang Vharn** | Bộ lạc, không vua, sống cùng thú hoang | Bản năng, không sách vở | **Bản Năng Hoang Dã** — +5% Nhanh Nhẹn · nhận ít hơn 10% sát thương từ Thú Vật |

💡 **Nguyên tắc cân bằng:** đặc quyền quốc gia phải **nhỏ và thiên về tiện ích**, không
được định đoạt lối chơi. Nếu Corvane mạnh hơn rõ rệt trong chiến đấu thì 90% người chơi
sẽ chọn Corvane và ba nước còn lại thành trang trí. Đặc quyền ở mức 5–10% là đủ để người
chơi cảm thấy lựa chọn của mình có ý nghĩa mà không tạo ra "nước mạnh nhất".

❓ Đổi quốc gia có được không? Mình đề xuất **không** — quốc gia là gốc gác, giữ nguyên
để lựa chọn ban đầu có sức nặng.

---

## 2. Nhân vật

### 2.1 Nguyên tắc gốc

🔒 Mọi người chơi bắt đầu như nhau. Khác biệt đến từ:
1. **Đặc Ân** — ngẫu nhiên, khóa vĩnh viễn
2. **Quốc gia** — tự chọn
3. **Class** — tự chọn, đổi được ở mốc level

### 2.2 Mười Hai Đặc Ân

🔒 **Cơ chế bốc:** ngẫu nhiên lúc tạo nhân vật · được **rút lại tối đa 3 lần** · sau lần
thứ 3 (hoặc khi người chơi bấm giữ) thì **khóa vĩnh viễn**.

```
  Bốc lần 1  ──►  Giữ?  ──► KHÓA
                   │
                   └─ Rút lại (còn 2 lần)  ──►  ...  ──►  Lần 4 = KHÓA bắt buộc
```

💡 Nguyên tắc thiết kế: **không đặc ân nào khóa class.** Cả 12 đều dùng được cho cả Pháp
Sư lẫn Chiến Binh, chỉ nghiêng khác nhau. Người bốc trúng đặc ân "sai class" mà thấy mình
yếu hơn hẳn thì sẽ bỏ game ngay ngày đầu.

| # | Vì sao | Đặc Ân | Hiệu ứng | Nghiêng về |
|---|---|---|---|---|
| 1 | Lưỡi Kiếm | **Song Kích** | 15% cơ hội đòn đánh thường ra hai lần | Công |
| 2 | Ngọn Lửa | **Cuồng Nộ** | Máu càng thấp sát thương càng cao (tối đa +30% khi dưới 30% HP) | Công |
| 3 | Mũi Tên | **Chí Mạng** | +10% tỉ lệ chí mạng · +25% sát thương chí mạng | Công |
| 4 | Rắn Độc | **Xâm Thực** | Đòn đánh gây thêm sát thương theo thời gian, cộng dồn 3 lớp | Công |
| 5 | Tấm Khiên | **Kiên Định** | Giảm 12% sát thương vật lý nhận vào | Thủ |
| 6 | Vòng Nguyệt Quế | **Hộ Tâm** | Giảm 12% sát thương phép nhận vào | Thủ |
| 7 | Gương Bạc | **Phản Phệ** | Dội lại 15% sát thương nhận được cho kẻ tấn công | Thủ |
| 8 | Phượng Hoàng | **Bất Diệt** | Một lần mỗi trận, hồi sinh với 25% HP khi gục | Thủ |
| 9 | Cánh Gió | **Tốc Hành** | +15% Nhanh Nhẹn — đi trước trong thứ tự lượt | Tiện ích |
| 10 | Bàn Tay Vàng | **Duyên Kho Báu** | +50% tỉ lệ rơi đồ (5% → 7.5% cho sách Dị Điển) | Tiện ích |
| 11 | Suối Nguồn | **Cộng Hưởng** | Giảm 20% mana tiêu hao của kỹ năng chủ động | Hỗ trợ |
| 12 | Vòng Tay | **Đồng Cảm** | Hồi 3% HP cho toàn đội mỗi lượt · chỉ có tác dụng khi đi nhóm | Hỗ trợ |

Phân bố: 4 công · 4 thủ · 2 tiện ích · 2 hỗ trợ.

### 2.3 Năm chỉ số

🔒 **Chốt giữ 5 chỉ số gốc, không thêm.**

Lý do: mỗi cấp cho 3 điểm, tổng cả đời nhân vật là hữu hạn. Thêm chỉ số thứ 6, thứ 7
không làm nhân vật sâu hơn — nó chia nhỏ cùng một số điểm ra nhiều chỗ, khiến mỗi
điểm cộng vào cảm giác nhạt đi, và gần như chắc chắn sinh ra "chỉ số rác" không ai
cộng vào. Chiều sâu đến từ **chỉ số dẫn xuất** (9 dòng ở bảng Chiến đấu) và từ
**trang bị + bị động**. Nếu sau này thấy thiếu, cách rẻ hơn là cho mỗi chỉ số gốc
ảnh hưởng thêm một thứ nữa — ví dụ Ý Chí thêm "giảm thời gian hồi chiêu".

| Chỉ số | Ảnh hưởng |
|---|---|
| **Sức Mạnh** | Sát thương vật lý |
| **Trí Tuệ** | Sát thương phép · Mana tối đa |
| **Thể Chất** | HP tối đa · Giáp |
| **Nhanh Nhẹn** | **Thứ tự ra tay trong lượt** · tỉ lệ né |
| **Ý Chí** | Kháng phép · hồi mana mỗi lượt |

⚠️ **Nhanh Nhẹn là chỉ số nguy hiểm nhất về mặt cân bằng** trong hệ turn-based — nó quyết
định ai đánh trước, mà đánh trước trong turn-based thường là thắng. Cần theo dõi kỹ để
không thành "cứ nhồi Nhanh Nhẹn là vô đối".

---

## 3. Class

### 3.1 Danh sách

🔒 Ra mắt 2 class, thêm sau:

| Class | Nhánh | Vai trò | Tài nguyên | Lối chơi |
|---|---|---|---|---|
| **Chiến Binh** | sức lực | Cận chiến, chịu đòn | HP + **Nộ Khí** | Đánh thường tích Nộ, dùng Nộ tung chiêu mạnh |
| **Pháp Sư** | phép thuật | Sát thương phép | HP + **Mana** | Bùng nổ sớm, mỏng manh, phải tính toán mana |
| *(chưa có)* | bóng tối | — | HP + **Karma** | Tích Karma bằng cách giết |

💡 **Mỗi class chỉ dùng đúng một thanh tài nguyên ngoài HP.** Chiến Binh không có mana,
Pháp Sư không có Nộ. Nếu để một class nhìn hai thanh mà chỉ dùng một thì thanh còn lại
chỉ gây rối. Chiêu của class nào thì tiêu tài nguyên của class đó — *Gồng Mình* của
Chiến Binh tiêu Nộ, không tiêu mana.

### 3.2 Đổi class

🔒 Đổi được, **chỉ tại các mốc level**. 💡 Chi tiết:

| Mốc | Level 10 · 25 · 50 |
|---|---|
| Chi phí | Vàng, tăng dần theo mốc |
| Cây Nền | **Reset toàn bộ**, hoàn lại 100% điểm kỹ năng |
| Cây Dị Điển | **Giữ nguyên sách đã gắn**, nhưng sách không hợp class mới sẽ bị vô hiệu (hiện mờ) |
| Chỉ số | Giữ nguyên, không reset |
| Đặc Ân · Quốc gia | Không đổi |

💡 Sách Dị Điển bị vô hiệu vẫn nằm trong ô — người chơi tự quyết định thay hay giữ (giữ
để phòng khi đổi class về lại). Thay thì mất sách cũ theo quy tắc ở mục 3.4.

### 3.3 Hai cây kỹ năng

🔒 Mỗi class có 2 cây:

```
┌──────────────────────────┐   ┌──────────────────────────┐
│      CÂY NỀN             │   │      CÂY DỊ ĐIỂN         │
│                          │   │                          │
│  Của class, cố định      │   │  10 ô trống              │
│  Mở bằng level + điểm    │   │  Điền bằng SÁCH KỸ NĂNG  │
│  kỹ năng                 │   │  rơi từ quái (5%)        │
│                          │   │                          │
│  → Cùng class thì giống  │   │  → Không ai giống ai     │
│    nhau                  │   │                          │
└──────────────────────────┘   └──────────────────────────┘
      thứ được dạy                thứ nhặt trên xác kẻ địch
```

**Cây Nền** — bộ khung, đảm bảo class hoạt động đúng vai trò dù người chơi xui đồ.

**Cây Dị Điển** — bộ nhận dạng. Tỉ lệ rơi 5% và nhiều loại sách khiến hai người cùng class
sau 50 giờ chơi có bộ kỹ năng khác hẳn nhau. **Đây là thứ giữ chân người chơi lâu dài.**

> 💡 *Dị Điển* — những trang sách rời rạc thu được từ kẻ địch đã ngã xuống, đóng lại thành
> cuốn sách của riêng mình. Với Pháp Sư là sách phép cướp từ tà giáo; với Chiến Binh là
> cẩm nang chiến đấu lột từ xác lính đánh thuê. Không chính thống, không ai dạy — nhưng
> hiệu quả.

### 3.3b Cấu trúc Cây Nền (đã dựng)

Mỗi class 9 nút, chia hai nhánh song song, tổng 15 điểm — đủ mở hết ở cấp 16
(1 điểm mỗi cấp). Hai nhánh **cố ý không loại trừ nhau**: cây mà ép chọn một
nhánh sẽ khiến người chơi tra "build chuẩn" trên mạng rồi làm theo, thay vì tự thử.

```
       nhánh TẤN CÔNG          nhánh PHÒNG THỦ
 T1    Chiêu mở màn            Bị động nền
 T4    Chiêu diện rộng         Chiêu tự vệ
 T8    Bị động tăng lực        Chiêu khống chế
 T12   Chiêu kết liễu          Bị động sinh tồn
 T16          └── chiêu tối thượng ──┘
```

| | Chiến Binh | Pháp Sư |
|---|---|---|
| T1 | Chém Mạnh · Da Thịt Chai Sạn | Hỏa Cầu · Tinh Thần Tập Trung |
| T4 | Xoáy Lốc · Gồng Mình | Băng Thương · Hồi Phục |
| T8 | Cuồng Huyết · Khiêu Khích | Thấu Hiểu Ma Thuật · Khiên Phép |
| T12 | Kết Liễu · Thành Lũy | Thiên Thạch · Suối Nguồn Vô Tận |
| T16 | **Cuồng Chiến** | **Bùng Nổ Ma Lực** |

**Khiêu Khích** là nút quan trọng nhất về mặt thiết kế: nó ép quái phải đánh
Chiến Binh. Không có cơ chế đó thì vai trò "chịu đòn" chỉ là chữ trên giấy —
Chiến Binh không cách nào bảo vệ được Pháp Sư.

⚠️ **Bẫy đã vấp:** Nộ ban đầu tích 8/vòng và tan 6/vòng, tức tăng ròng chỉ 8.
Chém Mạnh giá 25 phải đợi tới vòng 4, mà trận với quái thường chỉ kéo dài 3–5
vòng — chiêu đặc trưng của Chiến Binh gần như không bao giờ dùng được. Đã chỉnh
lên tích 16/đòn, tan 4/vòng: dùng được từ vòng 2.

### 3.4 Quy tắc ô Dị Điển

🔒 Ô đã gắn **thay đổi được**, nhưng **thay thì xóa vĩnh viễn** kỹ năng đang gắn.

💡 Hệ quả cần lường trước: người chơi sẽ **sợ gắn nhầm** và để trống ô, chờ sách tốt hơn.
Cách giảm bớt: cho **xem trước đầy đủ** hiệu ứng sách trước khi gắn, và hiện cảnh báo xác
nhận rõ ràng khi thay ô đã có.

### 3.5 Phân loại kỹ năng

🔒 Hai loại · 🔒 mang tối đa **10 kỹ năng** vào trận.

| Loại | Cách hoạt động | Chiếm ô mang theo? |
|---|---|---|
| **Chủ động** | Chọn dùng trong lượt, tốn mana/nộ, có hồi chiêu | Có |
| **Bị động (học được)** | Luôn có tác dụng | **Có** |
| **Bị động (từ trang bị)** | Luôn có tác dụng | **Không** |

💡 Lý do chia vậy: nếu đồ xịn ăn mất ô kỹ năng thì không ai dám mặc đồ xịn — vô lý. Còn nếu
bị động học được mà miễn phí ô thì chẳng ai phải chọn lựa, cứ bật hết. Cách này bắt người
chơi **đánh đổi thật**: thêm một bị động mạnh = bỏ một chiêu chủ động.

---

## 4. Trang bị

🔒 **10 ô:**

| # | Ô | Ghi chú |
|---|---|---|
| 1 | Vũ khí chính | Quyết định loại sát thương cơ bản |
| 2 | Vũ khí phụ / Khiên | Chiến Binh cầm khiên · Pháp Sư cầm sách/ngọc |
| 3 | Mũ | |
| 4 | Giáp thân | Ô chỉ số lớn nhất |
| 5 | Găng tay | |
| 6 | Giày | Thường cho Nhanh Nhẹn |
| 7 | Áo choàng | |
| 8 | Dây chuyền | |
| 9 | Nhẫn I | |
| 10 | Nhẫn II | Hai ô nhẫn cho phép build lệch |

### 4.1 Phân hạng

🔒 Trang bị cao cấp có kỹ năng bị động. Năm hạng, đã dựng xong:

| Hạng | Màu | Chỉ số chính | Số chỉ số | Bị động | Tỉ lệ rơi |
|---|---|---|---|---|---|
| Thường | Xám | ×1.00 | 1 | — | 61% |
| Tinh Xảo | Trắng | ×1.12 | 2 | — | 28% |
| **Hiếm** | Xanh dương | ×1.28 | 3 | **1** | 8.5% |
| **Sử Thi** | Tím | ×1.45 | 4 | **1** | 2.4% |
| **Truyền Thuyết** | Cam | ×1.70 | 4 | **2** | 0.3% |

Ranh giới ở hạng **Hiếm** — từ đây đồ mới "có tính cách", trước đó chỉ là con số.

### 4.2 Cách sinh đồ

Đồ sinh theo thủ tục, không viết tay từng món: **khuôn nền + hạng + cấp**.

```
chỉ số chính = ngân sách khuôn × POWER_SCALE × hệ số hạng × (1 + 0.12 × (cấp−1))
chỉ số phụ   = 40% chỉ số chính, CỘNG THÊM chứ không chia bớt
```

⚠️ **Hai bẫy đã vấp phải khi dựng, ghi lại để không lặp:**

**1. Đồ mạnh hơn cả nhân vật.** Ngân sách ban đầu chưa quy đổi khiến một chiếc
Giáp Tấm hạng Thường cấp 1 cho +13 Thể Chất (nhân vật gốc chỉ có 5), đẩy máu từ
118 lên 274. Sửa bằng hằng số `POWER_SCALE = 0.28` — **một con số duy nhất chỉnh
sức mạnh toàn bộ trang bị trong game**.

**2. Đồ hạng cao yếu hơn đồ hạng thấp.** Cách chia cũ rải một cục ngân sách cho
tất cả chỉ số, nên hạng càng cao càng nhiều chỉ số thì chỉ số chính càng loãng —
đồ Hiếm có Thể Chất *thấp hơn* đồ Thường cùng ô. Người chơi nhặt được đồ xanh mà
yếu hơn đồ xám thì cả hệ thống rớt đồ mất ý nghĩa. Sửa bằng cách cho chỉ số chính
nhận trọn phần của nó, chỉ số phụ là phần cộng thêm.

Kết quả sau khi sửa (mặc đủ 10 ô, cấp 1, trung bình 300 bộ):

| | Máu | Sát thương | Giáp |
|---|---|---|---|
| Trần trụi | 118 | 23 | 6 |
| Thường | 176 | 34 | 12 |
| Tinh Xảo | 215 | 41 | 16 |
| Hiếm | 253 | 45 | 19 |
| Sử Thi | 266 | 49 | 21 |
| Truyền Thuyết | 320 | 53 | 26 |

### 4.3 Tỉ lệ rơi

| Hạng quái | Cơ hội rơi đồ | Số món tối đa | Sách Dị Điển |
|---|---|---|---|
| Thường | 30% | 1 | 🔒 5% |
| Tinh Anh | 65% | 2 | 15% |
| Thủ Lĩnh | 100% | 4 | 40% |

**Kinh nghiệm và vàng chia đều cho nhóm; ĐỒ thì mỗi người bốc riêng.** Nếu chia
đều thì nhóm 5 người mỗi người được 1/5 món — tức là chẳng ai nhận được gì.

Túi 40 ô. Túi đầy thì đồ rơi bị mất và **báo thẳng cho người chơi** — cố ý không
tự bán hộ, vì tự quyết định thay người chơi với đồ của họ là điều tối kỵ.

---

## 5. Chiến đấu

### 5.1 Hai chế độ

```
   KHÁM PHÁ (real-time)              CHIẾN ĐẤU (turn-based)
   ─────────────────────             ──────────────────────
   Đi lại tự do top-down     ──►     Chạm quái → vào trận
   Quái đi lang thang, đuổi           Chọn kỹ năng theo lượt
   theo khi tới gần                   Server chỉ tính khi có hành động
   Server đồng bộ 15 Hz
```

### 5.1b Cách gặp quái

Quái đi lang thang trên bản đồ. Chạm vào là vào trận — **cùng với những con
đang đứng gần đó**, nên đi vào giữa bầy sói là gặp cả bầy.

| Thông số | Giá trị | Lý do |
|---|---|---|
| Số quái trên bản đồ | 6 mỗi phòng | Đủ đông để luôn có việc làm, đủ thưa để né được |
| Tốc độ quái | 44 px/s | Chậm hơn người chơi (150) — **phải né được thì mới có lựa chọn** |
| Tầm phát hiện | 120 px | Trong tầm này quái đuổi theo, client vẽ dấu `!` đỏ |
| Bán kính gom bầy | 95 px | Quái trong tầm này cùng nhảy vào trận |
| Hồi sinh quái | 20 giây | Không hồi ngay tại chỗ vừa đánh |
| Quái mới sinh | miễn va chạm 5 giây | Vẽ mờ, đứng yên — không kéo ai vào trận |

**Điều kiện nổ trận là quái VỪA chạm vào, không phải đang chạm.** Mỗi người chơi
giữ danh sách những con đang đè lên mình; chỉ con mới xuất hiện trong danh sách
đó mới kéo họ vào trận.

**Sau mỗi trận:** người chơi được miễn va chạm 5 giây, và trong khoảng đó quái
**coi như không nhìn thấy họ** — không đuổi, không chạm. Cộng với luật "vừa chạm"
ở trên, con quái đang đứng đè lên người vừa ra khỏi trận phải bỏ đi rồi quay lại
mới kéo được họ vào trận mới.

> Cách cũ là dạt hết quái quanh đó ra chỗ khác. Nhìn rất kỳ — cả bản đồ nhảy
> dựng lên sau mỗi trận. Quái không cần bay đi đâu cả, chỉ cần đừng chạm vào.

### 5.2 Vòng lượt — chọn đồng thời

```
  ┌─ Bắt đầu vòng ─────────────────────────────────┐
  │  1. Tất cả cùng chọn hành động                  │
  │     ⏱ 20 giây · hết giờ = đánh thường           │
  │  2. Server sắp thứ tự theo Nhanh Nhẹn           │
  │     (cao đi trước · hòa thì random)             │
  │  3. Thực thi lần lượt, gửi hoạt cảnh về client  │
  │  4. Tính hiệu ứng theo lượt (độc, hồi máu...)   │
  └─ Vòng tiếp theo ───────────────────────────────┘
```

💡 Với PvE 5 người thì lần lượt từng người cũng chấp nhận được, nhưng làm chọn đồng thời
ngay từ đầu sẽ **không phải viết lại** khi mở PvP 10 người sau này.

### 5.2b Bốn thanh tài nguyên

🔒 Nhân vật có bốn thanh, hiện ở **góc trái trên**:

| Thanh | Ai có | Vai trò |
|---|---|---|
| **HP** | Mọi class | Máu |
| **Mana** | Class dùng phép (Pháp Sư) | Tiêu cho kỹ năng phép thuật |
| **Nộ Khí** | Class dùng lực (Chiến Binh) | Tích khi đánh và khi bị đánh, tiêu cho chiêu mạnh |
| **Karma** | Mọi class | 💡 xem dưới |

Class không dùng thanh nào thì thanh đó **mờ đi chứ không biến mất** — người chơi
vẫn thấy hệ thống có thanh đó, chỉ là mình không dùng.

🔒 **Karma là tài nguyên của nhánh class bóng tối.** Tích khi **giết** quái hoặc
người chơi (không tích từ sát thương gây ra), và **tự tan dần theo thời gian**.

🔒 **Nộ Khí cũng tự tan dần.** Đây là điểm phân biệt hai thanh này với Mana: Mana đầy
thì cứ nằm đó chờ dùng, còn Nộ và Karma tụt liên tục nên phải tiêu ngay hoặc mất.
Điều đó ép hai lối chơi này phải hung hăng và giữ nhịp, thay vì tích đầy rồi ngồi
chờ thời cơ như Pháp Sư.

| | Tích khi | Tan trong trận | Tan ngoài trận |
|---|---|---|---|
| Nộ Khí | đánh (+8) · bị đánh (+6) | −6 mỗi vòng | −4 mỗi giây |
| Karma | giết quái (+25) · giết người (+40) | −3 mỗi vòng | −1.5 mỗi giây |

Karma tan chậm hơn Nộ vì nó đổi bằng mạng sống của kẻ địch — mất quá nhanh thì công
sức săn giết thành vô nghĩa.

⚠️ **Chưa class nào dùng Karma.** Nó dành cho nhánh bóng tối sẽ thêm sau (Ám Sát Giả,
Tử Linh Sư…). Toàn bộ cơ chế tích và tan đã chạy sẵn, thêm class chỉ cần khai
`resources: ['hp', 'karma']` trong `server/data/classes.js`.

### 5.2c Ô trạng thái

🔒 Hiện tối đa **5 ô**, còn lại gộp vào nút mũi tên, bấm thì xổ xuống.

Nhiều lớp cùng loại gộp thành một ô kèm số lớp (ví dụ *Trúng độc ×3*) thay vì bày ba
ô giống hệt nhau — nếu không thì chỉ riêng hiệu ứng độc cộng dồn đã chiếm hết chỗ.

### 5.2d Trốn thoát

🔒 Trong trận có nút **Trốn thoát**, tỉ lệ thành công dựa trên Nhanh Nhẹn.

```
tỉ lệ = (Nhanh Nhẹn của mình ÷ (Nhanh Nhẹn mình + trung bình kẻ địch)) × 1.2
        kẹp trong khoảng 15% – 90%
```

Ngang tốc độ thì khoảng **60%**. Trốn phải là lựa chọn thật — không được chắc ăn đến
mức trận nào khó cũng bấm thoát, nhưng cũng không được vô vọng đến mức không ai bấm.

- Trốn **tiêu trọn lượt**: hụt thì mất lượt đó, kẻ địch vẫn ra đòn bình thường
- Tỉ lệ dưới 50% thì hiện hộp xác nhận trước khi liều
- **Một người thoát được thì cả nhóm rút** — phòng cùng vào trận thì cùng ra
- Không có phần thưởng, nhưng cũng không mất gì

### 5.2e Nhóm quyết định ai cùng vào trận

🔒 **Chỉ người chạm phải quái và ĐỒNG ĐỘI của họ vào trận.**

⚠️ **Lỗi kiến trúc đã sửa:** trước đây cả phòng cùng vào một trận. Phòng chỉ là
một khoảng không gian chung, không phải một đội — người mới vào phòng bị kéo
thẳng vào trận của người lạ. Nay mỗi nhóm có trận riêng, chạy song song trong
cùng phòng; ai không ở trong trận vẫn đi lại bình thường trên bản đồ.

| | Cùng nhóm | Khác nhóm |
|---|---|---|
| Một người chạm quái | **cả nhóm cùng vào trận** | chỉ người đó vào |
| Trong lúc trận diễn ra | cùng đánh một màn | người kia đi lại bình thường, không thấy trận |

Mỗi trận có một kênh socket riêng, nên người ngoài trận không nhận gói tin của
trận đó — vừa đúng luật chơi vừa đỡ băng thông.

Nhóm tối đa **5 người**, trùng với giới hạn PvE. Mời qua chuột phải vào người
chơi trên bản đồ; lời mời hết hạn sau 30 giây.

### 5.3 Quy mô

| Chế độ | Người chơi | Quái | Trạng thái |
|---|---|---|---|
| **PvE** | 🔒 tối đa 5 | 💡 1–8 tùy trận | 🔒 **Làm trước** |
| PvP | 🔒 tối đa 10 | — | 🔒 **Hoãn lại** |

---

## 6. Quái vật

### 6.1 Chủng loại

🔒 Ba nhóm:

| Nhóm | Ví dụ | Đặc trưng |
|---|---|---|
| **Thú Vật** | Sói xám, gấu vách đá, nhện hang | Nhanh, ít máu, đi theo bầy |
| **Con Người** | Cướp đường, lính đánh thuê, tà giáo | Có trang bị, biết dùng chiến thuật |
| **Xác Sống** | Bộ hài cốt, thây ma, oán linh | Chậm, dai máu, gây hiệu ứng xấu |

### 6.2 Phân hạng

🔒 Mọi quái có đánh thường + 1 kỹ năng chủ chốt · quái cấp cao có thêm kỹ năng.

| Hạng | Kỹ năng | Máu ×  | Sát thương × | Tỉ lệ rơi sách | Vai trò |
|---|---|---|---|---|---|
| **Thường** | 2 | 1.0 | 1.0 | 🔒 5% | Quái nền, farm hàng ngày |
| **Tinh Anh** | 3 | 2.2 | 1.5 | 💡 15% | Rải rác, đáng để tìm |
| **Thủ Lĩnh** | 3 + đòn quét cả nhóm | 16 | 2.2 | 🔒 40% | Cần cả nhóm, một mình không hạ nổi |

**Vì sao Thủ Lĩnh phải có đòn quét diện rộng.** Nó đứng một mình chống cả nhóm,
mỗi vòng chỉ ra tay đúng một lần trong khi năm người ra tay năm lần. Không có
đòn đánh cả nhóm thì cộng bao nhiêu máu cũng chỉ làm trận đấu dài ra chứ không
làm nó nguy hiểm hơn. `m_quake` (vật lý) và `m_wail` (phép, làm chậm) là hai đòn
đó.

Chỉ số Thủ Lĩnh đặt ở **cấp gốc thấp** rồi để công thức tăng theo vùng kéo lên,
y hệt quái thường. Viết tay bảng chỉ số ở cấp cao là sai: sức mạnh người chơi
tăng nhanh hơn, nên Thủ Lĩnh vùng cấp 50 hoá ra lại yếu tương đối hơn Thủ Lĩnh
vùng cấp 10.

#### Luật xuất hiện của Thủ Lĩnh

| Thông số | Giá trị |
|---|---|
| Chu kỳ | 5 phút một con, mỗi vùng một con duy nhất |
| Tự bỏ đi | sau 3 phút nếu không ai hạ được |
| Miễn va chạm khi hiện ra | 5 giây |
| Trần người cùng đánh | 10 |

**Trận Thủ Lĩnh KHÔNG cần nhóm.** Đây là điểm khác biệt duy nhất so với quái
thường (🔒 mục 5.2e):

- Con Thủ Lĩnh **ở lại bản đồ** trong lúc đang bị đánh — đó là cách người thứ
  hai, thứ ba nhìn thấy trận đang diễn ra để bước vào phụ
- Nó **đứng yên** khi đang giao chiến, không đi lôi người ngoài cuộc vào
- **Trốn thoát chỉ rút một mình người bấm**, không kéo theo những người xa lạ
  đang đánh cùng
- Hạ được thì nó biến mất và đồng hồ 5 phút đếm lại; thua hoặc trốn hết thì nó
  ở lại

💡 **Còn bỏ ngỏ:** cơ chế riêng cho từng Thủ Lĩnh — *"mỗi 3 vòng triệu hồi 2 tay
sai"*, *"dưới 30% máu thì hóa cuồng"*, *"miễn nhiễm vật lý cho tới khi phá lá chắn"*.

### 6.3 Sách kỹ năng

🔒 Rơi từ quái, tỉ lệ gốc 5%, điền vào cây Dị Điển.

💡 Bổ sung:
- Sách **theo class** — sách Pháp Sư thì Chiến Binh không đọc được (nhưng bán/trao đổi được)
- Sách có hạng; hạng cao rơi từ quái hạng cao
- Gắn vào ô đã có sách → **xóa vĩnh viễn** sách cũ (🔒 mục 3.4)

---

## 6b. Vùng bản đồ

🔒 **Sáu vùng, mỗi vùng 10 cấp, phủ kín cấp 1 tới 60.** Người chơi chọn vùng
ngay sau khi chọn nhân vật, trước khi vào game.

| # | Vùng | Cấp | Quái | Thủ Lĩnh |
|---|---|---|---|---|
| 1 | **Đồng Cỏ Thanh Bình** | 1–10 | Sói Xám · Cướp Đường | Sói Đầu Đàn |
| 2 | **Rừng Sương Mù** | 11–20 | Nhện Sương · Sói Xám · Cướp Đường | Nhện Mẫu |
| 3 | **Hoang Mạc Xương Trắng** | 21–30 | Bộ Hài Cốt · Xạ Thủ Xương | Tướng Xương |
| 4 | **Vực Băng Vĩnh Cửu** | 31–40 | Oán Hồn Băng · Xạ Thủ Xương | Quỷ Băng |
| 5 | **Đỉnh Bão Tố** | 41–50 | Tín Đồ Bão · Oán Hồn Băng | Sứ Giả Bão |
| 6 | **Đền Đài Hư Không** | 51–60 | Chiến Binh Hư Không · Mắt Hư Không | Chúa Tể Hư Không |

**Vùng chia người chơi ra, không chỉ đổi cảnh.** Mỗi vùng có phòng riêng, bản đồ
riêng, bảng màu riêng và đồng hồ Thủ Lĩnh riêng. Hai người ở hai vùng khác nhau
không bao giờ gặp nhau.

**Điều kiện vào:** cấp ≥ `levelMin` của vùng. Vùng thấp thì luôn vào lại được —
muốn đi dạo chỗ dễ là quyền của người chơi, chỉ có điều phần thưởng ở đó bèo bọt.
Client chỉ khoá thẻ cho dễ nhìn; **server kiểm tra lại lúc vào phòng**, vì client
sửa vài dòng JS là gửi lên vùng cấp 50 với nhân vật cấp 1.

**Bản đồ sinh từ `seed` của vùng** nên cùng một vùng luôn ra đúng một hình dạng
dù server khởi động lại bao nhiêu lần. Đổi `seed` là đổi bản đồ — đã có người
chơi thì đừng đụng vào.

### 6b.1 Quái tăng theo cấp vùng

Cùng một bản mẫu Sói Xám ở vùng 1 và vùng 5 là hai đối thủ hoàn toàn khác nhau.
Mỗi lần sinh ra, quái được kéo về một cấp ngẫu nhiên trong khoảng của vùng:

```
chỉ số   ×= 1 + (cấp − cấp_gốc) × 0.22
exp/vàng ×= 1 + (cấp − cấp_gốc) × 0.55
```

`0.22` là **núm cân bằng duy nhất** cho độ khó theo vùng. Người chơi mỗi cấp vừa
được 3 điểm chỉ số vừa thay trang bị tốt hơn, nên quái phải tăng nhanh hơn mức 3
điểm đó khá nhiều. Đo bằng `tools/simulate.js`: một người đủ trang bị đánh 2 con
cùng cấp thì thắng ~90% và còn khoảng nửa máu, ở cả các vùng.

### 6b.2 Giáp phải nhẹ dần theo cấp

`armorK` trong công thức giảm sát thương **tăng theo cấp của người chịu đòn**
(`60 + 12 × (cấp − 1)`). Giữ nó cố định thì ở cấp cao mọi thứ hoá bọt biển: giáp
cấp 50 vượt xa hằng số 60 nên chặn hơn 70% sát thương của **cả hai phe**, trận
đấu kéo dài mấy chục vòng mà không bên nào nhích được. Cấp 1 vẫn ra đúng con số
cũ, nên phần đầu game không đổi.

---

## 7. Thứ tự xây dựng

| GĐ | Nội dung | Trạng thái |
|---|---|---|
| **0** | Khung mạng, phòng, di chuyển đồng bộ | ✅ **Xong** — đang chạy |
| **1** | Tài khoản, đăng nhập, lưu nhân vật vào MySQL | ✅ **Xong** — cả giao diện lẫn lưu tiến trình |
| **2** | Tạo nhân vật: 12 Đặc Ân (bốc + 3 lần rút lại) · 4 quốc gia · 5 chỉ số | ✅ **Xong** — tối đa 3 nhân vật/tài khoản |
| **3** | **Chiến đấu turn-based PvE** — layout, vòng lượt, 4 loại quái | ✅ **Xong** — chạy trên production |
| **5** | Trang bị 10 ô + rơi đồ + 5 hạng + bảng nhân vật | ✅ **Xong** — chạy trên production |
| **4** | Cây Nền 2 class + hệ mana/nộ + kỹ năng chủ động | ✅ **Xong** |
| **6** | Cây Dị Điển + sách kỹ năng | ✅ **Xong** — 10 ô, sách có kỹ năng thật |
| **7** | Quái Tinh Anh / Thủ Lĩnh + cơ chế riêng | |
| **8** | Đổi class ở mốc level | |
| **9** | *PvP — hoãn, làm sau cùng* | |

**Đã lưu xuống database:** cấp, kinh nghiệm, vàng, 5 chỉ số + điểm chưa tiêu,
lớp, Cây Nền đã học, bộ chiêu mang theo, 10 ô Dị Điển, sách chưa gắn, 10 ô trang
bị, túi đồ, vị trí trên bản đồ. Ghi sau mỗi trận và sau mỗi thao tác túi đồ —
chỉ lưu lúc thoát là không đủ, mất kết nối đột ngột sẽ nuốt cả buổi chơi.

Giai đoạn 3 là chỗ game "thành hình": trước đó chỉ là kỹ thuật, sau đó là nội dung.

---

## 7b. Quy ước giao diện

🔒 **Chuột phải bị chặn trên toàn khu vực game** để nhường chỗ cho menu riêng.
Ngoại lệ: ô nhập liệu vẫn giữ menu của trình duyệt — người chơi cần copy/paste khi
gõ tên nhân vật, cướp mất cái đó là gây khó chịu vô cớ.

Chuột phải vào trang bị / vật phẩm / kỹ năng mở menu nhỏ:

| Mục | Ghi chú |
|---|---|
| 🔍 Xem chi tiết | Cửa sổ đầy đủ: chỉ số, bị động, ô lắp |
| ⬆ Mặc vào / ↩ Tháo ra | Tuỳ món đang ở túi hay đang mặc |
| 🗑 Vứt bỏ | **Luôn hỏi lại.** Đồ hạng Hiếm trở lên cảnh báo mạnh hơn |

Nguyên tắc: mọi hành động không hoàn tác được đều phải qua hộp xác nhận. Mất một
món Truyền Thuyết vì lỡ tay là chuyện người chơi sẽ nhớ rất lâu.

---

## 8. Còn bỏ ngỏ

Không cản trở giai đoạn 1–3, quyết sau cũng được:

1. ❓ Đổi quốc gia có được không? (đề xuất: **không**)
2. ❓ Level tối đa và tốc độ lên cấp
3. ❓ Có giao dịch giữa người chơi không? (ảnh hưởng thiết kế Duskmoor)
4. ❓ Bản đồ: một thế giới chung hay chia khu vực theo level?
5. ❓ Chết thì mất gì — kinh nghiệm, vàng, hay không mất gì?
