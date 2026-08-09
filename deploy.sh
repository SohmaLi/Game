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
ssh "$HOST" "cloudlinux-selector restart --json --interpreter nodejs --app-root game >/dev/null 2>&1; \
             mkdir -p $REMOTE/tmp && touch $REMOTE/tmp/restart.txt; \
             pkill -u frozento -f 'nodevenv/game/20/bin/node' >/dev/null 2>&1; \
             echo 'đã khởi động lại'"

echo "==> Kiểm tra"
sleep 4
curl -sS --max-time 20 https://game.frozen-top.io.vn/health && echo
echo "==> Xong: https://game.frozen-top.io.vn"
