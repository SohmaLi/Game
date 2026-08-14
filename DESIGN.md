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

| Quốc gia                       | Đặc trưng                                   | Thái độ với phép thuật                      | 💡 Đặc quyền                                                                                     |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Vương quốc Corvane** | Quân sự, kỵ binh nặng, kỷ luật thép     | Kiểm soát chặt, chỉ quân đội được dùng | **Kỷ Luật Thép** — +5% Giáp · phí sửa trang bị −30%                                 |
| **Học viện Sylvara**    | Thành bang của học giả và pháp sư       | Tôn sùng, nghiên cứu không giới hạn        | **Tàng Thư Các** — +5% Mana tối đa · học sách Dị Điển rẻ hơn 30%                |
| **Liên minh Duskmoor**   | Thương nhân, hải cảng, lính đánh thuê | Thực dụng — cái gì bán được thì dùng   | **Mối Lợi** — +10% vàng rơi ra · phí giao dịch −50%                                  |
| **Đất hoang Vharn**     | Bộ lạc, không vua, sống cùng thú hoang   | Bản năng, không sách vở                      | **Bản Năng Hoang Dã** — +5% Nhanh Nhẹn · nhận ít hơn 10% sát thương từ Thú Vật |

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

| #  | Vì sao            | Đặc Ân                 | Hiệu ứng                                                                  | Nghiêng về |
| -- | ------------------ | ------------------------- | --------------------------------------------------------------------------- | ------------ |
| 1  | Lưỡi Kiếm       | **Song Kích**      | 15% cơ hội đòn đánh thường ra hai lần                              | Công        |
| 2  | Ngọn Lửa         | **Cuồng Nộ**      | Máu càng thấp sát thương càng cao (tối đa +30% khi dưới 30% HP)  | Công        |
| 3  | Mũi Tên          | **Chí Mạng**      | +10% tỉ lệ chí mạng · +25% sát thương chí mạng                    | Công        |
| 4  | Rắn Độc         | **Xâm Thực**      | Đòn đánh gây thêm sát thương theo thời gian, cộng dồn 3 lớp    | Công        |
| 5  | Tấm Khiên        | **Kiên Định**    | Giảm 12% sát thương vật lý nhận vào                                 | Thủ         |
| 6  | Vòng Nguyệt Quế | **Hộ Tâm**        | Giảm 12% sát thương phép nhận vào                                    | Thủ         |
| 7  | Gương Bạc       | **Phản Phệ**      | Dội lại 15% sát thương nhận được cho kẻ tấn công                | Thủ         |
| 8  | Phượng Hoàng    | **Bất Diệt**      | Một lần mỗi trận, hồi sinh với 25% HP khi gục                        | Thủ         |
| 9  | Cánh Gió         | **Tốc Hành**      | +15% Nhanh Nhẹn — đi trước trong thứ tự lượt                       | Tiện ích   |
| 10 | Bàn Tay Vàng     | **Duyên Kho Báu** | +50% tỉ lệ rơi đồ (5% → 7.5% cho sách Dị Điển)                    | Tiện ích   |
| 11 | Suối Nguồn       | **Cộng Hưởng**   | Giảm 20% mana tiêu hao của kỹ năng chủ động                         | Hỗ trợ     |
| 12 | Vòng Tay          | **Đồng Cảm**     | Hồi 3% HP cho toàn đội mỗi lượt · chỉ có tác dụng khi đi nhóm | Hỗ trợ     |

Phân bố: 4 công · 4 thủ · 2 tiện ích · 2 hỗ trợ.

### 2.3 Năm chỉ số

🔒 **Chốt giữ 5 chỉ số gốc, không thêm.**

Lý do: mỗi cấp cho 3 điểm, tổng cả đời nhân vật là hữu hạn. Thêm chỉ số thứ 6, thứ 7
không làm nhân vật sâu hơn — nó chia nhỏ cùng một số điểm ra nhiều chỗ, khiến mỗi
điểm cộng vào cảm giác nhạt đi, và gần như chắc chắn sinh ra "chỉ số rác" không ai
cộng vào. Chiều sâu đến từ **chỉ số dẫn xuất** (9 dòng ở bảng Chiến đấu) và từ
**trang bị + bị động**. Nếu sau này thấy thiếu, cách rẻ hơn là cho mỗi chỉ số gốc
ảnh hưởng thêm một thứ nữa — ví dụ Ý Chí thêm "giảm thời gian hồi chiêu".

| Chỉ số              | Ảnh hưởng                                          |
| --------------------- | ----------------------------------------------------- |
| **Sức Mạnh**  | Sát thương vật lý                                |
| **Trí Tuệ**   | Sát thương phép · Mana tối đa                  |
| **Thể Chất**  | HP tối đa · Giáp                                  |
| **Nhanh Nhẹn** | **Thứ tự ra tay trong lượt** · tỉ lệ né |
| **Ý Chí**     | Kháng phép · hồi mana mỗi lượt                 |

⚠️ **Nhanh Nhẹn là chỉ số nguy hiểm nhất về mặt cân bằng** trong hệ turn-based — nó quyết
định ai đánh trước, mà đánh trước trong turn-based thường là thắng. Cần theo dõi kỹ để
không thành "cứ nhồi Nhanh Nhẹn là vô đối".

---

## 3. Class

### 3.1 Danh sách

🔒 Ra mắt 2 class, thêm sau:

| Class                 | Nhánh       | Vai trò                 | Tài nguyên           | Lối chơi                                             |
| --------------------- | ------------ | ------------------------ | ---------------------- | ------------------------------------------------------ |
| **Chiến Binh** | sức lực    | Cận chiến, chịu đòn | HP +**Nộ Khí** | Đánh thường tích Nộ, dùng Nộ tung chiêu mạnh |
| **Pháp Sư**   | phép thuật | Sát thương phép      | HP +**Mana**     | Bùng nổ sớm, mỏng manh, phải tính toán mana     |
| *(chưa có)*       | bóng tối   | —                       | HP +**Karma**    | Tích Karma bằng cách giết                          |

💡 **Mỗi class chỉ dùng đúng một thanh tài nguyên ngoài HP.** Chiến Binh không có mana,
Pháp Sư không có Nộ. Nếu để một class nhìn hai thanh mà chỉ dùng một thì thanh còn lại
chỉ gây rối. Chiêu của class nào thì tiêu tài nguyên của class đó — *Gồng Mình* của
Chiến Binh tiêu Nộ, không tiêu mana.

### 3.2 Đổi class

🔒 Đổi được, **chỉ tại các mốc level**. 💡 Chi tiết:

