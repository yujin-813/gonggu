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

# 빌드는 예전 .next를 그대로 둔 채 딴 데서 한다. 이 동안 사이트는 멀쩡히 서비스된다.
echo "▶ 빌드 (별도 디렉터리)..."
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build

# 다 만들어진 뒤에야 바꿔치기 — mv라서 순식간이고, 실패하면 .next-old로 되돌릴 수 있다
echo "▶ 새 빌드로 교체..."
rm -rf .next-old
if [ -d .next ]; then mv .next .next-old; fi
mv .next-build .next

echo "▶ 파이썬 스크래퍼 환경 구성..."
if [ ! -d venv ]; then
  python3 -m venv venv
fi
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt
echo "  ✓ instaloader 등 파이썬 의존성 설치 완료"

echo "▶ 데이터/이미지 디렉토리 확인..."
# scraped 디렉토리는 빌드·시작 전에 존재해야 Next가 정적 경로로 등록한다
mkdir -p public/uploads public/scraped data

echo "▶ PM2 재시작..."
pm2 reload gonggu || pm2 start ecosystem.config.js

# 되살아났는지 확인하고, 안 되면 직전 빌드로 되돌린다
echo "▶ 기동 확인..."
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null http://localhost:3002/; then
    echo "  ✓ 정상 응답 (${i}회 시도)"
    rm -rf .next-old
    echo "✅ 배포 완료 → https://gonggu.asknuggetdata.com"
    exit 0
  fi
  sleep 1
done

echo "❌ 새 빌드가 응답하지 않습니다 — 직전 빌드로 되돌립니다"
if [ -d .next-old ]; then
  rm -rf .next
  mv .next-old .next
  pm2 reload gonggu
  echo "  ↩ 롤백 완료"
fi
exit 1
