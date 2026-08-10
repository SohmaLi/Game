-- Frozen — schema cơ sở dữ liệu
-- Chạy: ./tools/migrate.sh   (idempotent, chạy lại nhiều lần không sao)
--
-- Quy ước:
--   utf8mb4  — bắt buộc, để tên nhân vật tiếng Việt có dấu và emoji không vỡ
--   InnoDB   — cần khóa ngoại và giao dịch

-- ---------------------------------------------------------------- tài khoản

CREATE TABLE IF NOT EXISTS accounts (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username       VARCHAR(32)  NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  TIMESTAMP    NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- nhân vật

CREATE TABLE IF NOT EXISTS characters (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id    INT UNSIGNED NOT NULL,
  name          VARCHAR(16)  NOT NULL,

  -- Gốc gác: chọn một lần, không đổi
  nation        VARCHAR(16)  NOT NULL,

  -- Đặc Ân: bốc ngẫu nhiên, rút lại tối đa 3 lần rồi khóa vĩnh viễn
  boon_id       TINYINT UNSIGNED NOT NULL,
  boon_rerolls  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  boon_locked   TINYINT(1)   NOT NULL DEFAULT 0,

  -- Class: NULL nghĩa là chưa chọn. Đổi được ở mốc level 10/25/50.
  class         VARCHAR(16)  NULL DEFAULT NULL,

  level         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  exp           INT UNSIGNED NOT NULL DEFAULT 0,
  gold          INT UNSIGNED NOT NULL DEFAULT 0,

  -- Năm chỉ số gốc (chưa tính trang bị và đặc ân)
  stat_str      SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  stat_int      SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  stat_vit      SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  stat_agi      SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  stat_wil      SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  stat_points   SMALLINT UNSIGNED NOT NULL DEFAULT 0,

  -- Trạng thái hiện tại
  hp            INT UNSIGNED NOT NULL DEFAULT 100,
  mana          INT UNSIGNED NOT NULL DEFAULT 50,

  -- Vị trí lần cuối trong thế giới, để đăng nhập lại đúng chỗ
  pos_x         FLOAT NOT NULL DEFAULT 48,
  pos_y         FLOAT NOT NULL DEFAULT 48,

  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_characters_name (name),
  KEY ix_characters_account (account_id),
  CONSTRAINT fk_characters_account
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- phiên đăng nhập
-- Dùng để thu hồi token khi đổi mật khẩu hoặc phát hiện tài khoản bị chiếm.
-- Không có bảng này thì JWT đã phát ra là không cách nào hủy trước hạn.

CREATE TABLE IF NOT EXISTS sessions (
  id          CHAR(36)     NOT NULL,
  account_id  INT UNSIGNED NOT NULL,
  issued_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP    NOT NULL,
  revoked     TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_sessions_account (account_id),
  KEY ix_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_account
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- lưu tiến trình
-- Thêm sau, dùng ADD COLUMN IF NOT EXISTS (MariaDB 10.2+) nên chạy lại an toàn.
--
-- Dùng JSON cho những thứ có cấu trúc thay đổi liên tục trong lúc phát triển
-- (túi đồ, cây kỹ năng). Tách thành bảng riêng thì mỗi lần đổi thiết kế lại
-- phải migrate, mà giai đoạn này thiết kế còn đổi nhiều. Khi nào ổn định và
-- cần truy vấn theo món đồ thì tách sau.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS learned    JSON NULL COMMENT 'nút Cây Nền đã mở',
  ADD COLUMN IF NOT EXISTS carried    JSON NULL COMMENT 'kỹ năng mang vào trận',
  ADD COLUMN IF NOT EXISTS codex      JSON NULL COMMENT '10 ô Dị Điển',
  ADD COLUMN IF NOT EXISTS books      JSON NULL COMMENT 'sách chưa gắn',
  ADD COLUMN IF NOT EXISTS equipped   JSON NULL COMMENT '10 ô trang bị',
  ADD COLUMN IF NOT EXISTS bag        JSON NULL COMMENT 'túi đồ',
  ADD COLUMN IF NOT EXISTS played_at  TIMESTAMP NULL DEFAULT NULL COMMENT 'lần chơi gần nhất';