| Mốc                   | Level 10 · 25 · 50                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Chi phí               | Vàng, tăng dần theo mốc                                                                               |
| Cây Nền              | **Reset toàn bộ**, hoàn lại 100% điểm kỹ năng                                               |
| Cây Dị Điển        | **Giữ nguyên sách đã gắn**, nhưng sách không hợp class mới sẽ bị vô hiệu (hiện mờ) |
| Chỉ số               | Giữ nguyên, không reset                                                                                |
| Đặc Ân · Quốc gia | Không đổi                                                                                              |

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

|     | Chiến Binh                       | Pháp Sư                              |
| --- | --------------------------------- | -------------------------------------- |
| T1  | Chém Mạnh · Da Thịt Chai Sạn | Hỏa Cầu · Tinh Thần Tập Trung     |
| T4  | Xoáy Lốc · Gồng Mình         | Băng Thương · Hồi Phục           |
| T8  | Cuồng Huyết · Khiêu Khích    | Thấu Hiểu Ma Thuật · Khiên Phép  |
| T12 | Kết Liễu · Thành Lũy         | Thiên Thạch · Suối Nguồn Vô Tận |
| T16 | **Cuồng Chiến**           | **Bùng Nổ Ma Lực**            |

**Khiêu Khích** là nút quan trọng nhất về mặt thiết kế: nó ép quái phải đánh
Chiến Binh. Không có cơ chế đó thì vai trò "chịu đòn" chỉ là chữ trên giấy —
Chiến Binh không cách nào bảo vệ được Pháp Sư.

⚠️ **Bẫy đã vấp:** Nộ ban đầu tích 8/vòng và tan 6/vòng, tức tăng ròng chỉ 8.
Chém Mạnh giá 25 phải đợi tới vòng 4, mà trận với quái thường chỉ kéo dài 3–5
vòng — chiêu đặc trưng của Chiến Binh gần như không bao giờ dùng được. Đã chỉnh
lên tích 16/đòn, tan 4/vòng: dùng được từ vòng 2.

### 3.3c Tinh Thông — chỗ tiêu điểm kỹ năng dư

🔒 Đếm cho hết mọi chỗ tiêu điểm của một Chiến Binh **cấp 60**:

| Chỗ tiêu | Điểm |
|---|---:|
| Cây Nền (9 nút) | 15 |
| Nâng bậc 6 chiêu chủ động (4 nấc × 6) | 24 |
| **Tổng** | **39** |
| Nhận được tới cấp 60 | 60 |
| **Dư ra, không tiêu vào đâu được** | **21** |

Đúng con số người chơi báo lại. Ai không lấp đầy 10 ô Dị Điển bằng chiêu nâng
bậc được thì dư còn nhiều hơn.

🔒 **Sáu dòng, mỗi dòng 5 nấc, giá tăng dần `1 · 1 · 2 · 2 · 3`.**

| Dòng | Mỗi nấc | Đi hết dòng |
|---|---|---|
| Thể Phách | +1% Máu tối đa | +5% |
| Cường Kích | +1% Sát thương vật lý | +5% |
| Ma Lực | +1% Sát thương phép | +5% |
| Kiên Giáp | +1,5% Giáp | +7,5% |
| Huyền Kháng | +1,5% Kháng phép | +7,5% |
| Tinh Chuẩn | +0,5% Tỉ lệ chí mạng | +2,5% |

Một dòng đi hết tốn **9 điểm**, cả sáu dòng tốn **54** — nhiều gấp đôi rưỡi số
điểm dư, nên không ai gom đủ. 21 điểm mua được đúng **hai dòng đầy và một chút**.

💡 Vì sao giá tăng dần chứ không phẳng: giá phẳng thì 21 điểm rải đều cả sáu
dòng, và ai cấp 60 cũng giống hệt nhau. Giá tăng dần ép chọn.

⚠️ **Bẫy đã vấp — đo mới biết.** Bản đầu để giá phẳng 1 điểm/nấc và mỗi nấc
2–2,5%. `tools/simulate.js` cho ra:

| Vùng | Tinh Anh đi lẻ, không Tinh Thông | dồn hết 21 điểm |
|---|---:|---:|
| Đồng Cỏ | 61% | **82%** |
| Vực Băng | 63% | **79%** |
| Đền Đài Hư Không | 71% | **86%** |

Cộng gần hai chục điểm phần trăm — đó không còn là chỗ chứa điểm thừa, đó là
một tầng sức mạnh mới. Hạ mỗi nấc xuống một nửa **và** đổi sang giá tăng dần
đưa mức chênh về **+4 đến +12 điểm phần trăm** (trung bình ~7). Đó mới là con
số đúng: đáng đầu tư, không trivial hoá nội dung cấp trần.

### 3.3d Rửa điểm

🔒 Hai loại điểm, hai nút riêng, **trả bằng vàng**:

| Rửa | Trả lại | Giá (cấp 10 · 30 · 60) |
|---|---|---|
| **Chỉ số** | mọi chỉ số về 5, hoàn lại `3 × (cấp − 1)` điểm | 600 · 5.400 · 21.600 |
| **Kỹ năng** | Cây Nền + bậc từng chiêu + Tinh Thông về 0 | 1.000 · 9.000 · 36.000 |

Giá tăng theo **bình phương cấp** vì vàng kiếm được cũng tăng nhanh hơn tuyến
tính (53 vàng/con ở vùng cấp 10, 986 ở vùng cấp 60). Quy ra số quái phải hạ,
giá gần như phẳng ở mọi cấp: 11–30 con cho chỉ số, 19–50 con cho kỹ năng.

💡 Vì sao không miễn phí: rửa miễn phí thì không còn quyết định nào là quyết
định — cứ đổi qua đổi lại trước mỗi trận. Vì sao phải có: cả hai loại điểm đều
tiêu là mất, mà người chơi chỉ biết mình dồn sai sau vài chục giờ. Không có
đường sửa thì lựa chọn duy nhất là bỏ nhân vật làm lại từ cấp 1.

🔒 **Rửa kỹ năng KHÔNG đụng tới Dị Điển.** Sách đã gắn là tài sản, không phải
lựa chọn phân bổ. Bộ mang theo giữ lại đúng những chiêu vẫn còn mở — xoá trắng
thì người chơi vào trận sau khi rửa chỉ còn hai chiêu bẩm sinh mà không hiểu
vì sao.

### 3.4 Quy tắc ô Dị Điển

🔒 Ô đã gắn **thay đổi được**, nhưng **thay thì xóa vĩnh viễn** kỹ năng đang gắn.

💡 Hệ quả cần lường trước: người chơi sẽ **sợ gắn nhầm** và để trống ô, chờ sách tốt hơn.
Cách giảm bớt: cho **xem trước đầy đủ** hiệu ứng sách trước khi gắn, và hiện cảnh báo xác
nhận rõ ràng khi thay ô đã có.

#### Bốn đường ra của một cuốn sách

