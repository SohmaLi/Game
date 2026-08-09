#!/usr/bin/env bash
# Áp schema lên database trên hosting. Chạy lại nhiều lần không sao (CREATE TABLE IF NOT EXISTS).
set -euo pipefail

HOST="frozento"
REMOTE="/home/frozento/game"

echo "==> Đẩy schema lên server"
scp -q db/schema.sql "$HOST:$REMOTE/db/schema.sql"

echo "==> Áp schema (đọc mật khẩu từ cấu hình cPanel, không in ra màn hình)"
ssh "$HOST" 'bash -lc "
python3 - <<PY
import json, subprocess, sys
cfg = json.load(open(\"/home/frozento/.cl.selector/node-selector.json\"))
def dig(o):
    if isinstance(o, dict):
        if \"DB_NAME\" in o and \"DB_PASS\" in o: return o
        for v in o.values():
            r = dig(v)
            if r: return r
    return None
e = dig(cfg)
g = lambda k: str(e[k][\"value\"]) if isinstance(e[k], dict) else str(e[k])
r = subprocess.run([\"mysql\",\"-h\",g(\"DB_HOST\"),\"-u\",g(\"DB_USER\"),\"-p\"+g(\"DB_PASS\"),g(\"DB_NAME\")],
                   stdin=open(\"/home/frozento/game/db/schema.sql\"),
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
print(\"OK — schema đã áp\" if r.returncode == 0 else \"THAT BAI:\")
if r.returncode: print(r.stderr[:600]); sys.exit(1)
PY
"'

echo "==> Danh sách bảng"
ssh "$HOST" 'bash -lc "
python3 - <<PY
import json, subprocess
cfg = json.load(open(\"/home/frozento/.cl.selector/node-selector.json\"))
def dig(o):
    if isinstance(o, dict):
        if \"DB_NAME\" in o and \"DB_PASS\" in o: return o
        for v in o.values():
            r = dig(v)
            if r: return r
    return None
e = dig(cfg)
g = lambda k: str(e[k][\"value\"]) if isinstance(e[k], dict) else str(e[k])
r = subprocess.run([\"mysql\",\"-h\",g(\"DB_HOST\"),\"-u\",g(\"DB_USER\"),\"-p\"+g(\"DB_PASS\"),g(\"DB_NAME\"),
                    \"-e\",\"SHOW TABLES; SELECT COUNT(*) AS accounts FROM accounts;\"],
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
print(r.stdout or r.stderr[:400])
PY
"'
