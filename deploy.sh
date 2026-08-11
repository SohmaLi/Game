#!/usr/bin/env bash
#
# Đẩy code lên hosting và khởi động lại app.
#   ./deploy.sh
#
# Nguyên tắc: KHÔNG bao giờ sửa file trực tiếp trên server. Nguồn sự thật là
# thư mục này; server chỉ là bản sao. Muốn đổi gì thì sửa ở đây rồi chạy lại.

set -euo pipefail

HOST="frozento"
REMOTE="/home/frozento/game"
NODEENV="/home/frozento/nodevenv/game/20/bin/activate"

echo "==> Đồng bộ file lên $HOST:$REMOTE"
rsync -az --delete \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude 'tmp/' \
  --exclude '.well-known/' \
  --exclude '.DS_Store' \
  --exclude 'SETUP.md' \
  ./ "$HOST:$REMOTE/"

echo "==> Cài dependencies (chỉ production)"
ssh "$HOST" "source $NODEENV && cd $REMOTE && npm install --omit=dev --no-audit --no-fund"

echo "==> Khởi động lại app"
# Ba mức, dùng cả ba vì mức nhẹ hơn không phải lúc nào cũng ăn:
#   1. cloudlinux-selector — cách chính thức
#   2. touch tmp/restart.txt — quy ước Passenger, nạp lại ở request kế tiếp
#   3. kill tiến trình — cần thiết khi còn WebSocket đang mở: Passenger để tiến
#      trình cũ sống tiếp cho tới khi kết nối cuối cùng đóng, nên người chơi
#      đang online sẽ giữ nguyên code cũ vô thời hạn. Passenger tự spawn lại.
#      Passenger đặt tên tiến trình là `lsnode:/home/frozento/game/`, KHÔNG phải
#      đường dẫn tới node. Trước đây pkill tìm 'nodevenv/game/20/bin/node' nên
#      không khớp gì cả — deploy báo thành công mà người đang online vẫn chạy
#      code cũ hàng chục tiếng.
ssh "$HOST" "cloudlinux-selector restart --json --interpreter nodejs --app-root game >/dev/null 2>&1; \
             mkdir -p $REMOTE/tmp && touch $REMOTE/tmp/restart.txt; \
             pkill -u frozento -f 'lsnode:$REMOTE' >/dev/null 2>&1; \
             pkill -u frozento -f 'nodevenv/game/20/bin/node' >/dev/null 2>&1; \
             echo 'đã khởi động lại'"

echo "==> Kiểm tra"
sleep 6
# Gọi một lần cho Passenger spawn lại tiến trình, rồi mới đọc uptime
curl -sS --max-time 20 -o /dev/null https://game.frozen-top.io.vn/health || true
sleep 2
HEALTH=$(curl -sS --max-time 20 https://game.frozen-top.io.vn/health)
echo "$HEALTH"

# Chốt chặn: uptime còn cao nghĩa là tiến trình cũ chưa chết, tức là code mới
# CHƯA chạy dù mọi bước trên đều báo thành công
UP=$(echo "$HEALTH" | sed -n 's/.*"uptimeSec":\([0-9]*\).*/\1/p')
if [ -n "$UP" ] && [ "$UP" -gt 300 ]; then
  echo "!! CẢNH BÁO: uptime ${UP}s — tiến trình CŨ vẫn sống, code mới chưa chạy."
  exit 1
fi

echo "==> Xong: https://game.frozen-top.io.vn"