Mười ô, mà sách thì rơi mãi — nên mỗi cuốn phải có chỗ để đi. Luật nằm trong
`server/codex.js`, `net.js` chỉ là cửa vào.

| Thao tác | Điều kiện | Chuyện xảy ra |
|---|---|---|
| **Gắn** vào ô trống | kỹ năng đó **chưa chiếm ô nào** | chiêu tự vào bộ mang theo nếu còn chỗ |
| **Gắn đè** lên ô đã có | như trên | sách cũ xoá vĩnh viễn, chiêu cũ rời bộ mang theo |
| **Tiêu để nâng bậc** | trùng kỹ năng **đang gắn**, chưa kịch bậc | +1 bậc, **miễn phí** — không tốn điểm kỹ năng |
| **Gỡ khỏi ô** | ô đang có sách | sách xoá vĩnh viễn, bậc mua bằng điểm hoàn lại |
| **Vứt** / **Bán** | sách **chưa gắn** | bán được cho thương nhân ở Duskmoor |

🔒 **Một kỹ năng chỉ chiếm MỘT ô.** Bậc tra theo `skillId`, nên ô thứ hai của cùng
một chiêu không cho thêm gì cả: cùng chiêu đó, cùng bậc đó, chỉ mất một ô trong
mười — và giao diện không có cách nào cho thấy điều đó, hai ô hiện y hệt nhau.

🔒 **Bậc lên bằng sách không tính là điểm kỹ năng đã tiêu.** Đây là lý do tồn tại
của `book_ranks` trong database: `skill_ranks` ghi tổng số bậc, `book_ranks` ghi
phần trong đó đến từ sách. Không tách hai thứ này thì mỗi cuốn Dị Điển "miễn phí"
lại lặng lẽ lấy mất một điểm kỹ năng, mãi mãi.

🔒 **Gỡ ô thì bậc phải quên hẳn** — nhưng chỉ khi kỹ năng không còn đường nào khác
để dùng (Cây Nền có sẵn chiêu đó, hay một ô khác cũng gắn nó). Để bậc nằm lại là
khoá vĩnh viễn một khoản điểm vào thứ không dùng được nữa; xoá lúc còn dùng được
là cướp không của người chơi. Phần bậc đến từ sách mất theo, không đổi ngược thành
điểm — nếu không thì gắn → tiêu sách → gỡ là một cỗ máy in điểm kỹ năng.

### 3.5 Phân loại kỹ năng

🔒 Hai loại · 🔒 mang tối đa **10 kỹ năng** vào trận.

| Loại                                | Cách hoạt động                                       | Chiếm ô mang theo? |
| ------------------------------------ | -------------------------------------------------------- | -------------------- |
| **Chủ động**                | Chọn dùng trong lượt, tốn mana/nộ, có hồi chiêu | Có                  |
| **Bị động (học được)**  | Luôn có tác dụng                                     | **Có**        |
| **Bị động (từ trang bị)** | Luôn có tác dụng                                     | **Không**     |

💡 Lý do chia vậy: nếu đồ xịn ăn mất ô kỹ năng thì không ai dám mặc đồ xịn — vô lý. Còn nếu
bị động học được mà miễn phí ô thì chẳng ai phải chọn lựa, cứ bật hết. Cách này bắt người
chơi **đánh đổi thật**: thêm một bị động mạnh = bỏ một chiêu chủ động.

---

## 4. Trang bị

🔒 **10 ô:**

| #  | Ô                     | Ghi chú                                              |
| -- | ---------------------- | ----------------------------------------------------- |
| 1  | Vũ khí chính        | Quyết định loại sát thương cơ bản            |
| 2  | Vũ khí phụ / Khiên | Chiến Binh cầm khiên · Pháp Sư cầm sách/ngọc |
| 3  | Mũ                    |                                                       |
| 4  | Giáp thân            | Ô chỉ số lớn nhất                                |
| 5  | Găng tay              |                                                       |
| 6  | Giày                  | Thường cho Nhanh Nhẹn                              |
| 7  | Áo choàng            |                                                       |
| 8  | Dây chuyền           |                                                       |
| 9  | Nhẫn I                |                                                       |
| 10 | Nhẫn II               | Hai ô nhẫn cho phép build lệch                    |

### 4.1 Phân hạng

🔒 Trang bị cao cấp có kỹ năng bị động. Năm hạng, đã dựng xong:

| Hạng                     | Màu         | Chỉ số chính | Số chỉ số | Bị động  | Tỉ lệ rơi |
| ------------------------- | ------------ | --------------- | ------------ | ----------- | ------------ |
| Thường                  | Xám         | ×1.00          | 1            | —          | 61%          |
| Tinh Xảo                 | Trắng       | ×1.12          | 2            | —          | 28%          |
| **Hiếm**           | Xanh dương | ×1.28          | 3            | **1** | 8.5%         |
| **Sử Thi**         | Tím         | ×1.45          | 4            | **1** | 2.4%         |
| **Truyền Thuyết** | Cam          | ×1.70          | 4            | **2** | 0.3%         |

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

|                 | Máu | Sát thương | Giáp |
| --------------- | ---- | ------------- | ----- |
| Trần trụi     | 118  | 23            | 6     |
| Thường        | 176  | 34            | 12    |
| Tinh Xảo       | 215  | 41            | 16    |
| Hiếm           | 253  | 45            | 19    |
| Sử Thi         | 266  | 49            | 21    |
| Truyền Thuyết | 320  | 53            | 26    |

### 4.3 Tỉ lệ rơi

| Hạng quái | Cơ hội rơi đồ | Số món tối đa | Sách Dị Điển |
| ----------- | ------------------ | ----------------- | ---------------- |
| Thường    | 30%                | 1                 | 🔒 5%            |
| Tinh Anh    | 65%                | 2                 | 15%              |
| Thủ Lĩnh  | 100%               | 4                 | 40%              |

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

| Thông số                | Giá trị                | Lý do                                                                                |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| Số quái trên bản đồ | **15** mỗi phòng | 47% chỗ đứng có ít nhất một con phát hiện ra bạn (mức 6 chỉ 23%)          |
| Trong đó Tinh Anh       | tối đa 2               | Đi lẻ, quầng tím — xem §6.2                                                     |
| Tốc độ quái           | 44 px/s                  | Chậm hơn người chơi (150) —**phải né được thì mới có lựa chọn** |
| Tầm phát hiện          | 120 px                   | Trong tầm này quái đuổi theo, client vẽ dấu`!` đỏ                          |
| Bán kính gom bầy       | 95 px                    | Quái trong tầm này cùng nhảy vào trận                                          |
| Hồi sinh quái           | 20 giây                 | Không hồi ngay tại chỗ vừa đánh                                                |
| Quái mới sinh           | miễn va chạm 5 giây   | Vẽ mờ, đứng yên — không kéo ai vào trận                                     |

