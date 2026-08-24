#!/bin/bash
# ============================================================
# 공구모아 배포 스크립트 — gonggu.asknuggetdata.com
# ============================================================
#
# [최초 배포 절차 — EC2에서 한 번만 실행]
#
# 1. EC2 접속
#    ssh -i your-key.pem ubuntu@<EC2_IP>
#
# 2. Node.js / PM2 / Python 설치 (없으면)
#    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
#    sudo apt-get install -y nodejs python3 python3-venv python3-pip
#    sudo npm install -g pm2
#
# 3. 저장소 클론
#    git clone https://github.com/yujin-813/gonggu.git ~/gonggu
#    cd ~/gonggu
#
# 4. 환경 변수 파일 생성 (절대 git에 올리지 말 것)
#    cat > .env.local << 'EOF'
#    ADMIN_PASSWORD=여기에_비밀번호
#    INSTAGRAM_USERNAME=인스타_아이디
#    INSTAGRAM_PASSWORD=인스타_비밀번호
#    EOF
#
# 5. 빌드 & 시작
#    npm ci
#    npm run build
#    mkdir -p public/uploads
#    pm2 start ecosystem.config.js
#    pm2 save
#    pm2 startup   # 부팅 시 자동 시작 명령어 출력 → 복사 후 실행
#
# 6. Nginx 설정
#    sudo cp nginx.conf.example /etc/nginx/sites-available/gonggu
#    sudo ln -s /etc/nginx/sites-available/gonggu /etc/nginx/sites-enabled/gonggu
#    sudo nginx -t && sudo systemctl reload nginx
#
# 7. SSL 인증서 (Let's Encrypt)
#    sudo apt install -y certbot python3-certbot-nginx
#    sudo certbot --nginx -d gonggu.asknuggetdata.com
#
# [이후 배포는 이 스크립트 실행]
#    bash deploy.sh
# ============================================================

set -e

# ============================================================
# 무중단 교체(blue/green)
#
# 예전에는 빌드를 다른 데서 한 뒤 .next를 바꿔치고 `pm2 reload`를 했다. fork 모드 단일
# 인스턴스라 reload가 사실상 재시작이고, 그 1~2초 동안 nginx가 502를 냈다(로그에 42건).
# 하루 방문 80명이면 확률은 낮지만 0은 아니다.
#
# 이제 슬롯을 두 개 두고 번갈아 쓴다.
#   .next-a ↔ 3002 · .next-b ↔ 3003
# 새 슬롯에 빌드해서 새 포트로 띄우고, **살아난 걸 확인한 뒤에** nginx가 보는 포트를 바꾼다.
# nginx reload는 graceful이라 진행 중인 요청도 안 끊긴다. 옛 인스턴스는 그다음에 내린다.
#
# 실패하면 nginx를 아예 안 건드리고 새 인스턴스만 지운다 — 사용자는 아무것도 못 느낀다.
# 예전 방식은 이미 교체한 뒤에 되돌렸으니 이쪽이 더 안전하다.
#
# 메모리: 인스턴스 하나가 169MB, 가용 820MB. 두 개가 겹치는 건 전환 순간뿐이고 그때는
# 빌드가 이미 끝나 있다 — 상시 2개를 띄우는 cluster 모드를 안 쓰는 이유가 그것이다.
#
# ⚠️ 겹치는 몇 초 동안 두 인스턴스가 같은 data/*.json을 쓸 수 있다. savePosts()에 락이
#    없으므로(기술부채 #2) 그 순간의 관리자 저장 한 번이 유실될 수 있다. 수집 cron(09:00,
#    14:00)과 겹치지 않게 배포하는 것이 안전하다.
# ============================================================

NGINX_CONF=/etc/nginx/sites-enabled/gonggu
HEALTH_TRIES=25

cur_port() { sudo grep -oP 'proxy_pass\s+http://localhost:\K[0-9]+' "$NGINX_CONF" | head -1; }
slot_of()  { [ "$1" = "3002" ] && echo ".next-a" || echo ".next-b"; }

CUR_PORT=$(cur_port)
if [ -z "$CUR_PORT" ]; then echo "❌ nginx에서 현재 포트를 못 읽었습니다"; exit 1; fi
if [ "$CUR_PORT" = "3002" ]; then NEW_PORT=3003; else NEW_PORT=3002; fi
NEW_SLOT=$(slot_of "$NEW_PORT")
NEW_NAME="gonggu-$NEW_PORT"