**Điều kiện nổ trận là quái VỪA chạm vào, không phải đang chạm.** Mỗi người chơi
giữ danh sách những con đang đè lên mình; chỉ con mới xuất hiện trong danh sách
đó mới kéo họ vào trận.

**Sau mỗi trận:** người chơi được miễn va chạm 5 giây, và trong khoảng đó quái
**coi như không nhìn thấy họ** — không đuổi, không chạm. Cộng với luật "vừa chạm"
ở trên, con quái đang đứng đè lên người vừa ra khỏi trận phải bỏ đi rồi quay lại
mới kéo được họ vào trận mới.

> Cách cũ là dạt hết quái quanh đó ra chỗ khác. Nhìn rất kỳ — cả bản đồ nhảy
> dựng lên sau mỗi trận. Quái không cần bay đi đâu cả, chỉ cần đừng chạm vào.

**Đông hơn nhưng KHÔNG nguy hiểm hơn nhiều.** Đo trên bản đồ 40×30 ô, 15 con so
với 6 con: xác suất bị hai con cùng phát hiện tăng từ 4% lên 11%, ba con từ 0%
lên 2%. Một mình đánh hai con ở cấp trần vùng vẫn thắng 87–99%, nên không phải bù
trừ ở chỗ nào khác — bản đồ chỉ sống hẳn lên chứ không hoá thành cái bẫy.

⚠️ **Cái giá là băng thông:** gói `state` (15 lần/giây) phình từ ~790 lên ~1990
byte, tức 12 → 29 KB/s cho mỗi người đang online. Chưa phải vấn đề ở quy mô hiện
tại. Nếu tới lúc phải cắt: `n`, `c`, `mid`, `lv` của một con quái KHÔNG BAO GIỜ
đổi mà vẫn được gửi lại mười lăm lần mỗi giây — đó là hơn một phần ba gói tin.

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

| Thanh              | Ai có                         | Vai trò                                                    |
| ------------------ | ------------------------------ | ----------------------------------------------------------- |
| **HP**       | Mọi class                     | Máu                                                        |
| **Mana**     | Class dùng phép (Pháp Sư)  | Tiêu cho kỹ năng phép thuật                            |
| **Nộ Khí** | Class dùng lực (Chiến Binh) | Tích khi đánh và khi bị đánh, tiêu cho chiêu mạnh |
| **Karma**    | Mọi class                     | 💡 xem dưới                                               |

Class không dùng thanh nào thì thanh đó **mờ đi chứ không biến mất** — người chơi
vẫn thấy hệ thống có thanh đó, chỉ là mình không dùng.

🔒 **Karma là tài nguyên của nhánh class bóng tối.** Tích khi **giết** quái hoặc
người chơi (không tích từ sát thương gây ra), và **tự tan dần theo thời gian**.

🔒 **Nộ Khí cũng tự tan dần.** Đây là điểm phân biệt hai thanh này với Mana: Mana đầy
thì cứ nằm đó chờ dùng, còn Nộ và Karma tụt liên tục nên phải tiêu ngay hoặc mất.
Điều đó ép hai lối chơi này phải hung hăng và giữ nhịp, thay vì tích đầy rồi ngồi
chờ thời cơ như Pháp Sư.

|          | Tích khi                                | Tan trong trận | Tan ngoài trận |
| -------- | ---------------------------------------- | --------------- | ---------------- |
| Nộ Khí | đánh (+8) · bị đánh (+6)           | −6 mỗi vòng  | −4 mỗi giây   |
| Karma    | giết quái (+25) · giết người (+40) | −3 mỗi vòng  | −1.5 mỗi giây |

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

|                           | Cùng nhóm                          | Khác nhóm                                             |
| ------------------------- | ------------------------------------ | ------------------------------------------------------- |
| Một người chạm quái  | **cả nhóm cùng vào trận** | chỉ người đó vào                                  |
| Trong lúc trận diễn ra | cùng đánh một màn               | người kia đi lại bình thường, không thấy trận |

Mỗi trận có một kênh socket riêng, nên người ngoài trận không nhận gói tin của
trận đó — vừa đúng luật chơi vừa đỡ băng thông.

Nhóm tối đa **5 người**, trùng với giới hạn PvE. Mời qua chuột phải vào người
chơi trên bản đồ; lời mời hết hạn sau 30 giây.

#### Cách bấm

| Việc             | Ở đâu                                                                    |
| ----------------- | --------------------------------------------------------------------------- |
| Mời              | Chuột phải vào người chơi trên bản đồ →**Mời vào nhóm** |
| Nhận / từ chối | Thẻ nổi ở đáy màn hình, có đồng hồ cạn dần 30 giây            |
| Xem nhóm         | Khung dưới HUD: tên, cấp, ★ nhóm trưởng, ⚔ ai đang trong trận    |
| Rời              | Nút**Rời** trên khung nhóm, hoặc chuột phải vào chính mình  |

Đồng đội trên bản đồ vẽ tên **xanh lá** kèm vòng xanh dưới chân — giữa một chỗ
đông người thì tên trắng nào cũng giống tên trắng nào, mà đây lại đúng là những
người sẽ bị kéo vào trận cùng mình.

Lý do không mời được hiện thẳng dưới tên trong menu (*đang trong trận*, *đang ở
nhóm khác*, *nhóm đã đủ 5 người*) chứ không giấu trong một nút xám câm. Server
vẫn kiểm tra lại từng điều kiện — cái menu đó do client vẽ ra thì client cũng bỏ
qua được.

⚠️ **Rời nhóm chỉ có MỘT đường ở server** (`Room.dropFromParty`), dùng chung cho
cả tự bấm lẫn mất kết nối. Trước đây đường mất kết nối chỉ gỡ tên trong bộ nhớ
mà không báo ai — không lộ ra hồi chưa có khung nhóm.

### 5.2f Cái giá của thất bại

🔒 Thua trận **mất 10% kinh nghiệm của cấp hiện tại**. Ngoài ra không mất gì.

|                                 |                                                                    |
| ------------------------------- | ------------------------------------------------------------------ |
| Kinh nghiệm                    | −10% mốc của cấp đang đứng,**trừ tới 0 rồi dừng** |
| Cấp độ                       | **không bao giờ tụt**                                     |
| Trang bị · túi đồ · vàng | giữ nguyên tuyệt đối                                          |
| Hồi sinh                       | một chỗ khác trên cùng bản đồ, cả nhóm cùng một điểm |
| Miễn va chạm                  | 10 giây, gấp đôi lúc thắng                                   |

**Vì sao 10%.** Đo bằng `tools/simulate.js`: một trận 2 quái ở cấp trần của vùng
cho 13–20% kinh nghiệm một cấp. 10% ≈ đúng công của một trận vừa đánh — từ 0,25
trận ở cấp 1 tới 0,9 trận ở cấp 20. Đủ đau để nút **Trốn thoát** trở thành một
lựa chọn thật, chưa tới mức thua một lần là muốn tắt game.

**Vì sao không mất đồ.** Món Truyền Thuyết rơi ra sau ba tiếng cày là thứ người
chơi nhớ rất lâu. Lấy nó đi vì một trận xui không dạy được gì, chỉ dạy họ đừng
mạo hiểm nữa — mà mạo hiểm chính là thứ game này bán.

**Vì sao không tụt cấp.** Mất một kỹ năng vừa học được là mất luôn cả lối chơi
đang xây dở. Đây là chốt chặn cứng trong `progression.loseExp`, không phải một
con số để chỉnh.

**Vì sao vừa lên cấp thì thua mất 0.** Trừ tới 0 rồi dừng, nên người vừa lên cấp
xong không mất gì. Cố ý: đó đúng là lúc họ đang đi thử một vùng mới.

⚠️ **Trốn thoát và bất phân thắng bại KHÔNG bị phạt.** Trốn phải rẻ hơn thua,
nếu không thì nó chỉ là một cái nút không ai bấm.

⚠️ **Cả nhóm thua thì hồi sinh CÙNG một chỗ.** Bốc điểm riêng cho từng người là
ném năm người ra năm góc bản đồ, và việc đầu tiên họ phải làm sau khi thua là đi
tìm nhau.

❗ **Lỗ hổng đã biết: tắt game trước khi gục thì không mất gì.** Người cuối cùng
rời trận đi qua `Room.dropBattle`, không qua `finish` — nên không có kết quả nào
để phạt. Chưa vá vì cách vá hiển nhiên (rớt mạng = thua) sẽ phạt oan người mất
mạng thật, mà đây là PvE không bảng xếp hạng nên lợi ích gian lận gần bằng 0.
Chỉ trở thành vấn đề khi có PvP hoặc xếp hạng.

### 5.3 Quy mô

| Chế độ     | Người chơi  | Quái              | Trạng thái             |
| ------------- | -------------- | ------------------ | ------------------------ |
| **PvE** | 🔒 tối đa 5  | 💡 1–8 tùy trận | 🔒**Làm trước** |
| PvP           | 🔒 tối đa 10 | —                 | 🔒**Hoãn lại**   |

---

## 6. Quái vật

### 6.1 Chủng loại

🔒 Ba nhóm:

| Nhóm                 | Ví dụ                                        | Đặc trưng                             |
| --------------------- | ---------------------------------------------- | ---------------------------------------- |
| **Thú Vật**   | Sói xám, gấu vách đá, nhện hang         | Nhanh, ít máu, đi theo bầy           |
| **Con Người** | Cướp đường, lính đánh thuê, tà giáo | Có trang bị, biết dùng chiến thuật |
| **Xác Sống**  | Bộ hài cốt, thây ma, oán linh             | Chậm, dai máu, gây hiệu ứng xấu    |

### 6.1b Đồ rơi: cấp theo NGƯỜI CHƠI, hạng theo BẢN ĐỒ

🔒 Hai thứ tách nhau vì chúng trả lời hai câu khác nhau: **cấp** là "món này có
dùng được không", **hạng** là "món này có đáng không".

⚠️ **Bẫy đã vấp:** trước đây cả hai đều bám theo con quái vừa hạ, nên một người
cấp 60 đi ngang Đồng Cỏ chỉ nhặt được đồ cấp 5 — rác tuyệt đối, nhặt lên chỉ để
vứt, và cả vùng đó thành chỗ chết. Cùng lúc đó, phẩm chất ở vùng dễ với vùng khó
y hệt nhau: đứng chỗ an toàn cày lâu cũng ra Truyền Thuyết.

Mỗi vùng có `difficulty` 1–6, quy ra hệ số nhân vào trọng số của Hiếm · Sử Thi ·
Truyền Thuyết (`zones.qualityOf`, cùng chỗ với Duyên Kho Báu). Đo 200.000 lần bốc:

| Vùng | Hệ số | Thường | Tinh Xảo | Hiếm | Sử Thi | T.Thuyết |
|---|---:|---:|---:|---:|---:|---:|
| Đồng Cỏ | 1,00 | 60,2% | 27,1% | 9,7% | 2,6% | 0,45% |
| Rừng Sương Mù | 1,45 | 57,0% | 25,6% | 13,1% | 3,7% | 0,56% |
| Hoang Mạc | 1,90 | 53,9% | 24,4% | 16,3% | 4,7% | 0,70% |
| Vực Băng | 2,35 | 51,5% | 22,9% | 19,3% | 5,5% | 0,83% |
| Đỉnh Bão Tố | 2,80 | 49,0% | 22,1% | 21,9% | 6,2% | 0,91% |
| Đền Đài Hư Không | 3,25 | 46,8% | 21,1% | 24,3% | 6,8% | 1,06% |

💡 Kinh nghiệm và vàng **vẫn** theo con quái, không theo người chơi — nếu không
thì Đồng Cỏ nuôi được nhân vật lên tới cấp 60.

💡 Truyền Thuyết ở vùng khó nhất vẫn chỉ hơn 1%: đủ để đáng đi tìm, không đủ để
thành thứ nhặt hàng ngày.

### 6.2 Phân hạng

🔒 Mọi quái có đánh thường + 1 kỹ năng chủ chốt · quái cấp cao có thêm kỹ năng.

| Hạng                | Kỹ năng                         | Máu × | Sát thương × | Tỉ lệ rơi sách | Vai trò                                   |
| -------------------- | --------------------------------- | ------- | ---------------- | ------------------ | ------------------------------------------ |
| **Thường**   | 2                                 | 1.0     | 1.0              | 🔒 5%              | Quái nền, farm hàng ngày               |
| **Tinh Anh**   | 3                                 | 2.2     | 1.5              | 🔒 15%             | Rải rác, đáng để tìm                |
| **Thủ Lĩnh** | 3 + đòn quét + cơ chế riêng | 8       | 1.1              | 🔒 40%             | Cần cả nhóm, một mình không hạ nổi |

#### Luật xuất hiện của Tinh Anh

🔒 **Mỗi vùng đúng một bản mẫu Tinh Anh, tối đa 2 con cùng lúc trên 15 con.**

|                         |                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------- |
| Hình                   | mượn hình quái thường cùng họ, vẽ 48px + quầng**tím** + dấu ◈ |
| Bán kính · tốc độ | 14 · 38 — to hơn quái thường (11 · 44), chạy là thoát được          |
| Đi cùng ai            | **KHÔNG AI.** Chạm vào nó là đánh tay đôi                         |
| Bù lại khi bị hạ    | ngay lượt đổ đầy kế tiếp, TRƯỚC quái thường                         |