echo "▶ 현재 $CUR_PORT → 새 인스턴스 $NEW_PORT ($NEW_SLOT)"

# 무엇이 바뀌었는지 비교하려면 당겨오기 전 커밋을 기억해 둬야 한다
PREV_REV=$(git rev-parse HEAD 2>/dev/null || echo "")

echo "▶ 코드 업데이트..."
git pull origin main

# npm ci는 node_modules를 통째로 지웠다 다시 깐다. 돌아가는 서버가 그 밑에서 모듈을
# 읽다 죽으므로, 잠금 파일이 실제로 바뀌었을 때만 돈다.
echo "▶ 의존성 확인..."
if [ -n "$PREV_REV" ] && git diff --quiet "$PREV_REV" HEAD -- package-lock.json package.json; then
  echo "  · 변경 없음 — 설치 건너뜀"
else
  npm ci --production=false
fi

echo "▶ 파이썬 스크래퍼 환경 구성..."
if [ ! -d venv ]; then python3 -m venv venv; fi
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt

echo "▶ 데이터/이미지 디렉토리 확인..."
mkdir -p public/uploads public/scraped data

# 빌드는 지금 돌아가는 슬롯을 건드리지 않는다. 이 동안 사이트는 멀쩡히 서비스된다.
echo "▶ 빌드 ($NEW_SLOT)..."
rm -rf "$NEW_SLOT"
NEXT_DIST_DIR="$NEW_SLOT" npm run build

echo "▶ 새 인스턴스 기동 ($NEW_NAME, 포트 $NEW_PORT)..."
pm2 delete "$NEW_NAME" >/dev/null 2>&1 || true
NEXT_DIST_DIR="$NEW_SLOT" pm2 start node_modules/.bin/next \
  --name "$NEW_NAME" --max-memory-restart 500M -- start -p "$NEW_PORT"

echo "▶ 새 인스턴스 기동 확인..."
set +e
OK=0
for i in $(seq 1 $HEALTH_TRIES); do
  if curl -fsS -o /dev/null "http://localhost:$NEW_PORT/"; then OK=1; echo "  ✓ 응답 (${i}회 시도)"; break; fi
  sleep 1
done
if [ "$OK" != "1" ]; then
  echo "❌ 새 인스턴스가 응답하지 않습니다 — nginx는 그대로 두고 새 인스턴스만 내립니다"
  pm2 delete "$NEW_NAME" >/dev/null 2>&1
  rm -rf "$NEW_SLOT"
  echo "  ↩ 사용자 영향 없음 (계속 $CUR_PORT 로 서비스 중)"
  exit 1
fi

echo "▶ nginx 전환 ($CUR_PORT → $NEW_PORT)..."
sudo cp "$NGINX_CONF" "/tmp/gonggu-nginx.bak"
sudo sed -i "s|proxy_pass         http://localhost:$CUR_PORT;|proxy_pass         http://localhost:$NEW_PORT;|" "$NGINX_CONF"
if ! sudo nginx -t >/dev/null 2>&1; then
  echo "❌ nginx 설정이 깨졌습니다 — 되돌립니다"
  sudo cp "/tmp/gonggu-nginx.bak" "$NGINX_CONF"
  pm2 delete "$NEW_NAME" >/dev/null 2>&1
  exit 1
fi
sudo systemctl reload nginx

# 전환이 실제로 먹었는지 nginx를 통해 확인한다
sleep 1
if ! curl -fsS -o /dev/null -H "Host: gonggu.asknuggetdata.com" http://localhost/; then
  echo "❌ nginx 경유 응답 실패 — 포트를 되돌립니다"
  sudo cp "/tmp/gonggu-nginx.bak" "$NGINX_CONF"
  sudo systemctl reload nginx
  pm2 delete "$NEW_NAME" >/dev/null 2>&1
  exit 1
fi
set -e

echo "▶ 옛 인스턴스 정리..."
# 예전 이름(gonggu)으로 돌던 것도 함께 내린다 — 첫 무중단 배포에서 한 번만 해당된다
pm2 delete "gonggu-$CUR_PORT" >/dev/null 2>&1 || true
pm2 delete "gonggu" >/dev/null 2>&1 || true
pm2 save >/dev/null 2>&1 || true
rm -rf "$(slot_of "$CUR_PORT")" .next-build .next-old

echo "✅ 무중단 배포 완료 (포트 $NEW_PORT) → https://gonggu.asknuggetdata.com"