**Vì sao Tinh Anh đi một mình** (`Room.groupAround`). Nó đã bằng hai con thường về
máu và gấp rưỡi về sát thương; kéo thêm hai con nữa vào là một trận không ai đi
lẻ thắng nổi. Mà con Tinh Anh đứng lẻ mới là thứ đáng dừng lại để đánh. Luật
chạy cả hai chiều: chạm vào quái thường thì con Tinh Anh đứng cạnh cũng không bị
lôi vào.

**Đích cân bằng đo bằng `tools/simulate.js`:** một người đủ trang bị ở cấp trần
vùng thắng **65–75%** và mất khoảng hai phần ba máu. Chỉ số gốc trong
`data/monsters.js` được vặn cho tới khi ra đúng dải này ở CẢ SÁU VÙNG — đừng so
mấy con số đó với nhau rồi kết luận con nào mạnh hơn.

#### Cơ chế riêng của từng Thủ Lĩnh

🔒 Không có phần này thì "Thủ Lĩnh" chỉ là con quái thường nhiều máu, và đánh con
thứ sáu y hệt đánh con thứ nhất. Ba loại cơ chế, mỗi con một cách ghép:

| Thủ Lĩnh           | Cơ chế                                 | Nội dung                                                                                         |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Sói Đầu Đàn     | Gọi Bầy                                | mỗi 2 vòng gọi 2 Sói Xám, trần 6 con                                                        |
| Nhện Mẫu           | Nở Trứng                               | mỗi 2 vòng gọi 2 Nhện Sương, trần 6 con                                                    |
| Tướng Xương      | Dựng Đội Hình                        | mỗi 3 vòng gọi 3 Bộ Hài Cốt, trần 6 con                                                    |
| Quỷ Băng           | Đóng Băng Vết Thương + Hoá Cuồng | hồi 6% máu mỗi vòng; dưới 45% máu thì sát thương ×2.2                                 |
| Sứ Giả Bão        | Mắt Bão                                | dưới**60%** máu thì sát thương ×1.8 — nổi giận sớm rồi giữ nguyên tới cuối |
| Chúa Tể Hư Không | Xé Khe Nứt + Cõi Trống Rỗng         | mỗi 4 vòng gọi 2 Mắt Hư Không (trần 4); dưới 30% máu ×1.5                              |

- **Tay sai theo cấp của chính con Thủ Lĩnh**, không phải cấp gốc bản mẫu — nếu
  không thì ở vùng cấp 60 nó gọi ra một bầy sói cấp 1 đứng làm cảnh
- **Gọi quân có TRẦN đếm theo tổng cả trận**, không phải số đang sống. Đếm số
  đang sống thì nhóm dọn sạch xong lại bị gọi tiếp, trận chạy tới vòng 50 rồi hoà
- **Hoá cuồng nổ đúng một lần** và không tắt được
- Cơ chế chạy **cuối vòng**, nên máu đem ra xét là máu sau khi cả nhóm đã ra tay,
  và sự kiện đi kèm luôn gói `battle:resolve` của vòng vừa xong

**Cơ chế mới là nguồn độ khó, không phải chỉ số gốc.** Trước khi có phần này,
nhóm 5 người hạ mọi Thủ Lĩnh với 100% tỉ lệ thắng và còn 71–92% máu. Sau: 91–100%
thắng, còn 46–83% máu, và nhóm 2 người thì không con nào hạ nổi. Chỉ số gốc của
sáu con không đổi một chữ số nào.

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

| Thông số                  | Giá trị                                       |
| --------------------------- | ----------------------------------------------- |
| Chu kỳ                     | 5 phút một con, mỗi vùng một con duy nhất |
| Tự bỏ đi                 | sau 3 phút nếu không ai hạ được          |
| Miễn va chạm khi hiện ra | 5 giây                                         |
| Trần người cùng đánh  | 10                                              |

**Trận Thủ Lĩnh KHÔNG cần nhóm.** Đây là điểm khác biệt duy nhất so với quái
thường (🔒 mục 5.2e):

- Con Thủ Lĩnh **ở lại bản đồ** trong lúc đang bị đánh — đó là cách người thứ
  hai, thứ ba nhìn thấy trận đang diễn ra để bước vào phụ
- Nó **đứng yên** khi đang giao chiến, không đi lôi người ngoài cuộc vào
- **Trốn thoát chỉ rút một mình người bấm**, không kéo theo những người xa lạ
  đang đánh cùng
- Hạ được thì nó biến mất và đồng hồ 5 phút đếm lại; thua hoặc trốn hết thì nó
  ở lại

💡 **Còn bỏ ngỏ:** lá chắn *"miễn nhiễm vật lý cho tới khi phá được"* — loại cơ
chế thứ tư, chưa làm vì nó đòi người chơi phải có sẵn đòn phép để đổi sang, mà
mới có hai class.

### 6.3 Sách kỹ năng

🔒 Rơi từ quái, tỉ lệ gốc 5%, điền vào cây Dị Điển.

💡 Bổ sung:

- Sách **theo class** — sách Pháp Sư thì Chiến Binh không đọc được (nhưng bán/trao đổi được)
- Sách có hạng; hạng cao rơi từ quái hạng cao
- Gắn vào ô đã có sách → **xóa vĩnh viễn** sách cũ (🔒 mục 3.4)

---

## 6b. Vùng bản đồ

🔒 **Một bến cảng an toàn + sáu vùng săn quái, mỗi vùng 10 cấp, phủ kín cấp 1
tới 60.** Người chơi chọn vùng ngay sau khi chọn nhân vật, trước khi vào game.

| #  | Vùng                               | Cấp      | Quái                                         | Thủ Lĩnh           |
| -- | ----------------------------------- | --------- | --------------------------------------------- | -------------------- |
| ☮ | **Bến Cảng Duskmoor**       | mọi cấp | *không có*                                | *không có*       |
| 1  | **Đồng Cỏ Thanh Bình**    | 1–10     | Sói Xám · Cướp Đường                  | Sói Đầu Đàn     |
| 2  | **Rừng Sương Mù**         | 11–20    | Nhện Sương · Sói Xám · Cướp Đường | Nhện Mẫu           |
| 3  | **Hoang Mạc Xương Trắng** | 21–30    | Bộ Hài Cốt · Xạ Thủ Xương             | Tướng Xương      |
| 4  | **Vực Băng Vĩnh Cửu**     | 31–40    | Oán Hồn Băng · Xạ Thủ Xương           | Quỷ Băng           |
| 5  | **Đỉnh Bão Tố**           | 41–50    | Tín Đồ Bão · Oán Hồn Băng             | Sứ Giả Bão        |
| 6  | **Đền Đài Hư Không**    | 51–60    | Chiến Binh Hư Không · Mắt Hư Không     | Chúa Tể Hư Không |

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

### 6b.0 Vùng an toàn

`safe: true` trong `server/data/zones.js` tắt bốn đường một lúc: đổ đầy quái,
hẹn giờ Thủ Lĩnh, dò va chạm, và đồng hồ Thủ Lĩnh gửi cho client. **Bỏ sót một
đường là người chơi bị kéo vào trận ngay giữa chợ**, nên cả bốn đều đọc chung
một cờ `room.safe` thay vì hỏi lại `zone.safe` ở từng chỗ.

Bản đồ thị trấn dựng bằng `buildTown` chứ không phải `buildWild`: một quảng
trường rộng, quanh rìa là xe hàng dựng thành cụm nhỏ. Ba luật giữ cho nó luôn
đi lại được mà **không cần chạy thuật toán kiểm tra liên thông**:

1. Cụm tối đa 2 ô — không cụm nào đủ dài để quây kín một góc.
2. Chừa 2 ô sát viền, nên lúc nào cũng có một vòng hành lang chạy quanh.
3. Chừa hẳn quảng trường 11×11 quanh thương nhân.

Vùng an toàn **không nằm trong `zones.defaultFor()`** — nó mở từ cấp 1, nên tính
vào đó thì ai không chọn bản đồ cũng bị thả vào thị trấn, nơi không có gì để đánh.

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

## 6c. Mua bán với thương nhân

🔒 **Ganne Vạn Hải** đứng giữa quảng trường Bến Cảng Duskmoor. Đứng cạnh rồi bấm
**E** để mở hai tab **Mua** và **Bán**.

Trước khi có ông ta, vàng chỉ có đường vào: đánh xong cộng thêm, không bao giờ
tiêu đi đâu được. Một con số chỉ tăng thì sau vài giờ chơi nó thôi mang ý nghĩa.

### 6c.1 Ba luật chi phối mọi con số

**1. Quầy hàng KHÔNG bán đồ hạng cao.** Chỉ Thường · Tinh Xảo · Hiếm. Mua được
đồ Sử Thi và Truyền Thuyết thì cả hệ thống rớt đồ mất ý nghĩa — đi săn Thủ Lĩnh
làm gì khi đứng ở chợ bấm nút là có?

**2. Bán rẻ hơn mua rất nhiều.** `BUY_MULT = 3.2` cộng phí hai đầu cho ra chênh
lệch 4–5 lần, đủ chặn cái vòng lặp mua đi bán lại để đẻ vàng từ không khí.

**3. Quầy hàng không quay lại được.** Hạt giống buộc vào **(nhân vật, khung 10
phút)**, nên thoát phòng rồi vào lại vẫn thấy đúng những món cũ. Không có ràng
buộc đó thì quầy biến thành máy quay xổ số: cứ ra vào tới lúc hiện ra món vừa ý,
và luật số 1 cũng chẳng chặn được gì vì quay đủ lâu là gom được cả bộ Hiếm.

### 6c.2 Giá

```
giá gốc = 9 × cấp × hệ_số_hạng        (Thường 1 · Tinh Xảo 1,7 · Hiếm 3,4 · Sử Thi 7 · Truyền Thuyết 15)
bán     = giá gốc × (1 − phí)
mua     = giá gốc × 3,2 × (1 + phí)
```

**Phí giao dịch 25%**, và Duskmoor trả đúng một nửa. Đây là chỗ
`tradeFeePercent` trong `data/nations.js` cuối cùng có tác dụng thật — trước đó
nó chỉ là một dòng mô tả trên màn tạo nhân vật, không nơi nào trong game đọc tới.

Giá hiện luôn trên từng dòng thay vì để client tự nhân: hai bản công thức ở hai
nơi là kiểu lệch nhau âm thầm mà **chỉ người chơi Duskmoor mới phát hiện ra**.

### 6c.2b Bán sách Dị Điển

🔒 Mười ô Dị Điển, mà sách thì rơi mãi. Sách trùng một kỹ năng **chưa gắn ô nào**
từng là rác tuyệt đối: gắn thì phí ô, tiêu nâng bậc thì không được, vứt cũng
không xong.

```
giá sách = 9 × cấp NGƯỜI BÁN × hệ_số_hạng     (quái thường 4 · Tinh Anh 8 · Thủ Lĩnh 16)
```

💡 Theo cấp người bán chứ không theo con quái đã rơi ra nó, vì hai lý do. Sách
cũ trong database không lưu cấp — tính theo nó là cả kho của người chơi cũ bỗng
đáng một đồng. Và một cuốn Dị Điển đáng bao nhiêu là tuỳ nó làm được gì cho anh
**bây giờ**, không phải tuỳ con quái đã chết từ ba chục cấp trước.

🔒 Hạng vẫn kể: sách Thủ Lĩnh đắt gấp **4 lần** sách quái thường — đúng tỉ lệ
hiếm 40% so với 5%.

🔒 **Chỉ bán được sách CHƯA gắn.** Sách trong ô là kỹ năng đang dùng, muốn bán
thì gỡ ra trước — và gỡ ra là xoá vĩnh viễn.

### 6c.3 Chống gian lận

**Mọi lệnh mua bán đều kiểm tra khoảng cách ở server** (`room.npcNear`), không
tin cái nút mà client vẽ ra — sửa vài dòng JS là gọi thẳng `shop:buy` từ giữa
Vực Băng, và ý nghĩa duy nhất của việc đi bộ về thị trấn biến mất.

**Bán không bao giờ đụng tới đồ đang mặc**, cùng lý do với `inventory.discardMany`:
tick chọn mười mấy ô rồi bấm bán, một cái tick lỡ tay mà lột luôn món trên người
thì không có đường cứu.

---

## 7. Thứ tự xây dựng

| GĐ         | Nội dung                                                                            | Trạng thái                                              |
| ----------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **0** | Khung mạng, phòng, di chuyển đồng bộ                                           | ✅**Xong** — đang chạy                           |
| **1** | Tài khoản, đăng nhập, lưu nhân vật vào MySQL                                | ✅**Xong** — cả giao diện lẫn lưu tiến trình |
| **2** | Tạo nhân vật: 12 Đặc Ân (bốc + 3 lần rút lại) · 4 quốc gia · 5 chỉ số | ✅**Xong** — tối đa 3 nhân vật/tài khoản     |
| **3** | **Chiến đấu turn-based PvE** — layout, vòng lượt, 4 loại quái         | ✅**Xong** — chạy trên production                |
| **5** | Trang bị 10 ô + rơi đồ + 5 hạng + bảng nhân vật                             | ✅**Xong** — chạy trên production                |
| **4** | Cây Nền 2 class + hệ mana/nộ + kỹ năng chủ động                             | ✅**Xong**                                          |
| **6** | Cây Dị Điển + sách kỹ năng                                                    | ✅**Xong** — 10 ô, sách có kỹ năng thật      |
| **7** | Quái Tinh Anh / Thủ Lĩnh + cơ chế riêng                                        |                                                           |
| **8** | Đổi class ở mốc level                                                            |                                                           |
| **9** | *PvP — hoãn, làm sau cùng*                                                     |                                                           |

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

| Mục                       | Ghi chú                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| 🔍 Xem chi tiết           | Cửa sổ đầy đủ: chỉ số, bị động, ô lắp                          |
| ⬆ Mặc vào / ↩ Tháo ra | Tuỳ món đang ở túi hay đang mặc                                      |
| 🗑 Vứt bỏ                | **Luôn hỏi lại.** Đồ hạng Hiếm trở lên cảnh báo mạnh hơn |

Nguyên tắc: mọi hành động không hoàn tác được đều phải qua hộp xác nhận. Mất một
món Truyền Thuyết vì lỡ tay là chuyện người chơi sẽ nhớ rất lâu.

---

## 8b. Nhật Ký — hệ nhiệm vụ

Lỗ hổng nó lấp: vào game là đứng giữa đồng cỏ, không mục tiêu, không ai giao
việc. Mọi thứ khác trong game đều là **cơ chế** — đánh, nhặt, cộng điểm — nhưng
không có gì trả lời câu "giờ tôi nên làm gì".

### 8b.1 Ba ràng buộc định hình toàn bộ thiết kế

🔒 **Không đi bộ giữa các vùng.** Đổi vùng là quay về màn chọn bản đồ, và
`Room.dropFromParty` sẽ đá người chơi khỏi nhóm (CLAUDE.md §5a). Nên **không có
nhiệm vụ nào bắt quay về Duskmoor để trả**: một việc như vậy trả giá bằng cả
nhóm 5 người vừa lập.

→ **Nhận và trả thưởng đều ngay trong bảng Nhật Ký, ở bất cứ đâu.** NPC Quản Sự
ở Duskmoor chỉ giới thiệu hệ thống, không giữ độc quyền gì.

🔒 **Server là nơi duy nhất đếm.** Client không bao giờ gửi "tôi vừa hạ 20 con
sói" — nó chỉ được phép gửi "tôi bấm nhận thưởng việc X". Cùng lý do với mọi thứ
khác trong game này.

🔒 **Chỉ đếm những thứ server ĐÃ quan sát được.** Không thêm một đường theo dõi
mới nào chỉ để phục vụ nhiệm vụ: mỗi loại mục tiêu phải khớp với một chỗ server
vốn đã biết. Năm loại, không hơn:

| Loại | Đếm gì | Server đã biết ở đâu |
|---|---|---|
| `kill` | hạ N con một bản mẫu cụ thể | `battle.finish` → danh sách `killed` |
| `tier` | hạ N con hạng Tinh Anh / Thủ Lĩnh | cùng chỗ, đọc `tier` |
| `level` | đạt cấp N | `progression.addExp` |
| `codex` | gắn đủ N ô Dị Điển | `p.codex` |
| `equip` | mặc đủ N ô trang bị | `p.inv.equipped` |

### 8b.2 Ba loại việc

| Loại | Số lượng | Làm lại được? | Vai trò |
|---|---|---|---|
| **Việc vùng** | 3 mỗi vùng săn (18) | không | dẫn đường xuyên suốt một vùng |
| **Việc hàng ngày** | 3, đổi mỗi ngày | mỗi ngày một lần | lý do quay lại hôm sau |
| **Cột mốc** | ~8 cho cả đời nhân vật | không | mục tiêu dài hạn |

### 8b.3 Bộ đếm cộng dồn, không phải sổ sách từng việc

🔒 Lưu **một bảng đếm cộng dồn cả đời nhân vật**, không lưu tiến độ riêng cho
từng nhiệm vụ:

```
counters: { 'kill:grey_wolf': 34, 'tier:elite': 3, 'tier:boss': 1 }
```

Một việc là "xong" khi bộ đếm chạm mốc. Không có bước "nhận việc", không có
trạng thái đang-làm nào phải đồng bộ — và thêm một nhiệm vụ mới vào
`data/quests.js` thì tiến độ cũ tự tính lại, không cần migrate gì.

💡 Việc hàng ngày không dùng được bộ đếm cộng dồn (nó sẽ xong ngay lập tức), nên
mỗi ngày chụp một **mốc nền**: `dailyBase`. Tiến độ = `counters − dailyBase`.
Ngày mới thì chụp lại. Cùng cơ chế cửa sổ thời gian với quầy hàng thương nhân
(§6c), và cùng lý do: hạt giống buộc vào (nhân vật, ngày) nên thoát ra vào lại
vẫn thấy đúng ba việc cũ, không biến thành máy quay xổ số.

### 8b.4 Thưởng

```
việc vùng      = 40 × cấp trần vùng  vàng  +  50% một cấp  kinh nghiệm
việc hàng ngày = 60 × cấp nhân vật   vàng  +  25% một cấp  kinh nghiệm
cột mốc        = vàng lớn, có mốc thưởng thẳng một cuốn Dị Điển
```

Đối chiếu để thấy nó có đáng: ở Đồng Cỏ một con quái cho 84 kinh nghiệm và 53
vàng, lên cấp cần 1.264. Việc vùng ở đó trả 400 vàng + 632 kinh nghiệm — bằng
khoảng 7 con quái, cho một việc đòi hạ 20 con. Đủ để đáng làm, không đủ để thay
thế việc đi đánh.

⚠️ Kinh nghiệm tính theo `expToNext` của cấp trần vùng, **không** theo cấp người
chơi: nếu không thì người cấp 60 quay về Đồng Cỏ làm lại ba việc vùng đó sẽ nhận
kinh nghiệm cấp 60 cho việc hạ hai chục con sói cấp 5.

---

## 8. Còn bỏ ngỏ

Không cản trở giai đoạn 1–3, quyết sau cũng được:

1. ❓ Đổi quốc gia có được không? (đề xuất: **không**)
2. ❓ Level tối đa và tốc độ lên cấp
3. ❓ Có giao dịch **giữa người chơi với nhau** không? (mua bán với NPC đã xong
   ở §6c — câu hỏi còn lại là đổi đồ trực tiếp hoặc chợ ký gửi)
4. ❓ Bản đồ: một thế giới chung hay chia khu vực theo level?
5. ✅ ~~Chết thì mất gì~~ — **kinh nghiệm, và chỉ kinh nghiệm.** Xem §5.2f.
